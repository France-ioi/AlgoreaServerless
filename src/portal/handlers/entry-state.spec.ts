import { getEntryState } from './entry-state';
import { PortalToken, RequestWithPortalToken } from '../token';
import * as config from '../../config';
import * as stripe from '../../stripe';
import * as stripeCustomer from '../lib/stripe/customer';
import * as stripeInvoice from '../lib/stripe/invoice';

jest.mock('../../config');
jest.mock('../../stripe');
jest.mock('../lib/stripe/customer');
jest.mock('../lib/stripe/invoice');

const mockLoadConfig = config.loadConfig as jest.MockedFunction<typeof config.loadConfig>;
const mockGetStripeClient = stripe.getStripeClient as jest.MockedFunction<typeof stripe.getStripeClient>;
const mockFindOrCreateCustomer = stripeCustomer.findOrCreateCustomer as jest.MockedFunction<typeof stripeCustomer.findOrCreateCustomer>;
const mockHasPaidInvoice = stripeInvoice.hasPaidInvoice as jest.MockedFunction<typeof stripeInvoice.hasPaidInvoice>;

/** Helper to create a mock request with portalToken already set (as middleware would do) */
function mockRequest(token: PortalToken): RequestWithPortalToken {
  return {
    portalToken: token,
    headers: {},
  } as RequestWithPortalToken;
}

describe('Portal Entry State Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('payment state', () => {
    const baseToken: PortalToken = {
      itemId: 'item123',
      userId: 'user456',
      firstname: 'John',
      lastname: 'Doe',
      email: 'john@example.com',
    };

    it('should return payment state as disabled when payment config is not set', async () => {
      mockLoadConfig.mockReturnValue({
        portal: {},
      });

      const req = mockRequest(baseToken);
      const resp = {} as any;

      const result = await getEntryState(req, resp);

      expect(result).toEqual({
        payment: {
          state: 'disabled',
        },
      });
      expect(mockGetStripeClient).not.toHaveBeenCalled();
    });

    it('should return disabled when config is completely empty', async () => {
      mockLoadConfig.mockReturnValue({});

      const req = mockRequest(baseToken);
      const resp = {} as any;

      const result = await getEntryState(req, resp);

      expect(result).toEqual({
        payment: {
          state: 'disabled',
        },
      });
    });

    it('should return disabled when stripe client cannot be created', async () => {
      mockLoadConfig.mockReturnValue({
        portal: {
          payment: {
            stripe: {
              sk: 'test_secret_key',
            },
          },
        },
      });
      mockGetStripeClient.mockReturnValue(null);

      const req = mockRequest(baseToken);
      const resp = {} as any;

      const result = await getEntryState(req, resp);

      expect(result).toEqual({
        payment: {
          state: 'disabled',
        },
      });
      expect(mockGetStripeClient).toHaveBeenCalled();
    });

    it('should return payment state as unpaid when payment config is set and no paid invoice exists', async () => {
      mockLoadConfig.mockReturnValue({
        portal: {
          payment: {
            stripe: {
              sk: 'test_secret_key',
            },
          },
        },
      });

      const mockStripeClient = {} as any;
      mockGetStripeClient.mockReturnValue(mockStripeClient);
      mockFindOrCreateCustomer.mockResolvedValue('cus_123456');
      mockHasPaidInvoice.mockResolvedValue(false);

      const req = mockRequest(baseToken);
      const resp = {} as any;

      const result = await getEntryState(req, resp);

      expect(result).toEqual({
        payment: {
          state: 'unpaid',
        },
      });
      expect(mockFindOrCreateCustomer).toHaveBeenCalledWith(
        mockStripeClient,
        'user456',
        'John Doe',
        'john@example.com'
      );
      expect(mockHasPaidInvoice).toHaveBeenCalledWith(
        mockStripeClient,
        'cus_123456',
        'item123'
      );
    });

    it('should return payment state as paid when paid invoice exists', async () => {
      mockLoadConfig.mockReturnValue({
        portal: {
          payment: {
            stripe: {
              sk: 'test_secret_key',
            },
          },
        },
      });

      const mockStripeClient = {} as any;
      mockGetStripeClient.mockReturnValue(mockStripeClient);
      mockFindOrCreateCustomer.mockResolvedValue('cus_789012');
      mockHasPaidInvoice.mockResolvedValue(true);

      const token: PortalToken = {
        itemId: 'item999',
        userId: 'user888',
        firstname: 'Jane',
        lastname: 'Smith',
        email: 'jane@example.com',
      };

      const req = mockRequest(token);
      const resp = {} as any;

      const result = await getEntryState(req, resp);

      expect(result).toEqual({
        payment: {
          state: 'paid',
        },
      });
      expect(mockFindOrCreateCustomer).toHaveBeenCalledWith(
        mockStripeClient,
        'user888',
        'Jane Smith',
        'jane@example.com'
      );
      expect(mockHasPaidInvoice).toHaveBeenCalledWith(
        mockStripeClient,
        'cus_789012',
        'item999'
      );
    });

    it('should return unpaid on Stripe API error', async () => {
      mockLoadConfig.mockReturnValue({
        portal: {
          payment: {
            stripe: {
              sk: 'test_secret_key',
            },
          },
        },
      });

      const mockStripeClient = {} as any;
      mockGetStripeClient.mockReturnValue(mockStripeClient);
      mockFindOrCreateCustomer.mockRejectedValue(new Error('Stripe API error'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const req = mockRequest(baseToken);
      const resp = {} as any;

      const result = await getEntryState(req, resp);

      expect(result).toEqual({
        payment: {
          state: 'unpaid',
        },
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error checking payment status with Stripe:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should have correct response structure', async () => {
      mockLoadConfig.mockReturnValue({});

      const req = mockRequest(baseToken);
      const resp = {} as any;

      const result = await getEntryState(req, resp);

      expect(result).toHaveProperty('payment');
      expect(result.payment).toHaveProperty('state');
      expect(typeof result.payment.state).toBe('string');
    });
  });
});
