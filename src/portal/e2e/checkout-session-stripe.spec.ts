import { mockALBEvent } from '../../testutils/event-mocks';
import { globalHandler } from '../../handlers';
import { generatePortalToken } from '../../testutils/portal-token-generator';
import { initializeKeys } from '../../testutils/token-generator';
import { loadConfig } from '../../config';
// eslint-disable-next-line @typescript-eslint/naming-convention
import Stripe from 'stripe';

// NOTE: This test file requires STAGE=e2e-test to load config.e2e-test.json with actual Stripe API key
// It also requires a static product+price in Stripe with metadata.item_id = "test-premium-access-001"
// Skip this test if e2e environment is not configured

const isE2eConfigured = (): boolean => {
  try {
    process.env.STAGE = 'e2e-test';
    const config = loadConfig();
    return !!config.portal?.payment?.stripe?.sk;
  } catch {
    return false;
  }
};

const describeOrSkip = isE2eConfigured() ? describe : describe.skip;

describeOrSkip('E2E: Portal Checkout Session with Real Stripe API', () => {
  let stripe: Stripe;
  const testItemId = 'test-premium-access-001'; // Static product+price created in Stripe

  beforeAll(async () => {
    await initializeKeys();

    // Set STAGE to e2e-test to load config.e2e-test.json
    process.env.STAGE = 'e2e-test';

    // Load Stripe key from config (will load config.e2e-test.json due to STAGE env var)
    const config = loadConfig();
    const stripeKey = config.portal?.payment?.stripe?.sk;

    if (!stripeKey) {
      throw new Error('Stripe secret key not found in config.json. Please configure portal.payment.stripe.sk');
    }

    // Initialize Stripe client with the key from config
    stripe = new Stripe(stripeKey, {
      apiVersion: '2025-12-15.clover',
    });
  });

  it('should create checkout session with real Stripe API', async () => {
    const testEmail = `e2e-checkout-${Date.now()}@example.com`;
    const uniqueUserId = `e2e-checkout-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    let customerId: string | undefined;
    let sessionId: string | undefined;

    try {
      // Verify the static product exists - skip test if not configured
      const products = await stripe.products.search({
        query: `active:'true' AND metadata['item_id']:'${testItemId}'`,
      });

      if (products.data.length === 0) {
        console.log(
          `Skipping test: Static test product not found. Please create a product+price in Stripe with metadata.item_id = "${testItemId}"`
        );
        return; // Skip this test
      }

      // === STEP 1: Create checkout session ===
      const token = await generatePortalToken({
        itemId: testItemId,
        userId: uniqueUserId,
        firstname: 'E2E',
        lastname: 'Checkout',
        email: testEmail,
      });

      const event = mockALBEvent({
        path: '/sls/portal/checkout-session',
        httpMethod: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          return_url: 'https://example.com/return',
        }),
      });

      const result = await globalHandler(event, {} as any) as any;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toHaveProperty('client_secret');
      expect(body.client_secret).toMatch(/^cs_test_/);

      // Extract session ID from client_secret (format: cs_test_xxx)
      const clientSecret = body.client_secret as string;
      sessionId = clientSecret.split('_secret_')[0];

      // === STEP 2: Verify checkout session was created correctly ===
      if (sessionId) {
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        // Verify session properties
        expect(session.mode).toBe('payment');
        expect(session.ui_mode).toBe('embedded');
        expect(session.return_url).toBe('https://example.com/return');
        expect(session.automatic_tax?.enabled).toBe(true);
        expect(session.billing_address_collection).toBe('required');
        expect(session.tax_id_collection?.enabled).toBe(true);
        expect(session.allow_promotion_codes).toBe(false);
        expect(session.invoice_creation?.enabled).toBe(true);
        expect(session.invoice_creation?.invoice_data?.metadata?.item_id).toBe(testItemId);

        // Verify line items
        const lineItems = await stripe.checkout.sessions.listLineItems(sessionId);
        expect(lineItems.data.length).toBe(1);
        expect(lineItems.data[0]?.quantity).toBe(1);

        // Get customer ID for cleanup
        customerId = session.customer as string;
      }

      // === STEP 3: Verify customer is the expected one ===
      if (customerId) {
        const customer = await stripe.customers.retrieve(customerId);
        if (customer.deleted) {
          throw new Error('Customer was deleted');
        }
        expect(customer.email).toBe(testEmail);
        expect(customer.name).toBe('E2E Checkout');
        expect(customer.metadata?.user_id).toBe(uniqueUserId);
      }

    } finally {
      // === CLEANUP ===
      // Note: Checkout sessions expire automatically, but we clean up the customer
      if (customerId) {
        try {
          await stripe.customers.del(customerId);
        } catch (error) {
          // Ignore errors during cleanup
        }
      }
    }
  }, 30000);

});
