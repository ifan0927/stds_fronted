import type { HomeDashboard } from '../api/dashboard';

type RecentJournalType = HomeDashboard['recent_journals'][number]['type'];

const journalTypeLabels: Record<RecentJournalType, string> = {
  journal_log: '一般日誌',
  repair_request: '維修紀錄',
};

const dateTimeFormatter = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const numberFormatter = new Intl.NumberFormat('zh-TW');

export function formatTwd(amount: number) {
  return `NT$${numberFormatter.format(amount)}`;
}

export function formatPercent(rate: number) {
  return `${Math.round(rate * 100)}%`;
}

export function formatDashboardDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '時間未提供';
  }

  return dateTimeFormatter.format(date).replace(/\s+/g, ' ');
}

export function getJournalTypeLabel(type: RecentJournalType) {
  return journalTypeLabels[type];
}
