// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  ApiError,
  getBill,
  listPropertyMeterHistory,
  listRoomMeterHistory,
  type BillingBill,
  type BillingBillList,
  type PropertyMeterHistory,
} from '../api';
import MeterHistoryPage from './MeterHistoryPage';

const previousMonthDate = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
const defaultHistoryYear = previousMonthDate.getFullYear();
const defaultHistoryMonth = previousMonthDate.getMonth() + 1;

const authMocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(() => 'firebase-token'),
}));

vi.mock('@ant-design/icons', () => ({
  ArrowLeftOutlined: () => null,
  EyeOutlined: () => null,
  HistoryOutlined: () => null,
  ReloadOutlined: () => null,
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
    Alert: ({ message, description }: { message?: React.ReactNode; description?: React.ReactNode }) => (
      <section>
        <strong>{message}</strong>
        <p>{description}</p>
      </section>
    ),
    Button: ({
      children,
      disabled,
      onClick,
      type,
    }: React.PropsWithChildren<{
      disabled?: boolean;
      onClick?: () => void;
      type?: string;
    }>) => (
      <button
        disabled={disabled}
        type="button"
        data-button-type={type}
        onClick={onClick}
      >
        {children}
      </button>
    ),
    Card: ({ children }: React.PropsWithChildren) => <section>{children}</section>,
    Descriptions: Object.assign(
      ({ children }: React.PropsWithChildren) => <dl>{children}</dl>,
      {
        Item: ({ label, children }: React.PropsWithChildren<{ label?: string }>) => (
          <div>
            <dt>{label}</dt>
            <dd>{children}</dd>
          </div>
        ),
      },
    ),
    Drawer: ({ children, footer, open, title }: React.PropsWithChildren<{
      footer?: React.ReactNode;
      open?: boolean;
      title?: string;
    }>) => open ? (
      <section aria-label={title}>
        <h2>{title}</h2>
        {children}
        {footer}
      </section>
    ) : null,
    Empty: ({ children, description }: React.PropsWithChildren<{ description?: React.ReactNode }>) => (
      <div>
        {description}
        {children}
      </div>
    ),
    Result: ({ title, subTitle, extra }: { title?: React.ReactNode; subTitle?: React.ReactNode; extra?: React.ReactNode }) => (
      <section>
        <h1>{title}</h1>
        <p>{subTitle}</p>
        {extra}
      </section>
    ),
    Select: ({
      'aria-label': ariaLabel,
      allowClear,
      onChange,
      options,
      value,
    }: {
      'aria-label'?: string;
      allowClear?: boolean;
      onChange?: (value?: number | string) => void;
      options?: Array<{ value: number | string; label: React.ReactNode }>;
      value?: number | string;
    }) => (
      <select
        aria-label={ariaLabel}
        value={value ?? ''}
        onChange={(event) => {
          const rawValue = event.target.value;
          onChange?.(rawValue && Number.isNaN(Number(rawValue)) ? rawValue : Number(rawValue));
        }}
      >
        {allowClear && <option value="">全部月份</option>}
        {options?.map((option) => (
          <option key={option.value} value={option.value}>
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
      rowKey,
    }: {
      columns: Column[];
      dataSource: Array<Record<string, unknown>>;
      locale?: { emptyText?: React.ReactNode };
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
    getBill: vi.fn(),
    listPropertyMeterHistory: vi.fn(),
    listRoomMeterHistory: vi.fn(),
  };
});

vi.mock('../auth', () => ({
  useAuth: () => ({
    getAccessToken: authMocks.getAccessToken,
  }),
}));

function createBill(overrides: Partial<BillingBill> = {}): BillingBill {
  return {
    id: 'bill-1',
    property_id: 'property-1',
    room_id: 'room-1',
    lease_id: 'lease-1',
    tenant_id: 'tenant-1',
    property_label: '大安物業',
    room_label: 'A-101',
    tenant_label: '王小明',
    period_label: '2026-05 ~ 2026-06',
    type: 'electricity',
    status: 'paid',
    amount: 650,
    period_start: '2026-05-01',
    period_end: '2026-06-30',
    due_date: '2026-05-01',
    meter_previous_reading: 1250,
    meter_current_reading: 1380,
    meter_unit_price: 5,
    meter_recorded_at: '2026-05-05T10:00:00Z',
    ...overrides,
  };
}

function createApiError(status: number, errorCode: string | null = null) {
  return new ApiError({
    status,
    errorCode,
    message: 'backend error',
    details: null,
    response: new Response(null, { status }),
  });
}

function mockPropertyHistory(response: PropertyMeterHistory = {
  data: [{
    bill_id: 'bill-1',
    property_id: 'property-1',
    room_id: 'room-1',
    room_label: 'A-101',
    tenant_id: 'tenant-1',
    tenant_label: '王小明',
    lease_id: 'lease-1',
    period_start: '2026-04-01',
    period_end: '2026-04-30',
    period_label: '2026-04',
    due_date: '2026-04-01',
    previous_reading: 1250,
    current_reading: 1380,
    usage: 130,
    unit_price: 5,
    amount: 650,
    status: 'paid',
    meter_recorded_at: '2026-04-05T10:00:00Z',
  }],
}) {
  vi.mocked(listPropertyMeterHistory).mockResolvedValue(response);
}

function mockRoomHistory(response: BillingBillList = { data: [createBill()] }) {
  vi.mocked(listRoomMeterHistory).mockResolvedValue(response);
}

function renderMeterHistoryPage(initialEntry = `/properties/property-1/billing/meter-history?year=${defaultHistoryYear}&month=${defaultHistoryMonth}`) {
  function LocationProbe() {
    const location = useLocation();

    return <output aria-label="目前路徑">{`${location.pathname}${location.search}`}</output>;
  }

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationProbe />
      <Routes>
        <Route path="/properties/:propertyId/billing/meter-history" element={<MeterHistoryPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function getCurrentSearchParams() {
  const currentPath = screen.getByLabelText('目前路徑').textContent ?? '';
  const query = currentPath.split('?')[1] ?? '';

  return new URLSearchParams(query);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  mockPropertyHistory();
  mockRoomHistory();
  vi.mocked(getBill).mockResolvedValue(createBill());
});

describe('MeterHistoryPage', () => {
  it('loads property meter history from the dedicated endpoint and opens read-only bill detail', async () => {
    renderMeterHistoryPage('/properties/property-1/billing/meter-history?year=2026');

    expect(await screen.findByText('物業電表歷史')).toBeTruthy();
    expect(listPropertyMeterHistory).toHaveBeenCalledWith(
      'property-1',
      { year: 2026 },
      expect.any(Function),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getAllByText('A-101').length).toBeGreaterThan(0);
    expect(screen.getByText('NT$650')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '帳單詳情' }));

    await waitFor(() => expect(getBill).toHaveBeenCalledWith(
      'bill-1',
      expect.any(Function),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ));
    expect(screen.getByLabelText('目前路徑').textContent?.startsWith('/properties/property-1/billing/meter-history?')).toBe(true);
    expect(getCurrentSearchParams().get('year')).toBe('2026');
    expect(getCurrentSearchParams().get('month')).toBeNull();
    expect(getCurrentSearchParams().get('billId')).toBe('bill-1');
    expect(listPropertyMeterHistory).toHaveBeenCalledTimes(1);
    const drawer = await screen.findByLabelText('帳單詳情');
    expect(within(drawer).getByText('唯讀帳單檢視')).toBeTruthy();
    expect(within(drawer).queryByText('抄表')).toBeNull();
    expect(within(drawer).queryByText('收款')).toBeNull();
  });

  it('defaults property history to the full year without sending month to the backend', async () => {
    renderMeterHistoryPage('/properties/property-1/billing/meter-history');

    expect(await screen.findByText('物業電表歷史')).toBeTruthy();
    expect(listPropertyMeterHistory).toHaveBeenCalledWith(
      'property-1',
      { year: defaultHistoryYear },
      expect.any(Function),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getByLabelText<HTMLSelectElement>('月份').value).toBe('all');
    expect(screen.getAllByText('A-101').length).toBeGreaterThan(0);
  });

  it('redirects to login when opening bill detail with an expired session', async () => {
    vi.mocked(getBill).mockRejectedValue(createApiError(401, 'INVALID_FIREBASE_TOKEN'));

    renderMeterHistoryPage('/properties/property-1/billing/meter-history?year=2026');

    await screen.findAllByText('A-101');
    fireEvent.click(screen.getByRole('button', { name: '帳單詳情' }));

    await waitFor(() => {
      expect(screen.getByLabelText('目前路徑').textContent)
        .toBe('/login?reason=session-expired&returnTo=%2Fproperties%2Fproperty-1%2Fbilling%2Fmeter-history%3Fyear%3D2026%26billId%3Dbill-1');
    });
  });

  it('filters property history rows by selected month in the UI', async () => {
    renderMeterHistoryPage('/properties/property-1/billing/meter-history?year=2026&month=5');

    expect(await screen.findByText('目前沒有電表歷史')).toBeTruthy();
    expect(listPropertyMeterHistory).toHaveBeenCalledWith(
      'property-1',
      { year: 2026 },
      expect.any(Function),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.queryByText('A-101')).toBeNull();

    fireEvent.change(screen.getByLabelText('月份'), { target: { value: '4' } });

    await waitFor(() => {
      expect(screen.getByLabelText('目前路徑').textContent).toBe('/properties/property-1/billing/meter-history?year=2026&month=4');
    });
    expect((await screen.findAllByText('A-101')).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('月份'), { target: { value: 'all' } });

    await waitFor(() => {
      expect(screen.getByLabelText('目前路徑').textContent).toBe('/properties/property-1/billing/meter-history?year=2026');
    });
    expect(screen.getAllByText('A-101').length).toBeGreaterThan(0);
  });

  it('loads room meter history with year and month query params', async () => {
    renderMeterHistoryPage('/properties/property-1/billing/meter-history?roomId=room-1&year=2026&month=5');

    expect(await screen.findByText('房間電表歷史')).toBeTruthy();
    expect(screen.getByLabelText('月份').querySelector('option[value="all"]')).toBeNull();
    expect(listRoomMeterHistory).toHaveBeenCalledWith(
      'room-1',
      { year: 2026, month: 5 },
      expect.any(Function),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(listPropertyMeterHistory).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('月份'), { target: { value: '4' } });

    await waitFor(() => {
      expect(screen.getByLabelText('目前路徑').textContent).toBe('/properties/property-1/billing/meter-history?roomId=room-1&year=2026&month=4');
    });
  });

  it('defaults room history to the previous month when month is not in the URL', async () => {
    renderMeterHistoryPage('/properties/property-1/billing/meter-history?roomId=room-1');

    expect(await screen.findByText('房間電表歷史')).toBeTruthy();
    expect(listRoomMeterHistory).toHaveBeenCalledWith(
      'room-1',
      { year: defaultHistoryYear, month: defaultHistoryMonth },
      expect.any(Function),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('normalizes missing room history year and month into URL before loading', async () => {
    renderMeterHistoryPage('/properties/property-1/billing/meter-history?roomId=room-1');

    await waitFor(() => {
      expect(screen.getByLabelText('目前路徑').textContent)
        .toBe(`/properties/property-1/billing/meter-history?roomId=room-1&year=${defaultHistoryYear}&month=${defaultHistoryMonth}`);
    });
    await waitFor(() => {
      expect(listRoomMeterHistory).toHaveBeenCalledWith(
        'room-1',
        { year: defaultHistoryYear, month: defaultHistoryMonth },
        expect.any(Function),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });

  it('switches from property history row into room history without a typed URL', async () => {
    renderMeterHistoryPage('/properties/property-1/billing/meter-history?year=2026');

    await screen.findAllByText('A-101');
    fireEvent.click(screen.getByRole('button', { name: '房間歷史' }));

    await waitFor(() => {
      expect(getCurrentSearchParams().get('roomId')).toBe('room-1');
    });
    expect(getCurrentSearchParams().get('year')).toBe('2026');
    expect(getCurrentSearchParams().get('month')).toBe('4');
    await waitFor(() => {
      expect(listRoomMeterHistory).toHaveBeenCalledWith(
        'room-1',
        { year: 2026, month: 4 },
        expect.any(Function),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });

  it('renders a useful empty state for room history', async () => {
    mockRoomHistory({ data: [] });

    renderMeterHistoryPage('/properties/property-1/billing/meter-history?roomId=room-1&year=2026&month=5');

    expect(await screen.findByText('此房間目前沒有符合條件的電表紀錄')).toBeTruthy();
    expect(screen.getByRole('link', { name: '回房間詳情' }).getAttribute('href')).toBe('/properties/property-1/rooms/room-1');
  });
});
