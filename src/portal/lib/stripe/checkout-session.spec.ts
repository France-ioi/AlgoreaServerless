import Stripe from 'stripe';
import { createCheckoutSession } from './checkout-session';

describe('Checkout Session Service', () => {
  let mockStripe: jest.Mocked<Stripe>;

  beforeEach(() => {
    // Create mock Stripe client
    mockStripe = {
      checkout: {
        sessions: {
          create: jest.fn(),
        },
      },
    } as any;
  });

  describe('createCheckoutSession', () => {
    it('should create checkout session with correct parameters', async () => {
      const mockSession = { client_secret: 'cs_test_123456' };
      (mockStripe.checkout.sessions.create as jest.Mock).mockResolvedValue(mockSession);

      const clientSecret = await createCheckoutSession(
        mockStripe,
        'cus_123',
        'price_456',
        'item_789',
        'https://example.com/return'
      );

      expect(clientSecret).toBe('cs_test_123456');
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith({
        automatic_tax: { enabled: true },
        customer: 'cus_123',
        customer_update: { address: 'auto', name: 'auto' },
        line_items: [{ price: 'price_456', quantity: 1 }],
        mode: 'payment',
        return_url: 'https://example.com/return',
        ui_mode: 'embedded',
        allow_promotion_codes: false,
        billing_address_collection: 'required',
        invoice_creation: {
          enabled: true,
          invoice_data: {
            metadata: { item_id: 'item_789' },
          },
        },
        tax_id_collection: { enabled: true, required: 'never' },
      });
    });

    it('should pass through all required parameters', async () => {
      const mockSession = { client_secret: 'cs_test_abc' };
      (mockStripe.checkout.sessions.create as jest.Mock).mockResolvedValue(mockSession);

      await createCheckoutSession(
        mockStripe,
        'cus_different',
        'price_different',
        'item_different',
        'https://different.com/return'
      );

      const createCall = (mockStripe.checkout.sessions.create as jest.Mock).mock.calls[0][0];
      expect(createCall.customer).toBe('cus_different');
      expect(createCall.line_items[0].price).toBe('price_different');
      expect(createCall.return_url).toBe('https://different.com/return');
      expect(createCall.invoice_creation.invoice_data.metadata.item_id).toBe('item_different');
    });

    it('should enable automatic tax', async () => {
      const mockSession = { client_secret: 'cs_test_xyz' };
      (mockStripe.checkout.sessions.create as jest.Mock).mockResolvedValue(mockSession);

      await createCheckoutSession(
        mockStripe,
        'cus_123',
        'price_456',
        'item_789',
        'https://example.com/return'
      );

      const createCall = (mockStripe.checkout.sessions.create as jest.Mock).mock.calls[0][0];
      expect(createCall.automatic_tax.enabled).toBe(true);
      expect(createCall.tax_id_collection.enabled).toBe(true);
      expect(createCall.tax_id_collection.required).toBe('never');
    });

    it('should configure invoice creation with item metadata', async () => {
      const mockSession = { client_secret: 'cs_test_invoice' };
      (mockStripe.checkout.sessions.create as jest.Mock).mockResolvedValue(mockSession);

      await createCheckoutSession(
        mockStripe,
        'cus_123',
        'price_456',
        'item_special',
        'https://example.com/return'
      );

      const createCall = (mockStripe.checkout.sessions.create as jest.Mock).mock.calls[0][0];
      expect(createCall.invoice_creation.enabled).toBe(true);
      expect(createCall.invoice_creation.invoice_data.metadata.item_id).toBe('item_special');
    });

    it('should handle Stripe API errors', async () => {
      const stripeError = new Error('Stripe API error');
      (mockStripe.checkout.sessions.create as jest.Mock).mockRejectedValue(stripeError);

      await expect(
        createCheckoutSession(
          mockStripe,
          'cus_123',
          'price_456',
          'item_789',
          'https://example.com/return'
        )
      ).rejects.toThrow('Stripe API error');
    });
  });
});
