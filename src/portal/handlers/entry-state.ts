import { HandlerFunction, Request } from 'lambda-api';
import { loadConfig } from '../../config';
import { extractTokenFromHttp } from '../token';
import { getStripeClient } from '../../stripe';
import { findOrCreateCustomer } from '../lib/stripe/customer';
import { hasPaidInvoice } from '../lib/stripe/invoice';

async function get(req: Request): Promise<{ payment: { state: string } }> {
  // Extract and validate token
  const token = await extractTokenFromHttp(req.headers);

  // Check if payment is configured
  const config = loadConfig();
  if (!config.portal?.payment) {
    return {
      payment: {
        state: 'disabled',
      },
    };
  }

  // Get Stripe client
  const stripe = getStripeClient();
  if (!stripe) {
    return {
      payment: {
        state: 'disabled',
      },
    };
  }

  try {
    // Find or create customer
    const customerId = await findOrCreateCustomer(
      stripe,
      token.userId,
      `${token.firstname} ${token.lastname}`,
      token.email
    );

    // Check if customer has paid invoice for this item
    const isPaid = await hasPaidInvoice(stripe, customerId, token.itemId);

    return {
      payment: {
        state: isPaid ? 'paid' : 'unpaid',
      },
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error checking payment status with Stripe:', error);
    // Return unpaid on error to be safe
    return {
      payment: {
        state: 'unpaid',
      },
    };
  }
}

export const getEntryState: HandlerFunction = get;
