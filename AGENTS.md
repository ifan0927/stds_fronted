# AGENTS.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.
All conversations with the user are in Traditional Chinese. All code comments are in English.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## Project-Specific Guidelines

This repository is the STDS frontend workspace. Feature-page implementation reference lives in [`docs/codex/frontend-implementation-reference.md`](docs/codex/frontend-implementation-reference.md). Detailed backend references for Codex live in [`docs/codex/backend-reference.md`](docs/codex/backend-reference.md). Frontend architecture principles live in [`docs/codex/frontend-principles.md`](docs/codex/frontend-principles.md). Issue and testing workflow lives in [`docs/codex/workflow.md`](docs/codex/workflow.md). GitHub workflow rules live in [`docs/codex/github-workflow.md`](docs/codex/github-workflow.md). UI design workflow lives in [`docs/codex/ui-design-workflow.md`](docs/codex/ui-design-workflow.md). Baseline UI rules live in [`DESIGN.md`](DESIGN.md).

### Current Scope

- This frontend project has the initial React + Vite + TypeScript + Ant Design bootstrap foundation.
- Use the established scaffold, API client, auth/session, route-state, logging, runtime HTML, and operation primitives before adding new patterns.
- Do not add another UI framework, router, global state library, API client generator, test runner, E2E framework, or production client logging backend unless the task explicitly asks for that implementation step.

### OpenAPI And Backend Contract

- Treat `/Users/cheni-fan/stds_backend/docs/spec/openapi.yaml` as the frontend API source of truth.
- Do not copy or maintain an OpenAPI file in this frontend repository.
- Before implementing an API-backed UI flow, inspect the relevant backend contract and docs through `docs/codex/backend-reference.md`.
- If the OpenAPI contract and backend docs appear inconsistent, report the mismatch before coding.

### Frontend Implementation Rules

- Treat GitHub issues as the normal unit of work. Read the issue goal, out of scope, implementation scope, DoD, and reference docs before coding.
- Before implementing feature pages, read `docs/codex/frontend-implementation-reference.md` and reuse the listed primitives.
- Use the label, branch, commit, PR, and `ai-review` rules in `docs/codex/github-workflow.md`.
- For legacy page refresh work, survey the legacy UI and produce a reviewable UI design template before implementation when the screen is non-trivial.
- For UI work, follow `DESIGN.md` unless an issue or accepted template explicitly supersedes it.
- Match existing frontend project style once scaffolded; do not introduce new patterns for one feature.
- Keep frontend implementation deliberately simple. Prefer calling backend APIs and refreshing data over complex client-side state orchestration.
- If a UI improvement requires extra complexity, discuss the tradeoff with the user before implementing it.
- Extract shared frontend primitives only at the smallest safe boundary for repeated API, auth, error handling, logging, table, date, and money concerns.
- Keep UI text user-facing in Traditional Chinese unless a specific product copy decision says otherwise.
- Keep API-facing identifiers, generated types, code comments, and error-code constants in English.
- Do not hard-code backend response shapes from memory. Read OpenAPI and generated types when available.
- Preserve backend authorization boundaries in the UI, but never rely on frontend checks as the only authorization mechanism.
- For Firebase login flows, use Firebase client-side auth assumptions from backend docs: frontend obtains a Firebase ID token and calls backend with `Authorization: Bearer <token>`.

### Verification

- For every change, define the narrowest useful verification before editing.
- If the project has no package/test scaffold yet, verify documentation changes with basic file inspection and `git diff --check`.
- Once scaffolded, use the repo's actual scripts for typecheck, lint, tests, and build instead of inventing one-off commands.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
