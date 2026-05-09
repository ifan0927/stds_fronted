import { apiRequest, type AccessTokenProvider } from './client';
import type { components } from './generated/schema';

export type PropertyTenantLeaseRosterRow = components['schemas']['PropertyTenantLeaseRosterRow'];
export type PropertyTenantLeaseRoster = components['schemas']['PropertyTenantLeaseRosterResponse'];
export type Lease = components['schemas']['LeaseResponse'];
export type LeaseList = components['schemas']['LeaseListResponse'];
export type Tenant = components['schemas']['TenantResponse'];
export type Bill = components['schemas']['BillResponse'];
export type BillList = components['schemas']['BillListResponse'];

export type ListPropertyTenantLeaseRosterQuery = {
  include_vacant?: boolean;
  page?: number;
  limit?: number;
};

export type ListLeasesQuery = {
  property_id?: string;
  room_id?: string;
  tenant_id?: string;
  status?: Lease['status'];
  page?: number;
  limit?: number;
};

export type ListBillsQuery = {
  property_id?: string;
  lease_id?: string;
  tenant_id?: string;
  status?: Bill['status'];
  type?: Bill['type'];
  month?: string;
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

function leasePath(leaseId: string) {
  return `/leases/${encodeURIComponent(leaseId)}`;
}

function tenantPath(tenantId: string) {
  return `/tenants/${encodeURIComponent(tenantId)}`;
}

export function listPropertyTenantLeaseRoster(
  propertyId: string,
  tokenProvider: AccessTokenProvider,
  query: ListPropertyTenantLeaseRosterQuery = {},
  options: ApiHelperOptions = {},
) {
  return apiRequest<PropertyTenantLeaseRoster>({
    path: propertyPath(propertyId, '/tenant-lease-roster'),
    query,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function listLeases(
  tokenProvider: AccessTokenProvider,
  query: ListLeasesQuery = {},
  options: ApiHelperOptions = {},
) {
  return apiRequest<LeaseList>({
    path: '/leases',
    query,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function getLease(
  leaseId: string,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<Lease>({
    path: leasePath(leaseId),
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function getTenant(
  tenantId: string,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<Tenant>({
    path: tenantPath(tenantId),
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function listBills(
  tokenProvider: AccessTokenProvider,
  query: ListBillsQuery = {},
  options: ApiHelperOptions = {},
) {
  return apiRequest<BillList>({
    path: '/bills',
    query,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}
