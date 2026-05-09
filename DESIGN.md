# STDS Admin DESIGN.md

> Version: v0
> Purpose: Baseline design contract for AI-assisted STDS frontend work.
> Scope: React + Vite + TypeScript + Ant Design admin interface.

This file defines the initial visual and layout rules for STDS frontend templates and implementation. It borrows the plain-text `DESIGN.md` structure from public design-md examples, but the design itself is for an operational admin system, not a marketing website.

## Visual Theme And Atmosphere

STDS is a property-management admin tool for repeated operational work.

- Quiet, structured, and information-dense.
- Tables, filters, forms, drawers, modals, and reports are first-class UI.
- The interface should feel reliable and easy to scan, not decorative.
- Prefer Ant Design-native behavior and density over custom visual systems.
- Avoid landing-page composition, oversized hero sections, ornamental gradients, and decorative cards.

## Color Palette And Roles

Use Ant Design tokens as the implementation source once the app scaffold exists. Until then, use these roles as the baseline:

| Role | Suggested Value | Usage |
| --- | --- | --- |
| `brand-primary` | `#1677ff` | Primary buttons, active navigation, focused controls |
| `canvas` | `#f5f7fa` | App background |
| `surface` | `#ffffff` | Main content panels, tables, forms |
| `surface-subtle` | `#fafafa` | Table headers, filter bands, subtle grouped areas |
| `border` | `#d9d9d9` | Inputs, table borders, separators |
| `text` | `rgba(0, 0, 0, 0.88)` | Primary text |
| `text-secondary` | `rgba(0, 0, 0, 0.65)` | Descriptions, metadata |
| `text-tertiary` | `rgba(0, 0, 0, 0.45)` | Placeholder, disabled-adjacent metadata |
| `success` | `#52c41a` | Successful status |
| `warning` | `#faad14` | Pending or attention status |
| `danger` | `#ff4d4f` | Destructive actions and error status |

Do not create a one-note color theme. Use semantic colors only when they carry state meaning.

## Typography Rules

Default to Ant Design/system font stacks.

| Token | Size | Weight | Line Height | Usage |
| --- | --- | --- | --- | --- |
| `page-title` | 20px | 600 | 28px | Page title |
| `section-title` | 16px | 600 | 24px | Section and card heading |
| `body` | 14px | 400 | 22px | Default UI text |
| `body-strong` | 14px | 500 | 22px | Labels and emphasized table cells |
| `caption` | 12px | 400 | 20px | Metadata, helper text |
| `metric` | 24px | 600 | 32px | Dashboard/statistic values |

Rules:

- Letter spacing should remain `0`.
- Do not use viewport-based font scaling.
- Reserve large display typography for rare dashboard overviews, not routine admin pages.
- Traditional Chinese labels must fit in buttons, table headers, forms, tags, and menus without overlap.

## Spacing, Grid, And Padding

Use a 4px base unit and Ant Design-compatible spacing.

| Token | Value | Usage |
| --- | --- | --- |
| `space-1` | 4px | Tight inline gap |
| `space-2` | 8px | Compact control gap |
| `space-3` | 12px | Form/control grouping |
| `space-4` | 16px | Default section gap |
| `space-6` | 24px | Page block gap, drawer body padding |
| `space-8` | 32px | Large section gap |

Layout defaults:

- Page content max width: none for table-heavy admin pages; tables should use available horizontal space.
- Standard page padding: `24px` desktop, `16px` tablet, `12px` mobile.
- Header-to-content gap: `16px`.
- Filter band padding: `16px`.
- Form item vertical rhythm: use Ant Design defaults unless a dense form requires a documented override.
- Drawer body padding: `24px` desktop, `16px` narrow screens.
- Modal body padding: Ant Design default; do not add nested padded cards inside modals.

Grid rules:

- Use Ant Design `Row`/`Col`, CSS grid, or `Flex`; do not mix arbitrary margins across the same layout.
- Dashboard summary grids: 4 columns desktop, 2 columns tablet, 1 column mobile.
- Form grids: 2 columns desktop when fields are short and comparable, 1 column for long text or dependent fields.
- Filter grids: compact wrap layout; controls should wrap cleanly before overflowing.
- Table pages should keep filters, toolbar, table, and pagination visually connected.

## Component Styling

### Page Shell

- Use one canonical admin shell once scaffolded. Desktop should use the shared app shell navigation; mobile should use a compact top bar plus menu/drawer behavior instead of each page inventing its own navigation layout.
- Page title, description, and primary action belong in the page header.
- Secondary actions should be grouped and visually lower priority.
- Property-scoped operational pages should derive the active property from route or URL state. A property selector may help navigation, but it must not be the only source of page context.

### Tables

Tables are the default for list and operational review pages.

- Define column widths for IDs, status, dates, money, and row actions.
- Use ellipsis, wrapping, or tooltip strategy for long names, addresses, notes, and emails.
- Keep row actions predictable: view/edit near each row, destructive actions behind confirmation.
- Pagination, filter, and sort state must match backend query params.
- Empty state must explain why the table is empty and, when useful, what action is available.
- Loading state should preserve page structure and avoid layout jumps.

### Forms

- Use Ant Design `Form` patterns.
- Required fields must be visible.
- Backend validation errors should map to fields when possible.
- Submit buttons must show loading and prevent duplicate submission.
- Cancel/back behavior must be clear.
- Long forms should use sections, tabs, or drawers only when that reduces scanning burden.

### Drawers And Modals

- Use drawers for create/edit/detail workflows that benefit from staying in list context.
- Use modals for confirmation, short forms, or focused decisions.
- Drawer width baseline: `720px` desktop for medium forms, `960px` only for dense forms, full width on mobile.
- Modal width baseline: `520px`; increase only when content requires it.
- Footer actions should be stable: cancel on the left or secondary position, primary submit on the right.
- Warn before closing only when meaningful unsaved user input may be lost.

### Cards And Panels

- Cards are for summaries, repeated entities, or grouped dashboard metrics.
- Do not place cards inside cards.
- Do not turn every page section into a floating card.
- Prefer full-width bands or unframed sections for page structure.

### Status, Tags, And Alerts

- Use `Tag` for compact status.
- Use `Alert` for page-level warnings, errors, and important contextual guidance.
- Avoid using color alone; labels must be explicit.
- Route-level states must distinguish loading, empty result, retryable error, forbidden, and not found. Do not present `403` or `404` as an empty table.
- Use page-level states when the whole route is unavailable; use inline alerts for durable workflow or form errors; use toast/message feedback only for short-lived operation results.

### Runtime HTML Exports

- Runtime HTML exports, including receipts, checkout settlement exports, financial reports, cashflow reports, profit/loss reports, operation reports, and tenant rosters, are backend-owned documents.
- Frontend owns action placement, request parameters, loading state, retry/error state, and open/preview behavior only.
- Do not generate PDFs, persist generated bytes, create attachments, or show storage internals for runtime exports unless a backend contract explicitly supports that workflow.

### Destructive And Irreversible Actions

- Normal destructive actions, such as delete or attachment removal, require confirmation and must still handle backend authorization or business-rule rejection.
- Irreversible workflow actions, such as checkout finalization or force termination, require stronger confirmation: show a durable warning, summarize the affected record and totals returned by the backend, and provide a clear stale/retry path when the backend rejects the action.
- Do not enable irreversible submit actions from frontend-computed state. Use backend preview/blocker/eligibility fields when the contract provides them.

## Layout Principles

- Build for scanning, comparison, and repeated action.
- Keep related filters close to the table they affect.
- Keep primary workflow actions visible without hunting.
- Prefer direct page reload/refetch over complex optimistic UI unless the issue requires smoother interaction.
- After mutations, prefer showing a short success/failure result and refetching the affected list/detail/read model from the backend. Do not derive long-lived workflow state from local preview data.
- Avoid hidden state that users cannot reason about.

## Responsive Behavior

Baseline breakpoints:

| Name | Width | Behavior |
| --- | --- | --- |
| Desktop | `>= 1200px` | Full table and multi-column forms |
| Tablet | `768px - 1199px` | Reduced columns, wrapping filters |
| Mobile | `< 768px` | Single-column forms, horizontal table scroll or simplified row layout |

Rules:

- Minimum touch target: 40px, prefer 44px on mobile.
- Tables may scroll horizontally on narrow screens if critical columns and actions remain reachable.
- Drawers should become full-screen or near full-screen on mobile.
- Button groups must wrap without overlap.
- Text must not overflow buttons, tags, menu items, or table cells incoherently.

## Visible Copy And Role Labels

Visible UI text should be written for operators, not engineers.

- Use Traditional Chinese labels for roles and statuses in navigation, tables, filters, forms, tags, alerts, and buttons.
- Do not expose API paths, HTTP methods, backend error codes, schema names, token names, third-party auth provider names, or internal implementation terms in user-facing UI text.
- Keep technical identifiers in code comments, API mapping notes, tests, or developer documentation only.
- Long emails, IDs shown as secondary metadata, names, addresses, and notes must wrap or truncate without escaping their card, table cell, tag, or button.

Role labels:

| API Role | UI Label |
| --- | --- |
| `admin` | 系統管理員 |
| `organizer` | 營運管理 |
| `staff` | 工作室成員 |
| `owner` | 業主 |

## Do's And Don'ts

Do:

- Use Ant Design defaults before inventing custom CSS.
- Keep spacing consistent with the 4px scale.
- Show loading, empty, error, and success states for meaningful async workflows.
- Confirm destructive actions.
- Use Traditional Chinese for visible UI copy.
- Use realistic sample data in UI templates.
- Add comments in templates mapping major UI areas to backend APIs.

Don't:

- Do not create marketing-style hero pages.
- Do not add decorative gradients, bokeh, or ornamental background shapes.
- Do not overuse cards for page layout.
- Do not make table columns auto-size into broken action layouts.
- Do not hide backend limitations with fake frontend-only flows.
- Do not add global state or complex cache just to avoid a refetch.
- Do not use snapshot-like static templates as final production code.

## Template Requirements

When producing standalone HTML UI templates:

- Put templates in a clearly disposable review location, such as `artifacts/ui-templates/`, unless the user requests another path.
- Use static sample data only.
- Include representative states when useful: normal, loading, empty, error, destructive confirmation.
- Keep CSS self-contained.
- Keep visual style close to Ant Design admin UI so the template can guide later React implementation.
- State which OpenAPI paths the template expects to use.

## Known Gaps

- Final theme tokens may change after the React + Ant Design scaffold exists.
- Legacy page survey may reveal denser workflows that require additional table/form rules.
- This file is a baseline contract; real UI templates should refine it through concrete examples.
