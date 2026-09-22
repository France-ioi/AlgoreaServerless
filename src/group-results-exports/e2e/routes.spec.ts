import { initializeKeys, signTestJwt } from '../../testutils/token-generator';
import { mockALBEvent } from '../../testutils/event-mocks';

const mockPresignPut = jest.fn();
const mockHead = jest.fn();
const mockPresignGet = jest.fn();
const mockPublishEvent = jest.fn();

jest.mock('../../lib/exports-s3', () => ({
  ...jest.requireActual('../../lib/exports-s3'),
  presignExportPutUrl: (...args: unknown[]) => mockPresignPut(...args),
  headExportObject: (...args: unknown[]) => mockHead(...args),
  presignExportGetUrl: (...args: unknown[]) => mockPresignGet(...args),
}));

jest.mock('../../lib/eventbridge', () => ({
  publishEvent: (...args: unknown[]) => mockPublishEvent(...args),
}));

import { globalHandler } from '../../handlers';

function todayDateStr(): string {
  const now = new Date();
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = now.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

async function groupResultsToken(overrides?: Record<string, unknown>): Promise<string> {
  return signTestJwt({
    user_id: '123',
    group_id: '456',
    item_ids: [ '210', '220' ],
    date: todayDateStr(),
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  });
}

async function identityToken(userId = '123'): Promise<string> {
  return signTestJwt({
    user_id: userId,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
}

describe('E2E: Group results exports', () => {
  beforeAll(async () => {
    await initializeKeys();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPresignPut.mockResolvedValue('https://s3.example/put');
    mockPublishEvent.mockResolvedValue(undefined);
    mockPresignGet.mockResolvedValue('https://s3.example/get');
  });

  describe('POST /sls/group-results-exports', () => {
    it('should return 401 without authorization', async () => {
      const event = mockALBEvent({
        path: '/sls/group-results-exports',
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({ group_id: '456', parent_item_ids: [ '210', '220' ] }),
      });
      const result = await globalHandler(event, {} as never) as { statusCode: number };
      expect(result.statusCode).toBe(401);
    });

    it('should return 403 when body does not match token', async () => {
      const token = await groupResultsToken();
      const event = mockALBEvent({
        path: '/sls/group-results-exports',
        httpMethod: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ group_id: '999', parent_item_ids: [ '210', '220' ] }),
      });
      const result = await globalHandler(event, {} as never) as { statusCode: number };
      expect(result.statusCode).toBe(403);
    });

    it('should return 202 on success', async () => {
      const token = await groupResultsToken();
      const event = mockALBEvent({
        path: '/sls/group-results-exports',
        httpMethod: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ group_id: '456', parent_item_ids: [ '210', '220' ] }),
      });
      const result = await globalHandler(event, {} as never) as { statusCode: number, body: string };
      expect(result.statusCode).toBe(202);
      const body = JSON.parse(result.body);
      expect(body.export_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(body.expires_at).toEqual(expect.any(Number));
      expect(mockPublishEvent).toHaveBeenCalledWith(
        'group_results_export_requested',
        expect.objectContaining({
          export_id: body.export_id,
          upload_url: 'https://s3.example/put',
        }),
        expect.stringMatching(/^[0-9a-f-]{36}$/),
      );
    });
  });

  describe('GET /sls/group-results-exports/:exportId/download-url', () => {
    const exportId = '8d3f0b7e-1234-4abc-9def-1234567890ab';

    it('should return 401 without identity token', async () => {
      const event = mockALBEvent({
        path: `/sls/group-results-exports/${exportId}/download-url`,
        httpMethod: 'GET',
        headers: {},
      });
      const result = await globalHandler(event, {} as never) as { statusCode: number };
      expect(result.statusCode).toBe(401);
    });

    it('should return 404 when the object is missing', async () => {
      mockHead.mockResolvedValue(null);
      const token = await identityToken();
      const event = mockALBEvent({
        path: `/sls/group-results-exports/${exportId}/download-url`,
        httpMethod: 'GET',
        headers: { authorization: `Bearer ${token}` },
      });
      const result = await globalHandler(event, {} as never) as { statusCode: number, body: string };
      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body)).toEqual({ error: 'not_found' });
      expect(mockHead).toHaveBeenCalledWith(
        `temp-files/signed-url-access/group-results-exports/test/123/${exportId}.zip`,
      );
    });

    it('should return 404 for another user_id (different S3 key)', async () => {
      mockHead.mockResolvedValue(null);
      const token = await identityToken('other-user');
      const event = mockALBEvent({
        path: `/sls/group-results-exports/${exportId}/download-url`,
        httpMethod: 'GET',
        headers: { authorization: `Bearer ${token}` },
      });
      const result = await globalHandler(event, {} as never) as { statusCode: number, body: string };
      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body)).toEqual({ error: 'not_found' });
      expect(mockHead).toHaveBeenCalledWith(
        `temp-files/signed-url-access/group-results-exports/test/other-user/${exportId}.zip`,
      );
    });

    it('should return 400 for invalid export_id', async () => {
      const token = await identityToken();
      const event = mockALBEvent({
        path: '/sls/group-results-exports/not-a-uuid/download-url',
        httpMethod: 'GET',
        headers: { authorization: `Bearer ${token}` },
      });
      const result = await globalHandler(event, {} as never) as { statusCode: number };
      expect(result.statusCode).toBe(400);
      expect(mockHead).not.toHaveBeenCalled();
    });

    it('should return 200 with url when the object exists', async () => {
      mockHead.mockResolvedValue({
        contentDisposition: 'attachment; filename="export.zip"',
      });
      const token = await identityToken();
      const event = mockALBEvent({
        path: `/sls/group-results-exports/${exportId}/download-url`,
        httpMethod: 'GET',
        headers: { authorization: `Bearer ${token}` },
      });
      const result = await globalHandler(event, {} as never) as { statusCode: number, body: string };
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual({
        url: 'https://s3.example/get',
        expires_in: 300,
      });
      expect(mockHead).toHaveBeenCalledWith(
        `temp-files/signed-url-access/group-results-exports/test/123/${exportId}.zip`,
      );
    });
  });
});
