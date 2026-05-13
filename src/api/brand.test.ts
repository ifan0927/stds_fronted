import { describe, expect, it, vi } from 'vitest';
import {
  createBrandFAQItem,
  deactivateBrandFAQItem,
  getBrandProfile,
  listBrandFAQItems,
  updateBrandFAQItem,
  upsertBrandProfile,
} from './brand';

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}

describe('brand API helpers', () => {
  it('gets and upserts the brand profile through the shared API boundary', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ brand_name: 'STDS', version: 1 }))
      .mockResolvedValueOnce(jsonResponse({ brand_name: 'STDS 管理', version: 2 }));

    const profile = await getBrandProfile(() => 'firebase-token', { fetcher });
    const saved = await upsertBrandProfile(
      {
        brand_name: 'STDS 管理',
        contact_phone: null,
        contact_email: null,
        contact_address: null,
        version: 1,
      },
      () => 'firebase-token',
      { fetcher },
    );

    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/brand/profile');
    expect(fetcher.mock.calls[0][1]?.method).toBe('GET');
    expect(fetcher.mock.calls[1][0]).toBe('/api/v1/brand/profile');
    expect(fetcher.mock.calls[1][1]?.method).toBe('PUT');
    expect(new Headers(fetcher.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer firebase-token');
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toMatchObject({ brand_name: 'STDS 管理', version: 1 });
    expect(profile.version).toBe(1);
    expect(saved.version).toBe(2);
  });

  it('manages brand FAQ items through encoded paths', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'faq/1', question: '入住？', answer: '請洽詢。' }, { status: 201 }))
      .mockResolvedValueOnce(jsonResponse({ id: 'faq/1', question: '入住？', answer: '歡迎洽詢。', version: 2 }))
      .mockResolvedValueOnce(jsonResponse({ id: 'faq/1', is_active: false, version: 3 }));

    await listBrandFAQItems(() => 'firebase-token', { include_inactive: true }, { fetcher });
    await createBrandFAQItem(
      { question: '入住？', answer: '請洽詢。', sort_order: 1, is_active: true },
      () => 'firebase-token',
      { fetcher },
    );
    await updateBrandFAQItem(
      'faq/1',
      { question: '入住？', answer: '歡迎洽詢。', sort_order: 1, is_active: true, version: 1 },
      () => 'firebase-token',
      { fetcher },
    );
    await deactivateBrandFAQItem('faq/1', { version: 2 }, () => 'firebase-token', { fetcher });

    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/brand/faq-items?include_inactive=true');
    expect(fetcher.mock.calls[1][0]).toBe('/api/v1/brand/faq-items');
    expect(fetcher.mock.calls[1][1]?.method).toBe('POST');
    expect(fetcher.mock.calls[2][0]).toBe('/api/v1/brand/faq-items/faq%2F1');
    expect(fetcher.mock.calls[2][1]?.method).toBe('PATCH');
    expect(fetcher.mock.calls[3][0]).toBe('/api/v1/brand/faq-items/faq%2F1/deactivate');
    expect(fetcher.mock.calls[3][1]?.method).toBe('POST');
  });
});
