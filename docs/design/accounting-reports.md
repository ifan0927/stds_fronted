# Accounting Reports Design

> Status: contract map for UI template
> References: `docs/design/frontend-foundation.md`, `docs/design/tenant-lease-management.md`, `docs/design/journal-accounting-events.md`, `docs/design/checkout-settlement.md`, `docs/design/meter-reading-electric-billing.md`, `DESIGN.md`, `/Users/cheni-fan/stds_backend/docs/spec/openapi.yaml`

## Scope

本文件只收斂財務報表與 runtime HTML export 的 UI contract，供後續 UI template 使用。

包含：

- Property yearly financial report summary。
- Monthly financial report detail and backend-provided entries。
- Cashflow、profit/loss、operation report runtime HTML exports。
- Financial report send action。
- Tenant roster export as referenced shared export family, but page ownership remains tenant/lease slice。

不包含：

- 租金、電費、journal expense、checkout settlement 的 source workflow 表單。
- Tenant roster page ownership。
- 前端自行計算報表 totals、ledger totals、source category、monthly snapshot 或 accounting entries。
- 前端重建 HTML report body。

## Current Backend Contract

- `GET /properties/{id}/financial-report?year=...`
  - property-year monthly summary; backend owns monthly totals.
- `GET /properties/{id}/financial-report/{year}/{month}`
  - monthly detail; backend owns `total_income`, `total_expense`, `net`, `is_finalized`, and `entries[]`.
  - `entries[]` include `entry_id`, `accounting_title_id`, `accounting_title_code`, `accounting_title_name`, `source_date`, `room_label`, `tenant_label`, `period_label`, `display_note`, and `source {type, id, detail}`.
  - frontend should not parse `description` or query mutable source records to reconstruct finalized rows.
- Runtime HTML exports:
  - `GET /properties/{id}/financial-report/{year}/{month}/cashflow-export?format=html`
  - `GET /properties/{id}/financial-report/{year}/{month}/profit-loss-export?format=html`
  - `GET /properties/{id}/operation-report/{year}/{month}?format=html`
  - backend owns document body, totals, row semantics, ordering, and legacy-sample fidelity.
- `POST /properties/{id}/financial-report/{year}/{month}/send`
  - send action after human review; status/history remains future scope unless product asks.
- `GET /properties/{id}/tenant-roster?as_of=...&include_vacant=...&format=html`
  - tenant roster export is part of the runtime HTML export family, but entry point/page ownership remains tenant/lease and property context.
- `GET /bills?type=...`
  - type filter exists for source workflow links and adjacent billing pages; report pages should still use report entries as the authoritative read model.

Confirmed backend-owned rules:

- Current-month reports read live backend accounting state; finalized historical reports read backend snapshots.
- Dashboard summaries are backend-owned; do not design frontend aggregation.
- Use backend labels and source fields; do not derive labels from IDs or mutable joins.

## Page / Workflow Slices

### Property Financial Report Summary

Purpose: review one property's monthly totals for a selected year.

Backend contract: `GET /properties/{id}/financial-report?year=...`; use backend totals as-is.

Status: ready for UI template. Table actions can route to monthly detail and export/send actions.

### Monthly Financial Report Detail

Purpose: review one property-month report and its backend-provided entries.

Backend contract: `GET /properties/{id}/financial-report/{year}/{month}`; display totals, finalized/live state, and `entries[]`.

Status: ready for UI template. Entry table should use `source_date`, title code/name, room/tenant labels, period label, display note, amount, and source metadata where useful.

### Report Entry Source Navigation

Purpose: optionally navigate from a report row to its source workflow.

Backend contract: data exists in `source {type, id, detail}` plus stable display fields.

Status: product/UI decision remaining. Do not parse `description`; route mapping must be explicitly designed by UI/product.

### Cashflow Export

Purpose: open monthly cashflow HTML for selected property/month.

Backend contract: `GET /properties/{id}/financial-report/{year}/{month}/cashflow-export?format=html`.

Status: ready for UI template. Show selected parameters, action loading, retryable error, and open/preview HTML on success.

### Profit/Loss Export

Purpose: open monthly profit/loss HTML for selected property/month.

Backend contract: `GET /properties/{id}/financial-report/{year}/{month}/profit-loss-export?format=html`.

Status: ready for UI template. Same runtime HTML behavior as cashflow export.

### Operation Report Export

Purpose: open monthly operation report HTML for selected property/month.

Backend contract: `GET /properties/{id}/operation-report/{year}/{month}?format=html`.

Status: ready for UI template. Frontend does not calculate owner distribution or report body content.

### Send Financial Report

Purpose: trigger backend send flow after review.

Backend contract: `POST /properties/{id}/financial-report/{year}/{month}/send`.

Status: ready for UI template. Use confirmation modal; admin/organizer only where backend allows. Send status/history remains future scope.

### Tenant Roster Export Reference

Purpose: keep export pattern aligned without taking ownership of tenant roster UI.

Backend contract: `GET /properties/{id}/tenant-roster?as_of=...&include_vacant=...&format=html`.

Status: referenced only. Implementation entry point belongs to tenant/lease/property context.

## Remaining Decisions

- Report row source navigation route mapping is a UI/product decision; backend source data exists.
- Send status/history remains future scope if product asks for audit, recipient preview, or delivery state.

## Legacy Notes

- Legacy accounting page exposed `收支表`, `損益表`, and `營運報告`; new backend maps these to runtime HTML endpoints.
- Legacy arbitrary date-range ledger is not v1 report scope. v1 review is monthly financial report `entries[]`.

## Not Carried Forward

- Frontend-only report total, ledger total, category, source, or accounting-entry calculation.
- Legacy hidden `acc[...]` fields or accounting title/code/tag/bank/tid controls.
- Arbitrary date-range ledger as a frontend-composed view without backend contract.
- Source navigation inferred from `description`.
- PDF generation, GCS persistence, attachment creation, or generated-file byte persistence for report exports.
- Treating checkout settlement export, bill receipt export, or tenant roster ownership as accounting report UI.
- Frontend owner-distribution calculation.
