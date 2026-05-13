# Checkout Settlement Design

> Status: contract map for UI template
> References: `docs/design/frontend-foundation.md`, `docs/design/tenant-lease-management.md`, `docs/design/meter-reading-electric-billing.md`, `docs/design/accounting-reports.md`, `DESIGN.md`, `/Users/cheni-fan/stds_backend/docs/spec/openapi.yaml`

## Scope

本文件只收斂退租結算與租約終止相關 UI contract，供後續 UI template 使用。

包含：

- 正常退租結算：preview -> finalize -> export。
- 強制終止：獨立於正常退租結算的危險流程。
- 已退租 / 已到期 / 強制終止租約檢視。
- 從房間、租約、承租資訊頁進入退租流程的邊界。

不包含：

- 租金付款、電費付款、帳單收據、租約 replacement、房間狀態復原邏輯。
- 財務報表、現金流、損益表、營運報告。
- 前端自行計算退租總額、會計分錄、房間狀態或匯出文件內容。

## Current Backend Contract

- `POST /leases/{id}/checkout-settlement/preview`
  - backend owns settlement calculation, totals, itemized lines, blockers, warnings, labels, and export availability.
  - `checkout_date` is the settlement effective / lease termination date; `actual_move_out_date` is nullable operational metadata.
  - normal checkout should default `checkout_date` to lease `end_date`; earlier physical move-out belongs in `actual_move_out_date`.
  - Early termination requires explicit `manual_rent_refund_amount` and `manual_rent_refund_reason`; amount `0` with a reason means no unexpired-rent refund.
  - frontend displays returned data as read-only preview and must not recalculate totals.
- `POST /leases/{id}/checkout-settlement/finalize`
  - finalize uses preview token / optimistic lock semantics.
  - backend recomputes under lock, verifies preview token, persists typed `settlement_detail`, terminates lease, and writes accounting effects.
- `GET /leases/{id}/checkout-settlement/export`
  - exports finalized settlement HTML from persisted settlement snapshot.
  - returned HTML is runtime output; frontend should open/preview it and rely on browser print/save-as-PDF.
- `GET /lease-checkout-reviews`
  - filters: `property_id`, `status`, `page`, `limit`.
  - rows include property/room/tenant labels, lease/deposit status, refund/deduction, termination/force-termination info, `checkout_finalized_at`, `export_available`, and pagination.
- `GET /leases/{id}`
  - detail context; `LeaseResponse` includes readable labels and typed `settlement_detail` when available.
- `GET /bills?lease_id=...&type=...`
  - preflight support; `type` filter is available and list endpoints include pagination.
- `POST /leases/{id}/force-terminate` and `GET /force-terminations/{id}`
  - force termination remains separate from normal settlement.
  - force termination uses `termination_date` and optional `actual_move_out_date`; replacement remains unchanged and separate.
  - shared readable labels are available on relevant responses; use `*_label` fields instead of deriving names.

Confirmed backend-owned rules:

- Early checkout is allowed only when the operator provides the backend-required manual rent refund decision.
- Frontend must not calculate rent refund; submit the manual decision and display backend `rent_refund` lines/totals as returned.
- Pending payment and overdue bills block finalization; pending meter bills block only when checkout cannot resolve the final electricity period.
- `final_meter_reading` is backend-owned input for final electricity settlement. Frontend must not calculate electricity fees locally.
- If checkout resolves final electricity, display returned `electricity_settlement` lines/totals and backend `source_ref` details.
- Use backend `export_available`; do not infer export eligibility from status or local fields.
- Backend dashboard summaries are authoritative where exposed; frontend should not aggregate its own summary.

## Page / Workflow Slices

### Checkout Entry

Purpose: let users enter checkout from occupied room, lease detail, or tenant/lease context.

Backend contract: use lease/room context from owning pages; load fresh `GET /leases/{id}` before checkout actions.

Status: ready for UI template. Entry labels and routing belong to owning pages, but checkout owns the target workflow.

### Normal Checkout Preview

Purpose: collect supported checkout inputs, request backend preview, and show settlement result before irreversible action.

Backend contract: `POST /leases/{id}/checkout-settlement/preview`; display returned context labels, blockers, warnings, lines, totals, and preview token.

Status: ready for UI template. Preview is read-only; final action disabled if backend reports blockers or preview is stale/missing.

### Normal Checkout Finalization

Purpose: finalize a previously previewed settlement after explicit confirmation.

Backend contract: `POST /leases/{id}/checkout-settlement/finalize`; submit the preview token / optimistic-lock data required by backend. Handle `409 CONCURRENT_UPDATE_CONFLICT` as stale preview and `422` blockers as workflow-blocking alerts.

Status: ready for UI template. On success, refetch lease, room, bill, and checkout review data instead of computing state locally.

### Checkout Settlement Export

Purpose: open or preview the finalized checkout settlement document.

Backend contract: `GET /leases/{id}/checkout-settlement/export`; show the action only from backend `export_available` or finalized settlement detail.

Status: ready for UI template. Do not design PDF generation, GCS persistence, attachment creation, or stored generated bytes.

### Checkout Review List

Purpose: property-scoped review of expired, terminated, and force-terminated lease records.

Backend contract: `GET /lease-checkout-reviews?property_id=...&status=...&page=...&limit=...`; use returned labels, refund/deduction fields, termination info, `checkout_finalized_at`, `export_available`, and pagination.

Status: ready for UI template. Table filters should map directly to backend query params.

### Force Termination Workflow

Purpose: handle bad-debt or exceptional termination without normal checkout preview.

Backend contract: `POST /leases/{id}/force-terminate`; request fields include `termination_date`, optional `actual_move_out_date`, `reason`, and `deposit_handling`. Backend writes off unsettled bills and emits forced termination effects.

Status: ready for UI template. Use danger styling and explicit confirmation; do not show normal checkout itemized settlement controls.

### Force Termination Detail

Purpose: review force termination status, reason, deposit handling, bill progress, and labels.

Backend contract: `GET /force-terminations/{id}`; use returned readable labels where available.

Status: ready for UI template. It is a read/review surface, not a retry or settlement editor.

## Remaining Decisions

- Checkout reason stable backend enum/value remains open. UI may show Traditional Chinese labels, but implementation must submit backend-defined values.

## Legacy Notes

- Legacy checkout had a two-step pattern: collect退租 inputs, then preview settlement before completion. Keep that interaction shape.
- Legacy `show_unable_rent` was an expired/archived lease review list. Carry forward the review need, not GET-style delete/unarchive actions.

## Not Carried Forward

- GET-style writes, delete, archive, unarchive, or irreversible links.
- Frontend-only settlement calculation or accounting-entry calculation.
- Frontend-only room status recovery.
- Treating checkout settlement export as bill receipt, financial report, cashflow, profit/loss, operation report, or tenant roster export.
- Client PDF generation, GCS storage, attachment registration, or persisted generated-file bytes unless backend later defines it.
- Force termination using normal checkout preview or itemized settlement controls.
