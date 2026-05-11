import { describe, expect, it, vi } from 'vitest';
import {
  assignUserProperties,
  createUser,
  getUser,
  listUsers,
  triggerUserPasswordReset,
  updateUser,
} from './users';

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}

describe('users API helpers', () => {
  it('lists users with role and pagination filters', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        data: [{ id: 'staff-1', name: '陳美芳', role: 'staff' }],
        pagination: { page: 1, limit: 100, total: 1, total_pages: 1 },
      }),
    );

    const result = await listUsers(
      () => 'firebase-id-token',
      { role: 'staff', page: 1, limit: 100 },
      { fetcher },
    );

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/users?role=staff&page=1&limit=100');
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer firebase-id-token');
    expect(result.data?.[0]?.name).toBe('陳美芳');
  });

  it('creates users with the backend-aligned payload', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        id: 'staff-1',
        email: 'staff@example.com',
        name: '陳美芳',
        role: 'staff',
      }, { status: 201 }),
    );

    const result = await createUser(
      {
        email: 'staff@example.com',
        name: '陳美芳',
        role: 'staff',
      },
      () => 'firebase-id-token',
      { fetcher },
    );

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/users');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer firebase-id-token');
    expect(init?.body).toBe(JSON.stringify({
      email: 'staff@example.com',
      name: '陳美芳',
      role: 'staff',
    }));
    expect(result.id).toBe('staff-1');
  });

  it('loads and updates users by encoded id', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        id: 'user/with/slash',
        email: 'member@example.com',
        name: '王小明',
        role: 'organizer',
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: 'user/with/slash',
        email: 'member@example.com',
        name: '王大明',
        role: 'admin',
      }));

    await getUser('user/with/slash', () => 'firebase-id-token', { fetcher });
    await updateUser(
      'user/with/slash',
      { name: '王大明', role: 'admin' },
      () => 'firebase-id-token',
      { fetcher },
    );

    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/users/user%2Fwith%2Fslash');
    expect(fetcher.mock.calls[0][1]?.method).toBe('GET');
    expect(fetcher.mock.calls[1][0]).toBe('/api/v1/users/user%2Fwith%2Fslash');
    expect(fetcher.mock.calls[1][1]?.method).toBe('PATCH');
    expect(fetcher.mock.calls[1][1]?.body).toBe(JSON.stringify({
      name: '王大明',
      role: 'admin',
    }));
  });

  it('assigns properties through the dedicated assignment endpoint', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        id: 'staff-1',
        assigned_property_ids: ['property-1', 'property-2'],
      }),
    );

    await assignUserProperties(
      'staff-1',
      { property_ids: ['property-1', 'property-2'] },
      () => 'firebase-id-token',
      { fetcher },
    );

    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/users/staff-1/property-assignments');
    expect(fetcher.mock.calls[0][1]?.method).toBe('POST');
    expect(fetcher.mock.calls[0][1]?.body).toBe(JSON.stringify({
      property_ids: ['property-1', 'property-2'],
    }));
  });

  it('treats password reset 204 responses as void', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));

    const result = await triggerUserPasswordReset(
      'staff/with/slash',
      () => 'firebase-id-token',
      { fetcher },
    );

    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/users/staff%2Fwith%2Fslash/password-reset');
    expect(fetcher.mock.calls[0][1]?.method).toBe('POST');
    expect(result).toBeUndefined();
  });
});
