import type { Bill, Lease, Tenant, UpdateLeaseRequest, UpdateTenantRequest } from '../api';

export type TenantContactFormValue = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  relation?: string | null;
};

export type TenantFormValues = {
  name?: string;
  email?: string;
  phone?: string;
  contacts?: TenantContactFormValue[];
  birth_date?: string | null;
  national_id?: string | null;
  address?: string | null;
  occupation?: string | null;
};

export type LeaseAdjustmentFormValues = {
  rent_amount?: number | null;
};

function trimText(value: string | null | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

function trimNullableText(value: string | null | undefined) {
  return trimText(value) ?? null;
}

export function getOptionalText(value: string | number | null | undefined) {
  if (typeof value === 'number') {
    return String(value);
  }

  return value && value.trim().length > 0 ? value : '未提供';
}

export function getTenantStatusLabel(status: Tenant['status']) {
  if (status === 'active') {
    return '啟用';
  }

  if (status === 'inactive') {
    return '停用';
  }

  return '未提供';
}

export function getLeaseStatusLabel(status: Lease['status']) {
  if (status === 'active') {
    return '有效';
  }

  if (status === 'expired') {
    return '已到期';
  }

  if (status === 'terminated') {
    return '已退租';
  }

  if (status === 'force_terminated') {
    return '強制退租';
  }

  return '未提供';
}

export function getBillStatusLabel(status: Bill['status']) {
  if (status === 'pending_meter') {
    return '待抄表';
  }

  if (status === 'pending_payment') {
    return '待收款';
  }

  if (status === 'paid') {
    return '已付款';
  }

  if (status === 'overdue') {
    return '逾期';
  }

  if (status === 'voided') {
    return '已作廢';
  }

  if (status === 'written_off') {
    return '已沖銷';
  }

  return '未提供';
}

export function getCadenceLabel(value: Lease['rent_billing_cadence'] | Lease['electricity_billing_cadence']) {
  if (value === 'monthly') {
    return '月繳';
  }

  if (value === 'quarterly') {
    return '季繳';
  }

  if (value === 'semiannual') {
    return '半年繳';
  }

  if (value === 'annual') {
    return '年繳';
  }

  if (value === 'bimonthly') {
    return '雙月';
  }

  return '未提供';
}

export function getDepositStatusLabel(value: Lease['deposit_status']) {
  if (value === 'held') {
    return '保留中';
  }

  if (value === 'settled') {
    return '已結清';
  }

  if (value === 'written_off') {
    return '已沖銷';
  }

  return '未提供';
}

export function getStatusColor(value: string | null | undefined) {
  if (value === 'active' || value === 'paid' || value === 'held') {
    return 'green';
  }

  if (value === 'inactive' || value === 'expired' || value === 'voided') {
    return 'default';
  }

  if (value === 'pending_payment' || value === 'overdue') {
    return 'orange';
  }

  if (value === 'terminated' || value === 'force_terminated' || value === 'written_off') {
    return 'red';
  }

  return 'default';
}

export function buildTenantUpdateRequest(values: TenantFormValues): UpdateTenantRequest {
  const request: UpdateTenantRequest = {
    name: trimText(values.name) ?? '',
    phone: values.phone === undefined ? undefined : values.phone.trim(),
    contacts: (values.contacts ?? [])
      .map((contact) => ({
        name: trimNullableText(contact.name),
        phone: trimNullableText(contact.phone),
        email: trimNullableText(contact.email),
        relation: trimNullableText(contact.relation),
      }))
      .filter((contact) => Boolean(contact.name || contact.phone || contact.email || contact.relation)),
    birth_date: trimNullableText(values.birth_date),
    national_id: trimNullableText(values.national_id),
    address: trimNullableText(values.address),
    occupation: trimNullableText(values.occupation),
  };
  const email = trimText(values.email);

  if (email) {
    request.email = email;
  }

  return request;
}

export function buildLeaseAdjustmentRequest(values: LeaseAdjustmentFormValues): UpdateLeaseRequest {
  return {
    rent_amount: values.rent_amount ?? undefined,
  };
}
