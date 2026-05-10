import {
  ArrowLeftOutlined,
  AuditOutlined,
  EditOutlined,
  FileTextOutlined,
  PaperClipOutlined,
  ReloadOutlined,
  SaveOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { TableColumnsType, TablePaginationConfig } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  classifyApiErrorForUi,
  getFormErrorState,
  getLease,
  listBills,
  updateLease,
  type Bill,
  type BillList,
  type Lease,
} from '../api';
import { hasRole, useAuth } from '../auth';
import { formatDashboardDateTime, formatTwd } from './format';
import { getMutationFailureFeedback, getMutationSuccessFeedback } from './operation';
import { abortRequest } from './requestAbort';
import {
  ForbiddenState,
  LoadingState,
  NotFoundState,
  RetryableErrorState,
} from './routeState';
import {
  buildLeaseAdjustmentRequest,
  getBillStatusLabel,
  getCadenceLabel,
  getDepositStatusLabel,
  getLeaseStatusLabel,
  getOptionalText,
  getStatusColor,
  type LeaseAdjustmentFormValues,
} from './tenantLeaseDetail';

type LeaseDetailLoadState =
  | { status: 'loading'; data: null }
  | {
      status: 'ready';
      data: {
        lease: Lease;
        bills: BillList | null;
        billsStatus: 'ready' | 'error';
      };
    }
  | { status: 'forbidden'; data: null }
  | { status: 'not-found'; data: null }
  | { status: 'error'; data: null };

type LeaseAdjustmentModalProps = {
  open: boolean;
  lease: Lease;
  onCancel: () => void;
  onSuccess: (lease: Lease) => void;
};

type LeaseAdjustmentFormInternalValues = LeaseAdjustmentFormValues;

const billStatusOptions: Array<{ value: NonNullable<Bill['status']>; label: string }> = [
  { value: 'pending_payment', label: '待收款' },
  { value: 'overdue', label: '逾期' },
  { value: 'paid', label: '已付款' },
  { value: 'voided', label: '已作廢' },
  { value: 'written_off', label: '已沖銷' },
];
const defaultPage = 1;
const defaultLimit = 20;

function getLeaseReturnTo(pathname: string, search: string) {
  return `/login?reason=session-expired&returnTo=${encodeURIComponent(`${pathname}${search}`)}`;
}

function getPositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getLeaseAdjustmentInitialValues(lease: Lease): LeaseAdjustmentFormInternalValues {
  return {
    rent_amount: lease.rent_amount,
  };
}

function buildPropertyPath(propertyId: string | undefined, suffix = '', query?: Record<string, string | undefined>) {
  if (!propertyId) {
    return '/properties';
  }

  const params = new URLSearchParams();

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  return `/properties/${propertyId}${suffix}${params.toString() ? `?${params.toString()}` : ''}`;
}

function getBillColumns(propertyId: string | undefined, lease: Lease): TableColumnsType<Bill> {
  return [
    {
      title: '期別',
      dataIndex: 'period_label',
      width: 160,
      render: (value: string | null | undefined) => getOptionalText(value),
    },
    {
      title: '期間',
      key: 'period',
      width: 220,
      render: (_, record) => `${getOptionalText(record.period_start)} - ${getOptionalText(record.period_end)}`,
    },
    {
      title: '到期日',
      dataIndex: 'due_date',
      width: 130,
      render: (value: string | null | undefined) => getOptionalText(value),
    },
    {
      title: '金額',
      dataIndex: 'amount',
      width: 130,
      align: 'right',
      render: (value: number | null | undefined) => (
        value === null || value === undefined ? '未提供' : formatTwd(value)
      ),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      width: 120,
      render: (value: Bill['status']) => (
        <Tag color={getStatusColor(value)}>{getBillStatusLabel(value)}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 190,
      render: (_, record) => (
        <Space wrap>
          {(record.status === 'pending_payment' || record.status === 'overdue') && (
            <Link to={buildPropertyPath(propertyId, '/billing', {
              roomId: lease.room_id,
              leaseId: lease.id,
              tenantId: lease.tenant_id,
              billId: record.id,
              view: 'rent-payment',
            })}
            >
              收款
            </Link>
          )}
          {record.status === 'paid' && (
            <Link to={buildPropertyPath(propertyId, '/billing', {
              roomId: lease.room_id,
              leaseId: lease.id,
              tenantId: lease.tenant_id,
              billId: record.id,
              view: 'rent-receipt',
            })}
            >
              收據
            </Link>
          )}
        </Space>
      ),
    },
  ];
}

export default function LeaseDetailPage() {
  const { propertyId, leaseId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser, getAccessToken } = useAuth();
  const activeRequestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const requestIdRef = useRef(0);
  const [loadState, setLoadState] = useState<LeaseDetailLoadState>({ status: 'loading', data: null });
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const canAdjustLease = hasRole(currentUser, ['admin', 'organizer']);

  const billStatus = searchParams.get('status') as Bill['status'] | null;
  const validBillStatus = billStatusOptions.some((option) => option.value === billStatus)
    ? billStatus as NonNullable<Bill['status']>
    : undefined;
  const page = getPositiveInteger(searchParams.get('page'), defaultPage);
  const limit = getPositiveInteger(searchParams.get('limit'), defaultLimit);

  const loadLease = useCallback(() => {
    if (!leaseId) {
      setLoadState({ status: 'not-found', data: null });
      return;
    }

    abortRequest(activeRequestRef.current?.controller);
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    activeRequestRef.current = { id: requestId, controller };
    setLoadState({ status: 'loading', data: null });

    void getLease(leaseId, getAccessToken, { signal: controller.signal })
      .then((lease) => (
        listBills(
          getAccessToken,
          {
            lease_id: leaseId,
            type: 'rent',
            status: validBillStatus,
            page,
            limit,
          },
          { signal: controller.signal },
        )
          .then((bills) => ({ lease, bills, billsStatus: 'ready' as const }))
          .catch((error: unknown) => {
            const errorState = classifyApiErrorForUi(error);

            if (errorState.kind === 'unauthorized' || errorState.kind === 'cancelled') {
              throw error;
            }

            return { lease, bills: null, billsStatus: 'error' as const };
          })
      ))
      .then((result) => {
        if (activeRequestRef.current?.id !== requestId) {
          return;
        }

        setLoadState({ status: 'ready', data: result });
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
          navigate(getLeaseReturnTo(location.pathname, location.search), { replace: true });
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
  }, [getAccessToken, leaseId, limit, location.pathname, location.search, navigate, page, validBillStatus]);

  useEffect(() => {
    loadLease();

    return () => abortRequest(activeRequestRef.current?.controller);
  }, [loadLease]);

  const setBillQuery = useCallback((next: { status?: string | null; page?: number; limit?: number }) => {
    const params = new URLSearchParams(searchParams);

    if (next.status === null) {
      params.delete('status');
    } else if (next.status) {
      params.set('status', next.status);
    }

    if (next.page) {
      params.set('page', String(next.page));
    }

    if (next.limit) {
      params.set('limit', String(next.limit));
    }

    setSearchParams(params);
  }, [searchParams, setSearchParams]);

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
    return <RetryableErrorState onRetry={() => loadLease()} />;
  }

  const { lease, bills, billsStatus } = loadState.data;
  const billRows = bills?.data ?? [];
  const pagination = bills?.pagination;
  const billColumns = getBillColumns(propertyId, lease);
  const tenantPath = buildPropertyPath(propertyId, `/tenants/${lease.tenant_id ?? ''}`, {
    roomId: lease.room_id,
    leaseId: lease.id,
  });

  return (
    <Space direction="vertical" size={16} className="page-stack">
      {contextHolder}
      <div className="page-header">
        <div>
          <Space size={8} wrap>
            <Tag color="blue">租客與租約</Tag>
            <Tag color={getStatusColor(lease.status)}>{getLeaseStatusLabel(lease.status)}</Tag>
          </Space>
          <Typography.Title level={1}>{lease.room_label ?? lease.tenant_label ?? '租約詳情'}</Typography.Title>
          <Typography.Paragraph type="secondary">
            查看租約條件與租金帳單脈絡；本頁只支援租金調整，付款、收據、退租與附件為入口或 placeholder。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(buildPropertyPath(propertyId, '/tenants'))}>
            回租客與租約
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => loadLease()}>
            重新整理
          </Button>
          {canAdjustLease ? (
            <Button type="primary" icon={<EditOutlined />} onClick={() => setAdjustOpen(true)}>
              調整租金
            </Button>
          ) : (
            <Tooltip title="目前角色不能調整租金。">
              <span>
                <Button type="primary" icon={<EditOutlined />} disabled>
                  調整租金
                </Button>
              </span>
            </Tooltip>
          )}
        </Space>
      </div>

      <Card title="租約資料">
        <Descriptions column={{ xs: 1, md: 2 }} size="small">
          <Descriptions.Item label="物業">{getOptionalText(lease.property_label)}</Descriptions.Item>
          <Descriptions.Item label="房間">{getOptionalText(lease.room_label)}</Descriptions.Item>
          <Descriptions.Item label="租客">
            {lease.tenant_id ? <Link to={tenantPath}>{getOptionalText(lease.tenant_label)}</Link> : getOptionalText(lease.tenant_label)}
          </Descriptions.Item>
          <Descriptions.Item label="租約狀態">
            <Tag color={getStatusColor(lease.status)}>{getLeaseStatusLabel(lease.status)}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="租約期間">
            {getOptionalText(lease.start_date)} - {getOptionalText(lease.end_date)}
          </Descriptions.Item>
          <Descriptions.Item label="租金">
            {lease.rent_amount === null || lease.rent_amount === undefined
              ? '未提供'
              : `${formatTwd(lease.rent_amount)} / ${getCadenceLabel(lease.rent_billing_cadence)}`}
          </Descriptions.Item>
          <Descriptions.Item label="電費週期">{getCadenceLabel(lease.electricity_billing_cadence)}</Descriptions.Item>
          <Descriptions.Item label="起始電表讀數">{getOptionalText(lease.starting_meter_reading)}</Descriptions.Item>
          <Descriptions.Item label="押金">
            {lease.deposit_amount === null || lease.deposit_amount === undefined
              ? '未提供'
              : `${formatTwd(lease.deposit_amount)} / ${getDepositStatusLabel(lease.deposit_status)}`}
          </Descriptions.Item>
          <Descriptions.Item label="租約備註" span={2}>{getOptionalText(lease.notes)}</Descriptions.Item>
          <Descriptions.Item label="建立時間">
            {lease.created_at ? formatDashboardDateTime(lease.created_at) : '未提供'}
          </Descriptions.Item>
          <Descriptions.Item label="更新時間">
            {lease.updated_at ? formatDashboardDateTime(lease.updated_at) : '未提供'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card
        title="租金帳單"
        extra={
          <Space wrap>
            <Select
              aria-label="租金帳單狀態"
              allowClear
              placeholder="全部狀態"
              value={validBillStatus}
              options={billStatusOptions}
              onChange={(value) => setBillQuery({ status: value ?? null, page: 1 })}
              className="filter-select"
            />
            <Button icon={<ReloadOutlined />} onClick={() => loadLease()}>
              重新整理
            </Button>
          </Space>
        }
      >
        {billsStatus === 'error' ? (
          <Alert
            type="error"
            showIcon
            message="租金帳單暫時無法讀取"
            description="租約資料仍可使用，請稍後重新整理帳單資料。"
            action={<Button onClick={() => loadLease()}>重新整理</Button>}
          />
        ) : (
          <Table
            rowKey={(record) => record.id ?? `${record.due_date}-${record.amount}`}
            dataSource={billRows}
            scroll={{ x: 960 }}
            columns={billColumns}
            pagination={{
              current: pagination?.page ?? page,
              pageSize: pagination?.limit ?? limit,
              total: pagination?.total ?? billRows.length,
              showSizeChanger: true,
            }}
            onChange={(nextPagination: TablePaginationConfig) => {
              setBillQuery({
                page: nextPagination.current ?? defaultPage,
                limit: nextPagination.pageSize ?? defaultLimit,
              });
            }}
          />
        )}
      </Card>

      <Card title="後續工作入口">
        <div className="property-link-grid">
          <Link className="property-link-row" to={buildPropertyPath(propertyId, '/billing', {
            roomId: lease.room_id,
            leaseId: lease.id,
            tenantId: lease.tenant_id,
            view: 'rent-payment',
          })}
          >
            <Space size={12} align="start">
              <span className="property-link-icon"><AuditOutlined /></span>
              <span>
                <Typography.Text strong>收款與收據</Typography.Text>
                <Typography.Text type="secondary">前往帳務入口；付款與收據 workflow 不在本頁實作。</Typography.Text>
              </span>
            </Space>
          </Link>
          <Link className="property-link-row" to={buildPropertyPath(propertyId, '/checkout', {
            roomId: lease.room_id,
            leaseId: lease.id,
            tenantId: lease.tenant_id,
          })}
          >
            <Space size={12} align="start">
              <span className="property-link-icon"><FileTextOutlined /></span>
              <span>
                <Typography.Text strong>退租處理</Typography.Text>
                <Typography.Text type="secondary">前往退租入口；preview/finalize 由 checkout issue 承接。</Typography.Text>
              </span>
            </Space>
          </Link>
          <div className="property-link-row disabled-link-row">
            <Space size={12} align="start">
              <span className="property-link-icon"><SwapOutlined /></span>
              <span>
                <Typography.Text strong>租約更換</Typography.Text>
                <Typography.Text type="secondary">續約、週期變更與重發合約需獨立 workflow，這裡先保留入口。</Typography.Text>
              </span>
            </Space>
          </div>
          <div className="property-link-row disabled-link-row">
            <Space size={12} align="start">
              <span className="property-link-icon"><PaperClipOutlined /></span>
              <span>
                <Typography.Text strong>租約附件</Typography.Text>
                <Typography.Text type="secondary">附件上傳與刪除屬於 P2，這裡先保留入口位置。</Typography.Text>
              </span>
            </Space>
          </div>
        </div>
      </Card>

      <LeaseAdjustmentModal
        open={adjustOpen}
        lease={lease}
        onCancel={() => setAdjustOpen(false)}
        onSuccess={(updatedLease) => {
          setAdjustOpen(false);
          setLoadState({
            status: 'ready',
            data: { ...loadState.data, lease: updatedLease },
          });
          void messageApi.success(getMutationSuccessFeedback('租約條件調整').content);
          loadLease();
        }}
      />
    </Space>
  );
}

function LeaseAdjustmentModal({ open, lease, onCancel, onSuccess }: LeaseAdjustmentModalProps) {
  const { getAccessToken } = useAuth();
  const [form] = Form.useForm<LeaseAdjustmentFormInternalValues>();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      form.setFieldsValue(getLeaseAdjustmentInitialValues(lease));
      setSubmitError(null);
    }
  }, [form, lease, open]);

  return (
    <Modal
      title="調整租金"
      open={open}
      onCancel={onCancel}
      footer={null}
      width={640}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={(values) => {
          if (!lease.id) {
            setSubmitError('租約資料不完整，請重新整理後再試。');
            return;
          }

          setSubmitting(true);
          setSubmitError(null);

          void updateLease(
            lease.id,
            buildLeaseAdjustmentRequest({
              rent_amount: values.rent_amount,
            }),
            getAccessToken,
          )
            .then(onSuccess)
            .catch((error: unknown) => {
              const errorState = classifyApiErrorForUi(error);
              const formError = getFormErrorState(error, {
                LEASE_RENT_AMOUNT_INVALID: 'rent_amount',
              });

              setSubmitError(formError.message);

              if (formError.fields.length > 0) {
                form.setFields(formError.fields as Parameters<typeof form.setFields>[0]);
              }

              if (errorState.kind !== 'validation') {
                void message.error(getMutationFailureFeedback(errorState).content);
              }
            })
            .finally(() => setSubmitting(false));
        }}
      >
        <Typography.Paragraph type="secondary">
          本操作不修改租金週期、押金、付款或收據。若需續約、週期變更或重發合約，請使用後續租約更換 workflow。
        </Typography.Paragraph>
        {submitError && (
          <Alert
            className="form-alert"
            type="error"
            showIcon
            message="無法調整租約條件"
            description={submitError}
          />
        )}
        <Form.Item
          name="rent_amount"
          label="租金（必填）"
          rules={[{ required: true, message: '請輸入租金。' }]}
        >
          <InputNumber min={0} precision={0} className="full-width-control" />
        </Form.Item>
        <Descriptions column={1} size="small" className="form-alert">
          <Descriptions.Item label="目前租約結束日">{getOptionalText(lease.end_date)}</Descriptions.Item>
        </Descriptions>
        <Alert
          className="form-alert"
          type="warning"
          showIcon
          message="此調整可能影響後續租金帳單"
          description="後端目前只支援租金調整，會處理可調整範圍與帳單重產；送出後本頁會重新讀取租約與租金帳單。"
        />
        <div className="form-footer-actions">
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={submitting}>
            送出租金調整
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
