# Frontend Staging Environment Contract

Status: repo-side contract for #104, #105, #106, #107, and #108.
Operator-side Firebase/GCP setup happens later as one coordinated staging setup
pass.

This document defines the frontend `dev` -> staging environment contract. It
does not create Firebase Hosting, Cloud Build, Playwright, Secret Manager, or
GCP resources by itself.

It is aligned with the backend staging architecture baseline in
`/Users/cheni-fan/stds_backend/docs/cloud-architecture.md`: Firebase Hosting is
the browser-facing edge, `/api/**` rewrites route admin API traffic to the core
backend Cloud Run service, and the Cloud Run `run.app` URL is not the default
browser-facing contract.

## Scope

In scope:

- Firebase/GCP staging project and Hosting target naming contract.
- Stable staging frontend URL contract.
- Staging API base URL assumptions for the backend Cloud Run staging API.
- Required Vite build-time environment variables for the static frontend.
- Staging E2E credential storage boundaries without committing secrets.
- Mapping of values to GitHub repository variables, GitHub repository secrets,
  Cloud Build substitutions, or Secret Manager values.

Out of scope for this combined repo-side pass:

- Production deployment.
- Firebase preview-channel PR environments.
- Backend Cloud Run, Cloud SQL, migration, or scheduler setup.
- Browser trace artifact upload before a redaction policy exists.

## Pipeline Placement

The feature branch -> `dev` PR gate stays fast and deterministic. It runs the
existing frontend checks:

```text
npm run openapi:check
npm run typecheck
npm run lint
npm run test
npm run build
```

Frontend E2E must not run in that feature PR gate initially.

Frontend E2E belongs to the second-phase `dev` -> `staging` line. The first
wave uses a manual GitHub Actions trigger: merge feature PRs into `dev`, choose
the backend OpenAPI ref for the staging run, run pre-deploy checks, deploy, then
optionally run post-deploy E2E after #106 provides the Playwright harness.
Automatic `staging` branch push deployment is a later hardening step after the
first setup evidence is reviewed. The staging line may use GitHub Actions as the
trigger and status-reporting entry point, but deployment-layer work should run
in GCP Cloud Build where practical.

## Staging Targets

The staging operator must choose and record these non-secret identifiers before
the first frontend staging deployment:

| Contract value | Meaning | Storage |
| --- | --- | --- |
| `STAGING_GCP_PROJECT_ID` | GCP project used for frontend staging resources. | GitHub repository variable |
| `STAGING_FIREBASE_PROJECT_ID` | Firebase project id used by the staging frontend app and Auth. Usually the same value as `STAGING_GCP_PROJECT_ID`. | GitHub repository variable |
| `STAGING_FIREBASE_SITE` | Firebase Hosting site or target for the Vite admin frontend. | GitHub repository variable |
| `STAGING_FRONTEND_URL` | Stable browser-facing UAT/E2E URL, for example a Firebase Hosting URL or approved custom staging domain. | GitHub repository variable |
| `STAGING_REGION` | GCP region for Cloud Build/deploy coordination when needed by later issues. | GitHub repository variable |
| `STAGING_BACKEND_CLOUD_RUN_SERVICE` | Core backend Cloud Run service id used by Firebase Hosting `/api/**` rewrites. | GitHub repository variable |
| `STAGING_BACKEND_CLOUD_RUN_REGION` | Region of the core backend Cloud Run service used by Firebase Hosting rewrites. | GitHub repository variable |

The stable staging frontend URL is the browser-facing contract for UAT and
deployed frontend E2E. Do not make test scripts depend on temporary Firebase
preview-channel URLs under #104-#107.

## API Base URL

Preferred staging browser contract:

```text
VITE_API_BASE_URL=/api/v1
```

The backend staging architecture expects Firebase Hosting rewrites for browser
API traffic. The deployed React app should call `/api/v1/...` from the same
staging origin, and Firebase Hosting should rewrite `/api/**` to the core
backend Cloud Run service.

Do not make the browser-facing frontend depend on the backend Cloud Run
`run.app` URL as the default contract. If the operator temporarily uses a full
staging API URL, record that URL as `STAGING_API_BASE_URL`, verify CORS and
auth behavior explicitly, and treat it as an operator-selected exception rather
than the default frontend contract.

## Required Vite Build Variables

Cloud Build for the frontend staging deploy must provide these Vite variables
when building the static app:

```text
VITE_API_BASE_URL
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_USE_EMULATOR=false
```

Do not set local emulator variables in staging:

```text
VITE_FIREBASE_USE_EMULATOR=true
VITE_FIREBASE_AUTH_EMULATOR_URL
```

Firebase web app config values are client-side build configuration, not server
secrets. They still should be handled as environment configuration rather than
hard-coded in source files.

## Configuration Ownership

### GitHub Repository Variables

Use GitHub repository variables for non-secret identifiers, selected URLs, and
resource names that GitHub needs to trigger or report a staging run:

```text
STAGING_GCP_PROJECT_ID
STAGING_REGION
STAGING_FIREBASE_PROJECT_ID
STAGING_FIREBASE_SITE
STAGING_FRONTEND_URL
STAGING_API_BASE_URL
STAGING_FIREBASE_AUTH_DOMAIN
STAGING_FIREBASE_APP_ID
STAGING_FIREBASE_API_KEY
STAGING_WORKLOAD_IDENTITY_PROVIDER
STAGING_GITHUB_DEPLOY_SERVICE_ACCOUNT
STAGING_CLOUD_BUILD_SERVICE_ACCOUNT_EMAIL
STAGING_BACKEND_CLOUD_RUN_SERVICE
STAGING_BACKEND_CLOUD_RUN_REGION
STAGING_FIREBASE_TOOLS_VERSION
STAGING_E2E_USER_EMAIL
```

`STAGING_API_BASE_URL` should normally be `/api/v1`. If it is a full URL, the
operator must also record why same-origin Firebase Hosting rewrites are not used
for that run.

### GitHub Repository Secrets

Use GitHub repository secrets only for credentials GitHub must directly hold. The
current staging workflow does not require repository secrets. It uses Workload
Identity Federation and repository variables for the provider and service
account identifiers instead of long-lived JSON keys.

Do not store Firebase user passwords, Firebase ID tokens, bearer tokens,
private keys, API keys for backend services, or database connection strings in
GitHub repository secrets unless a later implementation issue explicitly
documents why GitHub must read that value directly.

### IAM Handoff

Keep staging IAM least-privilege and environment-scoped. Do not grant broad
`Owner` or `Editor` roles just to make the first deploy pass.

The GitHub deploy service account identified by
`STAGING_GITHUB_DEPLOY_SERVICE_ACCOUNT` should only be able to authenticate
through the configured Workload Identity provider, submit Cloud Build builds in
the staging project, act as the configured Cloud Build service account, and
read only the configured staging E2E password secret when the #107 post-deploy
Playwright step is enabled.

The Cloud Build service account identified by
`STAGING_CLOUD_BUILD_SERVICE_ACCOUNT_EMAIL` should only receive the permissions
needed for this frontend deploy line:

- read the submitted build source and write Cloud Build logs
- deploy to the configured Firebase Hosting site
- read project/resource metadata needed by Firebase Hosting deploy

It does not need staging E2E secrets because the #107 post-deploy Playwright
step runs in GitHub Actions after Cloud Build completes. It also does not need
backend Cloud Run deploy, Cloud SQL, GCS object, Resend, database migration, or
production project permissions for this frontend-only staging deploy.

### Cloud Build Substitutions

Cloud Build substitutions should receive non-secret build/deploy selectors from
GitHub and turn them into Vite build-time environment variables:

```text
_VITE_API_BASE_URL
_VITE_FIREBASE_API_KEY
_VITE_FIREBASE_AUTH_DOMAIN
_VITE_FIREBASE_PROJECT_ID
_VITE_FIREBASE_APP_ID
_VITE_FIREBASE_USE_EMULATOR
_FIREBASE_HOSTING_SITE
_BACKEND_CLOUD_RUN_SERVICE
_BACKEND_CLOUD_RUN_REGION
_FIREBASE_TOOLS_VERSION
```

The repo-side staging deploy entry points are:

- `.github/workflows/staging-frontend-deploy.yml`
- `cloudbuild.staging.yaml`

The GitHub workflow checks out the backend repository only to provide the
current OpenAPI file to Cloud Build. The frontend repository still does not
copy or maintain an OpenAPI contract.

The first staging deploy workflow uses a manual `workflow_dispatch` trigger. Do
not enable automatic `push` deployment from the `staging` branch until the first
GCP setup, deploy, and E2E evidence have been reviewed. The workflow submits
`cloudbuild.staging.yaml` after GitHub authenticates to GCP through Workload
Identity Federation. Cloud Build then runs these pre-deploy checks before the
Firebase Hosting deploy step:

```text
npm ci
npm run openapi:check
npm run typecheck
npm run lint
npm run test
npm run build
```

Only after those checks pass does Cloud Build run
`firebase deploy --only hosting`.

The focused Playwright smoke can be enabled from the manual workflow with
`run_e2e=true`. It runs after the deploy step in this `dev` -> `staging` line.
It must not be added to the feature branch -> `dev` PR gate.

The generated Firebase Hosting config uses:

- `dist` as the static public directory.
- `/api/**` rewrite to the staging core backend Cloud Run service.
- `**` rewrite to `index.html` for the React SPA fallback.

### Secret Manager

Use Secret Manager for staging E2E credentials and any later deployment secrets
that the staging workflow or Cloud Build must read at runtime:

```text
frontend-staging-e2e-password
```

The E2E test account email may be a GitHub repository variable
(`STAGING_E2E_USER_EMAIL`) because it is an identifier. The password belongs in
Secret Manager and must be injected into the E2E execution environment only when
the staging E2E harness runs.

Do not commit or print:

- Firebase ID tokens.
- Passwords.
- Private keys or service account JSON.
- Full bearer credentials.
- Database connection strings.
- Backend service API keys.

## Staging E2E Credential Contract

The staging E2E user must be a dedicated Firebase Auth user and matching backend
DB user scoped to the minimum property/data needed by the first smoke suite.

Initial expected variables for #106/#107:

| Contract value | Meaning | Storage |
| --- | --- | --- |
| `STAGING_E2E_BASE_URL` | Browser-facing URL used by Playwright. Usually the same as `STAGING_FRONTEND_URL`. | GitHub repository variable |
| `STAGING_E2E_USER_EMAIL` | Dedicated staging smoke user email. | GitHub repository variable |
| `STAGING_E2E_USER_PASSWORD` | Dedicated staging smoke user password. | Secret Manager |
| `STAGING_E2E_USER_PASSWORD_SECRET` | Secret Manager secret name for the dedicated staging smoke user password. Defaults to `frontend-staging-e2e-password` when omitted. | GitHub repository variable |

The E2E harness must target the deployed staging frontend URL, not a local Vite
server. Test artifacts may include screenshots, videos, and the Playwright HTML
report, but they must not expose passwords, Firebase ID tokens, bearer tokens,
or full request headers. Playwright trace is disabled in the first repo-side
pass because authenticated traces can expose action or network details that are
too easy to mishandle without a redaction policy.

The repo-side #107 workflow follows the backend staging deployment pattern:
GitHub Actions remains the trigger and status-reporting entry point, while
Cloud Build performs the Firebase Hosting deployment. After Cloud Build
completes, GitHub Actions retrieves the E2E password from Secret Manager,
masks it, runs `npm run e2e:staging`, and uploads Playwright screenshots,
videos, and the HTML report as short-retention GitHub Actions artifacts when
available. The password value must not be stored in GitHub repository
variables, Cloud Build substitutions, logs, pull requests, or issue evidence.

## Staging E2E Rerun And Failure Handling

Run the manual `Staging Frontend Deploy` workflow from GitHub Actions with the
desired backend OpenAPI ref. Enable `run_e2e=true` when the operator wants the
post-deploy Playwright smoke to run after Firebase Hosting deploy completes.

Inspect failures in this order:

1. GitHub Actions job status and `Run Playwright staging E2E` logs.
2. Cloud Build build id and logs when deploy fails before E2E starts.
3. `staging-playwright-artifacts` for Playwright HTML report, screenshots, and
   videos when E2E fails.

Fix repo-side failures from `dev`, merge through the normal PR gate, then rerun
the staging deployment workflow with `run_e2e=true`. Do not patch the `staging`
branch directly for E2E failures. Operator-side Firebase/GCP/IAM/secret issues
should be fixed in the coordinated staging setup pass, then the same workflow
should be rerun and non-secret evidence attached to the issue.

## Operator Evidence

After operator-side setup, attach only non-secret evidence to the issue or PR:

- Firebase/GCP project id and Firebase Hosting site/target names.
- Stable staging frontend URL.
- Selected `VITE_API_BASE_URL` value.
- Cloud Build run URL or build id.
- Firebase Hosting release id or deployment metadata.
- Staging E2E result summary and redacted artifact links when available.

Do not attach screenshots, logs, or artifacts that contain secret values,
Firebase ID tokens, passwords, private keys, full bearer credentials, or full
database connection strings.

## Related Documents

- `docs/staging-observability-baseline.md`: minimum staging logging, dashboard,
  alert, and cost-control baseline.
- `/Users/cheni-fan/stds_backend/docs/cloud-architecture.md`: backend staging
  architecture baseline.
