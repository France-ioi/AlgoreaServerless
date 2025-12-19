import Stripe from 'stripe';
import { findPriceByItemId } from './stripe-price';
import { DecodingError } from '../../utils/errors';

describe('Stripe Price Service', () => {
  let mockStripe: jest.Mocked<Stripe>;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    // Create mock Stripe client
    mockStripe = {
      prices: {
        search: jest.fn(),
      },
    } as any;

    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('findPriceByItemId', () => {
    it('should return price id when one price is found', async () => {
      const mockPrice = { id: 'price_123456', metadata: { item_id: 'item_123' } };
      (mockStripe.prices.search as jest.Mock).mockResolvedValue({
        data: [ mockPrice ],
      });

      const priceId = await findPriceByItemId(mockStripe, 'item_123');

      expect(priceId).toBe('price_123456');
      expect(mockStripe.prices.search).toHaveBeenCalledWith({
        query: "active:'true' AND metadata['item_id']:'item_123'",
      });
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should throw DecodingError when no price is found', async () => {
      (mockStripe.prices.search as jest.Mock).mockResolvedValue({
        data: [],
      });

      await expect(
        findPriceByItemId(mockStripe, 'nonexistent_item')
      ).rejects.toThrow(DecodingError);

      await expect(
        findPriceByItemId(mockStripe, 'nonexistent_item')
      ).rejects.toThrow('No price found for item');
    });

    it('should return first price id and warn when multiple prices are found', async () => {
      const mockPrices = [
        { id: 'price_111111', metadata: { item_id: 'item_456' } },
        { id: 'price_222222', metadata: { item_id: 'item_456' } },
        { id: 'price_333333', metadata: { item_id: 'item_456' } },
      ];
      (mockStripe.prices.search as jest.Mock).mockResolvedValue({
        data: mockPrices,
      });

      const priceId = await findPriceByItemId(mockStripe, 'item_456');

      expect(priceId).toBe('price_111111');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Multiple prices found for item_id item_456, using first one'
      );
    });

    it('should use search API with correct query format', async () => {
      const mockPrice = { id: 'price_bbb', metadata: { item_id: 'target_item' } };
      (mockStripe.prices.search as jest.Mock).mockResolvedValue({
        data: [ mockPrice ],
      });

      const priceId = await findPriceByItemId(mockStripe, 'target_item');

      expect(priceId).toBe('price_bbb');
      expect(mockStripe.prices.search).toHaveBeenCalledWith({
        query: "active:'true' AND metadata['item_id']:'target_item'",
      });
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should handle Stripe API errors', async () => {
      const stripeError = new Error('Stripe API error');
      (mockStripe.prices.search as jest.Mock).mockRejectedValue(stripeError);

      await expect(
        findPriceByItemId(mockStripe, 'item_789')
      ).rejects.toThrow('Stripe API error');
    });
  });
});
