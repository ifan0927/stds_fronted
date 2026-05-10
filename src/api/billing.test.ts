import { describe, expect, it, vi } from 'vitest';
import { getBill, listPropertyPendingMeters, submitBillMeter } from './billing';

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('billing API helpers', () => {
  it('loads property pending meters with auth token', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: [] }));

    await listPropertyPendingMeters('property/1', () => 'token', { fetcher });

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/properties/property%2F1/pending-meter'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.any(Headers),
      }),
    );
    const headers = fetcher.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer token');
  });

  it('loads one bill detail', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ id: 'bill-1' }));

    await getBill('bill-1', () => 'token', { fetcher });

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/bills/bill-1'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('submits a single current meter reading only', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ id: 'bill-1' }));

    await submitBillMeter('bill-1', { current_reading: 1380 }, () => 'token', { fetcher });

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/bills/bill-1/meter'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ current_reading: 1380 }),
      }),
    );
  });
});
