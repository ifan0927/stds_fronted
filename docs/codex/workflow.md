# Issue And Testing Workflow For Codex

This repository should follow an issue-driven workflow, matching the backend project's working style while keeping frontend delivery lightweight during early development.

## Unit Of Work

The normal unit of work is a GitHub issue.

Expected issue contents:

- Goal
- Out of scope
- Implementation scope
- Definition of done
- Reference docs
- Notes for AI agent when relevant

Before implementation, read the issue and summarize:

- what is in scope
- what is explicitly out of scope
- which backend OpenAPI paths/docs are involved
- what must be true for DoD
- unclear points or risky assumptions

Do not widen scope just because adjacent UI or infrastructure looks incomplete.

For label, branch, commit, PR body, follow-up issue, and `ai-review` rules, follow `docs/codex/github-workflow.md`.

## Development Flow

Default flow:

1. Start from a GitHub issue.
2. Inspect backend OpenAPI and reference docs for the affected flow.
3. Implement the narrowest frontend change that satisfies the issue.
4. Do not add CI wiring during active feature development unless the issue asks for it.
5. Run local verification after implementation.
6. Open a PR for review.
7. Use PR code review plus same-issue test follow-up to close quality gaps.

This intentionally separates fast development from final quality hardening. The quality bar still exists, but it is enforced at PR review and post-implementation verification instead of slowing every early iteration with CI expansion.

## Frontend Test Strategy

Frontend testing should be layered, but not overbuilt.

Use the narrowest test that proves the risk:

- Unit tests: pure formatting, date/month helpers, money helpers, error-code mapping, small auth/API utilities.
- Component tests: form validation, loading/error/empty states, table filter/pagination behavior, modal submit behavior, permission-gated UI states.
- API-boundary tests: API client behavior, auth header attachment, backend error mapping, generated type/client assumptions when codegen exists.
- E2E tests: high-value user flows across real pages, auth, routing, API responses, and critical CRUD/report workflows.

Do not add tests for trivial presentational markup unless the markup carries behavior, accessibility, permission, or product-contract risk.

## Suggested Frontend Tools

Expected first choices once the scaffold exists:

- Unit/component tests: Vitest, because it integrates with Vite and supports TypeScript/JSX and browser/component testing.
- Component behavior style: prefer user-facing queries and interactions over component internals.
- Network mocking for component/API tests: MSW or a minimal local mock only when it prevents real backend coupling.
- E2E tests: Playwright, because it is built for modern web app E2E testing and supports Chromium/WebKit/Firefox, isolation, tracing, and CI/headless runs.

Do not introduce Jest, Cypress, Storybook test runner, or a second E2E framework unless a concrete issue justifies the extra tool.

## E2E Timing

Backend E2E was added later after core flows and harness shape were clear. Use the same idea here.

Initial frontend phase:

- no full E2E harness required
- verify manually through local dev server and targeted component/unit tests where useful
- keep API and auth seams simple enough that E2E can be added later

When core screens exist:

- add Playwright with a small harness
- cover login/auth sync, protected routing, and one or two high-value workflows first
- prefer stable seeded backend data or a dedicated E2E backend environment
- keep tests API-visible and user-flow-oriented, not selector-heavy implementation checks

Potential first E2E candidates:

- Firebase login or emulator login path plus `/auth/sync`
- property list to property detail/dashboard
- tenant/lease creation happy path if the UI owns that workflow
- bill payment or meter submission flow
- report/export flow when those screens exist

E2E should remain a small acceptance layer. Most UI edge cases belong in component tests or helper tests.

## PR Quality Expectations

Every PR should state:

- issue link
- what changed
- what was intentionally left out
- which backend OpenAPI paths/docs were referenced
- what local checks were run
- whether tests were added, deferred, or judged unnecessary for this issue
- whether `ai-review` was requested, suggested, or intentionally not added

If tests are deferred after implementation, keep that follow-up inside the same issue unless the user explicitly splits it.

## Local Verification Before CI Exists

Until CI is added, agents should run the relevant local checks that exist in the scaffold.

Expected eventual checks:

- typecheck
- lint
- unit/component tests
- production build
- targeted Playwright E2E once the E2E harness exists

If the repo has not yet defined these scripts, do not invent CI. Note the missing scaffold and verify with `git diff --check` plus file inspection.
