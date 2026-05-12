// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  ApiError,
  getBill,
  exportBillReceipt,
  listBills,
  listPropertyPendingMeters,
  listPropertyTenantLeaseRoster,
  openHtmlDocumentPreview,
  recordBillPayment,
  submitBillMeter,
  type BillingBill,
  type BillingBillList,
  type PropertyTenantLeaseRoster,
} from '../api';
import BillingMeterPage from './BillingMeterPage';

const previousMonthDate = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
const defaultHistoryYear = previousMonthDate.getFullYear();

const authMocks = vi.hoisted(() => ({
  currentUser: {
    id: 'user-1',
    email: 'ops@example.com',
    role: 'organizer',
    assigned_property_ids: ['property-1'],
  },
  getAccessToken: vi.fn(() => 'firebase-token'),
}));

vi.mock('@ant-design/icons', () => ({
  AuditOutlined: () => null,
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

  const formApi = {
    resetFields: vi.fn(),
    setFieldsValue: vi.fn(),
  };

  function FormComponent({
    children,
    onFinish,
  }: React.PropsWithChildren<{
    onFinish?: (values: Record<string, number | null | string | undefined>) => void;
  }>) {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          const reading = formData.get('current_reading');
          const paymentMethod = formData.get('payment_method');
          const values: Record<string, number | null | string | undefined> = {};

          if (event.currentTarget.elements.namedItem('current_reading')) {
            values.current_reading = reading === null || reading === '' ? null : Number(reading);
          }

          if (event.currentTarget.elements.namedItem('payment_method')) {
            if (paymentMethod === null || paymentMethod === '') {
              return;
            }

            values.payment_method = String(paymentMethod);
          }

          onFinish?.(values);
        }}
      >
        {children}
      </form>
    );
  }

  FormComponent.useForm = () => [formApi];
  FormComponent.Item = ({
    children,
    label,
    name,
  }: React.PropsWithChildren<{ label?: string; name?: string }>) => (
    <label>
      <span>{label}</span>
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
          name,
          'aria-label': label,
        })
        : children}
    </label>
  );

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
      htmlType,
      onClick,
      title,
      type,
    }: React.PropsWithChildren<{
      disabled?: boolean;
      htmlType?: 'submit';
      onClick?: () => void;
      title?: string;
      type?: string;
    }>) => (
      <button
        disabled={disabled}
        title={title}
        type={htmlType === 'submit' ? 'submit' : 'button'}
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
    Form: FormComponent,
    InputNumber: ({ 'aria-label': ariaLabel, name }: { 'aria-label'?: string; name?: string }) => (
      <input aria-label={ariaLabel} name={name} type="number" />
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
      name,
      onChange,
      options,
      value,
    }: {
      'aria-label'?: string;
      allowClear?: boolean;
      name?: string;
      onChange?: (value: string) => void;
      options?: Array<{ value: string; label: React.ReactNode }>;
      value?: string;
    }) => {
      const [internalValue, setInternalValue] = React.useState(value ?? '');

      return (
        <select
          aria-label={ariaLabel}
          name={name}
          value={value ?? internalValue}
          onChange={(event) => {
            setInternalValue(event.target.value);
            onChange?.(event.target.value);
          }}
        >
          <option value="">請選擇</option>
          {allowClear && <option value="">未選擇</option>}
          {options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    },
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
    Tabs: ({
      activeKey,
      items,
      onChange,
    }: {
      activeKey?: string;
      items?: Array<{ key: string; label: React.ReactNode; children: React.ReactNode }>;
      onChange?: (key: string) => void;
    }) => (
      <section>
        <div role="tablist">
          {items?.map((item) => (
            <button
              key={item.key}
              aria-selected={item.key === activeKey}
              role="tab"
              type="button"
              onClick={() => onChange?.(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {items?.find((item) => item.key === activeKey)?.children}
      </section>
    ),
    Tag: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
    Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
    Typography: {
      Paragraph: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
      Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
      Title: ({ children }: React.PropsWithChildren) => <h1>{children}</h1>,
    },
    message: {
      useMessage: () => [{ success: vi.fn() }, null],
    },
  };
});

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');

  return {
    ...actual,
    getBill: vi.fn(),
    listBills: vi.fn(),
    listPropertyPendingMeters: vi.fn(),
    listPropertyTenantLeaseRoster: vi.fn(),
    submitBillMeter: vi.fn(),
    recordBillPayment: vi.fn(),
    exportBillReceipt: vi.fn(),
    openHtmlDocumentPreview: vi.fn(),
  };
});

vi.mock('../auth', () => ({
  hasRole: (currentUser: typeof authMocks.currentUser | null, roles: string[]) => (
    Boolean(currentUser?.role && roles.includes(currentUser.role))
  ),
  useAuth: () => ({
    currentUser: authMocks.currentUser,
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
    status: 'pending_meter',
    amount: null,
    period_start: '2026-05-01',
    period_end: '2026-06-30',
    due_date: '2026-05-01',
    meter_previous_reading: 1250,
    meter_current_reading: null,
    meter_unit_price: 4.5,
    ...overrides,
  };
}

function createApiError(status: number, errorCode: string | null) {
  return new ApiError({
    status,
    errorCode,
    message: 'backend error',
    details: null,
    response: new Response(null, { status }),
  });
}

function mockPendingMeters(response: BillingBillList) {
  vi.mocked(listPropertyPendingMeters).mockResolvedValue(response);
}

function mockBills(response: BillingBillList = { data: [] }) {
  vi.mocked(listBills).mockResolvedValue(response);
}

function mockRoster(response: PropertyTenantLeaseRoster = {
  data: [
    {
      property_id: 'property-1',
      room_id: 'room-1',
      room_label: 'A-101',
      tenant_id: 'tenant-1',
      tenant_label: '王小明',
      lease_id: 'lease-1',
      start_date: '2026-05-01',
      end_date: '2026-06-30',
    },
  ],
}) {
  vi.mocked(listPropertyTenantLeaseRoster).mockResolvedValue(response);
}

function renderBillingPage(initialEntry: string | string[] = '/properties/property-1/billing') {
  function LocationProbe() {
    const location = useLocation();
    const navigate = useNavigate();

    return (
      <>
        <output aria-label="目前路徑">{`${location.pathname}${location.search}`}</output>
        <button type="button" onClick={() => navigate(-1)}>返回上一頁</button>
      </>
    );
  }

  return render(
    <MemoryRouter initialEntries={Array.isArray(initialEntry) ? initialEntry : [initialEntry]}>
      <LocationProbe />
      <Routes>
        <Route path="/properties/:propertyId/billing" element={<BillingMeterPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  authMocks.currentUser = {
    id: 'user-1',
    email: 'ops@example.com',
    role: 'organizer',
    assigned_property_ids: ['property-1'],
  };
});

beforeEach(() => {
  mockBills();
  mockRoster();
  vi.mocked(recordBillPayment).mockResolvedValue(createBill({ status: 'paid', amount: 18000 }));
  vi.mocked(exportBillReceipt).mockResolvedValue({
    html: '<!doctype html><title>收據</title>',
    contentType: 'text/html; charset=utf-8',
    contentDisposition: 'inline; filename="receipt.html"',
    filename: 'receipt.html',
  });
  vi.mocked(openHtmlDocumentPreview).mockReturnValue({ ok: true });
});

describe('BillingMeterPage', () => {
  it('loads property pending meters and opens bill detail from a row action', async () => {
    mockPendingMeters({ data: [createBill()] });
    vi.mocked(getBill).mockResolvedValue(createBill({ amount: null }));

    renderBillingPage('/properties/property-1/billing?roomId=room-1&leaseId=lease-1&flow=meter');

    await screen.findByText('A-101');
    expect(listPropertyPendingMeters).toHaveBeenCalledWith(
      'property-1',
      expect.any(Function),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getByText('已從其他頁面進入抄表與帳單')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '詳情' }));

    await waitFor(() => {
      expect(getBill).toHaveBeenCalledWith(
        'bill-1',
        expect.any(Function),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
    expect(screen.getByLabelText('目前路徑').textContent).toBe('/properties/property-1/billing?roomId=room-1&leaseId=lease-1&flow=meter&billId=bill-1');
    expect(await screen.findByText('帳單詳情')).toBeTruthy();
  });

  it('loads rent and electricity bills in the billing center list', async () => {
    mockPendingMeters({ data: [] });
    mockBills({
      data: [
        createBill({
          id: 'rent-bill-1',
          type: 'rent',
          status: 'pending_payment',
          amount: 18000,
          room_label: 'A-102',
          tenant_label: '林佳蓉',
        }),
      ],
    });

    renderBillingPage('/properties/property-1/billing?leaseId=lease-1&billType=rent');

    await waitFor(() => expect(screen.getAllByText('帳單處理').length).toBeGreaterThan(0));

    expect(listBills).toHaveBeenCalledWith(
      expect.any(Function),
      {
        property_id: 'property-1',
        lease_id: 'lease-1',
        type: 'rent',
        status: undefined,
        page: 1,
        limit: 20,
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    await waitFor(() => expect(screen.getAllByText('租金').length).toBeGreaterThan(0));
    expect(screen.getByText('A-102')).toBeTruthy();
    expect(screen.getByText('NT$18,000')).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '收款' }).disabled).toBe(false);
  });

  it('requires a visible payment method and submits the locked backend bill amount', async () => {
    mockPendingMeters({ data: [] });
    mockBills({
      data: [
        createBill({
          id: 'rent-bill-1',
          type: 'rent',
          status: 'pending_payment',
          amount: 18000,
        }),
      ],
    });

    renderBillingPage('/properties/property-1/billing?leaseId=lease-1&billType=rent');

    await screen.findByText('NT$18,000');
    fireEvent.click(screen.getByRole('button', { name: '收款' }));

    expect(await screen.findByLabelText('確認收款')).toBeTruthy();
    expect(screen.getByText('必填欄位')).toBeTruthy();
    expect(screen.getByText('收款方式為必填；收款金額固定使用後端帳單金額，不提供手動輸入。收款時間不需填寫，系統會以後端時間記錄。')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '確認收款' }));
    expect(recordBillPayment).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('收款方式（必填）'), { target: { value: 'transfer' } });
    fireEvent.click(screen.getByRole('button', { name: '確認收款' }));

    await waitFor(() => {
      expect(recordBillPayment).toHaveBeenCalledWith(
        'rent-bill-1',
        { payment_method: 'transfer', paid_amount: 18000 },
        expect.any(Function),
      );
    });
    await waitFor(() => expect(listBills).toHaveBeenCalledTimes(2));
  });

  it('opens the payment drawer from existing billId and view route state', async () => {
    mockPendingMeters({ data: [] });
    vi.mocked(getBill).mockResolvedValue(createBill({
      id: 'rent-bill-1',
      type: 'rent',
      status: 'pending_payment',
      amount: 18000,
    }));

    renderBillingPage('/properties/property-1/billing?leaseId=lease-1&billType=rent&billId=rent-bill-1&view=rent-payment');

    expect(await screen.findByLabelText('確認收款')).toBeTruthy();
    expect(screen.getAllByText('NT$18,000').length).toBeGreaterThan(0);
  });

  it('normalizes rent action deep links with bill id into the rent tab context', async () => {
    mockPendingMeters({ data: [] });
    vi.mocked(getBill).mockResolvedValue(createBill({
      id: 'rent-bill-1',
      type: 'rent',
      status: 'pending_payment',
      amount: 18000,
    }));

    renderBillingPage('/properties/property-1/billing?leaseId=lease-1&billId=rent-bill-1&view=rent-payment');

    await waitFor(() => {
      expect(screen.getByLabelText('目前路徑').textContent)
        .toBe('/properties/property-1/billing?leaseId=lease-1&billId=rent-bill-1&view=rent-payment&billType=rent');
    });
    await waitFor(() => {
      expect(listBills).toHaveBeenLastCalledWith(
        expect.any(Function),
        {
          property_id: 'property-1',
          lease_id: 'lease-1',
          type: 'rent',
          status: undefined,
          page: 1,
          limit: 20,
        },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
    expect(await screen.findByLabelText('確認收款')).toBeTruthy();
  });

  it('honors tenant and lease rent-payment entry routes without a bill id', async () => {
    mockPendingMeters({ data: [] });
    mockBills({
      data: [
        createBill({
          id: 'rent-bill-1',
          type: 'rent',
          status: 'pending_payment',
          amount: 18000,
        }),
      ],
    });

    renderBillingPage('/properties/property-1/billing?roomId=room-1&leaseId=lease-1&tenantId=tenant-1&view=rent-payment');

    await waitFor(() => {
      expect(screen.getByLabelText('目前路徑').textContent)
        .toBe('/properties/property-1/billing?roomId=room-1&leaseId=lease-1&tenantId=tenant-1&view=rent-payment&billType=rent');
    });
    await waitFor(() => {
      expect(listBills).toHaveBeenLastCalledWith(
        expect.any(Function),
        {
          property_id: 'property-1',
          lease_id: 'lease-1',
          type: 'rent',
          status: undefined,
          page: 1,
          limit: 20,
        },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
    expect(await screen.findByText('NT$18,000')).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '收款' }).disabled).toBe(false);
  });

  it('clears stale rent-payment action when selecting a plain bill detail', async () => {
    mockPendingMeters({ data: [] });
    mockBills({
      data: [
        createBill({
          id: 'rent-bill-1',
          type: 'rent',
          status: 'pending_payment',
          amount: 18000,
        }),
      ],
    });
    vi.mocked(getBill).mockResolvedValue(createBill({
      id: 'rent-bill-1',
      type: 'rent',
      status: 'pending_payment',
      amount: 18000,
    }));

    renderBillingPage('/properties/property-1/billing?leaseId=lease-1&view=rent-payment');

    await screen.findByText('NT$18,000');
    fireEvent.click(screen.getByRole('button', { name: '詳情' }));

    await waitFor(() => {
      expect(screen.getByLabelText('目前路徑').textContent)
        .toBe('/properties/property-1/billing?leaseId=lease-1&billType=rent&billId=rent-bill-1');
    });
    expect(await screen.findByLabelText('帳單詳情')).toBeTruthy();
    expect(screen.queryByLabelText('確認收款')).toBeNull();
  });

  it('clears consumed payment route actions when closing bill detail', async () => {
    mockPendingMeters({ data: [] });
    mockBills({
      data: [
        createBill({
          id: 'rent-bill-2',
          type: 'rent',
          status: 'paid',
          amount: 18000,
        }),
      ],
    });
    vi.mocked(getBill).mockResolvedValueOnce(createBill({
      id: 'rent-bill-1',
      type: 'rent',
      status: 'pending_payment',
      amount: 18000,
    }));

    renderBillingPage('/properties/property-1/billing?leaseId=lease-1&billType=rent&billId=rent-bill-1&view=rent-payment');

    expect(await screen.findByLabelText('確認收款')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '關閉' }));

    await waitFor(() => {
      expect(screen.getByLabelText('目前路徑').textContent)
        .toBe('/properties/property-1/billing?leaseId=lease-1&billType=rent');
    });

    vi.mocked(getBill).mockResolvedValueOnce(createBill({
      id: 'rent-bill-2',
      type: 'rent',
      status: 'paid',
      amount: 18000,
    }));
    fireEvent.click(screen.getByRole('button', { name: '詳情' }));

    await screen.findByLabelText('帳單詳情');
    expect(screen.queryByText('此帳單目前不能收款')).toBeNull();
    expect(screen.queryByLabelText('確認收款')).toBeNull();
  });

  it('allows the same payment deep link to run again after the action leaves the URL', async () => {
    mockPendingMeters({ data: [] });
    vi.mocked(getBill).mockResolvedValue(createBill({
      id: 'rent-bill-1',
      type: 'rent',
      status: 'pending_payment',
      amount: 18000,
    }));

    renderBillingPage([
      '/properties/property-1/billing?leaseId=lease-1&billId=rent-bill-1&view=rent-payment&billType=rent',
      '/properties/property-1/billing?leaseId=lease-1&billId=rent-bill-1&billType=rent',
    ]);

    expect(await screen.findByLabelText('帳單詳情')).toBeTruthy();
    expect(screen.queryByLabelText('確認收款')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '返回上一頁' }));

    expect(await screen.findByLabelText('確認收款')).toBeTruthy();
  });

  it('opens paid bill receipts through the runtime HTML helper', async () => {
    const previewWindow = {
      document: {
        open: vi.fn(),
        write: vi.fn(),
        close: vi.fn(),
      },
      focus: vi.fn(),
    };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(previewWindow as unknown as Window);
    mockPendingMeters({ data: [] });
    mockBills({
      data: [
        createBill({
          id: 'paid-bill-1',
          status: 'paid',
          amount: 18000,
        }),
      ],
    });

    renderBillingPage('/properties/property-1/billing?leaseId=lease-1');

    await screen.findByText('NT$18,000');
    fireEvent.click(screen.getByRole('button', { name: '收據' }));

    await waitFor(() => {
      expect(exportBillReceipt).toHaveBeenCalledWith('paid-bill-1', expect.any(Function));
      expect(openHtmlDocumentPreview).toHaveBeenCalledWith(
        expect.objectContaining({ html: '<!doctype html><title>收據</title>' }),
        previewWindow,
      );
    });
    openSpy.mockRestore();
  });

  it('switches billing flow tabs without refetching property queues', async () => {
    mockPendingMeters({ data: [] });

    renderBillingPage();

    await waitFor(() => expect(screen.getAllByText('請先選擇房間或租約').length).toBeGreaterThan(0));
    expect(listPropertyPendingMeters).toHaveBeenCalledTimes(1);
    expect(listPropertyTenantLeaseRoster).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('tab', { name: '全物業抄表 (0)' }));

    await waitFor(() => {
      expect(screen.getByLabelText('目前路徑').textContent).toBe('/properties/property-1/billing?flow=meter');
    });
    expect(listPropertyPendingMeters).toHaveBeenCalledTimes(1);
    expect(listPropertyTenantLeaseRoster).toHaveBeenCalledTimes(1);
    expect(listBills).not.toHaveBeenCalled();
  });

  it('routes the page-level meter history entry to the dedicated history page', async () => {
    mockPendingMeters({ data: [] });

    renderBillingPage('/properties/property-1/billing');

    await waitFor(() => expect(screen.getAllByText('帳單處理').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: '查看電表歷史' }));

    expect(screen.getByLabelText('目前路徑').textContent)
      .toBe(`/properties/property-1/billing/meter-history?year=${defaultHistoryYear}`);
  });

  it('routes bill detail room history to the selected bill period', async () => {
    mockPendingMeters({ data: [createBill()] });
    vi.mocked(getBill).mockResolvedValue(createBill({
      period_start: '2026-03-01',
      period_end: '2026-03-31',
      due_date: '2026-04-05',
    }));

    renderBillingPage('/properties/property-1/billing?flow=meter');

    await screen.findByText('A-101');
    fireEvent.click(screen.getByRole('button', { name: '詳情' }));
    await screen.findByLabelText('帳單詳情');

    fireEvent.click(screen.getByRole('button', { name: '查看此房間歷史' }));

    expect(screen.getByLabelText('目前路徑').textContent)
      .toBe('/properties/property-1/billing/meter-history?year=2026&roomId=room-1&month=3');
  });

  it('selects a lease without refetching the whole property meter queue', async () => {
    mockPendingMeters({ data: [] });
    mockBills({ data: [createBill({ id: 'electricity-bill-1' })] });

    renderBillingPage();

    await waitFor(() => expect(screen.getAllByText('請先選擇房間或租約').length).toBeGreaterThan(0));
    expect(listPropertyPendingMeters).toHaveBeenCalledTimes(1);
    expect(listBills).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('選擇房間或租約'), { target: { value: 'lease-1' } });

    await waitFor(() => {
      expect(listBills).toHaveBeenCalledWith(
        expect.any(Function),
        {
          property_id: 'property-1',
          lease_id: 'lease-1',
          type: 'electricity',
          status: undefined,
          page: 1,
          limit: 20,
        },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
    expect(screen.getByLabelText('目前路徑').textContent).toBe('/properties/property-1/billing?selectedLeaseId=lease-1');
    expect(listPropertyPendingMeters).toHaveBeenCalledTimes(1);
    expect(listPropertyTenantLeaseRoster).toHaveBeenCalledTimes(1);
  });

  it('submits one meter reading and refetches pending list plus bill detail', async () => {
    mockPendingMeters({ data: [createBill()] });
    vi.mocked(getBill).mockResolvedValue(createBill());
    vi.mocked(submitBillMeter).mockResolvedValue(createBill({
      status: 'pending_payment',
      amount: 585,
      meter_current_reading: 1380,
    }));

    renderBillingPage('/properties/property-1/billing?flow=meter');

    await screen.findByText('A-101');
    fireEvent.click(screen.getByRole('button', { name: '抄表' }));
    await screen.findByLabelText('本期電表度數（必填）');
    expect(screen.queryByLabelText('帳單詳情')).toBeNull();

    fireEvent.change(screen.getByLabelText('本期電表度數（必填）'), { target: { value: '1380' } });
    fireEvent.click(screen.getByRole('button', { name: '送出抄表' }));

    await waitFor(() => {
      expect(submitBillMeter).toHaveBeenCalledWith(
        'bill-1',
        { current_reading: 1380 },
        expect.any(Function),
      );
    });
    await waitFor(() => {
      expect(listPropertyPendingMeters).toHaveBeenCalledTimes(2);
      expect(getBill).not.toHaveBeenCalled();
    });
  });

  it('does not replace an unrelated open bill detail after queue meter submit succeeds', async () => {
    mockPendingMeters({
      data: [
        createBill({ id: 'bill-1', room_label: 'A-101' }),
        createBill({ id: 'bill-2', room_label: 'A-102', tenant_label: '林佳蓉' }),
      ],
    });
    vi.mocked(getBill).mockResolvedValue(createBill({
      id: 'bill-1',
      room_label: 'A-101',
      tenant_label: '王小明',
      amount: null,
    }));
    vi.mocked(submitBillMeter).mockResolvedValue(createBill({
      id: 'bill-2',
      room_label: 'A-102',
      tenant_label: '林佳蓉',
      status: 'pending_payment',
      amount: 585,
      meter_current_reading: 1380,
    }));

    renderBillingPage('/properties/property-1/billing?flow=meter&billId=bill-1');

    expect(await screen.findByLabelText('帳單詳情')).toBeTruthy();
    await waitFor(() => expect(getBill).toHaveBeenCalledTimes(1));
    const rows = await screen.findAllByRole('row');
    fireEvent.click(within(rows[1]).getByRole('button', { name: '抄表' }));
    fireEvent.change(await screen.findByLabelText('本期電表度數（必填）'), { target: { value: '1380' } });
    fireEvent.click(screen.getByRole('button', { name: '送出抄表' }));

    await waitFor(() => expect(screen.queryByLabelText('送出抄表')).toBeNull());
    expect(getBill).toHaveBeenCalledTimes(1);
    const detailDrawer = screen.getByLabelText('帳單詳情');
    expect(within(detailDrawer).getByText('A-101')).toBeTruthy();
    expect(within(detailDrawer).queryByText('林佳蓉')).toBeNull();
  });

  it('keeps meter validation errors visible in the submit drawer', async () => {
    mockPendingMeters({ data: [createBill()] });
    vi.mocked(getBill).mockResolvedValue(createBill());
    vi.mocked(submitBillMeter).mockRejectedValue(createApiError(422, 'METER_READING_LESS_THAN_PREVIOUS'));

    renderBillingPage('/properties/property-1/billing?flow=meter');

    await screen.findByText('A-101');
    fireEvent.click(screen.getByRole('button', { name: '抄表' }));
    fireEvent.change(await screen.findByLabelText('本期電表度數（必填）'), { target: { value: '1200' } });
    fireEvent.click(screen.getByRole('button', { name: '送出抄表' }));

    expect(await screen.findByText('本期度數不可小於上期度數，請確認後再送出。')).toBeTruthy();
  });

  it('keeps forbidden meter submit errors clear in the drawer', async () => {
    mockPendingMeters({ data: [createBill()] });
    vi.mocked(submitBillMeter).mockRejectedValue(createApiError(403, 'FORBIDDEN'));

    renderBillingPage('/properties/property-1/billing?flow=meter');

    await screen.findByText('A-101');
    fireEvent.click(screen.getByRole('button', { name: '抄表' }));
    fireEvent.change(await screen.findByLabelText('本期電表度數（必填）'), { target: { value: '1380' } });
    fireEvent.click(screen.getByRole('button', { name: '送出抄表' }));

    expect(await screen.findByText('沒有權限送出抄表')).toBeTruthy();
    expect(screen.getAllByText('目前角色或物業授權不可送出抄表，請確認登入帳號與物業權限。').length)
      .toBeGreaterThan(0);
    expect(screen.getByLabelText('送出抄表')).toBeTruthy();
  });

  it('closes the meter drawer and refreshes lists when submit returns not found', async () => {
    mockPendingMeters({ data: [createBill()] });
    vi.mocked(submitBillMeter).mockRejectedValue(createApiError(404, 'BILL_NOT_FOUND'));

    renderBillingPage('/properties/property-1/billing?flow=meter');

    await screen.findByText('A-101');
    fireEvent.click(screen.getByRole('button', { name: '抄表' }));
    fireEvent.change(await screen.findByLabelText('本期電表度數（必填）'), { target: { value: '1380' } });
    fireEvent.click(screen.getByRole('button', { name: '送出抄表' }));

    expect(await screen.findByText('找不到這張帳單')).toBeTruthy();
    expect(screen.getByText('帳單可能已被移除或狀態已變更，系統已重新整理清單。')).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByLabelText('送出抄表')).toBeNull();
      expect(listPropertyPendingMeters).toHaveBeenCalledTimes(2);
    });
  });

  it('keeps an unrelated open bill detail when queue meter submit returns not found', async () => {
    mockPendingMeters({
      data: [
        createBill({ id: 'bill-1', room_label: 'A-101' }),
        createBill({ id: 'bill-2', room_label: 'A-102', tenant_label: '林佳蓉' }),
      ],
    });
    vi.mocked(getBill).mockResolvedValue(createBill({
      id: 'bill-1',
      room_label: 'A-101',
      tenant_label: '王小明',
      amount: null,
    }));
    vi.mocked(submitBillMeter).mockRejectedValue(createApiError(404, 'BILL_NOT_FOUND'));

    renderBillingPage('/properties/property-1/billing?flow=meter&billId=bill-1');

    expect(await screen.findByLabelText('帳單詳情')).toBeTruthy();
    const rows = await screen.findAllByRole('row');
    fireEvent.click(within(rows[1]).getByRole('button', { name: '抄表' }));
    fireEvent.change(await screen.findByLabelText('本期電表度數（必填）'), { target: { value: '1380' } });
    fireEvent.click(screen.getByRole('button', { name: '送出抄表' }));

    expect(await screen.findByText('找不到這張帳單')).toBeTruthy();
    await waitFor(() => expect(screen.queryByLabelText('送出抄表')).toBeNull());
    const detailDrawer = screen.getByLabelText('帳單詳情');
    expect(within(detailDrawer).queryByText('找不到頁面或資料')).toBeNull();
    expect(within(detailDrawer).getByText('A-101')).toBeTruthy();
  });

  it('closes stale pending-row meter drawer and refreshes the queue on conflict', async () => {
    mockPendingMeters({ data: [createBill()] });
    vi.mocked(submitBillMeter).mockRejectedValue(createApiError(409, 'CONCURRENT_UPDATE_CONFLICT'));

    renderBillingPage('/properties/property-1/billing?flow=meter');

    await screen.findByText('A-101');
    fireEvent.click(screen.getByRole('button', { name: '抄表' }));
    fireEvent.change(await screen.findByLabelText('本期電表度數（必填）'), { target: { value: '1380' } });
    fireEvent.click(screen.getByRole('button', { name: '送出抄表' }));

    expect(await screen.findByText('資料已被更新')).toBeTruthy();
    expect(screen.getByText('系統已重新讀取最新帳單，請從更新後的清單重新開啟抄表。')).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByLabelText('送出抄表')).toBeNull();
      expect(listPropertyPendingMeters).toHaveBeenCalledTimes(2);
      expect(getBill).not.toHaveBeenCalled();
    });
  });

  it('keeps owner role in read-only bill view without loading the meter queue', async () => {
    authMocks.currentUser = {
      id: 'owner-1',
      email: 'owner@example.com',
      role: 'owner',
      assigned_property_ids: ['property-1'],
    };
    vi.mocked(listPropertyPendingMeters).mockRejectedValue(createApiError(403, 'FORBIDDEN'));
    mockBills({ data: [createBill()] });

    renderBillingPage('/properties/property-1/billing?leaseId=lease-1');

    expect(await screen.findByText('目前角色為查看模式')).toBeTruthy();
    await waitFor(() => expect(listPropertyPendingMeters).not.toHaveBeenCalled());
    expect(await screen.findByText('A-101')).toBeTruthy();
    expect(screen.getByText('目前角色為查看模式')).toBeTruthy();
    const row = screen.getByRole('row', { name: /A-101/ });
    expect(within(row).queryByRole('button', { name: '抄表' })).toBeNull();
    expect(within(row).getByRole<HTMLButtonElement>('button', { name: '收款' }).disabled).toBe(true);
  });

  it('renders a useful empty state when there are no pending meter bills', async () => {
    mockPendingMeters({ data: [] });

    renderBillingPage('/properties/property-1/billing?flow=meter');

    expect(await screen.findByText('目前沒有待抄表帳單')).toBeTruthy();
  });
});
