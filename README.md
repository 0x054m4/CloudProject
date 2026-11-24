# Margin — Book Reading List & Notes

Live app: **https://d21kijacbodwl6.cloudfront.net** · [Deployment details](docs/DEPLOYMENT.md)

A complete native HTML/CSS/JavaScript frontend and Node.js + Express backend, with AWS SAM infrastructure for S3, CloudFront, Cognito, API Gateway REST API, Lambda and DynamoDB. No React or frontend build framework is required. “Frontend: native” is interpreted as native browser technologies rather than a native mobile app.


For a service-by-service explanation with code references, resource names and request flows, see [Where each AWS service is used](docs/AWS-SERVICES.md).

## Run locally

Requires Node.js 22 and npm.

```sh
npm ci
npm run dev
```

Open **http://localhost:3000**. Local mode uses one development reader and persists data to `backend/data/library.json` (when started through the root npm script). No AWS account or credentials are needed. Local mode binds to loopback and cannot run inside Lambda. Cover uploads and Cognito authentication require the AWS deployment.

```sh
npm test
```

## Features

- Create, edit, search, sort and delete books; filter by to-read, reading, finished or paused.
- Notes and highlights with optional page numbers and deletion.
- Optional 1–5 ratings, completion dates, monthly finished-book counts and average ratings by genre.
- Pin/unpin a next-up shortlist; finished/reading books are excluded from it.
- Administrator view with paginated reader accounts and enable/disable controls, protected by the Cognito `administrators` group.
- Cognito email registration, verification, login, session refresh and password reset in AWS mode.
- Private S3 cover uploads with expiring upload/download URLs.
- Optional public shortlist: opt in to a random link, then revoke it. Notes, highlights, ratings, covers and user identity are never included in the public response.
- Responsive layout, keyboard-accessible forms, dialogs and empty states. Starts with an empty personal library, not fabricated data.

## Project map

```text
frontend/            Native UI, styling, Cognito flows and API client
backend/src/         Express routes, validation, persistence and Lambda handler
backend/test/        Integration and domain tests
scripts/build.mjs    Builds static AWS frontend configuration
scripts/deploy-backend.sh   Packages/deploys using AWS CLI without local SAM
scripts/smoke-aws.py  Exercises AWS with disposable users and cleans up
scripts/deploy-frontend.sh  Reads stack outputs, builds and uploads frontend
template.yaml       AWS SAM infrastructure (at repository root)
docs/SETUP.md        Detailed local/AWS deployment and operations guide
docs/API.md          REST endpoint reference
docs/DATABASE.md     DynamoDB model and access patterns
```

Follow [AWS setup](docs/SETUP.md) to create the actual cloud resources and upload the frontend. Infrastructure and source are provided here; running locally does not deploy anything or create AWS charges.

## Assignment safeguards

The backend has Library, Journal and Insights business-service modules sharing one identity and application. Open Library search fills book details before review/save. Highlights require a book that has been started; planning notes are allowed before reading. Starting/finishing a book consumes its next-up pin.

Read [requirements and evidence](docs/REQUIREMENTS.md), [application threat model](docs/THREAT-MODEL.md) and [genuine team contributions](docs/CONTRIBUTIONS.md). Run `npm run check:secrets` before committing, alongside `npm test`.

## Custom account emails

Optional branded Amazon SES sending is prepared but not enabled. See [SES setup and current status](docs/SES-EMAIL.md).
