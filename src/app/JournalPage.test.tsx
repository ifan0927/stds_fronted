// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Modal } from 'antd';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ApiError } from '../api';
import JournalPage from './JournalPage';

const apiMocks = vi.hoisted(() => ({
  createJournalLog: vi.fn(),
  deleteJournalLog: vi.fn(),
  getJournalLog: vi.fn(),
  listJournalExpenseAccountingTitles: vi.fn(),
  listJournalLogs: vi.fn(),
  listPropertyTenantLeaseRoster: vi.fn(),
  updateJournalLog: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  currentUser: { role: 'organizer' },
  getAccessToken: vi.fn(() => 'firebase-token'),
}));

vi.mock('@ant-design/icons', () => ({
  DeleteOutlined: () => null,
  EditOutlined: () => null,
  PlusOutlined: () => null,
  ReloadOutlined: () => null,
  ToolOutlined: () => null,
}));

vi.mock('../auth', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');

  return {
    ...actual,
    createJournalLog: apiMocks.createJournalLog,
    deleteJournalLog: apiMocks.deleteJournalLog,
    getJournalLog: apiMocks.getJournalLog,
    listJournalExpenseAccountingTitles: apiMocks.listJournalExpenseAccountingTitles,
    listJournalLogs: apiMocks.listJournalLogs,
    listPropertyTenantLeaseRoster: apiMocks.listPropertyTenantLeaseRoster,
    updateJournalLog: apiMocks.updateJournalLog,
  };
});

function RouteProbe() {
  const location = useLocation();

  return <span aria-label="目前路徑">{`${location.pathname}${location.search}`}</span>;
}

function renderJournalPage(initialEntry = '/properties/property-1/journal?roomId=room-1&date_from=2026-05-01&date_to=2026-05-31&page=2&limit=50') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <RouteProbe />
      <Routes>
        <Route path="/properties/:propertyId/journal" element={<JournalPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockJournalData() {
  apiMocks.listJournalLogs.mockResolvedValue({
    data: [
      {
        id: 'journal-1',
        property_id: 'property-1',
        room_id: 'room-1',
        property_label: '台北大安物業',
        room_label: '201',
        author_label: '王小明',
        content: '浴室漏水修繕',
        expense_amount: 3500,
        expense_accounting_title_id: 'title-1',
        expense_accounting_title_code: '6681',
        expense_accounting_title_name: '其他支出',
        created_at: '2026-05-08T06:30:00Z',
        updated_at: '2026-05-08T06:30:00Z',
      },
      {
        id: 'journal-2',
        property_id: 'property-1',
        room_id: 'room-1',
        property_label: '台北大安物業',
        room_label: '201',
        author_label: '陳美芳',
        content: '最新巡檢完成',
        expense_amount: null,
        created_at: '2026-05-09T02:00:00Z',
        updated_at: '2026-05-09T02:00:00Z',
      },
    ],
    pagination: { page: 2, limit: 50, total: 60, total_pages: 2 },
  });
  apiMocks.listJournalExpenseAccountingTitles.mockResolvedValue({
    data: [{ id: 'title-1', code: '6681', name: '其他支出', kind: 'expense' }],
  });
  apiMocks.listPropertyTenantLeaseRoster.mockResolvedValue({
    data: [
      {
        property_id: 'property-1',
        room_id: 'room-1',
        room_label: '201',
        room_status: 'occupied',
        tenant_id: 'tenant-1',
        tenant_label: '林怡君',
      },
      {
        property_id: 'property-1',
        room_id: 'room-2',
        room_label: '202',
        room_status: 'vacant',
        tenant_id: null,
        tenant_label: null,
      },
    ],
    pagination: { page: 1, limit: 100, total: 2, total_pages: 1 },
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.values(apiMocks).forEach((mock) => mock.mockReset());
  authMocks.currentUser = { role: 'organizer' };
  authMocks.getAccessToken.mockReset();
  authMocks.getAccessToken.mockReturnValue('firebase-token');
});

describe('JournalPage', () => {
  it('loads journal logs from route property and URL query filters', async () => {
    mockJournalData();

    renderJournalPage();

    await waitFor(() => {
      expect(apiMocks.listJournalLogs).toHaveBeenCalledWith(
        authMocks.getAccessToken,
        {
          property_id: 'property-1',
          room_id: 'room-1',
          date_from: '2026-05-01',
          date_to: '2026-05-31',
          page: 2,
          limit: 50,
        },
        expect.any(Object),
      );
    });

    expect(await screen.findByText('浴室漏水修繕')).toBeTruthy();
    expect(screen.getByText('最新巡檢完成').compareDocumentPosition(screen.getByText('浴室漏水修繕')))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByText('會計科目：6681 其他支出')).toBeTruthy();
    expect(screen.getByText('已套用房間篩選')).toBeTruthy();
    expect(screen.getByText('目前顯示 201 - 林怡君 的日誌；列表仍以後端回傳的房間標籤為準。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '維修工作區' })).toHaveProperty('disabled', true);
    expect(apiMocks.listPropertyTenantLeaseRoster).toHaveBeenCalledWith(
      'property-1',
      authMocks.getAccessToken,
      { include_vacant: true, page: 1, limit: 100 },
      expect.any(Object),
    );
  });

  it('clears room and date filters back to the property-scoped journal route', async () => {
    mockJournalData();

    renderJournalPage();

    await screen.findByText('浴室漏水修繕');
    fireEvent.click(screen.getByRole('button', { name: '清除篩選' }));

    await waitFor(() => {
      expect(screen.getByLabelText('目前路徑').textContent).toBe('/properties/property-1/journal');
    });
  });

  it('surfaces list delete conflicts on the page when the detail drawer is closed', async () => {
    mockJournalData();
    let confirmConfig: { onOk?: () => Promise<void> | void } | undefined;
    vi.spyOn(Modal, 'confirm').mockImplementation((config) => {
      confirmConfig = config as typeof confirmConfig;

      return {
        destroy: vi.fn(),
        update: vi.fn(),
      } as ReturnType<typeof Modal.confirm>;
    });
    apiMocks.deleteJournalLog.mockRejectedValue(new ApiError({
      status: 409,
      message: 'Journal expense belongs to a finalized monthly snapshot.',
      errorCode: 'JOURNAL_EXPENSE_SNAPSHOT_FINALIZED',
      details: null,
      response: new Response(null, { status: 409 }),
    }));

    renderJournalPage();

    await screen.findByText('浴室漏水修繕');
    fireEvent.click(screen.getAllByRole('button', { name: '刪除' })[0]);
    expect(confirmConfig).toBeTruthy();
    await confirmConfig?.onOk?.();

    expect(await screen.findByText('無法刪除日誌')).toBeTruthy();
    expect(screen.getByText('此日誌費用所屬月份已月結，不能改變會計影響。請重新載入確認最新狀態。')).toBeTruthy();
  });

  it('shows that existing expense journals cannot clear expense data in edit mode', async () => {
    mockJournalData();

    renderJournalPage();

    await screen.findByText('浴室漏水修繕');
    fireEvent.click(screen.getAllByRole('button', { name: '編輯' })[1]);

    expect(await screen.findByText('既有費用日誌可調整金額與科目，但不能在此清除費用。')).toBeTruthy();
    expect(screen.getByText('費用金額（必填）')).toBeTruthy();
    expect(screen.getByText('會計科目（必填）')).toBeTruthy();
  });
});
