# REST API

Base URL locally: `http://localhost:3000`. AWS: the `ApiUrl` stack output, including `/prod`.

All private requests require `Authorization: Bearer <Cognito ID token>` and JSON requests use `Content-Type: application/json`. Local development supplies one fixed user, without a token. Responses use JSON except 204 deletes. Validation errors are 400; authentication errors 401; missing books 404. AWS authorizer errors may use AWS's own error format.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Public health check |
| GET | `/api/books` | All current user's books |
| POST | `/api/books` | Create a book; 201 response |
| PUT | `/api/books/:id` | Replace editable book fields |
| DELETE | `/api/books/:id` | Delete owned book and entries; 204 |
| GET | `/api/books/:id/entries` | Get notes/highlights |
| POST | `/api/books/:id/entries` | Add note/highlight; 201 |
| DELETE | `/api/books/:id/entries/:entryId` | Delete entry; 204 |
| GET | `/api/stats` | Totals, monthly completions, genre averages, next-up |
| POST | `/api/books/:id/cover` | Create signed upload URL |
| GET | `/api/books/:id/cover` | Get signed cover read URL |
| POST | `/api/share` | Enable/retrieve public shortlist token |
| DELETE | `/api/share` | Revoke public link; 204 |
| GET | `/api/public/:token` | Public shortlist; no authentication |

Book creation/replacement body:

```json
{"title":"The Dispossessed","author":"Ursula K. Le Guin","genre":"Science fiction","status":"to-read","rating":null,"finishedAt":null,"nextUp":true,"coverKey":null}
```

Allowed statuses: `to-read`, `reading`, `finished`, `paused`. `rating` is null or integer 1–5. `finishedAt` is required for finished books, otherwise null. Creation requires a null cover key; after uploading, PUT the returned key alongside the editable book fields. Returned books include `id` and timestamps; omit these on PUT. Unknown request fields are rejected.

Entry body:

```json
{"kind":"highlight","text":"A passage worth remembering.","page":42}
```

`kind` is `note` or `highlight`; page is null or positive integer.

Cover upload body:

```json
{"contentType":"image/jpeg","size":123456}
```

Allowed: JPEG, PNG, WebP, maximum 5 MiB. Upload file bytes with PUT to the returned `url`, matching `Content-Type` and byte length, then save `key` on the book. Signed URLs expire after five minutes. Images stay private; public lists never expose covers. The server validates declared MIME type and size; it does not perform image decoding or malware scanning.

Stats response includes `total`, `finished`, `reading`, `averageRating` (null if none), `months: [{month,count}]`, `genres: [{genre,average,count}]`, and `nextUp`. Only months with completions are returned.

## Business rules and catalog integration

`GET /api/catalog?q=<search>` is authenticated and returns up to eight `{title, author, sourceUrl}` results from Open Library. Search terms must be 2–120 characters; upstream failures return 502. Users review the selected title/author in the Add a book form and save through the normal book endpoint. No private notes or tokens are sent upstream. Provider reference: https://openlibrary.org/dev/docs/api/search.

Highlights on `to-read` books return 409: first start/pause/finish reading, then capture passages. Planning notes remain allowed. Moving a book to `reading` or `finished` automatically clears `nextUp`. Foreign/missing book and entry IDs return 404 to conceal existence; an out-of-owner/book cover key returns 403. These rules are enforced on the server.

## Administration

- `GET /api/me`: returns `role` (`reader` or `admin`).
- `GET /api/admin/users?cursor=...`: administrators only; returns `users` (username, email, enabled, status, createdAt) and `nextToken`. Pages contain up to 20 accounts.
- `PUT /api/admin/users/:username/access` with `{ "enabled": true/false }`: changes reader sign-in access. Self-modification and disabling administrators return 409. Reader or revoked-admin access returns 403.

Roles come from verified Cognito group claims with live enabled-state and group checks. The Lambda IAM policy permits only account listing, live checks and enabling/disabling within this pool. Admins cannot read another reader’s library. Disabling blocks new sign-ins; existing application ID tokens can remain usable for up to one hour. Local development exposes a read-only account preview.
