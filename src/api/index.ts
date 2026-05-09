export { apiRequest, buildApiUrl } from './client';
export type { AccessTokenProvider, ApiRequestOptions, QueryValue } from './client';
export { getCurrentUser, syncAuth, updateCurrentUser } from './auth';
export type { CurrentUser, UpdateCurrentUserRequest } from './auth';
export { getDashboard } from './dashboard';
export type { HomeDashboard } from './dashboard';
export { getProperty, getPropertyDashboard, listProperties, listPropertyRooms } from './properties';
export type {
  ListPropertyRoomsQuery,
  Property,
  PropertyDashboard,
  PropertyList,
  Room,
  RoomList,
  RoomStatus,
} from './properties';
export { ApiError } from './errors';
export { classifyApiErrorForUi, getFormErrorState } from './errors';
export type { ErrorResponse, FormErrorState, UiErrorKind, UiErrorState } from './errors';
export { openHtmlDocumentPreview, parseContentDispositionFilename } from './html';
export type {
  HtmlDocumentResponse,
  HtmlPreviewWindow,
  OpenHtmlDocumentPreviewResult,
} from './html';
