// eslint-disable-next-line @typescript-eslint/naming-convention
import Stripe from 'stripe';

export async function hasPaidInvoice(
  stripe: Stripe,
  customerId: string,
  itemId: string
): Promise<boolean> {
  // Use list() with customer and status filter instead of search() because search() uses an index
  // that can take 10-30 seconds to update, causing incorrect results on rapid calls
  const listResults = await stripe.invoices.list({
    customer: customerId,
    status: 'paid',
    limit: 100,
  });

  // Filter by item_id in the metadata
  const matchingInvoices = listResults.data.filter(invoice => invoice.metadata?.item_id === itemId);

  if (matchingInvoices.length === 0) {
    return false;
  }

  if (matchingInvoices.length > 1) {
    // eslint-disable-next-line no-console
    console.warn(`Multiple paid invoices found for customer ${customerId} and item ${itemId}`);
  }

  return true;
}
