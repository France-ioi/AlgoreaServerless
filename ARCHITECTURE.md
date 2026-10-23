# AlgoreaServerless Architecture

**Targeted at agents.** Last updated: 2026-10-23.

## Overview

Serverless companion to the Algorea backend: forum threads and live messaging, per-user notifications, live activity and platform stats, task work-session tracking, item-level task stats, async group-results ZIP exports, and Stripe payments for the portal. Every request is authorized by a JWT minted by AlgoreaBackend. Governed business rules: [docs/agents/domain.md](docs/agents/domain.md).

Stack: TypeScript on Node 20, Serverless Framework v3, one AWS Lambda behind an ALB (REST) and API Gateway (WebSocket), triggered by EventBridge for backend events, DynamoDB storage, `lambda-api`, `jose`, `zod`, Stripe. Versions live in `package.json` and `serverless.yml`.

## Deep-dives

Keep this file as the **map**. Branch detail lives under `docs/architecture/`. Read a deep-dive only when the change touches that branch:

| Branch | Doc |
|--------|-----|
| `Table` base class, document client, tables, keys, GSIs, TTLs, adding a table | [database.md](docs/architecture/database.md) |
| JWT verification, the six token types, `NO_SIG_CHECK` | [auth.md](docs/architecture/auth.md) |
| EventBus server, envelope, `defineEvent`, inbound/outbound events | [events.md](docs/architecture/events.md) |
| Global handler, route and WS action catalog, middleware, error mapping, WS push | [api.md](docs/architecture/api.md) |
| Env vars, stages, `config.json` and stage overrides | [configuration.md](docs/architecture/configuration.md) |
| Jest, DynamoDB Local, test utilities, mocking and e2e rules | [testing.md](docs/architecture/testing.md) |
| CircleCI, release, `sls deploy`, IAM | [deploy.md](docs/architecture/deploy.md) |
| Forum messages, subscriptions vs follows, thread lifecycle | [forum.md](docs/architecture/forum.md) |
| Portal entry state, Stripe customer/invoice/price, checkout | [portal.md](docs/architecture/portal.md) |
| Notification storage, `notifyUser`, notification types | [notifications.md](docs/architecture/notifications.md) |
| Group-results export: S3 presigning, request/completion flow | [group-results-export.md](docs/architecture/group-results-export.md) |
| Global stats, validations, live activity, task sessions, task stats | [stats-activity.md](docs/architecture/stats-activity.md) |

When a change affects global structure (folders, request flow, shared patterns), update **this** file. When it only deepens one branch above, update that deep-dive.

## Project structure

```
AlgoreaServerless/
├── src/
│   ├── handlers.ts            # Lambda entry (globalHandler) + all REST/WS/EventBus registration
│   ├── auth/                  # shared JWT verification + identity/task/permissions tokens
│   ├── dbmodels/              # Table base class + app-level models (one singleton each)
│   ├── events/                # inbound EventBridge event definitions (defineEvent + Zod schema)
│   ├── handlers/              # app-level REST/WS/event handlers (stats, sessions, notifications, …)
│   ├── routes/                # app-level route/action/event registration
│   ├── services/              # cross-feature services: WS broadcast + cleanup, notifyUser
│   ├── websocket/             # WS $connect / $disconnect handlers
│   ├── lib/                   # AWS helpers: EventBridge publish, exports S3 presigning
│   ├── middlewares/           # REST error mapping + CORS
│   ├── utils/                 # lambda-ws-server, lambda-eventbus-server, errors, rest-responses, …
│   ├── testutils/             # token generators, fixtures, mocks, DB helpers
│   ├── forum/                 # feature module: routes, handlers, dbmodels, thread token, e2e
│   ├── portal/                # feature module: routes, handlers, Stripe wrappers, token, openapi.yaml
│   ├── group-results-exports/ # feature module: routes, handlers, token, e2e
│   ├── config.ts              # config.json loader (portal payment)
│   ├── dynamodb.ts            # document client + safeNumber
│   ├── stripe.ts              # Stripe client factory
│   ├── websocket-client.ts    # outbound WS sender (API Gateway Management API)
│   └── ws-messages.ts         # app-level WS push message types
├── scripts/                   # one-off DynamoDB migration / backfill scripts
├── serverless.yml             # env vars, IAM, DynamoDB table resources
└── jest.setup.ts              # starts DynamoDB Local and creates test tables
```

Feature modules (`forum/`, `portal/`, `group-results-exports/`) own their `routes.ts`, `handlers/`, token, and models. App-level features split the same pieces across `routes/`, `handlers/` and `dbmodels/`.

## Request flow

One Lambda (`src/handlers.ts` → `globalHandler`) dispatches on event shape:

```
ALB HTTP request (httpMethod)        → lambda-api  → error + CORS middleware → token middleware → handler
API Gateway WS (requestContext.eventType)
  CONNECT / DISCONNECT               → src/websocket/handlers.ts (identity token in ?token=)
  MESSAGE {action, …}                → WsServer action handler
EventBridge (detail-type)            → EventBusServer → envelope + payload parsed once → all handlers in parallel
```

Handlers read and write DynamoDB through `Table` singletons and push to clients via `broadcastAndCleanup` / `notifyUser`, which also delete connections API Gateway reports as gone. Catalog and details: [api.md](docs/architecture/api.md), [events.md](docs/architecture/events.md).

## Conventions (every change)

- Register routes, WS actions and event handlers in the module's `routes.ts` (or `src/routes/*.ts`), then wire the module in `src/handlers.ts`.
- Every request carries a backend-signed JWT; attach it with the matching `require*Token` middleware and read it from the typed request ([auth.md](docs/architecture/auth.md)).
- DynamoDB access goes through `Table` methods on a model singleton; numbers read back are `NumberValue`, parsed with `safeNumber` ([database.md](docs/architecture/database.md)).
- Errors: throw `src/utils/errors.ts` classes; REST responses use `created` / `deleted` ([api.md](docs/architecture/api.md)).
- Outbound WS pushes go through `broadcastAndCleanup`; user-facing alerts go through `notifyUser` ([notifications.md](docs/architecture/notifications.md)).
- New inbound event: definition in `src/events/`, register with `supportedMajorVersion` ([events.md](docs/architecture/events.md)).
