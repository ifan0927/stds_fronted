import {
  ArrowLeftOutlined,
  EyeOutlined,
  HistoryOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  classifyApiErrorForUi,
  getBill,
  listPropertyMeterHistory,
  listRoomMeterHistory,
  type BillingBill,
  type BillingBillList,
  type PropertyMeterHistory,
  type PropertyMeterHistoryRow,
} from '../api';
import { useAuth } from '../auth';
import { formatDashboardDateTime, formatTwd } from './format';
import { abortRequest } from './requestAbort';
import {
  ForbiddenState,
  LoadingState,
  NotFoundState,
  RetryableErrorState,
} from './routeState';
import { getBillStatusLabel, getOptionalText, getStatusColor } from './tenantLeaseDetail';

type HistoryMode = 'property' | 'room';

type HistoryLoadState =
  | { status: 'loading'; mode: HistoryMode; data: null }
  | { status: 'ready'; mode: 'property'; data: PropertyMeterHistory }
  | { status: 'ready'; mode: 'room'; data: BillingBillList }
  | { status: 'forbidden'; mode: HistoryMode; data: null }
  | { status: 'not-found'; mode: HistoryMode; data: null }
  | { status: 'error'; mode: HistoryMode; data: null };

type BillDetailState =
  | { status: 'idle'; data: null }
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: BillingBill }
  | { status: 'forbidden'; data: null }
  | { status: 'not-found'; data: null }
  | { status: 'error'; data: null };

function getDefaultHistoryPeriod(now = new Date()) {
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  return {
    year: previousMonthDate.getFullYear(),
    month: previousMonthDate.getMonth() + 1,
  };
}

const defaultHistoryPeriod = getDefaultHistoryPeriod();
const defaultYear = defaultHistoryPeriod.year;
const defaultMonth = defaultHistoryPeriod.month;
const yearOptions = Array.from({ length: 6 }, (_item, index) => {
  const year = defaultYear - index;

  return { value: year, label: String(year) };
});

const monthOptions: Array<{ value: number | 'all'; label: string }> = [
  { value: 'all', label: '全年' },
  { value: 1, label: '1 月' },
  { value: 2, label: '2 月' },
  { value: 3, label: '3 月' },
  { value: 4, label: '4 月' },
  { value: 5, label: '5 月' },
  { value: 6, label: '6 月' },
  { value: 7, label: '7 月' },
  { value: 8, label: '8 月' },
  { value: 9, label: '9 月' },
  { value: 10, label: '10 月' },
  { value: 11, label: '11 月' },
  { value: 12, label: '12 月' },
];
const roomMonthOptions = monthOptions.filter((option): option is { value: number; label: string } => (
  option.value !== 'all'
));

function getPositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getValidMonth(value: string | null) {
  if (value === 'all') {
    return null;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : undefined;
}

function getMeterHistoryReturnTo(pathname: string, search: string) {
  return `/login?reason=session-expired&returnTo=${encodeURIComponent(`${pathname}${search}`)}`;
}

function getDateText(value: string | null | undefined) {
  return value && value.trim().length > 0 ? value : '未提供';
}

function getDateTimeText(value: string | null | undefined) {
  return value ? formatDashboardDateTime(value) : '未提供';
}

function getNumberText(value: number | null | undefined) {
  return value === null || value === undefined ? '未提供' : String(value);
}

function getAmountText(value: number | null | undefined) {
  return value === null || value === undefined ? '待系統計算' : formatTwd(value);
}

function getMoneySummaryText(value: number) {
  return value === 0 ? 'NT$0' : formatTwd(value);
}

function getPeriodText(row: {
  period_label?: string | null;
  period_start?: string | null;
  period_end?: string | null;
}) {
  if (row.period_label) {
    return row.period_label;
  }

  if (row.period_start || row.period_end) {
    return `${getDateText(row.period_start)} ~ ${getDateText(row.period_end)}`;
  }

  return '未提供';
}

function getHistoryRowMonth(row: {
  due_date?: string | null;
  period_start?: string | null;
  meter_recorded_at?: string | null;
}) {
  const source = row.period_start ?? row.due_date ?? row.meter_recorded_at;

  if (!source) {
    return undefined;
  }

  const match = source.match(/^(\d{4})-(\d{2})/);

  if (!match) {
    return undefined;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
  };
}

function isHistoryRowInMonth(
  row: {
    due_date?: string | null;
    period_start?: string | null;
    meter_recorded_at?: string | null;
  },
  year: number,
  month: number,
) {
  const rowMonth = getHistoryRowMonth(row);

  return rowMonth?.year === year && rowMonth.month === month;
}

function getMeterUsage(row: PropertyMeterHistoryRow | BillingBill) {
  if ('usage' in row && typeof row.usage === 'number') {
    return row.usage;
  }

  const previous = 'meter_previous_reading' in row ? row.meter_previous_reading : undefined;
  const current = 'meter_current_reading' in row ? row.meter_current_reading : undefined;

  if (typeof previous === 'number' && typeof current === 'number') {
    return current - previous;
  }

  return undefined;
}

function getMeterRoomLabel(row: PropertyMeterHistoryRow | BillingBill) {
  return row.room_label ?? row.room_id;
}

function getMeterTenantLabel(row: PropertyMeterHistoryRow | BillingBill) {
  return row.tenant_label ?? row.tenant_id;
}

type MeterHistorySummary = {
  amountTotal: number;
  amountRows: number;
  highestUsageRow: PropertyMeterHistoryRow | BillingBill | null;
  rows: number;
  statusCounts: Record<string, number>;
  usageTotal: number;
};

function getMeterHistorySummary(rows: Array<PropertyMeterHistoryRow | BillingBill>): MeterHistorySummary {
  return rows.reduce<MeterHistorySummary>((summary, row) => {
    const usage = getMeterUsage(row);
    const amount = row.amount;
    const status = row.status ?? 'unknown';

    if (typeof usage === 'number') {
      summary.usageTotal += usage;

      const highestUsage = summary.highestUsageRow ? getMeterUsage(summary.highestUsageRow) : undefined;
      if (highestUsage === undefined || usage > highestUsage) {
        summary.highestUsageRow = row;
      }
    }

    if (typeof amount === 'number') {
      summary.amountTotal += amount;
      summary.amountRows += 1;
    }

    summary.rows += 1;
    summary.statusCounts[status] = (summary.statusCounts[status] ?? 0) + 1;

    return summary;
  }, {
    amountTotal: 0,
    amountRows: 0,
    highestUsageRow: null,
    rows: 0,
    statusCounts: {},
    usageTotal: 0,
  });
}

function getTrackingCount(summary: MeterHistorySummary) {
  return (summary.statusCounts.pending_payment ?? 0) + (summary.statusCounts.overdue ?? 0);
}

function getStatusSegments(summary: MeterHistorySummary) {
  const statusOrder = ['paid', 'pending_payment', 'overdue', 'pending_meter', 'voided', 'written_off'];

  return statusOrder
    .map((status) => ({ status, count: summary.statusCounts[status] ?? 0 }))
    .filter((item) => item.count > 0);
}

function buildBillingPath(propertyId: string | undefined, query?: Record<string, string | undefined>) {
  if (!propertyId) {
    return '/properties';
  }

  const params = new URLSearchParams();

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  const search = params.toString();
  return `/properties/${propertyId}/billing${search ? `?${search}` : ''}`;
}

function getHistoryTitle(roomId: string | null) {
  return roomId ? '房間電表歷史' : '物業電表歷史';
}

function MeterHistorySummaryPanel({ summary }: { summary: MeterHistorySummary }) {
  const highestUsage = summary.highestUsageRow ? getMeterUsage(summary.highestUsageRow) : undefined;
  const statusSegments = getStatusSegments(summary);

  return (
    <Card>
      <div className="meter-summary-heading">
        <div>
          <Typography.Title level={2}>目前篩選輔助摘要</Typography.Title>
          <Typography.Paragraph type="secondary">
            以下數字只用於畫面快速檢視，依目前已載入的電表歷史紀錄計算；正式應收、收入與財務總額請以財務報表頁為準。
          </Typography.Paragraph>
        </div>
      </div>
      <div className="meter-summary-grid">
        <div className="meter-summary-card">
          <Typography.Text type="secondary">紀錄筆數</Typography.Text>
          <Typography.Title level={3}>{summary.rows}</Typography.Title>
          <Typography.Text type="secondary">目前篩選範圍</Typography.Text>
        </div>
        <div className="meter-summary-card">
          <Typography.Text type="secondary">用電度數</Typography.Text>
          <Typography.Title level={3}>{summary.usageTotal}</Typography.Title>
          <Typography.Text type="secondary">已可計算用量加總</Typography.Text>
        </div>
        <div className="meter-summary-card">
          <Typography.Text type="secondary">畫面金額加總</Typography.Text>
          <Typography.Title level={3}>{getMoneySummaryText(summary.amountTotal)}</Typography.Title>
          <Typography.Text type="secondary">{summary.amountRows} 筆已有金額，非正式財報</Typography.Text>
        </div>
        <div className="meter-summary-card">
          <Typography.Text type="secondary">需追蹤</Typography.Text>
          <Typography.Title level={3}>{getTrackingCount(summary)}</Typography.Title>
          <Typography.Text type="secondary">待收款與逾期</Typography.Text>
        </div>
      </div>
      <div className="meter-summary-lower">
        <div className="meter-status-panel">
          <div className="meter-panel-title">狀態分布</div>
          {statusSegments.length > 0 ? (
            <>
              <div className="meter-status-bar" aria-label="狀態分布">
                {statusSegments.map((segment) => (
                  <span
                    className={`meter-status-segment meter-status-${segment.status}`}
                    key={segment.status}
                    style={{ width: `${Math.max((segment.count / summary.rows) * 100, 6)}%` }}
                  />
                ))}
              </div>
              <Space wrap size={[8, 6]}>
                {statusSegments.map((segment) => (
                  <Tag key={segment.status} color={getStatusColor(segment.status)}>
                    {getBillStatusLabel(segment.status as BillingBill['status'])} {segment.count}
                  </Tag>
                ))}
              </Space>
            </>
          ) : (
            <Typography.Text type="secondary">目前沒有可統計的狀態。</Typography.Text>
          )}
        </div>
        <div className="meter-status-panel">
          <div className="meter-panel-title">最高用量</div>
          {summary.highestUsageRow && highestUsage !== undefined ? (
            <Space direction="vertical" size={2}>
              <Typography.Text strong>{getOptionalText(getMeterRoomLabel(summary.highestUsageRow))}</Typography.Text>
              <Typography.Text>
                {getPeriodText(summary.highestUsageRow)} / {highestUsage} 度
              </Typography.Text>
              <Typography.Text type="secondary">
                {getOptionalText(getMeterTenantLabel(summary.highestUsageRow))}
              </Typography.Text>
            </Space>
          ) : (
            <Typography.Text type="secondary">目前沒有可比較的用量。</Typography.Text>
          )}
        </div>
      </div>
    </Card>
  );
}

function RoomHistoryList({
  rows,
  onOpenBill,
  propertyId,
  roomId,
}: {
  rows: BillingBill[];
  onOpenBill: (billId: string | null | undefined) => void;
  propertyId: string | undefined;
  roomId: string | null;
}) {
  if (rows.length === 0) {
    return (
      <Empty description="此房間目前沒有符合條件的電表紀錄">
        <Typography.Paragraph type="secondary">
          可調整月份或回房間詳情確認目前入住與帳單脈絡。
        </Typography.Paragraph>
        {propertyId && roomId && (
          <Link to={`/properties/${propertyId}/rooms/${roomId}`}>回房間詳情</Link>
        )}
      </Empty>
    );
  }

  return (
    <div className="meter-history-list">
      {rows.map((row) => {
        const usage = getMeterUsage(row);

        return (
          <div className="meter-history-item" key={row.id ?? `${row.room_id}-${row.period_start}`}>
            <div className="meter-history-main">
              <div>
                <Space size={8} wrap>
                  <Typography.Text strong>{getPeriodText(row)}</Typography.Text>
                  <Tag color={getStatusColor(row.status)}>{getBillStatusLabel(row.status)}</Tag>
                </Space>
                <Typography.Paragraph type="secondary">
                  {getOptionalText(row.room_label)} / {getOptionalText(row.tenant_label)}
                </Typography.Paragraph>
              </div>
              <Button
                size="small"
                icon={<EyeOutlined />}
                disabled={!row.id}
                onClick={() => onOpenBill(row.id)}
              >
                帳單詳情
              </Button>
            </div>
            <div className="meter-reading-line">
              <span>{getNumberText(row.meter_previous_reading)}</span>
              <span className="meter-reading-arrow">→</span>
              <span>{getNumberText(row.meter_current_reading)}</span>
              <Tag color="blue">用量 {usage === undefined ? '未提供' : `${usage} 度`}</Tag>
            </div>
            <div className="meter-history-meta">
              <span>金額 {getAmountText(row.amount)}</span>
              <span>單價 {getNumberText(row.meter_unit_price)}</span>
              <span>到期 {getDateText(row.due_date)}</span>
              <span>抄表 {getDateTimeText(row.meter_recorded_at)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function MeterHistoryPage() {
  const { propertyId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { getAccessToken } = useAuth();
  const historyRequestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const detailRequestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const loadedHistoryKeyRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);
  const latestLocationRef = useRef({ pathname: location.pathname, search: location.search });
  const roomId = searchParams.get('roomId');
  const rawYear = searchParams.get('year');
  const rawMonth = searchParams.get('month');
  const year = getPositiveInteger(rawYear, defaultYear);
  const parsedMonth = getValidMonth(rawMonth);
  const month = parsedMonth === undefined
    ? (roomId ? defaultMonth : null)
    : parsedMonth;
  const mode: HistoryMode = roomId ? 'room' : 'property';
  const historyKey = `${propertyId ?? ''}|${roomId ?? ''}|${year}|${month ?? 'all'}`;
  const selectedMonthValue: number | 'all' = month ?? 'all';
  const [historyState, setHistoryState] = useState<HistoryLoadState>({ status: 'loading', mode, data: null });
  const [selectedBillId, setSelectedBillId] = useState<string | null>(searchParams.get('billId'));
  const [detailState, setDetailState] = useState<BillDetailState>({ status: 'idle', data: null });

  useEffect(() => {
    latestLocationRef.current = { pathname: location.pathname, search: location.search };
  }, [location.pathname, location.search]);

  const setHistoryQuery = useCallback((next: { year?: number; month?: number | null; roomId?: string | null; billId?: string | null }) => {
    setSearchParams((previous) => {
      const updated = new URLSearchParams(previous);

      if (next.year !== undefined) {
        updated.set('year', String(next.year));
      }

      if (next.month !== undefined) {
        if (next.month === null) {
          updated.delete('month');
        } else {
          updated.set('month', String(next.month));
        }
      }

      if (next.roomId !== undefined) {
        if (next.roomId) {
          updated.set('roomId', next.roomId);
        } else {
          updated.delete('roomId');
        }
      }

      if (next.billId !== undefined) {
        if (next.billId) {
          updated.set('billId', next.billId);
        } else {
          updated.delete('billId');
        }
      }

      return updated;
    });
  }, [setSearchParams]);

  const normalizeHistoryQuery = useCallback(() => {
    const normalizedYear = String(year);
    const normalizedMonth = month === null ? null : String(month);
    const shouldNormalizeMonth = roomId
      ? rawMonth !== normalizedMonth
      : rawMonth !== null && rawMonth !== 'all' && rawMonth !== normalizedMonth;

    if (rawYear === normalizedYear && !shouldNormalizeMonth) {
      return false;
    }

    setSearchParams((previous) => {
      const updated = new URLSearchParams(previous);
      updated.set('year', normalizedYear);

      if (shouldNormalizeMonth) {
        if (normalizedMonth === null) {
          updated.delete('month');
        } else {
          updated.set('month', normalizedMonth);
        }
      }

      return updated;
    }, { replace: true });

    return true;
  }, [month, rawMonth, rawYear, roomId, setSearchParams, year]);

  const loadHistory = useCallback(() => {
    if (!propertyId) {
      setHistoryState({ status: 'not-found', mode, data: null });
      return;
    }

    abortRequest(historyRequestRef.current?.controller);
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    historyRequestRef.current = { id: requestId, controller };
    setHistoryState({ status: 'loading', mode, data: null });
    loadedHistoryKeyRef.current = null;

    const request = roomId
      ? listRoomMeterHistory(roomId, { year, month: month ?? undefined }, getAccessToken, { signal: controller.signal })
      : listPropertyMeterHistory(propertyId, { year }, getAccessToken, { signal: controller.signal });

    void request
      .then((response) => {
        if (historyRequestRef.current?.id !== requestId) {
          return;
        }

        if (roomId) {
          setHistoryState({ status: 'ready', mode: 'room', data: response as BillingBillList });
        } else {
          setHistoryState({ status: 'ready', mode: 'property', data: response as PropertyMeterHistory });
        }

        loadedHistoryKeyRef.current = historyKey;
      })
      .catch((error: unknown) => {
        if (historyRequestRef.current?.id !== requestId) {
          return;
        }

        const errorState = classifyApiErrorForUi(error);

        if (errorState.kind === 'cancelled') {
          return;
        }

        if (errorState.kind === 'unauthorized') {
          navigate(
            getMeterHistoryReturnTo(latestLocationRef.current.pathname, latestLocationRef.current.search),
            { replace: true },
          );
          return;
        }

        if (errorState.kind === 'forbidden') {
          setHistoryState({ status: 'forbidden', mode, data: null });
          loadedHistoryKeyRef.current = historyKey;
          return;
        }

        if (errorState.kind === 'not-found') {
          setHistoryState({ status: 'not-found', mode, data: null });
          loadedHistoryKeyRef.current = historyKey;
          return;
        }

        setHistoryState({ status: 'error', mode, data: null });
        loadedHistoryKeyRef.current = historyKey;
      });
  }, [getAccessToken, historyKey, mode, month, navigate, propertyId, roomId, year]);

  const loadBillDetail = useCallback((billId: string) => {
    abortRequest(detailRequestRef.current?.controller);
    const controller = new AbortController();
    const requestId = detailRequestIdRef.current + 1;
    detailRequestIdRef.current = requestId;
    detailRequestRef.current = { id: requestId, controller };
    setDetailState({ status: 'loading', data: null });

    void getBill(billId, getAccessToken, { signal: controller.signal })
      .then((bill) => {
        if (detailRequestRef.current?.id !== requestId) {
          return;
        }

        setDetailState({ status: 'ready', data: bill });
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
          navigate(
            getMeterHistoryReturnTo(latestLocationRef.current.pathname, latestLocationRef.current.search),
            { replace: true },
          );
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
  }, [getAccessToken, navigate]);

  useEffect(() => {
    if (normalizeHistoryQuery()) {
      return undefined;
    }

    if (loadedHistoryKeyRef.current === historyKey) {
      return undefined;
    }

    loadHistory();

    return () => abortRequest(historyRequestRef.current?.controller);
  }, [historyKey, loadHistory, normalizeHistoryQuery]);

  useEffect(() => {
    const billId = searchParams.get('billId');
    setSelectedBillId(billId);

    if (billId) {
      loadBillDetail(billId);
    } else {
      abortRequest(detailRequestRef.current?.controller);
      setDetailState({ status: 'idle', data: null });
    }
  }, [loadBillDetail, searchParams]);

  const propertyColumns = useMemo<TableColumnsType<PropertyMeterHistoryRow>>(() => [
    {
      title: '房間',
      dataIndex: 'room_label',
      width: 180,
      render: (value: PropertyMeterHistoryRow['room_label'], record) => (
        <Space direction="vertical" size={2} className="table-cell-stack">
          <Typography.Text strong>{getOptionalText(value ?? record.room_id)}</Typography.Text>
          <Typography.Text type="secondary">{getOptionalText(record.tenant_label)}</Typography.Text>
          {record.room_id && (
            <Button
              size="small"
              type="link"
              onClick={() => {
                const rowMonth = getHistoryRowMonth(record);

                setHistoryQuery({
                  roomId: record.room_id,
                  year: rowMonth?.year ?? year,
                  month: month ?? rowMonth?.month ?? defaultMonth,
                  billId: null,
                });
              }}
            >
              房間歷史
            </Button>
          )}
        </Space>
      ),
    },
    {
      title: '月份 / 期別',
      dataIndex: 'period_start',
      width: 180,
      render: (_value, record) => (
        <Space direction="vertical" size={2} className="table-cell-stack">
          <Typography.Text>{getPeriodText(record)}</Typography.Text>
          <Typography.Text type="secondary">抄表 {getDateTimeText(record.meter_recorded_at)}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '讀數',
      dataIndex: 'previous_reading',
      width: 220,
      render: (_value, record) => (
        <Space direction="vertical" size={2} className="table-cell-stack">
          <div className="meter-reading-inline">
            <Typography.Text strong>{getNumberText(record.previous_reading)}</Typography.Text>
            <span>→</span>
            <Typography.Text strong>{getNumberText(record.current_reading)}</Typography.Text>
          </div>
          <Typography.Text type="secondary">
            單價 {getNumberText(record.unit_price)} / 金額 {getAmountText(record.amount)}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '用量',
      dataIndex: 'usage',
      width: 110,
      align: 'right',
      render: (value: PropertyMeterHistoryRow['usage']) => (
        value === undefined ? '未提供' : `${value} 度`
      ),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      width: 120,
      render: (value: PropertyMeterHistoryRow['status']) => (
        <Tag color={getStatusColor(value)}>{getBillStatusLabel(value)}</Tag>
      ),
    },
    {
      title: '動作',
      key: 'actions',
      width: 120,
      fixed: 'right',
      render: (_, record) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          disabled={!record.bill_id}
          onClick={() => setHistoryQuery({ billId: record.bill_id ?? null })}
        >
          帳單詳情
        </Button>
      ),
    },
  ], [month, setHistoryQuery, year]);

  if (historyState.status === 'loading') {
    return <LoadingState />;
  }

  if (historyState.status === 'forbidden') {
    return <ForbiddenState />;
  }

  if (historyState.status === 'not-found') {
    return <NotFoundState />;
  }

  if (historyState.status === 'error') {
    return <RetryableErrorState onRetry={() => loadHistory()} />;
  }

  const rows = historyState.data.data ?? [];
  const visibleRows = historyState.mode === 'property' && month !== null
    ? (rows as PropertyMeterHistoryRow[]).filter((row) => isHistoryRowInMonth(row, year, month))
    : rows;
  const summary = getMeterHistorySummary(visibleRows as Array<PropertyMeterHistoryRow | BillingBill>);
  const title = getHistoryTitle(roomId);

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="page-header">
        <div>
          <Space size={8} wrap>
            <Tag color="blue">帳單與抄表</Tag>
            <Tag>電表歷史</Tag>
          </Space>
          <Typography.Title level={1}>{title}</Typography.Title>
          <Typography.Paragraph type="secondary">
            預設顯示前一個月份的電表紀錄；帳單詳情僅提供唯讀檢視。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          {roomId && (
            <Button icon={<HistoryOutlined />} onClick={() => setHistoryQuery({ roomId: null, billId: null })}>
              查看全物業歷史
            </Button>
          )}
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(buildBillingPath(propertyId, roomId ? { roomId } : undefined))}>
            回帳單與抄表
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => loadHistory()}>
            重新整理
          </Button>
        </Space>
      </div>

      {roomId && (
        <Alert
          type="info"
          showIcon
          message="目前為單一房間歷史"
          description="此檢視從房間、出租中房間總覽或帳單詳情進入，篩選條件會保留在網址中。"
        />
      )}

      <Card>
        <div className="billing-section-heading">
          <div>
            <Typography.Title level={2}>篩選條件</Typography.Title>
            <Typography.Paragraph type="secondary">
              物業歷史預設顯示全年，可用月份縮小檢視；房間歷史預設顯示前一個月份。
            </Typography.Paragraph>
          </div>
          <Space wrap className="billing-context-controls">
            <Select
              aria-label="年度"
              className="filter-select"
              value={year}
              options={yearOptions}
              onChange={(value) => setHistoryQuery({ year: value, billId: null })}
            />
            <Select
              aria-label="月份"
              className="filter-select"
              value={selectedMonthValue}
              options={roomId ? roomMonthOptions : monthOptions}
              onChange={(value) => setHistoryQuery({ month: value === 'all' ? null : value, billId: null })}
            />
          </Space>
        </div>
      </Card>

      <MeterHistorySummaryPanel summary={summary} />

      <Card>
        {historyState.mode === 'property' ? (
          <Table
            rowKey={(record) => record.bill_id ?? `${record.room_id}-${record.period_start}`}
            columns={propertyColumns}
            dataSource={visibleRows as PropertyMeterHistoryRow[]}
            pagination={false}
            scroll={{ x: 880 }}
            locale={{
              emptyText: (
                <Empty description="目前沒有電表歷史">
                  <Typography.Paragraph type="secondary">
                    可調整年度或月份，或回帳單與抄表確認是否仍有待抄表帳單。
                  </Typography.Paragraph>
                </Empty>
              ),
            }}
          />
        ) : (
          <RoomHistoryList
            rows={visibleRows as BillingBill[]}
            onOpenBill={(billId) => setHistoryQuery({ billId: billId ?? null })}
            propertyId={propertyId}
            roomId={roomId}
          />
        )}
      </Card>

      <Drawer
        title="帳單詳情"
        open={Boolean(selectedBillId)}
        onClose={() => setHistoryQuery({ billId: null })}
        width={720}
        destroyOnClose
        footer={<Button onClick={() => setHistoryQuery({ billId: null })}>關閉</Button>}
      >
        {detailState.status === 'loading' && <LoadingState />}
        {detailState.status === 'forbidden' && <ForbiddenState />}
        {detailState.status === 'not-found' && <NotFoundState />}
        {detailState.status === 'error' && selectedBillId && (
          <RetryableErrorState onRetry={() => loadBillDetail(selectedBillId)} />
        )}
        {detailState.status === 'ready' && (
          <Space direction="vertical" size={16} className="page-stack">
            <Alert
              type="info"
              showIcon
              message="唯讀帳單檢視"
              description="此頁只提供歷史紀錄對應的帳單資訊，不處理收款、收據或抄表送出。"
            />
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="帳單類型">
                {detailState.data.type === 'electricity' ? '電費' : '租金'}
              </Descriptions.Item>
              <Descriptions.Item label="物業">{getOptionalText(detailState.data.property_label)}</Descriptions.Item>
              <Descriptions.Item label="房間">{getOptionalText(detailState.data.room_label)}</Descriptions.Item>
              <Descriptions.Item label="租客">{getOptionalText(detailState.data.tenant_label)}</Descriptions.Item>
              <Descriptions.Item label="帳單週期">{getPeriodText(detailState.data)}</Descriptions.Item>
              <Descriptions.Item label="到期日">{getDateText(detailState.data.due_date)}</Descriptions.Item>
              <Descriptions.Item label="狀態">
                <Tag color={getStatusColor(detailState.data.status)}>
                  {getBillStatusLabel(detailState.data.status)}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="金額">{getAmountText(detailState.data.amount)}</Descriptions.Item>
              <Descriptions.Item label="上期度數">{getNumberText(detailState.data.meter_previous_reading)}</Descriptions.Item>
              <Descriptions.Item label="本期度數">{getNumberText(detailState.data.meter_current_reading)}</Descriptions.Item>
              <Descriptions.Item label="電費單價">{getNumberText(detailState.data.meter_unit_price)}</Descriptions.Item>
              <Descriptions.Item label="抄表時間">{getDateTimeText(detailState.data.meter_recorded_at)}</Descriptions.Item>
              <Descriptions.Item label="收款方式">{getOptionalText(detailState.data.payment_method)}</Descriptions.Item>
              <Descriptions.Item label="收款金額">{getAmountText(detailState.data.paid_amount)}</Descriptions.Item>
              <Descriptions.Item label="收款時間">{getDateTimeText(detailState.data.paid_at)}</Descriptions.Item>
            </Descriptions>
          </Space>
        )}
      </Drawer>
    </Space>
  );
}
