export { apiRequest, buildApiUrl } from './client';
export type { AccessTokenProvider, ApiRequestOptions, QueryValue } from './client';
export { getCurrentUser, syncAuth, updateCurrentUser } from './auth';
export type { CurrentUser, UpdateCurrentUserRequest } from './auth';
export { getDashboard } from './dashboard';
export type { HomeDashboard } from './dashboard';
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
  getLease,
  getTenant,
  listBills,
  listLeases,
  listPropertyTenantLeaseRoster,
} from './tenants';
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
  Lease,
  LeaseList,
  ListBillsQuery,
  ListLeasesQuery,
  ListPropertyTenantLeaseRosterQuery,
  PropertyTenantLeaseRoster,
  PropertyTenantLeaseRosterRow,
  Tenant,
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
