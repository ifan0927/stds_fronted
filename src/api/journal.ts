import { apiRequest, type AccessTokenProvider } from './client';
import type { components } from './generated/schema';

export type AccountingTitleOption = components['schemas']['AccountingTitleOption'];
export type AccountingTitleOptionList = components['schemas']['AccountingTitleOptionListResponse'];
export type JournalLog = components['schemas']['JournalLogResponse'];
export type JournalLogList = components['schemas']['JournalLogListResponse'];
export type CreateJournalLogRequest = components['schemas']['CreateJournalLogRequest'];
export type UpdateJournalLogRequest = components['schemas']['UpdateJournalLogRequest'];

export type ListJournalLogsQuery = {
  property_id?: string;
  room_id?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
};

type ApiHelperOptions = {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
};

function journalLogPath(journalLogId: string) {
  return `/journal-logs/${encodeURIComponent(journalLogId)}`;
}

export function listJournalLogs(
  tokenProvider: AccessTokenProvider,
  query: ListJournalLogsQuery = {},
  options: ApiHelperOptions = {},
) {
  return apiRequest<JournalLogList>({
    path: '/journal-logs',
    query,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function getJournalLog(
  journalLogId: string,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<JournalLog>({
    path: journalLogPath(journalLogId),
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function createJournalLog(
  body: CreateJournalLogRequest,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<JournalLog>({
    method: 'POST',
    path: '/journal-logs',
    body,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function updateJournalLog(
  journalLogId: string,
  body: UpdateJournalLogRequest,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<JournalLog>({
    method: 'PATCH',
    path: journalLogPath(journalLogId),
    body,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function deleteJournalLog(
  journalLogId: string,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest({
    method: 'DELETE',
    path: journalLogPath(journalLogId),
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
    responseType: 'void',
  });
}

export function listJournalExpenseAccountingTitles(
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<AccountingTitleOptionList>({
    path: '/journal-expense-accounting-titles',
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}
