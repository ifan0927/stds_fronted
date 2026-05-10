// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Modal } from 'antd';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api';
import JournalPage from './JournalPage';

const apiMocks = vi.hoisted(() => ({
  assignRepairRequest: vi.fn(),
  cancelRepairRequest: vi.fn(),
  completeRepairRequest: vi.fn(),
  createJournalLog: vi.fn(),
  createRepairRequest: vi.fn(),
  deleteJournalLog: vi.fn(),
  getRepairRequest: vi.fn(),
  getJournalLog: vi.fn(),
  listRepairRequests: vi.fn(),
  listUsers: vi.fn(),
  listJournalExpenseAccountingTitles: vi.fn(),
  listJournalLogs: vi.fn(),
  listPropertyTenantLeaseRoster: vi.fn(),
  progressRepairRequest: vi.fn(),
  updateRepairRequest: vi.fn(),
  updateJournalLog: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  currentUser: { role: 'organizer' },
  getAccessToken: vi.fn(() => 'firebase-token'),
}));

vi.mock('@ant-design/icons', () => ({
  CheckOutlined: () => null,
  DeleteOutlined: () => null,
  EditOutlined: () => null,
  PlayCircleOutlined: () => null,
  PlusOutlined: () => null,
  ReloadOutlined: () => null,
  StopOutlined: () => null,
  ToolOutlined: () => null,
  UserSwitchOutlined: () => null,
}));

vi.mock('../auth', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');

  return {
    ...actual,
    assignRepairRequest: apiMocks.assignRepairRequest,
    cancelRepairRequest: apiMocks.cancelRepairRequest,
    completeRepairRequest: apiMocks.completeRepairRequest,
    createJournalLog: apiMocks.createJournalLog,
    createRepairRequest: apiMocks.createRepairRequest,
    deleteJournalLog: apiMocks.deleteJournalLog,
    getRepairRequest: apiMocks.getRepairRequest,
    getJournalLog: apiMocks.getJournalLog,
    listRepairRequests: apiMocks.listRepairRequests,
    listUsers: apiMocks.listUsers,
    listJournalExpenseAccountingTitles: apiMocks.listJournalExpenseAccountingTitles,
    listJournalLogs: apiMocks.listJournalLogs,
    listPropertyTenantLeaseRoster: apiMocks.listPropertyTenantLeaseRoster,
    progressRepairRequest: apiMocks.progressRepairRequest,
    updateRepairRequest: apiMocks.updateRepairRequest,
    updateJournalLog: apiMocks.updateJournalLog,
  };
});

function RouteProbe() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <>
      <span aria-label="目前路徑">{`${location.pathname}${location.search}`}</span>
      <button
        type="button"
        onClick={() => navigate('/properties/property-1/journal?tab=repair&roomId=room-1&repairRequestId=repair-2')}
      >
        切到第二維修
      </button>
      <button
        type="button"
        onClick={() => navigate('/properties/property-1/journal?tab=repair&roomId=room-1')}
      >
        清除維修詳情
      </button>
    </>
  );
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

function mockRepairData() {
  apiMocks.listRepairRequests.mockResolvedValue({
    data: [
      {
        id: 'repair-1',
        property_id: 'property-1',
        room_id: 'room-1',
        property_label: '台北大安物業',
        room_label: '201',
        submitted_by_label: '王小明',
        assigned_to_label: null,
        title: '浴室漏水',
        description: '天花板持續漏水',
        status: 'submitted',
        submitted_at: '2026-05-08T06:30:00Z',
        updated_at: '2026-05-08T06:30:00Z',
      },
    ],
    pagination: { page: 1, limit: 20, total: 1, total_pages: 1 },
  });
  apiMocks.getRepairRequest.mockResolvedValue({
    id: 'repair-1',
    property_id: 'property-1',
    room_id: 'room-1',
    property_label: '台北大安物業',
    room_label: '201',
    submitted_by_label: '王小明',
    assigned_to_label: null,
    title: '浴室漏水',
    description: '天花板持續漏水',
    status: 'submitted',
    submitted_at: '2026-05-08T06:30:00Z',
    updated_at: '2026-05-08T06:30:00Z',
  });
  apiMocks.listUsers.mockResolvedValue({
    data: [{ id: 'staff-1', name: '陳美芳', email: 'staff@example.com', role: 'staff' }],
    pagination: { page: 1, limit: 100, total: 1, total_pages: 1 },
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
    expect(screen.getByRole('radio', { name: '維修工作區' })).toBeTruthy();
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

  it('loads repair workspace from URL tab and keeps room context', async () => {
    mockJournalData();
    mockRepairData();

    renderJournalPage('/properties/property-1/journal?tab=repair&roomId=room-1&repair_status=submitted');

    await waitFor(() => {
      expect(apiMocks.listRepairRequests).toHaveBeenCalledWith(
        authMocks.getAccessToken,
        {
          property_id: 'property-1',
          room_id: 'room-1',
          status: 'submitted',
          assigned_to: undefined,
          page: 1,
          limit: 20,
        },
        expect.any(Object),
      );
    });

    expect(await screen.findByText('浴室漏水')).toBeTruthy();
    expect(screen.getByText('目前顯示 201 - 林怡君 的維修單；列表仍以後端回傳的房間標籤為準。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '派工' })).toBeTruthy();
  });

  it('opens repair detail when handoff includes repair request id', async () => {
    mockJournalData();
    mockRepairData();

    renderJournalPage('/properties/property-1/journal?roomId=room-1&repairRequestId=repair-1');

    await waitFor(() => {
      expect(apiMocks.getRepairRequest).toHaveBeenCalledWith(
        'repair-1',
        authMocks.getAccessToken,
        expect.any(Object),
      );
    });

    expect(await screen.findByText('維修詳情')).toBeTruthy();
    expect(screen.getByText('附件功能尚未開放')).toBeTruthy();
  });

  it('keeps repair detail drawer synchronized with repair request id changes in the URL', async () => {
    mockJournalData();
    apiMocks.listRepairRequests.mockResolvedValue({
      data: [
        {
          id: 'repair-1',
          property_id: 'property-1',
          room_id: 'room-1',
          property_label: '台北大安物業',
          room_label: '201',
          submitted_by_label: '王小明',
          assigned_to_label: null,
          title: '浴室漏水',
          description: '天花板持續漏水',
          status: 'submitted',
          submitted_at: '2026-05-08T06:30:00Z',
          updated_at: '2026-05-08T06:30:00Z',
        },
        {
          id: 'repair-2',
          property_id: 'property-1',
          room_id: 'room-1',
          property_label: '台北大安物業',
          room_label: '201',
          submitted_by_label: '陳美芳',
          assigned_to_label: '陳美芳',
          title: '冷氣無法啟動',
          description: '室內機無反應',
          status: 'assigned',
          submitted_at: '2026-05-09T06:30:00Z',
          updated_at: '2026-05-09T06:30:00Z',
        },
      ],
      pagination: { page: 1, limit: 20, total: 2, total_pages: 1 },
    });
    apiMocks.getRepairRequest.mockImplementation((repairId: string) => Promise.resolve(
      repairId === 'repair-2'
        ? {
          id: 'repair-2',
          property_id: 'property-1',
          room_id: 'room-1',
          property_label: '台北大安物業',
          room_label: '201',
          submitted_by_label: '陳美芳',
          assigned_to_label: '陳美芳',
          title: '冷氣無法啟動',
          description: '室內機無反應',
          status: 'assigned',
          submitted_at: '2026-05-09T06:30:00Z',
          updated_at: '2026-05-09T06:30:00Z',
        }
        : {
          id: 'repair-1',
          property_id: 'property-1',
          room_id: 'room-1',
          property_label: '台北大安物業',
          room_label: '201',
          submitted_by_label: '王小明',
          assigned_to_label: null,
          title: '浴室漏水',
          description: '天花板持續漏水',
          status: 'submitted',
          submitted_at: '2026-05-08T06:30:00Z',
          updated_at: '2026-05-08T06:30:00Z',
        },
    ));

    renderJournalPage('/properties/property-1/journal?tab=repair&roomId=room-1&repairRequestId=repair-1');

    expect(await screen.findByText('浴室漏水')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '切到第二維修' }));

    await waitFor(() => {
      expect(apiMocks.getRepairRequest).toHaveBeenCalledWith(
        'repair-2',
        authMocks.getAccessToken,
        expect.any(Object),
      );
    });
    expect(await screen.findByText('冷氣無法啟動')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '清除維修詳情' }));

    await waitFor(() => {
      expect(screen.getByLabelText('目前路徑').textContent).toBe('/properties/property-1/journal?tab=repair&roomId=room-1');
    });
  }, 20000);
});
