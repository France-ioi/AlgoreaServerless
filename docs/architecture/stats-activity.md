# Stats and activity

Platform-wide counters, live validation feed, per-user task work sessions, and per-item task statistics. Routes and auth: [api.md](api.md). Storage: [database.md](database.md).

## Validations

A **validation** is a `grade_saved` event with `validated && score_improved`. This assumes full validation is final; if a partially validated score can later improve, the gate needs an explicit flag on the event instead.

On each validation (`handlers/task-validation-storage.ts`): insert into `Validations` (2-week TTL) and increment the UTC day's `ValidationCounts` row.

- `GET /validations`: the latest 30, newest first.

## Global stats (`GET /stats`)

`{ validations: { last24h, last30d, last1y }, activeUsers: { last24h, last30d, last1y }, connectedUsers }`

- validations 24 h: exact count from `Validations` (only accurate inside its 2-week TTL);
- validations 30 d / 1 y: summed daily counts;
- active users: `ActiveUsers` rows (upserted on every WS connect) queried through the `by-time` GSI once for the widest window, then split client-side;
- `connectedUsers`: distinct users across live connections (a table scan, acceptable because the table is small).

## Live activity

WS `liveActivity.subscribe` / `unsubscribe` sets or removes `liveActivityPk` on the connection, which adds it to or removes it from the sparse `live-activity-subscribers` GSI. No extra token: the connection was authenticated at `$connect`. On each validation, `liveActivity.validation.new` `{ participantId, itemId, answerId, time }` goes to every subscriber.

## Task work sessions (`/task-session/*`)

The frontend tracks time spent on a task. All three routes need a non-readonly task token (read-only contexts are not tracked), and `start` / `continue` need the `attempt_id` query param. The frontend sends a keep-alive every 2 min; a session is **stale** once `latestUpdateTime` is older than 4 min 30 s (two missed keep-alives plus slack). A stale session is closed with `endTime = latestUpdateTime + 1 min`.

| Call | Open fresh session | Open stale session | Recently ended session | None |
|------|--------------------|--------------------|------------------------|------|
| `start` | keep-alive (several tabs share it) | close it, start new | start new | start new |
| `continue` | keep-alive | close it, start new backdated | reopen it (another tab continued) | start new backdated |
| `stop` | set `endTime` | close it, add a minimal ended session | move its `endTime` to now | add a minimal ended session |

Backdated sessions start at `now − 1 min` to approximate a missed `start`. Session rows are written with `insertIfNotExists` ([database.md](database.md)).

`firstActivity`: on the user's very first session, `start` accepts `result_started_at` (ISO 8601, when the backend created the attempt). If it is within 1 min of now, the session is flagged `firstActivity`, meaning data collection covers the user's whole history on the task.

## User task stats

Per `(itemId, groupId = participantId)` row (`handlers/user-task-stats.ts`):

- **Session ended** (first time `endTime` is set): `ADD total_time_spent` the duration; `abstime_begin` set once.
- **Every `grade_saved`** (`handlers/task-activity-score.ts`): log a score activity; then, if `score > 0 && score_improved`, for each 10-point threshold reached store the minimum cumulative session time up to the event (`time_to_reach_N`) and the minimum event time (`abstime_N`). Taking minima keeps out-of-order events correct. Also updates `current_score` (max) and `missingEarlierActivity` (true when the first session lacks `firstActivity`).

## Item stats (`GET /task-stats`)

Needs a permissions token with `can_edit >= "all"` or `is_owner`. Aggregates every user row of the token's item, excluding `missingEarlierActivity` rows (partial history would skew results):

`{ userCount, medianTimeSpent, medianTimeToValidate, bounceRate, avgScore, scoreDistribution[] }`

- `medianTimeToValidate`: median `time_to_reach_100`.
- `scoreDistribution`: per threshold 10…100, the % of users at or above it and, per time bucket (1–15 min, then every 5 min to 60), the % who reached it within that time.
- `bounceRate`: among real visits (≥ 3 s), the % with score 0 and time below `max(30 s, 0.3 × median time_to_reach_10)`. It separates "users leave immediately" (engagement) from "task is hard" (low `avgScore`). The thresholds and their rationale are commented in `handlers/item-stats.ts`.
