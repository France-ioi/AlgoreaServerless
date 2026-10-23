# AlgoreaForum

## Installation

```sh
npm ci
npx sls dynamodb install
```

## Start

```sh
npm start
```


## Configuration

The project uses a stage-based configuration system:

- **`config.json`**: Base configuration file (committed to git, should not contain sensitive data)
- **`config.<stage>.json`**: Stage-specific configuration files (ignored by git, can contain sensitive data like API keys)

When the application loads, it:
1. Loads the base `config.json`
2. If the `STAGE` environment variable is set, loads `config.<STAGE>.json` and deep-merges it over the base config

### Example

To use a stage-specific configuration:

```sh
STAGE=e2e-test npm test  # Loads config.e2e-test.json
STAGE=production npm start  # Loads config.production.json
```

See `config.example.json` for the configuration structure.

### Stage-specific config for E2E tests

The Stripe E2E tests require a Stripe test API key. You can provide it in two ways:

**Option 1: Using a config file** (recommended for local development)

Create a `config.e2e-test.json` file:

```json
{
  "portal": {
    "payment": {
      "stripe": {
        "sk": "sk_test_your_stripe_test_key"
      }
    }
  }
}
```

Then run:

```sh
npm run test:e2e-stripe
```

**Option 2: Using an environment variable** (recommended for CI/CD)

Set the `STRIPE_SECRET_KEY` environment variable:

```sh
STRIPE_SECRET_KEY=sk_test_your_stripe_test_key npm run test:e2e-stripe
```

This is particularly useful for CI/CD environments like CircleCI where you can store the key in a secure context.

> **Note**: The environment variable takes precedence over config files.

## API Documentation

The Portal API is documented using OpenAPI 3.0 specification. To view the interactive documentation:

```sh
npx swagger-ui-watcher src/portal/openapi.yaml
```

This will open an interactive Swagger UI in your browser where you can explore the API endpoints, request/response schemas, and authentication requirements.

## Test

```sh
npm test                  # Run all tests
npm run test:unit         # Run unit tests only (no E2E)
npm run test:e2e          # Run E2E tests only
npm run test:e2e-stripe   # Run Stripe E2E tests (requires config.e2e-test.json)
```

## Deploy code on AWS

```sh
sls deploy [-f <function name>] --aws-profile <aws profile>
```

If you do global changes (for instance the role permissions), you need to deploy with specifying any function.
 
## Create a release

Ask an agent to run the `release` skill ([`.agents/skills/release/SKILL.md`](.agents/skills/release/SKILL.md)), optionally in auto mode. It drafts the `CHANGELOG.md` section from the merged PRs, proposes the version, then commits, tags, pushes and creates the GitHub release once you reply "do it".

To do it by hand:
- decide of a new version number (using semver)
- update the changelog (add a new section, with the date of today and listing the fix and new features)
- run the following command with your version number:

```sh
VERSION=2.1.4; git add CHANGELOG.md && git commit -m "Release $VERSION" && git tag -a -m "Release v$VERSION" v$VERSION && git push origin v$VERSION && git push origin master
```

- create the GitHub release (`gh release create v$VERSION --verify-tag --title "Release $VERSION" --notes "<changelog section>"`): CI does not do it.
