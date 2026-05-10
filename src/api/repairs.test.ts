import { describe, expect, it, vi } from 'vitest';
import {
  assignRepairRequest,
  cancelRepairRequest,
  completeRepairRequest,
  createRepairRequest,
  getRepairRequest,
  listRepairRequests,
  progressRepairRequest,
  updateRepairRequest,
} from './repairs';

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}

describe('repair API helpers', () => {
  it('lists repair requests with backend-supported filters and pagination', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        data: [{ id: 'repair-1', room_label: '201', status: 'submitted' }],
        pagination: { page: 2, limit: 50, total: 60, total_pages: 2 },
      }),
    );

    const result = await listRepairRequests(
      () => 'firebase-id-token',
      {
        property_id: 'property/with/slash',
        room_id: 'room/with/slash',
        status: 'submitted',
        assigned_to: 'staff/with/slash',
        page: 2,
        limit: 50,
      },
      { fetcher },
    );

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/repair-requests?property_id=property%2Fwith%2Fslash&room_id=room%2Fwith%2Fslash&status=submitted&assigned_to=staff%2Fwith%2Fslash&page=2&limit=50');
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer firebase-id-token');
    expect(result.data?.[0]?.room_label).toBe('201');
  });

  it('loads repair detail by encoded id', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ id: 'repair/with/slash', title: '浴室漏水' }),
    );

    const result = await getRepairRequest('repair/with/slash', () => 'firebase-id-token', { fetcher });

    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/repair-requests/repair%2Fwith%2Fslash');
    expect(result.title).toBe('浴室漏水');
  });

  it('creates and updates repair requests with backend-aligned payloads', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 'repair-1', status: 'submitted' }, { status: 201 }))
      .mockResolvedValueOnce(jsonResponse({ id: 'repair-1', title: '已更新' }));

    await createRepairRequest(
      {
        property_id: 'property-1',
        room_id: 'room-1',
        title: '浴室漏水',
        description: '天花板持續漏水',
      },
      () => 'firebase-id-token',
      { fetcher },
    );
    await updateRepairRequest(
      'repair-1',
      { title: '已更新', description: '補充描述' },
      () => 'firebase-id-token',
      { fetcher },
    );

    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/repair-requests');
    expect(fetcher.mock.calls[0][1]?.method).toBe('POST');
    expect(fetcher.mock.calls[0][1]?.body).toBe(JSON.stringify({
      property_id: 'property-1',
      room_id: 'room-1',
      title: '浴室漏水',
      description: '天花板持續漏水',
    }));
    expect(fetcher.mock.calls[1][0]).toBe('/api/v1/repair-requests/repair-1');
    expect(fetcher.mock.calls[1][1]?.method).toBe('PATCH');
  });

  it('calls repair lifecycle endpoints', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 'repair-1', status: 'assigned' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'repair-1', status: 'in_progress' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'repair-1', status: 'completed' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'repair-1', status: 'cancelled' }));

    await assignRepairRequest('repair-1', { assigned_to: 'staff-1' }, () => 'firebase-id-token', { fetcher });
    await progressRepairRequest('repair-1', () => 'firebase-id-token', { fetcher });
    await completeRepairRequest('repair-1', () => 'firebase-id-token', { fetcher });
    await cancelRepairRequest('repair-1', { reason: '不需維修' }, () => 'firebase-id-token', { fetcher });

    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/repair-requests/repair-1/assign');
    expect(fetcher.mock.calls[0][1]?.body).toBe(JSON.stringify({ assigned_to: 'staff-1' }));
    expect(fetcher.mock.calls[1][0]).toBe('/api/v1/repair-requests/repair-1/progress');
    expect(fetcher.mock.calls[2][0]).toBe('/api/v1/repair-requests/repair-1/complete');
    expect(fetcher.mock.calls[3][0]).toBe('/api/v1/repair-requests/repair-1/cancel');
    expect(fetcher.mock.calls[3][1]?.body).toBe(JSON.stringify({ reason: '不需維修' }));
  });
});
