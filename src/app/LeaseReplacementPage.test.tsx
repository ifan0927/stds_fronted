// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  ApiError,
  getLease,
  replaceLease,
} from '../api';
import LeaseReplacementPage from './LeaseReplacementPage';

const authMocks = vi.hoisted(() => ({
  currentUser: {
    id: 'user-1',
    role: 'organizer' as 'admin' | 'organizer' | 'staff' | 'owner',
    assigned_property_ids: ['property-1'],
  },
  getAccessToken: vi.fn(() => 'firebase-token'),
}));

vi.mock('@ant-design/icons', () => ({
  ArrowLeftOutlined: () => null,
  CheckCircleOutlined: () => null,
  ReloadOutlined: () => null,
  SaveOutlined: () => null,
}));

vi.mock('antd', async () => {
  const React = await import('react');
  let currentForm: { values: Record<string, unknown> } | null = null;

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
      description,
      message,
    }: {
      description?: React.ReactNode;
      message?: React.ReactNode;
    }) => (
      <section>
        <h2>{message}</h2>
        <p>{description}</p>
      </section>
    ),
    Button: ({
      children,
      disabled,
      htmlType,
      loading,
      onClick,
    }: React.PropsWithChildren<{
      disabled?: boolean;
      htmlType?: 'button' | 'submit';
      loading?: boolean;
      onClick?: () => void;
    }>) => (
      <button disabled={disabled || loading} onClick={onClick} type={htmlType ?? 'button'}>{children}</button>
    ),
    Card: ({ children, title }: React.PropsWithChildren<{ title?: React.ReactNode }>) => (
      <section>
        {title && <h2>{title}</h2>}
        {children}
      </section>
    ),
    DatePicker: ({
      name,
      onChange,
    }: {
      name?: string;
      onChange?: (value: { format: () => string }) => void;
    }) => (
      <input
        aria-label={name}
        name={name}
        type="date"
        onChange={(event) => onChange?.({ format: () => event.target.value })}
      />
    ),
    Descriptions,
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
      },
    ),
    Input: Object.assign(
      () => <input />,
      {
        TextArea: ({ name, onChange }: { name?: string; onChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void }) => (
          <textarea aria-label={name} name={name} onChange={onChange} />
        ),
      },
    ),
    InputNumber: ({ name, onChange }: { name?: string; onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void }) => (
      <input aria-label={name} name={name} onChange={onChange} type="number" />
    ),
    Result: ({ title, subTitle, extra }: { title?: React.ReactNode; subTitle?: React.ReactNode; extra?: React.ReactNode }) => (
      <section>
        <h1>{title}</h1>
        <p>{subTitle}</p>
        {extra}
      </section>
    ),
    Select: ({
      name,
      onChange,
      options,
    }: {
      name?: string;
      onChange?: (value: string) => void;
      options?: Array<{ value: string; label: React.ReactNode }>;
    }) => (
      <select
        aria-label={name}
        name={name}
        onChange={(event) => onChange?.(event.target.value)}
      >
        {options?.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    ),
    Space: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Spin: () => <span>載入中</span>,
    Tag: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
    Typography: {
      Paragraph: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
      Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
      Title: ({ children }: React.PropsWithChildren) => <h1>{children}</h1>,
    },
    message: {
      useMessage: () => [{ success: vi.fn(), error: vi.fn() }, null],
    },
  };
});

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');

  return {
    ...actual,
    getLease: vi.fn(),
    replaceLease: vi.fn(),
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

function renderLeaseReplacementPage(initialEntry = '/properties/property-1/leases/lease-1/replace') {
  function LocationProbe() {
    const location = useLocation();

    return <output aria-label="目前路徑">{`${location.pathname}${location.search}`}</output>;
  }

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationProbe />
      <Routes>
        <Route path="/properties/:propertyId/leases/:leaseId/replace" element={<LeaseReplacementPage />} />
        <Route path="/properties/:propertyId/leases/:leaseId" element={<div>租約詳情頁</div>} />
        <Route path="/properties/:propertyId/tenants" element={<div>租客與租約 Hub</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockLease() {
  vi.mocked(getLease).mockResolvedValue({
    id: 'lease-1',
    property_id: 'property-1',
    room_id: 'room-1',
    room_label: '101 室',
    tenant_id: 'tenant-1',
    tenant_label: '林家妤',
    status: 'active',
    start_date: '2026-01-01',
    end_date: '2026-06-30',
    rent_amount: 18000,
    rent_billing_cadence: 'monthly',
    electricity_billing_cadence: 'monthly',
    deposit_amount: 36000,
    notes: 'old note',
  });
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
  authMocks.currentUser.role = 'organizer';
});

describe('LeaseReplacementPage', () => {
  it('submits replacement payload with effective start date and carry-over deposit only', async () => {
    mockLease();
    vi.mocked(replaceLease).mockResolvedValue({
      old_lease: { id: 'lease-1', status: 'terminated', end_date: '2026-06-30' },
      new_lease: { id: 'lease-2', status: 'active', start_date: '2026-07-01', end_date: '2027-06-30' },
      replacement: {
        reason: 'cadence_change',
        effective_start_date: '2026-07-01',
        deposit_handling: 'carry_over',
      },
    });

    renderLeaseReplacementPage();

    await screen.findByText('目前租約');
    fireEvent.change(screen.getByLabelText('reason'), { target: { value: 'renewal' } });
    fireEvent.change(screen.getByLabelText('effective_start_date'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText('end_date'), { target: { value: '2027-06-30' } });
    fireEvent.change(screen.getByLabelText('rent_amount'), { target: { value: '20000' } });
    fireEvent.change(screen.getByLabelText('rent_billing_cadence'), { target: { value: 'quarterly' } });
    fireEvent.change(screen.getByLabelText('electricity_billing_cadence'), { target: { value: 'bimonthly' } });
    fireEvent.change(screen.getByLabelText('notes'), { target: { value: 'new terms' } });
    fireEvent.click(screen.getByRole('button', { name: '確認送出租約更換' }));

    await waitFor(() => {
      expect(replaceLease).toHaveBeenCalledWith(
        'lease-1',
        {
          reason: 'renewal',
          effective_start_date: '2026-07-01',
          deposit_handling: 'carry_over',
          new_lease: {
            end_date: '2027-06-30',
            rent_amount: 20000,
            rent_billing_cadence: 'quarterly',
            electricity_billing_cadence: 'bimonthly',
            notes: 'new terms',
          },
        },
        expect.any(Function),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    const payload = vi.mocked(replaceLease).mock.calls[0][1] as Record<string, unknown>;

    expect(payload).not.toHaveProperty('actual_move_out_date');
    expect(payload).not.toHaveProperty('manual_rent_refund');
    expect(payload).not.toHaveProperty('refund_amount');
  });

  it('shows old and new lease summaries after replacement succeeds', async () => {
    mockLease();
    vi.mocked(replaceLease).mockResolvedValue({
      old_lease: {
        id: 'lease-1',
        room_label: '101 室',
        tenant_label: '林家妤',
        status: 'terminated',
        start_date: '2026-01-01',
        end_date: '2026-06-30',
        rent_amount: 18000,
        rent_billing_cadence: 'monthly',
      },
      new_lease: {
        id: 'lease-2',
        room_id: 'room-1',
        tenant_id: 'tenant-1',
        room_label: '101 室',
        tenant_label: '林家妤',
        status: 'active',
        start_date: '2026-07-01',
        end_date: '2027-06-30',
        rent_amount: 20000,
        rent_billing_cadence: 'quarterly',
      },
      replacement: {
        reason: 'renewal',
        effective_start_date: '2026-07-01',
        deposit_handling: 'carry_over',
        changed_fields: ['rent_amount', 'rent_billing_cadence'],
      },
    });

    renderLeaseReplacementPage();

    await screen.findByText('目前租約');
    fireEvent.change(screen.getByLabelText('effective_start_date'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText('end_date'), { target: { value: '2027-06-30' } });
    fireEvent.click(screen.getByRole('button', { name: '確認送出租約更換' }));

    expect(await screen.findByText('租約更換已完成')).toBeTruthy();
    expect(screen.getByText('舊租約')).toBeTruthy();
    expect(screen.getByText('新租約')).toBeTruthy();
    expect(screen.getByText('2026-07-01')).toBeTruthy();
    expect(screen.getByRole('button', { name: '前往新租約' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '回租客與租約 Hub' })).toBeTruthy();
  });

  it('renders a visible business-rule alert for replacement 422 errors', async () => {
    mockLease();
    vi.mocked(replaceLease).mockRejectedValue(createApiError(422, 'LEASE_REPLACEMENT_HAS_UNSETTLED_BILLS'));

    renderLeaseReplacementPage();

    await screen.findByText('目前租約');
    fireEvent.change(screen.getByLabelText('effective_start_date'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText('end_date'), { target: { value: '2027-06-30' } });
    fireEvent.click(screen.getByRole('button', { name: '確認送出租約更換' }));

    expect(await screen.findByText('無法完成租約更換')).toBeTruthy();
    expect(screen.getByText('生效日前仍有未結清帳單，請先完成收款或處理帳單後再更換租約。')).toBeTruthy();
  });
});
