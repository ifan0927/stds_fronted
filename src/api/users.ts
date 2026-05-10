import { apiRequest, type AccessTokenProvider } from './client';
import type { components } from './generated/schema';

export type User = components['schemas']['UserResponse'];
export type UserList = components['schemas']['UserListResponse'];
export type UserRole = NonNullable<User['role']>;

export type ListUsersQuery = {
  role?: UserRole;
  page?: number;
  limit?: number;
};

type ApiHelperOptions = {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
};

export function listUsers(
  tokenProvider: AccessTokenProvider,
  query: ListUsersQuery = {},
  options: ApiHelperOptions = {},
) {
  return apiRequest<UserList>({
    path: '/users',
    query,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}
