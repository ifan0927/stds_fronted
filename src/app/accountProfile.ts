import { ApiError, getFormErrorState, type FormErrorState } from '../api';
import type { CurrentUser } from '../api/auth';
import { getRoleLabel } from '../auth';

export type AccountPropertyOption = {
  value: string;
  label: string;
};

export function getAccountReturnTo(pathname: string) {
  return `/login?reason=session-expired&returnTo=${encodeURIComponent(pathname)}`;
}

export function getDisplayName(user: CurrentUser | null | undefined) {
  return user?.name?.trim() || user?.email?.trim() || '未提供';
}

export function getPropertyContextLabel(
  user: CurrentUser,
  propertyOptions: AccountPropertyOption[],
) {
  const assignedPropertyIds = user.assigned_property_ids ?? [];

  if (assignedPropertyIds.length === 0) {
    return user.role === 'admin' ? '全物業' : '目前沒有可管理物業';
  }

  const propertyNames = assignedPropertyIds
    .map((propertyId) => propertyOptions.find((option) => option.value === propertyId)?.label)
    .filter((label): label is string => Boolean(label));

  if (propertyNames.length === assignedPropertyIds.length) {
    return propertyNames.join('、');
  }

  if (propertyNames.length > 0) {
    return `${propertyNames.join('、')} 等 ${assignedPropertyIds.length} 筆授權物業`;
  }

  return `${assignedPropertyIds.length} 筆授權物業`;
}

export function getAccountSummaryItems(user: CurrentUser, propertyOptions: AccountPropertyOption[]) {
  return [
    {
      key: 'name',
      label: '姓名',
      children: getDisplayName(user),
    },
    {
      key: 'email',
      label: '電子信箱',
      children: user.email ?? '未提供',
    },
    {
      key: 'role',
      label: '角色',
      children: getRoleLabel(user.role),
    },
    {
      key: 'properties',
      label: '可管理物業',
      children: getPropertyContextLabel(user, propertyOptions),
    },
  ];
}

export function getProfileFormErrorState(error: unknown): FormErrorState {
  if (error instanceof ApiError && error.status === 400) {
    return {
      message: '請確認表單內容後再送出。',
      fields: error.errorCode === 'VALIDATION_NAME_REQUIRED'
        ? [{
          name: 'name',
          errors: ['請輸入顯示名稱。'],
        }]
        : [],
    };
  }

  return getFormErrorState(error, {
    VALIDATION_NAME_REQUIRED: 'name',
  });
}
