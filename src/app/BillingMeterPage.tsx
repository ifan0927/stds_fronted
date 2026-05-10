import {
  AuditOutlined,
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
  Form,
  InputNumber,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ApiError,
  classifyApiErrorForUi,
  getBill,
  listBills,
  listPropertyPendingMeters,
  listPropertyTenantLeaseRoster,
  submitBillMeter,
  type BillingBill,
  type BillingBillList,
  type PropertyTenantLeaseRoster,
  type PropertyTenantLeaseRosterRow,
} from '../api';
import { hasRole, useAuth } from '../auth';
import { formatTwd } from './format';
import { abortRequest } from './requestAbort';
import {
  ForbiddenState,
  LoadingState,
  NotFoundState,
  RetryableErrorState,
} from './routeState';
import { getBillStatusLabel, getOptionalText, getStatusColor } from './tenantLeaseDetail';

type PendingMeterLoadState =
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: BillingBillList }
  | { status: 'forbidden'; data: null }
  | { status: 'not-found'; data: null }
  | { status: 'error'; data: null };

type BillDetailState =
  | { status: 'idle'; data: null }
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: BillingBill }
  | { status: 'forbidden'; data: null }
  | { status: 'not-found'; data: null }
  | { status: 'error'; data: null };

type BillListLoadState =
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: BillingBillList }
  | { status: 'error'; data: null };

type RosterLoadState =
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: PropertyTenantLeaseRoster }
  | { status: 'error'; data: null };

type MeterFormValues = {
  current_reading?: number | null;
};

type OperationNotice = {
  type: 'info' | 'warning' | 'error';
  message: string;
  description: string;
};

const billStatusOptions: Array<{ value: 'all' | NonNullable<BillingBill['status']>; label: string }> = [
  { value: 'all', label: '全部狀態' },
  { value: 'pending_meter', label: '待抄表' },
  { value: 'pending_payment', label: '待收款' },
  { value: 'overdue', label: '逾期' },
  { value: 'paid', label: '已付款' },
  { value: 'voided', label: '已作廢' },
  { value: 'written_off', label: '已沖銷' },
];

const meterErrorCopy: Record<string, string> = {
  VALIDATION_CURRENT_READING_REQUIRED: '請輸入本期電表度數。',
  METER_READING_LESS_THAN_PREVIOUS: '本期度數不可小於上期度數，請確認後再送出。',
  BILL_NOT_ELECTRICITY_TYPE: '此帳單不是電費帳單，不能抄表。',
  BILL_STATUS_NOT_RECORDABLE: '此帳單目前不是待抄表狀態，請重新整理後確認。',
};

function getBillingReturnTo(returnTo: string) {
  return `/login?reason=session-expired&returnTo=${encodeURIComponent(returnTo)}`;
}

function getMeterHistoryPath(propertyId: string | undefined, roomId?: string | null) {
  if (!propertyId) {
    return '/properties';
  }

  const defaultPeriod = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
  const params = new URLSearchParams({
    year: String(defaultPeriod.getFullYear()),
  });

  if (roomId) {
    params.set('roomId', roomId);
    params.set('month', String(defaultPeriod.getMonth() + 1));
  }

  return `/properties/${propertyId}/billing/meter-history?${params.toString()}`;
}

function getDateText(value: string | null | undefined) {
  if (!value) {
    return '未提供';
  }

  return value;
}

function getNumberText(value: number | null | undefined) {
  return value === null || value === undefined ? '未提供' : String(value);
}

function getAmountText(value: number | null | undefined) {
  return value === null || value === undefined ? '待系統計算' : formatTwd(value);
}

function getPeriodText(bill: BillingBill) {
  if (bill.period_label) {
    return bill.period_label;
  }

  if (bill.period_start || bill.period_end) {
    return `${getDateText(bill.period_start)} ~ ${getDateText(bill.period_end)}`;
  }

  return '未提供';
}

function getBillTypeLabel(value: BillingBill['type']) {
  if (value === 'electricity') {
    return '電費';
  }

  if (value === 'rent') {
    return '租金';
  }

  return '未提供';
}

function getValidBillType(value: string | null): BillingBill['type'] | undefined {
  return value === 'rent' || value === 'electricity' ? value : undefined;
}

function getValidBillingFlow(value: string | null) {
  return value === 'meter' ? 'meter' : 'bills';
}

function getValidBillStatus(value: string | null): BillingBill['status'] | undefined {
  return billStatusOptions.some((option) => option.value === value) && value !== 'all'
    ? value as BillingBill['status']
    : undefined;
}

function getLeaseOptionLabel(row: PropertyTenantLeaseRosterRow) {
  const roomLabel = getOptionalText(row.room_label ?? row.room_id);
  const tenantLabel = getOptionalText(row.tenant_label);
  const period = row.start_date || row.end_date
    ? `${getDateText(row.start_date)} ~ ${getDateText(row.end_date)}`
    : '租約期間未提供';

  return `${roomLabel} / ${tenantLabel} / ${period}`;
}

function canSubmitMeter(bill: BillingBill | null | undefined) {
  return bill?.type === 'electricity' && bill.status === 'pending_meter';
}

function getMeterErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.errorCode) {
    return meterErrorCopy[error.errorCode] ?? '抄表送出失敗，請確認資料後再試一次。';
  }

  const state = classifyApiErrorForUi(error);
  return state.description;
}

function getReadableRouteContext(roomId: string | null, leaseId: string | null) {
  if (roomId && leaseId) {
    return '已帶入房間與租約脈絡；下方帳單查詢會優先顯示此租約的帳單。';
  }

  if (roomId) {
    return '已帶入房間脈絡；可從帳單列表開啟詳情，房間歷史由後續頁面承接。';
  }

  if (leaseId) {
    return '已帶入租約脈絡；下方帳單查詢會優先顯示此租約的帳單。';
  }

  return null;
}

export default function BillingMeterPage() {
  const { propertyId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser, getAccessToken } = useAuth();
  const [form] = Form.useForm<MeterFormValues>();
  const [messageApi, contextHolder] = message.useMessage();
  const pendingRequestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const billListRequestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const rosterRequestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const detailRequestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const latestReturnToRef = useRef(`${location.pathname}${location.search}`);
  const pendingRequestIdRef = useRef(0);
  const billListRequestIdRef = useRef(0);
  const rosterRequestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);
  const [pendingState, setPendingState] = useState<PendingMeterLoadState>({ status: 'loading', data: null });
  const [billListState, setBillListState] = useState<BillListLoadState>({ status: 'loading', data: null });
  const [rosterState, setRosterState] = useState<RosterLoadState>({ status: 'loading', data: null });
  const [detailState, setDetailState] = useState<BillDetailState>({ status: 'idle', data: null });
  const [meterBill, setMeterBill] = useState<BillingBill | null>(null);
  const [meterDrawerOpen, setMeterDrawerOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [operationNotice, setOperationNotice] = useState<OperationNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const selectedBillId = searchParams.get('billId');
  const roomId = searchParams.get('roomId');
  const leaseId = searchParams.get('leaseId');
  const selectedLeaseId = searchParams.get('selectedLeaseId') ?? leaseId;
  const billType = getValidBillType(searchParams.get('billType'));
  const activeBillingFlow = getValidBillingFlow(searchParams.get('flow'));
  const activeBillType = billType ?? 'electricity';
  const billStatus = getValidBillStatus(searchParams.get('billStatus'));
  const routeContextMessage = getReadableRouteContext(roomId, leaseId);
  const canOperateMeter = hasRole(currentUser, ['admin', 'organizer', 'staff']);

  useEffect(() => {
    latestReturnToRef.current = `${location.pathname}${location.search}`;
  }, [location.pathname, location.search]);

  const setSelectedBillId = useCallback((billId: string | null) => {
    setSearchParams((previous) => {
      const updated = new URLSearchParams(previous);

      if (billId) {
        updated.set('billId', billId);
      } else {
        updated.delete('billId');
      }

      return updated;
    });
  }, [setSearchParams]);

  const loadPendingMeters = useCallback(() => {
    if (!propertyId) {
      setPendingState({ status: 'not-found', data: null });
      return;
    }

    abortRequest(pendingRequestRef.current?.controller);

    if (!canOperateMeter) {
      pendingRequestRef.current = null;
      setPendingState({ status: 'ready', data: { data: [] } });
      return;
    }

    const controller = new AbortController();
    const requestId = pendingRequestIdRef.current + 1;
    pendingRequestIdRef.current = requestId;
    pendingRequestRef.current = { id: requestId, controller };
    setPendingState({ status: 'loading', data: null });

    void listPropertyPendingMeters(propertyId, getAccessToken, { signal: controller.signal })
      .then((response) => {
        if (pendingRequestRef.current?.id !== requestId) {
          return;
        }

        setPendingState({ status: 'ready', data: response });
      })
      .catch((error: unknown) => {
        if (pendingRequestRef.current?.id !== requestId) {
          return;
        }

        const errorState = classifyApiErrorForUi(error);

        if (errorState.kind === 'cancelled') {
          return;
        }

        if (errorState.kind === 'unauthorized') {
          navigate(getBillingReturnTo(latestReturnToRef.current), { replace: true });
          return;
        }

        if (errorState.kind === 'forbidden') {
          setPendingState({ status: 'forbidden', data: null });
          return;
        }

        if (errorState.kind === 'not-found') {
          setPendingState({ status: 'not-found', data: null });
          return;
        }

        setPendingState({ status: 'error', data: null });
      });
  }, [canOperateMeter, getAccessToken, navigate, propertyId]);

  const loadBillList = useCallback(() => {
    if (!propertyId) {
      setBillListState({ status: 'error', data: null });
      return;
    }

    abortRequest(billListRequestRef.current?.controller);

    if (!selectedLeaseId) {
      setBillListState({ status: 'ready', data: { data: [] } });
      return;
    }

    const controller = new AbortController();
    const requestId = billListRequestIdRef.current + 1;
    billListRequestIdRef.current = requestId;
    billListRequestRef.current = { id: requestId, controller };
    setBillListState({ status: 'loading', data: null });

    void listBills(
      getAccessToken,
      {
        property_id: propertyId,
        lease_id: selectedLeaseId ?? undefined,
        type: activeBillType,
        status: billStatus,
        page: 1,
        limit: 20,
      },
      { signal: controller.signal },
    )
      .then((response) => {
        if (billListRequestRef.current?.id !== requestId) {
          return;
        }

        setBillListState({ status: 'ready', data: response });
      })
      .catch((error: unknown) => {
        if (billListRequestRef.current?.id !== requestId) {
          return;
        }

        const errorState = classifyApiErrorForUi(error);

        if (errorState.kind === 'cancelled') {
          return;
        }

        if (errorState.kind === 'unauthorized') {
          navigate(getBillingReturnTo(latestReturnToRef.current), { replace: true });
          return;
        }

        setBillListState({ status: 'error', data: null });
      });
  }, [
    billStatus,
    activeBillType,
    getAccessToken,
    navigate,
    propertyId,
    selectedLeaseId,
  ]);

  const loadRoster = useCallback(() => {
    if (!propertyId) {
      setRosterState({ status: 'error', data: null });
      return;
    }

    abortRequest(rosterRequestRef.current?.controller);
    const controller = new AbortController();
    const requestId = rosterRequestIdRef.current + 1;
    rosterRequestIdRef.current = requestId;
    rosterRequestRef.current = { id: requestId, controller };
    setRosterState({ status: 'loading', data: null });

    void listPropertyTenantLeaseRoster(
      propertyId,
      getAccessToken,
      { include_vacant: false, page: 1, limit: 100 },
      { signal: controller.signal },
    )
      .then((response) => {
        if (rosterRequestRef.current?.id !== requestId) {
          return;
        }

        setRosterState({ status: 'ready', data: response });
      })
      .catch((error: unknown) => {
        if (rosterRequestRef.current?.id !== requestId) {
          return;
        }

        const errorState = classifyApiErrorForUi(error);

        if (errorState.kind === 'cancelled') {
          return;
        }

        setRosterState({ status: 'error', data: null });
      });
  }, [getAccessToken, propertyId]);

  const loadBillDetail = useCallback((billId: string) => {
    abortRequest(detailRequestRef.current?.controller);
    const controller = new AbortController();
    const requestId = detailRequestIdRef.current + 1;
    detailRequestIdRef.current = requestId;
    detailRequestRef.current = { id: requestId, controller };
    setDetailState({ status: 'loading', data: null });
    setSubmitError(null);

    void getBill(billId, getAccessToken, { signal: controller.signal })
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
          navigate(getBillingReturnTo(latestReturnToRef.current), { replace: true });
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
    loadPendingMeters();

    return () => abortRequest(pendingRequestRef.current?.controller);
  }, [loadPendingMeters]);

  useEffect(() => {
    loadBillList();

    return () => abortRequest(billListRequestRef.current?.controller);
  }, [loadBillList]);

  useEffect(() => {
    loadRoster();

    return () => abortRequest(rosterRequestRef.current?.controller);
  }, [loadRoster]);

  useEffect(() => {
    if (selectedBillId) {
      loadBillDetail(selectedBillId);
      return () => abortRequest(detailRequestRef.current?.controller);
    }

    abortRequest(detailRequestRef.current?.controller);
    setDetailState({ status: 'idle', data: null });
    setSubmitError(null);
    form.resetFields();

    return undefined;
  }, [form, loadBillDetail, selectedBillId]);

  const selectedBill = detailState.status === 'ready' ? detailState.data : null;

  const openMeterDrawer = useCallback((bill: BillingBill) => {
    setMeterBill(bill);
    setMeterDrawerOpen(true);
    setSubmitError(null);
    setOperationNotice(null);
    form.setFieldsValue({ current_reading: null });
  }, [form]);

  const closeDetail = useCallback(() => {
    setSelectedBillId(null);
    setMeterDrawerOpen(false);
    setMeterBill(null);
    setSubmitError(null);
  }, [setSelectedBillId]);

  const submitMeter = useCallback((values: MeterFormValues) => {
    if (!meterBill?.id || values.current_reading === null || values.current_reading === undefined) {
      return;
    }

    const meterBillId = meterBill.id;
    setSubmitting(true);
    setSubmitError(null);
    setOperationNotice(null);

    void submitBillMeter(
      meterBillId,
      { current_reading: values.current_reading },
      getAccessToken,
    )
      .then((response) => {
        if (selectedBillId === meterBillId) {
          setDetailState({ status: 'ready', data: response });
        }
        setMeterDrawerOpen(false);
        setMeterBill(null);
        form.resetFields();
        setOperationNotice(null);
        messageApi.success('抄表已送出，帳單狀態已重新讀取。');
        loadPendingMeters();
        loadBillList();
      })
      .catch((error: unknown) => {
        const errorState = classifyApiErrorForUi(error);

        if (errorState.kind === 'unauthorized') {
          navigate(getBillingReturnTo(latestReturnToRef.current), { replace: true });
          return;
        }

        if (errorState.kind === 'conflict') {
          setOperationNotice({
            type: 'warning',
            message: '資料已被更新',
            description: '系統已重新讀取最新帳單，請從更新後的清單重新開啟抄表。',
          });
          setMeterDrawerOpen(false);
          setMeterBill(null);
          setSubmitError(null);
          form.resetFields();
          loadPendingMeters();
          loadBillList();
          if (selectedBillId === meterBillId) {
            loadBillDetail(meterBillId);
          }
          return;
        }

        if (errorState.kind === 'forbidden') {
          const messageText = '目前角色或物業授權不可送出抄表，請確認登入帳號與物業權限。';
          setSubmitError(messageText);
          setOperationNotice({
            type: 'error',
            message: '沒有權限送出抄表',
            description: messageText,
          });
          return;
        }

        if (errorState.kind === 'not-found') {
          setOperationNotice({
            type: 'error',
            message: '找不到這張帳單',
            description: '帳單可能已被移除或狀態已變更，系統已重新整理清單。',
          });
          setMeterDrawerOpen(false);
          setMeterBill(null);
          setSubmitError(null);
          form.resetFields();
          loadPendingMeters();
          loadBillList();
          if (selectedBillId === meterBillId) {
            setDetailState({ status: 'not-found', data: null });
          }
          return;
        }

        setSubmitError(getMeterErrorMessage(error));
      })
      .finally(() => setSubmitting(false));
  }, [
    form,
    getAccessToken,
    loadBillList,
    loadBillDetail,
    loadPendingMeters,
    messageApi,
    meterBill,
    navigate,
    selectedBillId,
  ]);

  const rows = pendingState.status === 'ready' ? pendingState.data.data ?? [] : [];
  const billRows = billListState.status === 'ready' ? billListState.data.data ?? [] : [];
  const leaseOptions = (rosterState.status === 'ready' ? rosterState.data.data ?? [] : [])
    .filter((row): row is PropertyTenantLeaseRosterRow & { lease_id: string } => Boolean(row.lease_id))
    .map((row) => ({
      value: row.lease_id,
      label: getLeaseOptionLabel(row),
    }));
  const selectedLeaseOption = selectedLeaseId
    ? leaseOptions.find((option) => option.value === selectedLeaseId)
    : undefined;

  const setBillQuery = useCallback((next: {
    leaseId?: string | null;
    type?: BillingBill['type'] | null;
    status?: BillingBill['status'] | null;
  }) => {
    setSearchParams((previous) => {
      const updated = new URLSearchParams(previous);

      if (next.leaseId === null) {
        updated.delete('selectedLeaseId');
      } else if (next.leaseId) {
        updated.set('selectedLeaseId', next.leaseId);
      }

      if (next.type === null) {
        updated.delete('billType');
      } else if (next.type) {
        updated.set('billType', next.type);
      }

      if (next.status === null) {
        updated.delete('billStatus');
      } else if (next.status) {
        updated.set('billStatus', next.status);
      }

      return updated;
    });
  }, [setSearchParams]);

  const setBillingFlow = useCallback((flow: string) => {
    setSearchParams((previous) => {
      const updated = new URLSearchParams(previous);

      if (flow === 'meter') {
        updated.set('flow', 'meter');
      } else {
        updated.delete('flow');
      }

      return updated;
    });
  }, [setSearchParams]);

  const columns = useMemo<TableColumnsType<BillingBill>>(() => [
    {
      title: '房間 / 租客',
      width: 210,
      render: (_, record) => (
        <div className="table-cell-stack">
          <Typography.Text strong>{getOptionalText(record.room_label ?? record.room_id)}</Typography.Text>
          <Typography.Text type="secondary">{getOptionalText(record.tenant_label)}</Typography.Text>
        </div>
      ),
    },
    {
      title: '帳單週期',
      width: 190,
      render: (_, record) => (
        <div className="table-cell-stack">
          <Typography.Text>{getPeriodText(record)}</Typography.Text>
          <Typography.Text type="secondary">到期日：{getDateText(record.due_date)}</Typography.Text>
        </div>
      ),
    },
    {
      title: '上期度數',
      dataIndex: 'meter_previous_reading',
      width: 120,
      align: 'right',
      render: (value: BillingBill['meter_previous_reading']) => (
        <Typography.Text>{getNumberText(value)}</Typography.Text>
      ),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      width: 110,
      render: (status: BillingBill['status']) => (
        <Tag color={getStatusColor(status)}>{getBillStatusLabel(status)}</Tag>
      ),
    },
    {
      title: '動作',
      key: 'actions',
      width: 220,
      render: (_, record) => (
        <Space size={8} wrap>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setSelectedBillId(record.id ?? null)}
          >
            詳情
          </Button>
          {canOperateMeter && canSubmitMeter(record) ? (
            <Button
              size="small"
              type="primary"
              icon={<AuditOutlined />}
              onClick={() => openMeterDrawer(record)}
            >
              抄表
            </Button>
          ) : (
            <Tooltip title={canOperateMeter ? '此帳單目前不能抄表。' : '目前角色只能查看，不能抄表。'}>
              <span>
                <Button size="small" type="primary" icon={<AuditOutlined />} disabled>
                  抄表
                </Button>
              </span>
            </Tooltip>
          )}
          <Tooltip title="電表歷史由 #55 實作；此處先保留入口。">
            <Button size="small" icon={<HistoryOutlined />} disabled>
              歷史
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ], [canOperateMeter, openMeterDrawer, setSelectedBillId]);

  const billColumns = useMemo<TableColumnsType<BillingBill>>(() => [
    {
      title: '帳單',
      width: 230,
      render: (_, record) => (
        <div className="table-cell-stack">
          <Space size={6} wrap>
            <Tag>{getBillTypeLabel(record.type)}</Tag>
            <Typography.Text strong>{getOptionalText(record.room_label ?? record.room_id)}</Typography.Text>
          </Space>
          <Typography.Text type="secondary">{getOptionalText(record.tenant_label)}</Typography.Text>
        </div>
      ),
    },
    {
      title: '週期 / 到期',
      width: 210,
      render: (_, record) => (
        <div className="table-cell-stack">
          <Typography.Text>{getPeriodText(record)}</Typography.Text>
          <Typography.Text type="secondary">到期日：{getDateText(record.due_date)}</Typography.Text>
        </div>
      ),
    },
    {
      title: '金額',
      dataIndex: 'amount',
      width: 130,
      align: 'right',
      render: (amount: BillingBill['amount']) => getAmountText(amount),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      width: 120,
      render: (status: BillingBill['status']) => (
        <Tag color={getStatusColor(status)}>{getBillStatusLabel(status)}</Tag>
      ),
    },
    {
      title: '動作',
      key: 'actions',
      width: 240,
      render: (_, record) => (
        <Space size={8} wrap>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setSelectedBillId(record.id ?? null)}>
            詳情
          </Button>
          {canOperateMeter && canSubmitMeter(record) ? (
            <Button size="small" type="primary" icon={<AuditOutlined />} onClick={() => openMeterDrawer(record)}>
              抄表
            </Button>
          ) : (
            <Tooltip title="收款流程尚未在本階段實作。">
              <span>
                <Button size="small" disabled>
                  收款
                </Button>
              </span>
            </Tooltip>
          )}
          <Tooltip title="收據流程尚未在本階段實作。">
            <span>
              <Button size="small" disabled>
                收據
              </Button>
            </span>
          </Tooltip>
        </Space>
      ),
    },
  ], [canOperateMeter, openMeterDrawer, setSelectedBillId]);

  const billProcessingContent = (
    <Card>
      <div className="billing-section-heading">
        <div>
          <Typography.Title level={2}>帳單處理</Typography.Title>
          <Typography.Paragraph type="secondary">
            先選擇房間或租約，再分別處理該租約的電費與租金帳單；收款與收據目前只保留在帳單列動作。
          </Typography.Paragraph>
        </div>
        <Space wrap className="billing-context-controls">
          <Select
            aria-label="選擇房間或租約"
            className="billing-context-select"
            showSearch
            allowClear
            placeholder="搜尋房號、租客、租約"
            value={selectedLeaseId ?? undefined}
            options={leaseOptions}
            loading={rosterState.status === 'loading'}
            onChange={(value?: string) => setBillQuery({ leaseId: value ?? null })}
            filterOption={(input, option) => (
              String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            )}
          />
          <Select
            aria-label="帳單狀態"
            className="filter-select"
            value={billStatus ?? 'all'}
            options={billStatusOptions}
            onChange={(value: 'all' | NonNullable<BillingBill['status']>) => (
              setBillQuery({ status: value === 'all' ? null : value })
            )}
          />
          <Button icon={<ReloadOutlined />} onClick={() => loadBillList()}>
            重新整理帳單
          </Button>
        </Space>
      </div>
      {selectedLeaseOption && (
        <Alert
          type="info"
          showIcon
          className="form-alert"
          message="目前處理對象"
          description={selectedLeaseOption.label}
        />
      )}
      {!selectedLeaseId && (
        <Alert
          type="warning"
          showIcon
          className="form-alert"
          message="請先選擇房間或租約"
          description="帳單處理會聚焦在單一租約；全物業連續抄表請切換到全物業抄表。"
        />
      )}
      {roomId && !selectedLeaseId && rosterState.status !== 'loading' && (
        <Alert
          type="warning"
          showIcon
          className="form-alert"
          message="此房間目前沒有可查詢帳單的有效租約"
          description="請回租客與租約頁確認入住狀態，或先建立租約後再處理帳單。"
        />
      )}
      <Tabs
        className="billing-inner-tabs"
        activeKey={activeBillType}
        onChange={(value) => setBillQuery({
          type: value === 'electricity' ? null : value as BillingBill['type'],
        })}
        items={[
          {
            key: 'electricity',
            label: '電費帳單',
            children: billListState.status === 'error' ? (
              <Alert
                type="error"
                showIcon
                message="電費帳單暫時無法讀取"
                description="請稍後重試，或切換到全物業抄表處理可見的待抄表帳單。"
                action={<Button onClick={() => loadBillList()}>重試</Button>}
              />
            ) : (
              <Table
                rowKey={(record) => record.id ?? `${record.type}-${record.room_id}-${record.period_start}`}
                columns={billColumns}
                dataSource={selectedLeaseId ? billRows : []}
                loading={billListState.status === 'loading'}
                pagination={false}
                scroll={{ x: 940 }}
                locale={{
                  emptyText: (
                    <Empty description={selectedLeaseId ? '目前沒有符合條件的電費帳單' : '請先選擇房間或租約'}>
                      <Typography.Paragraph type="secondary">
                        {selectedLeaseId
                          ? '可調整帳單狀態篩選，或回租約詳情確認帳單脈絡。'
                          : '選擇後只會顯示該租約的電費帳單。'}
                      </Typography.Paragraph>
                    </Empty>
                  ),
                }}
              />
            ),
          },
          {
            key: 'rent',
            label: '租金帳單',
            children: billListState.status === 'error' ? (
              <Alert
                type="error"
                showIcon
                message="租金帳單暫時無法讀取"
                description="請稍後重試，或回租約詳情確認帳單脈絡。"
                action={<Button onClick={() => loadBillList()}>重試</Button>}
              />
            ) : (
              <Table
                rowKey={(record) => record.id ?? `${record.type}-${record.room_id}-${record.period_start}`}
                columns={billColumns}
                dataSource={selectedLeaseId ? billRows : []}
                loading={billListState.status === 'loading'}
                pagination={false}
                scroll={{ x: 940 }}
                locale={{
                  emptyText: (
                    <Empty description={selectedLeaseId ? '目前沒有符合條件的租金帳單' : '請先選擇房間或租約'}>
                      <Typography.Paragraph type="secondary">
                        {selectedLeaseId
                          ? '可調整帳單狀態篩選，或回租約詳情確認帳單脈絡。'
                          : '選擇後只會顯示該租約的租金帳單。'}
                      </Typography.Paragraph>
                    </Empty>
                  ),
                }}
              />
            ),
          },
        ]}
      />
    </Card>
  );

  const meterQueueContent = (
    <Card>
      <div className="billing-section-heading">
        <div>
          <Typography.Title level={2}>全物業抄表工作佇列</Typography.Title>
          <Typography.Paragraph type="secondary">
            給已拍完整棟電表後連續錄入使用；清單以待抄表帳單為準，每列仍是單筆送出。
          </Typography.Paragraph>
        </div>
        <Tag color="gold">待處理 {rows.length}</Tag>
      </div>
      <Table
        rowKey={(record) => record.id ?? `${record.room_id}-${record.period_start}-${record.period_end}`}
        columns={columns}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 880 }}
        locale={{
          emptyText: (
            <Empty
              description="目前沒有待抄表帳單"
            >
              <Typography.Paragraph type="secondary">
                若剛完成抄表，請重新整理確認最新狀態。
              </Typography.Paragraph>
            </Empty>
          ),
        }}
      />
    </Card>
  );

  if (pendingState.status === 'loading') {
    return <LoadingState />;
  }

  if (pendingState.status === 'forbidden') {
    return <ForbiddenState />;
  }

  if (pendingState.status === 'not-found') {
    return <NotFoundState />;
  }

  if (pendingState.status === 'error') {
    return <RetryableErrorState onRetry={() => loadPendingMeters()} />;
  }

  return (
    <Space direction="vertical" size={16} className="page-stack">
      {contextHolder}
      <div className="page-header">
        <div>
          <Space size={8} wrap>
            <Tag color="blue">日常作業</Tag>
            <Tag>帳單與抄表</Tag>
          </Space>
          <Typography.Title level={1}>帳單與抄表</Typography.Title>
          <Typography.Paragraph type="secondary">
            查看租金與電費帳單、開啟帳單詳情，並針對待抄表電費帳單送出本期電表度數。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={() => {
            loadBillList();
            loadPendingMeters();
          }}
          >
            重新整理
          </Button>
          <Button icon={<HistoryOutlined />} onClick={() => navigate(getMeterHistoryPath(propertyId))}>
            查看電表歷史
          </Button>
        </Space>
      </div>

      {routeContextMessage && (
        <Alert
          type="info"
          showIcon
          message="已從其他頁面進入抄表與帳單"
          description={routeContextMessage}
        />
      )}

      {operationNotice && (
        <Alert
          type={operationNotice.type}
          showIcon
          message={operationNotice.message}
          description={operationNotice.description}
        />
      )}

      {!canOperateMeter && (
        <Alert
          type="info"
          showIcon
          message="目前角色為查看模式"
          description="可查看允許的帳單資訊，但抄表送出按鈕不會開放；實際授權仍由後端判定。"
        />
      )}

      <Tabs
        className="billing-flow-tabs"
        activeKey={activeBillingFlow}
        onChange={setBillingFlow}
        items={[
          { key: 'bills', label: '帳單處理', children: billProcessingContent },
          { key: 'meter', label: `全物業抄表 (${rows.length})`, children: meterQueueContent },
        ]}
      />

      <Drawer
        title="帳單詳情"
        open={Boolean(selectedBillId)}
        onClose={closeDetail}
        width={720}
        destroyOnClose
        footer={
          <Space wrap className="drawer-footer-actions">
            <Button onClick={closeDetail}>關閉</Button>
            <Button
              disabled={!selectedBill?.room_id}
              icon={<HistoryOutlined />}
              onClick={() => navigate(getMeterHistoryPath(propertyId, selectedBill?.room_id))}
            >
              查看此房間歷史
            </Button>
            {selectedBill && canOperateMeter && canSubmitMeter(selectedBill) && (
              <Button type="primary" icon={<AuditOutlined />} onClick={() => openMeterDrawer(selectedBill)}>
                抄表
              </Button>
            )}
          </Space>
        }
      >
        {detailState.status === 'loading' && <LoadingState />}
        {detailState.status === 'forbidden' && <ForbiddenState />}
        {detailState.status === 'not-found' && <NotFoundState />}
        {detailState.status === 'error' && selectedBillId && (
          <RetryableErrorState onRetry={() => loadBillDetail(selectedBillId)} />
        )}
        {detailState.status === 'ready' && (
          <Space direction="vertical" size={16} className="page-stack">
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="帳單類型">{getBillTypeLabel(detailState.data.type)}</Descriptions.Item>
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
              <Descriptions.Item label="抄表時間">{getDateText(detailState.data.meter_recorded_at)}</Descriptions.Item>
              <Descriptions.Item label="收款方式">{getOptionalText(detailState.data.payment_method)}</Descriptions.Item>
              <Descriptions.Item label="收款金額">{getAmountText(detailState.data.paid_amount)}</Descriptions.Item>
              <Descriptions.Item label="收款時間">{getDateText(detailState.data.paid_at)}</Descriptions.Item>
            </Descriptions>

            {canSubmitMeter(detailState.data) && (
              <Alert
                type="warning"
                showIcon
                message="此帳單尚未抄表"
                description="請送出本期電表度數；系統會計算用量、金額並更新帳單狀態。"
              />
            )}
            {detailState.data.status === 'pending_payment' && (
              <Alert
                type="info"
                showIcon
                message="此帳單已進入待收款"
                description="收款流程不在 #54 範圍內；後續頁面會承接此入口。"
              />
            )}
          </Space>
        )}
      </Drawer>

      <Drawer
        title="送出抄表"
        open={meterDrawerOpen}
        onClose={() => {
          setMeterDrawerOpen(false);
          setMeterBill(null);
        }}
        width={520}
        destroyOnClose
      >
        {meterBill && (
          <Form
            form={form}
            layout="vertical"
            requiredMark={false}
            onFinish={submitMeter}
          >
            <Descriptions bordered column={1} size="small" className="meter-submit-summary">
              <Descriptions.Item label="房間">{getOptionalText(meterBill.room_label)}</Descriptions.Item>
              <Descriptions.Item label="租客">{getOptionalText(meterBill.tenant_label)}</Descriptions.Item>
              <Descriptions.Item label="帳單週期">{getPeriodText(meterBill)}</Descriptions.Item>
              <Descriptions.Item label="上期度數">{getNumberText(meterBill.meter_previous_reading)}</Descriptions.Item>
            </Descriptions>

            <Alert
              type="info"
              showIcon
              className="form-alert"
              message="金額由系統計算"
              description="前端只送出本期度數；用電量、金額與狀態以後端回傳為準。"
            />

            {submitError && (
              <Alert
                type="error"
                showIcon
                className="form-alert"
                message="抄表送出失敗"
                description={submitError}
              />
            )}

            <Form.Item
              name="current_reading"
              label="本期電表度數（必填）"
              rules={[
                { required: true, message: '請輸入本期電表度數。' },
                {
                  type: 'number',
                  min: 0,
                  message: '請輸入非負的電表度數。',
                },
                ...(meterBill.meter_previous_reading === null || meterBill.meter_previous_reading === undefined
                  ? []
                  : [{
                    type: 'number' as const,
                    min: meterBill.meter_previous_reading,
                    message: `不可小於上期度數 ${meterBill.meter_previous_reading}。`,
                  }]),
              ]}
            >
              <InputNumber className="full-width-control" min={0} precision={0} />
            </Form.Item>

            <div className="form-footer-actions">
              <Button onClick={() => {
                setMeterDrawerOpen(false);
                setMeterBill(null);
              }}
              >
                取消
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={submitting}
                disabled={!canOperateMeter || !canSubmitMeter(meterBill)}
              >
                送出抄表
              </Button>
            </div>
          </Form>
        )}
      </Drawer>

    </Space>
  );
}
