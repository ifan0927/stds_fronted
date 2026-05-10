// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import PropertyReportsPage from './PropertyReportsPage';

const apiMocks = vi.hoisted(() => ({
  exportPropertyFinancialReportCashflow: vi.fn(),
  exportPropertyFinancialReportProfitLoss: vi.fn(),
  exportPropertyOperationReport: vi.fn(),
  getPropertyFinancialReport: vi.fn(),
  getPropertyFinancialReportSummary: vi.fn(),
  openHtmlDocumentPreview: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(() => 'firebase-token'),
}));

vi.mock('@ant-design/icons', () => ({
  ArrowLeftOutlined: () => null,
  FileTextOutlined: () => null,
  ReloadOutlined: () => null,
}));

vi.mock('../auth', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../api', () => ({
  classifyApiErrorForUi: (error: { uiState?: unknown }) => error.uiState ?? {
    kind: 'retryable',
    title: '暫時無法完成操作',
    description: '系統暫時無法回應，請稍後重試。',
    retryable: true,
  },
  exportPropertyFinancialReportCashflow: apiMocks.exportPropertyFinancialReportCashflow,
  exportPropertyFinancialReportProfitLoss: apiMocks.exportPropertyFinancialReportProfitLoss,
  exportPropertyOperationReport: apiMocks.exportPropertyOperationReport,
  getPropertyFinancialReport: apiMocks.getPropertyFinancialReport,
  getPropertyFinancialReportSummary: apiMocks.getPropertyFinancialReportSummary,
  openHtmlDocumentPreview: apiMocks.openHtmlDocumentPreview,
}));

vi.mock('./routeState', () => ({
  ForbiddenState: () => <div>沒有權限</div>,
  LoadingState: () => <div>載入中</div>,
  NotFoundState: () => <div>找不到資料</div>,
  RetryableErrorState: ({ onRetry }: { onRetry?: () => void }) => (
    <div>
      <span>暫時無法完成操作</span>
      {onRetry && <button onClick={onRetry} type="button">重試</button>}
    </div>
  ),
}));

vi.mock('antd', async () => {
  const React = await import('react');

  type Column = {
    title?: React.ReactNode;
    dataIndex?: string;
    key?: string;
    render?: (value: unknown, record: Record<string, unknown>) => React.ReactNode;
  };

  function getValue(record: Record<string, unknown>, dataIndex: string | undefined) {
    return dataIndex ? record[dataIndex] : undefined;
  }

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
      loading,
      onClick,
    }: React.PropsWithChildren<{
      disabled?: boolean;
      loading?: boolean;
      onClick?: () => void;
    }>) => (
      <button disabled={disabled || loading} onClick={onClick} type="button">{children}</button>
    ),
    Card: ({
      children,
      extra,
      title,
    }: React.PropsWithChildren<{ extra?: React.ReactNode; title?: React.ReactNode }>) => (
      <section>
        {title && <h2>{title}</h2>}
        {extra}
        {children}
      </section>
    ),
    Col: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Empty: ({ description }: { description?: React.ReactNode }) => <div>{description}</div>,
    message: {
      useMessage: () => [{ success: vi.fn(), warning: vi.fn() }, null],
    },
    Row: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Select: ({
      'aria-label': ariaLabel,
      onChange,
      options,
      value,
    }: {
      'aria-label'?: string;
      onChange?: (value: number) => void;
      options?: Array<{ value: number; label: string }>;
      value?: number;
    }) => (
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange?.(Number(event.target.value))}
      >
        {options?.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    ),
    Space: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Table: ({
      columns,
      dataSource,
      rowKey,
    }: {
      columns?: Column[];
      dataSource?: Array<Record<string, unknown>>;
      rowKey?: (record: Record<string, unknown>) => string;
    }) => (
      <table>
        <tbody>
          {dataSource?.map((record, index) => (
            <tr key={rowKey?.(record) ?? index}>
              {columns?.map((column) => (
                <td key={column.key ?? column.dataIndex ?? String(column.title)}>
                  {column.render
                    ? column.render(getValue(record, column.dataIndex), record)
                    : String(getValue(record, column.dataIndex) ?? '')}
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
  };
});

function RouteProbe() {
  const location = useLocation();

  return <span aria-label="目前路徑">{`${location.pathname}${location.search}`}</span>;
}

function renderReportsPage(initialEntry = '/properties/property-1/reports?year=2026&month=5') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <RouteProbe />
      <Routes>
        <Route path="/properties/:propertyId/reports" element={<PropertyReportsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockReportData() {
  apiMocks.getPropertyFinancialReportSummary.mockResolvedValue({
    data: [
      {
        year: 2026,
        month: 5,
        total_income: 185000,
        total_expense: 12000,
        net: 173000,
      },
      {
        year: 2026,
        month: 4,
        total_income: 181000,
        total_expense: 9800,
        net: 171200,
      },
    ],
  });
  apiMocks.getPropertyFinancialReport.mockResolvedValue({
    property_id: 'property-1',
    year: 2026,
    month: 5,
    total_income: 185000,
    total_expense: 12000,
    net: 173000,
    is_finalized: false,
    entries: [
      {
        entry_id: 'entry-1',
        category: 'rent_payment',
        accounting_title_code: '4101',
        accounting_title_name: '租金收入',
        source_date: '2026-05-05',
        room_label: '201',
        tenant_label: '林怡君',
        period_label: '2026 年 5 月',
        display_note: '五月租金',
        amount: 18000,
        source: { type: 'bill', id: 'bill-1', detail: 'payment' },
      },
    ],
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.values(apiMocks).forEach((mock) => mock.mockReset());
  authMocks.getAccessToken.mockReset();
  authMocks.getAccessToken.mockReturnValue('firebase-token');
});

describe('PropertyReportsPage', () => {
  it('normalizes missing report period into route query state before loading', async () => {
    mockReportData();
    const defaultPeriod = new Date();
    const defaultYear = defaultPeriod.getFullYear();
    const defaultMonth = defaultPeriod.getMonth() + 1;

    renderReportsPage('/properties/property-1/reports');

    await waitFor(() => {
      expect(screen.getByLabelText('目前路徑').textContent)
        .toBe(`/properties/property-1/reports?year=${defaultYear}&month=${defaultMonth}`);
      expect(apiMocks.getPropertyFinancialReportSummary).toHaveBeenCalledWith(
        'property-1',
        { year: defaultYear },
        authMocks.getAccessToken,
        expect.any(Object),
      );
      expect(apiMocks.getPropertyFinancialReport).toHaveBeenCalledWith(
        'property-1',
        defaultYear,
        defaultMonth,
        authMocks.getAccessToken,
        expect.any(Object),
      );
    });
  });

  it('loads report summary and monthly detail from explicit route query state', async () => {
    mockReportData();

    renderReportsPage();

    await waitFor(() => {
      expect(apiMocks.getPropertyFinancialReportSummary).toHaveBeenCalledWith(
        'property-1',
        { year: 2026 },
        authMocks.getAccessToken,
        expect.any(Object),
      );
      expect(apiMocks.getPropertyFinancialReport).toHaveBeenCalledWith(
        'property-1',
        2026,
        5,
        authMocks.getAccessToken,
        expect.any(Object),
      );
    });

    expect((await screen.findAllByText('報表中心')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('2026 年 5 月').length).toBeGreaterThan(0);
    expect(screen.getAllByText('NT$185,000').length).toBeGreaterThan(0);
    expect(screen.getByText('五月租金')).toBeTruthy();
    expect((screen.getByRole('button', { name: '寄送業主' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('房客名冊匯出')).toBeTruthy();
    expect(screen.getByText('帳單收據')).toBeTruthy();
    expect(screen.getByText('退租結算匯出')).toBeTruthy();
  });

  it('opens selected month HTML exports through the shared preview helper', async () => {
    mockReportData();
    apiMocks.exportPropertyFinancialReportCashflow.mockResolvedValue({
      html: '<!doctype html>',
      contentType: 'text/html; charset=utf-8',
      contentDisposition: null,
      filename: null,
    });
    apiMocks.openHtmlDocumentPreview.mockReturnValue({ ok: true });
    vi.spyOn(window, 'open').mockReturnValue({
      close: vi.fn(),
      document: {
        close: vi.fn(),
        open: vi.fn(),
        write: vi.fn(),
      },
      focus: vi.fn(),
    } as unknown as Window);

    renderReportsPage();
    await screen.findByText('五月租金');

    fireEvent.click(screen.getAllByRole('button', { name: '收支表' })[0]);

    await waitFor(() => {
      expect(apiMocks.exportPropertyFinancialReportCashflow).toHaveBeenCalledWith(
        'property-1',
        2026,
        5,
        authMocks.getAccessToken,
      );
      expect(apiMocks.openHtmlDocumentPreview).toHaveBeenCalled();
    });
  });

  it('uses the clicked summary row period when opening row export actions', async () => {
    mockReportData();
    apiMocks.exportPropertyFinancialReportProfitLoss.mockResolvedValue({
      html: '<!doctype html>',
      contentType: 'text/html',
      contentDisposition: null,
      filename: null,
    });
    apiMocks.openHtmlDocumentPreview.mockReturnValue({ ok: true });
    vi.spyOn(window, 'open').mockReturnValue({
      close: vi.fn(),
      document: {
        close: vi.fn(),
        open: vi.fn(),
        write: vi.fn(),
      },
      focus: vi.fn(),
    } as unknown as Window);

    renderReportsPage();
    await screen.findByText('五月租金');

    fireEvent.click(screen.getAllByRole('button', { name: '損益表' })[2]);

    await waitFor(() => {
      expect(apiMocks.exportPropertyFinancialReportProfitLoss).toHaveBeenCalledWith(
        'property-1',
        2026,
        4,
        authMocks.getAccessToken,
      );
    });
  });

  it('shows retryable export errors without exposing backend internals', async () => {
    mockReportData();
    apiMocks.exportPropertyFinancialReportCashflow.mockRejectedValue({
      uiState: {
        kind: 'not-found',
        title: '找不到資料',
        description: '資料可能已不存在，請返回列表重新確認。',
        retryable: false,
      },
    });
    vi.spyOn(window, 'open').mockReturnValue({
      close: vi.fn(),
      document: {
        close: vi.fn(),
        open: vi.fn(),
        write: vi.fn(),
      },
      focus: vi.fn(),
    } as unknown as Window);

    renderReportsPage();
    await screen.findByText('五月租金');

    fireEvent.click(screen.getAllByRole('button', { name: '收支表' })[0]);

    expect(await screen.findByText('收支表無法開啟')).toBeTruthy();
    expect(screen.getByText('此月份報表尚不存在，請更換月份或回到年度列表重新確認。')).toBeTruthy();
  });
});
