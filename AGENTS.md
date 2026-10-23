# Agent instructions

You are an expert in TypeScript and AWS serverless backends. Write functional, maintainable, performant TypeScript that matches this repo's patterns.

**Architecture map:** [`ARCHITECTURE.md`](ARCHITECTURE.md) — entry point, folders, request flow, conventions, deep-dive table. Read the map when structure or shared patterns change; read a deep-dive only when that branch is in scope. Update the file you changed.

## Gates

- `npm run lint` and `npm test` pass. Tests start DynamoDB Local themselves; run `npm run dynamodb:install` once per machine.
- Every added or changed behaviour has a colocated `*.spec.ts`. Mocking and e2e rules: [testing.md](docs/architecture/testing.md).
- Portal REST changes update [`src/portal/openapi.yaml`](src/portal/openapi.yaml).

## Comments

Write **why-comments** only: non-obvious choice, hardcoded threshold or limit, AWS/DynamoDB quirk, intentional omission. Skip narrating comments. On refactor, **preserve** existing explanatory comments (move them with the code); drop one only when the change makes it factually wrong.

## Code

- Files ≤ 300 lines.
- `try` blocks wrap only the call whose specific error you handle.
- Zod-validate every external input: request bodies, token payloads, event payloads, DynamoDB reads (parse numbers with `safeNumber`).
- `unknown` over `any`; interfaces for object shapes, types for unions and intersections.
- Throw the classes in `src/utils/errors.ts`; the HTTP middleware maps them to status codes.
- REST responses: POST that creates returns `created(resp)` (201), DELETE returns `deleted(resp)` (200), GET returns the data. Helpers in `src/utils/rest-responses.ts`.

## DynamoDB

- Each model group has its own **dedicated table and key schema** (not single-table). Tables, keys, GSIs, TTLs: [database.md](docs/architecture/database.md).
- Models extend `Table` (`src/dbmodels/table.ts`) and go through its protected methods. When none fits, add a reusable method to `Table`. The raw `this.db.send` calls in `user-connections.ts` and `user-task-stats.ts` are gaps in `Table`: move them into `Table` methods when you touch that code.
- PartiQL (`sqlRead` / `sqlWrite`) for reads, updates and deletes; `insertIfNotExists` for write-once rows, because PartiQL `INSERT` fails on SDK retries (rationale in `table.ts`).
- A new table is declared in four places: `serverless.yml` resources, the IAM statement, the `TABLE_*` env var, and `jest.setup.ts`.

## Branch docs (read when in scope)

| When | Doc |
|------|-----|
| Business rules / cross-service Algorea behavior | [domain.md](docs/agents/domain.md) |
| New or changed EventBridge event (inbound or outbound) | [events.md](docs/architecture/events.md) |
| New token type or auth check | [auth.md](docs/architecture/auth.md) |

Every other branch is listed in the map's deep-dive table.

## Workflow

Save plans in `.cursor/plans/`.

## Agent skills

### Issue tracker

Markdown under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` + `docs/adr/` (+ Algorea knowledge base). See `docs/agents/domain.md`.
