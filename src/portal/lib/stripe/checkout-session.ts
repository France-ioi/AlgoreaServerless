// eslint-disable-next-line @typescript-eslint/naming-convention
import Stripe from 'stripe';

export async function createCheckoutSession(
  stripe: Stripe,
  customerId: string,
  priceId: string,
  itemId: string,
  returnUrl: string
): Promise<string> {
  const session = await stripe.checkout.sessions.create({
    automatic_tax: {
      enabled: true,
    },
    customer: customerId,
    customer_update: {
      address: 'auto',
      name: 'auto',
    },
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    mode: 'payment',
    return_url: returnUrl,
    ui_mode: 'embedded',
    allow_promotion_codes: false,
    billing_address_collection: 'required',
    invoice_creation: {
      enabled: true,
      invoice_data: {
        metadata: {
          item_id: itemId,
        },
      },
    },
    tax_id_collection: {
      enabled: true,
      required: 'if_supported',
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return session.client_secret!;
}
