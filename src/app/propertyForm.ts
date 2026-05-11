import type { CreatePropertyRequest, Property, UpdatePropertyRequest } from '../api';

export type PropertyBillingCadence = CreatePropertyRequest['default_electricity_billing_cadence'];

export type PropertyFormValues = {
  name?: string;
  subtitle?: string | null;
  address?: string;
  electricity_unit_price?: string | number | null;
  default_electricity_billing_cadence?: PropertyBillingCadence;
  owner_id?: string;
  contact_phone?: string | null;
  contact_email?: string | null;
  notes?: string | null;
  facilities?: string | null;
};

export const propertyBillingCadenceOptions: Array<{
  value: PropertyBillingCadence;
  label: string;
}> = [
  { value: 'monthly', label: '每月' },
  { value: 'bimonthly', label: '雙月' },
];

const nullableTextFields = ['subtitle', 'contact_phone', 'contact_email', 'notes'] as const;

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRequiredNumber(value: unknown) {
  return normalizeOptionalNumber(value) ?? 0;
}

export function propertyFacilitiesToText(facilities: Property['facilities']) {
  if (!facilities || typeof facilities !== 'object') {
    return '';
  }

  return Object.entries(facilities)
    .filter(([, value]) => value !== false && value !== null && value !== undefined && value !== '')
    .map(([key, value]) => (value === true ? key : `${key}: ${String(value)}`))
    .join(', ');
}

export function parsePropertyFacilitiesText(value: unknown) {
  const text = normalizeText(value);

  if (!text) {
    return null;
  }

  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce<Record<string, true>>((result, label) => {
      result[label] = true;
      return result;
    }, {});
}

export function getPropertyInitialFormValues(property?: Property): PropertyFormValues {
  return {
    name: property?.name ?? '',
    subtitle: property?.subtitle ?? '',
    address: property?.address ?? '',
    electricity_unit_price: property?.electricity_unit_price ?? '',
    default_electricity_billing_cadence: property?.default_electricity_billing_cadence ?? 'monthly',
    owner_id: property?.owner_id ?? '',
    contact_phone: property?.contact_phone ?? '',
    contact_email: property?.contact_email ?? '',
    notes: property?.notes ?? '',
    facilities: propertyFacilitiesToText(property?.facilities),
  };
}

export function buildCreatePropertyRequest(values: PropertyFormValues): CreatePropertyRequest {
  return {
    name: normalizeText(values.name),
    subtitle: normalizeText(values.subtitle) || null,
    address: normalizeText(values.address),
    electricity_unit_price: normalizeRequiredNumber(values.electricity_unit_price),
    default_electricity_billing_cadence: values.default_electricity_billing_cadence ?? 'monthly',
    owner_id: normalizeText(values.owner_id),
    contact_phone: normalizeText(values.contact_phone) || null,
    contact_email: normalizeText(values.contact_email) || null,
    notes: normalizeText(values.notes) || null,
    facilities: parsePropertyFacilitiesText(values.facilities),
  };
}

export function buildUpdatePropertyRequest(
  values: PropertyFormValues,
  property: Property,
): UpdatePropertyRequest {
  const request: UpdatePropertyRequest = {};
  const nextName = normalizeText(values.name);
  const nextAddress = normalizeText(values.address);

  if (nextName && nextName !== (property.name ?? '')) {
    request.name = nextName;
  }

  if (nextAddress && nextAddress !== (property.address ?? '')) {
    request.address = nextAddress;
  }

  nullableTextFields.forEach((field) => {
    const nextValue = normalizeText(values[field]) || null;
    const previousValue = property[field] ?? null;

    if (nextValue !== previousValue) {
      request[field] = nextValue;
    }
  });

  const nextElectricityUnitPrice = normalizeOptionalNumber(values.electricity_unit_price);
  if (
    nextElectricityUnitPrice !== null
    && nextElectricityUnitPrice !== (property.electricity_unit_price ?? null)
  ) {
    request.electricity_unit_price = nextElectricityUnitPrice;
  }

  const nextBillingCadence = values.default_electricity_billing_cadence;
  if (
    nextBillingCadence
    && nextBillingCadence !== property.default_electricity_billing_cadence
  ) {
    request.default_electricity_billing_cadence = nextBillingCadence;
  }

  const nextFacilities = parsePropertyFacilitiesText(values.facilities);
  const previousFacilitiesText = propertyFacilitiesToText(property.facilities);
  const nextFacilitiesText = propertyFacilitiesToText(nextFacilities);

  if (nextFacilitiesText !== previousFacilitiesText) {
    request.facilities = nextFacilities;
  }

  return request;
}
