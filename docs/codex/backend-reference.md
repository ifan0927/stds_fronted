# Backend Reference For Codex

This note exists so future frontend sessions can quickly find the backend source of truth without copying backend contracts into this repository.

## Source Of Truth

```text
/Users/cheni-fan/stds_backend/docs/spec/openapi.yaml
```

The frontend repository should reference this file directly when reading the API contract or configuring future API client generation. Do not create a second maintained OpenAPI copy here.

## Backend Files To Read

Read these files in the backend repo when a frontend task depends on backend behavior:

- `AGENTS.md`: agent behavior and backend-specific rules.
- `CLAUDE.md`: backend request lifecycle, auth strategy, OpenAPI generation, and application-layer summary.
- `README.md`: local API startup, Firebase Auth Emulator, E2E, and OpenAPI workflow.
- `docs/spec/openapi.yaml`: current API paths, schemas, auth, and response contracts.
- `docs/spec/error-codes.md`: error codes to map in UI states.
- `docs/design/domain-model.md`: domain states, lifecycle rules, and bounded contexts.
- `docs/infra-guideline.md`: backend auth, authorization, error handling, logging, scheduler, and DB boundaries.

Avoid `docs/spec/tasks.md` for current product truth unless the user asks for old planning context.

## Current Backend Shape

- Backend stack: Go, Gin, PostgreSQL, Firebase Auth, Cloud Run-oriented infra.
- API contract style: OpenAPI spec-first, bundled at `docs/spec/openapi.yaml`.
- Auth model: frontend uses Firebase SDK, then sends Firebase ID token as a Bearer token to backend.
- Backend source of authorization truth: DB user resolved from Firebase UID, role, and assigned property access.
- Scheduler endpoints are internal and use `X-Scheduler-Key`; they are not normal frontend screens.

## API Areas To Expect

- Auth sync: `/auth/sync`
- Users and current user: `/users`, `/users/me`, `/users/{id}`, property assignments, password reset
- Properties and rooms: `/properties`, `/properties/{id}/rooms`, room maintenance, dashboards
- Tenants and leases: tenant CRUD, lease CRUD, lease replacement, normal termination, force termination, deposits
- Billing: bills, receipts, meter reading, payments, pending meters, meter history
- Reports: financial report summary/detail, cashflow export, profit/loss export, operation report, send flow, tenant roster
- Journal and repair: journal logs, repair requests, assignment, progress, completion, cancellation
- Attachments: upload URL, resource-scoped attachment creation/listing, deletion

## Frontend Implications

- UI labels should default to Traditional Chinese.
- API identifiers and generated code should stay aligned with OpenAPI names.
- Do not infer request/response shapes from memory. Inspect OpenAPI for the exact schema before implementation.
- Treat backend error codes as a UI contract; prefer explicit error-state handling over generic failure text when a code has known product meaning.
- When implementing protected screens, account for backend-enforced role/property authorization and handle unauthorized/not-found responses distinctly.