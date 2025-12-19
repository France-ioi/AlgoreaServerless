import { mockALBEvent } from '../../testutils/event-mocks';
import { globalHandler } from '../../handlers';
import * as config from '../../config';

jest.mock('../../config');

const mockLoadConfig = config.loadConfig as jest.MockedFunction<typeof config.loadConfig>;

describe('E2E: Portal Entry State', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return entry state with disabled payment when config has no payment', async () => {
    mockLoadConfig.mockReturnValue({
      portal: {},
    });

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
        state: 'disabled',
      },
    });
  });

  it('should return entry state with unpaid payment when config has payment', async () => {
    mockLoadConfig.mockReturnValue({
      portal: {
        payment: {
          stripe: {
            sk: 'test_secret_key',
          },
        },
      },
    });

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
    mockLoadConfig.mockReturnValue({});

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
