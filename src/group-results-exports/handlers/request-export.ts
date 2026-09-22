import { HandlerFunction, Response } from 'lambda-api';
import { randomUUID } from 'crypto';
import { z, ZodError } from 'zod';
import { RequestWithGroupResultsToken } from '../token';
import { DecodingError, Forbidden, ServerError } from '../../utils/errors';
import { publishEvent } from '../../lib/eventbridge';
import {
  buildExportObjectKey,
  buildExportZipFilename,
  contentDispositionAttachment,
  presignExportPutUrl,
} from '../../lib/exports-s3';
import { EXPORT_AVAILABILITY_MS } from '../constants';

const UPLOAD_URL_EXPIRES_SEC = 3600;

const requestBodySchema = z.object({
  group_id: z.string().min(1),
  parent_item_ids: z.array(z.string()),
});

/** Set equality of item id lists (order-independent; duplicates do not expand the set). */
function sameItemIds(a: string[], b: string[]): boolean {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size !== setB.size) return false;
  for (const id of setA) {
    if (!setB.has(id)) return false;
  }
  return true;
}

async function post(
  req: RequestWithGroupResultsToken,
  resp: Response,
): Promise<{ export_id: string, expires_at: number }> {
  let body: z.infer<typeof requestBodySchema>;
  try {
    body = requestBodySchema.parse(req.body);
  } catch (err) {
    if (err instanceof ZodError) {
      throw new DecodingError(`Invalid request body: ${JSON.stringify(err.issues)}`);
    }
    throw err;
  }

  const { groupResultsToken: token } = req;
  if (body.group_id !== token.groupId || !sameItemIds(body.parent_item_ids, token.itemIds)) {
    throw new Forbidden('request body does not match group results token claims');
  }

  const exportId = randomUUID();
  const key = buildExportObjectKey(token.userId, exportId);
  const filename = buildExportZipFilename(token.groupId, token.itemIds);
  const contentDisposition = contentDispositionAttachment(filename);

  let uploadUrl: string;
  try {
    uploadUrl = await presignExportPutUrl(key, contentDisposition, UPLOAD_URL_EXPIRES_SEC);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to presign export PUT URL:', err);
    throw new ServerError('Failed to prepare export upload');
  }

  const now = Date.now();
  const uploadExpiresAt = now + UPLOAD_URL_EXPIRES_SEC * 1000;
  // lambda-api attaches the Lambda Context as req.context when present
  const requestId = req.context?.awsRequestId ?? randomUUID();

  try {
    await publishEvent('group_results_export_requested', {
      export_id: exportId,
      token: token.raw,
      upload_url: uploadUrl,
      upload_expires_at: uploadExpiresAt,
    }, requestId);
  } catch (err) {
    if (err instanceof ServerError) throw err;
    // eslint-disable-next-line no-console
    console.error('Failed to publish group_results_export_requested:', err);
    throw new ServerError('Failed to request export');
  }

  resp.status(202);
  return {
    export_id: exportId,
    expires_at: now + EXPORT_AVAILABILITY_MS,
  };
}

export const requestExport = post as unknown as HandlerFunction;
