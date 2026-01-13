// eslint-disable-next-line @typescript-eslint/naming-convention
import Stripe from 'stripe';
import { DecodingError } from '../../../utils/errors';

export async function findPriceByItemId(
  stripe: Stripe,
  itemId: string
): Promise<string> {
  // Search for active products with matching item_id metadata
  const searchResults = await stripe.products.search({
    query: `active:'true' AND metadata['item_id']:'${itemId}'`,
  });

  // If no products found, throw error
  if (searchResults.data.length === 0) {
    throw new DecodingError('No product found for item');
  }

  // If multiple products found, warn and return first
  if (searchResults.data.length > 1) {
    // eslint-disable-next-line no-console
    console.warn(`Multiple products found for item_id ${itemId}, using first one`);
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const product = searchResults.data[0]!;

  // Check that product has a default_price set
  if (product.default_price === null || product.default_price === undefined) {
    throw new DecodingError('Product has no default price configured');
  }

  // default_price can be string (ID) or Price object - handle both
  return typeof product.default_price === 'string'
    ? product.default_price
    : product.default_price.id;
}
