# Frontend Staging Observability Baseline

Status: repo-side contract for #108. Operator-side dashboard, alert, and log
export setup happens later as part of coordinated staging setup.

This document defines the minimum useful observability baseline for the
frontend/backend staging line. It stays lightweight: the goal is to know whether
staging is alive, whether deploy or smoke validation failed, where to inspect
logs, and whether staging cost is under control.

## Scope

In scope:

- Where to inspect frontend Hosting, Cloud Build, and backend Cloud Run logs.
- First staging dashboard candidates.
- Minimum staging alert set.
- Sensitive-data logging rules.
- Cost controls for the first staging wave.
- Non-secret operator evidence to attach after setup.

Out of scope:

- Client-side browser error ingestion from the React app.
- Session replay, RUM, distributed tracing, or full APM.
- Managed Prometheus, Grafana, or a separate observability stack.
- Production SLO, SLA, on-call policy, or incident runbooks.
- Implementing all dashboard and alert resources in this repo-side pass.

## Log Locations

Use GCP-native logs for the first staging version:

| Signal | Where to inspect |
| --- | --- |
| Frontend deploy | GitHub Actions run and Cloud Build build logs. |
| Firebase Hosting requests | Firebase Hosting / Cloud Logging, if Hosting log export is enabled. |
| Backend API requests | Cloud Run service logs and Cloud Logging Logs Explorer. |
| Backend runtime failures | Cloud Run stdout/stderr, request logs, and revision logs. |
| Staging E2E failures | Later Playwright traces/screenshots/videos from #106/#107. |

The React app should continue to show user-visible error states. Do not add
client-side log ingestion under #108.

## Sensitive-Data Rules

Never log or attach:

- Firebase ID tokens.
- Bearer tokens or full request headers.
- Passwords.
- Private keys or service account JSON.
- Full database connection strings.
- Signed upload URLs.
- Raw request bodies by default.
- PII-heavy frontend/browser details.

Useful backend structured fields for staging diagnosis include:

- `severity`
- `request_id`
- `method`
- `path`
- `status`
- `latency_ms`
- `user_id` when safe and useful
- `property_id` when safe and useful
- `error_code`

## Dashboard Candidates

The first staging dashboard can be minimal. Prefer built-in Cloud Monitoring
metrics before adding custom metrics.

Recommended widgets:

- Cloud Run request count.
- Cloud Run 4xx and 5xx counts or ratios.
- Cloud Run p50/p95 latency.
- Cloud Run instance count.
- Cloud SQL CPU, storage, and connection count.
- Firebase Hosting request and error visibility when log export is enabled.
- Cloud Build staging deploy status.
- Later #107 post-deploy E2E status.

## Minimum Alerts

Configure only actionable staging alerts:

| Alert | Initial threshold |
| --- | --- |
| Frontend staging uptime check fails | Operator-selected uptime check fails for two consecutive checks. |
| Backend `/healthz` uptime check fails | HTTP 200 check fails for two consecutive checks. |
| Cloud Run 5xx rate is elevated | Placeholder threshold until staging traffic baseline exists. |
| Staging deploy fails | GitHub Actions or Cloud Build reports failure. |
| Post-deploy E2E fails | Later #107 workflow reports failure. |
| Staging budget threshold reached | Operator-selected GCP budget threshold, for example 50%, 80%, and 100%. |

Use email or another human-operated notification channel for staging. Do not
add production on-call escalation policy under this issue.

## Cost Controls

- Keep staging log retention short/default unless debugging evidence justifies
  a temporary extension.
- Avoid verbose debug logging by default.
- Prefer built-in Cloud Run, Cloud SQL, Cloud Build, and Firebase Hosting
  metrics before custom log-based metrics.
- Consider exclusion filters only for low-value high-volume logs after real
  staging volume is observed.
- Do not enable Managed Prometheus, Grafana, session replay, or RUM in the
  first staging wave.
- Configure a GCP budget alert for the staging project before broad UAT.

## Operator Evidence

Attach only non-secret evidence after operator-side setup:

- Cloud Build run URL or build id for frontend staging deploy.
- Firebase Hosting site/target metadata and stable staging URL.
- Logs Explorer filter name or redacted query for Cloud Run staging logs.
- Dashboard name or screenshot without secrets or PII.
- Alert policy names and threshold summary.
- GCP budget alert summary.
- Redacted staging failure artifact links when available.

Do not attach raw logs or screenshots containing tokens, passwords, signed URLs,
private keys, full request headers, full database connection strings, or
sensitive tenant/property details.
