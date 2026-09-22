import { Response } from 'lambda-api';
import { DecodingError, Forbidden, ServerError } from '../../utils/errors';
import { RequestWithGroupResultsToken } from '../token';

const mockPresignPut = jest.fn();
const mockPublishEvent = jest.fn();

jest.mock('../../lib/exports-s3', () => ({
  buildExportObjectKey: jest.requireActual('../../lib/exports-s3').buildExportObjectKey,
  buildExportZipFilename: jest.requireActual('../../lib/exports-s3').buildExportZipFilename,
  contentDispositionAttachment: jest.requireActual('../../lib/exports-s3').contentDispositionAttachment,
  presignExportPutUrl: (...args: unknown[]) => mockPresignPut(...args),
}));

jest.mock('../../lib/eventbridge', () => ({
  publishEvent: (...args: unknown[]) => mockPublishEvent(...args),
}));

import { requestExport } from './request-export';

type RequestExportHandler = (
  req: RequestWithGroupResultsToken,
  resp: Response,
) => Promise<{ export_id: string, expires_at: number }>;

const handle = requestExport as unknown as RequestExportHandler;

function makeReq(overrides?: {
  body?: unknown,
  token?: Partial<RequestWithGroupResultsToken['groupResultsToken']>,
}): RequestWithGroupResultsToken {
  return {
    body: overrides?.body ?? { group_id: '456', parent_item_ids: [ '210', '220' ] },
    groupResultsToken: {
      userId: '123',
      groupId: '456',
      itemIds: [ '210', '220' ],
      raw: 'group-results-jwt',
      ...overrides?.token,
    },
    headers: {},
    params: {},
    context: { awsRequestId: 'req-1' },
  } as unknown as RequestWithGroupResultsToken;
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

describe('requestExport', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      EXPORTS_BUCKET: 'test-bucket',
      EXPORTS_PREFIX: 'temp-files/signed-url-access/group-results-exports/test',
      EVENT_BUS_NAME: 'algorea',
      STAGE: 'test',
    };
    mockPresignPut.mockResolvedValue('https://s3.example/put');
    mockPublishEvent.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return 202 with export_id and expires_at', async () => {
    const resp = makeResp();
    const result = await handle(makeReq(), resp);

    expect(resp.statusCode).toBe(202);
    expect(result.export_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.expires_at).toBeGreaterThan(Date.now());
    expect(mockPresignPut).toHaveBeenCalledWith(
      expect.stringMatching(
        /^temp-files\/signed-url-access\/group-results-exports\/test\/123\/[0-9a-f-]{36}\.zip$/,
      ),
      expect.stringContaining('attachment; filename='),
      3600,
    );
    expect(mockPublishEvent).toHaveBeenCalledWith(
      'group_results_export_requested',
      expect.objectContaining({
        export_id: result.export_id,
        token: 'group-results-jwt',
        upload_url: 'https://s3.example/put',
        upload_expires_at: expect.any(Number),
      }),
      'req-1',
    );
  });

  it('should throw Forbidden when body does not match token', async () => {
    await expect(
      handle(makeReq({ body: { group_id: '999', parent_item_ids: [ '210' ] } }), makeResp()),
    ).rejects.toThrow(Forbidden);
  });

  it('should throw DecodingError for invalid body', async () => {
    await expect(
      handle(makeReq({ body: { group_id: 456 } }), makeResp()),
    ).rejects.toThrow(DecodingError);
  });

  it('should throw ServerError when EventBridge publish fails', async () => {
    mockPublishEvent.mockRejectedValue(new Error('bus down'));
    await expect(
      handle(makeReq(), makeResp()),
    ).rejects.toThrow(ServerError);
  });

  it('should accept parent_item_ids in different order', async () => {
    const resp = makeResp();
    const result = await handle(
      makeReq({ body: { group_id: '456', parent_item_ids: [ '220', '210' ] } }),
      resp,
    );
    expect(resp.statusCode).toBe(202);
    expect(result.export_id).toBeDefined();
  });

  it('should throw Forbidden when body has duplicate subset of token item_ids', async () => {
    await expect(
      handle(
        makeReq({ body: { group_id: '456', parent_item_ids: [ '210', '210' ] } }),
        makeResp(),
      ),
    ).rejects.toThrow(Forbidden);
  });

  it('should pass a UUID request_id when Lambda context has no awsRequestId', async () => {
    const req = makeReq();
    (req as unknown as { context: Record<string, unknown> }).context = {};
    await handle(req, makeResp());
    expect(mockPublishEvent).toHaveBeenCalledWith(
      'group_results_export_requested',
      expect.any(Object),
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
  });
});
