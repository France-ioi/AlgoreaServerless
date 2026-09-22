import { HandlerFunction, Response } from 'lambda-api';
import { RequestWithIdentityToken } from '../../auth/identity-token-middleware';
import { DecodingError, ServerError } from '../../utils/errors';
import {
  buildExportObjectKey,
  contentDispositionAttachment,
  headExportObject,
  presignExportGetUrl,
} from '../../lib/exports-s3';

const EXPORT_ID_PATTERN = /^[0-9a-f-]{36}$/;
const DOWNLOAD_URL_EXPIRES_SEC = 300;

/**
 * Extract filename from a Content-Disposition header value, or undefined if absent.
 * Expects `attachment; filename="…"`.
 */
function filenameFromContentDisposition(header?: string): string | undefined {
  if (!header) return undefined;
  const match = /filename="([^"]+)"/.exec(header);
  return match?.[1];
}

async function get(
  req: RequestWithIdentityToken,
  resp: Response,
): Promise<{ url: string, expires_in: number } | { error: string }> {
  const exportId = req.params.exportId;
  if (!exportId || !EXPORT_ID_PATTERN.test(exportId)) {
    throw new DecodingError('Invalid export_id: expected a UUID');
  }

  const { userId } = req.identityToken;
  const key = buildExportObjectKey(userId, exportId);

  let head;
  try {
    head = await headExportObject(key);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to HeadObject export:', err);
    throw new ServerError('Failed to check export object');
  }

  if (!head) {
    resp.status(404);
    return { error: 'not_found' };
  }

  const filename = filenameFromContentDisposition(head.contentDisposition)
    ?? `group-results-${exportId}.zip`;
  const responseContentDisposition = contentDispositionAttachment(filename);

  let url: string;
  try {
    url = await presignExportGetUrl(key, responseContentDisposition, DOWNLOAD_URL_EXPIRES_SEC);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to presign export GET URL:', err);
    throw new ServerError('Failed to prepare export download');
  }

  return { url, expires_in: DOWNLOAD_URL_EXPIRES_SEC };
}

export const getDownloadUrl = get as unknown as HandlerFunction;
