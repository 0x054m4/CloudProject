# Branded account emails with Amazon SES

## Current status

Checked on 21 November 2026 in `us-east-1`:

- Cognito uses `COGNITO_DEFAULT` and confirmation codes.
- SES has no email/domain identities in this region.
- SES sending is enabled but production access is not: the account is in the sandbox (200 messages/day and one message/second).
- The repository now supports optional SES configuration. **It has not been enabled on the live app.**

SES will deliver account emails for Cognito using a verified address such as `Margin <noreply@yourdomain.com>`. Cognito continues to generate and validate codes and handle passwords. The frontend's code-entry flow stays unchanged. No SMTP password, SES access key in the browser, or email-sending Lambda is required.

SES is an additional AWS service beyond the original six. Cognito creates/uses a service-linked role to send through SES when `EmailSendingAccount` is `DEVELOPER`; the deployment identity needs permission to create that role if it does not exist.

## 1. Select the sender

Supply an address on a domain you control and a display name. Prefer a monitored sender mailbox where possible: feedback forwarding is enabled on the identity. SES provides sending, not a mailbox for receiving replies. If the proposed sender is an unmonitored no-reply address, arrange a monitored feedback/reply destination as part of the final setup.

The application website can remain on its CloudFront domain. Verifying an email domain does not require moving the website or changing existing mailbox MX records.

## 2. Create the domain identity

First check whether this identity already exists; do not create a competing CloudFormation resource for an existing identity. For a new identity, replace `yourdomain.com` with the real domain and run:

```sh
aws cloudformation deploy \
  --template-file infrastructure/email.yaml \
  --stack-name margin-email \
  --parameter-overrides EmailDomain=yourdomain.com \
  --profile margin --region us-east-1
```

This separate stack intentionally does not switch Cognito's sender. Read its outputs:

```sh
aws cloudformation describe-stacks --stack-name margin-email \
  --profile margin --region us-east-1 --query 'Stacks[0].Outputs'
```

Add the three generated DKIM CNAME pairs in Cloudflare DNS, using **DNS only**. Use the exact names and targets returned by SES; do not invent tokens. Leave existing website and email records intact. Keep these DKIM records after verification.

Check the identity:

```sh
aws sesv2 get-email-identity --email-identity yourdomain.com \
  --profile margin --region us-east-1 \
  --query '{Verified:VerifiedForSendingStatus,Dkim:DkimAttributes.Status}'
```

Wait for verified status and successful DKIM before using it. DNS verification is asynchronous.

## 3. Obtain SES production access

In the SES console, select `us-east-1`, open the account dashboard and request production access. This application's email type is transactional: account verification and password recovery requested by readers. Supply the real website, intended audience and actual bounce/complaint handling process. Do not claim monitoring or consent controls that are not implemented.

AWS must approve production access. While sandboxed, SES can send only to verified recipient identities or the SES mailbox simulator. Switching this live registration system to sandboxed SES would prevent delivery to ordinary unverified recipients. Keep the current Cognito sender until production access is enabled; sandbox tests should be limited to explicitly chosen verified recipients.

```sh
aws sesv2 get-account --profile margin --region us-east-1 \
  --query '{Production:ProductionAccessEnabled,Sending:SendingEnabled}'
```

## 4. Enable SES for Cognito

Only after identity verification and production readiness, supply the identity ARN from the email stack and the chosen sender:

```sh
export AWS_PROFILE=margin
export SES_IDENTITY_ARN='arn:aws:ses:us-east-1:YOUR_ACCOUNT_ID:identity/yourdomain.com'
export SES_FROM_ADDRESS='Margin <noreply@yourdomain.com>'
bash scripts/deploy-backend.sh margin us-east-1
```

`template.yaml` sets `UserPool.EmailConfiguration` to `DEVELOPER` with `SourceArn` and `From`, and supplies a branded verification message containing Cognito's required `{####}` code placeholder. It keeps `CONFIRM_WITH_CODE`, matching the existing frontend. The custom subject/body applies to the verification template; this change does not introduce separate trigger-based templates for every account event. Password recovery also uses the configured SES sender.

Both parameters are required together. With empty parameters the template retains `COGNITO_DEFAULT`. Subsequent CloudFormation CLI updates that omit parameter overrides retain existing stack parameter values; removing the environment variables alone is not a rollback.

## 5. Verify delivery

Use an email address you own and explicitly choose for testing. Complete signup, check the actual From address and DKIM headers, enter the code, sign in, and test the forgot-password flow. Avoid sending test mail to unrelated users. The existing smoke test suppresses Cognito notification emails, so it does not establish email delivery.

## Rollback

Update the application stack with both `SesIdentityArn` and `SesFromAddress` explicitly set to empty strings, using the current packaged template. Review the CloudFormation change set and retain the same user pool. This returns sending to `COGNITO_DEFAULT` without deleting users. Keep the SES identity and DKIM records unless you intentionally retire them.

## Sources

- [Cognito email configuration](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_EmailConfigurationType.html)
- [Cognito verification templates](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_VerificationMessageTemplateType.html)
- [SES sandbox and production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)
- [SES domain verification](https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html)
