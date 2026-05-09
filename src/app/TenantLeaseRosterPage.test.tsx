// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  getLease,
  getTenant,
  listBills,
  listLeases,
  listPropertyTenantLeaseRoster,
  type PropertyTenantLeaseRoster,
} from '../api';
import TenantLeaseRosterPage from './TenantLeaseRosterPage';

const authMocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(() => 'firebase-token'),
}));

vi.mock('@ant-design/icons', () => ({
  AuditOutlined: () => null,
  FileTextOutlined: () => null,
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

  function Descriptions({ children }: React.PropsWithChildren) {
    return <dl>{children}</dl>;
  }

  Descriptions.Item = ({ label, children }: React.PropsWithChildren<{ label?: React.ReactNode }>) => (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );

  return {
    Alert: ({
      action,
      description,
      message,
    }: {
      action?: React.ReactNode;
      description?: React.ReactNode;
      message?: React.ReactNode;
    }) => (
      <section>
        <h2>{message}</h2>
        <p>{description}</p>
        {action}
      </section>
    ),
    Button: ({
      children,
      disabled,
      onClick,
      title,
    }: React.PropsWithChildren<{ disabled?: boolean; onClick?: () => void; title?: string }>) => (
      <button disabled={disabled} title={title} onClick={onClick} type="button">{children}</button>
    ),
    Card: ({ children, extra, title }: React.PropsWithChildren<{ extra?: React.ReactNode; title?: React.ReactNode }>) => (
      <section>
        {title && <h2>{title}</h2>}
        {extra}
        {children}
      </section>
    ),
    Descriptions,
    Drawer: ({ children, extra, title }: React.PropsWithChildren<{ extra?: React.ReactNode; title?: React.ReactNode }>) => (
      <aside>
        {title && <h2>{title}</h2>}
        {extra}
        {children}
      </aside>
    ),
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
    Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
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
    getLease: vi.fn(),
    getTenant: vi.fn(),
    listBills: vi.fn(),
    listLeases: vi.fn(),
    listPropertyTenantLeaseRoster: vi.fn(),
  };
});

vi.mock('../auth', () => ({
  useAuth: () => ({
    getAccessToken: authMocks.getAccessToken,
  }),
}));

function renderTenantLeaseRosterPage(initialEntry = '/properties/property-1/tenants') {
  function LocationProbe() {
    const location = useLocation();

    return <output aria-label="目前路徑">{`${location.pathname}${location.search}`}</output>;
  }

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationProbe />
      <Routes>
        <Route path="/properties/:propertyId/tenants" element={<TenantLeaseRosterPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockRosterResponse(response: PropertyTenantLeaseRoster) {
  vi.mocked(listPropertyTenantLeaseRoster).mockResolvedValue(response);
}

function mockRosterError(error: unknown) {
  vi.mocked(listPropertyTenantLeaseRoster).mockRejectedValue(error);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TenantLeaseRosterPage', () => {
  it('loads roster from route and URL query state', async () => {
    mockRosterResponse({
      data: [
        {
          property_id: 'property-1',
          room_id: 'room-1',
          room_label: '101 室',
          room_status: 'occupied',
          lease_id: 'lease-1',
          lease_status: 'active',
          tenant_id: 'tenant-1',
          tenant_label: '林家妤',
          tenant_phone: '0912-345-678',
          rent_amount: 18000,
          rent_billing_cadence: 'monthly',
          deposit_amount: 36000,
          deposit_status: 'held',
          next_rent_due_date: '2026-06-01',
          next_rent_status: 'pending_payment',
          notes: '續約提醒',
        },
      ],
      pagination: { page: 2, limit: 50, total: 80, total_pages: 2, has_next: false },
    });

    renderTenantLeaseRosterPage('/properties/property-1/tenants?include_vacant=true&page=2&limit=50');

    await screen.findAllByText('101 室');

    expect(listPropertyTenantLeaseRoster).toHaveBeenCalledWith(
      'property-1',
      expect.any(Function),
      { include_vacant: true, page: 2, limit: 50 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getByText('林家妤')).toBeTruthy();
    expect(screen.getByText('NT$18,000')).toBeTruthy();
    expect(screen.getByText('續約提醒')).toBeTruthy();
  });

  it('shows an empty state when the roster has no occupied leases', async () => {
    mockRosterResponse({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, total_pages: 1, has_next: false },
    });

    renderTenantLeaseRosterPage('/properties/property-1/tenants');

    expect(await screen.findByText('目前沒有出租中的租客租約資料。')).toBeTruthy();
  });

  it('shows a retryable error state when the roster cannot load', async () => {
    mockRosterError(new Error('network failed'));

    renderTenantLeaseRosterPage('/properties/property-1/tenants');

    expect(await screen.findByText('頁面載入失敗')).toBeTruthy();
    expect(screen.getByRole('button', { name: '重試' })).toBeTruthy();
  });

  it('keeps include_vacant and pagination backed by URL query', async () => {
    mockRosterResponse({
      data: [{ room_id: 'room-1', room_label: '101 室', room_status: 'occupied' }],
      pagination: { page: 1, limit: 20, total: 40, total_pages: 2, has_next: true },
    });

    renderTenantLeaseRosterPage('/properties/property-1/tenants');

    await screen.findAllByText('101 室');
    fireEvent.change(screen.getByLabelText('顯示空房'), { target: { value: 'true' } });

    await waitFor(() => {
      expect(listPropertyTenantLeaseRoster).toHaveBeenLastCalledWith(
        'property-1',
        expect.any(Function),
        { include_vacant: true, page: 1, limit: 20 },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    fireEvent.click(screen.getByTitle('下一頁'));

    await waitFor(() => {
      expect(screen.getByLabelText('目前路徑').textContent).toContain('include_vacant=true');
      expect(screen.getByLabelText('目前路徑').textContent).toContain('page=2');
    });
  });

  it('opens the move-in placeholder from a vacant row without implementing the flow', async () => {
    mockRosterResponse({
      data: [{ room_id: 'room-2', room_label: '102 室', room_status: 'vacant' }],
      pagination: { page: 1, limit: 20, total: 1, total_pages: 1, has_next: false },
    });

    renderTenantLeaseRosterPage('/properties/property-1/tenants?include_vacant=true');

    await screen.findByText('102 室');
    fireEvent.click(screen.getByRole('button', { name: '辦理入住' }));

    expect(await screen.findByText('辦理入住入口已保留')).toBeTruthy();
    expect(screen.getByLabelText('目前路徑').textContent).toContain('mode=move-in');
    expect(screen.getByLabelText('目前路徑').textContent).toContain('roomId=room-2');
  });

  it('loads occupied room hub from roster row context', async () => {
    mockRosterResponse({
      data: [{
        room_id: 'room-1',
        room_label: '101 室',
        room_status: 'occupied',
        lease_id: 'lease-1',
        lease_status: 'active',
        tenant_id: 'tenant-1',
        tenant_label: '林家妤',
        tenant_phone: '0912-345-678',
        rent_amount: 18000,
        rent_billing_cadence: 'monthly',
        deposit_amount: 36000,
        deposit_status: 'held',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
      }],
      pagination: { page: 1, limit: 20, total: 1, total_pages: 1, has_next: false },
    });
    vi.mocked(listLeases).mockResolvedValue({ data: [{ id: 'lease-1', room_id: 'room-1', tenant_id: 'tenant-1', status: 'active' }] });
    vi.mocked(getLease).mockResolvedValue({
      id: 'lease-1',
      room_id: 'room-1',
      room_label: '101 室',
      tenant_id: 'tenant-1',
      tenant_label: '林家妤',
      status: 'active',
      rent_amount: 18000,
      rent_billing_cadence: 'monthly',
      deposit_amount: 36000,
      deposit_status: 'held',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
    });
    vi.mocked(getTenant).mockResolvedValue({ id: 'tenant-1', name: '林家妤', phone: '0912-345-678' });
    vi.mocked(listBills).mockResolvedValue({
      data: [{ id: 'bill-1', lease_id: 'lease-1', type: 'rent', amount: 18000, due_date: '2026-06-01', status: 'pending_payment' }],
    });

    renderTenantLeaseRosterPage('/properties/property-1/tenants');

    await screen.findAllByText('101 室');
    fireEvent.click(screen.getByRole('button', { name: '進入 Hub' }));

    await screen.findByText('出租中房間 Hub');
    await screen.findByText('租金帳單摘要');

    expect(listLeases).not.toHaveBeenCalled();
    expect(getLease).not.toHaveBeenCalled();
    expect(getTenant).not.toHaveBeenCalled();
    expect(listBills).toHaveBeenCalledWith(
      expect.any(Function),
      { lease_id: 'lease-1', type: 'rent', page: 1, limit: 5 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getAllByText('林家妤').length).toBeGreaterThan(0);
    expect(screen.getAllByText('NT$18,000').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /租客詳情/ }).getAttribute('href')).toBe('/properties/property-1/tenants/tenant-1?roomId=room-1&leaseId=lease-1');
    expect(screen.getByRole('link', { name: /租約詳情/ }).getAttribute('href')).toBe('/properties/property-1/leases/lease-1?roomId=room-1&tenantId=tenant-1');
    expect(screen.getByRole('link', { name: /收款與收據/ }).getAttribute('href')).toBe('/properties/property-1/billing?roomId=room-1&leaseId=lease-1&tenantId=tenant-1&view=rent-payment');
    expect(screen.getByRole('link', { name: /退租處理/ }).getAttribute('href')).toBe('/properties/property-1/checkout?roomId=room-1&leaseId=lease-1&tenantId=tenant-1');
  });

  it('corrects stale URL lease id to the roster active lease before loading bills', async () => {
    mockRosterResponse({
      data: [{
        room_id: 'room-1',
        room_label: '101 室',
        room_status: 'occupied',
        lease_id: 'new-lease',
        lease_status: 'active',
        tenant_id: 'tenant-1',
        tenant_label: '林家妤',
      }],
      pagination: { page: 1, limit: 20, total: 1, total_pages: 1, has_next: false },
    });
    vi.mocked(listBills).mockResolvedValue({ data: [] });

    renderTenantLeaseRosterPage('/properties/property-1/tenants?roomId=room-1&view=hub&leaseId=old-lease');

    await screen.findAllByText('101 室');

    await waitFor(() => {
      expect(screen.getByLabelText('目前路徑').textContent).toBe('/properties/property-1/tenants?roomId=room-1&view=hub&leaseId=new-lease');
    });
    await waitFor(() => {
      expect(listBills).toHaveBeenCalledWith(
        expect.any(Function),
        { lease_id: 'new-lease', type: 'rent', page: 1, limit: 5 },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
    expect(listBills).not.toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ lease_id: 'old-lease' }),
      expect.anything(),
    );
  });

  it('shows a recoverable warning when an occupied room has no active lease', async () => {
    mockRosterResponse({
      data: [{ room_id: 'room-1', room_label: '101 室', room_status: 'occupied' }],
      pagination: { page: 1, limit: 20, total: 1, total_pages: 1, has_next: false },
    });
    vi.mocked(listLeases).mockResolvedValue({ data: [] });

    renderTenantLeaseRosterPage('/properties/property-1/tenants?roomId=room-1&view=hub');

    await screen.findByText('101 室');
    expect(await screen.findByText('房間狀態與租約資料不一致')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '辦理入住' })).toBeNull();
  });

  it('routes row actions to existing placeholder pages instead of orphan pages', async () => {
    mockRosterResponse({
      data: [{ room_id: 'room-1', room_label: '101 室', room_status: 'occupied', lease_id: 'lease-1' }],
      pagination: { page: 1, limit: 20, total: 1, total_pages: 1, has_next: false },
    });

    renderTenantLeaseRosterPage('/properties/property-1/tenants');

    await screen.findByText('101 室');
    const row = screen.getByRole('row', { name: /101 室/ });

    fireEvent.click(within(row).getByRole('button', { name: '帳單' }));
    expect(screen.getByLabelText('目前路徑').textContent).toBe('/properties/property-1/billing?roomId=room-1&leaseId=lease-1');
  });
});
