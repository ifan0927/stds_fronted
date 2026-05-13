import { describe, expect, it, vi } from 'vitest';
import {
  createLease,
  createTenant,
  exportLeaseCheckoutSettlement,
  finalizeLeaseCheckoutSettlement,
  getLease,
  getTenant,
  listBills,
  listLeaseCheckoutReviews,
  listLeases,
  listPropertyTenantLeaseRoster,
  listTenantLeases,
  listTenants,
  previewLeaseCheckoutSettlement,
  updateLease,
  updateTenant,
} from './tenants';

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}

describe('tenant and lease API helpers', () => {
  it('lists property tenant lease roster with backend-supported query params', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        data: [{ room_id: 'room-1', room_label: '101', room_status: 'occupied' }],
        pagination: { page: 2, limit: 50, total: 80, total_pages: 2, has_next: false },
      }),
    );

    const result = await listPropertyTenantLeaseRoster(
      'property/with/slash',
      () => 'firebase-id-token',
      { include_vacant: true, page: 2, limit: 50 },
      { fetcher },
    );

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/properties/property%2Fwith%2Fslash/tenant-lease-roster?include_vacant=true&page=2&limit=50');
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer firebase-id-token');
    expect(result.data?.[0]?.room_label).toBe('101');
  });

  it('loads active leases for a room', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ data: [{ id: 'lease-1', room_id: 'room-1', status: 'active' }] }),
    );

    const result = await listLeases(
      () => 'firebase-id-token',
      { room_id: 'room-1', status: 'active', page: 1, limit: 1 },
      { fetcher },
    );

    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/leases?room_id=room-1&status=active&page=1&limit=1');
    expect(result.data?.[0]?.id).toBe('lease-1');
  });

  it('lists tenants with backend-supported query params', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ data: [{ id: 'tenant-1', name: '林家妤' }] }),
    );

    const result = await listTenants(
      () => 'firebase-id-token',
      { property_id: 'property/with/slash', page: 1, limit: 100 },
      { fetcher },
    );

    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/tenants?property_id=property%2Fwith%2Fslash&page=1&limit=100');
    expect(result.data?.[0]?.name).toBe('林家妤');
  });

  it('creates tenant and lease with backend-aligned payloads', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 'tenant-1', name: '林家妤' }, { status: 201 }))
      .mockResolvedValueOnce(jsonResponse({ id: 'lease-1', tenant_id: 'tenant-1' }, { status: 201 }));

    await createTenant(
      {
        name: '林家妤',
        email: 'tenant@example.com',
        phone: '0912-345-678',
        birth_date: null,
        national_id: null,
        address: null,
        occupation: null,
      },
      () => 'firebase-id-token',
      { fetcher },
    );
    const lease = await createLease(
      {
        tenant_id: 'tenant-1',
        room_id: 'room-1',
        rent_amount: 18000,
        rent_billing_cadence: 'monthly',
        start_date: '2026-06-01',
        end_date: '2027-05-31',
        deposit_amount: 36000,
        electricity_billing_cadence: 'monthly',
        starting_meter_reading: 0,
        notes: null,
      },
      () => 'firebase-id-token',
      { fetcher },
    );

    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/tenants');
    expect(fetcher.mock.calls[0][1]?.method).toBe('POST');
    expect(fetcher.mock.calls[0][1]?.body).toBe(JSON.stringify({
      name: '林家妤',
      email: 'tenant@example.com',
      phone: '0912-345-678',
      birth_date: null,
      national_id: null,
      address: null,
      occupation: null,
    }));
    expect(fetcher.mock.calls[1][0]).toBe('/api/v1/leases');
    expect(fetcher.mock.calls[1][1]?.body).toBe(JSON.stringify({
      tenant_id: 'tenant-1',
      room_id: 'room-1',
      rent_amount: 18000,
      rent_billing_cadence: 'monthly',
      start_date: '2026-06-01',
      end_date: '2027-05-31',
      deposit_amount: 36000,
      electricity_billing_cadence: 'monthly',
      starting_meter_reading: 0,
      notes: null,
    }));
    expect(lease.id).toBe('lease-1');
  });

  it('loads lease, tenant, and rent bill context by encoded ids', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 'lease/with/slash', tenant_id: 'tenant/with/slash' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'tenant/with/slash', name: '林家妤' }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'bill-1', type: 'rent' }] }));

    await getLease('lease/with/slash', () => 'firebase-id-token', { fetcher });
    await getTenant('tenant/with/slash', () => 'firebase-id-token', { fetcher });
    const bills = await listBills(
      () => 'firebase-id-token',
      { lease_id: 'lease/with/slash', type: 'rent', page: 1, limit: 5 },
      { fetcher },
    );

    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/leases/lease%2Fwith%2Fslash');
    expect(fetcher.mock.calls[1][0]).toBe('/api/v1/tenants/tenant%2Fwith%2Fslash');
    expect(fetcher.mock.calls[2][0]).toBe('/api/v1/bills?lease_id=lease%2Fwith%2Fslash&type=rent&page=1&limit=5');
    expect(bills.data?.[0]?.id).toBe('bill-1');
  });

  it('updates tenant using only backend-supported profile fields', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ id: 'tenant/with/slash', name: '林家妤', phone: '0987-654-321' }),
    );

    await updateTenant(
      'tenant/with/slash',
      {
        name: '林家妤',
        email: 'tenant@example.com',
        phone: '0987-654-321',
        contacts: [{ name: '林媽媽', phone: '0911-222-333', relation: '母親' }],
        birth_date: null,
        national_id: null,
        address: '台北市',
        occupation: '設計師',
      },
      () => 'firebase-id-token',
      { fetcher },
    );

    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/tenants/tenant%2Fwith%2Fslash');
    expect(fetcher.mock.calls[0][1]?.method).toBe('PATCH');
    expect(fetcher.mock.calls[0][1]?.body).toBe(JSON.stringify({
      name: '林家妤',
      email: 'tenant@example.com',
      phone: '0987-654-321',
      contacts: [{ name: '林媽媽', phone: '0911-222-333', relation: '母親' }],
      birth_date: null,
      national_id: null,
      address: '台北市',
      occupation: '設計師',
    }));
  });

  it('loads tenant lease history by encoded tenant id', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ data: [{ id: 'lease-1', tenant_id: 'tenant/with/slash' }] }),
    );

    const result = await listTenantLeases(
      'tenant/with/slash',
      () => 'firebase-id-token',
      { status: 'active' },
      { fetcher },
    );

    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/tenants/tenant%2Fwith%2Fslash/leases?status=active');
    expect(result.data?.[0]?.id).toBe('lease-1');
  });

  it('updates lease with rent adjustment payload only', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ id: 'lease/with/slash', rent_amount: 20000 }),
    );

    await updateLease(
      'lease/with/slash',
      { rent_amount: 20000 },
      () => 'firebase-id-token',
      { fetcher },
    );

    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/leases/lease%2Fwith%2Fslash');
    expect(fetcher.mock.calls[0][1]?.method).toBe('PATCH');
    expect(fetcher.mock.calls[0][1]?.body).toBe(JSON.stringify({
      rent_amount: 20000,
    }));
  });

  it('lists checkout review rows with backend-supported filters', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        data: [{ lease_id: 'lease-1', room_label: 'A101', lease_status: 'terminated' }],
        pagination: { page: 2, limit: 20, total: 30, total_pages: 2, has_next: false },
      }),
    );

    const result = await listLeaseCheckoutReviews(
      () => 'firebase-id-token',
      { property_id: 'property/with/slash', status: 'terminated', page: 2, limit: 20 },
      { fetcher },
    );

    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/lease-checkout-reviews?property_id=property%2Fwith%2Fslash&status=terminated&page=2&limit=20');
    expect(result.data?.[0]?.room_label).toBe('A101');
  });

  it('previews and finalizes checkout settlement with backend-owned payloads', async () => {
    const previewPayload = {
      checkout_date: '2026-05-31',
      actual_move_out_date: '2026-05-30',
      reason: '合約到期退租',
      final_meter_reading: 360,
      cleaning_fee: 1000,
      key_card_loss_fee: 0,
      other_fee: 500,
      other_fee_reason: '牆面修補',
      manual_rent_refund_amount: 0,
      manual_rent_refund_reason: '合約到期，不需退未到期租金',
      notes: '現場已點交',
    };
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ lease_id: 'lease/with/slash', preview_token: 'preview-token' }))
      .mockResolvedValueOnce(jsonResponse({ lease_id: 'lease/with/slash', finalized_at: '2026-05-31T10:00:00Z' }));

    await previewLeaseCheckoutSettlement(
      'lease/with/slash',
      previewPayload,
      () => 'firebase-id-token',
      { fetcher },
    );
    await finalizeLeaseCheckoutSettlement(
      'lease/with/slash',
      { ...previewPayload, preview_token: 'preview-token' },
      () => 'firebase-id-token',
      { fetcher },
    );

    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/leases/lease%2Fwith%2Fslash/checkout-settlement/preview');
    expect(fetcher.mock.calls[0][1]?.method).toBe('POST');
    expect(fetcher.mock.calls[0][1]?.body).toBe(JSON.stringify(previewPayload));
    expect(fetcher.mock.calls[1][0]).toBe('/api/v1/leases/lease%2Fwith%2Fslash/checkout-settlement/finalize');
    expect(fetcher.mock.calls[1][1]?.body).toBe(JSON.stringify({
      ...previewPayload,
      preview_token: 'preview-token',
    }));
  });

  it('exports finalized checkout settlement as backend-owned HTML', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('<!doctype html><title>退租結算</title>', {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': 'inline; filename="checkout.html"',
        },
      }),
    );

    const result = await exportLeaseCheckoutSettlement(
      'lease/with/slash',
      () => 'firebase-id-token',
      { fetcher },
    );

    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/leases/lease%2Fwith%2Fslash/checkout-settlement/export?format=html');
    expect(result.filename).toBe('checkout.html');
  });
});
