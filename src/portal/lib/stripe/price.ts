// eslint-disable-next-line @typescript-eslint/naming-convention
import Stripe from 'stripe';
import { DecodingError } from '../../../utils/errors';

export async function findPriceByItemId(
  stripe: Stripe,
  itemId: string
): Promise<string> {
  // Use search API with metadata filter
  const searchResults = await stripe.prices.search({
    query: `active:'true' AND metadata['item_id']:'${itemId}'`,
  });

  // If no prices found, throw error
  if (searchResults.data.length === 0) {
    throw new DecodingError('No price found for item');
  }

  // If multiple prices found, warn and return first
  if (searchResults.data.length > 1) {
    // eslint-disable-next-line no-console
    console.warn(`Multiple prices found for item_id ${itemId}, using first one`);
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return searchResults.data[0]!.id;
}
