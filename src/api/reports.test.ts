import { describe, expect, it, vi } from 'vitest';
import {
  exportPropertyFinancialReportCashflow,
  exportPropertyFinancialReportProfitLoss,
  exportPropertyOperationReport,
  exportPropertyTenantRoster,
  getPropertyFinancialReport,
  getPropertyFinancialReportSummary,
  sendPropertyFinancialReport,
} from './reports';

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function htmlResponse(body: string) {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': 'inline; filename="report.html"',
    },
  });
}

describe('reports API helpers', () => {
  it('loads the property financial report summary with explicit year', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: [] }));

    await getPropertyFinancialReportSummary('property/1', { year: 2026 }, () => 'token', { fetcher });

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/properties/property%2F1/financial-report?year=2026'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('loads one monthly financial report by explicit year and month', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ year: 2026, month: 5 }));

    await getPropertyFinancialReport('property/1', 2026, 5, () => 'token', { fetcher });

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/properties/property%2F1/financial-report/2026/5'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('sends one monthly financial report by explicit encoded property, year, and month without a request body', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ year: 2026, month: 5 }));

    await sendPropertyFinancialReport('property/1', 2026, 5, () => 'token', { fetcher });

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/properties/property%2F1/financial-report/2026/5/send'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetcher.mock.calls[0]?.[1]).not.toHaveProperty('body');
  });

  it('opens the cashflow export through the HTML response path', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse('<!doctype html>'));

    const result = await exportPropertyFinancialReportCashflow('property/1', 2026, 5, () => 'token', { fetcher });

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/properties/property%2F1/financial-report/2026/5/cashflow-export?format=html'),
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result.contentType).toBe('text/html; charset=utf-8');
    expect(result.filename).toBe('report.html');
  });

  it('opens the profit and loss export through the HTML response path', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse('<!doctype html>'));

    await exportPropertyFinancialReportProfitLoss('property/1', 2026, 5, () => 'token', { fetcher });

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/properties/property%2F1/financial-report/2026/5/profit-loss-export?format=html'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('opens the operation report export through the HTML response path', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse('<!doctype html>'));

    await exportPropertyOperationReport('property/1', 2026, 5, () => 'token', { fetcher });

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/properties/property%2F1/operation-report/2026/5?format=html'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('opens the tenant roster export with explicit HTML query params', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse('<!doctype html>'));

    const result = await exportPropertyTenantRoster(
      'property/1',
      { as_of: '2026-05-10', include_vacant: true, format: 'html' },
      () => 'token',
      { fetcher },
    );

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/properties/property%2F1/tenant-roster?as_of=2026-05-10&include_vacant=true&format=html'),
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result.contentType).toBe('text/html; charset=utf-8');
    expect(result.filename).toBe('report.html');
  });
});
