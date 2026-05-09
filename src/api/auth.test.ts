import { describe, expect, it, vi } from 'vitest';
import { getCurrentUser, syncAuth, updateCurrentUser } from './auth';

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

  it('calls the current-user endpoint with the Firebase bearer token', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        id: 'user-1',
        email: 'ops@example.com',
        name: '營運人員',
        role: 'organizer',
      }),
    );

    const result = await getCurrentUser(() => 'firebase-id-token', { fetcher });

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/users/me');
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer firebase-id-token');
    expect(result).toMatchObject({
      id: 'user-1',
      role: 'organizer',
    });
  });

  it('patches the current-user profile with a JSON body', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        id: 'user-1',
        email: 'ops@example.com',
        name: '營運主管',
        role: 'organizer',
      }),
    );

    const result = await updateCurrentUser(
      () => 'firebase-id-token',
      { name: '營運主管' },
      { fetcher },
    );

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/users/me');
    expect(init?.method).toBe('PATCH');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer firebase-id-token');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(init?.body).toBe('{"name":"營運主管"}');
    expect(result.name).toBe('營運主管');
  });
});
