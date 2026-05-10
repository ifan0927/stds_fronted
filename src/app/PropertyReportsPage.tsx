import {
  ArrowLeftOutlined,
  FileTextOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  message,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  classifyApiErrorForUi,
  exportPropertyFinancialReportCashflow,
  exportPropertyFinancialReportProfitLoss,
  exportPropertyOperationReport,
  getPropertyFinancialReport,
  getPropertyFinancialReportSummary,
  openHtmlDocumentPreview,
  type FinancialReport,
  type FinancialReportEntry,
  type FinancialReportList,
  type FinancialReportSummaryItem,
  type HtmlPreviewWindow,
  type UiErrorState,
} from '../api';
import { useAuth } from '../auth';
import { formatTwd } from './format';
import { abortRequest } from './requestAbort';
import {
  ForbiddenState,
  LoadingState,
  NotFoundState,
  RetryableErrorState,
} from './routeState';

type SummaryLoadState =
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: FinancialReportList }
  | { status: 'forbidden'; data: null }
  | { status: 'not-found'; data: null }
  | { status: 'error'; data: null };

type DetailLoadState =
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: FinancialReport }
  | { status: 'forbidden'; data: null }
  | { status: 'not-found'; data: null }
  | { status: 'error'; data: null };

type ExportKind = 'cashflow' | 'profit-loss' | 'operation';

type ExportErrorState = {
  kind: ExportKind;
  state: UiErrorState;
} | null;

const exportLabels: Record<ExportKind, string> = {
  cashflow: '收支表',
  'profit-loss': '損益表',
  operation: '營運報告',
};

const categoryLabels: Record<NonNullable<FinancialReportEntry['category']>, string> = {
  rent_payment: '租金收入',
  electricity_payment: '電費收入',
  deposit_refund: '押金退還',
  deposit_deduction: '押金扣抵',
  journal_expense: '日誌支出',
};

const sourceLabels: Record<NonNullable<NonNullable<FinancialReportEntry['source']>['type']>, string> = {
  bill: '帳單',
  journal_log: '日誌',
  lease: '租約',
};

function getDefaultReportPeriod(now = new Date()) {
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  };
}

const defaultPeriod = getDefaultReportPeriod();

const yearOptions = Array.from({ length: 6 }, (_item, index) => {
  const year = defaultPeriod.year - index;

  return { value: year, label: `${year} 年` };
});

const monthOptions = Array.from({ length: 12 }, (_item, index) => {
  const month = index + 1;

  return { value: month, label: `${month} 月` };
});

function getValidYear(value: string | null) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : defaultPeriod.year;
}

function getValidMonth(value: string | null) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : defaultPeriod.month;
}

function getReportsReturnTo(pathname: string, search: string) {
  return `/login?reason=session-expired&returnTo=${encodeURIComponent(`${pathname}${search}`)}`;
}

function getOptionalText(value: string | null | undefined) {
  return value && value.trim().length > 0 ? value : '未提供';
}

function getAmountText(value: number | null | undefined) {
  return value === null || value === undefined ? '未提供' : formatTwd(value);
}

function getSignedAmountText(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '未提供';
  }

  return value < 0 ? `- ${formatTwd(Math.abs(value))}` : formatTwd(value);
}

function getMonthLabel(year: number | undefined, month: number | undefined) {
  return year && month ? `${year} 年 ${month} 月` : '月份未提供';
}

function getReportStatusTag(report: FinancialReport | null) {
  if (!report) {
    return <Tag>狀態待載入</Tag>;
  }

  return report.is_finalized
    ? <Tag color="green">已月結</Tag>
    : <Tag color="blue">即時資料</Tag>;
}

function getCategoryLabel(category: FinancialReportEntry['category']) {
  return category ? categoryLabels[category] : '未分類';
}

function getSourceLabel(source: FinancialReportEntry['source']) {
  return source?.type ? sourceLabels[source.type] : '來源未提供';
}

function getExportFailureDescription(state: UiErrorState) {
  if (state.kind === 'not-found') {
    return '此月份報表尚不存在，請更換月份或回到年度列表重新確認。';
  }

  if (state.kind === 'forbidden') {
    return '目前帳號沒有此物業報表的存取權限。';
  }

  if (state.kind === 'validation') {
    return '報表參數未通過檢查，請確認年度與月份後再試一次。';
  }

  return state.description;
}

export default function PropertyReportsPage() {
  const { propertyId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { getAccessToken } = useAuth();
  const [messageApi, contextHolder] = message.useMessage();
  const summaryRequestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const detailRequestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const summaryRequestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);
  const [summaryState, setSummaryState] = useState<SummaryLoadState>({ status: 'loading', data: null });
  const [detailState, setDetailState] = useState<DetailLoadState>({ status: 'loading', data: null });
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const [exportError, setExportError] = useState<ExportErrorState>(null);
  const rawYear = searchParams.get('year');
  const rawMonth = searchParams.get('month');
  const selectedYear = getValidYear(rawYear);
  const selectedMonth = getValidMonth(rawMonth);
  const normalizedYear = String(selectedYear);
  const normalizedMonth = String(selectedMonth);
  const shouldNormalizeReportPeriod = rawYear !== normalizedYear || rawMonth !== normalizedMonth;

  const setReportPeriod = useCallback((year: number, month: number) => {
    setSearchParams((previous) => {
      const updated = new URLSearchParams(previous);
      updated.set('year', String(year));
      updated.set('month', String(month));
      return updated;
    });
  }, [setSearchParams]);

  const loadSummary = useCallback(() => {
    if (!propertyId) {
      setSummaryState({ status: 'not-found', data: null });
      return;
    }

    abortRequest(summaryRequestRef.current?.controller);
    const controller = new AbortController();
    const requestId = summaryRequestIdRef.current + 1;
    summaryRequestIdRef.current = requestId;
    summaryRequestRef.current = { id: requestId, controller };
    setSummaryState({ status: 'loading', data: null });

    void getPropertyFinancialReportSummary(
      propertyId,
      { year: selectedYear },
      getAccessToken,
      { signal: controller.signal },
    )
      .then((response) => {
        if (summaryRequestRef.current?.id !== requestId) {
          return;
        }

        setSummaryState({ status: 'ready', data: response });
      })
      .catch((error: unknown) => {
        if (summaryRequestRef.current?.id !== requestId) {
          return;
        }

        const errorState = classifyApiErrorForUi(error);

        if (errorState.kind === 'cancelled') {
          return;
        }

        if (errorState.kind === 'unauthorized') {
          navigate(getReportsReturnTo(location.pathname, location.search), { replace: true });
          return;
        }

        if (errorState.kind === 'forbidden') {
          setSummaryState({ status: 'forbidden', data: null });
          return;
        }

        if (errorState.kind === 'not-found') {
          setSummaryState({ status: 'not-found', data: null });
          return;
        }

        setSummaryState({ status: 'error', data: null });
      });
  }, [getAccessToken, location.pathname, location.search, navigate, propertyId, selectedYear]);

  const loadDetail = useCallback(() => {
    if (!propertyId) {
      setDetailState({ status: 'not-found', data: null });
      return;
    }

    abortRequest(detailRequestRef.current?.controller);
    const controller = new AbortController();
    const requestId = detailRequestIdRef.current + 1;
    detailRequestIdRef.current = requestId;
    detailRequestRef.current = { id: requestId, controller };
    setDetailState({ status: 'loading', data: null });

    void getPropertyFinancialReport(
      propertyId,
      selectedYear,
      selectedMonth,
      getAccessToken,
      { signal: controller.signal },
    )
      .then((response) => {
        if (detailRequestRef.current?.id !== requestId) {
          return;
        }

        setDetailState({ status: 'ready', data: response });
      })
      .catch((error: unknown) => {
        if (detailRequestRef.current?.id !== requestId) {
          return;
        }

        const errorState = classifyApiErrorForUi(error);

        if (errorState.kind === 'cancelled') {
          return;
        }

        if (errorState.kind === 'unauthorized') {
          navigate(getReportsReturnTo(location.pathname, location.search), { replace: true });
          return;
        }

        if (errorState.kind === 'forbidden') {
          setDetailState({ status: 'forbidden', data: null });
          return;
        }

        if (errorState.kind === 'not-found') {
          setDetailState({ status: 'not-found', data: null });
          return;
        }

        setDetailState({ status: 'error', data: null });
      });
  }, [
    getAccessToken,
    location.pathname,
    location.search,
    navigate,
    propertyId,
    selectedMonth,
    selectedYear,
  ]);

  useEffect(() => {
    if (!shouldNormalizeReportPeriod) {
      return;
    }

    setSearchParams((previous) => {
      const updated = new URLSearchParams(previous);
      updated.set('year', normalizedYear);
      updated.set('month', normalizedMonth);
      return updated;
    }, { replace: true });
  }, [
    normalizedMonth,
    normalizedYear,
    setSearchParams,
    shouldNormalizeReportPeriod,
  ]);

  useEffect(() => {
    if (shouldNormalizeReportPeriod) {
      return undefined;
    }

    loadSummary();

    return () => abortRequest(summaryRequestRef.current?.controller);
  }, [loadSummary, shouldNormalizeReportPeriod]);

  useEffect(() => {
    if (shouldNormalizeReportPeriod) {
      return undefined;
    }

    loadDetail();

    return () => abortRequest(detailRequestRef.current?.controller);
  }, [loadDetail, shouldNormalizeReportPeriod]);

  const openReportExport = useCallback(async (
    kind: ExportKind,
    period: { year: number; month: number } = { year: selectedYear, month: selectedMonth },
  ) => {
    if (!propertyId) {
      return;
    }

    const previewWindow = window.open('', '_blank');
    setExporting(kind);
    setExportError(null);

    try {
      const response = kind === 'cashflow'
        ? await exportPropertyFinancialReportCashflow(propertyId, period.year, period.month, getAccessToken)
        : kind === 'profit-loss'
          ? await exportPropertyFinancialReportProfitLoss(propertyId, period.year, period.month, getAccessToken)
          : await exportPropertyOperationReport(propertyId, period.year, period.month, getAccessToken);
      const result = openHtmlDocumentPreview(response, previewWindow as HtmlPreviewWindow | null);

      if (!result.ok) {
        void messageApi.warning(
          result.reason === 'popup-blocked'
            ? '瀏覽器阻擋了報表預覽視窗，請允許彈出視窗後再試一次。'
            : '報表預覽格式無法開啟。',
        );
        return;
      }

      void messageApi.success(`${exportLabels[kind]}已開啟。`);
    } catch (error: unknown) {
      previewWindow?.close();
      const errorState = classifyApiErrorForUi(error);

      if (errorState.kind === 'unauthorized') {
        navigate(getReportsReturnTo(location.pathname, location.search), { replace: true });
        return;
      }

      setExportError({ kind, state: errorState });
    } finally {
      setExporting(null);
    }
  }, [
    getAccessToken,
    location.pathname,
    location.search,
    messageApi,
    navigate,
    propertyId,
    selectedMonth,
    selectedYear,
  ]);

  const summaryRows = summaryState.status === 'ready' ? summaryState.data.data ?? [] : [];
  const selectedReport = detailState.status === 'ready' ? detailState.data : null;
  const selectedEntries = selectedReport?.entries ?? [];
  const selectedMonthLabel = getMonthLabel(selectedYear, selectedMonth);

  const summaryColumns = useMemo<TableColumnsType<FinancialReportSummaryItem>>(() => [
    {
      title: '月份',
      key: 'month',
      width: 130,
      render: (_value, record) => getMonthLabel(record.year, record.month),
    },
    {
      title: '收入',
      dataIndex: 'total_income',
      width: 150,
      align: 'right',
      render: (value: number | null | undefined) => getAmountText(value),
    },
    {
      title: '支出',
      dataIndex: 'total_expense',
      width: 150,
      align: 'right',
      render: (value: number | null | undefined) => getAmountText(value),
    },
    {
      title: '淨額',
      dataIndex: 'net',
      width: 150,
      align: 'right',
      render: (value: number | null | undefined) => getSignedAmountText(value),
    },
    {
      title: '操作',
      key: 'actions',
      width: 360,
      render: (_value, record) => {
        const year = record.year ?? selectedYear;
        const month = record.month ?? selectedMonth;

        return (
          <Space size={8} wrap>
            <Button size="small" type="primary" onClick={() => setReportPeriod(year, month)}>
              明細
            </Button>
            <Button size="small" loading={exporting === 'cashflow'} onClick={() => void openReportExport('cashflow', { year, month })}>
              收支表
            </Button>
            <Button size="small" loading={exporting === 'profit-loss'} onClick={() => void openReportExport('profit-loss', { year, month })}>
              損益表
            </Button>
            <Button size="small" loading={exporting === 'operation'} onClick={() => void openReportExport('operation', { year, month })}>
              營運報告
            </Button>
          </Space>
        );
      },
    },
  ], [exporting, openReportExport, selectedMonth, selectedYear, setReportPeriod]);

  const entryColumns = useMemo<TableColumnsType<FinancialReportEntry>>(() => [
    {
      title: '日期',
      dataIndex: 'source_date',
      width: 120,
      render: (value: string | null | undefined) => getOptionalText(value),
    },
    {
      title: '科目',
      key: 'accounting_title',
      width: 170,
      render: (_value, record) => (
        <div className="table-cell-stack">
          <Typography.Text strong>{getOptionalText(record.accounting_title_code)}</Typography.Text>
          <Typography.Text type="secondary">{getOptionalText(record.accounting_title_name)}</Typography.Text>
        </div>
      ),
    },
    {
      title: '類別',
      dataIndex: 'category',
      width: 128,
      render: (value: FinancialReportEntry['category']) => (
        <Tag color={value === 'journal_expense' ? 'orange' : 'green'}>{getCategoryLabel(value)}</Tag>
      ),
    },
    {
      title: '來源',
      dataIndex: 'source',
      width: 110,
      render: (value: FinancialReportEntry['source']) => <Tag>{getSourceLabel(value)}</Tag>,
    },
    {
      title: '房間',
      dataIndex: 'room_label',
      width: 120,
      render: (value: string | null | undefined) => getOptionalText(value),
    },
    {
      title: '租客',
      dataIndex: 'tenant_label',
      width: 140,
      render: (value: string | null | undefined) => getOptionalText(value),
    },
    {
      title: '期別',
      dataIndex: 'period_label',
      width: 150,
      render: (value: string | null | undefined) => getOptionalText(value),
    },
    {
      title: '摘要',
      dataIndex: 'display_note',
      width: 220,
      render: (value: string | null | undefined) => getOptionalText(value),
    },
    {
      title: '金額',
      dataIndex: 'amount',
      width: 140,
      align: 'right',
      render: (value: number | null | undefined) => getSignedAmountText(value),
    },
  ], []);

  if (summaryState.status === 'loading') {
    return <LoadingState />;
  }

  if (summaryState.status === 'forbidden') {
    return <ForbiddenState />;
  }

  if (summaryState.status === 'not-found') {
    return <NotFoundState />;
  }

  if (summaryState.status === 'error') {
    return <RetryableErrorState onRetry={() => loadSummary()} />;
  }

  return (
    <Space direction="vertical" size={16} className="page-stack">
      {contextHolder}
      <div className="page-header">
        <div>
          <Space size={8} wrap>
            <Tag color="blue">報表中心</Tag>
            <Tag>{selectedMonthLabel}</Tag>
            {getReportStatusTag(selectedReport)}
          </Space>
          <Typography.Title level={1}>報表中心</Typography.Title>
          <Typography.Paragraph type="secondary">
            查閱物業財務報表，並開啟系統產生的收支表、損益表與營運報告。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(propertyId ? `/properties/${propertyId}` : '/properties')}>
            回物業工作台
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => {
            loadSummary();
            loadDetail();
          }}
          >
            重新整理
          </Button>
        </Space>
      </div>

      <div className="filter-toolbar">
        <Space size={12} wrap>
          <div className="filter-field">
            <Typography.Text type="secondary">年度</Typography.Text>
            <Select
              aria-label="選擇年度"
              className="filter-select"
              value={selectedYear}
              options={yearOptions}
              onChange={(value) => setReportPeriod(value, selectedMonth)}
            />
          </div>
          <div className="filter-field">
            <Typography.Text type="secondary">月份</Typography.Text>
            <Select
              aria-label="選擇月份"
              className="filter-select"
              value={selectedMonth}
              options={monthOptions}
              onChange={(value) => setReportPeriod(selectedYear, value)}
            />
          </div>
        </Space>
        <Space wrap>
          <Button loading={exporting === 'cashflow'} onClick={() => void openReportExport('cashflow')}>
            收支表
          </Button>
          <Button loading={exporting === 'profit-loss'} onClick={() => void openReportExport('profit-loss')}>
            損益表
          </Button>
          <Button loading={exporting === 'operation'} onClick={() => void openReportExport('operation')}>
            營運報告
          </Button>
          <Tooltip title="寄送業主流程尚未開放，此階段只保留入口位置。">
            <Button disabled>寄送業主</Button>
          </Tooltip>
        </Space>
      </div>

      {exportError && (
        <Alert
          type="error"
          showIcon
          message={`${exportLabels[exportError.kind]}無法開啟`}
          description={getExportFailureDescription(exportError.state)}
          action={
            exportError.state.retryable
              ? <Button size="small" onClick={() => void openReportExport(exportError.kind)}>重試</Button>
              : undefined
          }
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card className="dashboard-metric-card">
            <Typography.Text type="secondary">選取月份收入</Typography.Text>
            <Typography.Title level={2}>{getAmountText(selectedReport?.total_income)}</Typography.Title>
            <Typography.Text type="secondary">系統提供的收入總額</Typography.Text>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="dashboard-metric-card">
            <Typography.Text type="secondary">選取月份支出</Typography.Text>
            <Typography.Title level={2}>{getAmountText(selectedReport?.total_expense)}</Typography.Title>
            <Typography.Text type="secondary">系統提供的支出總額</Typography.Text>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="dashboard-metric-card">
            <div className="metric-card-heading">
              <Typography.Text type="secondary">選取月份淨額</Typography.Text>
              {getReportStatusTag(selectedReport)}
            </div>
            <Typography.Title level={2}>{getSignedAmountText(selectedReport?.net)}</Typography.Title>
            <Typography.Text type="secondary">系統提供的收支淨額</Typography.Text>
          </Card>
        </Col>
      </Row>

      <Card title={`${selectedYear} 年月份摘要`}>
        {summaryRows.length > 0 ? (
          <Table
            rowKey={(record) => `${record.year}-${record.month}`}
            columns={summaryColumns}
            dataSource={summaryRows}
            pagination={false}
            scroll={{ x: 940 }}
          />
        ) : (
          <Empty description="此年度目前沒有報表摘要。" />
        )}
      </Card>

      <Card
        title={`${selectedMonthLabel} 月報明細`}
        extra={getReportStatusTag(selectedReport)}
      >
        {detailState.status === 'loading' && <LoadingState />}
        {detailState.status === 'forbidden' && <ForbiddenState />}
        {detailState.status === 'not-found' && (
          <Empty description="此月份目前沒有財務報表。" />
        )}
        {detailState.status === 'error' && <RetryableErrorState onRetry={() => loadDetail()} />}
        {detailState.status === 'ready' && (
          selectedEntries.length > 0 ? (
            <Table
              rowKey={(record) => record.entry_id ?? `${record.source_date}-${record.category}-${record.amount}`}
              columns={entryColumns}
              dataSource={selectedEntries}
              pagination={{ pageSize: 20, showSizeChanger: false }}
              scroll={{ x: 1300 }}
            />
          ) : (
            <Empty description="此月份目前沒有報表明細。" />
          )
        )}
      </Card>

      <Card title="其他報表入口">
        <div className="property-link-grid">
          <span className="property-link-row disabled-link-row" aria-disabled="true">
            <Space size={12} align="start">
              <span className="property-link-icon"><FileTextOutlined /></span>
              <span>
                <Typography.Text strong>房客名冊匯出</Typography.Text>
                <Typography.Text type="secondary">此入口由租客與租約/物業脈絡承接，本輪只保留報表中心位置。</Typography.Text>
              </span>
            </Space>
          </span>
          <span className="property-link-row disabled-link-row" aria-disabled="true">
            <Space size={12} align="start">
              <span className="property-link-icon"><FileTextOutlined /></span>
              <span>
                <Typography.Text strong>帳單收據</Typography.Text>
                <Typography.Text type="secondary">收據預覽屬於帳單收款流程，本輪不實作內容。</Typography.Text>
              </span>
            </Space>
          </span>
          <span className="property-link-row disabled-link-row" aria-disabled="true">
            <Space size={12} align="start">
              <span className="property-link-icon"><FileTextOutlined /></span>
              <span>
                <Typography.Text strong>退租結算匯出</Typography.Text>
                <Typography.Text type="secondary">退租結算與 finalization 由後續流程承接，本輪只保留入口位置。</Typography.Text>
              </span>
            </Space>
          </span>
        </div>
      </Card>
    </Space>
  );
}
