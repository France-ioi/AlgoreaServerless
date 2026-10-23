# Database layer

## Document client (`src/dynamodb.ts`)

`docClient` is a `DynamoDBDocumentClient` with `wrapNumbers: true`: every number read back is a `NumberValue`, which preserves int64 IDs and connection IDs encoded as numbers. Parse number fields with the `safeNumber` Zod schema; for schemaless values (notification payloads) use `deepConvertNumberValues`. List reads go through `safeParseArray` (`src/utils/zod-utils.ts`), which drops rows that fail the schema and logs a warning for each one. Endpoint by `STAGE`: `local` → `localhost:7000`, `test` → `localhost:8000` with fake credentials, otherwise AWS defaults.

## `Table` base class (`src/dbmodels/table.ts`)

Abstract; `constructor(db, tableEnvVar)` reads the table name from that env var and throws if it is unset. `pkAttribute` / `skAttribute` default to `pk` / `sk`; subclasses override them for their own key schema. All methods are `protected` and wrap AWS errors in `DBError` (statement or key attached).

| Method | Use |
|--------|-----|
| `sqlRead(statement)` | PartiQL read |
| `sqlWrite(statement \| statements[])` | PartiQL write; an array runs as one transaction |
| `query({ pk, skRange?, filter?, projectionAttributes?, limit?, scanIndexForward?, index? })` | Query API with pagination; `index` targets a GSI |
| `countByPk(pk, { skRange?, excludeExpiredTtl? })` | `Select: COUNT` query |
| `upsert(item)` | Put, overwriting |
| `insertIfNotExists(item)` | Conditional Put on `attribute_not_exists(<pk>)`; returns `false` if the row exists |
| `incrementCounter(key, { ttl? })` | Atomic `ADD count :1` |
| `batchUpdate(items)` | BatchWrite in chunks of 25 (API max) |

**PartiQL values always go through `params` (`?` placeholders).** Only the table name (`"${this.tableName}"`) and attribute names chosen by code are interpolated into the statement.

**Write-once rows use `insertIfNotExists`, not PartiQL `INSERT INTO`.** The SDK retries failed calls (up to 3 attempts); if the first `INSERT` committed but its response was lost, the retry throws `DuplicateItemException` and surfaces as a 500. A conditional Put lets the retry read as success. Full rationale in the method's doc comment.

**`limit` is applied before filters.** With a non-key filter, DynamoDB may return fewer rows than `limit`, or none (see `ThreadEvents.getAllMessages`). DynamoDB Local (tests) also rejects PartiQL `ORDER BY … DESC` and `LIMIT` with non-key filters: use `query()` for those cases.

**Gaps in `Table`:** `UserConnections` (GSI queries, scan, update expressions) and `UserTaskStats` (filtered query, `ADD` / `if_not_exists` updates) call `this.db.send` directly. New code adds the missing primitive to `Table`; move these calls over when you touch them.

## Singletons

Each model module exports its class (for tests) and a singleton bound to `docClient`, e.g. `export const userConnectionsTable = new UserConnections(docClient)`. Models are stateless, so handlers import the singleton directly rather than receiving it as a parameter.

## Tables

All tables are named `alg-sls-{stage}-<name>`, billed `PAY_PER_REQUEST`, and declared in `serverless.yml`.

| Env var | Keys | GSIs | TTL | Models (singleton) |
|---------|------|------|-----|--------------------|
| `TABLE_FORUM` | `pk` S / `sk` N | — | `ttl` | `threadEventsTable`, `threadSubscriptionsTable`, `threadFollowsTable` |
| `TABLE_CONNECTIONS` | `connectionId` S | `user-connections` (`userId`/`connectionId`, ALL); sparse `live-activity-subscribers` (`liveActivityPk`/`connectionId`, KEYS_ONLY) | `ttl` (2 h) | `userConnectionsTable` |
| `TABLE_NOTIFICATIONS` | `userId` S / `creationTime` N | — | `ttl` (60 d) | `notificationsTable` |
| `TABLE_STATS` | `pk` S / `sk` N | — | `ttl` | `validationsTable`, `validationCountsTable` |
| `TABLE_ACTIVE_USERS` | `userId` S | `by-time` (`gsiPk` = `"ALL"` / `lastConnectedTime`, KEYS_ONLY) | `ttl` (1 y) | `activeUsersTable` |
| `TABLE_USER_TASK_ACTIVITIES` | `pk` S / `time` N | — | none | `userTaskActivitiesTable` |
| `TABLE_USER_TASK_STATS` | `itemId` S / `groupId` S | — | none | `userTaskStatsTable` |

## Item layouts

Forum table (`pk` prefixes share one table):

| Entity | `pk` | `sk` | Other attributes |
|--------|------|------|------------------|
| Thread event | `THREAD#{participantId}#{itemId}#EVENTS` | event time (ms) | `label` (`forum.message`), `data` `{ authorId, text, uuid }` |
| Thread subscription | `THREAD#{participantId}#{itemId}#SUB` | connection ID encoded as a number (`connectionIdToNumberValue`) | `connectionId` (debug only), `userId`, `ttl` = WS lifetime |
| Thread follow | `THREAD#{participantId}#{itemId}#FOLLOW` | user ID as int64 `NumberValue` | `ttl` only after the thread closes (2 weeks) |

Stats table:

| Entity | `pk` | `sk` | Other attributes |
|--------|------|------|------------------|
| Validation | `VALIDATIONS` | envelope time (ms) | `participantId`, `itemId`, `answerId`, `ttl` (2 weeks) |
| Daily validation count | `VALIDATIONS#DAY` | `YYYYMMDD` (UTC) | `count`, `ttl` (2 years) |

Both share one partition each, which can throttle under very high write load.

User task activities (`sk` attribute is `time`):

| Entity | `pk` | `time` | Other attributes |
|--------|------|--------|------------------|
| Score | `score#{itemId}#{participantId}` | envelope time (ms) | `answerId`, `attemptId`, `validated`, `score` |
| Session | `session#{itemId}#{participantId}` | session start (ms) | `attemptId?`, `latestUpdateTime`, `endTime?`, `firstActivity?` |

Single-entity tables:

- **Connections:** `connectionId`, `userId`, `creationTime`, `ttl`; `liveActivityPk = "LIVE_ACTIVITY_SUB"` only while subscribed to live activity; `subscriptionThreadId` `{ participantId, itemId }` so disconnect can delete the thread subscription.
- **Notifications:** `userId`, `creationTime`, `notificationType`, `payload`, `readTime?` (unset = unread), `ttl`. Exposed to clients with `creationTime` renamed to `sk`.
- **Active users:** `userId`, `lastConnectedTime`, `gsiPk = "ALL"`, `ttl`; upserted on every WS connect.
- **User task stats:** `total_time_spent`, `abstime_begin`, `current_score`, `missingEarlierActivity`, `time_to_reach_{10..100}`, `abstime_{10..100}`. Semantics: [stats-activity.md](stats-activity.md).

## Adding a table

1. `serverless.yml`: resource, `TABLE_*` env var, IAM ARN (plus `/index/*` if it has GSIs).
2. `jest.setup.ts`: env var and `createTable` entry with the same keys and GSIs.
3. `Table` subclass passing the env var name, overriding `pkAttribute` / `skAttribute` if needed, and a singleton export.
4. Reshaping existing data needs a one-off script in `scripts/` (see the `migrate-*.ts` scripts).
