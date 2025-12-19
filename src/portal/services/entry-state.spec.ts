import { getEntryState } from './entry-state';

describe('Portal Entry State Service', () => {
  describe('getEntryState', () => {
    it('should return payment state as unpaid', async () => {
      const req = {} as any;
      const resp = {} as any;

      const result = await getEntryState(req, resp);

      expect(result).toEqual({
        payment: {
          state: 'unpaid',
        },
      });
    });

    it('should have correct response structure', async () => {
      const req = {} as any;
      const resp = {} as any;

      const result = await getEntryState(req, resp);

      expect(result).toHaveProperty('payment');
      expect(result.payment).toHaveProperty('state');
      expect(typeof result.payment.state).toBe('string');
    });
  });
});
