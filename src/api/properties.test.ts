import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './errors';
import { getProperty, getPropertyDashboard, listProperties } from './properties';

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}

describe('property API helpers', () => {
  it('lists properties through the shared API boundary', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 'property-1',
            name: '台北大安物業',
            address: '台北市大安區復興南路一段100號',
            occupancy_summary: {
              total_rooms: 10,
              occupied_rooms: 7,
              vacant_rooms: 2,
              maintenance_rooms: 1,
              occupancy_rate: 0.7,
            },
          },
        ],
      }),
    );

    const result = await listProperties(() => 'firebase-id-token', { fetcher });

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/properties');
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer firebase-id-token');
    expect(result.data?.[0]?.name).toBe('台北大安物業');
  });

  it('gets a property by encoded route id', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        id: 'property/with/slash',
        name: '特殊物業',
        address: '台北市',
      }),
    );

    const result = await getProperty('property/with/slash', () => 'firebase-id-token', { fetcher });

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/properties/property%2Fwith%2Fslash');
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer firebase-id-token');
    expect(result.id).toBe('property/with/slash');
  });

  it('gets a property dashboard by encoded route id', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        property_id: 'property-1',
        rooms: [
          {
            id: 'room-1',
            name: '101 室',
            status: 'occupied',
          },
        ],
        monthly_summary: {
          expected_rent: 120000,
          collected_rent: 90000,
          overdue_bill_count: 3,
        },
        occupancy_summary: {
          total_rooms: 10,
          occupied_rooms: 7,
          vacant_rooms: 2,
          maintenance_rooms: 1,
          occupancy_rate: 0.7,
        },
        recent_journals: [],
      }),
    );

    const result = await getPropertyDashboard('property-1', () => 'firebase-id-token', { fetcher });

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/properties/property-1/dashboard');
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer firebase-id-token');
    expect(result.monthly_summary?.overdue_bill_count).toBe(3);
  });

  it('propagates backend errors from property helpers', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          error_code: 'PROPERTY_NOT_FOUND',
          message: 'Property not found.',
        },
        { status: 404, statusText: 'Not Found' },
      ),
    );

    await expect(getProperty('missing-property', () => 'firebase-id-token', { fetcher })).rejects.toMatchObject({
      status: 404,
      errorCode: 'PROPERTY_NOT_FOUND',
      message: 'Property not found.',
    } satisfies Partial<ApiError>);
  });
});
