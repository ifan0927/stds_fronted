# Journal And Accounting Events Design

> Status: contract map for UI template
> References: `docs/design/frontend-foundation.md`, `docs/design/property-management.md`, `docs/design/room-management.md`, `docs/design/tenant-lease-management.md`, `docs/design/accounting-reports.md`, `DESIGN.md`, `/Users/cheni-fan/stds_backend/docs/spec/openapi.yaml`

## Scope

本文件只收斂 `日誌與維修` workspace 的 UI contract，供後續 UI template 使用。

包含：

- JournalLog list/detail/create/edit/delete。
- Journal expense title selection and accounting-side-effect UX。
- Journal attachments。
- RepairRequest list/detail/create/edit、派工、開始處理、完成、取消。
- Repair attachments with `before` / `after` / `other` stages。
- Property、room、occupied-room context entry points。

不包含：

- 財務報表、ledger、cashflow、profit/loss、operation report。
- 房間維修狀態復原邏輯。
- 租金、電費、退租、報表寄送流程。
- 前端自行建立或同步 accounting entries。

## Current Backend Contract

- `GET /journal-logs`
  - filters include property/room/date/page/limit where defined by OpenAPI.
  - list response includes pagination.
- `POST /journal-logs` and `PATCH /journal-logs/{id}`
  - accept `expense_accounting_title_id` when `expense_amount` is present.
  - backend syncs accounting entries; frontend must not create accounting entries itself.
- `GET /journal-logs/{id}`
  - response includes `expense_accounting_title_id`, `expense_accounting_title_code`, and `expense_accounting_title_name` snapshot fields.
- `GET /journal-expense-accounting-titles`
  - returns active expense title options `{id, code, name, kind}`.
- `DELETE /journal-logs/{id}`
  - destructive action; expense-bearing deletes need stronger confirmation.
- `GET /repair-requests`, `GET /repair-requests/{id}`, `POST /repair-requests`, `PATCH /repair-requests/{id}`
  - repair list/detail/basic form contracts.
  - list response includes pagination.
- `POST /repair-requests/{id}/assign`
  - assign staff and move submitted repair into assigned state where backend allows.
- `POST /repair-requests/{id}/progress`
  - move assigned repair into `in_progress`.
- `POST /repair-requests/{id}/complete`
  - complete repair where backend allows.
- `POST /repair-requests/{id}/cancel`
  - accepts optional cancellation reason, but response display of cancellation reason remains a decision.
- Attachment APIs:
  - `POST /attachments/upload-url`
  - `GET /journal-logs/{id}/attachments`
  - `POST /journal-logs/{id}/attachments`
  - `GET /repair-requests/{id}/attachments`
  - `POST /repair-requests/{id}/attachments`
  - `DELETE /attachments/{id}`
- Shared readable labels:
  - `JournalLogResponse` and `RepairRequestResponse` include readable label support where backend added it; use `*_label` fields instead of deriving from IDs.
- Error contract:
  - finalized month changes return `409 JOURNAL_EXPENSE_SNAPSHOT_FINALIZED`.

Confirmed backend-owned rules:

- Accounting side effects for journal expenses are backend-owned and transactionally synced.
- Dashboard summaries are backend-owned; do not design frontend aggregation.
- List pagination is backend-provided; frontend should not invent totals.

## Page / Workflow Slices

### Journal And Repair Workspace

Purpose: one operational page for journal logs and repair requests without forcing a hard unified feed.

Backend contract: `GET /journal-logs` and `GET /repair-requests` as separate paginated datasets.

Status: ready for UI template. Use tabs or segmented controls; do not merge paginated responses into an authoritative single timeline.

### Journal Log List

Purpose: review property-scoped and room-scoped journal logs.

Backend contract: `GET /journal-logs`; use backend filters, pagination, labels, expense snapshot fields, and attachment indicators when available.

Status: ready for UI template. Keyword/category/facility filters remain future decisions.

### Journal Log Detail

Purpose: review content, context labels, expense title snapshot, amount, timestamps, and attachments.

Backend contract: `GET /journal-logs/{id}` and `GET /journal-logs/{id}/attachments`.

Status: ready for UI template. Display `expense_accounting_title_code/name` snapshots; do not refetch mutable accounting title data to rewrite historical display.

### Journal Log Create / Edit

Purpose: create or edit a journal note, optionally with expense data.

Backend contract: `POST /journal-logs`, `PATCH /journal-logs/{id}`, and `GET /journal-expense-accounting-titles`.

Status: ready for UI template. When `expense_amount` exists, require `expense_accounting_title_id`; handle `409 JOURNAL_EXPENSE_SNAPSHOT_FINALIZED` as a blocking alert near expense fields.

### Journal Log Delete

Purpose: remove a journal log with destructive confirmation.

Backend contract: `DELETE /journal-logs/{id}`.

Status: ready for UI template. If the log has expense data, confirmation should mention backend-owned accounting side effects without explaining implementation internals.

### Journal Attachment Management

Purpose: upload/register/list/delete journal attachments.

Backend contract: shared upload URL flow plus journal attachment endpoints.

Status: ready for UI template. Do not expose signed URL, nonce, bucket, object path, or storage internals as product copy.

### Repair Request List

Purpose: review repair requests and enter lifecycle actions.

Backend contract: `GET /repair-requests`; filters include property/room/status/assigned/page/limit where available.

Status: ready for UI template. Use backend pagination and readable labels.

### Repair Request Detail

Purpose: review title, description, room/property labels, submitter/assignee labels, status, timestamps, lifecycle actions, and attachments.

Backend contract: `GET /repair-requests/{id}` and `GET /repair-requests/{id}/attachments`.

Status: ready for UI template. Cancellation reason display remains pending until backend response exposes it.

### Repair Request Create / Edit

Purpose: create or edit basic repair content.

Backend contract: `POST /repair-requests` and `PATCH /repair-requests/{id}`.

Status: ready for UI template. Keep property/room context locked when launched from a scoped page.

### Repair Assignment

Purpose: assign a repair request to staff.

Backend contract: `POST /repair-requests/{id}/assign`; staff options can first use `GET /users?role=staff` if sufficient.

Status: ready for UI template. Compact staff option endpoint is only a follow-up if the generic users endpoint is insufficient.

### Repair Progress / Complete / Cancel

Purpose: operate repair lifecycle transitions.

Backend contract: `POST /repair-requests/{id}/progress`, `POST /repair-requests/{id}/complete`, `POST /repair-requests/{id}/cancel`.

Status: ready for UI template. Refetch repair and room context after mutations; do not compute room state locally.

### Repair Attachment Management

Purpose: upload/register/list/delete repair files/photos with stage metadata.

Backend contract: shared upload URL flow plus repair attachment endpoints; registration supports `sort_order` and `photo_stage`.

Status: ready for UI template. Show `before` as `施工前`, `after` as `施工後`, and `other` as `其他`.

### Contextual Entry Points

Purpose: link users from property, room, and occupied-room contexts into `日誌與維修`.

Backend contract: use the owning page data plus journal/repair list filters.

Status: ready for UI template. Entry points are allowed; embedding journal editors or repair lifecycle flows into those owning pages is not.

## Remaining Decisions

- Repair cancellation reason response remains open; form can submit optional reason, but detail display waits for backend response support.
- Journal keyword/category/facility filters remain future backend/product decisions.
- Staff selector compact option endpoint is needed only if `GET /users?role=staff` is not enough.
- Hard unified activity feed is future scope only if product later requires it.

## Legacy Notes

- Legacy `管理日誌` mixed notes, repair-like records, and accounting rows. New UI keeps JournalLog and RepairRequest separate inside one workspace.
- Legacy `叫修` maps to RepairRequest, not a journal kind.

## Not Carried Forward

- Legacy journal kind select.
- Legacy reply/comment workflow.
- Treating repair as nullable fields on JournalLog.
- Legacy hidden accounting row fields, title/code/tag/bank/tid controls, or frontend accounting entry creation.
- Frontend-composed unified activity feed from separate paginated endpoints.
- Frontend-calculated accounting/report totals.
- Owner-visible journal/repair UI in v1.
- GET-style writes/deletes or storage internals in product copy.
