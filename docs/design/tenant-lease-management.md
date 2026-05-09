# Tenant And Lease Management Design

> Status: contract map for UI template
> Scope: tenant records, lease creation, occupied-room tenant/lease hub, rent payment, rent receipt, and tenant/lease attachments
> References: `docs/design/frontend-foundation.md`, `docs/design/room-management.md`, `docs/design/meter-reading-electric-billing.md`, `docs/design/checkout-settlement.md`, `DESIGN.md`, `docs/codex/backend-reference.md`, `/Users/cheni-fan/stds_backend/docs/spec/openapi.yaml`

## Scope

This document maps tenant and lease workflows to the current backend contract so the next step can produce UI templates. It is not a React implementation plan.

Owned here:

- property-scoped tenant/lease roster for interactive management
- vacant-room move-in flow using separate Tenant and Lease backend records
- occupied-room tenant/lease operational hub
- tenant detail and edit
- lease detail, rent adjustment, and lease replacement entry
- rent bill payment and rent receipt action placement
- tenant and lease attachments

Not owned here:

- HTML tenant roster export body and file semantics; backend export/report contract owns it
- electric meter reading, electric payment, and electric receipt workflow; see `docs/design/meter-reading-electric-billing.md`
- checkout settlement and final electric settlement; see `docs/design/checkout-settlement.md`
- journal/log workflows and accounting side effects

## Current Backend Contract

- `GET /api/v1/properties/{id}/tenant-lease-roster` is the interactive roster read model. It is separate from the HTML tenant roster export. Query params: `include_vacant` default `false`, `page`, `limit` max `100`. Rows include `property_id`, `room_id`, `room_label`, `room_status`, `lease_id`, `lease_status`, `start_date`, `end_date`, `tenant_id`, `tenant_label`, `tenant_phone`, `rent_amount`, `rent_billing_cadence`, `deposit_amount`, `deposit_status`, `next_rent_due_date`, `next_rent_status`, and `notes`, plus `pagination`.
- `GET /api/v1/bills` supports `type=rent|electricity`, `property_id`, `lease_id`, `tenant_id`, `status`, `month`, `page`, and `limit`. List response includes `pagination { page, limit, total, total_pages, has_next }`.
- `GET /api/v1/tenants` and `GET /api/v1/leases` list responses also include the same pagination shape.
- `POST /api/v1/tenants` and `PATCH /api/v1/tenants/{id}` support `name`, `email`, `phone`, typed `contacts`, `birth_date`, `national_id`, `address`, and `occupation`.
- Tenant-level `notes` ownership is still undecided. Do not add tenant notes to the UI template as an editable field until ownership is confirmed.
- `POST /api/v1/leases` creates the lease after tenant selection/creation. It supports `tenant_id`, `room_id`, `rent_amount`, `rent_billing_cadence`, `start_date`, `end_date`, `deposit_amount`, `electricity_billing_cadence`, required `starting_meter_reading`, and `notes`. `starting_meter_reading = 0` is valid only when explicitly sent.
- `LeaseResponse` includes readable labels (`property_label`, `room_label`, `tenant_label`), `notes`, and `starting_meter_reading`.
- `PATCH /api/v1/leases/{id}` supports rent/end-date adjustment only; it does not accept `rent_billing_cadence`. Cadence changes use `POST /api/v1/leases/{id}/replace`.
- `BillResponse` includes readable labels (`property_label`, `room_label`, `tenant_label`, `period_label`) and meter/payment fields needed by bill views.
- `POST /api/v1/bills/{id}/payment` records full bill payment. UI should lock `paid_amount` to backend bill `amount`; partial payment and overpayment are not v1 workflows.
- `GET /api/v1/bills/{id}/receipt?format=html` returns backend-owned runtime HTML for paid rent or electricity bills. Frontend owns action placement, loading/error handling, and preview/open behavior only.
- Attachments use the shared upload flow: `POST /api/v1/attachments/upload-url`, then resource-scoped registration/list/delete endpoints for tenants and leases.

## Page / Workflow Slices

### Property Tenant / Lease Roster

Purpose: show the operational tenant/lease roster for one property and provide row entry points.

Backend contract: `GET /properties/{id}/tenant-lease-roster?include_vacant=false&page=1&limit=20`; optional `include_vacant=true` when the UI needs vacant room rows for move-in entry. Pagination comes from the response.

Status: ready for UI template. It should use table-first layout with room, tenant, phone, lease dates, rent cadence, next rent due/status, deposit, notes, and row actions. Do not use the HTML roster export as the interactive table source.

### Vacant-Room Move-In / Lease Creation

Purpose: create or select a tenant, then create a lease for a vacant room.

Backend contract: `POST /tenants`, optional `GET /tenants` for selection, then `POST /leases` with room/tenant IDs, rent terms, deposit, `electricity_billing_cadence`, required `starting_meter_reading`, and `notes`.

Status: ready for UI template. The workflow may feel guided, but the UI must keep Tenant and Lease as separate backend submits. Room context should be locked and visible. `ROOM_NOT_VACANT` should refetch room/roster state.

### Occupied-Room Tenant / Lease Hub

Purpose: provide a compact operational hub for the active lease, tenant, rent bills, attachments, and cross-slice actions.

Backend contract: `GET /leases?room_id={roomId}&status=active`, `GET /leases/{id}`, `GET /tenants/{id}`, `GET /bills?lease_id={leaseId}`, tenant/lease attachment list endpoints. `LeaseResponse` and `BillResponse` now include readable labels.

Status: ready for UI template. If the room is occupied but no active lease is returned, show a data-consistency warning and refetch path instead of treating the room as vacant.

### Tenant Detail / Edit

Purpose: review and edit Tenant-owned profile fields.

Backend contract: `GET /tenants/{id}`, `PATCH /tenants/{id}`, `GET /tenants/{id}/leases`, tenant attachment endpoints. Editable fields: `name`, `email`, `phone`, typed `contacts`, `birth_date`, `national_id`, `address`, `occupation`.

Status: ready for UI template except tenant-level notes. Tenant status is read-only and backend-derived.

### Lease Detail / Rent Adjustment

Purpose: review lease terms and adjust allowed lease fields without changing cadence.

Backend contract: `GET /leases/{id}`, `PATCH /leases/{id}`, `GET /bills?lease_id={leaseId}&type=rent`. `PATCH /leases/{id}` supports `rent_amount` and `end_date`; cadence changes are excluded.

Status: ready for UI template. Label the mutation as `調整租金` or another precise action, not generic lease edit. Refresh lease and rent bill sections after success.

### Lease Replacement

Purpose: handle cadence change, renewal, contract reissue, or other supported replacement cases.

Backend contract: `POST /leases/{id}/replace` with replacement reason, effective start date, carry-over deposit handling, and new lease terms including `rent_billing_cadence` and `electricity_billing_cadence`.

Status: ready for workflow template. This should be a workflow page or step page, not a small modal. Checkout settlement remains a separate flow.

### Rent Payment Recording

Purpose: record full payment for payable rent bills.

Backend contract: `GET /bills?lease_id={leaseId}&type=rent&status=pending_payment|overdue`, `GET /bills/{id}`, `POST /bills/{id}/payment`.

Status: ready for UI template, with one remaining product decision on `paid_at`. Amount is read-only and submitted as the full backend amount. Duplicate submit must be disabled.

### Rent Receipt Preview / Export

Purpose: preview or print a backend-generated rent receipt for a paid rent bill.

Backend contract: `GET /bills/{id}/receipt?format=html`; eligible bills are paid rent bills.

Status: ready for UI template, with one remaining UX decision on preview mode. Do not promise PDF, attachment creation, GCS persistence, or frontend-rendered receipt totals.

### Tenant And Lease Attachments

Purpose: manage tenant and lease documents after records exist.

Backend contract: shared upload URL endpoint plus `GET/POST /tenants/{id}/attachments`, `GET/POST /leases/{id}/attachments`, and `DELETE /attachments/{id}`.

Status: ready for UI template. Attachments are follow-up actions after tenant/lease creation, not required fields inside the first create submit.

## Remaining Decisions

- Tenant-level notes ownership remains undecided. Current contract supports lease `notes`, not tenant `notes`.
- Rent payment `paid_at` / backdate support needs product decision: expose optional date-time input, or omit and let backend default to server time.
- Receipt preview UX mode needs decision: open backend HTML in a new tab/window first, or build an app-shell viewer route.

## Legacy Notes

- Legacy `房客管理` mixed active tenant roster, occupied-room dashboard, payment rows, receipt links, and checkout links in one area.
- The new frontend should preserve the operational shortcuts, but map them to backend-owned Tenant, Lease, Bill, Receipt, Attachment, Meter, and Checkout boundaries.

## Not Carried Forward

- Combined tenant-plus-lease atomic create command.
- Legacy hidden accounting fields for rent payment, including accounting title/code/tag rows.
- Frontend-calculated rent payment amount, partial payment, or overpayment.
- Lease cadence changes through normal `PATCH /leases/{id}`.
- PDF receipt generation, generated receipt persistence, GCS storage, or attachment creation for runtime receipts.
- Checkout final settlement and final electric settlement in this module.
