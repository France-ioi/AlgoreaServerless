# EventBridge events

## EventBus server (`src/utils/lambda-eventbus-server/`)

A minimal dispatcher modelled on `lambda-ws-server`, routed by `detail-type`:

1. No handler registered for the type → log and return; nothing is parsed.
2. Parse the common envelope; on failure, log and drop.
3. Parse the payload **once** with the schema bound to the event definition; on failure, log and drop.
4. Run every registered handler in parallel (`Promise.allSettled`). A handler is skipped when the envelope's major version exceeds its `supportedMajorVersion`.
5. Log handler failures; they never fail the invocation, so EventBridge does not retry.

Unlike REST and WebSocket, many handlers can react to the same event type, and no prefix is applied (event types are global).

## Envelope (`event-envelope.ts`)

```json
{
  "version": "1.0",
  "type": "submission_created",
  "source_app": "algoreabackend",
  "instance": "dev",
  "time": "2026-01-23T14:36:20Z",
  "request_id": "…",
  "payload": { }
}
```

Handlers use `envelope.time` as the event timestamp (`new Date(envelope.time).getTime()`), not the processing time.

## Defining and registering

```typescript
// src/events/grade-saved.ts
export const gradeSavedEvent = defineEvent('grade_saved', gradeSavedPayloadSchema);

// a routes.ts
eb.on(gradeSavedEvent, handleGradeSaved, { supportedMajorVersion: 1 });

// handler: payload already validated and typed
async function handleGradeSaved(payload: GradeSavedPayload, envelope: EventEnvelope): Promise<void> { … }
```

Module registration functions are wired in `src/handlers.ts` via `ebServer.register(...)`.

## Inbound events

| Event (`src/events/`) | Handler | Effect |
|-----------------------|---------|--------|
| `submission_created` | `forum/handlers/submission-created.ts` | push `forum.submission.new` to thread subscribers |
| `thread_status_changed` | `forum/handlers/thread-status-changed.ts` | adjust thread follows and their TTL ([forum.md](forum.md)) |
| `grade_saved` | `forum/handlers/grade-saved.ts` | push `forum.grade.update` to thread subscribers |
| `grade_saved` | `handlers/task-validation-storage.ts` | if `validated && score_improved`: store validation + increment daily count |
| `grade_saved` | `handlers/task-validation-broadcast.ts` | if `validated && score_improved`: push `liveActivity.validation.new` |
| `grade_saved` | `handlers/task-activity-score.ts` | log score activity, update task-stats score milestones |
| `group_results_export_completed` | `group-results-exports/handlers/on-export-completed.ts` | notify the requester ([group-results-export.md](group-results-export.md)) |

## Outbound events (`src/lib/eventbridge.ts`)

`publishEvent(detailType, payload, requestId?)` puts one event on `EVENT_BUS_NAME` with `Source: algoreaserverless.<STAGE>` and the same envelope (`version: "1.0"`, `source_app: "algoreaserverless"`, `instance: STAGE`). It throws `ServerError` when `STAGE` or `EVENT_BUS_NAME` is unset or the entry fails. Only producer today: `group_results_export_requested`.

## Adding an event

Inbound: payload schema + `defineEvent` in `src/events/`, handler, `eb.on(..., { supportedMajorVersion })` in the module's `routes.ts`, and the module registered in `src/handlers.ts` if new. Outbound: call `publishEvent`; the IAM `events:PutEvents` statement already covers the bus. Coordinate event names and payloads with AlgoreaBackend.
