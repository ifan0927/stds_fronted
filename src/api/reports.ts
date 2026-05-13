import { apiRequest, type AccessTokenProvider } from './client';
import type { components } from './generated/schema';

export type FinancialReportSummaryItem = components['schemas']['FinancialReportSummaryItem'];
export type FinancialReportList = components['schemas']['FinancialReportListResponse'];
export type FinancialReportEntry = components['schemas']['FinancialReportEntryItem'];
export type FinancialReport = components['schemas']['FinancialReportResponse'];

export type FinancialReportSummaryQuery = {
  year?: number;
};

export type TenantRosterExportQuery = {
  as_of: string;
  include_vacant: boolean;
  format: 'html';
};

type ApiHelperOptions = {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
};

function propertyPath(propertyId: string, suffix = '') {
  return `/properties/${encodeURIComponent(propertyId)}${suffix}`;
}

function financialReportMonthPath(propertyId: string, year: number, month: number, suffix = '') {
  return propertyPath(propertyId, `/financial-report/${year}/${month}${suffix}`);
}

export function getPropertyFinancialReportSummary(
  propertyId: string,
  query: FinancialReportSummaryQuery,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<FinancialReportList>({
    path: propertyPath(propertyId, '/financial-report'),
    query,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function getPropertyFinancialReport(
  propertyId: string,
  year: number,
  month: number,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<FinancialReport>({
    path: financialReportMonthPath(propertyId, year, month),
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function sendPropertyFinancialReport(
  propertyId: string,
  year: number,
  month: number,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<FinancialReport>({
    method: 'POST',
    path: financialReportMonthPath(propertyId, year, month, '/send'),
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function exportPropertyFinancialReportCashflow(
  propertyId: string,
  year: number,
  month: number,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest({
    path: financialReportMonthPath(propertyId, year, month, '/cashflow-export'),
    query: { format: 'html' },
    responseType: 'html',
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function exportPropertyFinancialReportProfitLoss(
  propertyId: string,
  year: number,
  month: number,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest({
    path: financialReportMonthPath(propertyId, year, month, '/profit-loss-export'),
    query: { format: 'html' },
    responseType: 'html',
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function exportPropertyOperationReport(
  propertyId: string,
  year: number,
  month: number,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest({
    path: propertyPath(propertyId, `/operation-report/${year}/${month}`),
    query: { format: 'html' },
    responseType: 'html',
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function exportPropertyTenantRoster(
  propertyId: string,
  query: TenantRosterExportQuery,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest({
    path: propertyPath(propertyId, '/tenant-roster'),
    query,
    responseType: 'html',
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}
