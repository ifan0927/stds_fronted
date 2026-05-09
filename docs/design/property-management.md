# Property Management Design

> Status: contract map for UI template planning
> Scope: property list, property create/edit, property detail/dashboard hub, property attachments, property notes boundary, and access-management entry point
> References: `docs/design/frontend-foundation.md`, `docs/design/auth-access.md`, `docs/design/room-management.md`, `DESIGN.md`, `docs/codex/backend-reference.md`, `/Users/cheni-fan/stds_backend/docs/spec/openapi.yaml`

## Scope

Property management owns:

- accessible property list
- property master-data create/edit/delete
- property detail as an operational dashboard hub
- property attachment management
- property/facility notes only after the note model is confirmed
- entry points into room, tenant/lease, billing, report, journal/repair, attachment, and access workflows

It does not own the full room list, tenant roster, billing workflow, report body, journal editor, repair workflow, or user-centric access-management implementation.

## Current Backend Contract

- `GET /properties` returns accessible properties and includes `occupancy_summary {total_rooms, occupied_rooms, vacant_rooms, maintenance_rooms, occupancy_rate}` per property.
- `POST /properties` creates properties with `name`, `subtitle`, `address`, `electricity_unit_price`, `default_electricity_billing_cadence`, `owner_id`, `contact_phone`, `contact_email`, `notes`, and `facilities`.
- `GET /properties/{id}` returns property master data, `facilities`, `notes`, and `occupancy_summary`.
- `PATCH /properties/{id}` updates writable property fields; omitted means keep, nullable `null` means clear.
- `DELETE /properties/{id}` soft-deletes when backend rules allow it.
- `GET /properties/{id}/dashboard` returns backend-owned `rooms`, `monthly_summary`, `occupancy_summary`, and `recent_journals`.
- `GET /api/v1/dashboard` owns home dashboard summaries; property pages should not recompute portfolio data.
- Property attachments use `GET /properties/{id}/attachments`, `POST /attachments/upload-url`, `POST /properties/{id}/attachments`, and `DELETE /attachments/{id}`.
- Access entry points should route into auth/access flows using `GET /users`, `GET /users/{id}`, and `POST /users/{id}/property-assignments`.
- Use readable labels from backend responses as primary display text when provided; UUIDs are secondary metadata.

## Page / Workflow Slices

### Property List

- Purpose: show accessible properties, operational cues, and fast entry points into property-scoped work.
- Backend contract: `GET /properties`; display property master fields plus backend `occupancy_summary`.
- Status: ready for UI template.

### Property Detail / Dashboard Hub

- Purpose: show property identity, master-data summary, backend-owned operational summaries, and cross-module navigation.
- Backend contract: `GET /properties/{id}` plus `GET /properties/{id}/dashboard`.
- Status: ready for UI template; frontend owns placement and navigation, backend owns dashboard semantics.

### Property Create / Edit

- Purpose: maintain property master data.
- Backend contract: `POST /properties`, `PATCH /properties/{id}` with `subtitle`, `contact_phone`, `contact_email`, `notes`, `facilities`, electricity fields, and nullable PATCH clearing.
- Status: ready for UI template.

### Property Delete

- Purpose: remove a property from normal management when allowed.
- Backend contract: `DELETE /properties/{id}`; handle forbidden and occupied-room/business-rule rejection from backend.
- Status: ready for UI template.

### Property Attachment Management

- Purpose: list, upload/register, open/download, and delete property attachments.
- Backend contract: `GET /properties/{id}/attachments`, `POST /attachments/upload-url`, `POST /properties/{id}/attachments`, `DELETE /attachments/{id}`.
- Status: ready for UI template.

### Property / Facility Notes

- Purpose: show/edit property-level notes now; reserve facility-note and note-attachment UX until the model is confirmed.
- Backend contract: property `notes` and `facilities` are writable fields; dedicated facility note model and note-to-attachment relationship are not defined.
- Status: partially ready; basic notes/facilities can be templated, note-linked attachments remain blocked by product/backend decision.

### Property Access Entry Point

- Purpose: let admins jump from a property to member/property assignment management without replacing the user-centric access model.
- Backend contract: `GET /users`, `GET /users/{id}`, `POST /users/{id}/property-assignments`.
- Status: ready as an entry point; full workflow belongs to `auth-access.md`.

## Remaining Decisions

- Property/facility note model: one property note, per-facility notes, or both.
- Note-to-attachment relationship: independent property attachments, category/tag linking, or dedicated note attachments.
- Facility option source: fixed checklist, free-form values, or backend-managed option list.
- Whether owner selection is enough through existing user/property readable labels or needs a dedicated compact option endpoint later.

## Not Carried Forward

- XOOPS/admin/theme/module/block/preference links and public-content menus.
- Legacy template download behavior from property detail.
- Legacy calendar display colors and member-title fields.
- Legacy property-member form as the authorization source of truth.
- GET-style writes/deletes without backend OpenAPI support and confirmation.
- Frontend-generated dashboard or occupancy summaries from room/billing/journal endpoints.
- Signed URL, nonce, object path, bucket, or storage internals in product copy.
