# GitHub Workflow For Codex

This repository uses GitHub issues and pull requests as the durable workflow record. Keep labels, branch names, commits, and follow-up issues consistent and small.

## Issues And PRs

- Normal work starts from a GitHub issue.
- Every issue and PR should have labels from the approved label pool.
- PRs should link the issue with `Closes #...` when the PR completes the issue, or `Refs #...` when it only supports or partially addresses it.
- If implementation reveals real follow-up work, create or propose a follow-up issue instead of widening the current PR.
- Follow-up issues should include goal, out of scope, implementation scope, DoD, reference docs, and any AI-agent notes needed for later work.

## Label Pool

Use a small label set. Do not invent labels casually.

Approved labels:

- `feature`
- `bug`
- `ui`
- `ux`
- `api`
- `test`
- `docs`
- `refactor`
- `infra`
- `chore`
- `ai-review`

Use labels by primary purpose:

- `feature`: new user-facing capability.
- `bug`: broken behavior or regression.
- `ui`: layout, component, visual structure, or Ant Design implementation.
- `ux`: workflow clarity, usability, empty/error/loading states, or interaction behavior.
- `api`: API client, OpenAPI contract, auth/request/response integration.
- `test`: unit/component/API-boundary/E2E test work.
- `docs`: markdown, workflow, design, or process docs.
- `refactor`: behavior-preserving restructuring.
- `infra`: tooling, deployment, package scripts, CI, hosting, environment setup.
- `chore`: maintenance that does not fit the above.
- `ai-review`: PR should be reviewed by CodeRabbit or another AI reviewer.

## `ai-review` Label

Add `ai-review` to a PR when the user explicitly says the PR needs AI review or CodeRabbit review.

If the user does not explicitly ask, but the PR is complex enough to benefit from AI review, suggest adding `ai-review` and wait for confirmation before applying it.

Good reasons to suggest `ai-review`:

- broad UI or workflow change
- auth/API boundary change
- large table/form/report behavior
- risky state handling
- non-trivial test or E2E harness work
- refactor touching shared frontend primitives

Do not add `ai-review` automatically without user confirmation unless the user has already instructed that this PR should receive AI review.

## Commit Format

All commits should use:

```text
[tag] content
```

Approved commit tags:

- `[feature]`
- `[bug]`
- `[ui]`
- `[ux]`
- `[api]`
- `[test]`
- `[docs]`
- `[refactor]`
- `[infra]`
- `[chore]`

Examples:

```text
[docs] add frontend codex workflow
[ui] add property list template
[api] wire generated client auth header
[test] cover bill payment form errors
```

Keep commit messages concise and scoped to the actual change.

## Branch Naming

For issue-based work:

```text
tag/issue-xx-content
```

Examples:

```text
docs/issue-12-codex-bootstrap
ui/issue-24-property-list-template
api/issue-31-auth-client
test/issue-42-bill-payment-form
```

For work without an issue:

```text
tag/content
```

Examples:

```text
docs/codex-skill-notes
chore/cleanup-preview-template
```

Branch tags should use the same tag pool as commit tags, without brackets:

- `feature`
- `bug`
- `ui`
- `ux`
- `api`
- `test`
- `docs`
- `refactor`
- `infra`
- `chore`

Prefer creating an issue before implementation when the work is non-trivial.

## PR Body Checklist

Every PR should include:

- linked issue
- summary of changes
- out-of-scope notes
- backend OpenAPI paths/docs referenced when applicable
- UI template reference when applicable
- tests/checks run
- test gaps or deferred same-issue follow-up
- whether `ai-review` is requested or intentionally not added

## GitHub CLI And Sandbox

If `gh` commands fail with permission, auth, or network-looking errors in Codex, first consider sandbox restrictions. Many GitHub operations work after requesting escalated command permission.

Do not treat a sandbox denial as a product or repository problem. Request escalation with a clear justification when the GitHub command is necessary for the task.