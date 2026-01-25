import { createCheckoutSession } from './checkout-session';
import { RequestWithPortalToken } from '../token';
import * as config from '../../config';
import * as stripe from '../../stripe';
import * as stripeCustomer from '../lib/stripe/customer';
import * as stripePrice from '../lib/stripe/price';
import * as checkoutSession from '../lib/stripe/checkout-session';
import { DecodingError, ServerError } from '../../utils/errors';

jest.mock('../../config');
jest.mock('../../stripe');
jest.mock('../lib/stripe/customer');
jest.mock('../lib/stripe/price');
jest.mock('../lib/stripe/checkout-session');

const mockLoadConfig = config.loadConfig as jest.MockedFunction<typeof config.loadConfig>;
const mockGetStripeClient = stripe.getStripeClient as jest.MockedFunction<typeof stripe.getStripeClient>;
const mockFindOrCreateCustomer = stripeCustomer.findOrCreateCustomer as jest.MockedFunction<
  typeof stripeCustomer.findOrCreateCustomer
>;
const mockFindPriceByItemId = stripePrice.findPriceByItemId as jest.MockedFunction<
  typeof stripePrice.findPriceByItemId
>;
const mockCreateCheckoutSession = checkoutSession.createCheckoutSession as jest.MockedFunction<
  typeof checkoutSession.createCheckoutSession
>;

describe('Checkout Session Handler', () => {
  let mockRequest: Partial<RequestWithPortalToken>;
  let mockStripeClient: any;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockRequest = {
      headers: { authorization: 'Bearer test-token' },
      body: { return_url: 'https://example.com/return' },
      portalToken: {
        itemId: 'item_123',
        userId: 'user_456',
        firstname: 'John',
        lastname: 'Doe',
        email: 'john@example.com',
      },
    };

    mockStripeClient = { customers: {}, prices: {}, checkout: {} };

    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    mockLoadConfig.mockReturnValue({
      portal: {
        payment: {
          stripe: {
            sk: 'test_secret_key',
          },
        },
      },
    });

    mockGetStripeClient.mockReturnValue(mockStripeClient);
    mockFindOrCreateCustomer.mockResolvedValue('cus_123');
    mockFindPriceByItemId.mockResolvedValue('price_456');
    mockCreateCheckoutSession.mockResolvedValue('cs_test_secret');
  });

  afterEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy.mockRestore();
  });

  it('should successfully create checkout session with valid request', async () => {
    const result = await createCheckoutSession(mockRequest as RequestWithPortalToken, {} as any);

    expect(result).toEqual({ client_secret: 'cs_test_secret' });
    expect(mockFindOrCreateCustomer).toHaveBeenCalledWith(
      mockStripeClient,
      'user_456',
      'John Doe',
      'john@example.com'
    );
    expect(mockFindPriceByItemId).toHaveBeenCalledWith(mockStripeClient, 'item_123');
    expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
      mockStripeClient,
      'cus_123',
      'price_456',
      'item_123',
      'https://example.com/return'
    );
  });

  it('should throw DecodingError when return_url is missing', async () => {
    mockRequest.body = {};

    await expect(
      createCheckoutSession(mockRequest as RequestWithPortalToken, {} as any)
    ).rejects.toThrow(DecodingError);

    await expect(
      createCheckoutSession(mockRequest as RequestWithPortalToken, {} as any)
    ).rejects.toThrow('Missing or invalid return_url in request body');
  });

  it('should throw DecodingError when return_url is empty', async () => {
    mockRequest.body = { return_url: '' };

    await expect(
      createCheckoutSession(mockRequest as RequestWithPortalToken, {} as any)
    ).rejects.toThrow(DecodingError);
  });

  it('should throw ServerError when payment is not configured', async () => {
    mockLoadConfig.mockReturnValue({
      portal: {},
    });

    await expect(
      createCheckoutSession(mockRequest as RequestWithPortalToken, {} as any)
    ).rejects.toThrow(ServerError);

    await expect(
      createCheckoutSession(mockRequest as RequestWithPortalToken, {} as any)
    ).rejects.toThrow('Payment is not configured');
  });

  it('should throw ServerError when Stripe client is not available', async () => {
    mockGetStripeClient.mockReturnValue(null);

    await expect(
      createCheckoutSession(mockRequest as RequestWithPortalToken, {} as any)
    ).rejects.toThrow(ServerError);

    await expect(
      createCheckoutSession(mockRequest as RequestWithPortalToken, {} as any)
    ).rejects.toThrow('Stripe client is not available');
  });

  it('should re-throw DecodingError when price is not found', async () => {
    mockFindPriceByItemId.mockRejectedValue(new DecodingError('No price found for item'));

    await expect(
      createCheckoutSession(mockRequest as RequestWithPortalToken, {} as any)
    ).rejects.toThrow(DecodingError);

    await expect(
      createCheckoutSession(mockRequest as RequestWithPortalToken, {} as any)
    ).rejects.toThrow('No price found for item');
  });

  it('should wrap Stripe errors as ServerError', async () => {
    const stripeError = new Error('Stripe network error');
    mockCreateCheckoutSession.mockRejectedValue(stripeError);

    await expect(
      createCheckoutSession(mockRequest as RequestWithPortalToken, {} as any)
    ).rejects.toThrow(ServerError);

    await expect(
      createCheckoutSession(mockRequest as RequestWithPortalToken, {} as any)
    ).rejects.toThrow('Failed to create checkout session');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error creating checkout session with Stripe:',
      stripeError
    );
  });
});
