import { describe, expect, it } from 'vitest';
import { ApiError } from '../api';
import type { CurrentUser } from '../api/auth';
import {
  canAccessProperty,
  classifyAuthSyncFailure,
  getLoginViewState,
  getRoleLabel,
  getSafeReturnTo,
  getStatusAfterFirebaseSignInFailure,
  hasRole,
  shouldShowSessionExpiredNotice,
} from './session';

function apiError(status: number, errorCode: string | null) {
  return new ApiError({
    status,
    errorCode,
    message: 'backend error',
    details: null,
    response: new Response(null, { status }),
  });
}

describe('classifyAuthSyncFailure', () => {
  it('maps a missing backend user to the account gate state', () => {
    expect(classifyAuthSyncFailure(apiError(404, 'USER_NOT_FOUND'))).toBe('account-not-found');
  });

  it('maps invalid or expired Firebase tokens to the invalid session state', () => {
    expect(classifyAuthSyncFailure(apiError(401, 'INVALID_FIREBASE_TOKEN'))).toBe('invalid-session');
    expect(classifyAuthSyncFailure(apiError(401, 'UNAUTHORIZED'))).toBe('invalid-session');
  });

  it('treats network and server failures as retryable sync errors', () => {
    expect(classifyAuthSyncFailure(apiError(500, 'INTERNAL_ERROR'))).toBe('retryable-sync-error');
    expect(classifyAuthSyncFailure(new Error('network down'))).toBe('retryable-sync-error');
  });
});

describe('auth visibility helpers', () => {
  const user: CurrentUser = {
    id: 'user-1',
    role: 'staff',
    assigned_property_ids: ['property-1'],
  };

  it('labels backend roles for user-facing UI', () => {
    expect(getRoleLabel('admin')).toBe('系統管理員');
    expect(getRoleLabel(undefined)).toBe('未設定角色');
  });

  it('checks route visibility roles without becoming the authorization source of truth', () => {
    expect(hasRole(user, ['admin', 'staff'])).toBe(true);
    expect(hasRole(user, ['admin'])).toBe(false);
  });

  it('checks property visibility for assigned users and global admin roles', () => {
    expect(canAccessProperty(user, 'property-1')).toBe(true);
    expect(canAccessProperty(user, 'property-2')).toBe(false);
    expect(canAccessProperty({ ...user, role: 'admin' }, 'property-2')).toBe(true);
  });
});

describe('login state helpers', () => {
  it('resets Firebase sign-in failures to an unauthenticated state', () => {
    expect(getStatusAfterFirebaseSignInFailure()).toBe('unauthenticated');
  });

  it('routes backend sync failures to recoverable login-page states', () => {
    expect(getLoginViewState('account-not-found')).toBe('account-not-found');
    expect(getLoginViewState('retryable-sync-error')).toBe('retryable-sync-error');
    expect(getLoginViewState('config-error')).toBe('config-error');
    expect(getLoginViewState('invalid-session')).toBe('form');
  });

  it('shows expired-session copy from either route params or auth state', () => {
    expect(shouldShowSessionExpiredNotice('unauthenticated', true)).toBe(true);
    expect(shouldShowSessionExpiredNotice('invalid-session', false)).toBe(true);
    expect(shouldShowSessionExpiredNotice('unauthenticated', false)).toBe(false);
  });
});

describe('getSafeReturnTo', () => {
  it('allows internal app paths only', () => {
    expect(getSafeReturnTo('/properties')).toBe('/properties');
    expect(getSafeReturnTo('https://example.com')).toBe('/');
    expect(getSafeReturnTo('//example.com')).toBe('/');
    expect(getSafeReturnTo('/login')).toBe('/');
  });
});
