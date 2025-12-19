// eslint-disable-next-line @typescript-eslint/naming-convention
import Stripe from 'stripe';
import { loadConfig } from './config';

export function getStripeClient(): Stripe | null {
  const config = loadConfig();
  const stripeKey = config.portal?.payment?.stripe?.sk;

  if (!stripeKey) {
    return null;
  }

  return new Stripe(stripeKey, {
    apiVersion: '2025-12-15.clover',
  });
}
