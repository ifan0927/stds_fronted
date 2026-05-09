import { describe, expect, it, vi } from 'vitest';
import { apiRequest, buildApiUrl } from './client';
import { ApiError } from './errors';
import { parseContentDispositionFilename } from './html';

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}

describe('buildApiUrl', () => {
  it('joins the configured base URL, path, and query params', () => {
    expect(
      buildApiUrl(
        '/properties',
        { page: 2, active: true, empty: null, tag: ['north', 'leased'] },
        'http://localhost:8080/api/v1/',
      ),
    ).toBe('http://localhost:8080/api/v1/properties?page=2&active=true&tag=north&tag=leased');
  });
});

describe('apiRequest', () => {
  it('attaches bearer tokens and parses JSON responses', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        id: 'user-1',
        name: '陳營運',
      }),
    );

    const result = await apiRequest<{ id: string; name: string }>({
      path: '/users/me',
      tokenProvider: () => 'firebase-token',
      fetcher,
    });

    const [, init] = fetcher.mock.calls[0];
    expect(result).toEqual({ id: 'user-1', name: '陳營運' });
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer firebase-token');
  });

  it('serializes JSON request bodies', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }));

    await apiRequest({
      method: 'POST',
      path: '/users',
      body: { name: '王小明' },
      fetcher,
    });

    const [, init] = fetcher.mock.calls[0];
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(init?.body).toBe('{"name":"王小明"}');
  });

  it('maps backend error responses to ApiError', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          error_code: 'FORBIDDEN',
          message: 'Forbidden.',
          details: { scope: 'property' },
        },
        { status: 403, statusText: 'Forbidden' },
      ),
    );

    await expect(apiRequest({ path: '/properties/forbidden', fetcher })).rejects.toMatchObject({
      status: 403,
      errorCode: 'FORBIDDEN',
      message: 'Forbidden.',
      details: { scope: 'property' },
    } satisfies Partial<ApiError>);
  });

  it('returns HTML document metadata for runtime exports', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('<!doctype html><title>收據</title>', {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': 'inline; filename="receipt.html"',
        },
      }),
    );

    const result = await apiRequest({
      path: '/bills/bill-1/receipt/export',
      responseType: 'html',
      fetcher,
    });

    expect(result).toEqual({
      html: '<!doctype html><title>收據</title>',
      contentType: 'text/html; charset=utf-8',
      contentDisposition: 'inline; filename="receipt.html"',
      filename: 'receipt.html',
    });
  });

  it('passes AbortSignal through to fetch', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }));

    await apiRequest({ path: '/properties', signal: controller.signal, fetcher });

    expect(fetcher.mock.calls[0][1]?.signal).toBe(controller.signal);
  });
});

describe('parseContentDispositionFilename', () => {
  it('supports RFC 5987 encoded filenames for future document downloads', () => {
    expect(parseContentDispositionFilename("attachment; filename*=UTF-8''%E6%94%B6%E6%93%9A.pdf")).toBe(
      '收據.pdf',
    );
  });
});
