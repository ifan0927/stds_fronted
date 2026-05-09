# Room Management Design

> Status: contract map for UI template planning
> Scope: property-scoped room list, room detail, room create/edit/delete, room attachments, maintenance entry point, and room navigation
> References: `docs/design/frontend-foundation.md`, `docs/design/auth-access.md`, `docs/design/property-management.md`, `DESIGN.md`, `docs/codex/backend-reference.md`, `/Users/cheni-fan/stds_backend/docs/spec/openapi.yaml`

## Scope

Room management owns:

- room inventory under a selected property
- room master-data create/edit/delete
- room detail and operational entry points
- room attachment management
- maintenance entry point for vacant rooms
- navigation into tenant/lease, repair, meter, and journal contexts

It does not own tenant/lease creation details, occupied-room payment workflow, repair lifecycle recovery, meter billing workflow, journal editing, or report/export behavior.

## Current Backend Contract

- `GET /properties/{id}/rooms` supports property-scoped rooms and returns `pagination {page, limit, total, total_pages, has_next}`.
- `POST /properties/{id}/rooms` creates rooms with `name`, `size`, `floor`, `room_type`, `facilities`, `default_rent_amount`, `notes`, and `zone`.
- `GET /rooms/{id}` returns room master data and status.
- `PATCH /rooms/{id}` updates writable room fields; omitted means keep, nullable `null` means clear.
- `DELETE /rooms/{id}` deletes vacant rooms when backend role/state rules allow it.
- `POST /rooms/{id}/maintenance` sets an eligible vacant room to maintenance and returns `room` plus `repair_request`.
- Room attachments use `GET /rooms/{id}/attachments`, `POST /attachments/upload-url`, `POST /rooms/{id}/attachments`, and `DELETE /attachments/{id}`.
- Occupancy counts belong to property/home dashboard read models; room list should not compute property occupancy summary itself.
- Use readable labels from backend responses as primary display text when provided; UUIDs are secondary metadata.

## Page / Workflow Slices

### Property Room List

- Purpose: show room inventory for one property with status filter, pagination, and row actions.
- Backend contract: `GET /properties/{id}/rooms?page=&limit=&status=` returns `data` and `pagination`.
- Status: ready for UI template.

### Room Detail

- Purpose: show room master data, status, attachments, and entry points into lease, repair, meter, and journal contexts.
- Backend contract: `GET /rooms/{id}`, `GET /rooms/{id}/attachments`; active lease/journal links are discovered through owning module contracts.
- Status: ready for UI template.

### Room Create / Edit

- Purpose: maintain room master data.
- Backend contract: `POST /properties/{id}/rooms`, `PATCH /rooms/{id}` with `size`, `floor`, `room_type`, `facilities`, `default_rent_amount`, `notes`, `zone`, and nullable PATCH clearing.
- Status: ready for UI template.

### Room Delete

- Purpose: delete vacant rooms when allowed.
- Backend contract: `DELETE /rooms/{id}`; backend rejects occupied or maintenance rooms.
- Status: ready for UI template.

### Room Attachment Management

- Purpose: list, upload/register, open/download, and delete room attachments.
- Backend contract: `GET /rooms/{id}/attachments`, `POST /attachments/upload-url`, `POST /rooms/{id}/attachments`, `DELETE /attachments/{id}`.
- Status: ready for UI template.

### Maintenance Entry

- Purpose: move a vacant room into maintenance and create the repair request.
- Backend contract: `POST /rooms/{id}/maintenance` with title and description; returns updated room and repair request.
- Status: ready for UI template; restoration from maintenance belongs to repair workflow.

### Room-To-Lease / Logs Navigation

- Purpose: preserve room-state navigation without embedding other modules.
- Backend contract: occupied-room active lease lookup and room log filtering belong to tenant/lease and journal module contracts.
- Status: ready as navigation placeholders; detailed UI belongs to owning module docs.

## Remaining Decisions

- Whether room-level cadence price matrix remains a product requirement, or `default_rent_amount` plus lease-level `rent_amount/rent_billing_cadence` is enough.
- Facility option source: fixed checklist, free-form values, or backend-managed option list.
- Whether `zone` remains visible in the new UI and what Traditional Chinese label it should use.
- Whether room rows eventually need direct tenant/lease readable labels from a backend read model, or detail navigation plus active lease lookup is enough for v1.0.

## Not Carried Forward

- Legacy `複製房間` GET-style action.
- Legacy delete links without confirmation.
- Frontend-only occupancy decisions that bypass backend room status and lease APIs.
- Direct room-state restoration from maintenance to vacant inside room management.
- Signed URL, nonce, object path, bucket, or storage internals in product copy.
- Treating room management as the full tenant/lease/payment dashboard.
