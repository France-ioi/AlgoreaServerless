import { loadConfig } from './config';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('fs');

const mockReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>;

describe('Config', () => {
  const originalStage = process.env.STAGE;
  const originalStripeKey = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.STAGE;
    delete process.env.STRIPE_SECRET_KEY;
  });

  afterEach(() => {
    process.env.STAGE = originalStage;
    process.env.STRIPE_SECRET_KEY = originalStripeKey;
  });

  describe('loadConfig', () => {
    it('should load valid config with payment enabled', () => {
      const configData = {
        portal: {
          payment: {
            stripe: {
              sk: 'test_secret_key',
            },
          },
        },
      };
      mockReadFileSync.mockReturnValue(JSON.stringify(configData));

      const config = loadConfig();

      expect(mockReadFileSync).toHaveBeenCalledWith(
        join(process.cwd(), 'config.json'),
        'utf-8'
      );
      expect(config).toEqual(configData);
      expect(config.portal?.payment?.stripe.sk).toBe('test_secret_key');
    });

    it('should load config with payment disabled', () => {
      const configData = {
        portal: {},
      };
      mockReadFileSync.mockReturnValue(JSON.stringify(configData));

      const config = loadConfig();

      expect(config).toEqual(configData);
      expect(config.portal?.payment).toBeUndefined();
    });

    it('should return empty config when file does not exist', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const config = loadConfig();

      expect(config).toEqual({});
    });

    it('should return empty config when JSON is invalid', () => {
      mockReadFileSync.mockReturnValue('invalid json {');

      const config = loadConfig();

      expect(config).toEqual({});
    });

    it('should return empty config when schema validation fails', () => {
      const configData = {
        portal: {
          payment: {
            stripe: {
              sk: 123, // Invalid: should be string
            },
          },
        },
      };
      mockReadFileSync.mockReturnValue(JSON.stringify(configData));

      const config = loadConfig();

      expect(config).toEqual({});
    });

    it('should load and merge stage-specific config when STAGE is set', () => {
      process.env.STAGE = 'e2e-test';

      const baseConfig = {
        portal: {
          payment: {
            stripe: {
              sk: 'base_key',
            },
          },
        },
      };

      const stageConfig = {
        portal: {
          payment: {
            stripe: {
              sk: 'e2e_test_key',
            },
          },
        },
      };

      mockReadFileSync
        .mockReturnValueOnce(JSON.stringify(baseConfig)) // First call: config.json
        .mockReturnValueOnce(JSON.stringify(stageConfig)); // Second call: config.e2e-test.json

      const config = loadConfig();

      expect(mockReadFileSync).toHaveBeenCalledTimes(2);
      expect(mockReadFileSync).toHaveBeenNthCalledWith(1, join(process.cwd(), 'config.json'), 'utf-8');
      expect(mockReadFileSync).toHaveBeenNthCalledWith(2, join(process.cwd(), 'config.e2e-test.json'), 'utf-8');
      expect(config.portal?.payment?.stripe.sk).toBe('e2e_test_key');
    });

    it('should use base config only when stage config does not exist', () => {
      process.env.STAGE = 'production';

      const baseConfig = {
        portal: {
          payment: {
            stripe: {
              sk: 'base_key',
            },
          },
        },
      };

      mockReadFileSync
        .mockReturnValueOnce(JSON.stringify(baseConfig)) // First call: config.json
        .mockImplementationOnce(() => { // Second call: config.production.json (not found)
          throw new Error('ENOENT: no such file or directory');
        });

      const config = loadConfig();

      expect(config.portal?.payment?.stripe.sk).toBe('base_key');
    });

    it('should deep merge nested properties from stage config', () => {
      process.env.STAGE = 'dev';

      const baseConfig = {
        portal: {
          payment: {
            stripe: {
              sk: 'base_key',
            },
          },
        },
      };

      const stageConfig = {
        portal: {
          otherSetting: 'value',
        },
      };

      mockReadFileSync
        .mockReturnValueOnce(JSON.stringify(baseConfig))
        .mockReturnValueOnce(JSON.stringify(stageConfig));

      const config = loadConfig();

      expect(config.portal?.payment?.stripe.sk).toBe('base_key');
      expect((config.portal as any)?.otherSetting).toBe('value');
    });

    it('should override Stripe secret key from STRIPE_SECRET_KEY env var', () => {
      const baseConfig = {
        portal: {
          payment: {
            stripe: {
              sk: 'config_key',
            },
          },
        },
      };

      mockReadFileSync.mockReturnValue(JSON.stringify(baseConfig));
      process.env.STRIPE_SECRET_KEY = 'env_var_key';

      const config = loadConfig();

      expect(config.portal?.payment?.stripe.sk).toBe('env_var_key');
    });

    it('should create config structure if STRIPE_SECRET_KEY is set but no config exists', () => {
      mockReadFileSync.mockReturnValue('{}');
      process.env.STRIPE_SECRET_KEY = 'env_var_key';

      const config = loadConfig();

      expect(config.portal?.payment?.stripe.sk).toBe('env_var_key');
    });

    it('should prioritize STRIPE_SECRET_KEY env var over stage config', () => {
      process.env.STAGE = 'e2e-test';
      process.env.STRIPE_SECRET_KEY = 'env_var_key';

      const baseConfig = {
        portal: {
          payment: {
            stripe: {
              sk: 'base_key',
            },
          },
        },
      };

      const stageConfig = {
        portal: {
          payment: {
            stripe: {
              sk: 'stage_key',
            },
          },
        },
      };

      mockReadFileSync
        .mockReturnValueOnce(JSON.stringify(baseConfig))
        .mockReturnValueOnce(JSON.stringify(stageConfig));

      const config = loadConfig();

      expect(config.portal?.payment?.stripe.sk).toBe('env_var_key');
    });
  });
});
