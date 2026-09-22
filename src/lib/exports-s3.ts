/* eslint-disable @typescript-eslint/naming-convention */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ServerError } from '../utils/errors';

let client: S3Client | undefined;

function getBucket(): string {
  const bucket = process.env.EXPORTS_BUCKET;
  if (!bucket) {
    throw new ServerError('EXPORTS_BUCKET is not configured');
  }
  return bucket;
}

function getPrefix(): string {
  const prefix = process.env.EXPORTS_PREFIX;
  if (!prefix) {
    throw new ServerError('EXPORTS_PREFIX is not configured');
  }
  // Normalize trailing slash so key joins are stable
  return prefix.replace(/\/$/, '');
}

function getClient(): S3Client {
  if (!client) {
    const region = process.env.EXPORTS_REGION || process.env.AWS_REGION;
    // WHEN_REQUIRED: avoid signing x-amz-checksum-* that the worker's plain HTTP PUT cannot send
    client = new S3Client({
      ...(region ? { region } : {}),
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });
  }
  return client;
}

/** Reset cached client (for tests). */
export function resetExportsS3Client(): void {
  client = undefined;
}

/**
 * S3 key: `<EXPORTS_PREFIX>/<user_id>/<export_id>.zip`
 * EXPORTS_PREFIX already includes stage (e.g. temp-files/…/group-results-exports/dev).
 */
export function buildExportObjectKey(userId: string, exportId: string): string {
  return `${getPrefix()}/${userId}/${exportId}.zip`;
}

/**
 * Filename must match the backend ZIP generator so the worker's PUT
 * Content-Disposition equals the signed header.
 */
export function buildExportZipFilename(groupId: string, itemIds: string[]): string {
  return `groups_progress_with_answers_for_group-${groupId}-and_child_items_of-${itemIds.join('-')}.zip`;
}

export function contentDispositionAttachment(filename: string): string {
  return `attachment; filename="${filename}"`;
}

export async function presignExportPutUrl(
  key: string,
  contentDisposition: string,
  expiresIn = 3600,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: 'application/zip',
    ContentDisposition: contentDisposition,
  });
  return getSignedUrl(getClient(), command, { expiresIn });
}

export interface ExportObjectHead {
  contentDisposition?: string,
}

export async function headExportObject(key: string): Promise<ExportObjectHead | null> {
  try {
    const result = await getClient().send(new HeadObjectCommand({
      Bucket: getBucket(),
      Key: key,
    }));
    return { contentDisposition: result.ContentDisposition };
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (name === 'NotFound' || name === 'NoSuchKey' || status === 404) {
      return null;
    }
    throw err;
  }
}

export async function presignExportGetUrl(
  key: string,
  responseContentDisposition: string,
  expiresIn = 300,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ResponseContentDisposition: responseContentDisposition,
  });
  return getSignedUrl(getClient(), command, { expiresIn });
}
