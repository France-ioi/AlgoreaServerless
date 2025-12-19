import { getEntryState } from './entry-state';
import * as config from '../../config';
import { generatePortalToken } from '../../testutils/portal-token-generator';
import { initializeKeys } from '../../testutils/token-generator';

jest.mock('../../config');

const mockLoadConfig = config.loadConfig as jest.MockedFunction<typeof config.loadConfig>;

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
    });

    it('should return payment state as unpaid when payment config is set', async () => {
      mockLoadConfig.mockReturnValue({
        portal: {
          payment: {
            stripe: {
              sk: 'test_secret_key',
            },
          },
        },
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
          state: 'unpaid',
        },
      });
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
