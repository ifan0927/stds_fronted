import { describe, expect, it } from 'vitest';
import { ApiError } from '../api';
import type { CurrentUser } from '../api/auth';
import {
  getAccountReturnTo,
  getAccountSummaryItems,
  getDisplayName,
  getProfileFormErrorState,
  getPropertyContextLabel,
} from './accountProfile';

function apiError(status: number, errorCode: string | null) {
  return new ApiError({
    status,
    errorCode,
    message: 'backend error',
    details: null,
    response: new Response(null, { status }),
  });
}

describe('account profile helpers', () => {
  const user: CurrentUser = {
    id: 'user-1',
    email: 'ops@example.com',
    name: '營運人員',
    role: 'organizer',
    assigned_property_ids: ['property-1', 'property-2'],
  };

  it('builds the session-expired return route for account pages', () => {
    expect(getAccountReturnTo('/account')).toBe('/login?reason=session-expired&returnTo=%2Faccount');
  });

  it('uses readable property names when they are available', () => {
    expect(getPropertyContextLabel(user, [
      { value: 'property-1', label: '台北大安物業' },
      { value: 'property-2', label: '新竹光復物業' },
    ])).toBe('台北大安物業、新竹光復物業');
  });

  it('falls back to a property count instead of exposing raw IDs', () => {
    expect(getPropertyContextLabel(user, [])).toBe('2 筆授權物業');
  });

  it('labels admin access without assigned properties as all properties', () => {
    expect(getPropertyContextLabel({
      ...user,
      role: 'admin',
      assigned_property_ids: [],
    }, [])).toBe('全物業');
  });

  it('labels non-admin users without assigned properties explicitly', () => {
    expect(getPropertyContextLabel({
      ...user,
      role: 'staff',
      assigned_property_ids: [],
    }, [])).toBe('目前沒有可管理物業');
  });

  it('builds user-facing summary items from the backend user response', () => {
    expect(getAccountSummaryItems(user, [{ value: 'property-1', label: '台北大安物業' }]))
      .toEqual([
        { key: 'name', label: '姓名', children: '營運人員' },
        { key: 'email', label: '電子信箱', children: 'ops@example.com' },
        { key: 'role', label: '角色', children: '營運管理' },
        { key: 'properties', label: '可管理物業', children: '台北大安物業 等 2 筆授權物業' },
      ]);
  });

  it('falls back from blank names to email for display', () => {
    expect(getDisplayName({ ...user, name: '  ' })).toBe('ops@example.com');
  });

  it('maps backend name validation failures to the profile name field', () => {
    expect(getProfileFormErrorState(apiError(400, 'VALIDATION_NAME_REQUIRED'))).toEqual({
      message: '請確認表單內容後再送出。',
      fields: [{
        name: 'name',
        errors: ['請輸入顯示名稱。'],
      }],
    });
  });
});
