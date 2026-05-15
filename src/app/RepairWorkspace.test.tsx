// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import RepairWorkspace from './RepairWorkspace';

const apiMocks = vi.hoisted(() => ({
  assignRepairRequest: vi.fn(),
  cancelRepairRequest: vi.fn(),
  completeRepairRequest: vi.fn(),
  createRepairRequest: vi.fn(),
  getRepairRequest: vi.fn(),
  listRepairRequests: vi.fn(),
  listUsers: vi.fn(),
  progressRepairRequest: vi.fn(),
  updateRepairRequest: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  currentUser: { role: 'organizer' },
  getAccessToken: vi.fn(() => 'firebase-token'),
}));

vi.mock('@ant-design/icons', () => ({
  CheckOutlined: () => null,
  EditOutlined: () => null,
  PlayCircleOutlined: () => null,
  PlusOutlined: () => null,
  ReloadOutlined: () => null,
  StopOutlined: () => null,
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
    createRepairRequest: apiMocks.createRepairRequest,
    getRepairRequest: apiMocks.getRepairRequest,
    listRepairRequests: apiMocks.listRepairRequests,
    listUsers: apiMocks.listUsers,
    progressRepairRequest: apiMocks.progressRepairRequest,
    updateRepairRequest: apiMocks.updateRepairRequest,
  };
});

vi.mock('./attachments', () => ({
  RepairAttachmentManager: ({
    repairRequestId,
    onMutationBusyChange,
  }: {
    repairRequestId: string;
    onMutationBusyChange?: (busy: boolean) => void;
  }) => (
    <section aria-label="維修附件" data-resource-id={repairRequestId}>
      <span>維修附件</span>
      <button type="button">選擇施工照片</button>
      <button type="button">選擇其他文件</button>
      <button type="button" onClick={() => onMutationBusyChange?.(true)}>
        模擬附件上傳中
      </button>
    </section>
  ),
}));

const roomRows = [
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
];

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

function renderRepairWorkspace(initialEntry = '/properties/property-1/journal?tab=repair&roomId=room-1') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <RouteProbe />
      <RepairWorkspace
        propertyId="property-1"
        roomId="room-1"
        roomRows={roomRows}
        roomOptionsLoading={false}
        onRoomContextRefetch={vi.fn()}
      />
    </MemoryRouter>,
  );
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
}

afterEach(() => {
  cleanup();
  Object.values(apiMocks).forEach((mock) => mock.mockReset());
  authMocks.currentUser = { role: 'organizer' };
  authMocks.getAccessToken.mockReset();
  authMocks.getAccessToken.mockReturnValue('firebase-token');
});

describe('RepairWorkspace', () => {
  it('loads repair workspace from URL tab and keeps room context', async () => {
    mockRepairData();

    renderRepairWorkspace('/properties/property-1/journal?tab=repair&roomId=room-1&repair_status=submitted');

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
    expect(screen.getByText('目前顯示 201 - 林怡君 的維修單；列表仍以最新房間資料為準。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '派工' })).toBeTruthy();
  });

  it('keeps attachment upload entry in the create flow after the repair is created', async () => {
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

    renderRepairWorkspace();

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
    expect(screen.getByLabelText('維修附件').getAttribute('data-resource-id')).toBe('repair-new');
  });

  it('shows attachment upload entry in the repair edit drawer', async () => {
    mockRepairData();

    renderRepairWorkspace();

    await screen.findByText('浴室漏水');
    fireEvent.click(screen.getByRole('button', { name: '編輯' }));

    expect(await screen.findByText('維修附件')).toBeTruthy();
    expect(screen.getByRole('button', { name: /選擇施工照片/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /選擇其他文件/ })).toBeTruthy();
    expect(screen.getByLabelText('維修附件').getAttribute('data-resource-id')).toBe('repair-1');
  });

  it('opens completion confirmation with attachment upload before completing repair', async () => {
    mockInProgressRepairData();

    renderRepairWorkspace();

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
  });

  it('keeps completion disabled while repair attachment upload is in progress', async () => {
    mockInProgressRepairData();

    renderRepairWorkspace();

    await screen.findByText('浴室漏水');
    fireEvent.click(screen.getByRole('button', { name: '完成' }));

    expect(await screen.findByText('完工前可先補齊施工照片')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '模擬附件上傳中' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '確認完成' }).hasAttribute('disabled')).toBe(true);
    });
    fireEvent.click(screen.getByRole('button', { name: '確認完成' }));

    expect(apiMocks.completeRepairRequest).not.toHaveBeenCalled();
  });

  it('opens repair detail when handoff includes repair request id', async () => {
    mockRepairData();

    renderRepairWorkspace('/properties/property-1/journal?roomId=room-1&repairRequestId=repair-1');

    await waitFor(() => {
      expect(apiMocks.getRepairRequest).toHaveBeenCalledWith(
        'repair-1',
        authMocks.getAccessToken,
        expect.any(Object),
      );
    });

    expect(await screen.findByText('維修詳情')).toBeTruthy();
    expect(screen.queryByText('附件功能尚未開放')).toBeNull();
    expect(screen.getByLabelText('維修附件').getAttribute('data-resource-id')).toBe('repair-1');
  });

  it('keeps repair detail drawer synchronized with repair request id changes in the URL', async () => {
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

    renderRepairWorkspace('/properties/property-1/journal?tab=repair&roomId=room-1&repairRequestId=repair-1');

    await waitFor(() => {
      expect(apiMocks.getRepairRequest).toHaveBeenCalledWith(
        'repair-1',
        authMocks.getAccessToken,
        expect.any(Object),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: '切到第二維修' }));

    await waitFor(() => {
      expect(apiMocks.getRepairRequest).toHaveBeenCalledWith(
        'repair-2',
        authMocks.getAccessToken,
        expect.any(Object),
      );
    });
    expect(apiMocks.getRepairRequest).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: '清除維修詳情' }));

    await waitFor(() => {
      expect(screen.getByLabelText('目前路徑').textContent).toBe('/properties/property-1/journal?tab=repair&roomId=room-1');
    });
  });
});
