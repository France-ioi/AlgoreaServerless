import { HandlerFunction, Request } from 'lambda-api';
import { loadConfig } from '../../config';
import { extractTokenFromHttp } from '../token';

async function get(req: Request): Promise<{ payment: { state: string } }> {
  // Extract and validate token
  await extractTokenFromHttp(req.headers);

  // Token is now validated (will be used in Part 6 for Stripe)
  const config = loadConfig();
  const paymentState = config.portal?.payment ? 'unpaid' : 'disabled';

  return {
    payment: {
      state: paymentState,
    },
  };
}

export const getEntryState: HandlerFunction = get;
