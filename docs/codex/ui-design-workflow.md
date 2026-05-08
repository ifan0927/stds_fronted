# UI Design Workflow For Codex

This frontend is a legacy-system refresh. UI design work should preserve useful legacy operational knowledge while using the backend OpenAPI contract as the implementation boundary.

## Phase Flow

Default flow for a new product area:

1. Survey the relevant legacy pages/screens.
2. Read the backend OpenAPI paths and domain docs for the same area.
3. Identify frontend/backend boundaries: what the frontend displays, what the backend owns, and which actions map to API operations.
4. Produce a phase backlog with rough issue slices.
5. For each backlog slice, open a detailed implementation issue with goal, out of scope, implementation scope, DoD, and reference docs.
6. Before implementation, produce a UI design template for user review.
7. After the template is accepted, implement the issue against that template and OpenAPI contract.

Do not skip the design template for complex screens, table-heavy workflows, forms, dashboards, reports, or legacy page replacements. Use the root `DESIGN.md` as the baseline design contract when producing templates.

## UI Design Template

The template can be a standalone HTML file when the app scaffold or design system is not ready. It is a disposable review artifact, not production code.

The template should show:

- primary screen layout
- navigation and page header shape
- table/form/card/modal/drawer structure
- loading, empty, error, and success states when relevant
- major actions and destructive confirmations
- responsive behavior for narrow widths
- representative Traditional Chinese labels and realistic field density

Use static sample data. Do not call backend APIs from the template.

## Design Principles

STDS is an operational admin tool, not a marketing site.

- Favor dense but readable information layout.
- Prefer Ant Design-native patterns over custom UI systems.
- Keep visual styling restrained and consistent.
- Avoid decorative hero layouts, large marketing typography, gradients, and ornamental cards.
- Make table, filter, form, modal, and drawer behavior explicit.
- Keep UI copy in Traditional Chinese unless the issue specifies otherwise.
- Use direct backend API boundaries; do not invent frontend-only workflows that the backend cannot support.

## Ant Design Guardrails

Common risks to prevent:

- table columns overflow or hide critical actions
- long text lacks ellipsis, wrapping, or tooltip strategy
- filter state is unclear or mismatched with API query params
- pagination/sorting state is not visible or not reset correctly
- form validation errors are detached from fields
- submit buttons allow duplicate submits
- modal/drawer close loses unsaved edits without warning when risk is meaningful
- destructive actions lack confirmation
- loading/empty/error states render as blank space
- cramped action buttons, inconsistent spacing, or nested cards make the screen hard to scan
- mobile/narrow viewport is unusable for basic review or action

## Relationship To DESIGN.md

The root `DESIGN.md` defines the current STDS admin baseline for visual theme, color roles, typography, spacing, grid, component rules, do/don't lists, and responsive behavior.

External DESIGN.md collections are useful as a format reference. Do not copy brand-heavy marketing aesthetics from those files into STDS.
