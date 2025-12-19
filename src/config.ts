import { z } from 'zod';
import { readFileSync } from 'fs';
import { join } from 'path';

const portalPaymentConfigSchema = z.object({
  stripe: z.object({
    sk: z.string(),
  }),
});

const configSchema = z.object({
  portal: z.object({
    payment: portalPaymentConfigSchema.optional(),
  }).optional(),
});

export type PortalPaymentConfig = z.infer<typeof portalPaymentConfigSchema>;
export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  try {
    const configPath = join(process.cwd(), 'config.json');
    const configFile = readFileSync(configPath, 'utf-8');
    const configData = JSON.parse(configFile) as unknown;
    return configSchema.parse(configData);
  } catch (error) {
    // Return empty config if file doesn't exist or is invalid
    // eslint-disable-next-line no-console
    console.error('Failed to load config.json:', error);
    return {};
  }
}
