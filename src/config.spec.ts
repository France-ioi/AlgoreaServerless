import { loadConfig } from './config';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('fs');

const mockReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>;

describe('Config', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
  });
});
