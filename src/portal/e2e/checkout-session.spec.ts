import { mockALBEvent } from '../../testutils/event-mocks';
import { globalHandler } from '../../handlers';
import * as config from '../../config';
import * as stripe from '../../stripe';
import { generatePortalToken } from '../../testutils/portal-token-generator';
import { initializeKeys } from '../../testutils/token-generator';

jest.mock('../../config');
jest.mock('../../stripe');

const mockLoadConfig = config.loadConfig as jest.MockedFunction<typeof config.loadConfig>;
const mockGetStripeClient = stripe.getStripeClient as jest.MockedFunction<typeof stripe.getStripeClient>;

describe('E2E: Portal Checkout Session', () => {
  let mockStripeClient: any;

  beforeAll(async () => {
    await initializeKeys();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Create comprehensive mock Stripe client
    mockStripeClient = {
      customers: {
        list: jest.fn().mockResolvedValue({
          data: [],
        }),
        create: jest.fn().mockResolvedValue({
          id: 'cus_test123',
        }),
      },
      products: {
        search: jest.fn().mockResolvedValue({
          data: [
            {
              id: 'prod_test789',
              default_price: 'price_test456',
              metadata: { item_id: 'test-premium-access-001' },
            },
          ],
        }),
      },
      checkout: {
        sessions: {
          create: jest.fn().mockResolvedValue({
            client_secret: 'cs_test_abc123',
          }),
        },
      },
    };

    mockLoadConfig.mockReturnValue({
      portal: {
        payment: {
          stripe: {
            sk: 'sk_test_secret_key',
          },
        },
      },
    });

    mockGetStripeClient.mockReturnValue(mockStripeClient);
  });

  it('should successfully create checkout session with valid request', async () => {
    const token = await generatePortalToken({
      itemId: 'test-premium-access-001',
      userId: 'user123',
      firstname: 'John',
      lastname: 'Doe',
      email: 'john@example.com',
    });

    const event = mockALBEvent({
      path: '/sls/portal/checkout-session',
      httpMethod: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        return_url: 'https://example.com/return',
      }),
    });

    const result = await globalHandler(event, {} as any) as any;

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body).toHaveProperty('client_secret');
    expect(body.client_secret).toBe('cs_test_abc123');

    // Verify Stripe calls
    expect(mockStripeClient.customers.list).toHaveBeenCalled();
    expect(mockStripeClient.prices.search).toHaveBeenCalledWith({
      query: "active:'true' AND metadata['item_id']:'test-premium-access-001'",
    });
    expect(mockStripeClient.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_test123',
        customer_update: { address: 'auto', name: 'auto' },
        line_items: [{ price: 'price_test456', quantity: 1 }],
        return_url: 'https://example.com/return',
        mode: 'payment',
        ui_mode: 'embedded',
        automatic_tax: { enabled: true },
        billing_address_collection: 'required',
        invoice_creation: {
          enabled: true,
          invoice_data: {
            metadata: { item_id: 'test-premium-access-001' },
          },
        },
      })
    );
  });

  it('should return 400 when return_url is missing', async () => {
    const token = await generatePortalToken({
      itemId: 'test-premium-access-001',
      userId: 'user123',
    });

    const event = mockALBEvent({
      path: '/sls/portal/checkout-session',
      httpMethod: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });

    const result = await globalHandler(event, {} as any) as any;

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.details).toContain('return_url');
  });

  it('should return 400 when no price found for item_id', async () => {
    // Mock prices search to return empty for nonexistent item
    mockStripeClient.prices.search.mockResolvedValue({
      data: [],
    });

    const token = await generatePortalToken({
      itemId: 'nonexistent-item',
      userId: 'user123',
    });

    const event = mockALBEvent({
      path: '/sls/portal/checkout-session',
      httpMethod: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        return_url: 'https://example.com/return',
      }),
    });

    const result = await globalHandler(event, {} as any) as any;

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.details).toContain('price');
  });

  it('should return 401 when authorization header is missing', async () => {
    const event = mockALBEvent({
      path: '/sls/portal/checkout-session',
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({
        return_url: 'https://example.com/return',
      }),
    });

    const result = await globalHandler(event, {} as any) as any;

    expect(result.statusCode).toBe(401);
  });

  it('should return 401 with invalid token', async () => {
    const event = mockALBEvent({
      path: '/sls/portal/checkout-session',
      httpMethod: 'POST',
      headers: {
        authorization: 'Bearer invalid-token',
      },
      body: JSON.stringify({
        return_url: 'https://example.com/return',
      }),
    });

    const result = await globalHandler(event, {} as any) as any;

    expect(result.statusCode).toBe(401);
  });

  it('should return 500 when payment is not configured', async () => {
    mockLoadConfig.mockReturnValue({
      portal: {},
    });

    const token = await generatePortalToken({
      itemId: 'test-premium-access-001',
      userId: 'user123',
    });

    const event = mockALBEvent({
      path: '/sls/portal/checkout-session',
      httpMethod: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        return_url: 'https://example.com/return',
      }),
    });

    const result = await globalHandler(event, {} as any) as any;

    expect(result.statusCode).toBe(500);
  });

  it('should return 500 when Stripe client is not available', async () => {
    mockGetStripeClient.mockReturnValue(null);

    const token = await generatePortalToken({
      itemId: 'test-premium-access-001',
      userId: 'user123',
    });

    const event = mockALBEvent({
      path: '/sls/portal/checkout-session',
      httpMethod: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        return_url: 'https://example.com/return',
      }),
    });

    const result = await globalHandler(event, {} as any) as any;

    expect(result.statusCode).toBe(500);
  });

  it('should handle CORS preflight request', async () => {
    const event = mockALBEvent({
      path: '/sls/portal/checkout-session',
      httpMethod: 'OPTIONS',
      headers: {},
      body: null,
    });

    const result = await globalHandler(event, {} as any) as any;

    expect(result.statusCode).toBe(200);
    expect(result.headers).toHaveProperty('access-control-allow-origin');
  });
});
