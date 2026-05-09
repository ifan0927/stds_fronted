# Meter Reading And Electric Billing Design

> Status: contract map for UI template
> Scope: pending meter reading, property and room meter history, electricity bill detail, electricity payment, electricity receipt/export, and electric-billing entry points
> References: `docs/design/frontend-foundation.md`, `docs/design/property-management.md`, `docs/design/room-management.md`, `docs/design/tenant-lease-management.md`, `docs/design/checkout-settlement.md`, `DESIGN.md`, `docs/codex/backend-reference.md`, `/Users/cheni-fan/stds_backend/docs/spec/openapi.yaml`

## Scope

This document maps electric meter and electricity bill workflows to the current backend contract so the next step can produce UI templates. It is not a React implementation plan.

Owned here:

- property-level pending meter reading page
- single electricity bill meter submission
- property-level meter history
- room-level meter history target page
- electricity bill detail
- electricity bill payment
- electricity receipt action placement
- entry points from property, room, and occupied-room contexts

Not owned here:

- true bulk meter submit; future/backend contract required
- occupied-room dashboard layout; tenant/lease design owns the hub
- checkout final electric settlement; checkout design owns that flow
- report/export summary pages; accounting reports design owns them
- accounting entry creation and report totals; backend owns side effects and calculations

## Current Backend Contract

- `GET /api/v1/properties/{id}/pending-meter` returns pending electricity bills for one property. Rows are bill-based and include backend-computed `meter_previous_reading`; first-bill baseline uses the lease `starting_meter_reading` when no prior completed electricity bill exists in the same lease.
- `POST /api/v1/bills/{id}/meter` records one bill's `current_reading`. Backend computes usage, amount, status transition, and meter fields.
- `POST /api/v1/leases` requires `starting_meter_reading`; `0` is valid only when explicitly sent. `LeaseResponse` returns `starting_meter_reading`.
- `GET /api/v1/bills` supports `type=rent|electricity`, `property_id`, `lease_id`, `tenant_id`, `status`, `month`, `page`, and `limit`, with `pagination { page, limit, total, total_pages, has_next }`.
- `BillResponse` includes readable labels (`property_label`, `room_label`, `tenant_label`, `period_label`) plus `meter_previous_reading`, `meter_current_reading`, `meter_unit_price`, `meter_recorded_at`, payment fields, amount, status, and bill period fields.
- `GET /api/v1/properties/{id}/meter-history?year=YYYY` returns `PropertyMeterHistoryResponse`. Rows include `bill_id`, `property_id`, `room_id`, `room_label`, `tenant_id`, `tenant_label`, `lease_id`, `period_start`, `period_end`, `period_label`, `due_date`, `previous_reading`, `current_reading`, `usage`, `unit_price`, `amount`, `status`, and `meter_recorded_at`.
- `GET /api/v1/rooms/{id}/meter-history?year=YYYY&month=M` remains the room-level meter history endpoint.
- `POST /api/v1/bills/{id}/payment` records full payment for payable electricity bills. UI should lock `paid_amount` to backend bill `amount`.
- `GET /api/v1/bills/{id}/receipt?format=html` returns backend-owned runtime HTML for paid rent or electricity bills. Frontend owns action placement, loading/error handling, and preview/open behavior only.

## Page / Workflow Slices

### Property Pending Meter Page

Purpose: review all electricity bills that still need meter readings for a selected property.

Backend contract: `GET /properties/{id}/pending-meter`; submit each reading with `POST /bills/{id}/meter`.

Status: ready for UI template. Use a dense table/grid with room label, period, due date, backend `meter_previous_reading`, current reading input/action, status, and row-level errors. It can preserve legacy bulk-entry efficiency visually, but must not claim atomic batch behavior.

### Meter Reading Submit

Purpose: record the current meter reading for one pending electricity bill.

Backend contract: `POST /bills/{id}/meter` with `current_reading`. Backend rejects non-electricity bills, non-recordable statuses, and readings lower than previous reading.

Status: ready for UI template. Show previous reading as read-only, current reading as required input, and backend-calculated amount/status after success. Refresh bill detail and pending meter list after submit.

### Electricity Bill Detail

Purpose: review one electricity bill before meter reading, payment, or receipt action.

Backend contract: `GET /bills/{id}`. `BillResponse` includes labels, bill period, meter fields, amount, payment fields, and status.

Status: ready for UI template. Actions are state-gated: `抄表` for `type=electricity` and `status=pending_meter`, `收款` for `pending_payment` or `overdue`, and `預覽電費收據` for `paid`.

### Property Meter History

Purpose: review property-level meter history by year across rooms.

Backend contract: `GET /properties/{id}/meter-history?year=YYYY` returning `PropertyMeterHistoryResponse`.

Status: ready for UI template. Use year filter mapped to backend `year`; table columns should use the dedicated history row fields, including `usage`, `unit_price`, `amount`, `status`, and `meter_recorded_at`. Do not reconstruct this grid from generic bill lists.

### Room Meter History

Purpose: review meter history for one room and provide bill-level actions.

Backend contract: `GET /rooms/{id}/meter-history?year=YYYY&month=M`.

Status: ready for UI template. Room detail and occupied-room dashboard own link placement; this document owns the target history page and actions to open bill detail, payment, or receipt when status allows.

### Electricity Payment Recording

Purpose: record full payment for payable electricity bills.

Backend contract: `GET /bills?lease_id={leaseId}&type=electricity&status=pending_payment|overdue` or property-scoped variants, `GET /bills/{id}`, `POST /bills/{id}/payment`.

Status: ready for UI template, with one remaining product decision on `paid_at`. Amount is read-only and submitted as the full backend amount. Accounting side effects are backend-owned.

### Electricity Receipt Preview / Export

Purpose: preview or print a backend-generated receipt for a paid electricity bill.

Backend contract: `GET /bills/{id}/receipt?format=html`; eligible bills are paid electricity bills.

Status: ready for UI template, with one remaining UX decision on preview mode. Do not promise PDF, attachment creation, GCS persistence, or frontend-rendered receipt totals.

### Cross-Slice Entry Points

Purpose: connect electric billing from related operational pages without duplicating their layouts.

Backend contract: entry pages should link by known `property_id`, `room_id`, `lease_id`, or `bill_id`; electric pages then read through the endpoints above.

Status: ready for UI template notes. Expected entry points are property detail, room detail, occupied-room tenant/lease hub, and checkout blocker resolution links.

## Remaining Decisions

- True bulk meter submit remains future/out of scope for v1. The current contract supports single-bill meter submit only.
- Electricity payment `paid_at` / backdate support needs product decision: expose optional date-time input, or omit and let backend default to server time.
- Receipt preview UX mode needs decision: open backend HTML in a new tab/window first, or build an app-shell viewer route.
- Checkout final electric settlement belongs to checkout design and backend checkout contract; it is not a blocker for these electric-billing pages.

## Legacy Notes

- Legacy `電錶抄錄` optimized for property-level room scanning and multi-room input. The v1 UI should preserve that scanning efficiency while submitting through the current single-bill backend command.
- Legacy occupied-room `電費繳納` mixed payment fields with accounting row details. The new UI should use backend Bill payment and leave accounting side effects to the backend.

## Not Carried Forward

- Legacy form-level bulk submit semantics or atomic multi-row meter save.
- Frontend-only calculation of usage, amount, payment result, accounting entry, or report totals as authoritative values.
- Legacy accounting title/code/tag fields for electric payment.
- PDF receipt generation, generated receipt persistence, GCS storage, or attachment creation for runtime receipts.
- Checkout preview, checkout finalization, current checkout meter reading, or final electric settlement in this module.
