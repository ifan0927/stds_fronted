# Frontend Foundation Design

> Status: contract map for UI template planning
> Scope: shared UI/UX rules used by module design docs
> References: `DESIGN.md`, `docs/codex/frontend-principles.md`, `docs/codex/ui-design-workflow.md`, `docs/codex/backend-reference.md`

## Scope

This file is the shared frontend contract for STDS admin UI planning. It does not choose React component structure, router setup, state library, API client generation, package manager, or test runner.

Frontend implementation should stay backend-contract driven:

- use Traditional Chinese for visible UI copy
- keep API identifiers, schema fields, code comments, and error-code constants in English
- prefer backend API calls plus refetch after mutations over frontend-only aggregation or complex cache orchestration
- use `DESIGN.md` as the Ant Design admin baseline
- show explicit loading, empty, error, forbidden, not-found, submit-loading, and success states for API-backed workflows

## Current Backend Contract

- API source of truth: `/Users/cheni-fan/stds_backend/docs/spec/openapi.yaml`.
- Auth: frontend gets a Firebase ID token and calls backend with `Authorization: Bearer <token>`.
- Current-user bootstrap: `POST /auth/sync` returns the backend `UserResponse`; frontend should use it as the current app user.
- Dashboard/read models: `GET /api/v1/dashboard` returns `portfolio_summary`, `monthly_billing_summary`, `property_summaries[]`, and `recent_journals[]`; `GET /api/v1/properties` and `GET /api/v1/properties/{id}/dashboard` expose backend-owned occupancy/dashboard summaries. Frontend must not aggregate dashboard, occupancy, billing, room, or journal summaries from paginated child endpoints.
- Shared readable labels: major list/detail responses include readable labels where backend can provide them. UI should use labels as primary display text and keep UUIDs as secondary technical metadata only when useful.
- Pagination: endpoints that return a `pagination` object use `{page, limit, total, total_pages, has_next}`.
- Nullable PATCH semantics: omitted field means keep current value; explicit `null` means clear the nullable field when the backend schema allows it.
- Runtime HTML exports are response-time documents unless the backend contract explicitly says they are persisted files.

## Page / Workflow Slices

### Protected Shell

- Purpose: provide stable navigation and route-level auth states.
- Backend contract: Firebase session plus `POST /auth/sync`; protected API responses may return `401`, `403`, or `404`.
- Status: ready for UI template; exact route tree belongs to implementation.

### API State Surfaces

- Purpose: keep async behavior consistent across list, detail, form, workflow, attachment, and export screens.
- Backend contract: documented HTTP status and `error_code` values from OpenAPI/error-code docs.
- Status: ready for UI template; module docs should name only workflow-specific error cases.

### Tables And Pagination

- Purpose: standardize list screens with filters, row actions, pagination, and empty/error states.
- Backend contract: map filters and pagination to endpoint query params; use backend `pagination` when provided.
- Status: ready for UI template; do not invent client-only filtering/sorting for server-paginated data.

### Forms And Mutations

- Purpose: standardize create/edit flows, validation mapping, submit loading, cancel behavior, and post-submit refresh.
- Backend contract: request schemas define writable fields; PATCH follows omitted=keep and null=clear.
- Status: ready for UI template; module docs should not expose fields unsupported by OpenAPI.

### Dashboard And Read Models

- Purpose: present home/property operational summaries without frontend aggregation.
- Backend contract: `GET /api/v1/dashboard`, `GET /api/v1/properties`, `GET /api/v1/properties/{id}/dashboard`.
- Status: ready for UI template; frontend owns layout and state handling, backend owns summary semantics.

### Attachments

- Purpose: reuse one upload/list/delete UX for property, room, tenant, lease, bill, journal, and repair attachments.
- Backend contract: `POST /attachments/upload-url`, resource attachment register/list endpoints, `DELETE /attachments/{id}`.
- Status: ready for UI template; do not expose signed URL, nonce, bucket, object path, or storage internals as product copy.

### Runtime HTML Exports

- Purpose: provide consistent preview/open/print/download behavior around backend-owned HTML documents.
- Backend contract: report/export endpoints return HTML unless explicitly documented otherwise.
- Status: ready for UI template; frontend must not redefine backend report body, totals, ordering, or template fidelity.

## Remaining Decisions

- Facility option source across property and room forms: fixed frontend checklist, free-form entry, or backend-managed option list.
- Whether any dashboard summary needs a new backend read model beyond the current home/property dashboard contracts.

## Not Carried Forward

- Frontend-only authorization as the source of truth.
- Frontend-generated dashboard, occupancy, or billing summaries from unrelated paginated endpoints.
- Legacy GET-style write/delete/copy actions.
- Calendar module behavior unless a later product decision reopens it.
- Persisted generated files, GCS records, attachments, or PDF assumptions for runtime HTML exports unless backend contract says so.
