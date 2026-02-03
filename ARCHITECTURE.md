# AlgoreaServerless Architecture

**This file is mainly targetted to agents.**
**Last Updated**: January 27, 2026

## Overview

AlgoreaServerless is a serverless backend application designed to provide forum/messaging and portal functionality for the Algorea platform. It's built on AWS serverless technologies, providing REST API and WebSocket support for real-time communication, along with payment integration capabilities.

## Technology Stack

### Core Technologies
- **Runtime**: Node.js 20.x
- **Language**: TypeScript 5.5.4 (strict mode enabled)
- **Framework**: Serverless Framework v3
- **Deployment**: AWS Lambda (via Application Load Balancer and API Gateway)

### AWS Services
- **AWS Lambda**: Serverless compute for handling requests
- **API Gateway**: WebSocket connections management
- **Application Load Balancer (ALB)**: HTTP/REST API traffic routing
- **EventBridge**: Event-driven communication from backend services
- **DynamoDB**: NoSQL database for data persistence
- **IAM**: Role-based access control

### Key Dependencies
- **lambda-api**: Lightweight REST API framework for Lambda
- **jose**: JWT token verification and decoding (ES256 algorithm)
- **zod**: Runtime type validation and schema definition
- **@aws-sdk/client-dynamodb**: DynamoDB client
- **@aws-sdk/client-apigatewaymanagementapi**: WebSocket message delivery
- **stripe**: Payment processing and invoice management (API version 2025-12-15.clover)

### Development Tools
- **Jest**: Unit and e2e testing framework
- **DynamoDB Local**: Local DynamoDB instance for testing
- **ESLint**: Code linting and style enforcement
- **TypeScript Compiler**: Type checking and transpilation
- **Serverless Offline**: Local development server
- **Husky**: Git hooks for pre-commit checks

## System Architecture

### High-Level Architecture

```
┌─────────────────┐
│   Client Apps   │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌──▼──────┐  ┌───────────┐
│  ALB  │ │   API   │  │ EventBridge│
│(REST) │ │ Gateway │  │  (Events) │
└───┬───┘ │  (WS)   │  └─────┬─────┘
    │     └────┬────┘        │
    │          │             │
    └────┬─────┴─────────────┘
         │
    ┌────▼────────┐
    │   Lambda    │
    │   Handler   │
    │(globalHandler)
    └──────┬──────┘
           │
    ┌──────┼───────────────┐
    │      │               │
┌───▼───┐ ┌▼──────────┐ ┌──▼───────┐
│  REST │ │ WebSocket │ │ EventBus │
│  API  │ │  Server   │ │  Server  │
└───┬───┘ └────┬──────┘ └────┬─────┘
    │          │             │
    └──────────┴─────────────┘
               │
        ┌──────▼──────┐
        │  DynamoDB   │
        │    Table    │
        └─────────────┘
```

### Request Flow

#### REST API Flow
1. Client sends HTTP request to ALB endpoint
2. ALB forwards request to Lambda function
3. `globalHandler` detects HTTP method and routes to REST API
4. `lambda-api` routes request to appropriate handler
5. Middleware processes request (CORS, error handling)
6. Handler validates JWT token, processes business logic
7. Handler interacts with DynamoDB through model layer
8. Response returned to client

#### WebSocket Flow
1. Client establishes WebSocket connection via API Gateway
2. Connection events (CONNECT/DISCONNECT/MESSAGE) sent to Lambda
3. `globalHandler` routes to WebSocket server
4. WebSocket server routes message to appropriate action handler
5. Handler validates JWT token, processes request
6. For broadcasts, handler retrieves subscribers from DynamoDB
7. Messages sent to connected clients via API Gateway Management API
8. Stale connections (GoneException) are cleaned up from database

#### EventBridge Flow
1. Backend service publishes event to EventBridge
2. EventBridge rule triggers Lambda function
3. `globalHandler` detects `detail-type` field and routes to EventBus server
4. EventBus server parses common envelope (version, type, payload, etc.)
5. EventBus server validates event version against handler requirements
6. Matching handlers receive the parsed envelope and process the event
7. Multiple handlers can react to the same event type (run in parallel)

## Project Structure

```
AlgoreaServerless/
├── .circleci/               # CI/CD configuration
│   └── config.yml          # CircleCI workflow definition
├── .cursor/                # AI assistant context
│   ├── rules/              # Coding rules and standards
│   └── plans/              # Implementation plans
├── db/                     # Database configuration
│   └── dynamodb.cloudformation.yaml
├── src/                    # Source code
│   ├── auth/              # Shared authentication module
│   │   ├── jwt.ts         # JWT verification and token extraction
│   │   ├── identity-token.ts      # Identity token parsing
│   │   ├── identity-token-middleware.ts  # Identity token middleware
│   │   └── *.spec.ts      # Authentication tests
│   ├── dbmodels/          # Shared database models and base classes
│   │   ├── notifications.ts  # User notifications model
│   │   ├── user-connections.ts  # WebSocket user connections model
│   │   └── table.ts       # Base table class
│   ├── handlers/          # App-level request handlers
│   │   └── notifications.ts  # Notification handlers
│   ├── routes/            # App-level route registration
│   │   └── notifications.ts  # Notification routes
│   ├── forum/             # Forum feature module
│   │   ├── routes.ts      # Route and action registration
│   │   ├── dbmodels/      # Forum-specific database models
│   │   │   ├── thread.ts
│   │   │   ├── thread-events.ts
│   │   │   ├── thread-follows.ts
│   │   │   └── thread-subscriptions.ts
│   │   ├── handlers/      # HTTP/WebSocket request handlers
│   │   │   ├── messages.ts
│   │   │   ├── thread-follow.ts
│   │   │   └── thread-subscription.ts
│   │   ├── e2e/           # End-to-end tests
│   │   ├── spec/          # Unit tests
│   │   └── thread-token.ts  # Forum JWT token parsing
│   ├── portal/            # Portal feature module
│   │   ├── routes.ts      # Route registration
│   │   ├── handlers/      # HTTP request handlers
│   │   │   ├── checkout-session.ts
│   │   │   └── entry-state.ts
│   │   ├── lib/
│   │   │   └── stripe/    # Stripe API wrapper utilities
│   │   │       ├── checkout-session.ts
│   │   │       ├── customer.ts
│   │   │       ├── invoice.ts
│   │   │       └── price.ts
│   │   ├── e2e/           # End-to-end tests
│   │   ├── token.ts       # Portal JWT token parsing
│   │   └── token.spec.ts  # Token tests
│   ├── middlewares/       # Express-style middleware
│   │   ├── cors.ts
│   │   └── error-handling.ts
│   ├── utils/             # Utility modules
│   │   ├── lambda-ws-server/  # WebSocket server implementation
│   │   │   ├── index.ts
│   │   │   └── request.ts
│   │   ├── lambda-eventbus-server/  # EventBridge server implementation
│   │   │   ├── index.ts
│   │   │   ├── event-envelope.ts
│   │   │   └── logger.ts
│   │   ├── errors.ts      # Custom error classes
│   │   ├── predicates.ts  # Type guards and validators
│   │   └── rest-responses.ts
│   ├── testutils/         # Testing utilities
│   │   ├── db.ts
│   │   ├── mocks.ts
│   │   ├── token-generator.ts        # Forum token generator
│   │   └── portal-token-generator.ts # Portal token generator
│   ├── config.ts          # Configuration file loader
│   ├── config.spec.ts     # Configuration tests
│   ├── dynamodb.ts        # DynamoDB client configuration
│   ├── handlers.ts        # Lambda entry point
│   └── websocket-client.ts # WebSocket message sender
├── config.json            # Portal configuration (Stripe keys, etc.)
├── serverless.yml         # Serverless Framework configuration
├── tsconfig.json          # TypeScript configuration
├── jest.config.ts         # Jest testing configuration
├── .eslintrc.js          # ESLint rules
└── package.json          # Dependencies and scripts
```

## Core Components

### 1. Global Handler (`src/handlers.ts`)

The unified Lambda entry point that routes requests based on event type:
- **HTTP Requests**: Routes to `lambda-api` REST handler (detected by `httpMethod`)
- **WebSocket Events**: Routes to custom WebSocket server (detected by `eventType` in requestContext)
- **EventBridge Events**: Routes to EventBus server (detected by `detail-type`)
- Handles ALB, API Gateway, and EventBridge events

### 2. REST API (`lambda-api`)

Built on the `lambda-api` library with:
- **Middleware Pipeline**: Error handling → CORS → Route handlers
- **Route Registration**: Modular route registration with prefixes
- **Forum Routes** (`/sls/forum`):
  - `GET /thread/:itemId/:participantId/messages` - Retrieve thread messages
  - `POST /thread/:itemId/:participantId/messages` - Create new message
  - `POST /thread/:itemId/:participantId/follows` - Follow a thread (requires thread token)
  - `DELETE /thread/:itemId/:participantId/follows` - Unfollow a thread (requires identity token)
- **Portal Routes** (`/sls/portal`):
  - `GET /entry-state` - Get payment state for an item
  - `POST /checkout-session` - Create Stripe checkout session
- **Notification Routes** (`/sls/notifications`):
  - `GET /` - List user notifications (last 20)
  - `DELETE /:sk` - Delete notification by sk, or all if sk="all"
  - `PUT /:sk/mark-as-read` - Mark notification as read/unread
- **Common Routes**:
  - `OPTIONS /*` - CORS preflight handling

### 3. WebSocket Server (`src/utils/lambda-ws-server/`)

Custom implementation inspired by `lambda-api`:
- **Event Handling**: CONNECT, DISCONNECT, MESSAGE
- **Action Routing**: Message-based action dispatching
- **Prefix Support**: Namespaced action registration
- **Forum Actions**:
  - `forum.subscribe` - Subscribe to thread updates
  - `forum.unsubscribe` - Unsubscribe from thread
  - `heartbeat` - Connection keep-alive

### 4. EventBus Server (`src/utils/lambda-eventbus-server/`)

Custom implementation for handling EventBridge events:
- **Event Envelope Parsing**: Common envelope structure with Zod validation
- **Version Validation**: Handlers specify supported major version; events with higher versions are skipped
- **Multiple Handlers**: Unlike REST/WebSocket, multiple handlers can react to the same event type
- **Parallel Execution**: Handlers run concurrently via `Promise.allSettled`
- **Structured Logging**: JSON-formatted logs with event metadata

#### Event Envelope Structure
Events from the backend follow a common envelope format:
```json
{
  "version": "1.0",
  "type": "submission_created",
  "source_app": "algoreabackend",
  "instance": "dev",
  "time": "2026-01-23T14:36:20Z",
  "request_id": "unique-request-id",
  "payload": { ... }
}
```

#### Handler Registration
Handlers register with a detail-type and supported version:
```typescript
eb.on('submission_created', handleSubmissionCreated, { supportedMajorVersion: 1 });
```

#### Forum Event Handlers
- `submission_created` - Triggered when a new submission is created
- `thread_status_changed` - Triggered when a thread's status changes (e.g., waiting_for_trainer)
- `grade_saved` - Triggered when a grade is saved for an answer

### 5. Database Layer

#### DynamoDB Configuration (`src/dynamodb.ts`)
- Environment-aware client configuration (local, test, production)
- Type conversion utilities between TypeScript and DynamoDB AttributeValues
- Support for PartiQL queries

#### Base Table Class (`src/dbmodels/table.ts`)
- **Table**: Abstract base class for all models
- **Query Methods**:
  - `sqlWrite()`: Execute write operations (single or transaction)
  - `sqlRead()`: Execute read queries with pagination
  - `batchUpdate()`: Batch write operations (max 25 items)
- **Error Handling**: Wraps AWS errors with contextual information

#### Singleton Pattern

Each `Table` subclass exports a singleton instance for use across the application:

```typescript
// Each table module exports both the class and a singleton instance
export class UserConnections extends Table { ... }
export const userConnectionsTable = new UserConnections(dynamodb);
```

**Available singletons**:
- `userConnectionsTable` - User WebSocket connections
- `threadSubscriptionsTable` - Thread subscription management
- `threadFollowsTable` - Thread follow management
- `threadEventsTable` - Thread messages and events
- `notificationsTable` - User notifications

**Rationale**: Table classes are stateless (only hold a reference to the shared `dynamodb` client). Singletons eliminate redundant instantiation and simplify function signatures by removing dependency injection parameters.

**Usage**:
```typescript
// Import and use directly - no need to pass as parameters
import { userConnectionsTable } from '../dbmodels/user-connections';

await userConnectionsTable.insert(connectionId, userId);
```

**Testing**: The class is still exported for tests that need fresh instances or mocking.

#### Data Models

**ThreadEvents** (`src/forum/dbmodels/thread-events.ts`)
- Stores forum messages and events
- Schema: `pk` (thread identifier), `sk` (timestamp), `label` (event type), `data` (event payload)
- Discriminated union types using Zod for type-safe event handling
- Supports batch insertion and querying with limits

**ThreadSubscriptions** (`src/forum/dbmodels/thread-subscriptions.ts`)
- Manages WebSocket connection subscriptions to threads
- Schema: `pk` (thread identifier), `sk` (subscription time), `connectionId`, `userId`, `ttl` (2 hours)
- Auto-cleanup of stale connections via DynamoDB TTL
- Supports subscription management and connection cleanup

**ThreadFollows** (`src/forum/dbmodels/thread-follows.ts`)
- Manages persistent user follows for threads (for notifications)
- Schema: `pk` (thread identifier + #FOLLOW), `sk` (follow time), `userId`
- Unlike subscriptions, follows persist across sessions
- Used to determine who should receive notifications about thread activity

**Notifications** (`src/dbmodels/notifications.ts`)
- Stores per-user notifications with auto-expiration
- Schema: `pk` ({stage}#USER#{userId}#NOTIF), `sk` (creation time ms), `notificationType`, `payload`, `readTime`, `ttl`
- TTL: ~2 months (auto-cleanup via DynamoDB TTL)
- `readTime`: timestamp when marked as read (undefined = unread)
- Supports listing, deletion, and read status management

### 6. Authentication

JWT-based authentication using JOSE library with a shared verification layer:

#### Shared Authentication Module (`src/auth/jwt.ts`)

Core JWT verification functions used by both forum and portal:
- **Algorithm**: ES256 (ECDSA with P-256 curve)
- **Verification**: Public key from environment variable `BACKEND_PUBLIC_KEY`
- **Functions**:
  - `verifyJwt(token, publicKey)`: Verifies JWT signature and returns payload
  - `extractBearerToken(authHeader)`: Extracts JWT from "Bearer {token}" format
  - `shouldVerifySignature()`: Determines if verification should be skipped (dev mode)
- **Development Mode**: `NO_SIG_CHECK=1` allows skipping signature verification in dev environment only
  - Uses `decodeJwt()` instead of `jwtVerify()` when enabled
  - Throws `ServerError` if `NO_SIG_CHECK=1` is set in non-dev stages

#### Identity Token Module (`src/auth/identity-token.ts`)

Generic token for user identification (used by notifications and some forum endpoints):
- **Token Sources**: HTTP Authorization header (Bearer) only
- **Token Payload**:
  - `user_id`: User identifier
  - `exp`: Token expiration time
- **Functions**:
  - `parseIdentityToken(token, publicKey)`: Validates and transforms identity token
- **Middleware**: `requireIdentityToken` attaches parsed token to request as `req.identityToken`
- **Usage**: Used for endpoints that only need user identification (notifications, unfollowing threads)

#### Forum Thread Token Module (`src/forum/thread-token.ts`)

Domain-specific token parsing for forum thread operations:
- **Token Sources**: HTTP Authorization header (Bearer) or WebSocket message body
- **Token Payload**:
  - `participant_id`: Forum participant identifier
  - `item_id`: Item/discussion identifier
  - `user_id`: User identifier
  - `can_watch`: Read permission
  - `can_write`: Write permission
  - `is_mine`: Ownership flag
- **Functions**:
  - `parseToken(token, publicKey)`: Validates and transforms forum token
  - `extractTokenFromHttp(headers)`: Extracts and parses from HTTP headers
  - `extractTokenFromWs(body)`: Extracts and parses from WebSocket message
- **Middleware**: `requireThreadToken` attaches parsed token to request as `req.threadToken`

#### Portal Token Module (`src/portal/token.ts`)

Domain-specific token parsing for portal features:
- **Token Sources**: HTTP Authorization header (Bearer) only
- **Token Payload**:
  - `item_id`: Item identifier
  - `user_id`: User identifier
  - `firstname`: User's first name
  - `lastname`: User's last name
  - `email`: User's email address
- **Functions**:
  - `parseToken(token, publicKey)`: Validates and transforms portal token
  - `extractTokenFromHttp(headers)`: Extracts and parses from HTTP headers
- **Usage**: Used for payment-related operations and Stripe customer management

### 7. WebSocket Client (`src/websocket-client.ts`)

Manages outbound WebSocket messages to connected clients:
- **API Gateway Management**: Posts messages to connections
- **Message Types**: Typed message actions (e.g., `forum.message.new`)
- **Error Handling**: Graceful handling of closed connections (GoneException)
- **Bulk Send**: Sends to multiple connections with deduplication
- **Connection Cleanup**: Identifies stale connections for removal

### 8. Middleware

**Error Handling** (`src/middlewares/error-handling.ts`)
- Catches and transforms errors to appropriate HTTP responses
- Error types mapped to status codes:
  - `DecodingError` → 400 Bad Request
  - `Forbidden` → 403 Forbidden
  - `RouteError` → 404 Not Found
  - `DBError` → 500 Internal Server Error
  - Generic errors → 500

**CORS** (`src/middlewares/cors.ts`)
- Applies CORS headers to all responses
- Supports OPTIONS preflight requests

### 9. Configuration System (`src/config.ts`)

Configuration file management for portal features:
- **Config File**: `config.json` at project root
- **Schema Validation**: Zod-based schema for type safety
- **Structure**:
  ```json
  {
    "portal": {
      "payment": {
        "stripe": {
          "sk": "stripe_secret_key"
        }
      }
    }
  }
  ```
- **Functions**:
  - `loadConfig()`: Loads and validates configuration from config.json
  - Returns empty config `{}` if file doesn't exist or is invalid
- **Usage**: Portal services use config to determine payment state (disabled/unpaid/paid)

### 10. Custom Error Classes (`src/utils/errors.ts`)

Typed error hierarchy for better error handling:
- `DBError`: Database operation failures (includes statement details)
- `DecodingError`: JWT or request parsing errors
- `RouteNotFound`: Invalid routes/actions
- `Forbidden`: Authorization failures
- `AuthenticationError`: JWT verification or token extraction failures
- `ServerError`: Configuration or unexpected errors
- `OperationSkipped`: Non-error warnings

## Data Model

### DynamoDB Table Schema

Single table design with composite keys:

```
Table: alg-serverless-fioi-*
- Partition Key (pk): STRING - Composite key identifying entity type
- Sort Key (sk): NUMBER - Timestamp or identifier
- Attributes: Varies by entity type
- TTL: Enabled on 'ttl' attribute (auto-cleanup)
- Billing: PAY_PER_REQUEST (on-demand)
```

### Entity Types

#### Thread Events
```
pk: {STAGE}#THREAD#{participantId}#{itemId}#EVENTS
sk: {timestamp}
label: "forum.message"
data: {
  authorId: string
  text: string
  uuid: string
}
```

#### Thread Subscriptions
```
pk: {STAGE}#THREAD#{participantId}#{itemId}#SUB
sk: {timestamp}
connectionId: string
userId: string
ttl: {timestamp + 7200} (2 hours)
```

#### Thread Follows
```
pk: {STAGE}#THREAD#{participantId}#{itemId}#FOLLOW
sk: {timestamp}
userId: string
```

#### User Notifications
```
pk: {STAGE}#USER#{userId}#NOTIF
sk: {timestamp} (creation time in milliseconds)
notificationType: string
payload: Record<string, unknown>
readTime?: number (milliseconds, when marked as read)
ttl: {timestamp + ~5184000} (~60 days, in seconds since epoch)
```

### Key Design Patterns

1. **Composite Keys**: Embed multiple identifiers in partition key for efficient querying
2. **Stage Isolation**: Environment prefix prevents data mixing across stages
3. **Time-Based Sorting**: Use timestamps as sort keys for chronological ordering
4. **TTL Cleanup**: Automatic removal of expired subscriptions
5. **Discriminated Unions**: Type-safe event handling with Zod schemas

## Request/Response Flow Examples

### Creating a Message (REST)

```
1. POST /sls/forum/message
   Headers: Authorization: Bearer {JWT}
   Body: { text: "Hello", uuid: "abc-123" }

2. Middleware: CORS headers added

3. Token extraction and validation
   - Verify JWT signature
   - Extract participantId, itemId, userId, canWrite
   - Check canWrite permission

4. Business Logic
   - Generate timestamp
   - Create message event in DynamoDB
   - Query thread subscribers

5. WebSocket Broadcast
   - Send message to all subscribers
   - Handle closed connections (GoneException)
   - Remove stale subscriptions

6. Response: 201 Created
```

### Subscribing to Thread (WebSocket)

```
1. WebSocket MESSAGE event
   Body: { action: "forum.subscribe", token: "{JWT}" }

2. Action routing
   - Parse action from message body
   - Route to subscribe handler

3. Token validation
   - Extract token from body
   - Verify JWT signature
   - Extract participantId, itemId, userId

4. Database Operation
   - Insert subscription record
   - pk: {stage}#THREAD#{participantId}#{itemId}#SUB
   - sk: current timestamp
   - connectionId: from API Gateway
   - ttl: current time + 2 hours

5. Response: 200 OK (to API Gateway)
```

### Receiving New Messages (WebSocket Push)

```
1. New message created via REST API

2. Query subscribers from DynamoDB
   - SELECT connectionId, sk WHERE pk = ?

3. Prepare message payload
   {
     action: "forum.message.new",
     participantId, itemId, authorId,
     time, text, uuid
   }

4. Send to all subscribers
   - PostToConnection API call for each
   - Track success/failure results

5. Cleanup stale connections
   - Identify GoneException errors
   - Delete subscription records for gone connections
```

## Environment Configuration

### Environment Variables

- `STAGE`: Deployment stage (local, test, dev, production)
- `NO_SIG_CHECK`: Skip JWT signature verification (dev only, defaults to '0')
- `TABLE_NAME`: DynamoDB table name
- `BACKEND_PUBLIC_KEY`: JWT verification public key (PEM format)
- `APIGW_ENDPOINT`: API Gateway endpoint for WebSocket messages
- `OPS_BUCKET`: S3 bucket for deployment artifacts

### Stage-Specific Behavior

**local**: Serverless Offline, local DynamoDB
- DynamoDB: localhost:7000
- WebSocket: localhost:3001
- In-memory database

**test**: Jest testing environment
- DynamoDB: localhost:8000
- Fake AWS credentials
- Isolated test data

**dev/production**: AWS deployment
- Real AWS resources
- IAM role-based authentication
- Production DynamoDB

## IAM Permissions

Lambda execution role requires:
- `execute-api:ManageConnections` - WebSocket message posting
- `dynamodb:GetItem` - Read operations
- `dynamodb:Query` - Query operations
- `dynamodb:PutItem` - Insert operations
- `dynamodb:UpdateItem` - Update operations
- `dynamodb:BatchWriteItem` - Batch operations
- `dynamodb:DeleteItem` - Delete operations
- `dynamodb:PartiQL*` - PartiQL query support

## Deployment

### CI/CD Pipeline (CircleCI)

**On Every Commit**:
- Run tests using Jest
- Node.js 20 Alpine container

**On Version Tag** (vX.Y.Z):
- Run tests
- Create GitHub release
- Extract changelog for release notes

### Manual Deployment

```bash
# Deploy full stack
sls deploy --aws-profile <profile>

# Deploy function only (faster)
sls deploy -f server --aws-profile <profile>
```

### Post-Deployment Setup

Manual API Gateway configuration required:
- WebSocket routes: $connect, $disconnect, $default
- ALB target group configuration
- Lambda alias setup for operations

## Development Practices

### Code Organization

- **File Size Limit**: Maximum 300 lines per file
- **Try Block Scope**: Minimal try blocks for specific error catching
- **Modular Structure**: Feature-based organization (forum/)
- **Separation of Concerns**:
  - Routes: API endpoint registration
  - Handlers: HTTP/WebSocket request handlers
  - lib/: Utility modules (e.g., Stripe API wrappers)
  - Models: Data access layer
  - Utils: Reusable utilities

### Type Safety

- **Strict TypeScript**: All strict mode options enabled
- **Runtime Validation**: Zod schemas for external data
- **Type Inference**: Prefer inference when obvious
- **No Any**: Avoid `any`, use `unknown` for uncertain types
- **Explicit Return Types**: Required for all functions

### REST Response Helpers

Use standard response helpers from `src/utils/rest-responses.ts` for consistent API responses:

- **`created(resp)`**: For POST requests that create resources. Sets status 201, returns `{ message: 'created', success: true }`
- **`deleted(resp)`**: For DELETE requests. Sets status 200, returns `{ message: 'deleted', success: true }`

```typescript
import { created, deleted } from '../utils/rest-responses';

// POST handler
async function create(req: Request, resp: Response) {
  await db.insert(...);
  return created(resp);
}

// DELETE handler
async function remove(req: Request, resp: Response) {
  await db.delete(...);
  return deleted(resp);
}
```

### Error Handling

- **Custom Error Classes**: Typed errors for specific failure modes
- **Error Context**: Include relevant details (statements, tokens)
- **Graceful Degradation**: Log warnings for non-critical failures
- **User-Friendly Messages**: Map technical errors to HTTP responses

### Testing

- **Framework**: Jest with ts-jest transformer
- **Environment**: Node.js test environment
- **Coverage**: V8 coverage provider
- **Test Files**: `*.spec.ts` and `*.test.ts` patterns
- **Test Utils**: Mock factories and database helpers

### Code Quality

- **Linting**: ESLint with TypeScript plugin
- **Style Guide**: Enforced via ESLint rules
  - Camel case naming
  - Single quotes
  - 2-space indentation
  - 140 character line length
  - Comma delimiters for type members
  - Explicit function return types
- **Pre-commit Hooks**: Husky + lint-staged
- **No Console**: Console statements trigger errors (except in handlers and lib/)

### Documentation

- **Architecture**: This document (ARCHITECTURE.md)
- **Plans**: Implementation plans in .cursor/plans/
- **Code Comments**: Inline documentation for complex logic
- **Type Definitions**: Self-documenting via TypeScript types

## Scalability Considerations

### Current Design

- **Serverless Compute**: Auto-scales with traffic
- **On-Demand DynamoDB**: Scales read/write capacity automatically
- **Stateless Design**: No server-side session state
- **Connection Limits**: API Gateway WebSocket 2-hour connection limit

### Potential Bottlenecks

- **Batch Size**: DynamoDB batch operations limited to 25 items
- **WebSocket Broadcast**: Sequential sends to subscribers
- **Single Table**: All data in one DynamoDB table

### Optimization Strategies

- **Connection Pooling**: Reuse DynamoDB and API Gateway clients
- **Batch Operations**: Use batch writes for multiple items
- **Parallel Sends**: Promise.all for WebSocket broadcasts
- **TTL Cleanup**: Automatic removal of expired data
- **Query Limits**: Pagination support for large result sets

## Security

### Authentication & Authorization

- **JWT Tokens**: Signed with ES256 algorithm
- **Token Verification**: Every request validates signature
- **Permission Checks**: canWatch, canWrite flags enforce access control
- **User Context**: All operations linked to authenticated user

### Data Protection

- **Input Validation**: Zod schemas validate all external input
- **SQL Injection Prevention**: Parameterized PartiQL queries
- **CORS**: Controlled cross-origin access
- **Error Messages**: No sensitive data in error responses

### Infrastructure Security

- **IAM Roles**: Least-privilege principle
- **VPC**: Can be configured for private DynamoDB access
- **Encryption**: DynamoDB encryption at rest (AWS managed)
- **TLS**: All traffic encrypted in transit

## Monitoring & Observability

### Logging

- **Console Logging**: Structured logs for operations
- **Error Logging**: Detailed error context
- **Send Results**: WebSocket delivery status tracking
- **Lambda Logs**: Automatic CloudWatch Logs integration

### Metrics

- **Lambda Metrics**: Duration, errors, invocations (CloudWatch)
- **API Gateway Metrics**: Connection count, message count
- **DynamoDB Metrics**: Read/write capacity, throttling

## Testing

### Test Infrastructure

The project includes comprehensive testing infrastructure:

- **Test Framework**: Jest with TypeScript support (`ts-jest`)
- **Test Environment**: NODE_ENV=test with dedicated test configuration
- **DynamoDB Local**: `serverless-dynamodb` for local database testing
- **Test Utilities**: Located in `src/testutils/`
  - `token-generator.ts`: JWT token generation for authentication tests
  - `mock-ws-client.ts`: Mock WebSocket client for testing broadcasts
  - `fixtures.ts`: Test data creation helpers
  - `db.ts`: Database utilities (loadFixture, clearTable)
  - `event-mocks.ts`: AWS event factories for unit tests

### Test Structure

Tests are organized by type:

1. **Unit Tests** (`*.spec.ts`): Co-located with source files
   - Test individual functions and classes in isolation
   - Mock external dependencies
   - Fast execution, no database required

2. **Database Model Tests** (`src/dbmodels/**/*.spec.ts`):
   - Test database interactions with DynamoDB Local
   - Verify CRUD operations and queries
   - Test data isolation between threads

3. **Handler Tests** (`src/forum/handlers/**/*.spec.ts`):
   - Test business logic with mocked dependencies
   - Verify WebSocket broadcasting behavior
   - Test permission enforcement

4. **E2E Tests** (`src/forum/e2e/**/*.spec.ts`):
   - Test complete request flows through the global handler
   - Verify integration between REST, WebSocket, and database
   - Organized by concern:
     - `message-flow.spec.ts`: Complete message lifecycle scenarios
     - `thread-isolation.spec.ts`: Multi-thread isolation tests
     - `permissions.spec.ts`: Authentication and authorization tests

### Test Setup

- **Global Setup** (`jest.setup.ts`):
  - Starts DynamoDB Local on port 8000
  - Creates test database schema
  - Sets test environment variables

- **Global Teardown** (`jest.teardown.ts`):
  - Stops DynamoDB Local process
  - Cleans up test resources

- **Test Configuration** (`jest.config.ts`):
  - TypeScript transformation via ts-jest
  - 10-second test timeout
  - Test match patterns for `*.spec.ts` files
  - Global setup/teardown hooks

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- path/to/test.spec.ts

# Run tests in watch mode
npm test -- --watch

# Run with coverage
npm test -- --coverage
```

### Test Best Practices

- Each test file should be independent and isolated
- Use `beforeEach` to clear database state between tests
- Initialize JWT keys in `beforeAll` hooks
- Mock external services (WebSocket client, AWS SDK)
- Use descriptive test names that explain the scenario
- Test both happy paths and error conditions

### Test Coverage

The project maintains comprehensive test coverage across all layers:
- Database models with DynamoDB Local
- Service layer with mocked dependencies  
- E2E tests verifying complete request flows
- Authentication and authorization enforcement
- WebSocket broadcasting and connection management

### Resolved DynamoDB Local Limitations

Two issues that previously prevented full test coverage in DynamoDB Local have been resolved:

1. **LIMIT Clause Issue** - Resolved by refactoring `ThreadSubscriptions` to use `getSubscribers()` with optional filtering instead of `getSubscriber()` with LIMIT clause.

2. **ORDER BY DESC Issue** - Resolved by migrating `ThreadEvents.getAllMessages()` from PartiQL queries to the standard DynamoDB Query API, which properly supports descending order via `ScanIndexForward: false`.

## Future Improvements

### Possible Enhancements

- **Enhanced Error Recovery**: Retry logic for transient failures
- **Presence Detection**: Track online/offline user status
- **Read Receipts**: Track message read status
- **File Attachments**: Support for media in messages
- **Analytics**: User engagement and usage metrics
- **Performance Testing**: Load testing for WebSocket broadcasts

### Technical Debt

- **Test Coverage**: Expand test coverage for edge cases
- **Documentation**: API documentation (OpenAPI/Swagger)
- **Connection Validation**: Check for duplicate subscriptions
- **Error Recovery**: Handle edge cases in subscription cleanup
- **DynamoDB Local**: Improve reliability of test database startup

## Portal Feature (Parts 1-5)

### Overview

The portal module provides payment-related functionality for the Algorea platform. It follows the same architectural patterns as the forum module but focuses on payment state management and Stripe integration.

### Portal Handlers

#### Entry State Handler (`src/portal/handlers/entry-state.ts`)

- **Endpoint**: `GET /sls/portal/entry-state`
- **Authentication**: Required (Bearer token in Authorization header)
- **Purpose**: Returns payment state for an item
- **Response**:
  ```json
  {
    "payment": {
      "state": "disabled" | "unpaid" | "paid"
    }
  }
  ```
- **Payment States**:
  - `disabled`: Payment not configured (no `portal.payment` in config.json or Stripe client unavailable)
  - `unpaid`: Payment configured but no paid invoice found in Stripe
  - `paid`: Payment completed (paid invoice exists in Stripe)

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Shared Auth Layer                        │
│  src/auth/jwt.ts (verifyJwt, extractBearerToken)           │
│  - ES256 signature verification                             │
│  - Bearer token extraction                                   │
│  - NO_SIG_CHECK dev mode support                            │
└─────────────┬───────────────────────────┬───────────────────┘
              │                           │
    ┌─────────▼──────────┐    ┌──────────▼─────────┐
    │  Forum Token       │    │  Portal Token      │
    │  src/forum/token.ts│    │  src/portal/token.ts│
    │                    │    │                     │
    │  Payload:          │    │  Payload:           │
    │  - participant_id  │    │  - item_id          │
    │  - item_id         │    │  - user_id          │
    │  - user_id         │    │  - firstname        │
    │  - can_watch       │    │  - lastname         │
    │  - can_write       │    │  - email            │
    │  - is_mine         │    │                     │
    └─────────┬──────────┘    └──────────┬─────────┘
              │                           │
    ┌─────────▼──────────┐    ┌──────────▼─────────────┐
    │  Forum Handlers    │    │  Portal Handlers       │
    │  - messages        │    │  - entry-state         │
    │  - subscriptions   │    │  - stripe-customer     │
    └────────────────────┘    │  - stripe-invoice      │
                              │  (+ checkout Part 7)   │
                              └────────────────────────┘
```

### Configuration-Driven Behavior

The portal uses a configuration file (`config.json`) to control payment features:

1. **No config or empty portal config** → Payment state: "disabled"
2. **portal.payment configured** → Query Stripe API to determine "paid" or "unpaid"

This allows:
- Easy feature toggles without code changes
- Environment-specific payment configurations (test vs live Stripe keys)
- Graceful degradation when Stripe is not configured

### Authentication Flow

#### Portal Request Flow

1. Client sends HTTP request to `GET /sls/portal/entry-state`
2. Request includes `Authorization: Bearer {JWT}` header
3. Portal service calls `extractTokenFromHttp(headers)`
4. Shared auth module:
   - Extracts Bearer token from header
   - Calls `shouldVerifySignature()` to check NO_SIG_CHECK
   - Verifies JWT signature (or decodes without verification in dev mode)
   - Returns raw JWT payload
5. Portal token module:
   - Validates payload against portal schema (Zod)
   - Transforms to PortalToken interface
   - Returns typed token with user info
6. Service logic:
   - Uses token data (userId, name, email) for Stripe customer management
   - Queries Stripe API to check payment status
   - Returns payment state: "disabled", "unpaid", or "paid"

### Testing Infrastructure

Portal tests follow the same patterns as forum tests:

- **Unit Tests**:
  - `src/portal/token.spec.ts`: Token parsing and validation
  - `src/portal/handlers/entry-state.spec.ts`: Entry state handler with Stripe integration (16 tests)
  - `src/portal/lib/stripe/customer.spec.ts`: Customer management (4 tests)
  - `src/portal/lib/stripe/invoice.spec.ts`: Invoice checking (4 tests)
  - `src/stripe.spec.ts`: Stripe client initialization (4 tests)
  - Total: 40+ tests for portal functionality

- **E2E Tests** (`src/portal/e2e/entry-state.spec.ts`):
  - Test complete request flows through global handler
  - Verify authentication requirements
  - Test configuration-driven behavior

- **Test Utilities**:
  - `portal-token-generator.ts`: Generates valid portal tokens for tests
  - Shares key pair with forum token generator for consistency

### Development Features

#### NO_SIG_CHECK Environment Variable

For local development without a valid backend public key:

- **Purpose**: Skip JWT signature verification in dev environment
- **Usage**: Set `NO_SIG_CHECK=1` in environment or .env file
- **Safety**: Only works when `STAGE=dev`, throws `ServerError` in other environments
- **Behavior**: Uses `decodeJwt()` instead of `jwtVerify()` to parse tokens without verification
- **Benefits**:
  - Simplified local development setup
  - Test with mock tokens easily
  - No need for valid signing keys in development

### Stripe Integration (Part 6)

#### Overview

The portal integrates with Stripe to check payment status for items. The entry-state service queries Stripe to determine if a user has paid for a specific item.

#### Stripe Client (`src/stripe.ts`)

- **Purpose**: Initialize and provide Stripe client instance
- **Function**: `getStripeClient(): Stripe | null`
  - Loads config from `config.json`
  - Returns Stripe client if valid secret key exists
  - Returns `null` if no config (graceful degradation)
- **API Version**: `2025-12-15.clover`
- **Configuration**: Secret key from `config.portal.payment.stripe.sk`

#### Customer Management (`src/portal/lib/stripe/customer.ts`)

Manages Stripe customers linked to Algorea users via metadata:

- **Function**: `findOrCreateCustomer(stripe, userId, name, email): Promise<string>`
- **Behavior**:
  1. Search for customer by `metadata['user_id']` using Stripe search API
  2. If 0 results: Create new customer with name, email, and `user_id` in metadata
  3. If 1 result: Return customer ID
  4. If >1 results: Log warning and return first customer ID
- **Customer Fields**:
  - `name`: Concatenation of `firstname` and `lastname` from token
  - `email`: Email from token
  - `metadata.user_id`: User ID from token (for linking)

#### Invoice Checking (`src/portal/lib/stripe/invoice.ts`)

Checks if a customer has paid for a specific item:

- **Function**: `hasPaidInvoice(stripe, customerId, itemId): Promise<boolean>`
- **Behavior**:
  1. Search invoices using Stripe search API with query:
     - `customer:'${customerId}'`
     - `metadata['item_id']:'${itemId}'`
     - `status:'paid'`
  2. If 0 results: Return `false`
  3. If >=1 results: Return `true` (log warning if >1)
- **Returns**: Boolean indicating payment status

#### Entry State Service Flow

```
1. Extract and validate JWT token
2. Check if payment is configured in config.json
   → If not: return "disabled"
3. Get Stripe client
   → If null: return "disabled"
4. Find or create customer using token data
   → userId, firstname + lastname, email
5. Check if customer has paid invoice for item
   → Query by customerId and itemId
6. Return payment state:
   → "paid" if invoice found
   → "unpaid" if no invoice found
   → "unpaid" on Stripe API error (with error logging)
```

#### Error Handling

- **Stripe API Errors**: Caught and logged, service returns "unpaid" state
- **Network Errors**: Same behavior as API errors
- **Invalid API Key**: Returns "disabled" if Stripe client cannot be created
- **Missing Config**: Returns "disabled" gracefully

#### Data Model

**Customer Metadata**:
```json
{
  "user_id": "string" // Links Stripe customer to Algorea user
}
```

**Invoice Metadata** (expected):
```json
{
  "item_id": "string" // Links invoice to Algorea item
}
```

#### Testing

- **Unit Tests**:
  - `src/stripe.spec.ts`: Stripe client initialization
  - `src/portal/lib/stripe/customer.spec.ts`: Customer management (12 tests)
  - `src/portal/lib/stripe/invoice.spec.ts`: Invoice checking (4 tests)
  - `src/portal/handlers/entry-state.spec.ts`: Updated with paid state tests (16 tests)
- **Mocking**: Stripe SDK methods mocked for unit tests
- **E2E Tests**: Full request flow with actual Stripe API calls (optional)

#### Configuration

**File**: `config.json`
```json
{
  "portal": {
    "payment": {
      "stripe": {
        "sk": "sk_test_YOUR_STRIPE_SECRET_KEY"
      }
    }
  }
}
```

**Note**: Secret key can be test or live key. For development, use Stripe test mode keys (`sk_test_*`).

### Checkout Session Service (Part 7)

#### Overview

The checkout session service enables users to initiate payments through Stripe Checkout. It creates a custom UI checkout session with automatic tax calculation, billing address collection, and invoice generation.

#### Endpoint

**POST /sls/portal/checkout-session**

- **Authentication**: Required (Bearer token in Authorization header)
- **Request Body**:
  ```json
  {
    "return_url": "https://example.com/return"
  }
  ```
- **Response**:
  ```json
  {
    "client_secret": "cs_test_..."
  }
  ```

#### Architecture Components

**Price Search** (`src/portal/lib/stripe/price.ts`)
- **Function**: `findPriceByItemId(stripe, itemId): Promise<string>`
- **Purpose**: Locate Stripe price by item_id metadata
- **Behavior**:
  - Uses Stripe search API with query: `active:'true' AND metadata['item_id']:'{itemId}'`
  - Search API is safe to use here since prices are created in advance (no indexing delay issues)
  - Throws `DecodingError` if no price found (returns 400 to client)
  - Logs warning if multiple prices found, returns first

**Checkout Session** (`src/portal/lib/stripe/checkout-session.ts`)
- **Function**: `createCheckoutSession(stripe, customerId, priceId, itemId, returnUrl): Promise<string>`
- **Purpose**: Create Stripe checkout session with payment configuration
- **Configuration**:
  - `automatic_tax.enabled: true` - Automatic tax calculation
  - `customer_update.address: 'auto'` - Save billing address to customer
  - `customer_update.name: 'auto'` - Save business name to customer (required for tax ID collection)
  - `ui_mode: embedded` - Embedded UI integration in custom frontend
  - `billing_address_collection: required` - Collect billing address
  - `invoice_creation.enabled: true` - Generate invoice on payment
  - `invoice_creation.invoice_data.metadata.item_id` - Link invoice to item
  - `tax_id_collection.enabled: true, required: 'if_supported'` - Enable optional tax ID collection
  - `allow_promotion_codes: false` - No promo codes
  - `mode: payment` - One-time payment

**Checkout Session Handler** (`src/portal/handlers/checkout-session.ts`)
- Orchestrates the checkout session creation flow
- Validates request body with Zod schema
- Reuses existing customer management service
- Error handling:
  - `DecodingError` for missing price → 400 Bad Request
  - `ServerError` for configuration/Stripe errors → 500 Internal Server Error
  - Token errors → 401 Unauthorized

#### Request Flow

```
1. Client sends POST /portal/checkout-session with token and return_url
2. Extract and validate JWT token (item_id, user_id, name, email)
3. Validate request body contains return_url
4. Check payment configuration exists
5. Get Stripe client instance
6. Find or create customer (reuse existing service)
7. Find price by item_id metadata
8. Create checkout session with configuration
9. Return client_secret to client
10. Client uses client_secret to render Stripe Checkout UI
```

#### Invoice Creation

When payment completes, Stripe automatically creates an invoice with:
- `metadata.item_id` - Links invoice to the Algorea item
- `status: paid` - Payment confirmation
- Customer ID - Links to Algorea user

This invoice is then detected by the entry-state service, which returns `"paid"` status.

#### Error Responses

**400 Bad Request** - Missing return_url:
```json
{
  "error": "Missing or invalid return_url in request body"
}
```

**400 Bad Request** - Price not found:
```json
{
  "error": "No price found for item"
}
```

**500 Internal Server Error** - Stripe errors:
```json
{
  "error": "Failed to create checkout session"
}
```

#### Testing

**Unit Tests**:
- `stripe-price.spec.ts` (5 tests) - Price lookup logic
- `checkout-session.spec.ts` (5 tests) - Session creation parameters
- `checkout-session-handler.spec.ts` (8 tests) - Handler orchestration and error cases

**E2E Tests** (`checkout-session.spec.ts`, 8 tests):
- Successful checkout session creation flow
- Missing return_url validation
- Price not found error handling
- Authentication requirements
- Configuration validation
- CORS preflight support

**Test Data**: Uses static product+price with `item_id: "test-premium-access-001"`

#### Integration with Entry State

The checkout session and entry-state services work together:

1. **Entry State Check**: Client calls `GET /entry-state` → returns `"unpaid"`
2. **Payment Flow**: Client calls `POST /checkout-session` → receives `client_secret`
3. **Stripe Checkout**: Client renders Stripe UI with `client_secret`
4. **Payment Complete**: Stripe creates invoice with `item_id` metadata
5. **Verification**: Client calls `GET /entry-state` → returns `"paid"`

This creates a complete payment verification cycle.

## Notifications Feature

### Overview

The notifications module provides per-user notification storage and management. It's an app-level feature (not specific to forum or portal) that can be used by any part of the system.

### REST API Endpoints

All endpoints require identity token authentication (Bearer token in Authorization header).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/sls/notifications` | Return last 20 notifications (newest first) |
| DELETE | `/sls/notifications/:sk` | Delete notification by sk, or all if sk="all" |
| PUT | `/sls/notifications/:sk/mark-as-read` | Mark as read/unread (defaults to read if no body) |

### Request/Response Examples

**GET /notifications**
```json
{
  "notifications": [
    {
      "sk": 1706000000000,
      "notificationType": "forum.reply",
      "payload": { "threadId": "...", "message": "..." },
      "readTime": 1706100000000
    }
  ]
}
```

**PUT /notifications/:sk/mark-as-read**
```json
// Request body (optional, defaults to { "read": true })
{ "read": true }

// Response
{ "status": "ok" }
```

### Database Model

- **PK**: `{stage}#USER#{userId}#NOTIF`
- **SK**: Creation time (milliseconds)
- **TTL**: ~2 months (auto-cleanup)
- **readTime**: Timestamp when marked as read (undefined = unread)

### Architecture

```
src/
├── handlers/notifications.ts     # Request handlers
├── routes/notifications.ts       # Route registration
└── dbmodels/notifications.ts     # Database model
```

The handlers use the identity token middleware (`requireIdentityToken`) which extracts `userId` from the JWT token.

## Related Documentation

- `README.md`: Installation and getting started
- `CHANGELOG.md`: Version history and changes
- `AGENTS.md`: AI assistant context and guidelines
- `.cursor/rules/`: Coding standards and practices
- `.cursor/features/251217-portal.md`: Portal feature specification
- `.cursor/plans/`: Implementation plans for portal features
