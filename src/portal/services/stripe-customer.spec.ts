import Stripe from 'stripe';
import { findOrCreateCustomer } from './stripe-customer';

describe('Stripe Customer Service', () => {
  let mockStripe: jest.Mocked<Stripe>;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    // Create mock Stripe client
    mockStripe = {
      customers: {
        list: jest.fn(),
        create: jest.fn(),
      },
    } as any;

    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('findOrCreateCustomer', () => {
    it('should return existing customer id when one customer is found', async () => {
      const mockCustomer = { id: 'cus_123456', metadata: { user_id: 'user_123' } };
      (mockStripe.customers.list as jest.Mock).mockResolvedValue({
        data: [ mockCustomer ],
      });

      const customerId = await findOrCreateCustomer(
        mockStripe,
        'user_123',
        'John Doe',
        'john@example.com'
      );

      expect(customerId).toBe('cus_123456');
      expect(mockStripe.customers.list).toHaveBeenCalledWith({
        email: 'john@example.com',
        limit: 100,
      });
      expect(mockStripe.customers.create).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should return first customer id and warn when multiple customers are found', async () => {
      const mockCustomers = [
        { id: 'cus_111111', metadata: { user_id: 'user_456' } },
        { id: 'cus_222222', metadata: { user_id: 'user_456' } },
        { id: 'cus_333333', metadata: { user_id: 'user_456' } },
      ];
      (mockStripe.customers.list as jest.Mock).mockResolvedValue({
        data: mockCustomers,
      });

      const customerId = await findOrCreateCustomer(
        mockStripe,
        'user_456',
        'Jane Smith',
        'jane@example.com'
      );

      expect(customerId).toBe('cus_111111');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Multiple customers found for user_id user_456, using first one'
      );
      expect(mockStripe.customers.create).not.toHaveBeenCalled();
    });

    it('should create new customer when no existing customer is found', async () => {
      (mockStripe.customers.list as jest.Mock).mockResolvedValue({
        data: [],
      });

      const mockNewCustomer = { id: 'cus_new123' };
      (mockStripe.customers.create as jest.Mock).mockResolvedValue(mockNewCustomer);

      const customerId = await findOrCreateCustomer(
        mockStripe,
        'user_789',
        'Bob Johnson',
        'bob@example.com'
      );

      expect(customerId).toBe('cus_new123');
      expect(mockStripe.customers.list).toHaveBeenCalledWith({
        email: 'bob@example.com',
        limit: 100,
      });
      expect(mockStripe.customers.create).toHaveBeenCalledWith({
        name: 'Bob Johnson',
        email: 'bob@example.com',
        metadata: {
          user_id: 'user_789',
        },
      });
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should handle Stripe API errors', async () => {
      const stripeError = new Error('Stripe API error');
      (mockStripe.customers.list as jest.Mock).mockRejectedValue(stripeError);

      await expect(
        findOrCreateCustomer(mockStripe, 'user_999', 'Test User', 'test@example.com')
      ).rejects.toThrow('Stripe API error');
    });
  });
});
