// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  ApiError,
  exportLeaseCheckoutSettlement,
  finalizeLeaseCheckoutSettlement,
  forceTerminateLease,
  getLease,
  listLeaseCheckoutReviews,
  openHtmlDocumentPreview,
  previewLeaseCheckoutSettlement,
  type CheckoutSettlementResponse,
  type Lease,
  type LeaseCheckoutReviewList,
} from '../api';
import CheckoutSettlementPage from './CheckoutSettlementPage';

const authMocks = vi.hoisted(() => ({
  currentUser: {
    id: 'user-1',
    email: 'ops@example.com',
    role: 'organizer',
    assigned_property_ids: ['property-1'],
  },
  getAccessToken: vi.fn(() => 'firebase-token'),
}));

const formMocks = vi.hoisted(() => ({
  values: {} as Record<string, unknown>,
  getFieldsValue: vi.fn(() => formMocks.values),
  resetFields: vi.fn(() => {
    formMocks.values = {
      cleaning_fee: 0,
      key_card_loss_fee: 0,
      other_fee: 0,
      manual_rent_refund_amount: 0,
    };
  }),
  setFieldsValue: vi.fn((values: Record<string, unknown>) => {
    formMocks.values = { ...formMocks.values, ...values };
  }),
  setFields: vi.fn((fields: Array<{ name: string; errors: string[] }>) => {
    fields.forEach((field) => {
      formMocks.values[`error:${field.name}`] = field.errors.join(' ');
    });
  }),
}));

vi.mock('@ant-design/icons', () => ({
  AuditOutlined: () => null,
  ExportOutlined: () => null,
  FileTextOutlined: () => null,
  ReloadOutlined: () => null,
  WarningOutlined: () => null,
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

  function FormComponent({
    children,
    onFinish,
    onValuesChange,
  }: React.PropsWithChildren<{
    onFinish?: (values: Record<string, number | string | null | undefined>) => void;
    onValuesChange?: () => void;
  }>) {
    const getStoredValue = (name: string) => {
      const value = formMocks.values[name];

      if (value && typeof value === 'object' && 'format' in value) {
        const formattedValue = value as { format?: (format: string) => string };

        if (typeof formattedValue.format === 'function') {
          return formattedValue.format('YYYY-MM-DD');
        }
      }

      return value;
    };

    const getStringValue = (formData: FormData, name: string) => {
      const submitted = formData.get(name);

      if (submitted !== null && submitted !== '') {
        return String(submitted);
      }

      const stored = getStoredValue(name);

      return stored === null || stored === undefined ? '' : String(stored);
    };

    const getNumber = (formData: FormData, name: string) => {
      const submitted = formData.get(name);

      if (submitted !== null && submitted !== '') {
        return Number(submitted);
      }

      const stored = getStoredValue(name);

      return stored === null || stored === undefined || stored === '' ? null : Number(stored);
    };

    return (
      <form
        onChange={() => onValuesChange?.()}
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);

          onFinish?.({
            checkout_date: getStringValue(formData, 'checkout_date'),
            termination_date: getStringValue(formData, 'termination_date'),
            actual_move_out_date: getStringValue(formData, 'actual_move_out_date'),
            reason: getStringValue(formData, 'reason'),
            deposit_handling: getStringValue(formData, 'deposit_handling'),
            final_meter_reading: getNumber(formData, 'final_meter_reading'),
            cleaning_fee: getNumber(formData, 'cleaning_fee'),
            key_card_loss_fee: getNumber(formData, 'key_card_loss_fee'),
            other_fee: getNumber(formData, 'other_fee'),
            other_fee_reason: getStringValue(formData, 'other_fee_reason'),
            manual_rent_refund_amount: getNumber(formData, 'manual_rent_refund_amount'),
            manual_rent_refund_reason: getStringValue(formData, 'manual_rent_refund_reason'),
            notes: getStringValue(formData, 'notes'),
          });
        }}
      >
        {children}
      </form>
    );
  }

  FormComponent.useForm = () => [formMocks];
  FormComponent.Item = ({
    children,
    extra,
    label,
    name,
  }: React.PropsWithChildren<{ extra?: React.ReactNode; label?: string; name?: string }>) => (
    <label>
      <span>{label}</span>
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
          name,
          'aria-label': label,
        })
        : children}
      {extra ? <small>{extra}</small> : null}
      {name && formMocks.values[`error:${name}`] ? <span>{formMocks.values[`error:${name}`] as string}</span> : null}
    </label>
  );

  return {
    Alert: ({ message, description, action }: { message?: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode }) => (
      <section>
        <strong>{message}</strong>
        <p>{description}</p>
        {action}
      </section>
    ),
    Button: ({
      children,
      disabled,
      htmlType,
      onClick,
      title,
    }: React.PropsWithChildren<{
      disabled?: boolean;
      htmlType?: 'submit';
      onClick?: () => void;
      title?: string;
    }>) => (
      <button disabled={disabled} title={title} type={htmlType === 'submit' ? 'submit' : 'button'} onClick={onClick}>
        {children}
      </button>
    ),
    Card: ({ children, title }: React.PropsWithChildren<{ title?: React.ReactNode }>) => (
      <section>
        {title && <h2>{title}</h2>}
        {children}
      </section>
    ),
    DatePicker: ({ 'aria-label': ariaLabel, name }: { 'aria-label'?: string; name?: string }) => (
      <input aria-label={ariaLabel} name={name} type="date" />
    ),
    Drawer: ({
      children,
      onClose,
      open,
      title,
    }: React.PropsWithChildren<{ onClose?: () => void; open?: boolean; title?: string }>) => (
      open ? (
        <section aria-label={title}>
          <h2>{title}</h2>
          <button type="button" onClick={onClose}>關閉抽屜</button>
          {children}
        </section>
      ) : null
    ),
    Descriptions: Object.assign(
      ({ children }: React.PropsWithChildren) => <dl>{children}</dl>,
      {
        Item: ({ children, label }: React.PropsWithChildren<{ label?: string }>) => (
          <div>
            <dt>{label}</dt>
            <dd>{children}</dd>
          </div>
        ),
      },
    ),
    Form: FormComponent,
    Input: Object.assign(
      ({ 'aria-label': ariaLabel, name, placeholder }: { 'aria-label'?: string; name?: string; placeholder?: string }) => (
        <input aria-label={ariaLabel} name={name} placeholder={placeholder} />
      ),
      {
        TextArea: ({ 'aria-label': ariaLabel, name }: { 'aria-label'?: string; name?: string }) => (
          <textarea aria-label={ariaLabel} name={name} />
        ),
      },
    ),
    InputNumber: ({ 'aria-label': ariaLabel, name }: { 'aria-label'?: string; name?: string }) => (
      <input aria-label={ariaLabel} name={name} type="number" />
    ),
    Modal: ({
      children,
      onCancel,
      onOk,
      open,
      okText,
      title,
    }: React.PropsWithChildren<{
      onCancel?: () => void;
      onOk?: () => void;
      open?: boolean;
      okText?: string;
      title?: string;
    }>) => open ? (
      <section aria-label={title}>
        <h2>{title}</h2>
        {children}
        <button type="button" onClick={onCancel}>取消</button>
        <button type="button" onClick={onOk}>{okText ?? '確認'}</button>
      </section>
    ) : null,
    Select: ({
      'aria-label': ariaLabel,
      name,
      onChange,
      options,
      value,
    }: {
      'aria-label'?: string;
      name?: string;
      onChange?: (value: string) => void;
      options?: Array<{ value: string; label: React.ReactNode }>;
      value?: string;
    }) => (
      <select
        aria-label={ariaLabel}
        name={name}
        value={value ?? ''}
        onChange={(event) => {
          if (name) {
            formMocks.values[name] = event.target.value;
          }
          onChange?.(event.target.value);
        }}
      >
        <option value="">全部</option>
        {options?.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    ),
    Space: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Spin: () => <span>載入中</span>,
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
    Table: ({ columns, dataSource }: { columns?: Column[]; dataSource?: Array<Record<string, unknown>> }) => (
      <table>
        <tbody>
          {dataSource?.map((record, index) => (
            <tr key={String(record.lease_id ?? index)}>
              {columns?.map((column) => (
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
    ),
    Tag: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
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
    exportLeaseCheckoutSettlement: vi.fn(),
    finalizeLeaseCheckoutSettlement: vi.fn(),
    forceTerminateLease: vi.fn(),
    getLease: vi.fn(),
    listLeaseCheckoutReviews: vi.fn(),
    openHtmlDocumentPreview: vi.fn(),
    previewLeaseCheckoutSettlement: vi.fn(),
  };
});

vi.mock('../auth', async () => {
  const actual = await vi.importActual<typeof import('../auth')>('../auth');

  return {
    ...actual,
    useAuth: () => ({
      currentUser: authMocks.currentUser,
      getAccessToken: authMocks.getAccessToken,
    }),
  };
});

function LocationProbe() {
  const location = useLocation();

  return <output aria-label="目前路徑">{`${location.pathname}${location.search}`}</output>;
}

const lease: Lease = {
  id: 'lease-1',
  property_id: 'property-1',
  room_id: 'room-1',
  tenant_id: 'tenant-1',
  property_label: '大安物業',
  room_label: 'A101',
  tenant_label: '林家妤',
  rent_amount: 18000,
  rent_billing_cadence: 'monthly',
  start_date: '2025-06-01',
  end_date: '2026-05-31',
  status: 'active',
  deposit_amount: 36000,
  deposit_status: 'held',
};

const reviews: LeaseCheckoutReviewList = {
  data: [
    {
      lease_id: 'lease-1',
      force_termination_id: 'force-1',
      force_termination_status: 'completed',
      force_termination_deposit_handling: 'write_off',
      property_id: 'property-1',
      room_id: 'room-1',
      tenant_id: 'tenant-1',
      room_label: 'A101',
      tenant_label: '林家妤',
      lease_status: 'terminated',
      deposit_status: 'held',
      export_available: false,
    },
  ],
  pagination: { page: 1, limit: 20, total: 1, total_pages: 1, has_next: false },
};

function makePreview(overrides: Partial<CheckoutSettlementResponse> = {}): CheckoutSettlementResponse {
  return {
    lease_id: 'lease-1',
    property_id: 'property-1',
    tenant_id: 'tenant-1',
    room_id: 'room-1',
    property_label: '大安物業',
    tenant_label: '林家妤',
    room_label: 'A101',
    checkout_date: '2026-05-31',
    actual_move_out_date: '2026-05-30',
    reason: '合約到期退租',
    final_meter_reading: 360,
    manual_rent_refund_amount: 0,
    manual_rent_refund_reason: '合約到期，不需退未到期租金',
    notes: '現場已點交',
    lines: [{ kind: 'deposit_refund', label: '押金退還', direction: 'refund', amount: 36000 }],
    blockers: [],
    warnings: [],
    deposit_amount: 36000,
    total_refund: 36000,
    total_charge: 0,
    net_amount: 36000,
    net_direction: 'refund',
    preview_token: 'preview-token',
    export_available: false,
    ...overrides,
  };
}

function makeValidationError(field: string) {
  return new ApiError({
    status: 400,
    message: 'validation failed',
    errorCode: null,
    details: { field },
    response: new Response(null, { status: 400 }),
  });
}

function makeUnauthorizedError() {
  return new ApiError({
    status: 401,
    message: 'unauthorized',
    errorCode: null,
    details: null,
    response: new Response(null, { status: 401 }),
  });
}

function makeForbiddenError() {
  return new ApiError({
    status: 403,
    message: 'forbidden',
    errorCode: null,
    details: null,
    response: new Response(null, { status: 403 }),
  });
}

function makeUnprocessableError() {
  return new ApiError({
    status: 422,
    message: 'invalid termination date',
    errorCode: null,
    details: null,
    response: new Response(null, { status: 422 }),
  });
}

function renderCheckoutPage(path = '/properties/property-1/checkout?leaseId=lease-1&roomId=room-1&tenantId=tenant-1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/properties/:propertyId/checkout"
          element={(
            <>
              <CheckoutSettlementPage />
              <LocationProbe />
            </>
          )}
        />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authMocks.currentUser = {
    id: 'user-1',
    email: 'ops@example.com',
    role: 'organizer',
    assigned_property_ids: ['property-1'],
  };
  formMocks.resetFields();
  vi.mocked(listLeaseCheckoutReviews).mockResolvedValue(reviews);
  vi.mocked(getLease).mockResolvedValue(lease);
  vi.mocked(forceTerminateLease).mockResolvedValue({
    id: 'force-1',
    lease_id: 'lease-1',
    property_id: 'property-1',
    room_id: 'room-1',
    tenant_id: 'tenant-1',
    status: 'completed',
    deposit_handling: 'write_off',
  });
  vi.mocked(openHtmlDocumentPreview).mockReturnValue({ ok: true });
  window.open = vi.fn(() => ({ close: vi.fn() })) as unknown as typeof window.open;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CheckoutSettlementPage', () => {
  it('defaults review list to expired leases and preserves backend page order', async () => {
    vi.mocked(listLeaseCheckoutReviews).mockResolvedValue({
      data: [
        {
          lease_id: 'old-lease',
          property_id: 'property-1',
          room_id: 'room-old',
          tenant_id: 'tenant-old',
          room_label: 'A101',
          tenant_label: '舊租客',
          start_date: '2020-01-01',
          end_date: '2021-01-01',
          lease_status: 'expired',
          deposit_status: 'held',
          export_available: false,
        },
        {
          lease_id: 'new-lease',
          property_id: 'property-1',
          room_id: 'room-new',
          tenant_id: 'tenant-new',
          room_label: 'B202',
          tenant_label: '近期租客',
          start_date: '2025-01-01',
          end_date: '2026-01-01',
          lease_status: 'expired',
          deposit_status: 'held',
          export_available: false,
        },
      ],
      pagination: { page: 1, limit: 20, total: 2, total_pages: 1, has_next: false },
    });

    renderCheckoutPage('/properties/property-1/checkout');

    await waitFor(() => {
      expect(listLeaseCheckoutReviews).toHaveBeenCalledWith(
        expect.any(Function),
        { property_id: 'property-1', status: 'expired', page: 1, limit: 20 },
        expect.any(Object),
      );
    });
    const rows = await screen.findAllByRole('row');

    expect(rows[0].textContent).toContain('A101');
    expect(rows[1].textContent).toContain('B202');
    expect(screen.getByLabelText('退租狀態')).toHaveProperty('value', 'expired');
    expect(screen.getByText('預設顯示已到期；清單順序以目前資料為準。')).toBeTruthy();
  });

  it('allows expired leases from the review list to generate checkout previews', async () => {
    vi.mocked(getLease).mockResolvedValue({ ...lease, status: 'expired' });
    vi.mocked(previewLeaseCheckoutSettlement).mockResolvedValue(makePreview());

    renderCheckoutPage();

    await waitFor(() => expect(getLease).toHaveBeenCalledWith('lease-1', expect.any(Function), expect.any(Object)));
    const previewButton = screen.getByRole('button', { name: '產生退租試算' });

    expect(previewButton).toHaveProperty('disabled', false);
    fireEvent.click(previewButton);

    await waitFor(() => {
      expect(previewLeaseCheckoutSettlement).toHaveBeenCalledWith(
        'lease-1',
        expect.any(Object),
        expect.any(Function),
      );
    });
  });

  it('clears workflow query when closing the drawer so review filters do not reopen it', async () => {
    renderCheckoutPage('/properties/property-1/checkout?status=expired&leaseId=lease-1&roomId=room-1&tenantId=tenant-1');

    expect(await screen.findByLabelText('退租結算試算')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '關閉抽屜' }));

    await waitFor(() => {
      expect(screen.queryByLabelText('退租結算試算')).toBeNull();
      expect(screen.getByLabelText('目前路徑').textContent).toBe('/properties/property-1/checkout?status=expired');
    });

    fireEvent.change(screen.getByLabelText('退租狀態'), { target: { value: 'terminated' } });

    await waitFor(() => {
      expect(screen.queryByLabelText('退租結算試算')).toBeNull();
      expect(screen.getByLabelText('目前路徑').textContent).toBe('/properties/property-1/checkout?status=terminated&page=1');
    });
  });

  it('resets checkout form values when switching selected leases', async () => {
    vi.mocked(listLeaseCheckoutReviews).mockResolvedValue({
      data: [
        {
          lease_id: 'lease-2',
          property_id: 'property-1',
          room_id: 'room-2',
          tenant_id: 'tenant-2',
          room_label: 'B202',
          tenant_label: '第二租客',
          lease_status: 'expired',
          deposit_status: 'held',
          export_available: false,
        },
      ],
      pagination: { page: 1, limit: 20, total: 1, total_pages: 1, has_next: false },
    });
    vi.mocked(getLease)
      .mockResolvedValueOnce(lease)
      .mockResolvedValueOnce({
        ...lease,
        id: 'lease-2',
        room_id: 'room-2',
        tenant_id: 'tenant-2',
        room_label: 'B202',
        tenant_label: '第二租客',
        end_date: '2026-08-31',
      });

    renderCheckoutPage();

    await waitFor(() => expect(getLease).toHaveBeenCalledWith('lease-1', expect.any(Function), expect.any(Object)));
    formMocks.values = {
      ...formMocks.values,
      reason: '上一筆原因',
      cleaning_fee: 9999,
      notes: '上一筆備註',
    };
    fireEvent.click(await screen.findByRole('button', { name: '開啟流程' }));

    await waitFor(() => expect(getLease).toHaveBeenCalledWith('lease-2', expect.any(Function), expect.any(Object)));
    await waitFor(() => {
      expect((formMocks.values.checkout_date as { format: (format: string) => string }).format('YYYY-MM-DD')).toBe('2026-08-31');
      expect(formMocks.values).toMatchObject({
        cleaning_fee: 0,
        key_card_loss_fee: 0,
        other_fee: 0,
        manual_rent_refund_amount: 0,
      });
      expect(formMocks.values.reason).toBeUndefined();
      expect(formMocks.values.notes).toBeUndefined();
    });
    expect(formMocks.resetFields).toHaveBeenCalled();
  });

  it('does not offer checkout workflow entry for already terminated review rows', async () => {
    vi.mocked(listLeaseCheckoutReviews).mockResolvedValue({
      data: [
        {
          lease_id: 'terminated-lease',
          property_id: 'property-1',
          room_id: 'room-1',
          tenant_id: 'tenant-1',
          room_label: 'A101',
          tenant_label: '已退租客',
          lease_status: 'terminated',
          deposit_status: 'settled',
          checkout_finalized_at: '2026-05-31T10:00:00Z',
          export_available: true,
        },
      ],
      pagination: { page: 1, limit: 20, total: 1, total_pages: 1, has_next: false },
    });

    renderCheckoutPage('/properties/property-1/checkout?status=terminated');

    expect(await screen.findByText('已退租客')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '開啟流程' })).toBeNull();
    expect(screen.queryByRole('button', { name: '匯出' })).toBeNull();
  });

  it('labels force-terminated rows with held deposit as pending deposit handling', async () => {
    vi.mocked(listLeaseCheckoutReviews).mockResolvedValue({
      data: [
        {
          lease_id: 'force-lease',
          force_termination_id: 'force-1',
          force_termination_status: 'completed',
          force_termination_deposit_handling: 'keep_held',
          property_id: 'property-1',
          room_id: 'room-1',
          tenant_id: 'tenant-1',
          room_label: 'A101',
          tenant_label: '強制退租客',
          lease_status: 'force_terminated',
          deposit_status: 'held',
          export_available: false,
        },
      ],
      pagination: { page: 1, limit: 20, total: 1, total_pages: 1, has_next: false },
    });

    renderCheckoutPage('/properties/property-1/checkout?status=force_terminated');

    expect(await screen.findByText('強制退租客')).toBeTruthy();
    expect(screen.getByText('尚未處理押金')).toBeTruthy();
    expect(screen.getByRole('link', { name: '押金處理' })).toHaveProperty('href', 'http://localhost:3000/properties/property-1/force-terminations/force-1');
  });

  it('keeps finalized review rows read-only without list-level export actions', async () => {
    vi.mocked(listLeaseCheckoutReviews).mockResolvedValue({
      data: [
        {
          lease_id: 'terminated-lease',
          property_id: 'property-1',
          room_id: 'room-1',
          tenant_id: 'tenant-1',
          room_label: 'A101',
          tenant_label: '已退租客',
          lease_status: 'terminated',
          deposit_status: 'settled',
          checkout_finalized_at: '2026-05-31T10:00:00Z',
          export_available: true,
        },
      ],
      pagination: { page: 1, limit: 20, total: 1, total_pages: 1, has_next: false },
    });

    renderCheckoutPage('/properties/property-1/checkout?status=terminated');

    expect(await screen.findByText('已退租客')).toBeTruthy();
    expect(exportLeaseCheckoutSettlement).not.toHaveBeenCalled();
    expect(openHtmlDocumentPreview).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '匯出' })).toBeNull();
  });

  it('defaults checkout date to lease end date and uses it for preview payload', async () => {
    vi.mocked(getLease).mockResolvedValue({
      ...lease,
      end_date: '2026-06-15',
    });
    vi.mocked(previewLeaseCheckoutSettlement).mockResolvedValue(makePreview({
      checkout_date: '2026-06-15',
    }));

    renderCheckoutPage();

    await waitFor(() => {
      const checkoutDate = formMocks.values.checkout_date as { format?: (format: string) => string };

      expect(checkoutDate.format?.('YYYY-MM-DD')).toBe('2026-06-15');
    });
    expect(screen.getByText('退租電表讀數會用於系統試算；若可對應最後一期待抄表帳單，會納入退租試算，若帳單週期不符則會列為待處理項目。')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '產生退租試算' }));

    await waitFor(() => {
      expect(previewLeaseCheckoutSettlement).toHaveBeenCalledWith(
        'lease-1',
        expect.objectContaining({ checkout_date: '2026-06-15' }),
        expect.any(Function),
      );
    });
  });

  it('submits backend-supported preview payload and renders blockers without enabling finalize', async () => {
    vi.mocked(previewLeaseCheckoutSettlement).mockResolvedValue(makePreview({
      preview_token: null,
      blockers: [{ code: 'unpaid_bill', message: '需要先收款', source_id: 'bill-1' }],
    }));

    renderCheckoutPage();

    await waitFor(() => expect(getLease).toHaveBeenCalledWith('lease-1', expect.any(Function), expect.any(Object)));
    fireEvent.change(screen.getByLabelText('結算生效日 / 租約終止日（必填）'), { target: { value: '2026-05-31' } });
    fireEvent.change(screen.getByLabelText('實際搬出日 / 點交日'), { target: { value: '2026-05-30' } });
    fireEvent.change(screen.getByLabelText('退租原因（必填）'), { target: { value: '合約到期退租' } });
    fireEvent.change(screen.getByLabelText('退租電表讀數'), { target: { value: '360' } });
    fireEvent.change(screen.getByLabelText('清潔費'), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('門禁卡遺失費'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('其他費用'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('其他費用原因'), { target: { value: '牆面修補' } });
    fireEvent.change(screen.getByLabelText('人工未到期租金退款'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('人工租金退款決策原因'), { target: { value: '  合約到期，不需退未到期租金  ' } });
    fireEvent.change(screen.getByLabelText('退租備註'), { target: { value: '現場已點交' } });
    fireEvent.click(screen.getByRole('button', { name: '產生退租試算' }));

    await waitFor(() => {
      expect(previewLeaseCheckoutSettlement).toHaveBeenCalledWith(
        'lease-1',
        {
          checkout_date: '2026-05-31',
          actual_move_out_date: '2026-05-30',
          reason: '合約到期退租',
          final_meter_reading: 360,
          cleaning_fee: 1000,
          key_card_loss_fee: 0,
          other_fee: 500,
          other_fee_reason: '牆面修補',
          manual_rent_refund_amount: 0,
          manual_rent_refund_reason: '合約到期，不需退未到期租金',
          notes: '現場已點交',
        },
        expect.any(Function),
      );
    });
    expect(await screen.findByText('需要先收款')).toBeTruthy();
    expect(screen.getByRole('link', { name: '前往帳務' })).toHaveProperty(
      'href',
      'http://localhost:3000/properties/property-1/billing?leaseId=lease-1&billId=bill-1',
    );
    expect(screen.getByRole('button', { name: '確認完成退租結算' })).toHaveProperty('disabled', true);
  });

  it('does not route non-bill blockers with source id to billing', async () => {
    vi.mocked(previewLeaseCheckoutSettlement).mockResolvedValue(makePreview({
      preview_token: null,
      blockers: [{
        code: 'deposit_not_held',
        message: '押金狀態不是 held',
        source_id: 'lease-or-deposit-source',
      }],
    }));

    renderCheckoutPage();

    await waitFor(() => expect(getLease).toHaveBeenCalledWith('lease-1', expect.any(Function), expect.any(Object)));
    fireEvent.click(screen.getByRole('button', { name: '產生退租試算' }));

    expect(await screen.findByText('押金狀態不符合')).toBeTruthy();
    expect(screen.queryByRole('link', { name: '前往帳務' })).toBeNull();
    expect(screen.getByText('重新整理後確認')).toBeTruthy();
  });

  it('renders manual rent refund blocker from backend preview', async () => {
    vi.mocked(previewLeaseCheckoutSettlement).mockResolvedValue(makePreview({
      preview_token: null,
      blockers: [{
        code: 'manual_rent_refund_decision_required',
        message: '提前結算需要人工租金退款決策',
      }],
    }));

    renderCheckoutPage();

    await waitFor(() => expect(getLease).toHaveBeenCalledWith('lease-1', expect.any(Function), expect.any(Object)));
    formMocks.values = {
      ...formMocks.values,
      actual_move_out_date: '2026-05-30',
      reason: '合約到期退租',
      final_meter_reading: 360,
      cleaning_fee: 1000,
      key_card_loss_fee: 0,
      other_fee: 500,
      other_fee_reason: '牆面修補',
      manual_rent_refund_amount: 0,
      manual_rent_refund_reason: '  合約到期，不需退未到期租金  ',
      notes: '現場已點交',
    };
    fireEvent.click(screen.getByRole('button', { name: '產生退租試算' }));

    expect(await screen.findByText('未到期租金退款需人工決策')).toBeTruthy();
    expect(screen.getByText('結算生效日早於原租約結束日，請填寫人工未到期租金退款金額與原因；金額可為 0，但原因必須說明決策。')).toBeTruthy();
    expect(screen.getByText('結算生效日早於原租約結束日，請填寫人工租金退款決策原因；金額可為 0。')).toBeTruthy();
    expect(screen.getByText('補上人工決策')).toBeTruthy();
    expect(screen.getByRole('button', { name: '確認完成退租結算' })).toHaveProperty('disabled', true);
  });

  it('clears stale checkout field errors after a corrected preview succeeds', async () => {
    vi.mocked(previewLeaseCheckoutSettlement)
      .mockResolvedValueOnce(makePreview({
        preview_token: null,
        blockers: [{
          code: 'manual_rent_refund_decision_required',
          message: '提前結算需要人工租金退款決策',
        }],
      }))
      .mockResolvedValueOnce(makePreview());

    renderCheckoutPage();

    await waitFor(() => expect(getLease).toHaveBeenCalledWith('lease-1', expect.any(Function), expect.any(Object)));
    fireEvent.click(screen.getByRole('button', { name: '產生退租試算' }));

    expect(await screen.findByText('結算生效日早於原租約結束日，請填寫人工租金退款決策原因；金額可為 0。')).toBeTruthy();

    formMocks.values = {
      ...formMocks.values,
      manual_rent_refund_reason: '已確認不退未到期租金',
    };
    fireEvent.click(screen.getByRole('button', { name: '產生退租試算' }));

    await waitFor(() => {
      expect(previewLeaseCheckoutSettlement).toHaveBeenCalledTimes(2);
      expect(screen.queryByText('結算生效日早於原租約結束日，請填寫人工租金退款決策原因；金額可為 0。')).toBeNull();
    });
    expect(screen.getByRole('button', { name: '確認完成退租結算' })).toHaveProperty('disabled', false);
  });

  it('redirects to login with returnTo when preview receives unauthorized', async () => {
    vi.mocked(previewLeaseCheckoutSettlement).mockRejectedValue(makeUnauthorizedError());

    renderCheckoutPage('/properties/property-1/checkout?leaseId=lease-1&roomId=room-1&tenantId=tenant-1&page=2');

    await waitFor(() => expect(getLease).toHaveBeenCalledWith('lease-1', expect.any(Function), expect.any(Object)));
    fireEvent.click(screen.getByRole('button', { name: '產生退租試算' }));

    await waitFor(() => {
      expect(screen.getByLabelText('目前路徑').textContent).toBe(
        '/login?reason=session-expired&returnTo=%2Fproperties%2Fproperty-1%2Fcheckout%3FleaseId%3Dlease-1%26roomId%3Droom-1%26tenantId%3Dtenant-1%26page%3D2',
      );
    });
    expect(screen.queryByText('登入狀態已失效')).toBeNull();
  });

  it('requires explicit force termination fields before opening confirmation', async () => {
    renderCheckoutPage('/properties/property-1/checkout?leaseId=lease-1&roomId=room-1&tenantId=tenant-1&mode=force');

    await waitFor(() => expect(getLease).toHaveBeenCalledWith('lease-1', expect.any(Function), expect.any(Object)));
    expect(formMocks.values.termination_date).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: '送出強制退租' }));

    expect(await screen.findByText('強制退租資料未完成')).toBeTruthy();
    expect(forceTerminateLease).not.toHaveBeenCalled();
    expect(screen.queryByText('確認送出強制退租')).toBeNull();
  });

  it('submits force termination only after confirmation and navigates to the detail route', async () => {
    renderCheckoutPage('/properties/property-1/checkout?leaseId=lease-1&roomId=room-1&tenantId=tenant-1&mode=force');

    await waitFor(() => expect(getLease).toHaveBeenCalledWith('lease-1', expect.any(Function), expect.any(Object)));
    fireEvent.change(screen.getByLabelText('強制退租日（必填）'), { target: { value: '2026-05-20' } });
    fireEvent.change(screen.getByLabelText('實際搬出日 / 點交日'), { target: { value: '2026-05-19' } });
    fireEvent.change(screen.getByLabelText('押金處理（必填）'), { target: { value: 'keep_held' } });
    fireEvent.change(screen.getByLabelText('強制退租原因（必填）'), { target: { value: '  嚴重違約  ' } });
    fireEvent.click(screen.getByRole('button', { name: '送出強制退租' }));

    expect(await screen.findByText('確認送出強制退租')).toBeTruthy();
    expect(forceTerminateLease).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '確認強制退租' }));

    await waitFor(() => {
      expect(forceTerminateLease).toHaveBeenCalledWith(
        'lease-1',
        {
          termination_date: '2026-05-20',
          actual_move_out_date: '2026-05-19',
          reason: '嚴重違約',
          deposit_handling: 'keep_held',
        },
        expect.any(Function),
      );
    });
    await waitFor(() => {
      expect(screen.getByLabelText('目前路徑').textContent).toBe('/properties/property-1/force-terminations/force-1');
    });
  });

  it('clears stale checkout preview when entering and returning from force termination', async () => {
    vi.mocked(previewLeaseCheckoutSettlement).mockResolvedValue(makePreview());

    renderCheckoutPage();

    await waitFor(() => expect(getLease).toHaveBeenCalledWith('lease-1', expect.any(Function), expect.any(Object)));
    fireEvent.click(screen.getByRole('button', { name: '產生退租試算' }));

    expect(await screen.findByText('退租結算試算結果')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: '強制退租' })[0]);

    expect(await screen.findByText('強制退租是獨立危險流程')).toBeTruthy();
    expect(screen.queryByText('退租結算試算結果')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '返回正常退租' }));

    await waitFor(() => {
      expect(screen.getByLabelText('目前路徑').textContent).toBe('/properties/property-1/checkout?leaseId=lease-1&roomId=room-1&tenantId=tenant-1');
    });
    expect(screen.queryByText('退租結算試算結果')).toBeNull();
  });

  it('keeps force termination initiation disabled for staff users', async () => {
    authMocks.currentUser = {
      id: 'staff-1',
      email: 'staff@example.com',
      role: 'staff',
      assigned_property_ids: ['property-1'],
    };

    renderCheckoutPage('/properties/property-1/checkout?leaseId=lease-1&roomId=room-1&tenantId=tenant-1&mode=force');

    expect(await screen.findByText('目前角色不能執行強制退租')).toBeTruthy();
    const submitButton = screen.getByRole('button', { name: '送出強制退租' });

    expect(submitButton).toHaveProperty('disabled', true);
    fireEvent.click(submitButton);
    expect(forceTerminateLease).not.toHaveBeenCalled();
  });

  it('keeps force termination disabled when the lease is not active', async () => {
    vi.mocked(getLease).mockResolvedValue({
      ...lease,
      status: 'expired',
    });

    renderCheckoutPage('/properties/property-1/checkout?leaseId=lease-1&roomId=room-1&tenantId=tenant-1&mode=force');

    expect(await screen.findByText('此租約狀態不適合強制退租')).toBeTruthy();
    const submitButton = screen.getByRole('button', { name: '送出強制退租' });

    expect(submitButton).toHaveProperty('disabled', true);
    fireEvent.click(submitButton);
    expect(forceTerminateLease).not.toHaveBeenCalled();
  });

  it('links force termination review rows to the detail route using force_termination_id', async () => {
    renderCheckoutPage('/properties/property-1/checkout?status=force_terminated');

    const detailLink = await screen.findByRole('link', { name: '已完成' });

    expect(detailLink).toHaveProperty('href', 'http://localhost:3000/properties/property-1/force-terminations/force-1');
  });

  it('surfaces forbidden and validation failures from force termination distinctly', async () => {
    vi.mocked(forceTerminateLease)
      .mockRejectedValueOnce(makeForbiddenError())
      .mockRejectedValueOnce(makeUnprocessableError());

    renderCheckoutPage('/properties/property-1/checkout?leaseId=lease-1&roomId=room-1&tenantId=tenant-1&mode=force');

    await waitFor(() => expect(getLease).toHaveBeenCalledWith('lease-1', expect.any(Function), expect.any(Object)));
    formMocks.values = {
      ...formMocks.values,
      termination_date: '2026-05-20',
      actual_move_out_date: null,
      reason: '嚴重違約',
      deposit_handling: 'write_off',
    };
    fireEvent.click(screen.getByRole('button', { name: '送出強制退租' }));
    fireEvent.click(await screen.findByRole('button', { name: '確認強制退租' }));

    expect(await screen.findByText('沒有權限執行強制退租')).toBeTruthy();
    expect(screen.queryByText('確認送出強制退租')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '送出強制退租' }));
    fireEvent.click(await screen.findByRole('button', { name: '確認強制退租' }));

    expect(await screen.findByText('資料未通過檢查')).toBeTruthy();
    expect(screen.queryByText('確認送出強制退租')).toBeNull();
  });

  it('redirects to login with returnTo when force termination receives unauthorized', async () => {
    vi.mocked(forceTerminateLease).mockRejectedValue(makeUnauthorizedError());

    renderCheckoutPage('/properties/property-1/checkout?leaseId=lease-1&roomId=room-1&tenantId=tenant-1&mode=force');

    await waitFor(() => expect(getLease).toHaveBeenCalledWith('lease-1', expect.any(Function), expect.any(Object)));
    formMocks.values = {
      ...formMocks.values,
      termination_date: '2026-05-20',
      reason: '嚴重違約',
      deposit_handling: 'write_off',
    };
    fireEvent.click(screen.getByRole('button', { name: '送出強制退租' }));
    fireEvent.click(await screen.findByRole('button', { name: '確認強制退租' }));

    await waitFor(() => {
      expect(screen.getByLabelText('目前路徑').textContent).toBe(
        '/login?reason=session-expired&returnTo=%2Fproperties%2Fproperty-1%2Fcheckout%3FleaseId%3Dlease-1%26roomId%3Droom-1%26tenantId%3Dtenant-1%26mode%3Dforce',
      );
    });
  });

  it('highlights manual rent refund reason when backend validation rejects preview', async () => {
    vi.mocked(previewLeaseCheckoutSettlement).mockRejectedValue(makeValidationError('manual_rent_refund_reason'));

    renderCheckoutPage();

    await waitFor(() => expect(getLease).toHaveBeenCalledWith('lease-1', expect.any(Function), expect.any(Object)));
    formMocks.values = {
      ...formMocks.values,
      checkout_date: '2026-05-01',
      reason: '提前退租',
      manual_rent_refund_amount: 500,
      manual_rent_refund_reason: '',
    };
    fireEvent.click(screen.getByRole('button', { name: '產生退租試算' }));

    expect(await screen.findByText('退租資料未通過檢查')).toBeTruthy();
    expect(screen.getByText('請填寫人工租金退款決策原因。')).toBeTruthy();
    expect(previewLeaseCheckoutSettlement).toHaveBeenCalledWith(
      'lease-1',
      expect.objectContaining({
        manual_rent_refund_amount: 500,
        manual_rent_refund_reason: null,
      }),
      expect.any(Function),
    );
  });

  it('keeps submitted final meter reading visible even when no electricity settlement line is returned', async () => {
    vi.mocked(previewLeaseCheckoutSettlement).mockResolvedValue(makePreview({
      final_meter_reading: 333,
      lines: [{ kind: 'deposit_refund', label: '押金退還', direction: 'refund', amount: 36000 }],
    }));

    renderCheckoutPage();

    await waitFor(() => expect(getLease).toHaveBeenCalledWith('lease-1', expect.any(Function), expect.any(Object)));
    formMocks.values = {
      ...formMocks.values,
      reason: '合約到期退租',
      final_meter_reading: 333,
    };
    fireEvent.click(screen.getByRole('button', { name: '產生退租試算' }));

    expect(await screen.findByText('退租電表讀數')).toBeTruthy();
    expect(screen.getByText('333（本次未產生電費結算項目）')).toBeTruthy();
  });

  it('renders backend-owned electricity settlement source details without calculating amount locally', async () => {
    vi.mocked(previewLeaseCheckoutSettlement).mockResolvedValue(makePreview({
      lines: [
        {
          kind: 'electricity_settlement',
          label: '最後一期電費',
          direction: 'charge',
          amount: 750,
          description: '由系統依最後一期待抄表帳單結算',
          source_ref: {
            previous_reading: 1200,
            final_meter_reading: 1350,
            usage: 150,
            unit_price: 5,
            source_bill_id: 'bill-1',
          },
        },
      ],
    }));

    renderCheckoutPage();

    await waitFor(() => expect(getLease).toHaveBeenCalledWith('lease-1', expect.any(Function), expect.any(Object)));
    fireEvent.click(screen.getByRole('button', { name: '產生退租試算' }));

    expect(await screen.findByText('最後一期電費')).toBeTruthy();
    expect(screen.getByText('由系統依最後一期待抄表帳單結算')).toBeTruthy();
    expect(screen.getByText('前次讀數 1200 / 退租讀數 1350 / 用電 150 度 / 單價 5')).toBeTruthy();
    expect(screen.getByText('NT$750')).toBeTruthy();
  });

  it('keeps export disabled when backend marks finalized settlement as not exportable', async () => {
    vi.mocked(previewLeaseCheckoutSettlement).mockResolvedValue(makePreview({
      finalized_at: '2026-05-31T10:00:00Z',
      export_available: false,
    }));

    renderCheckoutPage();

    await waitFor(() => expect(getLease).toHaveBeenCalledWith('lease-1', expect.any(Function), expect.any(Object)));
    fireEvent.click(screen.getByRole('button', { name: '產生退租試算' }));

    const exportButton = await screen.findByRole('button', { name: '開啟結算書' });

    expect(exportButton).toHaveProperty('disabled', true);
    fireEvent.click(exportButton);
    expect(exportLeaseCheckoutSettlement).not.toHaveBeenCalled();
  });

  it('redirects to login with returnTo when export receives unauthorized', async () => {
    vi.mocked(previewLeaseCheckoutSettlement).mockResolvedValue(makePreview({
      finalized_at: '2026-05-31T10:00:00Z',
      export_available: true,
    }));
    vi.mocked(exportLeaseCheckoutSettlement).mockRejectedValue(makeUnauthorizedError());

    renderCheckoutPage();

    await waitFor(() => expect(getLease).toHaveBeenCalledWith('lease-1', expect.any(Function), expect.any(Object)));
    fireEvent.click(screen.getByRole('button', { name: '產生退租試算' }));
    fireEvent.click(await screen.findByRole('button', { name: '開啟結算書' }));

    await waitFor(() => {
      expect(screen.getByLabelText('目前路徑').textContent).toBe(
        '/login?reason=session-expired&returnTo=%2Fproperties%2Fproperty-1%2Fcheckout%3FleaseId%3Dlease-1%26roomId%3Droom-1%26tenantId%3Dtenant-1',
      );
    });
  });

  it('invalidates generated preview when settlement form values change', async () => {
    vi.mocked(previewLeaseCheckoutSettlement).mockResolvedValue(makePreview());

    renderCheckoutPage();

    await waitFor(() => expect(getLease).toHaveBeenCalledWith('lease-1', expect.any(Function), expect.any(Object)));
    fireEvent.click(screen.getByRole('button', { name: '產生退租試算' }));

    expect(await screen.findByText('退租結算試算結果')).toBeTruthy();
    expect(screen.getByRole('button', { name: '確認完成退租結算' })).toHaveProperty('disabled', false);

    fireEvent.change(screen.getByLabelText('清潔費'), { target: { value: '1200' } });

    await waitFor(() => {
      expect(screen.queryByText('退租結算試算結果')).toBeNull();
    });
    expect(screen.queryByRole('button', { name: '確認完成退租結算' })).toBeNull();
    expect(finalizeLeaseCheckoutSettlement).not.toHaveBeenCalled();
  });

  it('finalizes with preview token, opens finalized HTML export, and returns to terminated reviews', async () => {
    vi.mocked(previewLeaseCheckoutSettlement).mockResolvedValue(makePreview({ export_available: false }));
    vi.mocked(finalizeLeaseCheckoutSettlement).mockResolvedValue(makePreview({
      finalized_at: '2026-05-31T10:00:00Z',
      export_available: true,
    }));
    vi.mocked(exportLeaseCheckoutSettlement).mockResolvedValue({
      html: '<!doctype html><title>退租結算</title>',
      contentType: 'text/html; charset=utf-8',
      contentDisposition: 'inline; filename="checkout.html"',
      filename: 'checkout.html',
    });

    renderCheckoutPage();

    await waitFor(() => expect(getLease).toHaveBeenCalledWith('lease-1', expect.any(Function), expect.any(Object)));
    fireEvent.click(screen.getByRole('button', { name: '產生退租試算' }));
    await screen.findByText('押金退還');
    formMocks.values = {
      ...formMocks.values,
      actual_move_out_date: '2026-05-30',
      reason: '合約到期退租',
      final_meter_reading: 360,
      cleaning_fee: 1000,
      key_card_loss_fee: 0,
      other_fee: 500,
      other_fee_reason: '牆面修補',
      manual_rent_refund_amount: 0,
      manual_rent_refund_reason: '  合約到期，不需退未到期租金  ',
      notes: '現場已點交',
    };
    fireEvent.click(screen.getByRole('button', { name: '確認完成退租結算' }));
    const finalizeButtons = screen.getAllByRole('button', { name: '確認完成退租' });
    fireEvent.click(finalizeButtons[finalizeButtons.length - 1]);

    await waitFor(() => {
      expect(finalizeLeaseCheckoutSettlement).toHaveBeenCalledWith(
        'lease-1',
        {
          checkout_date: '2026-05-31',
          actual_move_out_date: '2026-05-30',
          reason: '合約到期退租',
          final_meter_reading: 360,
          cleaning_fee: 1000,
          key_card_loss_fee: 0,
          other_fee: 500,
          other_fee_reason: '牆面修補',
          manual_rent_refund_amount: 0,
          manual_rent_refund_reason: '合約到期，不需退未到期租金',
          notes: '現場已點交',
          preview_token: 'preview-token',
        },
        expect.any(Function),
      );
    });

    await waitFor(() => {
      expect(exportLeaseCheckoutSettlement).toHaveBeenCalledWith('lease-1', expect.any(Function));
      expect(openHtmlDocumentPreview).toHaveBeenCalledWith(
        expect.objectContaining({ filename: 'checkout.html' }),
        expect.any(Object),
      );
    });
    await waitFor(() => {
      expect(screen.getByLabelText('目前路徑').textContent).toBe('/properties/property-1/checkout?status=terminated&page=1');
    });
  });

  it('does not call export after finalize when backend marks the saved settlement as not exportable', async () => {
    vi.mocked(previewLeaseCheckoutSettlement).mockResolvedValue(makePreview({ export_available: false }));
    vi.mocked(finalizeLeaseCheckoutSettlement).mockResolvedValue(makePreview({
      finalized_at: '2026-05-31T10:00:00Z',
      export_available: false,
    }));

    renderCheckoutPage();

    await waitFor(() => expect(getLease).toHaveBeenCalledWith('lease-1', expect.any(Function), expect.any(Object)));
    fireEvent.click(screen.getByRole('button', { name: '產生退租試算' }));
    await screen.findByText('押金退還');
    formMocks.values = {
      ...formMocks.values,
      actual_move_out_date: '2026-05-30',
      reason: '合約到期退租',
      final_meter_reading: 360,
      cleaning_fee: 1000,
      key_card_loss_fee: 0,
      other_fee: 500,
      other_fee_reason: '牆面修補',
      manual_rent_refund_amount: 0,
      manual_rent_refund_reason: '合約到期，不需退未到期租金',
      notes: '現場已點交',
    };
    fireEvent.click(screen.getByRole('button', { name: '確認完成退租結算' }));
    const finalizeButtons = screen.getAllByRole('button', { name: '確認完成退租' });
    fireEvent.click(finalizeButtons[finalizeButtons.length - 1]);

    await waitFor(() => {
      expect(finalizeLeaseCheckoutSettlement).toHaveBeenCalled();
    });
    expect(exportLeaseCheckoutSettlement).not.toHaveBeenCalled();
    expect(openHtmlDocumentPreview).not.toHaveBeenCalled();
  });

  it('surfaces post-finalize auto-export popup failures after returning to the review page', async () => {
    vi.mocked(previewLeaseCheckoutSettlement).mockResolvedValue(makePreview({ export_available: false }));
    vi.mocked(finalizeLeaseCheckoutSettlement).mockResolvedValue(makePreview({
      finalized_at: '2026-05-31T10:00:00Z',
      export_available: true,
    }));
    vi.mocked(exportLeaseCheckoutSettlement).mockResolvedValue({
      html: '<!doctype html><title>退租結算</title>',
      contentType: 'text/html; charset=utf-8',
      contentDisposition: 'inline; filename="checkout.html"',
      filename: 'checkout.html',
    });
    vi.mocked(openHtmlDocumentPreview).mockReturnValue({ ok: false, reason: 'popup-blocked' });

    renderCheckoutPage();

    await waitFor(() => expect(getLease).toHaveBeenCalledWith('lease-1', expect.any(Function), expect.any(Object)));
    fireEvent.click(screen.getByRole('button', { name: '產生退租試算' }));
    await screen.findByText('押金退還');
    formMocks.values = {
      ...formMocks.values,
      actual_move_out_date: '2026-05-30',
      reason: '合約到期退租',
      final_meter_reading: 360,
      cleaning_fee: 1000,
      key_card_loss_fee: 0,
      other_fee: 500,
      other_fee_reason: '牆面修補',
      manual_rent_refund_amount: 0,
      manual_rent_refund_reason: '合約到期，不需退未到期租金',
      notes: '現場已點交',
    };
    fireEvent.click(screen.getByRole('button', { name: '確認完成退租結算' }));
    const finalizeButtons = screen.getAllByRole('button', { name: '確認完成退租' });
    fireEvent.click(finalizeButtons[finalizeButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByLabelText('目前路徑').textContent).toBe('/properties/property-1/checkout?status=terminated&page=1');
    });
    expect(await screen.findByText('退租結算書無法開啟')).toBeTruthy();
  });
});
