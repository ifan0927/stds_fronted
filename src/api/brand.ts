import { apiRequest, type AccessTokenProvider } from './client';
import type { components } from './generated/schema';

export type BrandProfile = components['schemas']['BrandProfileResponse'];
export type UpsertBrandProfileRequest = components['schemas']['UpsertBrandProfileRequest'];
export type BrandFAQItem = components['schemas']['BrandFAQItemResponse'];
export type BrandFAQItemList = components['schemas']['BrandFAQItemListResponse'];
export type CreateBrandFAQItemRequest = components['schemas']['CreateBrandFAQItemRequest'];
export type UpdateBrandFAQItemRequest = components['schemas']['UpdateBrandFAQItemRequest'];
export type DeactivateBrandFAQItemRequest = components['schemas']['DeactivateBrandFAQItemRequest'];

type ApiHelperOptions = {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
};

function brandFAQItemPath(id: string, suffix = '') {
  return `/brand/faq-items/${encodeURIComponent(id)}${suffix}`;
}

export function getBrandProfile(
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<BrandProfile>({
    path: '/brand/profile',
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function upsertBrandProfile(
  body: UpsertBrandProfileRequest,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<BrandProfile>({
    method: 'PUT',
    path: '/brand/profile',
    body,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function listBrandFAQItems(
  tokenProvider: AccessTokenProvider,
  query: { include_inactive?: boolean } = {},
  options: ApiHelperOptions = {},
) {
  return apiRequest<BrandFAQItemList>({
    path: '/brand/faq-items',
    query,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function createBrandFAQItem(
  body: CreateBrandFAQItemRequest,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<BrandFAQItem>({
    method: 'POST',
    path: '/brand/faq-items',
    body,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function updateBrandFAQItem(
  id: string,
  body: UpdateBrandFAQItemRequest,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<BrandFAQItem>({
    method: 'PATCH',
    path: brandFAQItemPath(id),
    body,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function deactivateBrandFAQItem(
  id: string,
  body: DeactivateBrandFAQItemRequest,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<BrandFAQItem>({
    method: 'POST',
    path: brandFAQItemPath(id, '/deactivate'),
    body,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}
