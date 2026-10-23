# Authentication

Every request is authorized by a JWT minted by AlgoreaBackend. Serverless never issues tokens.

## Verification (`src/auth/jwt.ts`)

- `verifyJwt(token, publicKeyPem)`: verifies the signature with `BACKEND_PUBLIC_KEY` (SPKI PEM imported as **RS512**) and enforces `exp` / `nbf`. Newlines stripped from the PEM by the environment are restored first.
- `verifyJwtSignatureOnly(token, publicKeyPem)`: signature only, no clock claims. Used for group-results export completion, which can arrive after the token's 1 h lifetime.
- `extractBearerToken(header)`: `Authorization: Bearer <jwt>`; throws `AuthenticationError` when missing or malformed.
- `NO_SIG_CHECK=1` decodes without verifying. Allowed only when `STAGE=dev`; any other stage throws `ServerError`.

Tokens carrying a `date` claim (`dd-mm-yyyy`) must match yesterday, today or tomorrow in UTC (`validateTokenDate` in `token-date.ts`).

## Token types

Each parser Zod-validates the payload and maps snake_case claims to a camelCase interface. Each middleware attaches the result to the request.

| Token | File | Key claims | Middleware → request field | Extra checks | Used by |
|-------|------|-----------|-----------------------------|--------------|---------|
| Identity | `auth/identity-token.ts` (+ `identity-token-middleware.ts`) | `user_id`, `exp` | `requireIdentityToken` → `identityToken` | — | notifications, stats, validations, unfollow / follow status, export download; WS `$connect` via `?token=` |
| Thread | `forum/thread-token.ts` | `participant_id`, `item_id`, `user_id`, `is_mine`, `can_watch`, `can_write` | `requireThreadToken` → `threadToken` | token `itemId` / `participantId` must match route params (`Forbidden`); `extractThreadTokenFromWs` reads `body.token` | forum messages, follow, WS subscribe/unsubscribe |
| Task | `auth/task-token.ts` | `idUser` (→ `participantId`), `idItemLocal` (→ `itemId`), `date`, `bSubmissionPossible` | `requireTaskToken` / `requireNonReadonlyTaskToken` → `taskToken` | date; the non-readonly variant rejects `bSubmissionPossible = false` (observing another user, ended contest) with `Forbidden` | task sessions (non-readonly) |
| Permissions | `auth/permissions-token.ts` | `user_id`, `item_id`, `can_view`, `can_grant_view`, `can_watch`, `can_edit`, `is_owner`, `date`, `exp` | `requirePermissionsToken({ requireEditAll? })` → `permissionsToken` | date, `exp`; `requireEditAll` needs `can_edit >= "all"` or `is_owner` | task stats |
| Portal | `portal/token.ts` | `item_id`, `user_id`, `firstname`, `lastname`, `email` | `requirePortalToken` → `portalToken` | — | portal entry state, checkout |
| Group results | `group-results-exports/token.ts` | `user_id`, `group_id`, `item_ids`, `date`, `exp` | `requireGroupResultsToken` → `groupResultsToken` (keeps `raw` JWT) | date, `exp` (skipped by the signature-only parse) | export request; completion event |

Permission enums are ordered (`can_edit`: `none` < `children` < `all` < `all_with_grant`), so "at least" checks compare indexes.

## Adding a token type

Zod payload schema → `parseXxxToken` built on `verifyJwt` (plus `validateTokenDate` if it has `date`) → `requireXxxToken` middleware and `RequestWithXxxToken` interface. In tests, sign payloads with `signTestJwt` from `src/testutils/token-generator.ts`.
