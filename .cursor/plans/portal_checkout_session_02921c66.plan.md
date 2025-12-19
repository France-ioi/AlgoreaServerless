---
name: Portal Checkout Session
overview: Implement POST /portal/checkout-session endpoint to create Stripe checkout sessions with automatic tax, invoice creation, and price lookup by item_id metadata.
todos:
  - id: create-price-service
    content: Create stripe-price.ts service to search prices by item_id metadata
    status: completed
  - id: create-checkout-service
    content: Create checkout-session.ts service to create Stripe checkout sessions
    status: completed
  - id: create-handler
    content: Create checkout-session-handler.ts to handle POST requests with validation
    status: completed
  - id: register-route
    content: Add POST /checkout-session route in portal routes.ts
    status: completed
  - id: unit-tests-price
    content: Write unit tests for stripe-price.spec.ts (4-5 tests)
    status: completed
  - id: unit-tests-checkout
    content: Write unit tests for checkout-session.spec.ts (4-5 tests)
    status: completed
  - id: unit-tests-handler
    content: Write unit tests for checkout-session-handler.spec.ts (6-8 tests)
    status: completed
  - id: e2e-tests
    content: Write e2e tests in checkout-session.spec.ts (7-8 tests)
    status: completed
  - id: update-architecture
    content: Update ARCHITECTURE.md with Part 7 checkout session documentation
    status: completed
---

# Portal Part 7: Checkout Session Service

## Overview

Create a new REST endpoint `POST /portal/checkout-session` that allows authenticated users to initiate a payment flow via Stripe Checkout. The service will find or create a customer, locate the appropriate price, and generate a checkout session with comprehensive payment settings.

## Architecture

The checkout session service follows the same patterns as the existing entry-state service:

```
POST /portal/checkout-session
  ↓
Extract JWT token (item_id, user_id, name, email)
  ↓
Validate payment configuration
  ↓
Find or create Stripe customer (reuse existing service)
  ↓
Search for price with matching item_id metadata
  ↓
Create Stripe checkout session
  ↓
Return { client_secret }
```

## Implementation Files

### 1. Price Search Service

**File**: [`src/portal/services/stripe-price.ts`](src/portal/services/stripe-price.ts)

Create a new service to search for Stripe prices by item_id metadata:

- **Function**: `findPriceByItemId(stripe, itemId): Promise<string>`
- **Behavior**:
  - Use `stripe.prices.list()` with active filter
  - Filter by `metadata.item_id` matching the token's itemId
  - If 0 results: throw `DecodingError` with message "No price found for item"
  - If 1 result: return price ID
  - If >1 results: log warning and return first price ID
- **Error Handling**: Let Stripe errors propagate (handled by caller)
- **Pattern**: Similar to `findOrCreateCustomer` and `hasPaidInvoice`

### 2. Checkout Session Service

**File**: [`src/portal/services/checkout-session.ts`](src/portal/services/checkout-session.ts)

Create the main service to orchestrate checkout session creation:

- **Function**: `createCheckoutSession(stripe, customerId, priceId, itemId, returnUrl): Promise<string>`
- **Parameters**:
  - `stripe`: Stripe client instance
  - `customerId`: Customer ID (from findOrCreateCustomer)
  - `priceId`: Price ID (from findPriceByItemId)
  - `itemId`: Item ID for invoice metadata
  - `returnUrl`: Return URL from request body
- **Checkout Session Config**:
  ```typescript
  {
    automatic_tax: { enabled: true },
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'payment',
    return_url: returnUrl,
    ui_mode: 'custom',
    allow_promotion_codes: false,
    billing_address_collection: 'required',
    invoice_creation: {
      enabled: true,
      invoice_data: {
        metadata: { item_id: itemId }
      }
    },
    tax_id_collection: { enabled: 'if_supported' }
  }
  ```

- **Returns**: `client_secret` from the checkout session
- **Error Handling**: Let Stripe errors propagate

### 3. Route Handler

**File**: [`src/portal/services/checkout-session-handler.ts`](src/portal/services/checkout-session-handler.ts)

Create the HTTP handler for the checkout session endpoint:

- **Request Validation**:
  - Extract and validate JWT token (using `extractTokenFromHttp`)
  - Parse body with Zod schema: `{ return_url: string }`
  - Validate returnUrl is a non-empty string
- **Payment Configuration Check**:
  - Load config and check `portal.payment` exists
  - Get Stripe client, throw error if null
- **Orchestration**:
  - Find or create customer (reuse `findOrCreateCustomer`)
  - Find price by item_id (use new `findPriceByItemId`)
  - Create checkout session (use new `createCheckoutSession`)
- **Response**: `{ client_secret: string }`
- **Error Handling**:
  - `DecodingError` for missing price → 400 with identifiable error code
  - Stripe errors → 500 with generic message (log details)
  - Configuration errors → 500

### 4. Routes Registration

**File**: [`src/portal/routes.ts`](src/portal/routes.ts)

Add the new POST route:

```typescript
api.post('/checkout-session', createCheckoutSessionHandler);
```

## Testing Strategy

### Unit Tests

**File**: [`src/portal/services/stripe-price.spec.ts`](src/portal/services/stripe-price.spec.ts)

- Test finding single price by item_id
- Test error when no price found (should throw DecodingError)
- Test warning when multiple prices found
- Test Stripe API error handling
- **Estimated**: 4-5 tests

**File**: [`src/portal/services/checkout-session.spec.ts`](src/portal/services/checkout-session.spec.ts)

- Test successful checkout session creation
- Test all parameters passed correctly to Stripe
- Test client_secret extraction and return
- Test Stripe API error handling
- **Estimated**: 4-5 tests

**File**: [`src/portal/services/checkout-session-handler.spec.ts`](src/portal/services/checkout-session-handler.spec.ts)

- Test successful flow with valid token and return_url
- Test missing return_url in body (DecodingError)
- Test invalid token (AuthenticationError)
- Test missing payment configuration (ServerError or appropriate error)
- Test price not found (DecodingError with specific message)
- Test Stripe errors handled gracefully
- **Estimated**: 6-8 tests

### E2E Tests

**File**: [`src/portal/e2e/checkout-session.spec.ts`](src/portal/e2e/checkout-session.spec.ts)

Create comprehensive e2e tests using the global handler:

#### Test Setup

- Create static product+price in Stripe with `metadata.item_id = "test-premium-access-001"`
- Use this item_id for all e2e tests
- Mock config with valid Stripe secret key

#### Test Cases

1. **Successful checkout session creation**

   - POST with valid token (item_id: "test-premium-access-001") and return_url
   - Verify 200 response with client_secret
   - Verify client_secret format (starts with "cs_test_")

2. **Missing return_url**

   - POST with valid token but no body or missing return_url
   - Verify 400 error response

3. **Invalid item_id (no price found)**

   - POST with valid token but item_id: "nonexistent-item"
   - Verify 400 error with identifiable error code/message

4. **Missing authorization header**

   - POST without token
   - Verify 401 error

5. **Invalid token**

   - POST with malformed token
   - Verify 401 error

6. **Payment not configured**

   - Mock config with no portal.payment
   - Verify appropriate error response

7. **CORS preflight**

   - OPTIONS request to /checkout-session
   - Verify 200 with CORS headers

**Estimated**: 7-8 e2e tests

## Error Response Design

For the "no price found" error, use a clear error structure:

```typescript
{
  error: "Price not found",
  code: "PRICE_NOT_FOUND",
  message: "No price configuration found for this item"
}
```

This makes it easily identifiable by frontend code.

## Key Implementation Notes

1. **Reuse Existing Services**: Use `findOrCreateCustomer` from stripe-customer.ts - no duplication
2. **Error Propagation**: Let Stripe errors bubble up, catch and log in the handler
3. **Zod Validation**: Validate request body structure with clear error messages
4. **Console Logging**: Log warnings for multiple prices, errors for Stripe failures
5. **Type Safety**: Return types for all functions, strict TypeScript
6. **Pattern Consistency**: Follow the same patterns as entry-state service
7. **File Size**: Keep each service file under 100 lines (well under 300 limit)

## Static Test Data Setup

Before running e2e tests, manually create in Stripe:

1. **Product**: "Test Premium Access"

   - Description: "Static test product for e2e tests - DO NOT DELETE"

2. **Price**: Attach to above product

   - Amount: $10.00 (or any test amount)
   - Currency: USD
   - Metadata: `{ "item_id": "test-premium-access-001" }`
   - Active: true

## Dependencies

All required dependencies already installed:

- `stripe` SDK (API version 2025-12-15.clover)
- `zod` for validation
- Existing portal infrastructure (token parsing, config, etc.)

## Testing Commands

```bash
# Run all portal tests
npm test -- src/portal

# Run specific test file
npm test -- src/portal/services/stripe-price.spec.ts

# Run e2e tests only
npm test -- src/portal/e2e
```