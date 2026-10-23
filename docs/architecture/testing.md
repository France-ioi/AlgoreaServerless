# Testing

## Commands

| Command | Runs |
|---------|------|
| `npm test` | everything |
| `npm run test:unit` | everything except `e2e` paths |
| `npm run test:e2e` | `e2e` paths only |
| `npm run test:db` | `dbmodels` paths |
| `npm run test:e2e-stripe` | Stripe e2e (`STAGE=e2e-test`, needs a Stripe test key) |
| `npm test -- path/to/file.spec.ts` | one file |

CI runs unit, e2e (with the `stripe-tests` context) and lint as separate jobs ([deploy.md](deploy.md)).

## Infrastructure

- Jest with `ts-jest`, Node environment, V8 coverage, 30 s default timeout; files matching `*.spec.ts` / `*.test.ts`.
- `jest.setup.ts` (global setup) sets test env vars, starts DynamoDB Local on port 8000 (in-memory) and creates every table. Its table definitions duplicate `serverless.yml`: keep them in sync.
- `jest.teardown.ts` stops DynamoDB Local.
- DynamoDB Local needs Java; install it once with `npm run dynamodb:install`. It lacks some PartiQL features ([database.md](database.md)).

## Layout

- Unit tests sit next to the source as `*.spec.ts`.
- Model tests (`src/dbmodels/**`, `src/forum/dbmodels/**`) hit DynamoDB Local.
- E2E tests in a module's `e2e/` folder (`src/forum/e2e`, `src/portal/e2e`, `src/group-results-exports/e2e`) call `globalHandler` with built events and exercise REST, WS and DB together.

## Test utilities (`src/testutils/`)

| File | Provides |
|------|----------|
| `token-generator.ts` | `initializeKeys` (test key pair, exposes the public PEM), `signTestJwt` for any payload, thread-token helpers (`generateToken`, `generateReadOnlyToken`, `generateWriteToken`, `generateOwnerToken`) |
| `portal-token-generator.ts` | `generatePortalToken` (same key pair) |
| `event-mocks.ts` | ALB, API Gateway, WS connect / disconnect / message, EventBridge event factories + `mockContext` |
| `mock-ws-client.ts` | `mockWebSocketClient()` / `mockWSClient` capturing pushes |
| `fixtures.ts` | forum builders and loaders (thread IDs, messages, subscriptions) |
| `db.ts` | `loadFixture`, `clearTable`, per-table dumps (`getAllForum`, `getAllStats`, …) |
| `mocks.ts` | `mockTokenData` (thread token) |

## Rules

- Add or update tests with every behaviour change; check the module's existing specs first.
- Mock external services (Stripe, S3, EventBridge, the WS client). **Mocks must match the calls the code actually makes**: same methods, same properties.
- E2E tests that need an external service skip gracefully when it isn't configured (e.g. no Stripe key or test product).
- Isolate tests: clear tables in `beforeEach`, initialise keys in `beforeAll`.
