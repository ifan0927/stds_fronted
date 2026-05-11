import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './errors';
import {
  createProperty,
  createPropertyRoom,
  createRoomMaintenance,
  deleteProperty,
  deleteRoom,
  getProperty,
  getPropertyDashboard,
  getRoom,
  listProperties,
  listPropertyRooms,
  updateProperty,
  updateRoom,
} from './properties';

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

  it('creates a property through the shared API boundary', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        id: 'property-1',
        name: '台北大安物業',
        address: '台北市大安區復興南路一段100號',
        electricity_unit_price: 4.5,
        default_electricity_billing_cadence: 'monthly',
        owner_id: 'owner-1',
      }, { status: 201 }),
    );

    const result = await createProperty(
      {
        name: '台北大安物業',
        subtitle: null,
        address: '台北市大安區復興南路一段100號',
        electricity_unit_price: 4.5,
        default_electricity_billing_cadence: 'monthly',
        owner_id: 'owner-1',
        contact_phone: null,
        contact_email: null,
        notes: null,
        facilities: { 電梯: true },
      },
      () => 'firebase-id-token',
      { fetcher },
    );

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/properties');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer firebase-id-token');
    expect(await new Response(init?.body).json()).toEqual({
      name: '台北大安物業',
      subtitle: null,
      address: '台北市大安區復興南路一段100號',
      electricity_unit_price: 4.5,
      default_electricity_billing_cadence: 'monthly',
      owner_id: 'owner-1',
      contact_phone: null,
      contact_email: null,
      notes: null,
      facilities: { 電梯: true },
    });
    expect(result.id).toBe('property-1');
  });

  it('updates a property by encoded route id', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        id: 'property/with/slash',
        name: '台北大安新名',
        address: '台北市',
        contact_phone: null,
      }),
    );

    const result = await updateProperty(
      'property/with/slash',
      {
        name: '台北大安新名',
        contact_phone: null,
      },
      () => 'firebase-id-token',
      { fetcher },
    );

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/properties/property%2Fwith%2Fslash');
    expect(init?.method).toBe('PATCH');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer firebase-id-token');
    expect(await new Response(init?.body).json()).toEqual({
      name: '台北大安新名',
      contact_phone: null,
    });
    expect(result.name).toBe('台北大安新名');
  });

  it('deletes a property with a void response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));

    await expect(deleteProperty('property/with/slash', () => 'firebase-id-token', { fetcher })).resolves.toBeUndefined();

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/properties/property%2Fwith%2Fslash');
    expect(init?.method).toBe('DELETE');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer firebase-id-token');
  });

  it('lists property rooms with backend-supported query params', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 'room-1',
            property_id: 'property/with/slash',
            name: '101 室',
            status: 'vacant',
            floor: '1F',
            default_rent_amount: 18000,
          },
        ],
        pagination: {
          page: 2,
          limit: 50,
          total: 80,
          total_pages: 2,
          has_next: false,
        },
      }),
    );

    const result = await listPropertyRooms(
      'property/with/slash',
      () => 'firebase-id-token',
      { status: 'vacant', page: 2, limit: 50 },
      { fetcher },
    );

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/properties/property%2Fwith%2Fslash/rooms?status=vacant&page=2&limit=50');
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer firebase-id-token');
    expect(result.data?.[0]?.name).toBe('101 室');
    expect(result.pagination?.total).toBe(80);
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

  it('creates a property room through the shared API boundary', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        id: 'room-1',
        property_id: 'property/with/slash',
        name: '301 室',
        status: 'vacant',
      }, { status: 201 }),
    );

    const result = await createPropertyRoom(
      'property/with/slash',
      {
        name: '301 室',
        size: 7.5,
        floor: '3F',
        room_type: '套房',
        facilities: { 冷氣: true },
        default_rent_amount: 16000,
        notes: null,
        zone: 'A 區',
      },
      () => 'firebase-id-token',
      { fetcher },
    );

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/properties/property%2Fwith%2Fslash/rooms');
    expect(init?.method).toBe('POST');
    expect(await new Response(init?.body).json()).toMatchObject({
      name: '301 室',
      default_rent_amount: 16000,
      notes: null,
    });
    expect(result.id).toBe('room-1');
  });

  it('gets and updates rooms by encoded room id', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 'room/with/slash', name: '101 室', status: 'vacant' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'room/with/slash', name: '101A 室', status: 'vacant' }));

    await getRoom('room/with/slash', () => 'firebase-id-token', { fetcher });
    const updated = await updateRoom(
      'room/with/slash',
      { name: '101A 室', floor: null },
      () => 'firebase-id-token',
      { fetcher },
    );

    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/rooms/room%2Fwith%2Fslash');
    expect(fetcher.mock.calls[0][1]?.method).toBe('GET');
    expect(fetcher.mock.calls[1][0]).toBe('/api/v1/rooms/room%2Fwith%2Fslash');
    expect(fetcher.mock.calls[1][1]?.method).toBe('PATCH');
    expect(await new Response(fetcher.mock.calls[1][1]?.body).json()).toEqual({
      name: '101A 室',
      floor: null,
    });
    expect(updated.name).toBe('101A 室');
  });

  it('deletes a room with a void response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));

    await expect(deleteRoom('room-1', () => 'firebase-id-token', { fetcher })).resolves.toBeUndefined();

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/rooms/room-1');
    expect(init?.method).toBe('DELETE');
  });

  it('creates a room maintenance entry and returns the repair request', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        room: { id: 'room-1', status: 'maintenance' },
        repair_request: { id: 'repair-1', title: '浴室漏水', status: 'submitted' },
      }),
    );

    const result = await createRoomMaintenance(
      'room-1',
      { title: '浴室漏水', description: '浴室天花板持續漏水。' },
      () => 'firebase-id-token',
      { fetcher },
    );

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/rooms/room-1/maintenance');
    expect(init?.method).toBe('POST');
    expect(await new Response(init?.body).json()).toEqual({
      title: '浴室漏水',
      description: '浴室天花板持續漏水。',
    });
    expect(result.repair_request.id).toBe('repair-1');
  });
});
