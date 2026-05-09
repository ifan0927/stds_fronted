import { apiRequest, type AccessTokenProvider } from './client';
import type { components } from './generated/schema';

export type Property = components['schemas']['PropertyResponse'];
export type PropertyList = components['schemas']['PropertyListResponse'];
export type PropertyDashboard = components['schemas']['DashboardResponse'];
export type Room = components['schemas']['RoomResponse'];
export type RoomList = components['schemas']['RoomListResponse'];
export type RoomStatus = NonNullable<Room['status']>;
export type CreateRoomRequest = components['schemas']['CreateRoomRequest'];
export type UpdateRoomRequest = components['schemas']['UpdateRoomRequest'];
export type SetMaintenanceRequest = components['schemas']['SetMaintenanceRequest'];
export type SetMaintenanceResponse = components['schemas']['SetMaintenanceResponse'];

export type ListPropertyRoomsQuery = {
  status?: RoomStatus;
  page?: number;
  limit?: number;
};

type ApiHelperOptions = {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
};

function propertyPath(propertyId: string, suffix = '') {
  return `/properties/${encodeURIComponent(propertyId)}${suffix}`;
}

function roomPath(roomId: string, suffix = '') {
  return `/rooms/${encodeURIComponent(roomId)}${suffix}`;
}

export function listProperties(
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<PropertyList>({
    path: '/properties',
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function getProperty(
  propertyId: string,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<Property>({
    path: propertyPath(propertyId),
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function getPropertyDashboard(
  propertyId: string,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<PropertyDashboard>({
    path: propertyPath(propertyId, '/dashboard'),
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function listPropertyRooms(
  propertyId: string,
  tokenProvider: AccessTokenProvider,
  query: ListPropertyRoomsQuery = {},
  options: ApiHelperOptions = {},
) {
  return apiRequest<RoomList>({
    path: propertyPath(propertyId, '/rooms'),
    query,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function createPropertyRoom(
  propertyId: string,
  body: CreateRoomRequest,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<Room>({
    method: 'POST',
    path: propertyPath(propertyId, '/rooms'),
    body,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function getRoom(
  roomId: string,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<Room>({
    path: roomPath(roomId),
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function updateRoom(
  roomId: string,
  body: UpdateRoomRequest,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<Room>({
    method: 'PATCH',
    path: roomPath(roomId),
    body,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function deleteRoom(
  roomId: string,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest({
    method: 'DELETE',
    path: roomPath(roomId),
    responseType: 'void',
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function createRoomMaintenance(
  roomId: string,
  body: SetMaintenanceRequest,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<SetMaintenanceResponse>({
    method: 'POST',
    path: roomPath(roomId, '/maintenance'),
    body,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}
