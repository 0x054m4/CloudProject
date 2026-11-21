# Live AWS deployment

Deployed on 21 November 2026 in `us-east-1`, using the local AWS CLI profile `margin`.

- Website: https://d21kijacbodwl6.cloudfront.net
- REST API: https://qxmrpfw256.execute-api.us-east-1.amazonaws.com/prod
- Application CloudFormation stack: `margin`
- Packaging CloudFormation stack: `margin-artifacts`

| Requested service | Deployed resource / purpose |
| --- | --- |
| Amazon S3 | `margin-webbucket-tmqp7zmvcmrb` for the native frontend; `margin-coversbucket-cu99fr8zjyf9` for private covers |
| Amazon CloudFront | `E1WGBG2H9IURUJ`, serving the frontend over HTTPS with Origin Access Control |
| Amazon Cognito | User pool `us-east-1_xbV2ShYbQ`; public app client `3acm778j965uihfnpk524vn6ll` |
| Amazon API Gateway | REST API `qxmrpfw256`, stage `prod`, with Cognito authorizer |
| AWS Lambda | `margin-ApiFunction-GuvnteWkx0fC`, Express on Node.js 22 / arm64 |
| Amazon DynamoDB | `margin-LibraryTable-5X6X6HD5UNGD`, private per-reader records with point-in-time recovery |

The deployment also uses a private S3 packaging bucket, an IAM execution role, CloudFormation and CloudWatch logs as supporting infrastructure. Resource names and Cognito client IDs are public configuration identifiers, not credentials.

## Verification

- Nine local automated tests pass, including real-signature JWT verification, cross-user isolation, statistics, catalog errors, API Gateway JSON parsing and S3 upload-signature regression tests.
- Live HTTP checks verify CloudFront HTTPS delivery, production frontend configuration and API health.
- Live smoke tests verify Cognito login with two temporary identities, CORS/preflight, rejection of missing/invalid authentication, DynamoDB persistence, cross-user access rejection, planning-note/highlight rules, public-field projection, sharing revocation, shortlist changes, private S3 upload/download, statistics and a real Open Library search from Lambda.
- Smoke-test identities use suppressed email delivery; passwords/tokens remain in memory. Test books, notes, share records and uploaded covers are removed afterward.
- Browser automation could not navigate because of a browser-control tool error. Visual rendering and email verification delivery were not confirmed by that test. Create your own account from the live sign-in page and follow the email verification flow.

The deployment uncovered and fixed two runtime integration issues: `serverless-http` was upgraded to 4.x for Express 5 request parsing, and S3 upload signing no longer calculates a checksum for an absent body. Upload URLs bind both content type and byte length.

## Update or verify

From the repository root:

```sh
export AWS_PROFILE=margin
aws sts get-caller-identity
npm test
bash scripts/deploy-backend.sh margin us-east-1
bash scripts/deploy-frontend.sh margin us-east-1
```

See SETUP.md for installing the Python SDK and running `scripts/smoke-aws.py`. The deployment was performed using the root-backed profile supplied for the task; use a dedicated deployment role for routine future changes. No credentials are stored in this document or the project.

Deleting the CloudFormation stack retains the user pool, DynamoDB table and S3 buckets intentionally. Consult SETUP.md before cleanup so retained resources and charges are accounted for.
