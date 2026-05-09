import { apiRequest, type AccessTokenProvider } from './client';
import type { components } from './generated/schema';

export type Property = components['schemas']['PropertyResponse'];
export type PropertyList = components['schemas']['PropertyListResponse'];
export type PropertyDashboard = components['schemas']['DashboardResponse'];

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
