import { describe, expect, it, vi } from 'vitest';
import { getDashboard } from './dashboard';

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}

describe('getDashboard', () => {
  it('calls the backend dashboard endpoint with the Firebase bearer token', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        portfolio_summary: {
          total_rooms: 10,
          occupied_rooms: 7,
          vacant_rooms: 2,
          maintenance_rooms: 1,
          occupancy_rate: 0.7,
        },
        monthly_billing_summary: {
          expected_rent: 120000,
          collected_rent: 90000,
          overdue_bill_count: 3,
        },
        property_summaries: [],
        recent_journals: [],
      }),
    );

    const result = await getDashboard(() => 'firebase-id-token', { fetcher });

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/dashboard');
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer firebase-id-token');
    expect(result.monthly_billing_summary.overdue_bill_count).toBe(3);
  });
});
