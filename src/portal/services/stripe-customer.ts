// eslint-disable-next-line @typescript-eslint/naming-convention
import Stripe from 'stripe';

export async function findOrCreateCustomer(
  stripe: Stripe,
  userId: string,
  name: string,
  email: string
): Promise<string> {
  // Use list() with email filter instead of search() because search() uses an index
  // that can take 10-30 seconds to update, causing duplicate customers on rapid calls
  const listResults = await stripe.customers.list({
    email,
    limit: 100,
  });

  // Filter by user_id in the metadata
  const matchingCustomers = listResults.data.filter(c => c.metadata.user_id === userId);

  // If customers found, return the first one
  if (matchingCustomers.length > 0) {
    if (matchingCustomers.length > 1) {
      // eslint-disable-next-line no-console
      console.warn(`Multiple customers found for user_id ${userId}, using first one`);
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return matchingCustomers[0]!.id;
  }

  // No customer found, create a new one
  const customer = await stripe.customers.create({
    name,
    email,
    metadata: {
      user_id: userId,
    },
  });

  return customer.id;
}
