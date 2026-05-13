// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  ApiError,
  createLease,
  createTenant,
  exportPropertyTenantRoster,
  getLease,
  getRoom,
  getTenant,
  listBills,
  listLeases,
  listPropertyTenantLeaseRoster,
  listTenants,
  openHtmlDocumentPreview,
  type PropertyTenantLeaseRoster,
} from '../api';
import TenantLeaseRosterPage from './TenantLeaseRosterPage';

const previousMonthDate = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
const defaultHistoryYear = previousMonthDate.getFullYear();
const defaultHistoryMonth = previousMonthDate.getMonth() + 1;

const authMocks = vi.hoisted(() => ({
  currentUser: {
    id: 'user-1',
    email: 'ops@example.com',
    role: 'organizer' as 'admin' | 'organizer' | 'staff' | 'owner',
    assigned_property_ids: ['property-1'],
  },
  getAccessToken: vi.fn(() => 'firebase-token'),
}));

vi.mock('@ant-design/icons', () => ({
  AuditOutlined: () => null,
  FileTextOutlined: () => null,
  HistoryOutlined: () => null,
  ReloadOutlined: () => null,
  SwapOutlined: () => null,
  TeamOutlined: () => null,
  ToolOutlined: () => null,
  WarningOutlined: () => null,
}));

vi.mock('antd', async () => {
  const React = await import('react');
  let currentForm: { values: Record<string, unknown> } | null = null;

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
      htmlType,
      loading,
      onClick,
      title,
    }: React.PropsWithChildren<{
      disabled?: boolean;
      htmlType?: 'button' | 'submit';
      loading?: boolean;
      onClick?: () => void;
      title?: string;
    }>) => (
      <button disabled={disabled || loading} title={title} onClick={onClick} type={htmlType ?? 'button'}>{children}</button>
    ),
    Card: ({ children, extra, title }: React.PropsWithChildren<{ extra?: React.ReactNode; title?: React.ReactNode }>) => (
      <section>
        {title && <h2>{title}</h2>}
        {extra}
        {children}
      </section>
    ),
    DatePicker: ({
      'aria-label': ariaLabel,
      name,
      onChange,
    }: {
      'aria-label'?: string;
      name?: string;
      onChange?: (value: { format: () => string }) => void;
    }) => (
      <input
        aria-label={ariaLabel ?? name}
        name={name}
        type="date"
        onChange={(event) => onChange?.({ format: () => event.target.value })}
      />
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
    message: {
      useMessage: () => [{ success: vi.fn(), error: vi.fn(), warning: vi.fn() }, null],
    },
    Form: Object.assign(
      ({
        children,
        form,
        onFinish,
      }: React.PropsWithChildren<{
        form?: {
          values: Record<string, unknown>;
        };
        onFinish?: (values: Record<string, unknown>) => void;
      }>) => {
        currentForm = form ?? null;

        return (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onFinish?.(form?.values ?? {});
            }}
          >
            {children}
          </form>
        );
      },
      {
        Item: ({
          children,
          label,
          name,
        }: React.PropsWithChildren<{ label?: React.ReactNode; name?: string }>) => (
          <label>
            {label && <span>{label}</span>}
            {name && React.isValidElement(children)
              ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
                name,
                onChange: (valueOrEvent: unknown) => {
                  if (!currentForm) {
                    return;
                  }

                  if (
                    typeof valueOrEvent === 'object'
                    && valueOrEvent !== null
                    && 'target' in valueOrEvent
                  ) {
                    const target = (valueOrEvent as { target: { value: string; type?: string } }).target;
                    currentForm.values[name] = target.type === 'number' ? Number(target.value) : target.value;
                    return;
                  }

                  currentForm.values[name] = valueOrEvent;
                },
              })
              : children}
          </label>
        ),
        useForm: () => {
          const formRef = React.useRef<{
            values: Record<string, unknown>;
            setFieldsValue: (values: Record<string, unknown>) => void;
          }>();

          if (!formRef.current) {
            const form = {
              values: {} as Record<string, unknown>,
              setFieldsValue: (values: Record<string, unknown>) => {
                Object.assign(form.values, values);
              },
            };
            formRef.current = form;
          }

          return [formRef.current];
        },
        useWatch: (name: string, form: { values: Record<string, unknown> }) => form.values[name],
      },
    ),
    Input: Object.assign(
      ({
        name,
        onChange,
        placeholder,
      }: {
        name?: string;
        onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
        placeholder?: string;
      }) => <input aria-label={name} name={name} onChange={onChange} placeholder={placeholder} />,
      {
        TextArea: ({ name, onChange }: { name?: string; onChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void }) => (
          <textarea aria-label={name} name={name} onChange={onChange} />
        ),
      },
    ),
    InputNumber: ({ name, onChange }: { name?: string; onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void }) => (
      <input aria-label={name} name={name} onChange={onChange} type="number" />
    ),
    Radio: Object.assign(
      ({ children }: React.PropsWithChildren) => <span>{children}</span>,
      {
        Button: ({ children, onClick, value }: React.PropsWithChildren<{ onClick?: () => void; value: string }>) => (
          <button onClick={onClick} type="button" value={value}>{children}</button>
        ),
        Group: ({ children, name }: React.PropsWithChildren<{ name?: string }>) => (
          <div>
            {React.Children.map(children, (child) => (
              React.isValidElement(child) && name
                ? React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
                  onClick: () => {
                    if (currentForm) {
                      currentForm.values[name] = (child.props as { value: string }).value;
                    }
                  },
                })
                : child
            ))}
          </div>
        ),
      },
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
      name,
      onChange,
      options,
      value,
    }: {
      'aria-label'?: string;
      name?: string;
      onChange?: (value: string | number) => void;
      options?: Array<{ value: string | number; label: React.ReactNode }>;
      value?: string | number;
    }) => (
      <select
        aria-label={ariaLabel}
        name={name}
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
    createLease: vi.fn(),
    createTenant: vi.fn(),
    exportPropertyTenantRoster: vi.fn(),
    getLease: vi.fn(),
    getRoom: vi.fn(),
    getTenant: vi.fn(),
    listBills: vi.fn(),
    listLeases: vi.fn(),
    listPropertyTenantLeaseRoster: vi.fn(),
    listTenants: vi.fn(),
    openHtmlDocumentPreview: vi.fn(),
  };
});

vi.mock('../auth', () => ({
  hasRole: (currentUser: typeof authMocks.currentUser | null, roles: Array<typeof authMocks.currentUser.role>) => (
    Boolean(currentUser?.role && roles.includes(currentUser.role))
  ),
  useAuth: () => ({
    currentUser: authMocks.currentUser,
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

function createApiError(status: number, errorCode: string | null = null) {
  return new ApiError({
    status,
    errorCode,
    message: 'error',
    details: null,
    response: new Response(null, { status }),
  });
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

  it('opens the move-in drawer from a vacant row and creates a lease for an existing tenant', async () => {
    mockRosterResponse({
      data: [{ room_id: 'room-2', room_label: '102 室', room_status: 'vacant' }],
      pagination: { page: 1, limit: 20, total: 1, total_pages: 1, has_next: false },
    });
    vi.mocked(getRoom).mockResolvedValue({
      id: 'room-2',
      property_id: 'property-1',
      name: '102 室',
      status: 'vacant',
      default_rent_amount: 18000,
      zone: 'A 棟',
    });
    vi.mocked(listTenants).mockResolvedValue({
      data: [{ id: 'tenant-1', name: '林家妤', phone: '0912-345-678' }],
    });
    vi.mocked(createLease).mockResolvedValue({
      id: 'lease-1',
      room_id: 'room-2',
      tenant_id: 'tenant-1',
      status: 'active',
    });

    renderTenantLeaseRosterPage('/properties/property-1/tenants?include_vacant=true');

    await screen.findByText('102 室');
    fireEvent.click(screen.getByRole('button', { name: '辦理入住' }));

    expect(await screen.findByText('空房入住')).toBeTruthy();
    expect(screen.getByText('既有租客（必填）')).toBeTruthy();
    expect(screen.getByText('租金（必填）')).toBeTruthy();
    expect(screen.getByText('租約開始（必填）')).toBeTruthy();
    expect(screen.getByText('租約結束（必填）')).toBeTruthy();
    expect(screen.getByText('押金（必填）')).toBeTruthy();
    expect(screen.getByText('起始電表讀數（必填）')).toBeTruthy();
    expect(screen.getByLabelText('start_date').getAttribute('type')).toBe('date');
    expect(screen.getByLabelText('end_date').getAttribute('type')).toBe('date');
    expect(getRoom).toHaveBeenCalledWith(
      'room-2',
      expect.any(Function),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(listTenants).toHaveBeenCalledWith(
      expect.any(Function),
      { property_id: 'property-1', page: 1, limit: 100 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getByLabelText('目前路徑').textContent).toContain('mode=move-in');
    expect(screen.getByLabelText('目前路徑').textContent).toContain('roomId=room-2');

    fireEvent.change(screen.getByLabelText('既有租客'), { target: { value: 'tenant-1' } });
    fireEvent.change(screen.getByLabelText('rent_amount'), { target: { value: '18000' } });
    fireEvent.change(screen.getByLabelText('租金週期'), { target: { value: 'monthly' } });
    fireEvent.change(screen.getByLabelText('start_date'), { target: { value: '2026-06-01' } });
    fireEvent.change(screen.getByLabelText('end_date'), { target: { value: '2027-05-31' } });
    fireEvent.change(screen.getByLabelText('deposit_amount'), { target: { value: '36000' } });
    fireEvent.change(screen.getByLabelText('電費週期'), { target: { value: 'monthly' } });
    fireEvent.change(screen.getByLabelText('starting_meter_reading'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: '建立租約' }));

    await waitFor(() => {
      expect(createLease).toHaveBeenCalledWith(
        {
          tenant_id: 'tenant-1',
          room_id: 'room-2',
          rent_amount: 18000,
          rent_billing_cadence: 'monthly',
          start_date: '2026-06-01',
          end_date: '2027-05-31',
          deposit_amount: 36000,
          electricity_billing_cadence: 'monthly',
          starting_meter_reading: 0,
          notes: null,
        },
        expect.any(Function),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
    expect(createTenant).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByLabelText('目前路徑').textContent).toBe('/properties/property-1/tenants?roomId=room-2&view=hub&leaseId=lease-1');
    });
  });

  it('surfaces stale room state when backend rejects move-in because the room is no longer vacant', async () => {
    mockRosterResponse({
      data: [{ room_id: 'room-2', room_label: '102 室', room_status: 'vacant' }],
      pagination: { page: 1, limit: 20, total: 1, total_pages: 1, has_next: false },
    });
    vi.mocked(getRoom).mockResolvedValue({
      id: 'room-2',
      property_id: 'property-1',
      name: '102 室',
      status: 'vacant',
    });
    vi.mocked(listTenants).mockResolvedValue({ data: [{ id: 'tenant-1', name: '林家妤' }] });
    vi.mocked(createLease).mockRejectedValue(createApiError(422, 'ROOM_NOT_VACANT'));

    renderTenantLeaseRosterPage('/properties/property-1/tenants?include_vacant=true&roomId=room-2&mode=move-in');

    fireEvent.change(await screen.findByLabelText('既有租客'), { target: { value: 'tenant-1' } });
    fireEvent.change(screen.getByLabelText('rent_amount'), { target: { value: '18000' } });
    fireEvent.change(screen.getByLabelText('start_date'), { target: { value: '2026-06-01' } });
    fireEvent.change(screen.getByLabelText('end_date'), { target: { value: '2027-05-31' } });
    fireEvent.change(screen.getByLabelText('deposit_amount'), { target: { value: '36000' } });
    fireEvent.change(screen.getByLabelText('starting_meter_reading'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: '建立租約' }));

    expect(await screen.findByText('房間狀態已變更，無法辦理入住。請重新整理房間與名冊後再確認。')).toBeTruthy();
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
    fireEvent.click(screen.getByRole('button', { name: '房間總覽' }));

    await screen.findByText('出租中房間總覽');
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
    expect(screen.getByRole('link', { name: /抄表歷史/ }).getAttribute('href'))
      .toBe(`/properties/property-1/billing/meter-history?roomId=room-1&year=${defaultHistoryYear}&month=${defaultHistoryMonth}`);
    expect(screen.getByRole('link', { name: /退租結算/ }).getAttribute('href')).toBe('/properties/property-1/tenants?roomId=room-1&leaseId=lease-1&tenantId=tenant-1&view=hub&mode=checkout');
    expect(screen.getByRole('link', { name: /租約更換/ }).getAttribute('href')).toBe('/properties/property-1/leases/lease-1/replace');
    expect(screen.getByRole('link', { name: /強制退租/ }).getAttribute('href')).toBe('/properties/property-1/tenants?roomId=room-1&leaseId=lease-1&tenantId=tenant-1&view=hub&mode=force');
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

  it('opens tenant roster HTML export with explicit params from the roster toolbar', async () => {
    mockRosterResponse({
      data: [{ room_id: 'room-1', room_label: '101 室', room_status: 'occupied', lease_id: 'lease-1' }],
      pagination: { page: 1, limit: 20, total: 1, total_pages: 1, has_next: false },
    });
    vi.mocked(exportPropertyTenantRoster).mockResolvedValue({
      html: '<!doctype html>',
      contentType: 'text/html; charset=utf-8',
      contentDisposition: null,
      filename: null,
    });
    vi.mocked(openHtmlDocumentPreview).mockReturnValue({ ok: true });
    vi.spyOn(window, 'open').mockReturnValue({
      close: vi.fn(),
      document: {
        close: vi.fn(),
        open: vi.fn(),
        write: vi.fn(),
      },
      focus: vi.fn(),
    } as unknown as Window);

    renderTenantLeaseRosterPage('/properties/property-1/tenants');

    await screen.findByText('101 室');
    fireEvent.click(screen.getByRole('button', { name: '匯出房客名冊' }));

    await waitFor(() => {
      expect(exportPropertyTenantRoster).toHaveBeenCalledWith(
        'property-1',
        expect.objectContaining({ include_vacant: true, format: 'html' }),
        authMocks.getAccessToken,
      );
      expect(openHtmlDocumentPreview).toHaveBeenCalled();
    });
  });

  it('shows a retryable tenant roster export error without exposing backend internals', async () => {
    mockRosterResponse({
      data: [{ room_id: 'room-1', room_label: '101 室', room_status: 'occupied', lease_id: 'lease-1' }],
      pagination: { page: 1, limit: 20, total: 1, total_pages: 1, has_next: false },
    });
    vi.mocked(exportPropertyTenantRoster).mockRejectedValue(createApiError(500, 'HTML_RENDER_FAILED'));
    vi.spyOn(window, 'open').mockReturnValue({
      close: vi.fn(),
      document: {
        close: vi.fn(),
        open: vi.fn(),
        write: vi.fn(),
      },
      focus: vi.fn(),
    } as unknown as Window);

    renderTenantLeaseRosterPage('/properties/property-1/tenants');

    await screen.findByText('101 室');
    fireEvent.click(screen.getByRole('button', { name: '匯出房客名冊' }));

    expect(await screen.findByText('房客名冊無法開啟')).toBeTruthy();
    expect(screen.getByText('系統暫時無法回應，請稍後重試。')).toBeTruthy();
    expect(screen.queryByText('HTML_RENDER_FAILED')).toBeNull();
  });
});
