import { describe, expect, it } from 'vitest';
import { buildLeaseAdjustmentRequest, buildTenantUpdateRequest } from './tenantLeaseDetail';

describe('tenant and lease detail payload helpers', () => {
  it('builds tenant update payload without unsupported tenant notes', () => {
    const payload = buildTenantUpdateRequest({
      name: ' 林家妤 ',
      email: ' tenant@example.com ',
      phone: ' 0912-345-678 ',
      contacts: [
        { name: ' 林媽媽 ', phone: ' 0911-222-333 ', relation: ' 母親 ' },
        { name: '   ', phone: '', email: null, relation: undefined },
      ],
      birth_date: '',
      national_id: ' A123456789 ',
      address: '',
      occupation: ' 設計師 ',
    });

    expect(payload).toEqual({
      name: '林家妤',
      email: 'tenant@example.com',
      phone: '0912-345-678',
      contacts: [{
        name: '林媽媽',
        phone: '0911-222-333',
        email: null,
        relation: '母親',
      }],
      birth_date: null,
      national_id: 'A123456789',
      address: null,
      occupation: '設計師',
    });
    expect(payload).not.toHaveProperty('notes');
  });

  it('omits blank optional tenant email from update payload', () => {
    expect(buildTenantUpdateRequest({
      name: '林家妤',
      email: '   ',
      phone: '0987-654-321',
    })).toEqual({
      name: '林家妤',
      phone: '0987-654-321',
      contacts: [],
      birth_date: null,
      national_id: null,
      address: null,
      occupation: null,
    });
  });

  it('keeps blank tenant phone in update payload so backend can clear it', () => {
    expect(buildTenantUpdateRequest({
      name: '林家妤',
      phone: '   ',
    })).toMatchObject({
      name: '林家妤',
      phone: '',
    });
  });

  it('builds lease adjustment payload without unsupported end date, cadence, or payment fields', () => {
    expect(buildLeaseAdjustmentRequest({
      rent_amount: 20000,
    })).toEqual({
      rent_amount: 20000,
    });
  });
});
