import { apiRequest, type AccessTokenProvider } from './client';
import type { components } from './generated/schema';

export type Bill = components['schemas']['BillResponse'];
export type BillList = components['schemas']['BillListResponse'];
export type RecordMeterRequest = components['schemas']['RecordMeterRequest'];

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
