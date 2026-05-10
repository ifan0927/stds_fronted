export { apiRequest, buildApiUrl } from './client';
export type { AccessTokenProvider, ApiRequestOptions, QueryValue } from './client';
export { getCurrentUser, syncAuth, updateCurrentUser } from './auth';
export type { CurrentUser, UpdateCurrentUserRequest } from './auth';
export { getDashboard } from './dashboard';
export type { HomeDashboard } from './dashboard';
export {
  getBill,
  listPropertyMeterHistory,
  listPropertyPendingMeters,
  listRoomMeterHistory,
  submitBillMeter,
} from './billing';
export {
  createPropertyRoom,
  createRoomMaintenance,
  deleteRoom,
  getProperty,
  getPropertyDashboard,
  getRoom,
  listProperties,
  listPropertyRooms,
  updateRoom,
} from './properties';
export {
  createLease,
  createTenant,
  getLease,
  getTenant,
  listBills,
  listLeases,
  listPropertyTenantLeaseRoster,
  listTenantLeases,
  listTenants,
  updateLease,
  updateTenant,
} from './tenants';
export type {
  Bill as BillingBill,
  BillList as BillingBillList,
  MeterHistoryQuery,
  PropertyMeterHistory,
  PropertyMeterHistoryRow,
  RecordMeterRequest,
} from './billing';
export type {
  CreateRoomRequest,
  ListPropertyRoomsQuery,
  Property,
  PropertyDashboard,
  PropertyList,
  Room,
  RoomList,
  RoomStatus,
  SetMaintenanceRequest,
  SetMaintenanceResponse,
  UpdateRoomRequest,
} from './properties';
export type {
  Bill,
  BillList,
  CreateLeaseRequest,
  CreateTenantRequest,
  Lease,
  LeaseList,
  ListBillsQuery,
  ListLeasesQuery,
  ListPropertyTenantLeaseRosterQuery,
  ListTenantLeasesQuery,
  ListTenantsQuery,
  PropertyTenantLeaseRoster,
  PropertyTenantLeaseRosterRow,
  Tenant,
  TenantList,
  UpdateLeaseRequest,
  UpdateTenantRequest,
} from './tenants';
export { ApiError } from './errors';
export { classifyApiErrorForUi, getFormErrorState } from './errors';
export type { ErrorResponse, FormErrorState, UiErrorKind, UiErrorState } from './errors';
export { openHtmlDocumentPreview, parseContentDispositionFilename } from './html';
export type {
  HtmlDocumentResponse,
  HtmlPreviewWindow,
  OpenHtmlDocumentPreviewResult,
} from './html';
