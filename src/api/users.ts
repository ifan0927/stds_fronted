import { apiRequest, type AccessTokenProvider } from './client';
import type { components } from './generated/schema';

export type User = components['schemas']['UserResponse'];
export type UserList = components['schemas']['UserListResponse'];
export type UserRole = NonNullable<User['role']>;
export type CreateUserRequest = components['schemas']['CreateUserRequest'];
export type UpdateUserRequest = components['schemas']['UpdateUserRequest'];
export type PropertyAssignmentRequest = components['schemas']['PropertyAssignmentRequest'];

export type ListUsersQuery = {
  role?: UserRole;
  page?: number;
  limit?: number;
};

type ApiHelperOptions = {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
};

function userPath(userId: string, suffix = '') {
  return `/users/${encodeURIComponent(userId)}${suffix}`;
}

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

export function createUser(
  body: CreateUserRequest,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<User>({
    method: 'POST',
    path: '/users',
    body,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function getUser(
  userId: string,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<User>({
    path: userPath(userId),
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function updateUser(
  userId: string,
  body: UpdateUserRequest,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<User>({
    method: 'PATCH',
    path: userPath(userId),
    body,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function assignUserProperties(
  userId: string,
  body: PropertyAssignmentRequest,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<User>({
    method: 'POST',
    path: userPath(userId, '/property-assignments'),
    body,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function triggerUserPasswordReset(
  userId: string,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest({
    method: 'POST',
    path: userPath(userId, '/password-reset'),
    responseType: 'void',
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}
