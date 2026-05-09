# STDS Frontend

Frontend workspace for the STDS property-management system.

This repository does not maintain its own OpenAPI contract. Frontend API work should use the backend contract directly from:

```text
/Users/cheni-fan/stds_backend/docs/spec/openapi.yaml
```

## Current Status

The repository now has the initial React + Vite + TypeScript + Ant Design app scaffold, canonical app shell, API boundary, Firebase auth bootstrap, route-state primitives, operation/error helpers, runtime HTML preview helper, and local logging policy.

Feature-page implementation should start from `docs/codex/frontend-implementation-reference.md`. Production deployment config and full E2E setup belong to later issues. See `docs/codex/frontend-principles.md` for the current architecture principles and package-manager tradeoffs.

Do not assume implementation details from backend tooling. The backend is Go/Gin/PostgreSQL/Firebase; frontend choices should be verified in this repo when implementation begins.

## Local Development

Install dependencies and run the Vite dev server:

```text
npm install
npm run dev
```

Useful local checks:

```text
npm run typecheck
npm run lint
npm run test
npm run build
npm run openapi:check
```

## Pull Request CI

Pull requests targeting `dev` run the basic frontend CI gate from `.github/workflows/pr-ci.yml`.
The gate installs dependencies with `npm ci`, checks generated OpenAPI types, then runs
`typecheck`, `lint`, `test`, and `build`.

CI checks out `ifan0927/STDS_backend_go` at `dev` inside the workflow workspace and points
`OPENAPI_SPEC_PATH` at that checkout's `docs/spec/openapi.yaml`. Local development keeps the
default sibling-repo path:

```text
/Users/cheni-fan/stds_backend/docs/spec/openapi.yaml
```

Set `OPENAPI_SPEC_PATH` only when the backend OpenAPI file lives somewhere else. This repository
still must not copy or maintain its own OpenAPI contract.

The app uses `BrowserRouter`. Static hosting must provide an SPA fallback to `index.html` before production deployment, but deployment config is intentionally not part of the first scaffold.

`docker-compose.yml` is still reserved for the standalone UI template preview server. The Vite app is not run through Docker Compose at this stage.

`.env.example` includes `VITE_API_BASE_URL` and Firebase client settings. The API wrapper falls back to `/api/v1` when `VITE_API_BASE_URL` is not set. Local Vite development should use `/api/v1` so requests go through the Vite proxy to the backend and avoid browser CORS drift.

For local auth development, start the same Firebase Auth Emulator used by the backend:

```text
firebase emulators:start --only auth
```

In the backend repo, make sure `DATABASE_URL` points to an existing local database with backend migrations applied, then create or update the local emulator users and matching backend DB users:

```text
cd /Users/cheni-fan/stds_backend
scripts/dev_auth_users.sh
```

That backend script creates or updates these local accounts:

| Email | Password | Role |
| --- | --- | --- |
| `local-admin@example.com` | `Test123!` | `admin` |
| `local-organizer@example.com` | `Test123!` | `organizer` |
| `local-staff@example.com` | `Test123!` | `staff` |
| `local-owner@example.com` | `Test123!` | `owner` |

Then set the frontend local env to use the same emulator:

```text
VITE_API_BASE_URL=/api/v1
VITE_FIREBASE_API_KEY=fake-api-key
VITE_FIREBASE_AUTH_DOMAIN=demo-stds-backend.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=demo-stds-backend
VITE_FIREBASE_APP_ID=demo-stds-frontend
VITE_FIREBASE_USE_EMULATOR=true
VITE_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099
```

The frontend does not own a long-running Docker Compose auth emulator. Backend local and E2E flows already use the Auth Emulator on `127.0.0.1:9099`, and frontend auth should connect to that same emulator when local verification needs real Firebase tokens. Frontend login uses the Firebase client SDK against the emulator, then sends the returned ID token as `Authorization: Bearer <token>` for `POST /auth/sync` and protected backend APIs.

## API Boundary And OpenAPI Types

The frontend uses the backend OpenAPI file directly and generates TypeScript types into:

```text
src/api/generated/schema.ts
```

Regenerate the type-only schema after backend OpenAPI changes:

```text
npm run openapi:generate
```

Check whether the generated schema is current:

```text
npm run openapi:check
```

Do not edit generated schema types manually, and do not copy `openapi.yaml` into this repository.

Feature pages should call backend APIs through `src/api/client.ts` instead of using raw `fetch`. The wrapper owns:

- base URL handling from `VITE_API_BASE_URL`
- Firebase Bearer token injection through a token provider interface
- JSON request/response parsing
- backend `ErrorResponse` mapping into `ApiError`
- `AbortSignal` pass-through
- runtime HTML document responses for report/export flows

The API wrapper does not own Firebase SDK behavior, route redirects, Ant Design messages, global error UI, client cache, optimistic updates, or page-level refetch policy.

Runtime HTML exports return an `HtmlDocumentResponse` with the HTML body, content type, content disposition, and parsed filename. First launch treats backend HTML as the source document. A later frontend-owned HTML-to-PDF issue can consume this same response shape without changing the API boundary.

## Feature Page Implementation Reference

Use `docs/codex/frontend-implementation-reference.md` before implementing feature pages. It is the bootstrap handoff for established tools and primitives:

- API client and OpenAPI type usage
- error and route-state mapping
- form validation and mutation feedback policy
- runtime HTML export preview behavior
- local logging and production safety rules
- test and verification expectations

## Backend Reference

Use the backend repo as the source of truth for API behavior and domain rules:

```text
/Users/cheni-fan/stds_backend
```

Important backend files:

- `AGENTS.md`: backend coding-agent rules.
- `CLAUDE.md`: backend architecture and command summary.
- `README.md`: local backend, Firebase Auth Emulator, E2E, and OpenAPI workflow.
- `docs/spec/openapi.yaml`: bundled OpenAPI contract consumed by frontend work.
- `docs/spec/error-codes.md`: API error-code contract.
- `docs/design/domain-model.md`: domain behavior and bounded-context rules.
- `docs/infra-guideline.md`: auth, error handling, logging, scheduler, and transaction boundaries.

Avoid treating `docs/spec/tasks.md` as current planning truth unless historical context is explicitly needed.

## Backend Contract Summary

- Authentication uses Firebase Auth on the client side.
- Frontend obtains a Firebase ID token and sends backend requests with `Authorization: Bearer <token>`.
- `/auth/sync` is called after Firebase login/token updates to sync the Firebase user into the backend DB.
- Backend roles and property access are enforced server-side. UI checks are only presentation and workflow guidance.
- Production frontend observability relies on Firebase Hosting request logs and backend GCP logs. The static React app should show user-visible error states, but it should not send tokens, raw request bodies, or sensitive tenant/property data to client-side log ingestion unless a later monitoring issue explicitly adds that system.
- Internal scheduler endpoints use `X-Scheduler-Key` and are not normal frontend user flows.
- The current OpenAPI title is `STDS API`, version `1.0.1`.

Major API areas in the current contract:

- Identity and access: users, current user, property assignments, password reset.
- Property: properties, rooms, dashboard, attachments.
- Leasing: tenants, leases, replacement, termination, force termination, deposits.
- Billing: bills, meter reading, payment, receipts, financial reports, operation reports, tenant roster.
- Journal: journal logs, repair requests, repair assignment/progress/completion/cancel flows.
- Attachments: upload URL creation and attachment deletion.

## Codex Workflow

Before frontend API work:

1. Read `AGENTS.md` in this repo.
2. Read `docs/codex/frontend-implementation-reference.md` for established tools and primitives.
3. Read `docs/codex/frontend-principles.md` for frontend scope and architecture constraints.
4. Read `docs/codex/workflow.md` for the issue-driven workflow and frontend testing strategy.
5. Read `docs/codex/github-workflow.md` before issue, branch, commit, PR, label, or review-label work.
6. Read `docs/codex/ui-design-workflow.md` when replacing or redesigning legacy UI.
7. Read `DESIGN.md` for baseline UI layout, spacing, and Ant Design rules.
8. Inspect the relevant backend OpenAPI paths and schemas.
9. Check backend domain docs when the UI flow depends on business rules.
10. State assumptions and success criteria before coding.
11. Keep changes surgical and verify with the repo's established scripts once they exist.

## Workflow Summary

Frontend work should start from GitHub issues. Issues are expected to define goal, out of scope, implementation scope, DoD, and reference docs.

During active feature development, do not add CI just to slow down iteration. Use implementation verification, PR code review, and same-issue test follow-up for quality hardening. E2E should be added later for high-value flows once the core screens and harness shape are stable.

For legacy refresh areas, first survey the old page, map it to backend OpenAPI boundaries, create a phase backlog, then produce a reviewable UI design template before implementation. A standalone HTML template is acceptable as the review artifact before the React scaffold or final component structure exists.

`DESIGN.md` is the baseline admin design contract. It should be refined from accepted UI templates rather than replaced by external brand-style design systems.

GitHub work uses a small label pool, `[tag] content` commit messages, and `tag/issue-xx-content` branch names. Add `ai-review` to PRs only when the user asks for AI/CodeRabbit review, or suggest it for risky PRs and wait for confirmation.
