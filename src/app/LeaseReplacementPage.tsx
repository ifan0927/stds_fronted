import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
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
  InputNumber,
  Result,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ApiError,
  classifyApiErrorForUi,
  getLease,
  replaceLease,
  type Lease,
  type LeaseReplaceRequest,
  type LeaseReplaceResponse,
} from '../api';
import { hasRole, useAuth } from '../auth';
import { formatTwd } from './format';
import { getMutationFailureFeedback, getMutationSuccessFeedback } from './operation';
import { abortRequest } from './requestAbort';
import {
  ForbiddenState,
  LoadingState,
  NotFoundState,
  RetryableErrorState,
} from './routeState';

type LeaseReplacementLoadState =
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: Lease }
  | { status: 'forbidden'; data: null }
  | { status: 'not-found'; data: null }
  | { status: 'error'; data: null };

type LeaseReplacementFormValues = {
  reason?: LeaseReplaceRequest['reason'];
  effective_start_date?: string | Dayjs;
  deposit_handling?: LeaseReplaceRequest['deposit_handling'];
  end_date?: string | Dayjs;
  rent_amount?: number;
  rent_billing_cadence?: LeaseReplaceRequest['new_lease']['rent_billing_cadence'];
  electricity_billing_cadence?: LeaseReplaceRequest['new_lease']['electricity_billing_cadence'];
  notes?: string | null;
};

const dateFormat = 'YYYY-MM-DD';

const reasonOptions: Array<{ value: NonNullable<LeaseReplaceRequest['reason']>; label: string }> = [
  { value: 'cadence_change', label: '週期變更' },
  { value: 'renewal', label: '續約' },
  { value: 'contract_reissue', label: '重發合約' },
  { value: 'other_exception', label: '其他例外' },
];

const rentCadenceOptions: Array<{
  value: LeaseReplacementFormValues['rent_billing_cadence'];
  label: string;
}> = [
  { value: 'monthly', label: '月繳' },
  { value: 'quarterly', label: '季繳' },
  { value: 'semiannual', label: '半年繳' },
  { value: 'annual', label: '年繳' },
];

const electricityCadenceOptions: Array<{
  value: LeaseReplacementFormValues['electricity_billing_cadence'];
  label: string;
}> = [
  { value: 'monthly', label: '每月' },
  { value: 'bimonthly', label: '雙月' },
];

const replacementErrorCopy: Record<string, string> = {
  LEASE_REPLACEMENT_NOT_AT_BILLING_BOUNDARY: '租約更換只能從完整租金與電費計費週期的邊界開始，請調整生效日後再送出。',
  LEASE_REPLACEMENT_HAS_UNSETTLED_BILLS: '生效日前仍有未結清帳單，請先完成收款或處理帳單後再更換租約。',
  LEASE_REPLACEMENT_SCOPE_MISMATCH: '租約更換僅支援同一物業、房間與租客的條件重建，請重新整理租約資料後再試。',
  LEASE_REPLACEMENT_DEPOSIT_HANDLING_UNSUPPORTED: '此流程第一版只支援押金沿用，請維持押金沿用後再送出。',
};

function getLeaseReturnTo(pathname: string, search: string) {
  return `/login?reason=session-expired&returnTo=${encodeURIComponent(`${pathname}${search}`)}`;
}

function buildPropertyPath(propertyId: string | undefined, suffix = '', query?: Record<string, string | null | undefined>) {
  if (!propertyId) {
    return '/properties';
  }

  const params = new URLSearchParams();

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  return `/properties/${encodeURIComponent(propertyId)}${suffix}${params.toString() ? `?${params.toString()}` : ''}`;
}

function getOptionalText(value: string | number | null | undefined) {
  if (typeof value === 'number') {
    return String(value);
  }

  return value && value.trim().length > 0 ? value : '未提供';
}

function getMoneyText(value: number | null | undefined) {
  return value === null || value === undefined ? '未提供' : formatTwd(value);
}

function getCadenceLabel(value: string | null | undefined) {
  if (value === 'monthly') {
    return '月繳';
  }

  if (value === 'quarterly') {
    return '季繳';
  }

  if (value === 'semiannual') {
    return '半年繳';
  }

  if (value === 'annual') {
    return '年繳';
  }

  if (value === 'bimonthly') {
    return '雙月';
  }

  return '未提供';
}

function getLeaseStatusLabel(value: string | null | undefined) {
  if (value === 'active') {
    return '有效';
  }

  if (value === 'expired') {
    return '已到期';
  }

  if (value === 'terminated') {
    return '已終止';
  }

  if (value === 'force_terminated') {
    return '強制退租';
  }

  return '未提供';
}

function getDateValue(value: string | Dayjs | undefined) {
  if (!value) {
    return undefined;
  }

  return typeof value === 'string' ? value : value.format(dateFormat);
}

function getTextOrNull(value: string | null | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function buildReplacementRequest(values: LeaseReplacementFormValues): LeaseReplaceRequest {
  return {
    reason: values.reason ?? 'cadence_change',
    effective_start_date: getDateValue(values.effective_start_date) ?? '',
    deposit_handling: 'carry_over',
    new_lease: {
      end_date: getDateValue(values.end_date) ?? '',
      rent_amount: values.rent_amount ?? 0,
      rent_billing_cadence: values.rent_billing_cadence ?? 'monthly',
      electricity_billing_cadence: values.electricity_billing_cadence ?? 'monthly',
      notes: getTextOrNull(values.notes),
    },
  };
}

function getReplacementSubmitError(error: unknown) {
  if (error instanceof ApiError && error.errorCode && replacementErrorCopy[error.errorCode]) {
    return replacementErrorCopy[error.errorCode];
  }

  return classifyApiErrorForUi(error).description;
}

function LeaseSummary({ title, lease }: { title: string; lease: Lease | undefined }) {
  return (
    <Card size="small" title={title}>
      <Descriptions column={{ xs: 1, md: 2 }} size="small">
        <Descriptions.Item label="租約">{getOptionalText(lease?.id)}</Descriptions.Item>
        <Descriptions.Item label="狀態">
          <Tag>{getLeaseStatusLabel(lease?.status)}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="房間">{getOptionalText(lease?.room_label ?? lease?.room_id)}</Descriptions.Item>
        <Descriptions.Item label="租客">{getOptionalText(lease?.tenant_label ?? lease?.tenant_id)}</Descriptions.Item>
        <Descriptions.Item label="期間">
          {getOptionalText(lease?.start_date)} - {getOptionalText(lease?.end_date)}
        </Descriptions.Item>
        <Descriptions.Item label="租金">
          {getMoneyText(lease?.rent_amount)} / {getCadenceLabel(lease?.rent_billing_cadence)}
        </Descriptions.Item>
        <Descriptions.Item label="電費週期">{getCadenceLabel(lease?.electricity_billing_cadence)}</Descriptions.Item>
        <Descriptions.Item label="押金">{getMoneyText(lease?.deposit_amount)}</Descriptions.Item>
        <Descriptions.Item label="備註" span={2}>{getOptionalText(lease?.notes)}</Descriptions.Item>
      </Descriptions>
    </Card>
  );
}

export default function LeaseReplacementPage() {
  const { propertyId, leaseId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, getAccessToken } = useAuth();
  const [form] = Form.useForm<LeaseReplacementFormValues>();
  const [loadState, setLoadState] = useState<LeaseReplacementLoadState>({ status: 'loading', data: null });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<LeaseReplaceResponse | null>(null);
  const [messageApi, contextHolder] = message.useMessage();
  const activeRequestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const requestIdRef = useRef(0);
  const submitControllerRef = useRef<AbortController | null>(null);
  const canReplaceLease = hasRole(currentUser, ['admin', 'organizer', 'staff']);

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
    setSubmitError(null);

    void getLease(leaseId, getAccessToken, { signal: controller.signal })
      .then((lease) => {
        if (activeRequestRef.current?.id !== requestId) {
          return;
        }

        setLoadState({ status: 'ready', data: lease });
        form.setFieldsValue({
          reason: 'cadence_change',
          deposit_handling: 'carry_over',
          rent_amount: lease.rent_amount,
          rent_billing_cadence: lease.rent_billing_cadence,
          electricity_billing_cadence: lease.electricity_billing_cadence,
          effective_start_date: undefined,
          end_date: lease.end_date ? dayjs(lease.end_date, dateFormat) : undefined,
          notes: lease.notes ?? null,
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
  }, [form, getAccessToken, leaseId, location.pathname, location.search, navigate]);

  useEffect(() => {
    loadLease();

    return () => {
      abortRequest(activeRequestRef.current?.controller);
      abortRequest(submitControllerRef.current);
    };
  }, [loadLease]);

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

  const lease = loadState.data;
  const newLease = success?.new_lease;
  const rosterPath = buildPropertyPath(propertyId, '/tenants', {
    roomId: newLease?.room_id ?? lease.room_id,
    leaseId: newLease?.id ?? lease.id,
    tenantId: newLease?.tenant_id ?? lease.tenant_id,
    view: 'hub',
  });

  if (success) {
    return (
      <Space direction="vertical" size={16} className="page-stack">
        {contextHolder}
        <Result
          icon={<CheckCircleOutlined />}
          status="success"
          title="租約更換已完成"
          subTitle="後端已終止舊租約並建立新租約；本頁只顯示後端回傳摘要。"
          extra={(
            <Space wrap>
              {newLease?.id && (
                <Button type="primary" onClick={() => navigate(buildPropertyPath(propertyId, `/leases/${newLease.id}`))}>
                  前往新租約
                </Button>
              )}
              <Button onClick={() => navigate(rosterPath)}>回租客與租約 Hub</Button>
            </Space>
          )}
        />
        <Card title="更換摘要">
          <Descriptions column={{ xs: 1, md: 2 }} size="small">
            <Descriptions.Item label="原因">
              {reasonOptions.find((option) => option.value === success.replacement?.reason)?.label ?? getOptionalText(success.replacement?.reason)}
            </Descriptions.Item>
            <Descriptions.Item label="生效日">{getOptionalText(success.replacement?.effective_start_date)}</Descriptions.Item>
            <Descriptions.Item label="押金處理">沿用舊租約押金</Descriptions.Item>
            <Descriptions.Item label="變更欄位">{success.replacement?.changed_fields?.join('、') ?? '未提供'}</Descriptions.Item>
          </Descriptions>
        </Card>
        <div className="lease-replacement-summary-grid">
          <LeaseSummary title="舊租約" lease={success.old_lease} />
          <LeaseSummary title="新租約" lease={success.new_lease} />
        </div>
      </Space>
    );
  }

  return (
    <Space direction="vertical" size={16} className="page-stack">
      {contextHolder}
      <div className="page-header">
        <div>
          <Space size={8} wrap>
            <Tag color="blue">租客與租約</Tag>
            <Tag>特殊租約更換</Tag>
          </Space>
          <Typography.Title level={1}>租約更換</Typography.Title>
          <Typography.Paragraph type="secondary">
            用於續約、週期變更或重發合約；生效日後的新條件由後端建立新租約承接。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(buildPropertyPath(propertyId, `/leases/${lease.id}`))}>
            回租約詳情
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => loadLease()}>
            重新整理
          </Button>
        </Space>
      </div>

      {!canReplaceLease && (
        <Alert
          type="warning"
          showIcon
          message="目前角色不可執行租約更換"
          description="租約更換需由 admin、organizer 或 staff 執行；即使直接進入此頁，後端仍會再次檢查權限。"
        />
      )}

      <LeaseSummary title="目前租約" lease={lease} />

      <Card title="更換內容">
        <Alert
          className="form-alert"
          type="warning"
          showIcon
          message="這不是退租、強制退租或押金結算"
          description="送出後後端會以生效日終止舊租約並建立新租約；本流程固定押金沿用，不處理實際搬出日 / 點交日、租金退款或押金扣抵。"
        />
        {submitError && (
          <Alert
            className="form-alert"
            type="error"
            showIcon
            message="無法完成租約更換"
            description={submitError}
          />
        )}
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          disabled={!canReplaceLease}
          onFinish={(values) => {
            if (!lease.id) {
              setSubmitError('租約資料不完整，請重新整理後再試。');
              return;
            }

            abortRequest(submitControllerRef.current);
            const controller = new AbortController();
            submitControllerRef.current = controller;
            setSubmitting(true);
            setSubmitError(null);

            void replaceLease(
              lease.id,
              buildReplacementRequest(values),
              getAccessToken,
              { signal: controller.signal },
            )
              .then((response) => {
                setSuccess(response);
                void messageApi.success(getMutationSuccessFeedback('租約更換').content);
              })
              .catch((error: unknown) => {
                const errorState = classifyApiErrorForUi(error);

                if (errorState.kind === 'cancelled') {
                  return;
                }

                if (errorState.kind === 'unauthorized') {
                  navigate(getLeaseReturnTo(location.pathname, location.search), { replace: true });
                  return;
                }

                setSubmitError(getReplacementSubmitError(error));
                void messageApi.error(getMutationFailureFeedback(errorState).content);
              })
              .finally(() => setSubmitting(false));
          }}
        >
          <div className="lease-replacement-form-grid">
            <Form.Item
              name="reason"
              label="更換原因（必填）"
              rules={[{ required: true, message: '請選擇更換原因。' }]}
            >
              <Select options={reasonOptions} className="full-width-control" />
            </Form.Item>
            <Form.Item
              name="effective_start_date"
              label="生效日（必填）"
              rules={[{ required: true, message: '請選擇生效日。' }]}
            >
              <DatePicker format={dateFormat} inputReadOnly className="full-width-control" />
            </Form.Item>
            <Form.Item name="deposit_handling" label="押金處理">
              <Select
                disabled
                options={[{ value: 'carry_over', label: '沿用舊租約押金' }]}
                className="full-width-control"
              />
            </Form.Item>
            <Form.Item
              name="end_date"
              label="新租約結束日（必填）"
              rules={[{ required: true, message: '請選擇新租約結束日。' }]}
            >
              <DatePicker format={dateFormat} inputReadOnly className="full-width-control" />
            </Form.Item>
            <Form.Item
              name="rent_amount"
              label="新租金（必填）"
              rules={[{ required: true, message: '請輸入新租金。' }]}
            >
              <InputNumber min={0} precision={0} className="full-width-control" />
            </Form.Item>
            <Form.Item
              name="rent_billing_cadence"
              label="租金週期（必填）"
              rules={[{ required: true, message: '請選擇租金週期。' }]}
            >
              <Select options={rentCadenceOptions} className="full-width-control" />
            </Form.Item>
            <Form.Item
              name="electricity_billing_cadence"
              label="電費週期（必填）"
              rules={[{ required: true, message: '請選擇電費週期。' }]}
            >
              <Select options={electricityCadenceOptions} className="full-width-control" />
            </Form.Item>
            <Form.Item name="notes" label="新租約備註" className="wide-form-item">
              <Input.TextArea rows={4} />
            </Form.Item>
          </div>
          <div className="form-footer-actions">
            <Button onClick={() => navigate(buildPropertyPath(propertyId, `/leases/${lease.id}`))}>
              取消
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              loading={submitting}
              disabled={!canReplaceLease}
            >
              確認送出租約更換
            </Button>
          </div>
        </Form>
      </Card>
    </Space>
  );
}
