import { apiRequest, type AccessTokenProvider } from './client';
import type { components } from './generated/schema';

export type HomeDashboard = components['schemas']['HomeDashboardResponse'];

export function getDashboard(
  tokenProvider: AccessTokenProvider,
  options: {
    signal?: AbortSignal;
    fetcher?: typeof fetch;
  } = {},
) {
  return apiRequest<HomeDashboard>({
    path: '/dashboard',
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}
