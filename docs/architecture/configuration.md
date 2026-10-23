# Configuration

## Environment variables

Set in `serverless.yml` (`provider.environment`); `useDotenv: true` loads `.env`. Tests set their own in `jest.setup.ts`.

| Variable | Source / default | Purpose |
|----------|------------------|---------|
| `STAGE` | `--stage`, default `dev` | selects DynamoDB endpoint, WS client endpoint, stage config file, `NO_SIG_CHECK` guard |
| `API_BASE` | env, default `sls` | REST path prefix |
| `BACKEND_PUBLIC_KEY` | env | PEM public key for JWT verification |
| `NO_SIG_CHECK` | env, default `0` | `1` skips JWT signature checks; `dev` stage only |
| `TABLE_FORUM`, `TABLE_CONNECTIONS`, `TABLE_NOTIFICATIONS`, `TABLE_STATS`, `TABLE_ACTIVE_USERS`, `TABLE_USER_TASK_ACTIVITIES`, `TABLE_USER_TASK_STATS` | computed `alg-sls-{stage}-<name>` | table names ([database.md](database.md)) |
| `APIGW_ENDPOINT` | env | API Gateway Management API endpoint for WS pushes |
| `EVENT_BUS_NAME` | env, default `algorea` | bus for outbound events |
| `EXPORTS_BUCKET` | env, default `''` | S3 bucket for export ZIPs, provided by ops. The empty default only lets CI resolve the file; runtime rejects it |
| `EXPORTS_PREFIX` | computed `temp-files/signed-url-access/group-results-exports/{stage}` | S3 key prefix (includes the stage) |
| `EXPORTS_REGION` | env, optional | exports bucket region when it differs from the Lambda's |
| `STRIPE_SECRET_KEY` | env, optional | overrides `portal.payment.stripe.sk` from config files |
| `OPS_BUCKET` | env (deploy time) | Serverless deployment bucket |
| `AWS_DEFAULT_REGION` | env (deploy time), default `eu-west-3` | deploy region |

## Stages

| Stage | DynamoDB | WS push | Notes |
|-------|----------|---------|-------|
| `local` | `localhost:7000` in-memory (`npm start` = `sls offline start`) | `localhost:3001` | |
| `test` | `localhost:8000` (DynamoDB Local started by `jest.setup.ts`), fake credentials | mocked in tests | |
| `dev` | AWS | `APIGW_ENDPOINT` | the only stage allowing `NO_SIG_CHECK=1` |
| `production` (and others) | AWS | `APIGW_ENDPOINT` | |

## Config files (`src/config.ts`)

`loadConfig()` reads `config.json` (committed, no secrets), deep-merges `config.<STAGE>.json` over it when present (gitignored, may hold secrets), then applies `STRIPE_SECRET_KEY`. On any read or parse error it logs and returns `{}`, which disables payments. The only schema today is `portal.payment.stripe.sk`; see `config.example.json`. `config.json` is packaged with the function.
