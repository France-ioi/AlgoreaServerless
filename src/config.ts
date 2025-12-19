import { z } from 'zod';
import { readFileSync } from 'fs';
import { join } from 'path';

const portalPaymentConfigSchema = z.object({
  stripe: z.object({
    sk: z.string(),
  }),
});

const configSchema = z.looseObject({
  portal: z.looseObject({
    payment: portalPaymentConfigSchema.optional(),
  }).optional(),
});

export type PortalPaymentConfig = z.infer<typeof portalPaymentConfigSchema>;
export type Config = z.infer<typeof configSchema>;

function deepMerge(base: unknown, override: unknown): unknown {
  if (override === null || override === undefined) return base;
  if (base === null || base === undefined) return override;

  // Handle non-object types
  if (typeof base !== 'object' || typeof override !== 'object') {
    return override;
  }

  if (base === null || override === null) {
    return override;
  }

  const result: Record<string, unknown> = { ...base as Record<string, unknown> };
  const overrideObj = override as Record<string, unknown>;

  for (const key in overrideObj) {
    if (Object.prototype.hasOwnProperty.call(overrideObj, key)) {
      const overrideValue = overrideObj[key];
      if (overrideValue !== null && typeof overrideValue === 'object' && !Array.isArray(overrideValue)) {
        result[key] = deepMerge(result[key], overrideValue);
      } else {
        result[key] = overrideValue;
      }
    }
  }

  return result;
}

export function loadConfig(): Config {
  try {
    // Load base config.json
    const baseConfigPath = join(process.cwd(), 'config.json');
    const baseConfigFile = readFileSync(baseConfigPath, 'utf-8');
    let configData = JSON.parse(baseConfigFile) as unknown;

    // Load stage-specific config if STAGE env var is set
    const stage = process.env.STAGE;
    if (stage) {
      try {
        const stageConfigPath = join(process.cwd(), `config.${stage}.json`);
        const stageConfigFile = readFileSync(stageConfigPath, 'utf-8');
        const stageConfigData = JSON.parse(stageConfigFile) as unknown;

        // Deep merge stage config over base config
        configData = deepMerge(configData, stageConfigData);
      } catch (stageError) {
        // Stage config file doesn't exist or is invalid - continue with base config
        // eslint-disable-next-line no-console
        console.warn(`No config.${stage}.json found or invalid, using base config only`);
      }
    }

    const parsedConfig = configSchema.parse(configData);

    // Override Stripe secret key from environment variable if present
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (stripeSecretKey) {
      if (!parsedConfig.portal) {
        parsedConfig.portal = {};
      }
      if (!parsedConfig.portal.payment) {
        parsedConfig.portal.payment = { stripe: { sk: stripeSecretKey } };
      } else {
        parsedConfig.portal.payment = {
          ...parsedConfig.portal.payment,
          stripe: { sk: stripeSecretKey },
        };
      }
    }

    return parsedConfig;
  } catch (error) {
    // Return empty config if file doesn't exist or is invalid
    // eslint-disable-next-line no-console
    console.error('Failed to load config.json:', error);
    return {};
  }
}
