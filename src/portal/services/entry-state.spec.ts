import { getEntryState } from './entry-state';
import * as config from '../../config';

jest.mock('../../config');

const mockLoadConfig = config.loadConfig as jest.MockedFunction<typeof config.loadConfig>;

describe('Portal Entry State Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getEntryState', () => {
    it('should return payment state as disabled when payment config is not set', () => {
      mockLoadConfig.mockReturnValue({
        portal: {},
      });

      const req = {} as any;
      const resp = {} as any;

      const result = getEntryState(req, resp);

      expect(result).toEqual({
        payment: {
          state: 'disabled',
        },
      });
    });

    it('should return payment state as unpaid when payment config is set', () => {
      mockLoadConfig.mockReturnValue({
        portal: {
          payment: {
            stripe: {
              sk: 'test_secret_key',
            },
          },
        },
      });

      const req = {} as any;
      const resp = {} as any;

      const result = getEntryState(req, resp);

      expect(result).toEqual({
        payment: {
          state: 'unpaid',
        },
      });
    });

    it('should return disabled when config is completely empty', () => {
      mockLoadConfig.mockReturnValue({});

      const req = {} as any;
      const resp = {} as any;

      const result = getEntryState(req, resp);

      expect(result).toEqual({
        payment: {
          state: 'disabled',
        },
      });
    });

    it('should have correct response structure', () => {
      mockLoadConfig.mockReturnValue({});

      const req = {} as any;
      const resp = {} as any;

      const result = getEntryState(req, resp);

      expect(result).toHaveProperty('payment');
      expect(result.payment).toHaveProperty('state');
      expect(typeof result.payment.state).toBe('string');
    });
  });
});
