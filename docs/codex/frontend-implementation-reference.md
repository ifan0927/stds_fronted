# Frontend Implementation Reference

This document is the short handoff reference for feature-page implementation after the bootstrap foundation. It is intentionally practical: use the existing tools and primitives before adding new patterns.

## Stack

- React 18 + TypeScript + Vite.
- Ant Design 5 for UI components, theme, messages, layout, forms, tables, modals, drawers, and route states.
- React Router for the SPA route tree.
- Firebase client auth for login; backend API requests use Firebase ID tokens as Bearer tokens.
- OpenAPI types are generated from `/Users/cheni-fan/stds_backend/docs/spec/openapi.yaml` into `src/api/generated/schema.ts`.
- Vitest is the current unit/API-boundary test runner.
- Playwright is deferred until high-value frontend E2E flows are ready.

Do not add another UI framework, router, global state library, API client generator, test runner, or E2E framework unless a GitHub issue explicitly expands the foundation.

## Files To Read Before Feature Pages

1. `AGENTS.md` for repo rules and issue workflow.
2. The GitHub issue goal, out of scope, implementation scope, DoD, and comments.
3. `DESIGN.md` for Ant Design admin UI rules.
4. `docs/codex/frontend-principles.md` for architecture and simplicity constraints.
5. `docs/codex/workflow.md` for testing and PR expectations.
6. `docs/codex/backend-reference.md` plus relevant backend OpenAPI paths.
7. The accepted UI template or module design doc when the issue references one.

## API Boundary

Use `src/api/client.ts` through exported API helpers instead of raw `fetch`.

The API boundary owns:

- base URL handling from `VITE_API_BASE_URL`
- Bearer token attachment through a token provider
- JSON request and response parsing
- backend `ErrorResponse` parsing into `ApiError`
- `AbortSignal` pass-through
- runtime HTML response parsing

Feature pages own:

- choosing the correct endpoint from OpenAPI
- request payload construction from form state
- visible loading, empty, error, and success states
- refetching affected data after mutations

Do not hard-code response shapes from memory. Use generated OpenAPI types when available.

## Error And Route States

Use `classifyApiErrorForUi` for backend and network failures before choosing UI copy.

Foundation mapping:

- `401`: login/session state
- `403`: forbidden state or disabled action reason
- `404`: not-found route/page state, not an empty table
- `409`: stale data warning plus refetch/retry
- `422`: validation/form error
- `5xx` or network failure: retryable error
- unknown failure: generic operation failure

Use route-level states from `src/app/routeState.tsx` when the whole page cannot render. Use inline `Alert` for durable workflow or form errors. Use Ant Design message feedback only for short operation results.

Visible user copy must stay Traditional Chinese and must not expose API paths, HTTP methods, backend error codes, token names, storage internals, or stack details.

## Forms And Mutations

Use Ant Design `Form` patterns.

Default mutation behavior:

- disable duplicate submit through loading state
- show short success or failure feedback
- refetch affected backend data after success
- refetch after `409` conflict before retrying
- avoid optimistic updates unless a later issue defines the failure behavior

Use `getFormErrorState` for `422` handling. The foundation only maps backend error codes to fields when a feature page provides an explicit field map. Without a field map, show a form-level Alert. Do not assume backend `details` has a stable field-error shape.

## Runtime HTML Exports

Runtime HTML exports are backend-owned documents.

Use the HTML response shape from `src/api/html.ts` and `openHtmlDocumentPreview` for first-launch preview/open behavior. The frontend owns loading state, action placement, retry errors, and preview handling only.

Do not generate PDF, persist file bytes, create attachments, or expose storage internals unless a later backend contract explicitly supports that workflow. A future HTML-to-PDF issue should consume the existing `HtmlDocumentResponse` shape instead of changing the API boundary.

## Logging

Use `src/app/logger.ts` for local development diagnostics.

Production default:

- no client log ingestion service
- no analytics or third-party monitoring
- no token, credential, cookie, raw request body, tenant, or sensitive property data in logs

Production failures should be visible through UI states and backend request/log correlation when available. Add client-side monitoring only through a later explicit issue.

## State Management

Default order:

1. local component state for forms and small view state
2. URL query params for shareable filters, pagination, and report periods
3. backend refetch after mutations
4. a query/cache library only after repeated loading/cache/invalidation behavior becomes real duplication
5. global state only for true app-wide state such as current session

Do not add Redux, Zustand, MobX, or similar global state management by default.

## Verification

Use existing scripts:

```text
npm run typecheck
npm run lint
npm run test
npm run build
```

For narrow helper changes, a focused `npm run test -- <pattern>` is acceptable during development, but PR readiness should document all relevant checks that were run.
