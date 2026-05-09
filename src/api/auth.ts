import { apiRequest, type AccessTokenProvider } from './client';
import type { components } from './generated/schema';

export type CurrentUser = components['schemas']['UserResponse'];
export type UpdateCurrentUserRequest = components['schemas']['UpdateCurrentUserRequest'];

export function syncAuth(tokenProvider: AccessTokenProvider, fetcher?: typeof fetch) {
  return apiRequest<CurrentUser>({
    method: 'POST',
    path: '/auth/sync',
    tokenProvider,
    fetcher,
  });
}

export function getCurrentUser(
  tokenProvider: AccessTokenProvider,
  options: {
    signal?: AbortSignal;
    fetcher?: typeof fetch;
  } = {},
) {
  return apiRequest<CurrentUser>({
    path: '/users/me',
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function updateCurrentUser(
  tokenProvider: AccessTokenProvider,
  body: UpdateCurrentUserRequest,
  options: {
    signal?: AbortSignal;
    fetcher?: typeof fetch;
  } = {},
) {
  return apiRequest<CurrentUser>({
    method: 'PATCH',
    path: '/users/me',
    body,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}
