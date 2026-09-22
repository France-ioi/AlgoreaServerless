import {
  buildExportObjectKey,
  contentDispositionAttachment,
  presignExportPutUrl,
  resetExportsS3Client,
} from './exports-s3';

describe('exports-s3', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    resetExportsS3Client();
    process.env = {
      ...originalEnv,
      EXPORTS_BUCKET: 'test-bucket',
      EXPORTS_PREFIX: 'temp-files/signed-url-access/group-results-exports/test',
      AWS_REGION: 'eu-west-3',
      // Local credentials so the SDK can sign without calling AWS
      AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
      AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    resetExportsS3Client();
  });

  it('buildExportObjectKey joins prefix, user, and export id', () => {
    expect(buildExportObjectKey('123', '8d3f0b7e-1234-4abc-9def-1234567890ab'))
      .toBe(
        'temp-files/signed-url-access/group-results-exports/test/123/8d3f0b7e-1234-4abc-9def-1234567890ab.zip',
      );
  });

  it('presigned PUT URL does not require checksum headers', async () => {
    const url = await presignExportPutUrl(
      'temp-files/signed-url-access/group-results-exports/test/123/export.zip',
      contentDispositionAttachment('export.zip'),
      3600,
    );

    expect(url).not.toMatch(/x-amz-checksum/i);
    expect(url).not.toMatch(/x-amz-sdk-checksum-algorithm/i);
    const signedHeaders = decodeURIComponent(
      (url.match(/X-Amz-SignedHeaders=([^&]+)/i) ?? [])[1] ?? '',
    );
    expect(signedHeaders).not.toMatch(/checksum/i);
  });
});
