// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  ApiError,
  getForceTermination,
  getLease,
  updateLeaseDeposit,
} from '../api';
import type { ForceTermination } from '../api';
import ForceTerminationDetailPage from './ForceTerminationDetailPage';

const authMocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(() => 'firebase-token'),
}));

vi.mock('@ant-design/icons', () => ({
  ArrowLeftOutlined: () => null,
  ReloadOutlined: () => null,
}));

vi.mock('antd', async () => {
  const React = await import('react');
  const formState = {
    values: {} as Record<string, unknown>,
  };

  type Column = {
    title?: string;
    dataIndex?: string;
    key?: string;
    render?: (value: unknown, record: Record<string, unknown>, index: number) => React.ReactNode;
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
    }: React.PropsWithChildren<{ disabled?: boolean; onClick?: () => void }>) => (
      <button disabled={disabled} type="button" onClick={onClick}>{children}</button>
    ),
    Card: ({ children, title }: React.PropsWithChildren<{ title?: React.ReactNode }>) => (
      <section>
        {title && <h2>{title}</h2>}
        {children}
      </section>
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
    Empty: ({ description }: { description?: React.ReactNode }) => <div>{description}</div>,
    Form: Object.assign(
      ({
        children,
      }: React.PropsWithChildren<{
        form?: {
          values: Record<string, unknown>;
        };
      }>) => <form>{children}</form>,
      {
        Item: ({
          children,
          label,
          name,
        }: React.PropsWithChildren<{ label?: React.ReactNode; name?: string }>) => (
          <label>
            {label && <span>{label}</span>}
            {name && React.isValidElement(children)
              ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, { name })
              : children}
          </label>
        ),
        useForm: () => [{
          values: formState.values,
          getFieldsValue: () => formState.values,
          resetFields: () => {
            formState.values = {};
          },
          setFieldsValue: (values: Record<string, unknown>) => {
            formState.values = { ...formState.values, ...values };
          },
        }],
      },
    ),
    Input: Object.assign(
      (props: { name?: string }) => (
        <input
          aria-label={props.name}
          name={props.name}
          onChange={(event) => {
            if (props.name) {
              formState.values[props.name] = event.target.value;
            }
          }}
        />
      ),
      {
        TextArea: (props: { name?: string }) => (
          <textarea
            aria-label={props.name}
            name={props.name}
            onChange={(event) => {
              if (props.name) {
                formState.values[props.name] = event.target.value;
              }
            }}
          />
        ),
      },
    ),
    InputNumber: (props: { name?: string }) => (
      <input
        aria-label={props.name}
        name={props.name}
        type="number"
        onChange={(event) => {
          if (props.name) {
            formState.values[props.name] = Number(event.target.value);
          }
        }}
      />
    ),
    message: {
      useMessage: () => [{ success: vi.fn() }, null],
    },
    Modal: ({
      cancelText,
      children,
      okText,
      onCancel,
      onOk,
      open,
      title,
    }: React.PropsWithChildren<{
      cancelText?: React.ReactNode;
      okText?: React.ReactNode;
      onCancel?: () => void;
      onOk?: () => void;
      open?: boolean;
      title?: React.ReactNode;
    }>) => open ? (
      <section>
        <h2>{title}</h2>
        {children}
        <button type="button" onClick={onOk}>{okText}</button>
        <button type="button" onClick={onCancel}>{cancelText}</button>
      </section>
    ) : null,
    Result: ({
      extra,
      subTitle,
      title,
    }: {
      extra?: React.ReactNode;
      subTitle?: React.ReactNode;
      title?: React.ReactNode;
    }) => (
      <section>
        <h1>{title}</h1>
        <p>{subTitle}</p>
        {extra}
      </section>
    ),
    Space: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Spin: () => <span>載入中</span>,
    Table: ({
      columns,
      dataSource,
    }: {
      columns?: Column[];
      dataSource?: Array<Record<string, unknown>>;
    }) => (
      <table>
        <tbody>
          {dataSource?.map((record, rowIndex) => (
            <tr key={String(record.bill_id ?? rowIndex)}>
              {columns?.map((column) => (
                <td key={column.key ?? column.dataIndex ?? column.title}>
                  {column.render
                    ? column.render(getCellValue(record, column.dataIndex), record, rowIndex)
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
  };
});

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');

  return {
    ...actual,
    getForceTermination: vi.fn(),
    getLease: vi.fn(),
    updateLeaseDeposit: vi.fn(),
  };
});

vi.mock('../auth', async () => {
  const actual = await vi.importActual<typeof import('../auth')>('../auth');

  return {
    ...actual,
    useAuth: () => ({
      currentUser: {
        id: 'user-1',
        email: 'ops@example.com',
        role: 'organizer',
        assigned_property_ids: ['property-1'],
      },
      getAccessToken: authMocks.getAccessToken,
    }),
  };
});

function LocationProbe() {
  const location = useLocation();

  return <output aria-label="目前路徑">{`${location.pathname}${location.search}`}</output>;
}

const forceTermination: ForceTermination = {
  id: 'force-termination-1',
  lease_id: 'lease-1',
  property_id: 'property-1',
  room_id: 'room-1',
  tenant_id: 'tenant-1',
  property_label: '大安物業',
  room_label: 'A101',
  tenant_label: '林家妤',
  status: 'in_progress',
  initiated_by: 'user-1',
  initiated_by_label: '營運人員',
  reason: '租客失聯且欠繳租金',
  deposit_handling: 'write_off',
  bills: [
    {
      bill_id: 'bill-1',
      status: 'done',
      type: 'rent',
      period_start: '2026-04-01',
      period_end: '2026-04-30',
      period_label: '2026-04',
    },
    {
      bill_id: 'bill-2',
      status: 'pending',
      type: 'electricity',
      period_start: '2026-05-01',
      period_end: '2026-05-31',
      period_label: '2026-05',
    },
  ],
  created_at: '2026-05-12T02:30:00Z',
  updated_at: '2026-05-12T03:30:00Z',
};

function makeApiError(status: number) {
  return new ApiError({
    status,
    message: 'api error',
    errorCode: null,
    details: null,
    response: new Response(null, { status }),
  });
}

function renderForceTerminationPage(path = '/properties/property-1/force-terminations/force-termination-1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/properties/:propertyId/force-terminations/:forceTerminationId"
          element={(
            <>
              <ForceTerminationDetailPage />
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
  vi.mocked(getForceTermination).mockResolvedValue(forceTermination);
  vi.mocked(getLease).mockResolvedValue({
    id: 'lease-1',
    property_id: 'property-1',
    room_id: 'room-1',
    tenant_id: 'tenant-1',
    status: 'force_terminated',
    deposit_amount: 36000,
    deposit_status: 'held',
    deposit_refund_amount: null,
    deposit_deduction_amount: null,
  });
  vi.mocked(updateLeaseDeposit).mockResolvedValue({
    id: 'lease-1',
    property_id: 'property-1',
    room_id: 'room-1',
    tenant_id: 'tenant-1',
    status: 'force_terminated',
    deposit_amount: 36000,
    deposit_status: 'settled',
    deposit_refund_amount: 30000,
    deposit_deduction_amount: 6000,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ForceTerminationDetailPage', () => {
  it('loads and renders force termination detail from the route id', async () => {
    renderForceTerminationPage();

    await waitFor(() => {
      expect(getForceTermination).toHaveBeenCalledWith(
        'force-termination-1',
        authMocks.getAccessToken,
        expect.any(Object),
      );
    });

    expect(await screen.findByRole('heading', { name: 'A101' })).toBeTruthy();
    expect(screen.getAllByText('處理中').length).toBeGreaterThan(0);
    expect(screen.getByText('大安物業')).toBeTruthy();
    expect(screen.getByText('林家妤')).toBeTruthy();
    expect(screen.getByText('租客失聯且欠繳租金')).toBeTruthy();
    expect(screen.getByText('押金沖銷')).toBeTruthy();
    expect(screen.getByText('營運人員')).toBeTruthy();
    expect(screen.getByText('2026-04')).toBeTruthy();
    expect(screen.getByText('租金')).toBeTruthy();
    expect(screen.getByText('已處理')).toBeTruthy();
    expect(screen.queryByText('force-termination-1')).toBeNull();
  });

  it('offers deposit settlement when force termination kept the deposit held', async () => {
    vi.mocked(getForceTermination).mockResolvedValue({
      ...forceTermination,
      deposit_handling: 'keep_held',
      status: 'completed',
    });

    renderForceTerminationPage();

    expect(await screen.findByText('尚未處理押金')).toBeTruthy();
    expect(screen.getByText('NT$36,000 / 保留中')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '押金處理' }));
    fireEvent.change(screen.getByLabelText('refund_amount'), { target: { value: '30000' } });
    fireEvent.change(screen.getByLabelText('deduction_amount'), { target: { value: '6000' } });
    fireEvent.change(screen.getByLabelText('deduction_reason'), { target: { value: '牆面修繕' } });
    fireEvent.click(screen.getByRole('button', { name: '確認處理押金' }));

    await waitFor(() => {
      expect(updateLeaseDeposit).toHaveBeenCalledWith(
        'lease-1',
        {
          refund_amount: 30000,
          deduction_amount: 6000,
          deduction_reason: '牆面修繕',
        },
        authMocks.getAccessToken,
      );
    });
  });

  it('shows forbidden state when backend returns 403', async () => {
    vi.mocked(getForceTermination).mockRejectedValue(makeApiError(403));

    renderForceTerminationPage();

    expect(await screen.findByText('沒有權限查看此頁')).toBeTruthy();
  });

  it('shows not-found state when backend returns 404', async () => {
    vi.mocked(getForceTermination).mockRejectedValue(makeApiError(404));

    renderForceTerminationPage();

    expect(await screen.findByText('找不到頁面或資料')).toBeTruthy();
  });

  it('redirects expired sessions to login with returnTo', async () => {
    vi.mocked(getForceTermination).mockRejectedValue(makeApiError(401));

    renderForceTerminationPage('/properties/property-1/force-terminations/force-termination-1?from=checkout');

    await waitFor(() => {
      expect(screen.getByLabelText('目前路徑').textContent).toBe(
        '/login?reason=session-expired&returnTo=%2Fproperties%2Fproperty-1%2Fforce-terminations%2Fforce-termination-1%3Ffrom%3Dcheckout',
      );
    });
  });
});
