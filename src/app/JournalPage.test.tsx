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
  createAttachmentUploadUrl: vi.fn(),
  createJournalLog: vi.fn(),
  createRepairRequest: vi.fn(),
  deleteJournalLog: vi.fn(),
  getRepairRequest: vi.fn(),
  getJournalLog: vi.fn(),
  listRepairRequestAttachments: vi.fn(),
  listRepairRequests: vi.fn(),
  listUsers: vi.fn(),
  listJournalExpenseAccountingTitles: vi.fn(),
  listJournalLogs: vi.fn(),
  listPropertyTenantLeaseRoster: vi.fn(),
  progressRepairRequest: vi.fn(),
  registerRepairRequestAttachment: vi.fn(),
  updateRepairRequest: vi.fn(),
  updateJournalLog: vi.fn(),
  uploadAttachmentFile: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  currentUser: { role: 'organizer' },
  getAccessToken: vi.fn(() => 'firebase-token'),
}));

vi.mock('@ant-design/icons', () => ({
  CheckOutlined: () => null,
  DeleteOutlined: () => null,
  DownloadOutlined: () => null,
  EditOutlined: () => null,
  EyeOutlined: () => null,
  PaperClipOutlined: () => null,
  PlayCircleOutlined: () => null,
  PlusOutlined: () => null,
  ReloadOutlined: () => null,
  StopOutlined: () => null,
  ToolOutlined: () => null,
  UploadOutlined: () => null,
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
    createAttachmentUploadUrl: apiMocks.createAttachmentUploadUrl,
    createJournalLog: apiMocks.createJournalLog,
    createRepairRequest: apiMocks.createRepairRequest,
    deleteJournalLog: apiMocks.deleteJournalLog,
    getRepairRequest: apiMocks.getRepairRequest,
    getJournalLog: apiMocks.getJournalLog,
    listRepairRequestAttachments: apiMocks.listRepairRequestAttachments,
    listRepairRequests: apiMocks.listRepairRequests,
    listUsers: apiMocks.listUsers,
    listJournalExpenseAccountingTitles: apiMocks.listJournalExpenseAccountingTitles,
    listJournalLogs: apiMocks.listJournalLogs,
    listPropertyTenantLeaseRoster: apiMocks.listPropertyTenantLeaseRoster,
    progressRepairRequest: apiMocks.progressRepairRequest,
    registerRepairRequestAttachment: apiMocks.registerRepairRequestAttachment,
    updateRepairRequest: apiMocks.updateRepairRequest,
    updateJournalLog: apiMocks.updateJournalLog,
    uploadAttachmentFile: apiMocks.uploadAttachmentFile,
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
  apiMocks.listRepairRequestAttachments.mockResolvedValue({
    data: [
      {
        id: 'attachment-1',
        object_path: 'gs://private-bucket/attachments/repairs/repair-1/before.jpg',
        file_name: '施工前.jpg',
        uploaded_by: 'user-1',
        created_at: '2026-05-11T10:00:00Z',
        sort_order: 1,
        photo_stage: 'before',
      },
    ],
  });
}

function mockInProgressRepairData() {
  apiMocks.listRepairRequests.mockResolvedValue({
    data: [
      {
        id: 'repair-1',
        property_id: 'property-1',
        room_id: 'room-1',
        property_label: '台北大安物業',
        room_label: '201',
        submitted_by_label: '王小明',
        assigned_to_label: '陳美芳',
        title: '浴室漏水',
        description: '天花板持續漏水',
        status: 'in_progress',
        submitted_at: '2026-05-08T06:30:00Z',
        assigned_at: '2026-05-08T07:00:00Z',
        updated_at: '2026-05-08T07:30:00Z',
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
    assigned_to_label: '陳美芳',
    title: '浴室漏水',
    description: '天花板持續漏水',
    status: 'in_progress',
    submitted_at: '2026-05-08T06:30:00Z',
    assigned_at: '2026-05-08T07:00:00Z',
    updated_at: '2026-05-08T07:30:00Z',
  });
  apiMocks.completeRepairRequest.mockResolvedValue({
    id: 'repair-1',
    property_id: 'property-1',
    room_id: 'room-1',
    property_label: '台北大安物業',
    room_label: '201',
    submitted_by_label: '王小明',
    assigned_to_label: '陳美芳',
    title: '浴室漏水',
    description: '天花板持續漏水',
    status: 'completed',
    submitted_at: '2026-05-08T06:30:00Z',
    assigned_at: '2026-05-08T07:00:00Z',
    completed_at: '2026-05-08T08:00:00Z',
    updated_at: '2026-05-08T08:00:00Z',
  });
  apiMocks.listUsers.mockResolvedValue({
    data: [{ id: 'staff-1', name: '陳美芳', email: 'staff@example.com', role: 'staff' }],
    pagination: { page: 1, limit: 100, total: 1, total_pages: 1 },
  });
  apiMocks.listRepairRequestAttachments.mockResolvedValue({ data: [] });
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
  }, 10000);

  it('keeps attachment upload entry in the create flow after the repair is created', async () => {
    mockJournalData();
    mockRepairData();
    apiMocks.createRepairRequest.mockResolvedValue({
      id: 'repair-new',
      property_id: 'property-1',
      room_id: 'room-1',
      property_label: '台北大安物業',
      room_label: '201',
      submitted_by_label: '王小明',
      assigned_to_label: null,
      title: '新增漏水',
      description: '新增維修描述',
      status: 'submitted',
      submitted_at: '2026-05-11T10:00:00Z',
      updated_at: '2026-05-11T10:00:00Z',
    });

    renderJournalPage('/properties/property-1/journal?tab=repair&roomId=room-1');

    await screen.findByText('浴室漏水');
    fireEvent.click(screen.getByRole('button', { name: '新增維修' }));
    expect(await screen.findByText('建立後可立即上傳附件')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('維修標題（必填）'), { target: { value: '新增漏水' } });
    fireEvent.change(screen.getByLabelText('問題描述（必填）'), { target: { value: '新增維修描述' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存並重新載入' }));

    await waitFor(() => {
      expect(apiMocks.createRepairRequest).toHaveBeenCalled();
    });
    expect(await screen.findByText('維修附件')).toBeTruthy();
    expect(screen.getByRole('button', { name: /選擇施工照片/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /選擇其他文件/ })).toBeTruthy();
    expect(screen.getByLabelText('目前路徑').textContent).toBe('/properties/property-1/journal?tab=repair&roomId=room-1');
    expect(screen.queryByRole('dialog', { name: '維修詳情' })).toBeNull();
    expect(apiMocks.listRepairRequestAttachments).toHaveBeenCalledWith(
      'repair-new',
      authMocks.getAccessToken,
      expect.any(Object),
    );
  }, 20000);

  it('shows attachment upload entry in the repair edit drawer', async () => {
    mockJournalData();
    mockRepairData();

    renderJournalPage('/properties/property-1/journal?tab=repair&roomId=room-1');

    await screen.findByText('浴室漏水');
    fireEvent.click(screen.getByRole('button', { name: '編輯' }));

    expect(await screen.findByText('維修附件')).toBeTruthy();
    expect(screen.getByRole('button', { name: /選擇施工照片/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /選擇其他文件/ })).toBeTruthy();
    expect(apiMocks.listRepairRequestAttachments).toHaveBeenCalledWith(
      'repair-1',
      authMocks.getAccessToken,
      expect.any(Object),
    );
  });

  it('opens completion confirmation with attachment upload before completing repair', async () => {
    mockJournalData();
    mockInProgressRepairData();

    renderJournalPage('/properties/property-1/journal?tab=repair&roomId=room-1');

    await screen.findByText('浴室漏水');
    fireEvent.click(screen.getByRole('button', { name: '完成' }));

    expect(await screen.findByText('完工前可先補齊施工照片')).toBeTruthy();
    expect(screen.getByText('維修附件')).toBeTruthy();
    expect(screen.getByRole('button', { name: /選擇施工照片/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '確認完成' }));

    await waitFor(() => {
      expect(apiMocks.completeRepairRequest).toHaveBeenCalledWith(
        'repair-1',
        authMocks.getAccessToken,
      );
    });
  }, 20000);

  it('keeps completion disabled while repair attachment upload is in progress', async () => {
    mockJournalData();
    mockInProgressRepairData();
    apiMocks.createAttachmentUploadUrl.mockResolvedValue({
      upload_url: 'https://storage.example/upload-photo?signature=masked',
      nonce: 'nonce-photo',
      expires_at: '2026-05-11T10:00:00Z',
    });
    apiMocks.uploadAttachmentFile.mockReturnValue(new Promise(() => undefined));

    renderJournalPage('/properties/property-1/journal?tab=repair&roomId=room-1');

    await screen.findByText('浴室漏水');
    fireEvent.click(screen.getByRole('button', { name: '完成' }));

    expect(await screen.findByText('完工前可先補齊施工照片')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /選擇施工照片/ }));
    fireEvent.change(screen.getByLabelText('選擇施工照片'), {
      target: { files: [new File(['image bytes'], '施工後.jpg', { type: 'image/jpeg' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: /確認上傳施工照片/ }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '確認完成' }).hasAttribute('disabled')).toBe(true);
    });
    fireEvent.click(screen.getByRole('button', { name: '確認完成' }));

    expect(apiMocks.completeRepairRequest).not.toHaveBeenCalled();
  }, 20000);

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
    expect(screen.queryByText('附件功能尚未開放')).toBeNull();
    expect(await screen.findByText('施工前.jpg')).toBeTruthy();
    expect(apiMocks.listRepairRequestAttachments).toHaveBeenCalledWith(
      'repair-1',
      authMocks.getAccessToken,
      expect.any(Object),
    );
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
    apiMocks.listRepairRequestAttachments.mockResolvedValue({ data: [] });

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
  }, 40000);
});
