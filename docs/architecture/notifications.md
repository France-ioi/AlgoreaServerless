# Notifications

Per-user notifications, available to any feature. Stored in `TABLE_NOTIFICATIONS`, expire after ~60 days ([database.md](database.md)). Routes need an identity token ([api.md](api.md)).

## Sending (`src/services/notify-user.ts`)

`notifyUser(userId, { notificationType, payload })` picks `sk = Date.now()`, then in parallel stores the notification and pushes `notification.new` `{ notification }` to every open connection of the user (through `broadcastAndCleanup`). Returns `sk`. `notifyUsers` fans out over several users.

The stored notification and the live push are independent: a user with an open tab gets both.

## Types in use

| `notificationType` | Emitted by | Payload |
|--------------------|------------|---------|
| `forum.new_message` | forum message post, to followers who missed the live push ([forum.md](forum.md)) | `{ participantId, itemId, authorId, time, text, uuid }` |
| `group_results_export.ready` | export completion ([group-results-export.md](group-results-export.md)) | `{ exportId, groupId, groupName, items, filename, sizeBytes, expiresAt }` |
| `group_results_export.failed` | export completion | `{ exportId, groupId, groupName, items, error }` |

Payloads are schemaless in storage; coordinate new types with the frontend.

## REST

- `GET /notifications`: `{ notifications: [{ sk, notificationType, payload, readTime? }] }`, the latest 20, newest first. `sk` is the creation time and identifies the notification in the other routes; rows that fail parsing are dropped and logged.
- `DELETE /notifications/:sk`: delete one; `:sk = all` deletes every notification of the user.
- `PUT /notifications/:sk/mark-as-read`: body `{ read: boolean }`, default `true`; `false` clears `readTime`. Returns `{ status: 'ok' }`.
