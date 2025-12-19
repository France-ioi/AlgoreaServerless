import { mockALBEvent } from '../../testutils/event-mocks';
import { globalHandler } from '../../handlers';

describe('E2E: Portal Entry State', () => {
  it('should return entry state with unpaid payment status', async () => {
    const event = mockALBEvent({
      path: '/sls/portal/entry-state',
      httpMethod: 'GET',
      headers: {},
      body: null,
    });

    const result = await globalHandler(event, {} as any) as any;

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body).toEqual({
      payment: {
        state: 'unpaid',
      },
    });
  });

  it('should handle CORS preflight request', async () => {
    const event = mockALBEvent({
      path: '/sls/portal/entry-state',
      httpMethod: 'OPTIONS',
      headers: {},
      body: null,
    });

    const result = await globalHandler(event, {} as any) as any;

    expect(result.statusCode).toBe(200);
    expect(result.headers).toHaveProperty('access-control-allow-origin');
  });
});
