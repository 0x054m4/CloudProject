# Setup and deployment

## 1. Local development

Install Node.js 22 and npm. From the repository root:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Add books, notes and highlights; refresh or restart to confirm persistence. `npm test` runs isolated tests using temporary databases. The local database is `backend/data/library.json`. Local development intentionally uses one reader. It has no sign-up flow and S3 covers return an explanatory unavailable response.

The root scripts use npm workspaces. Run them from the repository root. To change the local port: `PORT=3001 npm run dev`. The native frontend is served directly by Express; no frontend compiler is needed.

## 2. AWS prerequisites

Install AWS CLI v2 and AWS SAM CLI, configure an AWS account/profile, and choose a region that supports the listed services (for example `us-east-1`). Use Node.js 22 locally for `sam build`; alternatively use Docker with `sam build --use-container`.

```sh
aws configure sso
aws sso login --profile YOUR_PROFILE
export AWS_PROFILE=YOUR_PROFILE
aws sts get-caller-identity
sam --version
```

Your deployment identity needs permissions to create CloudFormation stacks, IAM roles, S3 buckets/policies, CloudFront distributions/policies, Cognito pools/clients, API Gateway REST APIs, Lambda functions, DynamoDB tables and CloudWatch log groups. Use an approved deployment role. The runtime role in the template is restricted to this table and cover objects. Do not put AWS credentials in frontend config.

## 3. Create the AWS services and database

```sh
npm ci
npm test
sam validate --lint
sam build
sam deploy --guided
```

Choose stack name `margin`, your region, and acknowledge IAM role creation (`CAPABILITY_IAM`). If SAM asks whether public health/share endpoints without authorization are acceptable, those endpoints are intentionally public. Save settings to `samconfig.toml` for repeat deployment. All private API routes have a Cognito authorizer and backend token verification.

Deployment creates:

- Private S3 frontend bucket and separate private cover bucket.
- CloudFront HTTPS distribution using the default CloudFront domain and Origin Access Control for the frontend bucket.
- Cognito email user pool and public app client (no client secret).
- API Gateway **REST API**, Express Lambda on Node.js 22, and logs retained for 14 days.
- DynamoDB on-demand table with encryption and point-in-time recovery.

CloudFront creation may take several minutes. Cloud services incur usage charges; configure an AWS Budget for your account. No custom domain, Route 53 or certificate setup is required for the default distribution URL.

## 4. Upload the native frontend

Once the stack succeeds, run from the repository root:

```sh
bash scripts/deploy-frontend.sh margin us-east-1
```

Replace region/stack arguments with your choices. The script reads stack outputs, writes production `dist/config.js`, uploads `dist/` to the frontend bucket and invalidates CloudFront. It synchronizes only the dedicated frontend bucket. `frontend/config.js` remains configured for local development. The script prints the HTTPS website URL. Wait for invalidation completion if you see the previous version.

Manual build equivalent:

```sh
export API_URL=https://YOUR_API.execute-api.us-east-1.amazonaws.com/prod
export AWS_REGION=us-east-1
export COGNITO_CLIENT_ID=YOUR_CLIENT_ID
npm run build
```

`config.js` contains public identifiers, not secrets. Never upload the source repository, backend, data directory or AWS credentials to S3.

## 5. Verify the deployed flow

1. Open the printed CloudFront URL. Create an account with an email you control and a password of at least 12 characters including uppercase, lowercase, number and symbol.
2. Verify the email code, then sign in. Cognito's default email delivery has sending quotas; configure SES-backed delivery for wider production use.
3. Search Open Library from Add a book and select a result, then review and save. Set its status to reading, write a private note and highlight, upload a small JPG/PNG/WebP cover, and refresh.
4. Mark the book finished with a date and rating. Confirm monthly statistics and genre average.
5. Add a second book as to-read and pin it. Enable sharing in Next up; open the link in a private browser window. Verify only the shortlist book metadata is visible.
6. Disable sharing and refresh that private window: it should report that the list is unavailable.
7. Create a second account to confirm the first account's library is not visible.
8. Sign out and try a private API request without a token; it must fail. Health and a valid public shortlist remain accessible.

## 6. Updates

Backend/infrastructure: `sam build && sam deploy`. Frontend: rerun `bash scripts/deploy-frontend.sh margin us-east-1`. Keep the committed root `package-lock.json`; `npm ci` uses it. SAM installs backend dependencies from `backend/package.json` and its accompanying lockfile. Run tests after changing either dependency manifest.

## Troubleshooting

- **Local page fails:** start `npm run dev`, use http://localhost:3000 rather than opening index.html with `file://`.
- **Cognito sign-in fails:** confirm email verification, client ID and region; check password rules and email spam folder. If your account is unconfirmed, sign in to return to the verification screen; use Resend verification code if needed.
- **401:** sign in again. Frontend sends Cognito ID tokens, with automatic refresh while the tab session remains available. Session storage is cleared on sign-out; sign-out is local to the tab, not global token revocation.
- **CORS failure:** use the stack's exact CloudFront HTTPS origin. API and S3 cover CORS intentionally allow that origin only. A custom domain requires updating CORS, CSP and distribution certificate configuration together.
- **Cover upload fails:** file must be JPEG/PNG/WebP at most 5 MiB; inspect S3 CORS and Lambda S3 permissions. Upload URLs expire in five minutes. Refresh the library to renew expired read URLs.
- **S3 403 on website:** use CloudFront, not S3 directly. Check bucket policy references the active distribution and upload `index.html` to bucket root.
- **Server error:** inspect the function log group in CloudWatch. Do not log tokens or private note contents.
- **SAM build fails:** verify Node.js 22 availability or use `sam build --use-container` with Docker. The app intentionally has no AWS credentials baked in.

## Operational limits and cleanup

This is a functional small-library application. Lists are loaded in full per user, and concurrent book edits use last-write-wins. Deletions of book/entries are not transactional. Image content is not decoded or scanned, and replaced covers are not garbage-collected. See [database notes](DATABASE.md). API throttling is configured; further abuse controls, email delivery configuration, monitoring alarms, pagination and stronger concurrent-write handling should be added for a large public rollout.

Run `sam delete --stack-name margin --region us-east-1` to delete the stack's removable resources. The DynamoDB table, both S3 buckets and Cognito user pool deliberately have **Retain** policies to protect data. These retained resources continue to exist and may incur charges. Delete them separately only after exporting any data you need. Empty the retained buckets before deleting them. Retained resources are not automatically adopted by a recreated stack.

Official references: [SAM Cognito authorizers](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-controlling-access-to-apis-cognito-user-pool.html), [CloudFront Origin Access Control](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html).

## Assignment checks

Run `npm run check:secrets` and review [requirements evidence](REQUIREMENTS.md) before submission. Open Library integration also works locally when outbound internet is available; AWS Lambda is not VPC-attached and can reach the provider. No API key is required. Only explicit catalog search terms are sent externally. If the provider is unavailable, users can enter books manually.

## Deploy using AWS CLI only (no SAM CLI installation)

The SAM transform is processed by AWS CloudFormation; the local SAM CLI is optional. On a Mac with Node.js 22 and AWS CLI v2:

```sh
aws login --profile margin
export AWS_PROFILE=margin
npm ci
npm test
bash scripts/deploy-backend.sh margin us-east-1
bash scripts/deploy-frontend.sh margin us-east-1
```

The backend script installs production dependencies into `.aws-sam/build/ApiFunction`, creates the `margin-artifacts` stack with a private S3 packaging bucket, uploads the Lambda artifact and deploys the `margin` stack. It uses the lockfile and CloudFormation SAM transform; no Docker is required for these JavaScript-only dependencies. The packaging bucket is a supporting S3 resource, not an additional application service. Both deployment scripts use `AWS_PROFILE` from your environment.

Verify the live workflows with:

```sh
python3 -m venv .aws-sam/verify-env
.aws-sam/verify-env/bin/pip install boto3
AWS_PROFILE=margin .aws-sam/verify-env/bin/python scripts/smoke-aws.py margin us-east-1
```

This test creates two temporary Cognito identities with notifications suppressed, keeps credentials in memory, exercises the API and private cover uploads, and removes its test data afterward. It needs Cognito administrative permissions for its temporary users and S3 delete permission for its temporary cover. No real users are modified. It does not verify email delivery or browser rendering.

For cleanup, also remove the `margin-artifacts` CloudFormation stack. Its S3 bucket is retained; empty and delete that bucket separately when the packaged versions are no longer needed.
