import { ApiError } from '../api';
import type { CurrentUser } from '../api/auth';
import type { AuthStatus } from './AuthContext';

export type AuthFailureKind = 'account-not-found' | 'invalid-session' | 'retryable-sync-error';

export type UserRole = NonNullable<CurrentUser['role']>;

const roleLabels: Record<UserRole, string> = {
  admin: '系統管理員',
  organizer: '營運管理',
  staff: '工作室成員',
  owner: '業主',
};

export function classifyAuthSyncFailure(error: unknown): AuthFailureKind {
  if (error instanceof ApiError) {
    if (error.status === 404 && error.errorCode === 'USER_NOT_FOUND') {
      return 'account-not-found';
    }

    if (error.status === 401 || error.errorCode === 'INVALID_FIREBASE_TOKEN') {
      return 'invalid-session';
    }
  }

  return 'retryable-sync-error';
}

export function getStatusAfterFirebaseSignInFailure(): AuthStatus {
  return 'unauthenticated';
}

export function getLoginViewState(
  status: AuthStatus,
): 'form' | 'account-not-found' | 'retryable-sync-error' | 'config-error' {
  if (status === 'account-not-found') {
    return 'account-not-found';
  }

  if (status === 'retryable-sync-error') {
    return 'retryable-sync-error';
  }

  if (status === 'config-error') {
    return 'config-error';
  }

  return 'form';
}

export function shouldShowSessionExpiredNotice(status: AuthStatus, hasSessionExpiredParam: boolean) {
  return hasSessionExpiredParam || status === 'invalid-session';
}

export function getRoleLabel(role: CurrentUser['role']) {
  return role ? roleLabels[role] : '未設定角色';
}

export function hasRole(currentUser: CurrentUser | null, roles: UserRole[]) {
  return Boolean(currentUser?.role && roles.includes(currentUser.role));
}

export function canAccessProperty(currentUser: CurrentUser | null, propertyId: string | undefined) {
  if (!currentUser || !propertyId) {
    return false;
  }

  if (currentUser.role === 'admin' || currentUser.role === 'organizer') {
    return true;
  }

  return currentUser.assigned_property_ids?.includes(propertyId) ?? false;
}

export function getSafeReturnTo(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/login')) {
    return '/';
  }

  return value;
}
