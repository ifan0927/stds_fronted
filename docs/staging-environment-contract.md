# Frontend Staging Environment Contract

Status: repo-side contract for #104, #105, #106, #107, #108, #120, and
#121.
Operator-side Firebase/GCP setup happens later as one coordinated staging setup
pass.

This document defines the frontend `dev` -> staging environment contract. It
does not create Firebase Hosting, Cloud Build, Playwright, Secret Manager, or
GCP resources by itself. Operator handbook steps belong in the backend repo
[GitHub Wiki](https://github.com/ifan0927/STDS_backend_go/wiki/Staging-v1-Operator-Handbook-2026-05-15-v1);
this frontend document should stay a contract reference.

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

## Branch Governance

The frontend `staging` branch is a deployment-intent branch, not a development
branch. Feature work continues to target `dev` first.

Normal staging promotion must use a `dev` -> `staging` pull request. Direct
pushes to `staging` are not part of normal operation, and this project stage
does not define a break-glass direct-push path.

Pull requests targeting `staging` must run the frontend PR CI gate before they
can merge. The required status check name is:

```text
Frontend checks
```

The GitHub `staging` Environment approval gate is only a deploy approval gate.
It is not a substitute for PR CI, and it should run after predeploy checks in
the deploy workflow.

A push to `staging` starts the staging deploy workflow automatically after the
normal `dev` -> `staging` promotion PR is merged. The workflow serializes
frontend staging deploys with GitHub Actions concurrency. `workflow_dispatch`
remains available only as a controlled operator rerun path, not the normal
promotion path.

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

Frontend E2E belongs to the second-phase `dev` -> `staging` line, but the
mandatory deployment gate is intentionally lower dependency than the
auth/data-heavy Playwright path.

The staging deploy workflow uses GitHub Actions as the trigger, predeploy, and
status-reporting layer:

1. On `staging` push, check out the exact pushed frontend commit.
2. Check out the backend OpenAPI source at backend `staging` for automatic
   deploys, or at the manual `backend_ref` for controlled reruns.
3. Run `npm ci`, `npm run openapi:check`, `npm run typecheck`,
   `npm run lint`, `npm run test`, `npm run build`, and same-origin/emulator
   build-time invariant checks before GitHub Environment approval.
4. Wait for GitHub `staging` Environment approval.
5. Build the approved staging artifact with the `staging` Environment
   variables.
6. Submit a deploy-only Cloud Build that generates Firebase Hosting config and
   deploys the approved `dist` artifact.
7. Run the mandatory low-dependency Tier 1 smoke against the stable staging
   frontend URL.
8. Optionally run the auth/data-heavy Playwright staging smoke only from a
   manual rerun with `run_e2e=true`.

The deploy-only Cloud Build path intentionally does not rerun frontend checks
after the GitHub Environment approval gate. Checks must pass before approval.
Because the concrete Firebase web app configuration currently lives in the
GitHub `staging` Environment, the deploy job rebuilds the already-checked
frontend artifact after approval with the approved environment variables. The
approval-gated Cloud Build only performs Firebase Hosting config generation and
deploy.

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
| `STAGING_BUG_REPORT_URL` | Staging bug-report form URL opened by the sidebar BUG report link. | GitHub `staging` Environment variable |

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
VITE_BUG_REPORT_URL
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

`VITE_BUG_REPORT_URL` is also client-visible build configuration. Keep the
staging value in `STAGING_BUG_REPORT_URL`; when a production deploy workflow is
added, use a separate production environment variable such as
`PROD_BUG_REPORT_URL` and map it to `VITE_BUG_REPORT_URL` during the production
build.

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
STAGING_TIER1_SMOKE_URL
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
the staging project, act as the configured Cloud Build service account, read
Firebase Hosting live release/version metadata, clone a captured Hosting
version back to the live channel for rollback, and read only the configured
staging E2E password secret when the optional Tier 2 Playwright step is
enabled.

The Cloud Build service account identified by
`STAGING_CLOUD_BUILD_SERVICE_ACCOUNT_EMAIL` should only receive the permissions
needed for this frontend deploy line:

- read the submitted build source and write Cloud Build logs
- deploy to the configured Firebase Hosting site
- read project/resource metadata needed by Firebase Hosting deploy
- read API key metadata required by Firebase CLI deploy

It does not need staging E2E secrets because the #107 post-deploy Playwright
step runs in GitHub Actions after Cloud Build completes. It also does not need
backend Cloud Run deploy, Cloud SQL, GCS object, Resend, database migration, or
production project permissions for this frontend-only staging deploy.

Before the first rollback drill, verify the non-secret IAM capability rather
than assuming deploy-only permissions are enough:

- GitHub deploy service account can submit Cloud Build builds and act as the
  configured Cloud Build service account.
- GitHub deploy service account can list the Firebase Hosting live release and
  version for the configured site.
- GitHub deploy service account can clone a captured Firebase Hosting version
  back to the live channel for rollback.
- Cloud Build service account can deploy to the configured Firebase Hosting
  site.
- Cloud Build service account has Firebase CLI deploy prerequisites, including
  Firebase Hosting write access and API key metadata read access such as
  `roles/serviceusage.apiKeysViewer`.

### Cloud Build Substitutions

Cloud Build substitutions should receive non-secret build/deploy selectors from
GitHub and turn them into Vite build-time environment variables:

```text
_VITE_API_BASE_URL
_VITE_FIREBASE_API_KEY
_VITE_FIREBASE_AUTH_DOMAIN
_VITE_FIREBASE_PROJECT_ID
_VITE_FIREBASE_APP_ID
_VITE_BUG_REPORT_URL
_VITE_FIREBASE_USE_EMULATOR
_FIREBASE_HOSTING_SITE
_BACKEND_CLOUD_RUN_SERVICE
_BACKEND_CLOUD_RUN_REGION
_FIREBASE_TOOLS_VERSION
```

The repo-side staging deploy entry points are:

- `.github/workflows/staging-frontend-deploy.yml`
- `cloudbuild.staging.deploy.yaml`

The GitHub workflow checks out the backend repository only to provide the
current OpenAPI file to the predeploy check. The frontend repository still does
not copy or maintain an OpenAPI contract.

The staging deploy workflow triggers automatically on `staging` branch push and
also supports `workflow_dispatch` for controlled operator reruns. Automatic
deploys use backend `staging` for the OpenAPI check. Manual reruns may provide
`backend_ref` when the operator needs to verify against a specific backend
contract ref.

The predeploy job runs these checks in GitHub Actions before the GitHub
`staging` Environment approval gate:

```text
npm ci
npm run openapi:check
npm run typecheck
npm run lint
npm run test
npm run build
```

Only after those checks pass and the GitHub `staging` Environment is approved
does the deploy job rebuild with the approved `staging` Environment variables
and submit `cloudbuild.staging.deploy.yaml`.

`cloudbuild.staging.yaml` may remain in repository history or older run
references, but the #121 approval-gated deploy path must use the deploy-only
config.

The focused Playwright smoke can be enabled from the manual workflow with
`run_e2e=true`. It runs after deploy and after the mandatory Tier 1 smoke in
this `dev` -> `staging` line. It must not be added to the feature branch ->
`dev` PR gate, and it is not mandatory Tier 1 under #121.

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

The existing Playwright staging smoke is a Tier 2/manual path under #121.
GitHub Actions retrieves the E2E password from Secret Manager only when a
manual workflow rerun enables `run_e2e=true`, masks it, runs
`npm run e2e:staging`, and uploads Playwright screenshots, videos, and the HTML
report as short-retention GitHub Actions artifacts when available. The password
value must not be stored in GitHub repository variables, Cloud Build
substitutions, logs, pull requests, or issue evidence.

Auth/data-heavy deployed Playwright staging coverage remains deferred to the
smoke-tier follow-up (#122) before it can become mandatory.

## Smoke Tiers And Failure Handling

Tier 1 is mandatory and low dependency. It does not require staging test
credentials, seeded backend data, or a particular property/room record. It
checks that the stable staging frontend URL serves the deployed SPA shell and
referenced frontend assets after Firebase Hosting deploy completes.

The normal Tier 1 target is `STAGING_FRONTEND_URL`. Rollback drills may set
`STAGING_TIER1_SMOKE_URL` to override only the smoke target without changing
the stable browser-facing URL contract. Record the original override value
before a drill, restore it immediately after observing rollback behavior, and
verify the current public endpoint after restore.

Tier 2 is optional/manual under #121. It is the existing auth/data-heavy
Playwright staging smoke and may require a dedicated Firebase Auth user,
matching backend DB user, and seeded property data. #122 owns the decision to
redesign or promote this tier.

Run the manual `Staging Frontend Deploy` workflow only for a controlled rerun.
Use the desired backend OpenAPI ref when needed. Enable `run_e2e=true` only
when the operator wants the optional Tier 2 Playwright smoke to run after
Firebase Hosting deploy and mandatory Tier 1 smoke complete.

Inspect failures in this order:

1. GitHub Actions `predeploy` logs when checks fail before Environment
   approval.
2. GitHub Actions deploy job logs and Cloud Build build id/logs when Firebase
   Hosting deploy fails.
3. Tier 1 smoke output and rollback evidence when the deploy succeeds but the
   low-dependency smoke fails.
4. `staging-playwright-artifacts` for Playwright HTML report, screenshots, and
   videos when optional Tier 2 E2E fails.

If Firebase deploy succeeds but Tier 1 smoke fails, the workflow attempts to
clone the pre-deploy live Firebase Hosting version back to the live channel
when that version was captured, then reads the live channel again and verifies
that it points back to the captured version. If the pre-deploy live version was
not captured, Firebase tooling/API behavior prevents automatic clone-based
rollback, or the post-rollback verification does not match the captured
version, the workflow fails loudly and prints manual rollback instructions plus
non-secret evidence. It must not mutate repository history, create a revert PR,
or bypass the `dev` -> `staging` PR process.

For a rollback drill, prefer changing only `STAGING_TIER1_SMOKE_URL` to an
invalid URL and triggering the workflow manually. Do not merge a deliberately
broken frontend commit just to test rollback. Restore the variable immediately
after the drill, even if automated rollback fails, then verify the stable
staging frontend URL again.

Fix repo-side failures from `dev`, merge through the normal PR gate, then
promote through `dev` -> `staging` again or use a controlled manual rerun. Do
not patch the `staging` branch directly for smoke failures. Operator-side
Firebase/GCP/IAM/secret issues should be fixed in the coordinated staging setup
pass, then the same workflow should be rerun and non-secret evidence attached
to the issue.

## Operator Evidence

After operator-side setup, attach only non-secret evidence to the issue or PR:

- `staging` branch existence and source commit.
- Branch ruleset or branch protection summary for `refs/heads/staging`.
- Required staging PR status check names, including `Frontend checks`.
- GitHub `staging` Environment required reviewer summary.
- Example or dry-run evidence that a pull request targeting `staging` runs
  frontend PR CI.
- Firebase/GCP project id and Firebase Hosting site/target names.
- Stable staging frontend URL.
- Selected `VITE_API_BASE_URL` value.
- Selected `VITE_BUG_REPORT_URL` value or redacted target description.
- Cloud Build run URL or build id.
- Source commit SHA and GitHub run id.
- Backend OpenAPI ref used for the contract check.
- Pre-deploy live Firebase Hosting release/version id when captured.
- Deployed Firebase Hosting release/version id when captured.
- Tier 1 smoke result.
- Rollback command/result when rollback runs.
- Post-rollback live Firebase Hosting release/version id when captured.
- Manual rollback instruction summary when automatic rollback could not run.
- Optional Tier 2 staging E2E result summary and redacted artifact links when
  available.

Do not attach screenshots, logs, or artifacts that contain secret values,
Firebase ID tokens, passwords, private keys, full bearer credentials, or full
database connection strings.

## Related Documents

- `docs/staging-observability-baseline.md`: minimum staging logging, dashboard,
  alert, and cost-control baseline.
- Backend repo
  [GitHub Wiki operator handbook](https://github.com/ifan0927/STDS_backend_go/wiki/Staging-v1-Operator-Handbook-2026-05-15-v1):
  operator-side staging setup steps and evidence checklist.
- `/Users/cheni-fan/stds_backend/docs/cloud-architecture.md`: backend staging
  architecture baseline.
