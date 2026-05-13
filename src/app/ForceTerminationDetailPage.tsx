import {
  ArrowLeftOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  classifyApiErrorForUi,
  getForceTermination,
  getLease,
  updateLeaseDeposit,
  type ForceTermination,
  type Lease,
  type UpdateDepositRequest,
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
import { getDepositStatusLabel, getOptionalText, getStatusColor } from './tenantLeaseDetail';

type ForceTerminationBill = NonNullable<ForceTermination['bills']>[number];

type ForceTerminationLoadState =
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: ForceTermination }
  | { status: 'forbidden'; data: null }
  | { status: 'not-found'; data: null }
  | { status: 'error'; data: null };

type LeaseDepositLoadState =
  | { status: 'idle'; data: null }
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: Lease }
  | { status: 'error'; data: null };

type DepositFormValues = {
  refund_amount?: number | null;
  deduction_amount?: number | null;
  deduction_reason?: string;
};

function buildPropertyPath(propertyId: string | undefined, suffix = '') {
  return propertyId ? `/properties/${propertyId}${suffix}` : '/properties';
}

function getForceTerminationReturnTo(pathname: string, search: string) {
  return `/login?reason=session-expired&returnTo=${encodeURIComponent(`${pathname}${search}`)}`;
}

function getForceTerminationStatusLabel(status: ForceTermination['status']) {
  if (status === 'completed') {
    return '已完成';
  }

  if (status === 'in_progress') {
    return '處理中';
  }

  return '未提供';
}

function getDepositHandlingLabel(value: ForceTermination['deposit_handling']) {
  if (value === 'write_off') {
    return '押金沖銷';
  }

  if (value === 'keep_held') {
    return '押金保留';
  }

  return '未提供';
}

function getBillProgressStatusLabel(status: ForceTerminationBill['status']) {
  if (status === 'done') {
    return '已處理';
  }

  if (status === 'pending') {
    return '待處理';
  }

  return '未提供';
}

function getBillTypeLabel(type: string | undefined) {
  if (type === 'rent') {
    return '租金';
  }

  if (type === 'electricity') {
    return '電費';
  }

  if (type === 'water') {
    return '水費';
  }

  if (type === 'management_fee') {
    return '管理費';
  }

  return getOptionalText(type);
}

function getBillRowKey(record: ForceTerminationBill, index?: number) {
  return record.bill_id ?? `${record.type ?? 'bill'}-${record.period_start ?? index ?? 'row'}-${record.period_end ?? index ?? 'row'}`;
}

function getBillColumns(): TableColumnsType<ForceTerminationBill> {
  return [
    {
      title: '期別',
      dataIndex: 'period_label',
      key: 'period_label',
      width: 180,
      render: (value: string | null | undefined) => getOptionalText(value),
    },
    {
      title: '帳單類型',
      dataIndex: 'type',
      key: 'type',
      width: 140,
      render: (value: string | undefined) => getBillTypeLabel(value),
    },
    {
      title: '期間',
      key: 'period',
      width: 220,
      render: (_, record) => `${getOptionalText(record.period_start)} - ${getOptionalText(record.period_end)}`,
    },
    {
      title: '處理狀態',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (value: ForceTerminationBill['status']) => (
        <Tag color={value === 'done' ? 'green' : 'orange'}>{getBillProgressStatusLabel(value)}</Tag>
      ),
    },
  ];
}

function buildDepositRequest(values: DepositFormValues): UpdateDepositRequest {
  const refundAmount = values.refund_amount ?? 0;
  const deductionAmount = values.deduction_amount ?? 0;

  return {
    refund_amount: refundAmount > 0 ? refundAmount : undefined,
    deduction_amount: deductionAmount > 0 ? deductionAmount : undefined,
    deduction_reason: deductionAmount > 0 ? values.deduction_reason?.trim() : undefined,
  };
}

export default function ForceTerminationDetailPage() {
  const { propertyId, forceTerminationId } = useParams();
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const activeRequestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const requestIdRef = useRef(0);
  const leaseRequestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const leaseRequestIdRef = useRef(0);
  const [loadState, setLoadState] = useState<ForceTerminationLoadState>({ status: 'loading', data: null });
  const [leaseState, setLeaseState] = useState<LeaseDepositLoadState>({ status: 'idle', data: null });
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [depositSubmitting, setDepositSubmitting] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [depositForm] = Form.useForm<DepositFormValues>();
  const [messageApi, contextHolder] = message.useMessage();

  const loadForceTermination = useCallback(() => {
    if (!forceTerminationId) {
      setLoadState({ status: 'not-found', data: null });
      return;
    }

    abortRequest(activeRequestRef.current?.controller);
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    activeRequestRef.current = { id: requestId, controller };
    setLoadState({ status: 'loading', data: null });

    void getForceTermination(forceTerminationId, getAccessToken, { signal: controller.signal })
      .then((data) => {
        if (activeRequestRef.current?.id !== requestId) {
          return;
        }

        setLoadState({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (activeRequestRef.current?.id !== requestId) {
          return;
        }

        const errorState = classifyApiErrorForUi(error);

        if (errorState.kind === 'cancelled') {
          return;
        }

        if (errorState.kind === 'unauthorized') {
          navigate(getForceTerminationReturnTo(location.pathname, location.search), { replace: true });
          return;
        }

        if (errorState.kind === 'forbidden') {
          setLoadState({ status: 'forbidden', data: null });
          return;
        }

        if (errorState.kind === 'not-found') {
          setLoadState({ status: 'not-found', data: null });
          return;
        }

        setLoadState({ status: 'error', data: null });
      });
  }, [forceTerminationId, getAccessToken, location.pathname, location.search, navigate]);

  const loadLeaseDeposit = useCallback((leaseId: string) => {
    abortRequest(leaseRequestRef.current?.controller);
    const controller = new AbortController();
    const requestId = leaseRequestIdRef.current + 1;
    leaseRequestIdRef.current = requestId;
    leaseRequestRef.current = { id: requestId, controller };
    setLeaseState({ status: 'loading', data: null });

    void getLease(leaseId, getAccessToken, { signal: controller.signal })
      .then((lease) => {
        if (leaseRequestRef.current?.id !== requestId) {
          return;
        }

        setLeaseState({ status: 'ready', data: lease });
      })
      .catch((error: unknown) => {
        if (leaseRequestRef.current?.id !== requestId) {
          return;
        }

        if (classifyApiErrorForUi(error).kind === 'cancelled') {
          return;
        }

        setLeaseState({ status: 'error', data: null });
      });
  }, [getAccessToken]);

  useEffect(() => {
    loadForceTermination();

    return () => {
      abortRequest(activeRequestRef.current?.controller);
      abortRequest(leaseRequestRef.current?.controller);
    };
  }, [loadForceTermination]);

  const loadedDetail = loadState.status === 'ready' ? loadState.data : null;

  useEffect(() => {
    if (!loadedDetail || loadedDetail.deposit_handling !== 'keep_held' || !loadedDetail.lease_id) {
      setLeaseState({ status: 'idle', data: null });
      return;
    }

    loadLeaseDeposit(loadedDetail.lease_id);
  }, [loadedDetail, loadLeaseDeposit]);

  async function submitDepositSettlement() {
    if (!detail?.lease_id || leaseState.status !== 'ready') {
      return;
    }

    const values = depositForm.getFieldsValue();
    const body = buildDepositRequest(values);

    if (!body.refund_amount && !body.deduction_amount) {
      setDepositError('請輸入退還或扣款金額。');
      return;
    }

    if (body.deduction_amount && !body.deduction_reason) {
      setDepositError('押金扣款須填寫扣款原因。');
      return;
    }

    setDepositSubmitting(true);
    setDepositError(null);

    try {
      const lease = await updateLeaseDeposit(detail.lease_id, body, getAccessToken);

      setLeaseState({ status: 'ready', data: lease });
      setDepositModalOpen(false);
      depositForm.resetFields();
      void messageApi.success('押金已處理。');
    } catch (error) {
      const errorState = classifyApiErrorForUi(error);

      if (errorState.kind === 'unauthorized') {
        navigate(getForceTerminationReturnTo(location.pathname, location.search), { replace: true });
        return;
      }

      if (errorState.kind === 'forbidden') {
        setDepositError('目前帳號沒有處理押金的權限。');
      } else if (errorState.kind === 'validation') {
        setDepositError('押金處理資料未通過檢查，請確認金額與扣款原因。');
      } else {
        setDepositError('押金處理暫時失敗，請稍後重試。');
      }
    } finally {
      setDepositSubmitting(false);
    }
  }

  if (!propertyId) {
    return <NotFoundState />;
  }

  if (loadState.status === 'loading') {
    return <LoadingState />;
  }

  if (loadState.status === 'forbidden') {
    return <ForbiddenState />;
  }

  if (loadState.status === 'not-found') {
    return <NotFoundState />;
  }

  if (loadState.status === 'error') {
    return <RetryableErrorState onRetry={() => loadForceTermination()} />;
  }

  const detail = loadState.data;
  const billRows = detail.bills ?? [];
  const leaseDeposit = leaseState.status === 'ready' ? leaseState.data : null;
  const shouldShowDepositSettlement = detail.deposit_handling === 'keep_held';
  const canSettleDeposit = shouldShowDepositSettlement && leaseDeposit?.deposit_status === 'held';
  const forceTerminatedLeaseId = detail.lease_id;

  return (
    <Space direction="vertical" size={16} className="page-stack">
      {contextHolder}
      <div className="page-header">
        <div>
          <Space size={8} wrap>
            <Tag color="blue">租客與租約</Tag>
            <Tag color={getStatusColor(detail.status)}>{getForceTerminationStatusLabel(detail.status)}</Tag>
          </Space>
          <Typography.Title level={1}>
            {detail.room_label ?? detail.tenant_label ?? '強制退租詳情'}
          </Typography.Title>
          <Typography.Paragraph type="secondary">
            查看強制退租處理進度、押金處理與帳單沖銷狀態；若強制退租時保留押金，可在本頁接續處理押金。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(buildPropertyPath(propertyId, '/checkout'))}>
            回退租審核
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => loadForceTermination()}>
            重新整理
          </Button>
        </Space>
      </div>

      <Card title="強制退租資料">
        <Descriptions column={{ xs: 1, md: 2 }} size="small">
          <Descriptions.Item label="物業">{getOptionalText(detail.property_label)}</Descriptions.Item>
          <Descriptions.Item label="房間">{getOptionalText(detail.room_label)}</Descriptions.Item>
          <Descriptions.Item label="租客">{getOptionalText(detail.tenant_label)}</Descriptions.Item>
          <Descriptions.Item label="狀態">
            <Tag color={getStatusColor(detail.status)}>{getForceTerminationStatusLabel(detail.status)}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="押金處理">{getDepositHandlingLabel(detail.deposit_handling)}</Descriptions.Item>
          {shouldShowDepositSettlement && (
            <Descriptions.Item label="押金狀態">
              {leaseState.status === 'loading' && '讀取中'}
              {leaseState.status === 'error' && '暫時無法讀取'}
              {leaseDeposit && `${formatTwd(leaseDeposit.deposit_amount ?? 0)} / ${getDepositStatusLabel(leaseDeposit.deposit_status)}`}
            </Descriptions.Item>
          )}
          <Descriptions.Item label="發起人">{getOptionalText(detail.initiated_by_label)}</Descriptions.Item>
          <Descriptions.Item label="建立時間">
            {detail.created_at ? formatDashboardDateTime(detail.created_at) : '未提供'}
          </Descriptions.Item>
          <Descriptions.Item label="更新時間">
            {detail.updated_at ? formatDashboardDateTime(detail.updated_at) : '未提供'}
          </Descriptions.Item>
          <Descriptions.Item label="原因" span={2}>{getOptionalText(detail.reason)}</Descriptions.Item>
        </Descriptions>
      </Card>

      {shouldShowDepositSettlement && (
        <Card title="押金後續處理">
          <Space direction="vertical" size={12} className="page-stack">
            <Alert
              type={canSettleDeposit ? 'warning' : 'info'}
              showIcon
              message={canSettleDeposit ? '尚未處理押金' : '押金已不在保留中'}
              description={canSettleDeposit
                ? '此強制退租選擇保留押金，請依實際人工確認結果退還、扣款，或部分扣款後退還餘額。'
                : '目前租約押金狀態已不是保留中；若資料剛更新，請重新整理確認最新狀態。'}
            />
            {leaseDeposit && (
              <Descriptions column={{ xs: 1, md: 3 }} size="small">
                <Descriptions.Item label="押金金額">{formatTwd(leaseDeposit.deposit_amount ?? 0)}</Descriptions.Item>
                <Descriptions.Item label="押金狀態">{getDepositStatusLabel(leaseDeposit.deposit_status)}</Descriptions.Item>
                <Descriptions.Item label="已退 / 已扣">
                  {formatTwd(leaseDeposit.deposit_refund_amount ?? 0)} / {formatTwd(leaseDeposit.deposit_deduction_amount ?? 0)}
                </Descriptions.Item>
              </Descriptions>
            )}
            <Space wrap>
              <Button
                type="primary"
                disabled={!canSettleDeposit}
                onClick={() => {
                  setDepositError(null);
                  depositForm.setFieldsValue({
                    refund_amount: leaseDeposit?.deposit_amount ?? 0,
                    deduction_amount: 0,
                    deduction_reason: undefined,
                  });
                  setDepositModalOpen(true);
                }}
              >
                押金處理
              </Button>
              {leaseState.status === 'error' && forceTerminatedLeaseId && (
                <Button onClick={() => loadLeaseDeposit(forceTerminatedLeaseId)}>重新讀取押金</Button>
              )}
            </Space>
          </Space>
        </Card>
      )}

      <Card title="帳單處理進度">
        {detail.status === 'in_progress' && (
          <Alert
            type="info"
            showIcon
            message="強制退租仍在處理中"
            description="帳單進度以目前資料為準，請重新整理取得最新狀態。"
          />
        )}
        {billRows.length > 0 ? (
          <Table
            rowKey={getBillRowKey}
            dataSource={billRows}
            columns={getBillColumns()}
            pagination={false}
            scroll={{ x: 720 }}
          />
        ) : (
          <Empty description="尚無帳單處理紀錄" />
        )}
      </Card>

      <Modal
        title="押金處理"
        open={depositModalOpen}
        okText="確認處理押金"
        okButtonProps={{ danger: true, loading: depositSubmitting, disabled: depositSubmitting }}
        cancelText="取消"
        onOk={() => void submitDepositSettlement()}
        onCancel={() => {
          setDepositModalOpen(false);
          setDepositError(null);
        }}
      >
        <Space direction="vertical" size={12} className="page-stack">
          <Alert
            type="warning"
            showIcon
            message="此動作會結清押金"
            description="系統會依金額建立押金退還或扣款紀錄。扣款金額大於 0 時必須填寫扣款原因。"
          />
          {depositError && (
            <Alert type="error" showIcon message="押金處理失敗" description={depositError} />
          )}
          <Form form={depositForm} layout="vertical" requiredMark={false}>
            <Form.Item name="refund_amount" label="退還金額">
              <InputNumber min={0} precision={0} className="form-number-input" />
            </Form.Item>
            <Form.Item name="deduction_amount" label="扣款金額">
              <InputNumber min={0} precision={0} className="form-number-input" />
            </Form.Item>
            <Form.Item name="deduction_reason" label="扣款原因">
              <Input.TextArea rows={3} />
            </Form.Item>
          </Form>
        </Space>
      </Modal>
    </Space>
  );
}
