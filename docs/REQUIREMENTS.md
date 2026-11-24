# Assignment requirements and evidence

## Problem, users, value and scope

Margin serves individual readers who lose track of books, passages and future reading choices across unrelated notes and lists. One private library connects book progress, reading notes and completion statistics. Readers can find real bibliographic details, record their own reflections, understand their reading habits and share only a deliberate shortlist.

In scope: one reader account, private books/journal, catalog-assisted entry, status/completion workflow, ratings, statistics, shortlist and revocable public sharing. Out of scope: book lending, purchases, full-text ebooks, social moderation, access to readers' private libraries and native mobile applications.

The agreed architecture uses **business-service modules**, not independently deployed microservices. One Express app runs locally or in one Lambda, with a shared Cognito identity, native frontend, navigation and database. AWS infrastructure services are not presented as student-owned business services.

## Coherent services and actual business logic

| Service | Responsibility and rules | Integration |
| --- | --- | --- |
| Library (`backend/src/services/library.js`) | Enforces finished-date consistency, allowed statuses, ratings and cover ownership; consumes the next-up pin when reading starts or finishes; deletes dependent entries | Supplies owned books to Journal and Insights; receives reviewed catalog metadata through the add-book workflow |
| Journal (`backend/src/services/journal.js`) | Requires an owned book for every operation; allows planning notes before reading, but rejects highlights for to-read books with 409; validates page and text limits; rejects missing/foreign entries | Calls Library ownership and status checks before acting |
| Insights and sharing (`backend/src/services/insights.js`, `domain.js`) | Computes monthly completions and rated-only genre means; selects eligible next-up books; projects only four safe public fields; checks both share records so incomplete publication fails closed | Reads current Library data; revocation immediately invalidates the public endpoint |
| Catalog adapter (`backend/src/services/catalog.js`) | Retrieves real title/author metadata from Open Library; restricts query length, upstream host, redirects, result count, response mapping and timeout; caches briefly | Search → select real result → review/edit → save to Library. This is a genuine workflow dependency, not an unused demonstration call |

Rules are enforced in backend services. The UI is a convenience and can be bypassed without bypassing authorization. The services are internal modules and communicate with function calls, not artificial HTTP calls between modules in the same process.

## Authorization model

- **Unauthenticated visitor:** health endpoint and an explicitly shared shortlist only. Private requests return 401.
- **Authenticated reader:** own books, notes, highlights, covers and share configuration only. Identity is taken from a verified Cognito ID token, never a submitted owner field.
- **Public-link viewer:** only title, author, genre and reading status of eligible pinned books. No account, private note, rating or cover access.
- **Administrator:** members of the Cognito `administrators` group can list account metadata and enable or disable reader sign-in. Private library access remains scoped to the signed-in reader. Group membership and account enabled state are checked live for admin requests; reader and revoked-admin tokens receive 403. Self-disable and disabling another administrator are blocked. Role assignment is an AWS operator action.

Unknown and foreign record IDs deliberately return the same **404** to avoid revealing another reader's records. An attempt to attach a cover outside the current user's/book's prefix returns **403**. Invalid/missing, expired, wrong-client, wrong-issuer and forged tokens return **401**. Returning 404 for foreign IDs is intentional ownership protection, not absent authorization.

## Demonstration and test evidence

Run `npm test` and `npm run check:secrets`.

1. Search for a real book in Add a book, select metadata and save. Disable network and search a new term: an actionable catalog error appears, with manual entry still available.
2. Add a planning note to a to-read book. Try adding a highlight: backend rejects it with 409. Change to reading, then add the highlight successfully. The next-up pin is consumed.
3. Finish books with different dates and ratings; observe grouped completion months and genre means. Unrated books are excluded from averages.
4. Use two accounts. Substitute account A's book ID into account B's edit, delete, entries and cover calls: all fail. Attempt an entry ID belonging to another book: it fails too.
5. Send missing, forged, expired or wrong-client JWTs directly to the API: 401. Tests use real RSA signatures with a test JWKS, without contacting Cognito.
6. Share and revoke a shortlist. Verify private fields never appear and a second account cannot revoke the first account's link.

Automated coverage lives in `backend/test/`. The actual Open Library search was exercised successfully during implementation. AWS/Cognito/S3 integration has also been exercised against the live deployment; see DEPLOYMENT.md. Browser rendering and delivery of account-verification emails remain separate manual checks.

## Secrets and contribution evidence

`.gitignore` excludes environment files, AWS configuration, private-key files, local databases and generated deployment artifacts. Runtime AWS access uses the Lambda IAM role; the browser contains only public region/client/API identifiers. Tests generate signing keys in memory. No real login token or private key is saved as a fixture.

`npm run check:secrets` scans recognizable credential formats and available project Git patch history, reports locations without printing values, and fails on matches. It is intentionally a limited pattern check: run a dedicated scanner such as Gitleaks over the working tree and full repository history before submission. Ignoring a path does not remove already committed secrets. Rotate any exposed credential immediately; deleting the latest copy alone does not address history exposure.

No project Git repository existed when this audit began, so there was no project commit history to certify. This work does not create student contribution evidence. Follow CONTRIBUTIONS.md for genuine component ownership.

## Remaining boundaries

See THREAT-MODEL.md for concrete threats and remaining controls. Concurrent writes are last-write-wins; book/entry deletion is not transactional. Catalog cache is per-process, not a global rate limiter. A public shortlist link is a bearer capability and can be forwarded. Business modules share one deployment. Administrator account management is implemented with a separate authenticated role.
