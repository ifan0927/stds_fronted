import { apiRequest, type AccessTokenProvider } from './client';
import type { components } from './generated/schema';

export type CurrentUser = components['schemas']['UserResponse'];

export function syncAuth(tokenProvider: AccessTokenProvider, fetcher?: typeof fetch) {
  return apiRequest<CurrentUser>({
    method: 'POST',
    path: '/auth/sync',
    tokenProvider,
    fetcher,
  });
}
