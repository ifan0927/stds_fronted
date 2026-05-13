import {
  ArrowLeftOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { TableColumnsType } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  classifyApiErrorForUi,
  getFormErrorState,
  getTenant,
  listTenantLeases,
  updateTenant,
  type Lease,
  type Tenant,
} from '../api';
import { useAuth } from '../auth';
import { formatDashboardDateTime, formatTwd } from './format';
import { getMutationFailureFeedback, getMutationSuccessFeedback } from './operation';
import { abortRequest } from './requestAbort';
import {
  ForbiddenState,
  LoadingState,
  NotFoundState,
  RetryableErrorState,
} from './routeState';
import { TenantAttachmentManager } from './attachments';
import {
  buildTenantUpdateRequest,
  getCadenceLabel,
  getLeaseStatusLabel,
  getOptionalText,
  getStatusColor,
  getTenantStatusLabel,
  type TenantFormValues,
} from './tenantLeaseDetail';

type TenantDetailLoadState =
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: { tenant: Tenant; leases: Lease[]; leasesStatus: 'ready' | 'error' } }
  | { status: 'forbidden'; data: null }
  | { status: 'not-found'; data: null }
  | { status: 'error'; data: null };

type TenantEditFormValues = Omit<TenantFormValues, 'birth_date'> & {
  birth_date?: Dayjs | string | null;
};

function getTenantReturnTo(pathname: string, search: string) {
  return `/login?reason=session-expired&returnTo=${encodeURIComponent(`${pathname}${search}`)}`;
}

function getDateValue(value: Dayjs | string | null | undefined) {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  return value.format('YYYY-MM-DD');
}

function getDatePickerValue(value: string | null | undefined) {
  return value ? dayjs(value) : null;
}

function getTenantInitialValues(tenant: Tenant): TenantEditFormValues {
  return {
    name: tenant.name,
    email: tenant.email ?? undefined,
    phone: tenant.phone ?? undefined,
    contacts: tenant.contacts ?? [],
    birth_date: getDatePickerValue(tenant.birth_date),
    national_id: tenant.national_id ?? undefined,
    address: tenant.address ?? undefined,
    occupation: tenant.occupation ?? undefined,
  };
}

function buildTenantPath(propertyId: string | undefined, suffix = '') {
  return propertyId ? `/properties/${propertyId}/tenants${suffix}` : '/properties';
}

function buildLeaseDetailPath(propertyId: string | undefined, lease: Lease, tenantId: string | undefined) {
  if (!propertyId || !lease.id) {
    return buildTenantPath(propertyId);
  }

  const query = new URLSearchParams();

  if (lease.room_id) {
    query.set('roomId', lease.room_id);
  }

  if (tenantId) {
    query.set('tenantId', tenantId);
  }

  return `/properties/${propertyId}/leases/${encodeURIComponent(lease.id)}${query.toString() ? `?${query.toString()}` : ''}`;
}

function getLeaseColumns(propertyId: string | undefined, tenantId: string | undefined): TableColumnsType<Lease> {
  return [
    {
      title: '房間',
      dataIndex: 'room_label',
      width: 140,
      render: (value: string | null | undefined) => getOptionalText(value),
    },
    {
      title: '租約期間',
      key: 'period',
      width: 220,
      render: (_, record) => `${getOptionalText(record.start_date)} - ${getOptionalText(record.end_date)}`,
    },
    {
      title: '狀態',
      dataIndex: 'status',
      width: 112,
      render: (value: Lease['status']) => (
        <Tag color={getStatusColor(value)}>{getLeaseStatusLabel(value)}</Tag>
      ),
    },
    {
      title: '租金',
      key: 'rent',
      width: 160,
      align: 'right',
      render: (_, record) => (
        record.rent_amount === null || record.rent_amount === undefined
          ? '未提供'
          : `${formatTwd(record.rent_amount)} / ${getCadenceLabel(record.rent_billing_cadence)}`
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Link to={buildLeaseDetailPath(propertyId, record, tenantId)}>租約詳情</Link>
      ),
    },
  ];
}

export default function TenantDetailPage() {
  const { propertyId, tenantId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { getAccessToken } = useAuth();
  const activeRequestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const requestIdRef = useRef(0);
  const [loadState, setLoadState] = useState<TenantDetailLoadState>({ status: 'loading', data: null });
  const [editOpen, setEditOpen] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const loadTenant = useCallback(() => {
    if (!tenantId) {
      setLoadState({ status: 'not-found', data: null });
      return;
    }

    abortRequest(activeRequestRef.current?.controller);
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    activeRequestRef.current = { id: requestId, controller };
    setLoadState({ status: 'loading', data: null });

    void Promise.all([
      getTenant(tenantId, getAccessToken, { signal: controller.signal }),
      listTenantLeases(tenantId, getAccessToken, {}, { signal: controller.signal })
        .then((response) => ({ status: 'ready' as const, leases: response.data ?? [] }))
        .catch((error: unknown) => {
          const errorState = classifyApiErrorForUi(error);

          if (errorState.kind === 'unauthorized') {
            throw error;
          }

          if (errorState.kind === 'cancelled') {
            throw error;
          }

          return { status: 'error' as const, leases: [] };
        }),
    ])
      .then(([tenant, leaseResult]) => {
        if (activeRequestRef.current?.id !== requestId) {
          return;
        }

        setLoadState({
          status: 'ready',
          data: {
            tenant,
            leases: leaseResult.leases,
            leasesStatus: leaseResult.status,
          },
        });
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
          navigate(getTenantReturnTo(location.pathname, location.search), { replace: true });
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
  }, [getAccessToken, location.pathname, location.search, navigate, tenantId]);

  useEffect(() => {
    loadTenant();

    return () => abortRequest(activeRequestRef.current?.controller);
  }, [loadTenant]);

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
    return <RetryableErrorState onRetry={() => loadTenant()} />;
  }

  const { tenant, leases, leasesStatus } = loadState.data;
  const tenantName = tenant.name ?? '租客詳情';

  return (
    <Space direction="vertical" size={16} className="page-stack">
      {contextHolder}
      <div className="page-header">
        <div>
          <Space size={8} wrap>
            <Tag color="blue">租客與租約</Tag>
            <Tag color={getStatusColor(tenant.status)}>{getTenantStatusLabel(tenant.status)}</Tag>
          </Space>
          <Typography.Title level={1}>{tenantName}</Typography.Title>
          <Typography.Paragraph type="secondary">
            維護租客基本資料並查看租約歷史；租客備註、付款、收據與附件上傳會由相關功能處理。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(buildTenantPath(propertyId))}>
            回租客與租約
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => loadTenant()}>
            重新整理
          </Button>
          <Button type="primary" icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
            編輯租客資料
          </Button>
        </Space>
      </div>

      <Card title="租客資料">
        <Descriptions column={{ xs: 1, md: 2 }} size="small">
          <Descriptions.Item label="姓名">{getOptionalText(tenant.name)}</Descriptions.Item>
          <Descriptions.Item label="狀態">
            <Tag color={getStatusColor(tenant.status)}>{getTenantStatusLabel(tenant.status)}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="電子信箱">{getOptionalText(tenant.email)}</Descriptions.Item>
          <Descriptions.Item label="電話">{getOptionalText(tenant.phone)}</Descriptions.Item>
          <Descriptions.Item label="生日">{getOptionalText(tenant.birth_date)}</Descriptions.Item>
          <Descriptions.Item label="身分證字號">{getOptionalText(tenant.national_id)}</Descriptions.Item>
          <Descriptions.Item label="職業">{getOptionalText(tenant.occupation)}</Descriptions.Item>
          <Descriptions.Item label="地址" span={2}>{getOptionalText(tenant.address)}</Descriptions.Item>
          <Descriptions.Item label="建立時間">
            {tenant.created_at ? formatDashboardDateTime(tenant.created_at) : '未提供'}
          </Descriptions.Item>
          <Descriptions.Item label="更新時間">
            {tenant.updated_at ? formatDashboardDateTime(tenant.updated_at) : '未提供'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="聯絡人">
        {tenant.contacts && tenant.contacts.length > 0 ? (
          <Table
            rowKey={(record, index) => `${record.name ?? 'contact'}-${index}`}
            dataSource={tenant.contacts}
            pagination={false}
            scroll={{ x: 720 }}
            columns={[
              { title: '姓名', dataIndex: 'name', width: 160, render: getOptionalText },
              { title: '關係', dataIndex: 'relation', width: 140, render: getOptionalText },
              { title: '電話', dataIndex: 'phone', width: 180, render: getOptionalText },
              { title: '電子信箱', dataIndex: 'email', width: 220, render: getOptionalText },
            ]}
          />
        ) : (
          <Typography.Text type="secondary">目前沒有聯絡人資料。</Typography.Text>
        )}
      </Card>

      <Card
        title="租約歷史"
        extra={leasesStatus === 'error' ? <Button onClick={() => loadTenant()}>重新整理</Button> : null}
      >
        {leasesStatus === 'error' ? (
          <Alert
            type="error"
            showIcon
            message="租約歷史暫時無法讀取"
            description="租客資料仍可使用，請稍後重新整理租約資料。"
          />
        ) : (
          <Table
            rowKey={(record) => record.id ?? `${record.room_id}-${record.start_date}`}
            dataSource={leases}
            pagination={false}
            scroll={{ x: 780 }}
            columns={getLeaseColumns(propertyId, tenant.id)}
          />
        )}
      </Card>

      {tenant.id ? (
        <Card title="文件附件">
          <TenantAttachmentManager tenantId={tenant.id} />
        </Card>
      ) : null}

      <TenantEditModal
        open={editOpen}
        tenant={tenant}
        onCancel={() => setEditOpen(false)}
        onSuccess={(updatedTenant) => {
          setEditOpen(false);
          setLoadState({
            status: 'ready',
            data: { ...loadState.data, tenant: updatedTenant },
          });
          void messageApi.success(getMutationSuccessFeedback('租客資料更新').content);
          loadTenant();
        }}
      />
    </Space>
  );
}

type TenantEditModalProps = {
  open: boolean;
  tenant: Tenant;
  onCancel: () => void;
  onSuccess: (tenant: Tenant) => void;
};

function TenantEditModal({ open, tenant, onCancel, onSuccess }: TenantEditModalProps) {
  const { getAccessToken } = useAuth();
  const [form] = Form.useForm<TenantEditFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      form.setFieldsValue(getTenantInitialValues(tenant));
      setSubmitError(null);
    }
  }, [form, open, tenant]);

  return (
    <Modal
      title="編輯租客資料"
      open={open}
      onCancel={onCancel}
      footer={null}
      width={820}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={(values) => {
          if (!tenant.id) {
            setSubmitError('租客資料不完整，請重新整理後再試。');
            return;
          }

          setSubmitting(true);
          setSubmitError(null);
          const payload = buildTenantUpdateRequest({
            ...values,
            birth_date: getDateValue(values.birth_date),
          });

          void updateTenant(tenant.id, payload, getAccessToken)
            .then(onSuccess)
            .catch((error: unknown) => {
              const errorState = classifyApiErrorForUi(error);
              const formError = getFormErrorState(error, {
                TENANT_EMAIL_INVALID: 'email',
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
        {submitError && (
          <Alert
            className="form-alert"
            type="error"
            showIcon
            message="無法儲存租客資料"
            description={submitError}
          />
        )}
        <Form.Item name="name" label="姓名（必填）" rules={[{ required: true, message: '請輸入姓名。' }]}>
          <Input />
        </Form.Item>
        <Form.Item
          name="email"
          label="電子信箱"
          rules={[
            { type: 'email', message: '請輸入有效的電子信箱。' },
          ]}
        >
          <Input />
        </Form.Item>
        <Form.Item name="phone" label="電話">
          <Input />
        </Form.Item>
        <Form.Item name="birth_date" label="生日">
          <DatePicker className="full-width-control" />
        </Form.Item>
        <Form.Item name="national_id" label="身分證字號">
          <Input />
        </Form.Item>
        <Form.Item name="address" label="地址">
          <Input />
        </Form.Item>
        <Form.Item name="occupation" label="職業">
          <Input />
        </Form.Item>

        <Card size="small" title="聯絡人" className="form-section-card">
          <Form.List name="contacts">
            {(fields, { add, remove }) => (
              <Space direction="vertical" size={12} className="page-stack">
                {fields.map((field) => (
                  <div className="form-inline-panel" key={field.key}>
                    <Space direction="vertical" size={8} className="page-stack">
                      <Form.Item name={[field.name, 'name']} label="姓名">
                        <Input />
                      </Form.Item>
                      <Form.Item name={[field.name, 'relation']} label="關係">
                        <Input />
                      </Form.Item>
                      <Form.Item name={[field.name, 'phone']} label="電話">
                        <Input />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'email']}
                        label="電子信箱"
                        rules={[{ type: 'email', message: '請輸入有效的電子信箱。' }]}
                      >
                        <Input />
                      </Form.Item>
                      <Button onClick={() => remove(field.name)}>移除聯絡人</Button>
                    </Space>
                  </div>
                ))}
                <Button icon={<PlusOutlined />} onClick={() => add()}>
                  新增聯絡人
                </Button>
              </Space>
            )}
          </Form.List>
        </Card>

        <Alert
          className="form-alert"
          type="info"
          showIcon
          message="租客備註未開放編輯"
          description="租客層級備註尚未開放編輯，這裡只維護目前支援的個人資料欄位。"
        />

        <div className="form-footer-actions">
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={submitting}>
            儲存租客資料
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
