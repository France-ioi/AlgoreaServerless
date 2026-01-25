import { HandlerFunction } from 'lambda-api';
import { loadConfig } from '../../config';
import { RequestWithPortalToken } from '../token';
import { getStripeClient } from '../../stripe';
import { findOrCreateCustomer } from '../lib/stripe/customer';
import { hasPaidInvoice } from '../lib/stripe/invoice';

async function get(req: RequestWithPortalToken): Promise<{ payment: { state: string } }> {
  const { portalToken } = req;

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
      portalToken.userId,
      `${portalToken.firstname} ${portalToken.lastname}`,
      portalToken.email
    );

    // Check if customer has paid invoice for this item
    const isPaid = await hasPaidInvoice(stripe, customerId, portalToken.itemId);

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

export const getEntryState = get as unknown as HandlerFunction;
