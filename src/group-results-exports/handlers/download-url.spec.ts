import { Response } from 'lambda-api';
import { DecodingError, ServerError } from '../../utils/errors';
import { RequestWithIdentityToken } from '../../auth/identity-token-middleware';

const mockHead = jest.fn();
const mockPresignGet = jest.fn();

jest.mock('../../lib/exports-s3', () => ({
  buildExportObjectKey: jest.requireActual('../../lib/exports-s3').buildExportObjectKey,
  contentDispositionAttachment: jest.requireActual('../../lib/exports-s3').contentDispositionAttachment,
  headExportObject: (...args: unknown[]) => mockHead(...args),
  presignExportGetUrl: (...args: unknown[]) => mockPresignGet(...args),
}));

import { getDownloadUrl } from './download-url';

type DownloadUrlHandler = (
  req: RequestWithIdentityToken,
  resp: Response,
) => Promise<{ url: string, expires_in: number } | { error: string }>;

const handle = getDownloadUrl as unknown as DownloadUrlHandler;

function makeReq(exportId: string, userId = '123'): RequestWithIdentityToken {
  return {
    params: { exportId },
    identityToken: { userId, exp: Math.floor(Date.now() / 1000) + 3600 },
    headers: {},
  } as unknown as RequestWithIdentityToken;
}

function makeResp(): Response & { statusCode?: number } {
  const resp = {
    statusCode: undefined as number | undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
  };
  return resp as unknown as Response & { statusCode?: number };
}

describe('getDownloadUrl', () => {
  const originalEnv = process.env;
  const exportId = '8d3f0b7e-1234-4abc-9def-1234567890ab';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      EXPORTS_BUCKET: 'test-bucket',
      EXPORTS_PREFIX: 'temp-files/signed-url-access/group-results-exports/test',
    };
    mockPresignGet.mockResolvedValue('https://s3.example/get');
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return a presigned GET url when the object exists', async () => {
    mockHead.mockResolvedValue({
      contentDisposition: 'attachment; filename="groups_progress_with_answers_for_group-456-and_child_items_of-210.zip"',
    });
    const result = await handle(makeReq(exportId), makeResp());

    expect(result).toEqual({ url: 'https://s3.example/get', expires_in: 300 });
    expect(mockHead).toHaveBeenCalledWith(
      `temp-files/signed-url-access/group-results-exports/test/123/${exportId}.zip`,
    );
    expect(mockPresignGet).toHaveBeenCalledWith(
      expect.stringContaining(exportId),
      'attachment; filename="groups_progress_with_answers_for_group-456-and_child_items_of-210.zip"',
      300,
    );
  });

  it('should fall back to group-results-<exportId>.zip when metadata has no filename', async () => {
    mockHead.mockResolvedValue({});
    await handle(makeReq(exportId), makeResp());
    expect(mockPresignGet).toHaveBeenCalledWith(
      expect.any(String),
      `attachment; filename="group-results-${exportId}.zip"`,
      300,
    );
  });

  it('should return 404 not_found when the object is missing', async () => {
    mockHead.mockResolvedValue(null);
    const resp = makeResp();
    const result = await handle(makeReq(exportId), resp);
    expect(resp.statusCode).toBe(404);
    expect(result).toEqual({ error: 'not_found' });
    expect(mockPresignGet).not.toHaveBeenCalled();
  });

  it('should throw DecodingError for invalid export_id', async () => {
    await expect(
      handle(makeReq('not-a-uuid'), makeResp()),
    ).rejects.toThrow(DecodingError);
  });

  it('should wrap HeadObject failures in ServerError', async () => {
    mockHead.mockRejectedValue(new Error('S3 unavailable'));
    await expect(handle(makeReq(exportId), makeResp())).rejects.toThrow(ServerError);
  });
});
