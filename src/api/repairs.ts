import { apiRequest, type AccessTokenProvider } from './client';
import type { components } from './generated/schema';

export type RepairRequest = components['schemas']['RepairRequestResponse'];
export type RepairRequestList = components['schemas']['RepairRequestListResponse'];
export type CreateRepairRequest = components['schemas']['CreateRepairRequestRequest'];
export type UpdateRepairRequest = components['schemas']['UpdateRepairRequestRequest'];
export type AssignRepairRequest = components['schemas']['AssignRepairRequest'];
export type CancelRepairRequest = components['schemas']['CancelRepairRequest'];
export type RepairRequestStatus = NonNullable<RepairRequest['status']>;

export type ListRepairRequestsQuery = {
  property_id?: string;
  room_id?: string;
  status?: RepairRequestStatus;
  assigned_to?: string;
  page?: number;
  limit?: number;
};

type ApiHelperOptions = {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
};

function repairRequestPath(repairRequestId: string, suffix = '') {
  return `/repair-requests/${encodeURIComponent(repairRequestId)}${suffix}`;
}

export function listRepairRequests(
  tokenProvider: AccessTokenProvider,
  query: ListRepairRequestsQuery = {},
  options: ApiHelperOptions = {},
) {
  return apiRequest<RepairRequestList>({
    path: '/repair-requests',
    query,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function getRepairRequest(
  repairRequestId: string,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<RepairRequest>({
    path: repairRequestPath(repairRequestId),
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function createRepairRequest(
  body: CreateRepairRequest,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<RepairRequest>({
    method: 'POST',
    path: '/repair-requests',
    body,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function updateRepairRequest(
  repairRequestId: string,
  body: UpdateRepairRequest,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<RepairRequest>({
    method: 'PATCH',
    path: repairRequestPath(repairRequestId),
    body,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function assignRepairRequest(
  repairRequestId: string,
  body: AssignRepairRequest,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<RepairRequest>({
    method: 'POST',
    path: repairRequestPath(repairRequestId, '/assign'),
    body,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function progressRepairRequest(
  repairRequestId: string,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<RepairRequest>({
    method: 'POST',
    path: repairRequestPath(repairRequestId, '/progress'),
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function completeRepairRequest(
  repairRequestId: string,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<RepairRequest>({
    method: 'POST',
    path: repairRequestPath(repairRequestId, '/complete'),
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function cancelRepairRequest(
  repairRequestId: string,
  body: CancelRepairRequest | undefined,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<RepairRequest>({
    method: 'POST',
    path: repairRequestPath(repairRequestId, '/cancel'),
    body,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}
