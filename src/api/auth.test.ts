import { describe, expect, it, vi } from 'vitest';
import { syncAuth } from './auth';

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}

describe('syncAuth', () => {
  it('calls the backend auth sync endpoint with the Firebase bearer token', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        id: 'user-1',
        email: 'ops@example.com',
        name: '營運人員',
        role: 'organizer',
      }),
    );

    const result = await syncAuth(() => 'firebase-id-token', fetcher);

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/auth/sync');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer firebase-id-token');
    expect(result).toMatchObject({
      id: 'user-1',
      role: 'organizer',
    });
  });
});
