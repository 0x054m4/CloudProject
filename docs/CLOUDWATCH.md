# CloudWatch operations

The SAM stack manages three monitoring components in `us-east-1`:

| Component | Configuration |
| --- | --- |
| Lambda log group | `/aws/lambda/margin-ApiFunction-GuvnteWkx0fC`; 14-day retention, retained when the stack is deleted or the resource is replaced |
| API Gateway metric | Namespace `AWS/ApiGateway`, metric `4XXError`, dimensions `ApiName=margin`, `Stage=prod`; `Sum` over 300 seconds |
| Logs Insights saved query | `margin/lambda-recent-events`, scoped to the Lambda log group; newest 100 events |

The dashboard is **margin-operations-us-east-1**. Open it from the stack's `CloudWatchDashboardUrl` output, or [open the dashboard](https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards/dashboard/margin-operations-us-east-1).

The API name is explicitly set to the existing name, `margin`, so the metric dimension and historical data are preserved. The API ID, URL and `prod` stage are preserved. Stage metrics are published automatically; method-level detailed metrics are not enabled.

## Use the views

1. Open the dashboard and select a time range that covers the requests you want to inspect. The 4XX chart shows the count of client errors per five-minute interval. No datapoints means no reported samples for that interval, rather than proof of zero errors.
2. In CloudWatch **Logs → Log groups**, open the Lambda group to inspect invocation streams. Lambda emits execution records, and the app logs sanitized server and catalog failure diagnostics. Requests rejected by API Gateway authentication do not invoke Lambda and therefore do not produce Lambda logs.
3. In **Logs Insights**, choose the saved query `margin/lambda-recent-events`, select a bounded time range and run it:

```text
fields @timestamp, @requestId, @message, @logStream
| sort @timestamp desc
| limit 100
```

Logs Insights scans are billed by data scanned. The 100-row result limit does not bound scan volume; use a short time range. Dashboard refreshes also run the log query. This dashboard provides visibility; it does not configure alarm notifications.

Application logs must not include tokens, passwords, request bodies, books or private notes. The query exposes existing Lambda execution and sanitized diagnostic logs to AWS operators; it does not add logs to the public app.

## Deploy and verify

```sh
AWS_PROFILE=margin bash scripts/deploy-backend.sh margin us-east-1
AWS_PROFILE=margin python3 scripts/check-cloudwatch.py margin us-east-1
```

The verification script checks retention, dashboard configuration, the saved query, available 4XX samples and an actual Logs Insights execution. It does not create accounts or generate error traffic. It prints only query status, counts and configuration, not log messages or credentials. A successful query can return zero events when the selected period is quiet. Allow several minutes after requests for API metrics to arrive.

CloudFormation owns `ApiLogGroup`, `LambdaRecentEventsQuery` and `OperationsDashboard` in `template.yaml`. Stack outputs expose their names/IDs for other environments.
