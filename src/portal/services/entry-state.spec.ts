import { getEntryState } from './entry-state';
import * as config from '../../config';
import * as stripe from '../../stripe';
import * as stripeCustomer from './stripe-customer';
import * as stripeInvoice from './stripe-invoice';
import { generatePortalToken } from '../../testutils/portal-token-generator';
import { initializeKeys } from '../../testutils/token-generator';

jest.mock('../../config');
jest.mock('../../stripe');
jest.mock('./stripe-customer');
jest.mock('./stripe-invoice');

const mockLoadConfig = config.loadConfig as jest.MockedFunction<typeof config.loadConfig>;
const mockGetStripeClient = stripe.getStripeClient as jest.MockedFunction<typeof stripe.getStripeClient>;
const mockFindOrCreateCustomer = stripeCustomer.findOrCreateCustomer as jest.MockedFunction<typeof stripeCustomer.findOrCreateCustomer>;
const mockHasPaidInvoice = stripeInvoice.hasPaidInvoice as jest.MockedFunction<typeof stripeInvoice.hasPaidInvoice>;

describe('Portal Entry State Service', () => {
  beforeAll(async () => {
    await initializeKeys();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('authentication', () => {
    it('should require valid authorization token', async () => {
      mockLoadConfig.mockReturnValue({
        portal: {},
      });

      const token = await generatePortalToken({
        itemId: 'item123',
        userId: 'user456',
      });

      const req = {
        headers: { authorization: `Bearer ${token}` },
      } as any;
      const resp = {} as any;

      const result = await getEntryState(req, resp);

      expect(result).toHaveProperty('payment');
    });

    it('should reject request without authorization header', async () => {
      const req = { headers: {} } as any;
      const resp = {} as any;

      await expect(getEntryState(req, resp))
        .rejects.toThrow('no Authorization header found');
    });

    it('should reject request with invalid token', async () => {
      const req = {
        headers: { authorization: 'Bearer invalid-token' },
      } as any;
      const resp = {} as any;

      await expect(getEntryState(req, resp))
        .rejects.toThrow();
    });

    it('should reject request with malformed authorization header', async () => {
      const req = {
        headers: { authorization: 'NotBearer token123' },
      } as any;
      const resp = {} as any;

      await expect(getEntryState(req, resp))
        .rejects.toThrow('not a Bearer token');
    });
  });

  describe('payment state', () => {
    it('should return payment state as disabled when payment config is not set', async () => {
      mockLoadConfig.mockReturnValue({
        portal: {},
      });

      const token = await generatePortalToken({
        itemId: 'item123',
        userId: 'user456',
      });

      const req = {
        headers: { authorization: `Bearer ${token}` },
      } as any;
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

      const token = await generatePortalToken({
        itemId: 'item123',
        userId: 'user456',
      });

      const req = {
        headers: { authorization: `Bearer ${token}` },
      } as any;
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

      const token = await generatePortalToken({
        itemId: 'item123',
        userId: 'user456',
      });

      const req = {
        headers: { authorization: `Bearer ${token}` },
      } as any;
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

      const token = await generatePortalToken({
        itemId: 'item123',
        userId: 'user456',
        firstname: 'John',
        lastname: 'Doe',
        email: 'john@example.com',
      });

      const req = {
        headers: { authorization: `Bearer ${token}` },
      } as any;
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

      const token = await generatePortalToken({
        itemId: 'item999',
        userId: 'user888',
        firstname: 'Jane',
        lastname: 'Smith',
        email: 'jane@example.com',
      });

      const req = {
        headers: { authorization: `Bearer ${token}` },
      } as any;
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

      const token = await generatePortalToken({
        itemId: 'item123',
        userId: 'user456',
      });

      const req = {
        headers: { authorization: `Bearer ${token}` },
      } as any;
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

      const token = await generatePortalToken({
        itemId: 'item123',
        userId: 'user456',
      });

      const req = {
        headers: { authorization: `Bearer ${token}` },
      } as any;
      const resp = {} as any;

      const result = await getEntryState(req, resp);

      expect(result).toHaveProperty('payment');
      expect(result.payment).toHaveProperty('state');
      expect(typeof result.payment.state).toBe('string');
    });
  });
});
