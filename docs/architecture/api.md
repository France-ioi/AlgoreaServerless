# API surface: REST, WebSocket, push

## Global handler (`src/handlers.ts`)

`globalHandler` dispatches on the event shape: `httpMethod` → REST (`lambda-api`), `requestContext.eventType` → WebSocket server, `detail-type` → EventBus server ([events.md](events.md)). Anything else is logged and throws. ALB events are passed to `lambda-api` as `APIGatewayProxyEvent`, which the library accepts.

## REST

`lambda-api` with `base: API_BASE` (default `sls`), so every path below is served under `/sls`. Middleware order: error handling → CORS (`res.cors({})` on every response) → per-route token middleware → handler. `OPTIONS /*` answers preflights.

### Route catalog

This table is the single list of routes; feature docs describe behaviour.

| Method | Path (under `/sls`) | Auth | Handler | Behaviour |
|--------|---------------------|------|---------|-----------|
| GET | `/forum/thread/:itemId/:participantId/messages` | thread | `forum/handlers/messages.ts` | [forum.md](forum.md) |
| POST | `/forum/thread/:itemId/:participantId/messages` | thread (`can_write`) | `forum/handlers/messages.ts` | [forum.md](forum.md) |
| GET | `/forum/thread/:itemId/:participantId/follows` | identity | `forum/handlers/thread-follow.ts` | [forum.md](forum.md) |
| POST | `/forum/thread/:itemId/:participantId/follows` | thread | `forum/handlers/thread-follow.ts` | [forum.md](forum.md) |
| DELETE | `/forum/thread/:itemId/:participantId/follows` | identity | `forum/handlers/thread-follow.ts` | [forum.md](forum.md) |
| GET | `/portal/entry-state` | portal | `portal/handlers/entry-state.ts` | [portal.md](portal.md) |
| POST | `/portal/checkout-session` | portal | `portal/handlers/checkout-session.ts` | [portal.md](portal.md) |
| GET | `/notifications` | identity | `handlers/notifications.ts` | [notifications.md](notifications.md) |
| DELETE | `/notifications/:sk` | identity | `handlers/notifications.ts` | [notifications.md](notifications.md) |
| PUT | `/notifications/:sk/mark-as-read` | identity | `handlers/notifications.ts` | [notifications.md](notifications.md) |
| GET | `/stats` | identity | `handlers/stats.ts` | [stats-activity.md](stats-activity.md) |
| GET | `/validations` | identity | `handlers/validations.ts` | [stats-activity.md](stats-activity.md) |
| POST | `/task-session/start` | task (non-readonly) | `handlers/task-sessions.ts` | [stats-activity.md](stats-activity.md) |
| POST | `/task-session/continue` | task (non-readonly) | `handlers/task-sessions.ts` | [stats-activity.md](stats-activity.md) |
| POST | `/task-session/stop` | task (non-readonly) | `handlers/task-sessions.ts` | [stats-activity.md](stats-activity.md) |
| GET | `/task-stats` | permissions (`requireEditAll`) | `handlers/item-stats.ts` | [stats-activity.md](stats-activity.md) |
| POST | `/group-results-exports` | group results | `group-results-exports/handlers/request-export.ts` | [group-results-export.md](group-results-export.md) |
| GET | `/group-results-exports/:exportId/download-url` | identity | `group-results-exports/handlers/download-url.ts` | [group-results-export.md](group-results-export.md) |

Auth columns refer to the token types in [auth.md](auth.md).

### Errors (`src/middlewares/error-handling.ts`)

Matched on `err.name`:

| Error | Status | Body |
|-------|--------|------|
| `DecodingError` | 400 | `{ message: 'decoding error', details }` |
| `AuthenticationError` | 401 | `{ message: 'authentication error', details }` |
| `Forbidden` | 403 | `{ message: 'forbidden', details }` |
| `RouteError` (from `lambda-api`) | 404 | `{ message: 'route error', details: { method, path } }` |
| `DBError` | 500 | `{ message: 'db error', details }` |
| any other `Error` (incl. `ServerError`) | 500 | `{ message: 'internal server error', details }` |

Other classes in `src/utils/errors.ts`: `RouteNotFound` (unknown WS action), `OperationSkipped` (a warning: `logError` logs it with `console.warn`). Handlers can still set a status and return a body directly for expected outcomes (e.g. export download `404 { error: 'not_found' }`).

### Response helpers (`src/utils/rest-responses.ts`)

`created(resp)` → 201 `{ message: 'created', success: true }`; `deleted(resp)` → 200 `{ message: 'deleted', success: true }`. GET handlers return their data. Handlers are typed against the enriched request (`RequestWithXxxToken`) and exported cast to `HandlerFunction`.

## WebSocket

### Server (`src/utils/lambda-ws-server/`)

Modelled on `lambda-api`. `register(subActions, { prefix })` namespaces actions as `<prefix>.<action>`. A MESSAGE body is `{ action, … }`. An unknown action or a thrown error returns `500` with `error: …` in the body: WS replies have no meaningful status codes once connected.

### Lifecycle (`src/websocket/handlers.ts`)

- `$connect`: identity token in `?token=`; missing or invalid → 401. Stores the connection (2 h TTL, the API Gateway WS limit) and upserts the user in active users.
- `$disconnect`: `cleanupGoneConnection` deletes the connection and, through its `subscriptionThreadId`, any thread subscription.

### Actions

| Action | Auth | Handler |
|--------|------|---------|
| `forum.subscribe` / `forum.unsubscribe` | thread token in `body.token` | `forum/handlers/thread-subscription.ts` |
| `liveActivity.subscribe` / `liveActivity.unsubscribe` | none beyond `$connect` | `handlers/live-activity-subscription.ts` |
| `heartbeat` | none | no-op keep-alive |

## Outbound push

- `wsClient.send(connectionIds, message)` (`src/websocket-client.ts`): de-duplicates IDs, posts through the API Gateway Management API (`APIGW_ENDPOINT`; `localhost:3001` when `STAGE=local`), never rejects, and returns a per-connection result.
- `broadcastAndCleanup(recipients, getConnectionId, message)` (`src/services/ws-broadcast.ts`): sends, logs results, runs `cleanupGoneConnection` for every `GoneException`, and returns the recipients that received the message. Use it for every push.

Push message actions: `forum.message.new`, `forum.submission.new`, `forum.grade.update` (`forum/ws-messages.ts`); `notification.new`, `liveActivity.validation.new` (`src/ws-messages.ts`).
