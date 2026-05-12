// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  getLease,
  getTenant,
  listBills,
  listTenantLeases,
} from '../api';
import LeaseDetailPage from './LeaseDetailPage';
import TenantDetailPage from './TenantDetailPage';

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
  AuditOutlined: () => null,
  EditOutlined: () => null,
  FileTextOutlined: () => null,
  PaperClipOutlined: () => null,
  PlusOutlined: () => null,
  ReloadOutlined: () => null,
  SaveOutlined: () => null,
  SwapOutlined: () => null,
}));

vi.mock('antd', async () => {
  const React = await import('react');

  type Column = {
    title?: React.ReactNode;
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

  const Form = Object.assign(
    ({ children }: React.PropsWithChildren) => <form>{children}</form>,
    {
      Item: ({ children, label }: React.PropsWithChildren<{ label?: React.ReactNode }>) => (
        <label>
          {label && <span>{label}</span>}
          {children}
        </label>
      ),
      List: ({ children }: { children: (fields: unknown[], operations: { add: () => void; remove: () => void }) => React.ReactNode }) => (
        <div>{children([], { add: vi.fn(), remove: vi.fn() })}</div>
      ),
      useForm: () => [{
        setFields: vi.fn(),
        setFieldsValue: vi.fn(),
      }],
    },
  );

  return {
    Alert: ({ action, description, message }: { action?: React.ReactNode; description?: React.ReactNode; message?: React.ReactNode }) => (
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
    }: React.PropsWithChildren<{ disabled?: boolean; onClick?: () => void }>) => (
      <button disabled={disabled} onClick={onClick} type="button">{children}</button>
    ),
    Card: ({ children, extra, title }: React.PropsWithChildren<{ extra?: React.ReactNode; title?: React.ReactNode }>) => (
      <section>
        {title && <h2>{title}</h2>}
        {extra}
        {children}
      </section>
    ),
    DatePicker: () => <input type="date" />,
    Descriptions,
    Form,
    Input: () => <input />,
    InputNumber: () => <input type="number" />,
    Modal: ({ children, open, title }: React.PropsWithChildren<{ open?: boolean; title?: React.ReactNode }>) => (
      open ? (
        <section>
          {title && <h2>{title}</h2>}
          {children}
        </section>
      ) : null
    ),
    Select: ({ value }: { value?: string }) => <select aria-label="租金帳單狀態" value={value} onChange={vi.fn()} />,
    Space: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Spin: () => <div>載入中</div>,
    Table: ({ columns, dataSource }: { columns: Column[]; dataSource?: Record<string, unknown>[] }) => (
      <table>
        <tbody>
          {(dataSource ?? []).map((record, index) => (
            <tr key={String(record.id ?? index)}>
              {columns.map((column) => (
                <td key={String(column.key ?? column.dataIndex ?? column.title)}>
                  {column.render
                    ? column.render(getCellValue(record, column.dataIndex), record)
                    : getCellValue(record, column.dataIndex) as React.ReactNode}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    ),
    Tag: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
    Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
    Typography: {
      Paragraph: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
      Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
      Title: ({ children }: React.PropsWithChildren) => <h1>{children}</h1>,
    },
    message: {
      error: vi.fn(),
      useMessage: () => [{ success: vi.fn(), error: vi.fn(), warning: vi.fn() }, null],
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
    listTenantLeases: vi.fn(),
    updateLease: vi.fn(),
    updateTenant: vi.fn(),
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

vi.mock('./attachments', () => ({
  LeaseAttachmentManager: ({ leaseId }: { leaseId: string }) => (
    <section aria-label="租約附件">租約附件管理：{leaseId}</section>
  ),
  TenantAttachmentManager: ({ tenantId }: { tenantId: string }) => (
    <section aria-label="租客附件">租客附件管理：{tenantId}</section>
  ),
}));

function renderTenantDetailPage(initialEntry = '/properties/property-1/tenants/tenant-1') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/properties/:propertyId/tenants/:tenantId" element={<TenantDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderLeaseDetailPage(initialEntry = '/properties/property-1/leases/lease-1') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/properties/:propertyId/leases/:leaseId" element={<LeaseDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  authMocks.currentUser.role = 'organizer';
});

describe('TenantDetailPage', () => {
  it('loads tenant detail and lease history with a lease detail entry', async () => {
    vi.mocked(getTenant).mockResolvedValue({
      id: 'tenant-1',
      name: '林家妤',
      email: 'tenant@example.com',
      status: 'active',
    });
    vi.mocked(listTenantLeases).mockResolvedValue({
      data: [{
        id: 'lease-1',
        tenant_id: 'tenant-1',
        room_id: 'room-1',
        room_label: '101 室',
        status: 'active',
        rent_amount: 18000,
        rent_billing_cadence: 'monthly',
      }],
    });

    renderTenantDetailPage();

    expect((await screen.findAllByText('林家妤')).length).toBeGreaterThan(0);
    expect(listTenantLeases).toHaveBeenCalledWith(
      'tenant-1',
      expect.any(Function),
      {},
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getByRole('link', { name: '租約詳情' }).getAttribute('href')).toBe('/properties/property-1/leases/lease-1?roomId=room-1&tenantId=tenant-1');
    expect(screen.getByText(/租客備註、付款、收據與附件上傳由後續工作流承接/)).toBeTruthy();
    expect(screen.getByLabelText('租客附件').textContent).toContain('tenant-1');
  });
});

describe('LeaseDetailPage', () => {
  it('loads lease detail and rent bills with backend rent filters', async () => {
    vi.mocked(getLease).mockResolvedValue({
      id: 'lease-1',
      tenant_id: 'tenant-1',
      tenant_label: '林家妤',
      room_id: 'room-1',
      room_label: '101 室',
      status: 'active',
      rent_amount: 18000,
      rent_billing_cadence: 'monthly',
    });
    vi.mocked(listBills).mockResolvedValue({
      data: [{
        id: 'bill-1',
        lease_id: 'lease-1',
        type: 'rent',
        status: 'paid',
        amount: 18000,
        period_label: '2026-06',
      }],
      pagination: { page: 2, limit: 50, total: 1, total_pages: 1, has_next: false },
    });

    renderLeaseDetailPage('/properties/property-1/leases/lease-1?status=paid&page=2&limit=50');

    expect((await screen.findAllByText('101 室')).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(listBills).toHaveBeenCalledWith(
        expect.any(Function),
        { lease_id: 'lease-1', type: 'rent', status: 'paid', page: 2, limit: 50 },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
    expect(screen.getByRole('link', { name: '收據' }).getAttribute('href')).toBe('/properties/property-1/billing?roomId=room-1&leaseId=lease-1&tenantId=tenant-1&billId=bill-1&view=rent-receipt');
    expect(screen.getByLabelText('租約附件').textContent).toContain('lease-1');
  });

  it('keeps lease adjustment disabled for staff while preserving deferred workflow entries', async () => {
    authMocks.currentUser.role = 'staff';
    vi.mocked(getLease).mockResolvedValue({
      id: 'lease-1',
      tenant_id: 'tenant-1',
      tenant_label: '林家妤',
      room_id: 'room-1',
      room_label: '101 室',
      status: 'active',
    });
    vi.mocked(listBills).mockResolvedValue({ data: [] });

    renderLeaseDetailPage();

    const adjustButton = await screen.findByRole('button', { name: '調整租金' });

    expect(adjustButton.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('租約更換')).toBeTruthy();
    expect(screen.getByLabelText('租約附件').textContent).toContain('lease-1');
  });
});
