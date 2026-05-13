import { apiRequest, type AccessTokenProvider } from './client';
import type { components } from './generated/schema';

export type PropertyTenantLeaseRosterRow = components['schemas']['PropertyTenantLeaseRosterRow'];
export type PropertyTenantLeaseRoster = components['schemas']['PropertyTenantLeaseRosterResponse'];
export type Lease = components['schemas']['LeaseResponse'];
export type LeaseList = components['schemas']['LeaseListResponse'];
export type Tenant = components['schemas']['TenantResponse'];
export type TenantList = components['schemas']['TenantListResponse'];
export type CreateTenantRequest = components['schemas']['CreateTenantRequest'];
export type CreateLeaseRequest = components['schemas']['CreateLeaseRequest'];
export type UpdateTenantRequest = components['schemas']['UpdateTenantRequest'];
export type UpdateLeaseRequest = components['schemas']['UpdateLeaseRequest'];
export type Bill = components['schemas']['BillResponse'];
export type BillList = components['schemas']['BillListResponse'];
export type LeaseCheckoutReview = components['schemas']['LeaseCheckoutReviewResponse'];
export type LeaseCheckoutReviewList = components['schemas']['LeaseCheckoutReviewListResponse'];
export type CheckoutSettlementPreviewRequest = components['schemas']['CheckoutSettlementPreviewRequest'];
export type CheckoutSettlementFinalizeRequest = components['schemas']['CheckoutSettlementFinalizeRequest'];
export type CheckoutSettlementResponse = components['schemas']['CheckoutSettlementResponse'];

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

export type ListTenantsQuery = {
  property_id?: string;
  status?: Tenant['status'];
  page?: number;
  limit?: number;
};

export type ListTenantLeasesQuery = {
  status?: Lease['status'];
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

export type ListLeaseCheckoutReviewsQuery = {
  property_id?: string;
  status?: LeaseCheckoutReview['lease_status'];
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

export function listTenants(
  tokenProvider: AccessTokenProvider,
  query: ListTenantsQuery = {},
  options: ApiHelperOptions = {},
) {
  return apiRequest<TenantList>({
    path: '/tenants',
    query,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function createTenant(
  body: CreateTenantRequest,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<Tenant>({
    method: 'POST',
    path: '/tenants',
    body,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function createLease(
  body: CreateLeaseRequest,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<Lease>({
    method: 'POST',
    path: '/leases',
    body,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function updateTenant(
  tenantId: string,
  body: UpdateTenantRequest,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<Tenant>({
    method: 'PATCH',
    path: tenantPath(tenantId),
    body,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function updateLease(
  leaseId: string,
  body: UpdateLeaseRequest,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<Lease>({
    method: 'PATCH',
    path: leasePath(leaseId),
    body,
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

export function listTenantLeases(
  tenantId: string,
  tokenProvider: AccessTokenProvider,
  query: ListTenantLeasesQuery = {},
  options: ApiHelperOptions = {},
) {
  return apiRequest<LeaseList>({
    path: `${tenantPath(tenantId)}/leases`,
    query,
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

export function listLeaseCheckoutReviews(
  tokenProvider: AccessTokenProvider,
  query: ListLeaseCheckoutReviewsQuery = {},
  options: ApiHelperOptions = {},
) {
  return apiRequest<LeaseCheckoutReviewList>({
    path: '/lease-checkout-reviews',
    query,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function previewLeaseCheckoutSettlement(
  leaseId: string,
  body: CheckoutSettlementPreviewRequest,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<CheckoutSettlementResponse>({
    method: 'POST',
    path: `${leasePath(leaseId)}/checkout-settlement/preview`,
    body,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function finalizeLeaseCheckoutSettlement(
  leaseId: string,
  body: CheckoutSettlementFinalizeRequest,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<CheckoutSettlementResponse>({
    method: 'POST',
    path: `${leasePath(leaseId)}/checkout-settlement/finalize`,
    body,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function exportLeaseCheckoutSettlement(
  leaseId: string,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest({
    path: `${leasePath(leaseId)}/checkout-settlement/export`,
    query: { format: 'html' },
    responseType: 'html',
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}
