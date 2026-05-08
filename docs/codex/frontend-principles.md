# Frontend Principles For Codex

This project is expected to become a React + Vite + Ant Design frontend for STDS, deployed as static assets on GCP. These principles are intentionally conservative until the actual scaffold is created.

## Primary Direction

- Planned UI stack: React, Vite, TypeScript, Ant Design.
- Planned deployment shape: static frontend assets on GCP.
- Backend API contract: `/Users/cheni-fan/stds_backend/docs/spec/openapi.yaml`.
- Frontend should stay API-driven and should not duplicate backend business rules beyond what is needed for usable forms and screens.

## Simplicity Rule

Prefer the simplest implementation that makes the workflow correct:

- Prefer direct backend API calls over complex client-side orchestration.
- Prefer refetching server data after mutations over maintaining a large normalized client cache.
- Page refresh, route refresh, or table reload after a write is acceptable when it keeps behavior clear.
- Do not introduce global state management for a single screen or a small local workflow.
- Do not add optimistic updates unless the user experience clearly needs them and the failure behavior is defined.
- If a UI improvement requires more state, caching, background sync, or cross-screen coordination, discuss that tradeoff with the user first.

The frontend should feel clean and efficient, but it does not need to hide every network boundary.

## Shared Boundaries

Even with a simple architecture, repeated concerns should have small shared definitions. Extract only the smallest safe primitive when duplication would create real risk.

Expected shared areas:

- API: base client, auth header attachment, OpenAPI-derived types/client when introduced, response parsing.
- Auth: Firebase token retrieval, `/auth/sync`, current-user loading, protected-route behavior.
- Error handling: backend error-code parsing, common unauthorized/not-found/validation handling, user-facing fallback messages.
- Logging: local development logs, production error/reporting hooks, request correlation fields where available.
- Tables: pagination, sorting, filters, row actions, empty/error/loading states.
- Date/time: Asia/Taipei display helpers, month/year formatting, form parsing boundaries.
- Money/number: TWD display, integer amount formatting, decimal meter/unit-price display.
- Forms: common required-field display, backend validation mapping, submit loading behavior.

Avoid broad "framework" abstractions. A shared helper is justified when it removes repeated risk, not when it only makes future extension possible.

## Logging And GCP Static Deployment

Static frontend deployment has two different logging layers:

- Hosting/request logs: Firebase Hosting can export CDN web request logs to Cloud Logging after linking the Firebase project to Cloud Logging. Cloud Storage static hosting can provide bucket/request-style logs, but it does not run application code.
- Browser/client logs: `console.log` in a static React app stays in the user's browser. It does not automatically become Cloud Logging.

Initial recommendation:

- Use console output only for local development diagnostics.
- Surface production failures through user-visible error states and backend request IDs when returned.
- Do not add a client log ingestion service in the first scaffold.
- If production client-side error monitoring becomes necessary, choose it explicitly later: either a small backend ingestion endpoint, Firebase/Google observability option, or a third-party client monitoring service.

Do not send tokens, credentials, raw request bodies, or sensitive tenant/property data to any client-side logging target.

## State Management

Default order of preference:

1. Local component state for form inputs, modal open state, and small view state.
2. URL query params for shareable filters, pagination, and report period selection.
3. Server refetch after mutation for tables and detail pages.
4. A query/cache library only when repeated loading/cache/invalidation behavior becomes real duplication.
5. Global state only for true app-wide state such as authenticated user/session and stable app settings.

Do not add Redux, Zustand, MobX, or similar global state management by default.

## Bun Consideration

Bun is reasonable to consider because current Vite documentation supports Bun for scaffolding and package commands. The tradeoff is operational consistency:

- Bun can make install/dev scripts fast.
- Node/npm remains the most conservative baseline for CI, deployment docs, and contributor familiarity.
- If Bun is chosen, commit `bun.lock`, standardize all scripts on Bun, and verify the chosen OpenAPI/codegen, lint, typecheck, test, and build tools work cleanly under Bun.
- If compatibility or CI friction appears, prefer Node/npm or pnpm over spending time debugging package-manager edge cases.

Recommendation for first scaffold: use Vite's standard React TypeScript template, then choose Bun only if the scaffold and planned tooling verify cleanly in this repo.