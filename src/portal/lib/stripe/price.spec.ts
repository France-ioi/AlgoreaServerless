import Stripe from 'stripe';
import { findPriceByItemId } from './price';
import { DecodingError } from '../../../utils/errors';

describe('Stripe Price Service', () => {
  let mockStripe: jest.Mocked<Stripe>;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    // Create mock Stripe client
    mockStripe = {
      products: {
        search: jest.fn(),
      },
    } as any;

    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('findPriceByItemId', () => {
    it('should return price id when one product is found with default_price as string', async () => {
      const mockProduct = {
        id: 'prod_123456',
        metadata: { item_id: 'item_123' },
        default_price: 'price_abc123',
      };
      (mockStripe.products.search as jest.Mock).mockResolvedValue({
        data: [ mockProduct ],
      });

      const priceId = await findPriceByItemId(mockStripe, 'item_123');

      expect(priceId).toBe('price_abc123');
      expect(mockStripe.products.search).toHaveBeenCalledWith({
        query: "active:'true' AND metadata['item_id']:'item_123'",
      });
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should return price id when default_price is a Price object', async () => {
      const mockProduct = {
        id: 'prod_123456',
        metadata: { item_id: 'item_123' },
        default_price: { id: 'price_xyz789', unit_amount: 1000 },
      };
      (mockStripe.products.search as jest.Mock).mockResolvedValue({
        data: [ mockProduct ],
      });

      const priceId = await findPriceByItemId(mockStripe, 'item_123');

      expect(priceId).toBe('price_xyz789');
    });

    it('should throw DecodingError when no product is found', async () => {
      (mockStripe.products.search as jest.Mock).mockResolvedValue({
        data: [],
      });

      await expect(
        findPriceByItemId(mockStripe, 'nonexistent_item')
      ).rejects.toThrow(DecodingError);

      await expect(
        findPriceByItemId(mockStripe, 'nonexistent_item')
      ).rejects.toThrow('No product found for item');
    });

    it('should throw DecodingError when product has no default_price', async () => {
      const mockProduct = {
        id: 'prod_no_price',
        metadata: { item_id: 'item_no_price' },
        default_price: null,
      };
      (mockStripe.products.search as jest.Mock).mockResolvedValue({
        data: [ mockProduct ],
      });

      await expect(
        findPriceByItemId(mockStripe, 'item_no_price')
      ).rejects.toThrow(DecodingError);

      await expect(
        findPriceByItemId(mockStripe, 'item_no_price')
      ).rejects.toThrow('Product has no default price configured');
    });

    it('should return first price id and warn when multiple products are found', async () => {
      const mockProducts = [
        { id: 'prod_111111', metadata: { item_id: 'item_456' }, default_price: 'price_first' },
        { id: 'prod_222222', metadata: { item_id: 'item_456' }, default_price: 'price_second' },
        { id: 'prod_333333', metadata: { item_id: 'item_456' }, default_price: 'price_third' },
      ];
      (mockStripe.products.search as jest.Mock).mockResolvedValue({
        data: mockProducts,
      });

      const priceId = await findPriceByItemId(mockStripe, 'item_456');

      expect(priceId).toBe('price_first');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Multiple products found for item_id item_456, using first one'
      );
    });

    it('should use search API with correct query format', async () => {
      const mockProduct = {
        id: 'prod_bbb',
        metadata: { item_id: 'target_item' },
        default_price: 'price_target',
      };
      (mockStripe.products.search as jest.Mock).mockResolvedValue({
        data: [ mockProduct ],
      });

      const priceId = await findPriceByItemId(mockStripe, 'target_item');

      expect(priceId).toBe('price_target');
      expect(mockStripe.products.search).toHaveBeenCalledWith({
        query: "active:'true' AND metadata['item_id']:'target_item'",
      });
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should handle Stripe API errors', async () => {
      const stripeError = new Error('Stripe API error');
      (mockStripe.products.search as jest.Mock).mockRejectedValue(stripeError);

      await expect(
        findPriceByItemId(mockStripe, 'item_789')
      ).rejects.toThrow('Stripe API error');
    });
  });
});
