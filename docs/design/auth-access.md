# Auth And Access Design

> Status: contract map for UI template planning
> Scope: login, auth sync, protected routes, current user, user management, and property assignments
> References: `docs/design/frontend-foundation.md`, `DESIGN.md`, `docs/codex/backend-reference.md`, `/Users/cheni-fan/stds_backend/docs/spec/openapi.yaml`

## Scope

Auth/access UI covers:

- Firebase client login entry
- backend auth sync and account gate
- protected app shell states
- current-user profile
- user list/detail management
- user creation and password setup/reset resend
- property assignment management for studio members

This doc does not decide Firebase SDK wiring, router implementation, generated API client strategy, or package configuration.

## Current Backend Contract

- Login uses Firebase client authentication; backend protected APIs require `Authorization: Bearer <Firebase ID token>`.
- `POST /auth/sync` verifies the token, resolves the backend user, updates backend/Firebase authorization data as needed, and returns `UserResponse`.
- `GET /users/me` and `PATCH /users/me` support current-user profile read/update; editable field is `name`.
- `GET /users` supports `role`, `page`, and `limit`, and returns `pagination {page, limit, total, total_pages, has_next}`.
- `POST /users` creates backend/Firebase user and triggers setup email; frontend does not collect a password.
- `GET /users/{id}` and `PATCH /users/{id}` support user detail and admin account updates.
- `POST /users/{id}/property-assignments` updates studio-member property assignments.
- `POST /users/{id}/password-reset` resends setup/reset email.
- Shared readable labels should be used as primary display text where responses provide them; UUIDs are secondary metadata.

## Page / Workflow Slices

### Login

- Purpose: let users sign in through Firebase and recover from sign-in/session errors.
- Backend contract: no direct backend call until Firebase returns an ID token.
- Status: ready for UI template.

### Auth Sync / Account Gate

- Purpose: convert a Firebase session into an app session backed by `UserResponse`.
- Backend contract: `POST /auth/sync`; handle invalid token, `USER_NOT_FOUND`, retryable failure, and success.
- Status: ready for UI template.

### Protected App Shell

- Purpose: show allowed navigation and stable route states after sync.
- Backend contract: current user from `POST /auth/sync`; protected API responses remain authoritative for `401`, `403`, and `404`.
- Status: ready for UI template.

### Current User Profile

- Purpose: show role/email/property context and allow self name update.
- Backend contract: `GET /users/me`, `PATCH /users/me`.
- Status: ready for UI template.

### User Management List

- Purpose: list users for roles allowed by backend, with role filter and pagination.
- Backend contract: `GET /users?role=&page=&limit=` returns `data` and `pagination`.
- Status: ready for UI template; user-facing labels should prefer readable names/emails over IDs.

### User Detail / Access Management

- Purpose: review a user, edit role/name when permitted, manage property assignments, and resend password setup/reset.
- Backend contract: `GET /users/{id}`, `PATCH /users/{id}`, `POST /users/{id}/property-assignments`, `POST /users/{id}/password-reset`.
- Status: ready for UI template.

### Create User

- Purpose: create an account and show setup-email result.
- Backend contract: `POST /users` with `email`, `name`, `role`.
- Status: ready for UI template.

## Remaining Decisions

- Firebase client config, redirect behavior, and local emulator/staging setup belong to the frontend scaffold/auth implementation issue.
- Whether implementation needs a compact property option endpoint after trying current readable labels and `GET /properties`/`GET /users` flows.

## Not Carried Forward

- Backend email/password login form.
- Frontend password entry for admin-created users.
- Frontend-only authorization as the source of truth.
- Treating Firebase custom claims as the primary current-user UI contract when backend `UserResponse` is available.
- Legacy-style property assignment by raw UUID as the primary visible representation.
