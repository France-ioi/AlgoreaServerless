import { HandlerFunction, Request } from 'lambda-api';
import { z } from 'zod';
import { loadConfig } from '../../config';
import { extractTokenFromHttp } from '../token';
import { getStripeClient } from '../../stripe';
import { findOrCreateCustomer } from './stripe-customer';
import { findPriceByItemId } from './stripe-price';
import { createCheckoutSession as createStripeCheckoutSession } from './checkout-session';
import { DecodingError, ServerError } from '../../utils/errors';

const requestBodySchema = z.object({
  return_url: z.string().min(1),
});

async function post(req: Request): Promise<{ client_secret: string }> {
  // Extract and validate token
  const token = await extractTokenFromHttp(req.headers);

  // Validate request body
  const bodyResult = requestBodySchema.safeParse(req.body);
  if (!bodyResult.success) {
    throw new DecodingError('Missing or invalid return_url in request body');
  }
  const { return_url: returnUrl } = bodyResult.data;

  // Check if payment is configured
  const config = loadConfig();
  if (!config.portal?.payment) {
    throw new ServerError('Payment is not configured');
  }

  // Get Stripe client
  const stripe = getStripeClient();
  if (!stripe) {
    throw new ServerError('Stripe client is not available');
  }

  try {
    // Find or create customer and find price in parallel
    const [ customerId, priceId ] = await Promise.all([
      findOrCreateCustomer(
        stripe,
        token.userId,
        `${token.firstname} ${token.lastname}`,
        token.email
      ),
      findPriceByItemId(stripe, token.itemId),
    ]);

    // Create checkout session
    const clientSecret = await createStripeCheckoutSession(
      stripe,
      customerId,
      priceId,
      token.itemId,
      returnUrl
    );

    return {
      client_secret: clientSecret,
    };
  } catch (error) {
    // Re-throw DecodingError (e.g., price not found) - will be handled as 400
    if (error instanceof DecodingError) {
      throw error;
    }

    // Log and wrap other Stripe errors
    // eslint-disable-next-line no-console
    console.error('Error creating checkout session with Stripe:', error);
    throw new ServerError('Failed to create checkout session');
  }
}

export const createCheckoutSession: HandlerFunction = post;

