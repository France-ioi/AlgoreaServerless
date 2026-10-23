# Group-results export

Async ZIP export of a group's progress and answers. AlgoreaBackend's worker builds the ZIP; serverless brokers the job, owns the S3 location, and notifies the user.

## Flow

1. `POST /group-results-exports` with a group-results token and body `{ group_id, parent_item_ids }`. The body must match the token's `group_id` and `item_ids` (as a set), otherwise `Forbidden`.
2. Mint `export_id` (UUID), presign an S3 PUT (1 h) for `${EXPORTS_PREFIX}/${user_id}/${export_id}.zip` with `Content-Type: application/zip` and a fixed `Content-Disposition`.
3. Publish `group_results_export_requested` `{ export_id, token (raw JWT), upload_url, upload_expires_at }` ([events.md](events.md)), with the Lambda request ID as `request_id`.
4. Return `202 { export_id, expires_at }` (`expires_at` = now + 7 days, the announced availability).
5. The worker uploads, then emits `group_results_export_completed`. The handler re-parses the forwarded token **signature only**, because completion may come after the token's 1 h lifetime, and notifies the token's user with `group_results_export.ready` or `.failed` ([notifications.md](notifications.md)). An invalid token is logged and skipped.
6. `GET /group-results-exports/:exportId/download-url` with an identity token: HEAD the object under the caller's own `user_id`; missing → `404 { error: 'not_found' }`; otherwise `200 { url, expires_in: 300 }`, a presigned GET that keeps the upload's filename.

## Invariants

- **Ownership is the key path.** The S3 key embeds `user_id` from the token, so one user cannot download another's export. There is no table.
- **Token claims are authoritative** for `userId` / `groupId` / `itemIds`; `group_name` and item titles in the completion payload are display data only.
- The ZIP filename `groups_progress_with_answers_for_group-{groupId}-and_child_items_of-{itemIds joined by -}.zip` must match the backend generator, so the worker's PUT `Content-Disposition` equals the signed header.
- The S3 client signs with `requestChecksumCalculation: 'WHEN_REQUIRED'`: the worker's plain HTTP PUT cannot send `x-amz-checksum-*` headers.
- Objects are deleted by a bucket lifecycle rule owned by ops, not by this service.

Config: `EXPORTS_BUCKET`, `EXPORTS_PREFIX`, `EXPORTS_REGION`, `EVENT_BUS_NAME` ([configuration.md](configuration.md)).
