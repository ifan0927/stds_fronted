import { apiRequest, type AccessTokenProvider } from './client';
import type { components } from './generated/schema';

export type Property = components['schemas']['PropertyResponse'];
export type PropertyList = components['schemas']['PropertyListResponse'];
export type PropertyDashboard = components['schemas']['DashboardResponse'];
export type Room = components['schemas']['RoomResponse'];
export type RoomList = components['schemas']['RoomListResponse'];
export type RoomStatus = NonNullable<Room['status']>;

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
