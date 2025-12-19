import Stripe from 'stripe';
import { hasPaidInvoice } from './stripe-invoice';

describe('Stripe Invoice Service', () => {
  let mockStripe: jest.Mocked<Stripe>;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    // Create mock Stripe client
    mockStripe = {
      invoices: {
        list: jest.fn(),
      },
    } as any;

    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('hasPaidInvoice', () => {
    it('should return true when one paid invoice is found', async () => {
      const mockInvoice = { id: 'in_123456', status: 'paid', metadata: { item_id: 'item_456' } };
      (mockStripe.invoices.list as jest.Mock).mockResolvedValue({
        data: [ mockInvoice ],
      });

      const result = await hasPaidInvoice(mockStripe, 'cus_123', 'item_456');

      expect(result).toBe(true);
      expect(mockStripe.invoices.list).toHaveBeenCalledWith({
        customer: 'cus_123',
        status: 'paid',
        limit: 100,
      });
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should return true and warn when multiple paid invoices are found', async () => {
      const mockInvoices = [
        { id: 'in_111111', status: 'paid', metadata: { item_id: 'item_abc' } },
        { id: 'in_222222', status: 'paid', metadata: { item_id: 'item_abc' } },
      ];
      (mockStripe.invoices.list as jest.Mock).mockResolvedValue({
        data: mockInvoices,
      });

      const result = await hasPaidInvoice(mockStripe, 'cus_789', 'item_abc');

      expect(result).toBe(true);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Multiple paid invoices found for customer cus_789 and item item_abc'
      );
    });

    it('should return false when no paid invoice is found', async () => {
      (mockStripe.invoices.list as jest.Mock).mockResolvedValue({
        data: [],
      });

      const result = await hasPaidInvoice(mockStripe, 'cus_999', 'item_xyz');

      expect(result).toBe(false);
      expect(mockStripe.invoices.list).toHaveBeenCalledWith({
        customer: 'cus_999',
        status: 'paid',
        limit: 100,
      });
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should return false when invoice exists but has different item_id', async () => {
      const mockInvoice = { id: 'in_123456', status: 'paid', metadata: { item_id: 'different_item' } };
      (mockStripe.invoices.list as jest.Mock).mockResolvedValue({
        data: [ mockInvoice ],
      });

      const result = await hasPaidInvoice(mockStripe, 'cus_123', 'item_456');

      expect(result).toBe(false);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should handle Stripe API errors', async () => {
      const stripeError = new Error('Stripe API error');
      (mockStripe.invoices.list as jest.Mock).mockRejectedValue(stripeError);

      await expect(
        hasPaidInvoice(mockStripe, 'cus_error', 'item_error')
      ).rejects.toThrow('Stripe API error');
    });
  });
});
