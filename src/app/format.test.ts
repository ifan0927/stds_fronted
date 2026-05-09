import { describe, expect, it } from 'vitest';
import {
  formatDashboardDateTime,
  formatPercent,
  formatTwd,
  getJournalTypeLabel,
} from './format';

describe('dashboard format helpers', () => {
  it('formats dashboard money and percentage values for operators', () => {
    expect(formatTwd(120000)).toBe('NT$120,000');
    expect(formatPercent(0.704)).toBe('70%');
  });

  it('formats dashboard timestamps in Asia/Taipei time', () => {
    expect(formatDashboardDateTime('2026-04-10T09:00:00Z')).toBe('2026/04/10 17:00');
  });

  it('maps backend journal types to stable Traditional Chinese labels', () => {
    expect(getJournalTypeLabel('journal_log')).toBe('一般日誌');
    expect(getJournalTypeLabel('repair_request')).toBe('維修紀錄');
  });
});
