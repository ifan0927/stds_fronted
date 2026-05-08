# STDS Frontend

Frontend workspace for the STDS property-management system.

This repository does not maintain its own OpenAPI contract. Frontend API work should use the backend contract directly from:

```text
/Users/cheni-fan/stds_backend/docs/spec/openapi.yaml
```

## Current Status

The repository is currently at Codex/bootstrap stage. Application scaffold, framework choice, package scripts, API client generation, and test setup have not been established in this repo yet.

Expected frontend direction is React + Vite + TypeScript + Ant Design with static deployment on GCP, but the scaffold has not been created yet. See `docs/codex/frontend-principles.md` for the current architecture principles and package-manager tradeoffs.

Do not assume implementation details from backend tooling. The backend is Go/Gin/PostgreSQL/Firebase; frontend choices should be verified in this repo when implementation begins.

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
2. Read `docs/codex/frontend-principles.md` for frontend scope and architecture constraints.
3. Read `docs/codex/workflow.md` for the issue-driven workflow and frontend testing strategy.
4. Read `docs/codex/github-workflow.md` before issue, branch, commit, PR, label, or review-label work.
5. Read `docs/codex/ui-design-workflow.md` when replacing or redesigning legacy UI.
6. Read `DESIGN.md` for baseline UI layout, spacing, and Ant Design rules.
7. Inspect the relevant backend OpenAPI paths and schemas.
8. Check backend domain docs when the UI flow depends on business rules.
9. State assumptions and success criteria before coding.
10. Keep changes surgical and verify with the repo's established scripts once they exist.

## Workflow Summary

Frontend work should start from GitHub issues. Issues are expected to define goal, out of scope, implementation scope, DoD, and reference docs.

During active feature development, do not add CI just to slow down iteration. Use implementation verification, PR code review, and same-issue test follow-up for quality hardening. E2E should be added later for high-value flows once the core screens and harness shape are stable.

For legacy refresh areas, first survey the old page, map it to backend OpenAPI boundaries, create a phase backlog, then produce a reviewable UI design template before implementation. A standalone HTML template is acceptable as the review artifact before the React scaffold or final component structure exists.

`DESIGN.md` is the baseline admin design contract. It should be refined from accepted UI templates rather than replaced by external brand-style design systems.

GitHub work uses a small label pool, `[tag] content` commit messages, and `tag/issue-xx-content` branch names. Add `ai-review` to PRs only when the user asks for AI/CodeRabbit review, or suggest it for risky PRs and wait for confirmation.
