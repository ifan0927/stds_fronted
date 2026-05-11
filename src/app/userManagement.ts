import { ApiError, getFormErrorState, type FormErrorState, type Property, type User, type UserRole } from '../api';
import { getRoleLabel } from '../auth';

export const userRoleOptions: Array<{ value: UserRole; label: string }> = [
  { value: 'admin', label: getRoleLabel('admin') },
  { value: 'organizer', label: getRoleLabel('organizer') },
  { value: 'staff', label: getRoleLabel('staff') },
  { value: 'owner', label: getRoleLabel('owner') },
];

export type PropertyOption = {
  value: string;
  label: string;
};

const userFieldMap: Record<string, string> = {
  VALIDATION_EMAIL_REQUIRED: 'email',
  VALIDATION_EMAIL_INVALID: 'email',
  EMAIL_ALREADY_EXISTS: 'email',
  VALIDATION_NAME_REQUIRED: 'name',
};

export function getUserDisplayName(user: User) {
  return user.name?.trim() || user.email?.trim() || '未命名成員';
}

export function getUserEmail(user: User) {
  return user.email?.trim() || '未提供 email';
}

export function getPropertyDisplayName(property: Property) {
  return property.name?.trim() || property.address?.trim() || '未命名物業';
}

export function getPropertyOptions(properties: Property[]): PropertyOption[] {
  return properties
    .filter((property): property is Property & { id: string } => typeof property.id === 'string')
    .map((property) => ({
      value: property.id,
      label: getPropertyDisplayName(property),
    }));
}

export function getPropertyLabels(propertyIds: string[] | undefined, options: PropertyOption[], labelsLoaded: boolean) {
  const ids = propertyIds ?? [];

  if (ids.length === 0) {
    return ['未指派物業'];
  }

  const labels = ids
    .map((id) => options.find((option) => option.value === id)?.label)
    .filter((label): label is string => Boolean(label));

  if (labels.length > 0) {
    return labels;
  }

  return labelsLoaded ? ['找不到可讀物業名稱'] : [`已指派 ${ids.length} 筆物業`];
}

export function getUserFormErrorState(error: unknown): FormErrorState {
  const state = getFormErrorState(error, userFieldMap);

  if (error instanceof ApiError && error.status === 409) {
    return {
      message: '此 email 已被使用，請改用其他 email。',
      fields: [{ name: 'email', errors: ['此 email 已被使用。'] }],
    };
  }

  return state;
}

export function isStudioMember(role: User['role']) {
  return role === 'admin' || role === 'organizer' || role === 'staff';
}
