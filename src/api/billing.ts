import { apiRequest, type AccessTokenProvider } from './client';
import type { components } from './generated/schema';

export type Bill = components['schemas']['BillResponse'];
export type BillList = components['schemas']['BillListResponse'];
export type PropertyMeterHistory = components['schemas']['PropertyMeterHistoryResponse'];
export type PropertyMeterHistoryRow = components['schemas']['PropertyMeterHistoryRow'];
export type RecordMeterRequest = components['schemas']['RecordMeterRequest'];

export type MeterHistoryQuery = {
  year?: number;
  month?: number;
};

type ApiHelperOptions = {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
};

function billPath(billId: string, suffix = '') {
  return `/bills/${encodeURIComponent(billId)}${suffix}`;
}

function propertyPath(propertyId: string, suffix = '') {
  return `/properties/${encodeURIComponent(propertyId)}${suffix}`;
}

function roomPath(roomId: string, suffix = '') {
  return `/rooms/${encodeURIComponent(roomId)}${suffix}`;
}

export function listPropertyPendingMeters(
  propertyId: string,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<BillList>({
    path: propertyPath(propertyId, '/pending-meter'),
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function listPropertyMeterHistory(
  propertyId: string,
  query: Pick<MeterHistoryQuery, 'year'>,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<PropertyMeterHistory>({
    path: propertyPath(propertyId, '/meter-history'),
    query,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function listRoomMeterHistory(
  roomId: string,
  query: MeterHistoryQuery,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<BillList>({
    path: roomPath(roomId, '/meter-history'),
    query,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function getBill(
  billId: string,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<Bill>({
    path: billPath(billId),
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function submitBillMeter(
  billId: string,
  body: RecordMeterRequest,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<Bill>({
    method: 'POST',
    path: billPath(billId, '/meter'),
    body,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}
