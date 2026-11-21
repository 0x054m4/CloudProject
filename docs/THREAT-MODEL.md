# Margin threat model

Assets: Cognito identity tokens, private library records, note/highlight text, private S3 covers, share tokens and deployment credentials.

Trust boundaries: browser → API Gateway → Express services → DynamoDB/S3; browser → Cognito; Catalog service → public Open Library API; public visitor → shortlist projection. Local single-reader mode is development-only, not authentication evidence.

| Concrete threat | Implemented control | Evidence / remaining exposure |
| --- | --- | --- |
| Reader changes a book/entry ID to steal or alter another reader's data | JWT-derived owner partitions; owned-book lookup for every journal/cover action; entry lookup inside owned book partition | Two-user signed-JWT integration test covers reads, edits, deletes, covers, entries, stats and sharing |
| Caller tampers with JWT claims or supplies another client’s token | Signature, expiry, issuer, token-use and audience verification; Cognito API authorizer in AWS | Tests use signed, forged, expired, wrong-issuer, wrong-client and wrong-type tokens; deployed authorizer also rejects missing/invalid tokens in the live smoke test |
| Caller assigns another user's S3 cover key | Backend checks owner/book key prefix; S3 bucket private; signed read/write URLs expire | Cross-owner key test returns 403; live S3 upload, read and foreign-user rejection verified |
| Shared list leaks private journal content | Explicit field projection, two-sided publication check, revocation and no-store response | Public projection/revocation tests; anyone with an active link can view/forward its public metadata |
| Book title, note or external search response injects HTML | User/catalog text escaped before HTML rendering; API returns data only; CloudFront CSP | Browser-level XSS verification remains outstanding; sessionStorage tokens remain exposed if an XSS bypass is found |
| Genre named `__proto__` corrupts calculations | Null-prototype aggregation dictionaries | Regression test for special object-key genres |
| Catalog search becomes SSRF or a data leak | Hard-coded HTTPS host/path, rejected redirects, query length cap, six-second timeout; only user search terms leave app | Adapter tests; Open Library can observe search terms and server address; no notes, tokens or user identity sent |
| External outage prevents all reading workflows | Catalog failure returns 502 with manual-entry fallback; CRUD/journal/statistics do not require upstream availability | Adapter failure tests; cache holds at most 100 queries for five minutes per process |
| Credentials accidentally committed | IAM runtime role, no embedded secrets, ignored credential paths, pattern check and documented full-history review | Pattern matching cannot prove absence; no project Git history existed at initial audit |
| Request floods or storage abuse cause costs | API Gateway throttles, request/text/upload size bounds and limited upstream result count | No per-user global rate limiter, WAF, image decoding or malware scanner; add for a larger public rollout |
| Concurrent operations lose edits or leave orphaned records | Ownership checked on each operation; local file writes serialized | DynamoDB updates remain last-write-wins; delete cascade nontransactional; add version conditions/transactions if stronger concurrency is needed |

Passwords are submitted directly to Cognito in AWS mode. Express never receives or stores them. Application error logs redact exception details to reduce accidental sensitive-data logging. Signing keys in security tests are generated in memory and are not production credentials.
