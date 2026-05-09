// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ApiError, listPropertyRooms, type RoomList } from '../api';
import RoomInventoryPage from './RoomInventoryPage';

const authMocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(() => 'firebase-token'),
}));

vi.mock('@ant-design/icons', () => ({
  AuditOutlined: () => null,
  EyeOutlined: () => null,
  PlusOutlined: () => null,
  ReloadOutlined: () => null,
  TeamOutlined: () => null,
  ToolOutlined: () => null,
}));

vi.mock('antd', async () => {
  const React = await import('react');

  type Column = {
    title?: string;
    dataIndex?: string;
    key?: string;
    render?: (value: unknown, record: Record<string, unknown>) => React.ReactNode;
  };

  function getCellValue(record: Record<string, unknown>, dataIndex: string | undefined) {
    return dataIndex ? record[dataIndex] : undefined;
  }

  return {
    Button: ({ children, onClick, title }: React.PropsWithChildren<{ onClick?: () => void; title?: string }>) => (
      <button title={title} onClick={onClick} type="button">{children}</button>
    ),
    Card: ({ children }: React.PropsWithChildren) => <section>{children}</section>,
    Empty: ({ description }: { description?: React.ReactNode }) => <div>{description}</div>,
    Result: ({ title, subTitle, extra }: { title?: React.ReactNode; subTitle?: React.ReactNode; extra?: React.ReactNode }) => (
      <section>
        <h1>{title}</h1>
        <p>{subTitle}</p>
        {extra}
      </section>
    ),
    Select: ({
      'aria-label': ariaLabel,
      onChange,
      options,
      value,
    }: {
      'aria-label'?: string;
      onChange?: (value: string | number) => void;
      options?: Array<{ value: string | number; label: React.ReactNode }>;
      value?: string | number;
    }) => (
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => {
          const selected = options?.find((option) => String(option.value) === event.target.value);
          onChange?.(selected?.value ?? event.target.value);
        }}
      >
        {options?.map((option) => (
          <option key={String(option.value)} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ),
    Space: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Spin: () => <span>載入中</span>,
    Table: ({
      columns,
      dataSource,
      locale,
      onChange,
      pagination,
      rowKey,
    }: {
      columns: Column[];
      dataSource: Array<Record<string, unknown>>;
      locale?: { emptyText?: React.ReactNode };
      onChange?: (pagination: { current?: number; pageSize?: number }) => void;
      pagination?: { current?: number; pageSize?: number; total?: number };
      rowKey?: (record: Record<string, unknown>) => string;
    }) => (
      <div>
        {dataSource.length === 0 ? locale?.emptyText : (
          <table>
            <tbody>
              {dataSource.map((record) => (
                <tr key={rowKey?.(record) ?? String(record.id)}>
                  {columns.map((column) => (
                    <td key={column.key ?? column.dataIndex ?? column.title}>
                      {column.render
                        ? column.render(getCellValue(record, column.dataIndex), record)
                        : String(getCellValue(record, column.dataIndex) ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {pagination && (pagination.total ?? 0) > (pagination.pageSize ?? 20) && (
          <button
            title="下一頁"
            type="button"
            onClick={() => onChange?.({
              current: (pagination.current ?? 1) + 1,
              pageSize: pagination.pageSize,
            })}
          >
            下一頁
          </button>
        )}
      </div>
    ),
    Tag: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
    Typography: {
      Paragraph: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
      Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
      Title: ({ children }: React.PropsWithChildren) => <h1>{children}</h1>,
    },
  };
});

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');

  return {
    ...actual,
    listPropertyRooms: vi.fn(),
  };
});

vi.mock('../auth', () => ({
  useAuth: () => ({
    getAccessToken: authMocks.getAccessToken,
  }),
}));

function createApiError(status: number) {
  return new ApiError({
    status,
    message: 'Backend error.',
    errorCode: null,
    details: null,
    response: new Response(null, { status }),
  });
}

function renderRoomInventoryPage(initialEntry = '/properties/property-1/rooms') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/properties/:propertyId/rooms" element={<RoomInventoryPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockRoomsResponse(response: RoomList) {
  vi.mocked(listPropertyRooms).mockResolvedValue(response);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RoomInventoryPage', () => {
  it('loads rooms from route and URL query state, then renders row action routes', async () => {
    mockRoomsResponse({
      data: [
        {
          id: 'room-1',
          property_id: 'property-1',
          name: '101 室',
          status: 'vacant',
          size: 8.5,
          floor: '1F',
          room_type: '套房',
          zone: 'A 區',
          default_rent_amount: 18000,
          notes: '可安排帶看。',
        },
      ],
      pagination: {
        page: 2,
        limit: 50,
        total: 80,
        total_pages: 2,
        has_next: false,
      },
    });

    renderRoomInventoryPage('/properties/property-1/rooms?status=vacant&page=2&limit=50');

    await screen.findByText('101 室');

    expect(listPropertyRooms).toHaveBeenCalledWith(
      'property-1',
      expect.any(Function),
      { status: 'vacant', page: 2, limit: 50 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getByText('房型：套房')).toBeTruthy();
    expect(screen.getByText('8.5 坪 / 1F / A 區')).toBeTruthy();

    const row = screen.getByRole('row', { name: /101 室/ });
    expect(within(row).getByRole('link', { name: '查看' }).getAttribute('href')).toBe(
      '/properties/property-1/rooms/room-1',
    );
    expect(within(row).getByRole('link', { name: '搬入' }).getAttribute('href')).toBe(
      '/properties/property-1/tenants?roomId=room-1&mode=move-in',
    );
    expect(within(row).getByRole('link', { name: '帳單' }).getAttribute('href')).toBe(
      '/properties/property-1/billing?roomId=room-1',
    );
    expect(within(row).getByRole('link', { name: '日誌維修' }).getAttribute('href')).toBe(
      '/properties/property-1/journal?roomId=room-1',
    );
  });

  it('updates query-backed filters and pagination through backend-supported params', async () => {
    mockRoomsResponse({
      data: [{ id: 'room-1', name: '101 室', status: 'occupied' }],
      pagination: {
        page: 1,
        limit: 20,
        total: 40,
        total_pages: 2,
        has_next: true,
      },
    });

    renderRoomInventoryPage('/properties/property-1/rooms');

    await screen.findByText('101 室');
    fireEvent.change(screen.getByLabelText('房況'), { target: { value: 'occupied' } });

    await waitFor(() => {
      expect(listPropertyRooms).toHaveBeenLastCalledWith(
        'property-1',
        expect.any(Function),
        { status: 'occupied', page: 1, limit: 20 },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    fireEvent.click(screen.getByTitle('下一頁'));

    await waitFor(() => {
      expect(listPropertyRooms).toHaveBeenLastCalledWith(
        'property-1',
        expect.any(Function),
        { status: 'occupied', page: 2, limit: 20 },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });

  it('shows an actionable empty state when the backend returns no rooms', async () => {
    mockRoomsResponse({
      data: [],
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
        total_pages: 1,
        has_next: false,
      },
    });

    renderRoomInventoryPage('/properties/property-1/rooms');

    expect(await screen.findByText('目前沒有可顯示的房間。')).toBeTruthy();
  });

  it.each([
    { status: 403, title: '沒有權限查看此頁' },
    { status: 404, title: '找不到頁面或資料' },
    { status: 500, title: '頁面載入失敗' },
  ])('maps backend $status failures to distinct route states', async ({ status, title }) => {
    vi.mocked(listPropertyRooms).mockRejectedValue(createApiError(status));

    renderRoomInventoryPage('/properties/property-1/rooms');

    expect(await screen.findByText(title)).toBeTruthy();
  });
});
