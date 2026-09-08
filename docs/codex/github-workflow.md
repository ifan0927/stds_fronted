# Task And PR Workflow For Codex

Work from the current user-authorized task and this repository's engineering documents. A supplied issue provides scope and acceptance criteria; directly authorized work does not require creating an issue first. GitHub records code, pull requests, CI, and reviews.

## Scope and external records

- Read the supplied task or issue before implementation. Keep out-of-scope findings separate and report them to the user.
- Create or change issue records only when that action is authorized. Do not infer permission to change task state, labels, priority, cycles, or assignees from permission to edit code.
- When an actual GitHub issue is fully addressed, link it in the PR description using `Closes #<number>`; use a plain reference for partial work. For another task source, include its actual link. Never invent an issue or closing reference.
- Prefer one scoped branch and PR. Follow an explicitly authorized direct-push workflow without bypassing branch protection or rewriting shared history.

## Branches and commits

Use `[tag] content` for commits. Existing tags are `feature`, `bug`, `ui`, `ux`, `api`, `test`, `docs`, `refactor`, `infra`, and `chore`.

Reuse a task-owned branch when appropriate. For a new branch, use `<tag>/<short-description>`, or `<tag>/issue-<number>-<short-description>` when a GitHub issue exists. Respect a branch name explicitly provided by the user.

Inspect branch, upstream, and working-tree state before delivery. Stage only reviewed files belonging to the task; preserve unrelated changes.

## PR descriptions and review

Use `.github/pull_request_template.md`. Explain the problem and resulting behavior, then include the relevant contract/template references, validation results, and meaningful remaining gaps. State why tests were skipped for documentation-only work.

Only add `ai-review` when the user requests AI or CodeRabbit review. A suggestion to add it does not block other authorized delivery work.

## Tool failures

Inspect the actual error and current tool permissions before retrying. Request escalation only when the environment supports it and the operation requires it. Distinguish authentication, connectivity, and branch-policy failures; never treat every failure as a sandbox problem or bypass protection.
