import { describe, expect, it, vi } from 'vitest';
import { listUsers } from './users';

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
});
