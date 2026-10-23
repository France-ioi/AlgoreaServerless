# Deployment

## CI (`.circleci/config.yml`)

- **Every push:** `setup` (npm install, cached), then `tests-unit`, `tests-e2e` (context `stripe-tests`) and `lint` in parallel, on `node:20` images. The test jobs install OpenJDK 17 and DynamoDB Local.
- **Tag `vX.Y.Z`:** `notify-ready` only, reporting the version to the ops API. CI neither deploys nor creates the GitHub release.

Release procedure (changelog entry, tag, push, GitHub release): the `release` skill in [`.agents/skills/release/SKILL.md`](../../.agents/skills/release/SKILL.md), summarized in `README.md`.

## Deploy

```bash
sls deploy --aws-profile <profile>            # full stack: needed for IAM, env or resource changes
sls deploy -f server --aws-profile <profile>  # function code only
```

One function, `server` (`src/handlers.globalHandler`), packaged with `config.json`. Deployment uses the `OPS_BUCKET` bucket.

Triggers are **not** declared in `serverless.yml`. The WebSocket routes (`$connect`, `$disconnect`, `$default`) and the ALB target group are configured by hand so ops can point them at Lambda aliases; the EventBridge rules that route backend events to the function are also managed outside this repo.

## IAM (`provider.iam.role.statements`)

| Permission | Scope |
|------------|-------|
| `execute-api:ManageConnections` | WS `@connections` (pushes) |
| `dynamodb:GetItem`, `Query`, `Scan`, `PutItem`, `UpdateItem`, `BatchWriteItem`, `DeleteItem`, `PartiQL*` | each `alg-sls-{stage}-*` table, plus `/index/*` for tables with GSIs |
| `events:PutEvents` | the `EVENT_BUS_NAME` bus |
| `s3:PutObject`, `s3:GetObject` | `EXPORTS_BUCKET` under the stage's exports prefix (`GetObject` also covers `HeadObject`) |

A new table or GSI needs its ARN added here ([database.md](database.md)).
