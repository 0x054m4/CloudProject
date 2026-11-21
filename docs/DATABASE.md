# Database design

`template.yaml` creates a DynamoDB table with string partition key `pk`, string sort key `sk`, on-demand billing, encryption and point-in-time recovery. No SQL migration or manual table creation is needed. The table starts empty and is retained when the stack is deleted.

| Entity | pk | sk | Attributes |
| --- | --- | --- | --- |
| Book | `USER#<Cognito sub>` | `BOOK#<UUID>` | id, title, author, genre, status, rating, finishedAt, nextUp, coverKey, createdAt, updatedAt |
| Note/highlight | `USER#<sub>#BOOK#<UUID>` | `<entry UUID>` | id, kind, text, page, createdAt |
| Share setting | `USER#<sub>` | `SETTINGS` | token |
| Public share lookup | `SHARE` | `<random UUID>` | owner (user partition key) |

All private partition keys come from the verified Cognito `sub`; they cannot be supplied by the caller. Private routes verify JWT issuer, signature, expiry, token type and app client. API Gateway adds a Cognito authorizer ahead of Express. Public requests look up a randomly generated share token and explicitly project four permitted book fields.

Books are separate items from notes, so a large notes collection does not grow a book beyond DynamoDB's 400 KB item limit. Each entry is capped at 10,000 characters. Queries paginate through all DynamoDB pages. No table scans or secondary indexes are needed. Statistics are computed from the authenticated user's books. Unrated books do not count toward rating averages. Completion months use the saved YYYY-MM-DD date, not server timezone. Genre names are user-entered and case-sensitive.

Book edits use replacement writes after ownership lookup; concurrent edits use last-write-wins. Book deletion removes the book and then its entries; this is not a cross-item transaction. A failure or concurrent entry creation can leave inaccessible orphan entries. Repeated/replaced cover uploads and deleted books can leave private S3 objects; add a reconciliation job before high-volume production use. There is no automatic reading-session history: changing status or completion date updates the current statistics.

Local development implements the same store interface using an atomic JSON file replacement and an in-process write queue. It is a single-process development store, not an alternative production database. Use `DATA_FILE=/absolute/path/library.json npm run dev` to change its location. There is no automatic migration from local data to DynamoDB.

## Backup and restore

Use DynamoDB point-in-time recovery to restore to a new table, then update the function's `TABLE_NAME` through an intentional infrastructure change. Keep the retained old table until the restored app is verified. S3 cover objects are not part of DynamoDB backups; enable bucket versioning/backup if your recovery requirements need it.
