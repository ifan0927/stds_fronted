import { describe, expect, it, vi } from 'vitest';
import {
  getLease,
  getTenant,
  listBills,
  listLeases,
  listPropertyTenantLeaseRoster,
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
});
