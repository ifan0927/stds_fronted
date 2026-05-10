import { describe, expect, it, vi } from 'vitest';
import {
  createJournalLog,
  deleteJournalLog,
  getJournalLog,
  listJournalExpenseAccountingTitles,
  listJournalLogs,
  updateJournalLog,
} from './journal';

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}

function emptyResponse(init?: ResponseInit) {
  return new Response(null, init);
}

describe('journal API helpers', () => {
  it('lists journal logs with backend-supported filters and pagination', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        data: [{ id: 'journal-1', room_label: '201' }],
        pagination: { page: 2, limit: 50, total: 60, total_pages: 2 },
      }),
    );

    const result = await listJournalLogs(
      () => 'firebase-id-token',
      {
        property_id: 'property/with/slash',
        room_id: 'room/with/slash',
        date_from: '2026-05-01',
        date_to: '2026-05-31',
        page: 2,
        limit: 50,
      },
      { fetcher },
    );

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/journal-logs?property_id=property%2Fwith%2Fslash&room_id=room%2Fwith%2Fslash&date_from=2026-05-01&date_to=2026-05-31&page=2&limit=50');
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer firebase-id-token');
    expect(result.data?.[0]?.room_label).toBe('201');
  });

  it('loads journal detail by encoded id', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ id: 'journal/with/slash', content: '巡檢完成' }),
    );

    const result = await getJournalLog('journal/with/slash', () => 'firebase-id-token', { fetcher });

    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/journal-logs/journal%2Fwith%2Fslash');
    expect(result.content).toBe('巡檢完成');
  });

  it('creates journal logs with backend-aligned payloads', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ id: 'journal-1', expense_amount: 3500 }, { status: 201 }),
    );

    await createJournalLog(
      {
        property_id: 'property-1',
        room_id: 'room-1',
        content: '浴室漏水修繕',
        expense_amount: 3500,
        expense_description: '水管更換費用',
        expense_accounting_title_id: 'title-1',
      },
      () => 'firebase-id-token',
      { fetcher },
    );

    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/journal-logs');
    expect(fetcher.mock.calls[0][1]?.method).toBe('POST');
    expect(fetcher.mock.calls[0][1]?.body).toBe(JSON.stringify({
      property_id: 'property-1',
      room_id: 'room-1',
      content: '浴室漏水修繕',
      expense_amount: 3500,
      expense_description: '水管更換費用',
      expense_accounting_title_id: 'title-1',
    }));
  });

  it('updates and deletes journal logs by encoded id', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 'journal/with/slash', content: '已更新' }))
      .mockResolvedValueOnce(emptyResponse({ status: 204 }));

    await updateJournalLog(
      'journal/with/slash',
      { content: '已更新', expense_accounting_title_id: 'title-1' },
      () => 'firebase-id-token',
      { fetcher },
    );
    await deleteJournalLog('journal/with/slash', () => 'firebase-id-token', { fetcher });

    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/journal-logs/journal%2Fwith%2Fslash');
    expect(fetcher.mock.calls[0][1]?.method).toBe('PATCH');
    expect(fetcher.mock.calls[1][0]).toBe('/api/v1/journal-logs/journal%2Fwith%2Fslash');
    expect(fetcher.mock.calls[1][1]?.method).toBe('DELETE');
  });

  it('loads journal expense accounting title options', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ data: [{ id: 'title-1', code: '6681', name: '其他支出', kind: 'expense' }] }),
    );

    const result = await listJournalExpenseAccountingTitles(() => 'firebase-id-token', { fetcher });

    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/journal-expense-accounting-titles');
    expect(result.data?.[0]?.code).toBe('6681');
  });
});
