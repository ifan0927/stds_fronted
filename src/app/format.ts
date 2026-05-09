import type { HomeDashboard } from '../api/dashboard';
import type { PropertyDashboard } from '../api/properties';

type RecentJournalType = HomeDashboard['recent_journals'][number]['type'];
type PropertyDashboardRoomStatus = NonNullable<PropertyDashboard['rooms']>[number]['status'];

const journalTypeLabels: Record<RecentJournalType, string> = {
  journal_log: '一般日誌',
  repair_request: '維修紀錄',
};

const roomStatusLabels: Record<NonNullable<PropertyDashboardRoomStatus>, string> = {
  vacant: '空房',
  occupied: '出租中',
  maintenance: '維修中',
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

export function getReadableJournalTypeLabel(type: string | undefined) {
  if (type === 'journal_log' || type === 'repair_request') {
    return journalTypeLabels[type];
  }

  return '日誌';
}

export function getRoomStatusLabel(status: PropertyDashboardRoomStatus) {
  return status ? roomStatusLabels[status] : '未提供';
}
