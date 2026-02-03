You are an expert in TypeScript and backend development. You write functional, maintainable, performant, and accessible code following TypeScript best practices.

The architecture of the project is documented in `ARCHITECTURE.md`.

# Project overview

This is an AWS Serverless application using:
- **Serverless Framework** for deployment
- **AWS Lambda** for compute
- **DynamoDB** for storage (single-table design with pk/sk keys)
- **API Gateway** for HTTP REST and WebSocket APIs

# Code quality

## General guidelines
- Files should not be longer than 300 lines
- Keep `try` blocks as short as possible to catch only specific errors
- Use Zod for runtime validation of external data (API inputs, DB results, tokens)

## TypeScript best practices
- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain
- Use interfaces for object shapes, types for unions/intersections

## Error handling
- Use custom error classes from `src/utils/errors.ts` (AuthenticationError, DecodingError, ServerError, etc.)
- Errors are handled by the error-handling middleware for HTTP, or caught in WsServer for WebSocket

## REST response conventions
- Use response helpers from `src/utils/rest-responses.ts` for consistent API responses
- **POST** handlers that create resources: use `created(resp)` (returns 201)
- **DELETE** handlers: use `deleted(resp)` (returns 200)
- **GET** handlers: return the data directly (implicit 200)

## Linting
- Linting rules are defined in `.eslintrc.js`
- Use `.editorconfig` for basic editor config
- Always run `npm run lint` after changes

# Testing

- Run tests with `npm test`
- Tests use Jest with DynamoDB Local for integration tests
- Test files are colocated with source files using `.spec.ts` suffix
- E2E tests are in `e2e/` subdirectories
- Mock external dependencies (Stripe, etc.) in tests
- **Mocks must match actual API calls** - verify mocked methods/properties match what the code actually uses
- **E2E tests with external services** should skip gracefully when the service isn't configured (e.g., missing Stripe product)
- **Always add or update tests** when implementing new features or modifying existing functionality - check existing `.spec.ts` files for the modules you modify

# Database patterns

- Single-table design: all entities share the same table with `pk` (string) and `sk` (number) keys
- Use `Table` base class from `src/dbmodels/table.ts` for DB operations
- Use PartiQL for queries via `sqlRead()` and `sqlWrite()` methods
- TTL is used for auto-expiring records (e.g., WebSocket connections)

# Documentation and architecture

- Save plans in the `.cursor/plans` directory
- Update `src/portal/openapi.yaml` when modifying the portal REST API

## ARCHITECTURE.md updates

`ARCHITECTURE.md` is the source of truth for agents. **Always update it** when:
- Adding or changing patterns (DI, singletons, middleware, etc.)
- Adding new modules, services, or database models
- Changing how components interact or data flows
- Adding new endpoints or WebSocket actions
- Modifying authentication or authorization flows

Keep the file under 1000 lines. Update the "Last Updated" date when making changes.

# Task completion checklist

Before marking a task complete, verify:
- [ ] Linting passes (`npm run lint`)
- [ ] Tests pass (`npm test`)
- [ ] `ARCHITECTURE.md` updated if architectural changes were made
- [ ] `src/portal/openapi.yaml` updated if portal REST API was modified

# Interactions

- When unsure about something, ask!
- Never use the `cd` command in terminal
