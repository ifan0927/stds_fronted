import { describe, expect, it, vi } from 'vitest';
import {
  exportBillReceipt,
  getBill,
  listPropertyMeterHistory,
  listPropertyPendingMeters,
  listRoomMeterHistory,
  recordBillPayment,
  submitBillMeter,
} from './billing';

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

  it('loads property meter history with the backend year query', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: [] }));

    await listPropertyMeterHistory('property/1', { year: 2026 }, () => 'token', { fetcher });

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/properties/property%2F1/meter-history?year=2026'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('loads room meter history with backend year and month queries', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: [] }));

    await listRoomMeterHistory('room/1', { year: 2026, month: 5 }, () => 'token', { fetcher });

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/rooms/room%2F1/meter-history?year=2026&month=5'),
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

  it('records full bill payment with the backend payment payload', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ id: 'bill-1', status: 'paid' }));

    await recordBillPayment(
      'bill/1',
      { payment_method: 'transfer', paid_amount: 18000 },
      () => 'token',
      { fetcher },
    );

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/bills/bill%2F1/payment'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ payment_method: 'transfer', paid_amount: 18000 }),
      }),
    );
  });

  it('exports a bill receipt through the HTML response path', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('<!doctype html><title>收據</title>', {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': 'inline; filename="bill-receipt.html"',
      },
    }));

    const result = await exportBillReceipt('bill/1', () => 'token', { fetcher });

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/bills/bill%2F1/receipt?format=html'),
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result).toMatchObject({
      html: '<!doctype html><title>收據</title>',
      filename: 'bill-receipt.html',
    });
  });
});
