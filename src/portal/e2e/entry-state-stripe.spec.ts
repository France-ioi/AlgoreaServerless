import { mockALBEvent } from '../../testutils/event-mocks';
import { globalHandler } from '../../handlers';
import { generatePortalToken } from '../../testutils/portal-token-generator';
import { initializeKeys } from '../../testutils/token-generator';
import { loadConfig } from '../../config';
// eslint-disable-next-line @typescript-eslint/naming-convention
import Stripe from 'stripe';

// NOTE: This test file does NOT mock config - it uses real config.json with actual Stripe API

describe('E2E: Portal Entry State with Real Stripe API', () => {
  let stripe: Stripe;

  beforeAll(async () => {
    await initializeKeys();

    // Load Stripe key from config.json
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

  it('should create customer, handle invoice states, and return correct payment status', async () => {
    const testEmail = 'e2e-stripe-test@example.com';
    const uniqueUserId = `e2e-test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const itemId = 'e2e-test-item';
    let customerId: string | undefined;
    const invoiceIds: string[] = [];

    try {
      // === CLEANUP: Remove existing customers and invoices ===
      const existingCustomers = await stripe.customers.list({ email: testEmail, limit: 100 });
      for (const customer of existingCustomers.data) {
        // Simply delete the customer - this will also delete all associated invoices
        await stripe.customers.del(customer.id);
      }

      // Wait a bit for Stripe to process deletions
      await new Promise(resolve => setTimeout(resolve, 1000));

      // === STEP 1: First call - CREATE customer, no invoice yet ===
      const token1 = await generatePortalToken({
        itemId,
        userId: uniqueUserId,
        firstname: 'E2E',
        lastname: 'Test',
        email: testEmail,
      });

      const event1 = mockALBEvent({
        path: '/sls/portal/entry-state',
        httpMethod: 'GET',
        headers: {
          authorization: `Bearer ${token1}`,
        },
        body: null,
      });

      const result1 = await globalHandler(event1, {} as any) as any;
      expect(result1.statusCode).toBe(200);
      const body1 = JSON.parse(result1.body);
      expect(body1).toEqual({
        payment: {
          state: 'unpaid',
        },
      });

      // Verify customer was created
      const customersAfterFirst = await stripe.customers.list({ email: testEmail, limit: 100 });
      expect(customersAfterFirst.data.length).toBe(1);
      customerId = customersAfterFirst.data[0]?.id;
      expect(customerId).toBeDefined();

      // === STEP 2: Second call with DIFFERENT item - should REUSE customer ===
      const token2 = await generatePortalToken({
        itemId: 'item-B',
        userId: uniqueUserId,
        firstname: 'E2E',
        lastname: 'Test',
        email: testEmail,
      });

      const event2 = mockALBEvent({
        path: '/sls/portal/entry-state',
        httpMethod: 'GET',
        headers: {
          authorization: `Bearer ${token2}`,
        },
        body: null,
      });

      const result2 = await globalHandler(event2, {} as any) as any;
      expect(result2.statusCode).toBe(200);
      const body2 = JSON.parse(result2.body);
      expect(body2.payment.state).toBe('unpaid');

      // Verify still same customer
      const customersAfterSecond = await stripe.customers.list({ email: testEmail, limit: 100 });
      expect(customersAfterSecond.data.length).toBe(1);
      expect(customersAfterSecond.data[0]?.id).toBe(customerId);

      // === STEP 3: Create DRAFT invoice with item_id metadata ===
      if (!customerId) throw new Error('Customer ID not found');

      const draftInvoice = await stripe.invoices.create({
        customer: customerId,
        metadata: {
          item_id: itemId,
        },
        collection_method: 'send_invoice',
        days_until_due: 30,
      });
      invoiceIds.push(draftInvoice.id);

      // Check service still returns "unpaid" (draft invoice doesn't count)
      const result3 = await globalHandler(event1, {} as any) as any;
      expect(result3.statusCode).toBe(200);
      const body3 = JSON.parse(result3.body);
      expect(body3.payment.state).toBe('unpaid');

      // === STEP 4: Finalize and PAY the invoice ===
      const finalizedInvoice = await stripe.invoices.finalizeInvoice(draftInvoice.id);
      try {
        await stripe.invoices.pay(finalizedInvoice.id, {
          paid_out_of_band: true, // Mark as paid without actual payment
        });
      } catch (error: any) {
        // If invoice is already paid (from previous run), that's okay
        if (!error.message?.includes('already paid')) {
          throw error;
        }
      }

      // Check service now returns "paid"
      const result4 = await globalHandler(event1, {} as any) as any;
      expect(result4.statusCode).toBe(200);
      const body4 = JSON.parse(result4.body);
      expect(body4.payment.state).toBe('paid');

      // === STEP 5: Change item_id in invoice metadata to different item ===
      await stripe.invoices.update(finalizedInvoice.id, {
        metadata: {
          item_id: 'different-item-id',
        },
      });

      // Check service returns "unpaid" (invoice is for different item)
      const result5 = await globalHandler(event1, {} as any) as any;
      expect(result5.statusCode).toBe(200);
      const body5 = JSON.parse(result5.body);
      expect(body5.payment.state).toBe('unpaid');

      // === STEP 6: Restore item_id and verify "paid" again ===
      await stripe.invoices.update(finalizedInvoice.id, {
        metadata: {
          item_id: itemId,
        },
      });

      const result6 = await globalHandler(event1, {} as any) as any;
      expect(result6.statusCode).toBe(200);
      const body6 = JSON.parse(result6.body);
      expect(body6.payment.state).toBe('paid');

    } finally {
      // === CLEANUP ===
      // Delete invoices first (draft invoices can be deleted, finalized ones cannot)
      for (const invoiceId of invoiceIds) {
        try {
          const invoice = await stripe.invoices.retrieve(invoiceId);
          if (invoice.status === 'draft') {
            await stripe.invoices.del(invoiceId);
          }
          // Note: Finalized/paid invoices cannot be deleted via API
          // They remain in Stripe but are disassociated when customer is deleted
        } catch (error) {
          // Ignore errors during cleanup
        }
      }

      // Delete customer
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
