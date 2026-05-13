import {
  ExportOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { TableColumnsType, TablePaginationConfig } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ApiError,
  classifyApiErrorForUi,
  exportLeaseCheckoutSettlement,
  finalizeLeaseCheckoutSettlement,
  forceTerminateLease,
  getLease,
  listLeaseCheckoutReviews,
  openHtmlDocumentPreview,
  previewLeaseCheckoutSettlement,
  type CheckoutSettlementFinalizeRequest,
  type CheckoutSettlementPreviewRequest,
  type CheckoutSettlementResponse,
  type ForceTerminateRequest,
  type ForceTermination,
  type HtmlPreviewWindow,
  type Lease,
  type LeaseCheckoutReview,
  type LeaseCheckoutReviewList,
} from '../api';
import { hasRole, useAuth } from '../auth';
import { formatDashboardDateTime, formatTwd } from './format';
import { abortRequest } from './requestAbort';
import {
  ForbiddenState,
  LoadingState,
  NotFoundState,
  RetryableErrorState,
} from './routeState';
import { getDepositStatusLabel, getLeaseStatusLabel, getOptionalText, getStatusColor } from './tenantLeaseDetail';

type CheckoutReviewLoadState =
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: LeaseCheckoutReviewList }
  | { status: 'forbidden'; data: null }
  | { status: 'error'; data: null };

type LeaseContextState =
  | { status: 'idle'; data: null }
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: Lease }
  | { status: 'forbidden'; data: null }
  | { status: 'not-found'; data: null }
  | { status: 'error'; data: null };

type CheckoutFormValues = {
  checkout_date?: Dayjs | string | null;
  actual_move_out_date?: Dayjs | string | null;
  reason?: string;
  final_meter_reading?: number | null;
  cleaning_fee?: number | null;
  key_card_loss_fee?: number | null;
  other_fee?: number | null;
  other_fee_reason?: string | null;
  manual_rent_refund_amount?: number | null;
  manual_rent_refund_reason?: string | null;
  notes?: string | null;
};

type CheckoutActionError = {
  type: 'preview' | 'finalize' | 'export' | 'force';
  title: string;
  description: string;
  retryable: boolean;
};

type ForceTerminationFormValues = {
  termination_date?: Dayjs | string | null;
  actual_move_out_date?: Dayjs | string | null;
  reason?: string;
  deposit_handling?: ForceTerminateRequest['deposit_handling'];
};

type CloseableHtmlPreviewWindow = HtmlPreviewWindow & {
  close?: () => void;
};

type CheckoutFormFieldError = {
  name: keyof CheckoutFormValues;
  errors: string[];
};

const defaultPage = 1;
const defaultLimit = 20;
const defaultReviewStatus: NonNullable<LeaseCheckoutReview['lease_status']> = 'expired';
const defaultCheckoutValues: CheckoutFormValues = {
  cleaning_fee: 0,
  key_card_loss_fee: 0,
  other_fee: 0,
  manual_rent_refund_amount: 0,
};
const defaultForceTerminationValues: ForceTerminationFormValues = {};

const checkoutStatusOptions: Array<{ value: 'all' | NonNullable<LeaseCheckoutReview['lease_status']>; label: string }> = [
  { value: 'all', label: '全部狀態' },
  { value: 'terminated', label: '已退租' },
  { value: 'expired', label: '已到期' },
  { value: 'force_terminated', label: '強制退租' },
];

const lineDirectionLabels: Record<string, string> = {
  refund: '退還',
  charge: '扣款',
  info: '資訊',
};

const netDirectionLabels: Record<CheckoutSettlementResponse['net_direction'], string> = {
  refund: '應退還',
  payable: '需補繳',
  zero: '已結清',
};

const blockerLabels: Record<string, string> = {
  unpaid_bill: '尚有未結清帳單',
  pending_meter: '尚有待抄表',
  lease_not_active: '租約狀態不符合',
  deposit_not_held: '押金狀態不符合',
  charge_exceeds_deposit: '扣款超過押金',
  checkout_date_before_lease_start: '結算日早於租約起日',
  manual_rent_refund_decision_required: '未到期租金退款需人工決策',
};

const billBackedBlockerCodes = new Set(['unpaid_bill', 'pending_meter']);

const checkoutValidationFieldMessages: Partial<Record<keyof CheckoutFormValues, string>> = {
  checkout_date: '請確認結算生效日 / 租約終止日。',
  reason: '請填寫退租原因。',
  final_meter_reading: '請確認退租電表讀數。',
  manual_rent_refund_amount: '請確認人工未到期租金退款金額。',
  manual_rent_refund_reason: '請填寫人工租金退款決策原因。',
};

const checkoutValidationFieldNames = new Set<keyof CheckoutFormValues>(Object.keys(checkoutValidationFieldMessages) as Array<keyof CheckoutFormValues>);
const forceDepositHandlingOptions: Array<{ value: ForceTerminateRequest['deposit_handling']; label: string }> = [
  { value: 'write_off', label: '押金沖銷' },
  { value: 'keep_held', label: '保留押金' },
];

function getCheckoutReturnTo(pathname: string, search: string) {
  return `/login?reason=session-expired&returnTo=${encodeURIComponent(`${pathname}${search}`)}`;
}

function getPositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getDateValue(value: Dayjs | string | null | undefined) {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  return value.format('YYYY-MM-DD');
}

function buildCheckoutRequest(values: CheckoutFormValues): CheckoutSettlementPreviewRequest {
  return {
    checkout_date: getDateValue(values.checkout_date),
    actual_move_out_date: getDateValue(values.actual_move_out_date) || null,
    reason: values.reason?.trim() ?? '',
    final_meter_reading: values.final_meter_reading ?? null,
    cleaning_fee: values.cleaning_fee ?? 0,
    key_card_loss_fee: values.key_card_loss_fee ?? 0,
    other_fee: values.other_fee ?? 0,
    other_fee_reason: values.other_fee_reason?.trim() || null,
    manual_rent_refund_amount: values.manual_rent_refund_amount ?? 0,
    manual_rent_refund_reason: values.manual_rent_refund_reason?.trim() || null,
    notes: values.notes?.trim() || null,
  };
}

function buildForceTerminationRequest(values: ForceTerminationFormValues): Partial<ForceTerminateRequest> {
  return {
    termination_date: getDateValue(values.termination_date),
    actual_move_out_date: getDateValue(values.actual_move_out_date) || null,
    reason: values.reason?.trim() ?? '',
    deposit_handling: values.deposit_handling,
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

  const search = params.toString();

  return `/properties/${propertyId}${suffix}${search ? `?${search}` : ''}`;
}

function getCheckoutReviewStatusLabel(status: LeaseCheckoutReview['lease_status']) {
  if (status === 'terminated') {
    return '已退租';
  }

  if (status === 'expired') {
    return '已到期';
  }

  if (status === 'force_terminated') {
    return '強制退租';
  }

  return '未提供';
}

function getForceDepositHandlingLabel(value: LeaseCheckoutReview['force_termination_deposit_handling']) {
  if (value === 'write_off') {
    return '押金沖銷';
  }

  if (value === 'keep_held') {
    return '保留押金';
  }

  return '未提供';
}

function getActionError(type: CheckoutActionError['type'], error: unknown): CheckoutActionError {
  const state = classifyApiErrorForUi(error);

  if (state.kind === 'conflict') {
    return {
      type,
      title: '退租試算已失效',
      description: '租約、帳單或押金狀態已被更新，請重新整理並重新產生退租試算。',
      retryable: true,
    };
  }

  if (state.kind === 'validation') {
    return {
      type,
      title: '退租資料未通過檢查',
      description: '請確認退租日、原因與費用欄位；若系統提示待處理事項，請先處理後再重試。',
      retryable: false,
    };
  }

  return {
    type,
    title: state.title,
    description: state.description,
    retryable: state.retryable,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getCheckoutFieldError(error: unknown): CheckoutFormFieldError | null {
  if (!(error instanceof ApiError) || !isRecord(error.details)) {
    return null;
  }

  const field = error.details.field;

  if (typeof field !== 'string' || !checkoutValidationFieldNames.has(field as keyof CheckoutFormValues)) {
    return null;
  }

  const fieldName = field as keyof CheckoutFormValues;

  return {
    name: fieldName,
    errors: [checkoutValidationFieldMessages[fieldName] ?? '請確認此欄位。'],
  };
}

function getCheckoutPreviewFieldHints(preview: CheckoutSettlementResponse): CheckoutFormFieldError[] {
  const hints: CheckoutFormFieldError[] = [];

  preview.blockers.forEach((blocker) => {
    if (blocker.code === 'manual_rent_refund_decision_required') {
      hints.push({
        name: 'manual_rent_refund_reason',
        errors: ['結算生效日早於原租約結束日，請填寫人工租金退款決策原因；金額可為 0。'],
      });
    }

    if (blocker.code === 'checkout_date_before_lease_start') {
      hints.push({
        name: 'checkout_date',
        errors: ['結算生效日不能早於租約起日。'],
      });
    }

    if (blocker.code === 'pending_meter') {
      hints.push({
        name: 'final_meter_reading',
        errors: ['請確認退租讀數已填，且結算生效日符合待抄表帳單週期。'],
      });
    }
  });

  return hints;
}

function getEmptyCheckoutFieldErrors(): CheckoutFormFieldError[] {
  return Array.from(checkoutValidationFieldNames).map((name) => ({
    name,
    errors: [],
  }));
}

function hasElectricitySettlementLine(preview: CheckoutSettlementResponse) {
  return preview.lines.some((line) => line.kind === 'electricity_settlement');
}

function renderFinalMeterReadingSummary(preview: CheckoutSettlementResponse) {
  if (typeof preview.final_meter_reading !== 'number') {
    return '未提供';
  }

  return hasElectricitySettlementLine(preview)
    ? `${preview.final_meter_reading}（已納入本次電費結算）`
    : `${preview.final_meter_reading}（本次未產生電費結算項目）`;
}

function renderAmount(value: number | null | undefined) {
  return typeof value === 'number' ? formatTwd(value) : '未提供';
}

function getBlockerLabel(code: string) {
  return blockerLabels[code] ?? '待確認項目';
}

function getBlockerMessage(blocker: CheckoutSettlementResponse['blockers'][number]) {
  if (blocker.code === 'manual_rent_refund_decision_required') {
    return '結算生效日早於原租約結束日，請填寫人工未到期租金退款金額與原因；金額可為 0，但原因必須說明決策。';
  }

  if (blocker.code === 'checkout_date_before_lease_start') {
    return '結算生效日不能早於租約起日，請調整日期後重新產生退租試算。';
  }

  if (blocker.code === 'charge_exceeds_deposit') {
    return '退租扣款超過押金金額，請調整費用後重新產生退租試算。';
  }

  if (blocker.code === 'deposit_not_held') {
    return '押金狀態不符合退租結算條件，請先確認押金資料。';
  }

  if (blocker.code === 'lease_not_active') {
    return '租約狀態不符合正常退租條件，請使用審核清單或其他對應流程。';
  }

  return blocker.message;
}

function getBlockerActionText(code: string) {
  if (code === 'manual_rent_refund_decision_required') {
    return '補上人工決策';
  }

  if (code === 'checkout_date_before_lease_start') {
    return '調整結算日';
  }

  return '重新整理後確認';
}

function isBillBackedBlocker(blocker: CheckoutSettlementResponse['blockers'][number]) {
  return Boolean(blocker.source_id && billBackedBlockerCodes.has(blocker.code));
}

function renderManualRentRefundDecision(preview: CheckoutSettlementResponse) {
  if (typeof preview.manual_rent_refund_amount !== 'number' && !preview.manual_rent_refund_reason) {
    return '未提供';
  }

  return `${renderAmount(preview.manual_rent_refund_amount)}${preview.manual_rent_refund_reason ? ` / ${preview.manual_rent_refund_reason}` : ''}`;
}

function getSourceNumber(sourceRef: Record<string, unknown> | null | undefined, key: string) {
  const value = sourceRef?.[key];

  return typeof value === 'number' ? value : null;
}

function getElectricitySourceDetail(line: CheckoutSettlementResponse['lines'][number]) {
  if (line.kind !== 'electricity_settlement' || !line.source_ref) {
    return null;
  }

  const previousReading = getSourceNumber(line.source_ref, 'previous_reading');
  const finalReading = getSourceNumber(line.source_ref, 'final_meter_reading')
    ?? getSourceNumber(line.source_ref, 'current_reading');
  const usage = getSourceNumber(line.source_ref, 'usage');
  const unitPrice = getSourceNumber(line.source_ref, 'unit_price');
  const details = [
    previousReading === null ? null : `前次讀數 ${previousReading}`,
    finalReading === null ? null : `退租讀數 ${finalReading}`,
    usage === null ? null : `用電 ${usage} 度`,
    unitPrice === null ? null : `單價 ${unitPrice}`,
  ].filter(Boolean);

  return details.length > 0 ? details.join(' / ') : null;
}

function canStartCheckoutWorkflow(record: LeaseCheckoutReview) {
  return record.lease_status === 'expired' && !record.checkout_finalized_at;
}

function canSubmitCheckoutSettlement(lease: Lease) {
  return lease.status === 'active' || lease.status === 'expired';
}

function canSubmitForceTermination(lease: Lease) {
  return lease.status === 'active';
}

function getCheckoutProgressLabel(record: LeaseCheckoutReview) {
  if (record.checkout_finalized_at) {
    return formatDashboardDateTime(record.checkout_finalized_at);
  }

  if (
    record.lease_status === 'force_terminated'
    && record.force_termination_deposit_handling === 'keep_held'
    && record.deposit_status === 'held'
  ) {
    return '尚未處理押金';
  }

  return '尚未完成';
}

function canStartForceDepositHandling(record: LeaseCheckoutReview) {
  return Boolean(
    record.force_termination_id
    && record.lease_status === 'force_terminated'
    && record.force_termination_deposit_handling === 'keep_held'
    && record.deposit_status === 'held',
  );
}

type CheckoutSettlementPageProps = {
  embeddedWorkflow?: boolean;
  onEmbeddedClose?: () => void;
  onEmbeddedWorkflowSuccess?: () => void;
};

export default function CheckoutSettlementPage({
  embeddedWorkflow = false,
  onEmbeddedClose,
  onEmbeddedWorkflowSuccess,
}: CheckoutSettlementPageProps = {}) {
  const { propertyId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser, getAccessToken } = useAuth();
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<CheckoutFormValues>();
  const [forceForm] = Form.useForm<ForceTerminationFormValues>();
  const reviewRequestRef = useRef<AbortController | null>(null);
  const leaseRequestRef = useRef<AbortController | null>(null);
  const formTouchedRef = useRef(false);
  const [reviewState, setReviewState] = useState<CheckoutReviewLoadState>({ status: 'loading', data: null });
  const [leaseState, setLeaseState] = useState<LeaseContextState>({ status: 'idle', data: null });
  const [preview, setPreview] = useState<CheckoutSettlementResponse | null>(null);
  const [submittingPreview, setSubmittingPreview] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [actionError, setActionError] = useState<CheckoutActionError | null>(null);
  const [forceConfirmOpen, setForceConfirmOpen] = useState(false);
  const [forceSubmitting, setForceSubmitting] = useState(false);
  const [pendingForceRequest, setPendingForceRequest] = useState<ForceTerminateRequest | null>(null);

  const leaseId = searchParams.get('leaseId') ?? undefined;
  const workflowMode = searchParams.get('mode') === 'force' ? 'force' : 'checkout';
  const statusParam = searchParams.get('status') as 'all' | LeaseCheckoutReview['lease_status'] | null;
  const status = statusParam === 'all' ? undefined : statusParam ?? defaultReviewStatus;
  const statusControlValue = statusParam ?? defaultReviewStatus;
  const page = getPositiveInteger(searchParams.get('page'), defaultPage);
  const limit = getPositiveInteger(searchParams.get('limit'), defaultLimit);
  const canForceTerminate = hasRole(currentUser, ['admin', 'organizer']);

  const setReviewQuery = useCallback((next: {
    status?: 'all' | LeaseCheckoutReview['lease_status'] | null;
    page?: number;
    limit?: number;
  }) => {
    const updated = new URLSearchParams(searchParams);

    if (next.status === null) {
      updated.delete('status');
    } else if (next.status) {
      updated.set('status', next.status);
    }

    if (next.page) {
      updated.set('page', String(next.page));
    }

    if (next.limit) {
      updated.set('limit', String(next.limit));
    }

    setSearchParams(updated);
  }, [searchParams, setSearchParams]);

  const loadReviews = useCallback(() => {
    if (!propertyId) {
      return;
    }

    abortRequest(reviewRequestRef.current);
    const controller = new AbortController();
    reviewRequestRef.current = controller;
    setReviewState({ status: 'loading', data: null });

    void listLeaseCheckoutReviews(
      getAccessToken,
      {
        property_id: propertyId,
        status: status ?? undefined,
        page,
        limit,
      },
      { signal: controller.signal },
    )
      .then((data) => {
        if (reviewRequestRef.current !== controller) {
          return;
        }

        setReviewState({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (reviewRequestRef.current !== controller) {
          return;
        }

        const errorState = classifyApiErrorForUi(error);

        if (errorState.kind === 'cancelled') {
          return;
        }

        if (errorState.kind === 'unauthorized') {
          navigate(getCheckoutReturnTo(location.pathname, location.search), { replace: true });
          return;
        }

        setReviewState({
          status: errorState.kind === 'forbidden' ? 'forbidden' : 'error',
          data: null,
        });
      });
  }, [getAccessToken, limit, location.pathname, location.search, navigate, page, propertyId, status]);

  const loadLease = useCallback((nextLeaseId: string, options: { preservePreview?: boolean } = {}) => {
    abortRequest(leaseRequestRef.current);
    const controller = new AbortController();
    leaseRequestRef.current = controller;
    setLeaseState({ status: 'loading', data: null });
    if (!options.preservePreview) {
      setPreview(null);
    }
    setActionError(null);

    void getLease(nextLeaseId, getAccessToken, { signal: controller.signal })
      .then((data) => {
        if (leaseRequestRef.current !== controller) {
          return;
        }

        setLeaseState({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (leaseRequestRef.current !== controller) {
          return;
        }

        const errorState = classifyApiErrorForUi(error);

        if (errorState.kind === 'cancelled') {
          return;
        }

        if (errorState.kind === 'unauthorized') {
          navigate(getCheckoutReturnTo(location.pathname, location.search), { replace: true });
          return;
        }

        if (errorState.kind === 'forbidden') {
          setLeaseState({ status: 'forbidden', data: null });
        } else if (errorState.kind === 'not-found') {
          setLeaseState({ status: 'not-found', data: null });
        } else {
          setLeaseState({ status: 'error', data: null });
        }
      });
  }, [getAccessToken, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (embeddedWorkflow) {
      return undefined;
    }

    loadReviews();

    return () => abortRequest(reviewRequestRef.current);
  }, [embeddedWorkflow, loadReviews]);

  useEffect(() => {
    if (!leaseId) {
      abortRequest(leaseRequestRef.current);
      setLeaseState({ status: 'idle', data: null });
      setPreview(null);
      setActionError((current) => current?.type === 'export' ? current : null);
      setWorkflowOpen(false);
      setForceConfirmOpen(false);
      setPendingForceRequest(null);
      formTouchedRef.current = false;
      form.resetFields();
      form.setFieldsValue(defaultCheckoutValues);
      forceForm.resetFields();
      forceForm.setFieldsValue(defaultForceTerminationValues);
      return undefined;
    }

    formTouchedRef.current = false;
    form.resetFields();
    form.setFieldsValue(defaultCheckoutValues);
    forceForm.resetFields();
    forceForm.setFieldsValue(defaultForceTerminationValues);
    setForceConfirmOpen(false);
    setPendingForceRequest(null);
    setWorkflowOpen(true);
    loadLease(leaseId);

    return () => abortRequest(leaseRequestRef.current);
  }, [forceForm, form, leaseId, loadLease]);

  const reviewRows = useMemo(
    () => reviewState.status === 'ready' ? reviewState.data.data ?? [] : [],
    [reviewState],
  );
  const pagination = reviewState.status === 'ready' ? reviewState.data.pagination : undefined;
  const selectedLease = leaseState.status === 'ready' ? leaseState.data : null;
  const previewToken = preview?.preview_token ?? null;
  const canFinalize = Boolean(previewToken && preview && preview.blockers.length === 0 && !preview.finalized_at);
  const canExport = Boolean(preview?.export_available && (preview?.lease_id || leaseId));
  const mainActionError = actionError?.type === 'export' && !workflowOpen ? actionError : null;

  const closeWorkflow = useCallback(() => {
    setWorkflowOpen(false);
    setFinalizeOpen(false);
    setForceConfirmOpen(false);
    setPendingForceRequest(null);
    setPreview(null);
    setActionError(null);

    if (embeddedWorkflow) {
      onEmbeddedClose?.();
      return;
    }

    const updated = new URLSearchParams(searchParams);
    updated.delete('leaseId');
    updated.delete('roomId');
    updated.delete('tenantId');
    updated.delete('mode');
    setSearchParams(updated);
  }, [embeddedWorkflow, onEmbeddedClose, searchParams, setSearchParams]);

  useEffect(() => {
    if (workflowMode === 'force' || !selectedLease?.end_date || preview || formTouchedRef.current) {
      return;
    }

    form.setFieldsValue({ checkout_date: dayjs(selectedLease.end_date) });
  }, [form, preview, selectedLease, workflowMode]);

  const redirectExpiredSession = useCallback(() => {
    navigate(getCheckoutReturnTo(location.pathname, location.search), { replace: true });
  }, [location.pathname, location.search, navigate]);

  const openExport = useCallback(async (
    targetLeaseId?: string,
    existingPreviewWindow?: CloseableHtmlPreviewWindow | null,
  ) => {
    const exportLeaseId = targetLeaseId ?? preview?.lease_id ?? leaseId;

    if (!exportLeaseId) {
      existingPreviewWindow?.close?.();
      return;
    }

    setExporting(true);
    setActionError(null);
    const previewWindow = existingPreviewWindow ?? (window.open('', '_blank') as CloseableHtmlPreviewWindow | null);

    try {
      const response = await exportLeaseCheckoutSettlement(exportLeaseId, getAccessToken);
      const result = openHtmlDocumentPreview(response, previewWindow as HtmlPreviewWindow | null);

      if (!result.ok) {
        setActionError({
          type: 'export',
          title: '退租結算書無法開啟',
          description: '瀏覽器阻擋了新視窗，請允許彈出視窗後重試。',
          retryable: true,
        });
        previewWindow?.close?.();
        return;
      }

      void messageApi.success('退租結算書已開啟。');
    } catch (error) {
      previewWindow?.close?.();
      if (classifyApiErrorForUi(error).kind === 'unauthorized') {
        redirectExpiredSession();
        return;
      }
      setActionError(getActionError('export', error));
    } finally {
      setExporting(false);
    }
  }, [getAccessToken, leaseId, messageApi, preview?.lease_id, redirectExpiredSession]);

  const reviewColumns: TableColumnsType<LeaseCheckoutReview> = useMemo(() => [
    {
      title: '房間 / 租客',
      dataIndex: 'room_label',
      key: 'room',
      width: 220,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{record.room_label ?? '未提供房號'}</Typography.Text>
          <Typography.Text type="secondary">{record.tenant_label ?? '未提供租客'}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '狀態',
      dataIndex: 'lease_status',
      key: 'lease_status',
      width: 140,
      render: (value: LeaseCheckoutReview['lease_status']) => (
        <Tag color={getStatusColor(value)}>{getCheckoutReviewStatusLabel(value)}</Tag>
      ),
    },
    {
      title: '租約期間',
      key: 'period',
      width: 220,
      render: (_, record) => `${record.start_date ?? '未提供'} 至 ${record.end_date ?? '未提供'}`,
    },
    {
      title: '押金',
      key: 'deposit',
      width: 180,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{getDepositStatusLabel(record.deposit_status)}</Typography.Text>
          <Typography.Text type="secondary">
            退 {renderAmount(record.deposit_refund_amount)} / 扣 {renderAmount(record.deposit_deduction_amount)}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '退租結算',
      key: 'checkout',
      width: 220,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>
            {getCheckoutProgressLabel(record)}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '強制退租',
      key: 'force',
      width: 180,
      render: (_, record) => record.force_termination_id ? (
        <Space direction="vertical" size={0}>
          <Link to={buildPropertyPath(propertyId, `/force-terminations/${record.force_termination_id}`)}>
            {record.force_termination_status === 'completed' ? '已完成' : '處理中'}
          </Link>
          <Typography.Text type="secondary">
            {getForceDepositHandlingLabel(record.force_termination_deposit_handling)}
          </Typography.Text>
        </Space>
      ) : '不適用',
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 130,
      render: (_, record) => (
        <Space wrap>
          {record.lease_id && canStartCheckoutWorkflow(record) && (
            <Button
              size="small"
              onClick={() => {
                const updated = new URLSearchParams(searchParams);
                updated.set('leaseId', record.lease_id ?? '');
                if (record.room_id) {
                  updated.set('roomId', record.room_id);
                }
                if (record.tenant_id) {
                  updated.set('tenantId', record.tenant_id);
                }
                updated.delete('mode');
                setSearchParams(updated);
                setWorkflowOpen(true);
              }}
            >
              開啟流程
            </Button>
          )}
          {canStartForceDepositHandling(record) && (
            <Button size="small">
              <Link to={buildPropertyPath(propertyId, `/force-terminations/${record.force_termination_id}`)}>
                押金處理
              </Link>
            </Button>
          )}
        </Space>
      ),
    },
  ], [propertyId, searchParams, setSearchParams]);

  async function submitPreview(values: CheckoutFormValues) {
    if (!leaseId) {
      return;
    }

    const body = buildCheckoutRequest(values);
    setSubmittingPreview(true);
    setActionError(null);
    setPreview(null);

    try {
      const response = await previewLeaseCheckoutSettlement(leaseId, body, getAccessToken);
      setPreview(response);
      const fieldHints = getCheckoutPreviewFieldHints(response);

      form.setFields([...getEmptyCheckoutFieldErrors(), ...fieldHints]);
      void messageApi.success('退租試算已產生。');
    } catch (error) {
      if (classifyApiErrorForUi(error).kind === 'unauthorized') {
        redirectExpiredSession();
        return;
      }
      const fieldError = getCheckoutFieldError(error);

      if (fieldError) {
        form.setFields([fieldError]);
      }
      setActionError(getActionError('preview', error));
    } finally {
      setSubmittingPreview(false);
    }
  }

  async function submitFinalize() {
    if (!leaseId || !previewToken) {
      return;
    }

    const body: CheckoutSettlementFinalizeRequest = {
      ...buildCheckoutRequest(form.getFieldsValue()),
      preview_token: previewToken,
    };
    setFinalizing(true);
    setActionError(null);

    const exportWindow = window.open('', '_blank');

    try {
      const response = await finalizeLeaseCheckoutSettlement(leaseId, body, getAccessToken);
      setPreview(response);
      setFinalizeOpen(false);
      form.setFieldsValue({
        checkout_date: dayjs(response.checkout_date),
        actual_move_out_date: response.actual_move_out_date ? dayjs(response.actual_move_out_date) : null,
        reason: response.reason,
        final_meter_reading: response.final_meter_reading ?? null,
        manual_rent_refund_amount: response.manual_rent_refund_amount ?? 0,
        manual_rent_refund_reason: response.manual_rent_refund_reason ?? null,
        notes: response.notes ?? null,
      });
      if (!embeddedWorkflow) {
        loadReviews();
      }
      loadLease(leaseId, { preservePreview: true });
      if (embeddedWorkflow) {
        onEmbeddedWorkflowSuccess?.();
      } else {
        const updated = new URLSearchParams(searchParams);
        updated.delete('leaseId');
        updated.delete('roomId');
        updated.delete('tenantId');
        updated.set('status', 'terminated');
        updated.set('page', String(defaultPage));
        setSearchParams(updated);
        setWorkflowOpen(false);
      }
      void messageApi.success('退租結算已完成。');
      if (response.export_available) {
        await openExport(response.lease_id, exportWindow as CloseableHtmlPreviewWindow | null);
      } else {
        exportWindow?.close();
      }
    } catch (error) {
      exportWindow?.close();
      if (classifyApiErrorForUi(error).kind === 'unauthorized') {
        redirectExpiredSession();
        return;
      }
      const nextError = getActionError('finalize', error);
      setActionError(nextError);
      if (nextError.title === '退租試算已失效') {
        setPreview(null);
      }
    } finally {
      setFinalizing(false);
    }
  }

  function prepareForceTermination(values: ForceTerminationFormValues) {
    if (!canForceTerminate || !leaseId || !selectedLease || !canSubmitForceTermination(selectedLease)) {
      return;
    }

    const body = buildForceTerminationRequest(values);

    if (!body.termination_date || !body.reason || !body.deposit_handling) {
      setActionError({
        type: 'force',
        title: '強制退租資料未完成',
        description: '請填寫強制退租日、原因與押金處理方式後再送出。',
        retryable: false,
      });
      return;
    }

    setPendingForceRequest(body as ForceTerminateRequest);
    setActionError(null);
    setForceConfirmOpen(true);
  }

  async function submitForceTermination() {
    if (!leaseId || !pendingForceRequest) {
      return;
    }

    setForceSubmitting(true);
    setActionError(null);

    try {
      const response: ForceTermination = await forceTerminateLease(leaseId, pendingForceRequest, getAccessToken);

      if (!response.id) {
        setActionError({
          type: 'force',
          title: '強制退租已送出但缺少明細識別',
          description: '強制退租已送出，但目前無法開啟明細頁。請重新整理審核清單確認狀態。',
          retryable: true,
        });
        setForceConfirmOpen(false);
        if (!embeddedWorkflow) {
          loadReviews();
        }
        loadLease(leaseId);
        return;
      }

      void messageApi.success('強制退租已建立。');
      setForceConfirmOpen(false);
      setPendingForceRequest(null);
      if (!embeddedWorkflow) {
        loadReviews();
      }
      loadLease(leaseId);
      if (embeddedWorkflow) {
        onEmbeddedWorkflowSuccess?.();
      } else {
        navigate(buildPropertyPath(propertyId, `/force-terminations/${response.id}`));
      }
    } catch (error) {
      const errorState = classifyApiErrorForUi(error);

      if (errorState.kind === 'unauthorized') {
        redirectExpiredSession();
        return;
      }

      setForceConfirmOpen(false);
      setActionError({
        type: 'force',
        title: errorState.kind === 'forbidden' ? '沒有權限執行強制退租' : errorState.title,
        description: errorState.kind === 'forbidden'
          ? '目前帳號不能執行此危險流程；若權限剛調整，請重新登入後再試。'
          : errorState.description,
        retryable: errorState.retryable,
      });
    } finally {
      setForceSubmitting(false);
    }
  }

  if (!propertyId) {
    return <NotFoundState />;
  }

  if (!embeddedWorkflow && reviewState.status === 'loading' && !leaseId) {
    return <LoadingState />;
  }

  if (!embeddedWorkflow && reviewState.status === 'forbidden') {
    return <ForbiddenState />;
  }

  if (!embeddedWorkflow && reviewState.status === 'error' && !leaseId) {
    return <RetryableErrorState onRetry={loadReviews} />;
  }

  return (
    <Space direction="vertical" size={16} className="page-stack">
      {contextHolder}
      {!embeddedWorkflow && (
      <>
      <div className="page-header">
        <div>
          <Space size={8} wrap>
            <Tag color="blue">租客與租約</Tag>
            <Tag>退租結算</Tag>
          </Space>
          <Typography.Title level={1}>退租審核與歷史</Typography.Title>
          <Typography.Paragraph type="secondary">
            查看已到期、已退租與強制退租資料；正常退租請從租約詳情或租客與租約頁進入。此頁只呈現系統試算與結算結果，不自行計算金額。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={() => {
            loadReviews();
            if (leaseId) {
              loadLease(leaseId);
            }
          }}
          >
            重新整理
          </Button>
          <Button>
            <Link to={buildPropertyPath(propertyId, '/tenants')}>回租客與租約</Link>
          </Button>
        </Space>
      </div>

      {reviewState.status === 'error' && (
        <Alert
          type="error"
          showIcon
          message="退租清單暫時無法讀取"
          description="可先處理目前租約的退租流程，或稍後重新整理清單。"
          action={<Button size="small" onClick={loadReviews}>重試</Button>}
        />
      )}

      {mainActionError && (
        <Alert
          type="error"
          showIcon
          message={mainActionError.title}
          description={mainActionError.description}
        />
      )}

      <Card title="退租審核清單">
        <Space direction="vertical" size={16} className="page-stack">
          <Space wrap>
            <Select
              aria-label="退租狀態"
              allowClear
              placeholder="已到期"
              value={statusControlValue}
              options={checkoutStatusOptions}
              onChange={(value) => setReviewQuery({ status: value || 'all', page: defaultPage })}
              className="filter-control"
            />
            <Button onClick={() => setReviewQuery({ status: 'all', page: defaultPage })}>
              顯示全部
            </Button>
            <Typography.Text type="secondary">預設顯示已到期；清單順序以目前資料為準。</Typography.Text>
          </Space>
          <Table
            rowKey={(record) => record.lease_id ?? `${record.room_id}-${record.tenant_id}`}
            loading={reviewState.status === 'loading'}
            columns={reviewColumns}
            dataSource={reviewRows}
            scroll={{ x: 1180 }}
            pagination={{
              current: pagination?.page ?? page,
              pageSize: pagination?.limit ?? limit,
              total: pagination?.total ?? reviewRows.length,
              showSizeChanger: true,
            }}
            onChange={(nextPagination: TablePaginationConfig) => {
              setReviewQuery({
                page: nextPagination.current ?? defaultPage,
                limit: nextPagination.pageSize ?? defaultLimit,
              });
            }}
          />
        </Space>
      </Card>
      </>
      )}

      <Drawer
        title={workflowMode === 'force' ? '強制退租' : '退租結算試算'}
        open={workflowOpen}
        onClose={closeWorkflow}
        width={960}
        destroyOnClose={false}
      >
        {!leaseId && (
          <Alert
            type="info"
            showIcon
            message="請先選擇租約"
            description="可從上方清單、租約詳情或租客與租約工作入口進入退租流程。"
          />
        )}

        {leaseState.status === 'loading' && <LoadingState />}
        {leaseState.status === 'forbidden' && <ForbiddenState />}
        {leaseState.status === 'not-found' && <NotFoundState />}
        {leaseState.status === 'error' && <RetryableErrorState onRetry={() => leaseId && loadLease(leaseId)} />}

        {selectedLease && workflowMode === 'checkout' && (
          <Space direction="vertical" size={16} className="page-stack">
            <Descriptions bordered size="small" column={{ xs: 1, md: 2, xl: 3 }}>
              <Descriptions.Item label="物業">{getOptionalText(selectedLease.property_label)}</Descriptions.Item>
              <Descriptions.Item label="房間">{getOptionalText(selectedLease.room_label)}</Descriptions.Item>
              <Descriptions.Item label="租客">{getOptionalText(selectedLease.tenant_label)}</Descriptions.Item>
              <Descriptions.Item label="租約狀態">
                <Tag color={getStatusColor(selectedLease.status)}>{getLeaseStatusLabel(selectedLease.status)}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="租期">
                {selectedLease.start_date ?? '未提供'} 至 {selectedLease.end_date ?? '未提供'}
              </Descriptions.Item>
              <Descriptions.Item label="押金">
                {renderAmount(selectedLease.deposit_amount)} / {getDepositStatusLabel(selectedLease.deposit_status)}
              </Descriptions.Item>
            </Descriptions>

            {!canSubmitCheckoutSettlement(selectedLease) && (
              <Alert
                type="warning"
                showIcon
                message="此租約不是進行中"
                description="正常退租需要進行中或已到期租約；已退租或強制退租資料請使用審核清單與明細頁檢視。"
              />
            )}

            <Form
              form={form}
              layout="vertical"
              requiredMark={false}
              initialValues={defaultCheckoutValues}
              onValuesChange={() => {
                formTouchedRef.current = true;
                if (preview) {
                  setPreview(null);
                  setFinalizeOpen(false);
                  setActionError(null);
                }
              }}
              onFinish={(values) => void submitPreview(values)}
            >
              <div className="form-grid two-columns">
                <Form.Item
                  name="checkout_date"
                  label="結算生效日 / 租約終止日（必填）"
                  rules={[{ required: true, message: '請選擇結算生效日。' }]}
                >
                  <DatePicker format="YYYY-MM-DD" inputReadOnly className="form-date-input" />
                </Form.Item>
                <Form.Item
                  name="actual_move_out_date"
                  label="實際搬出日 / 點交日"
                >
                  <DatePicker format="YYYY-MM-DD" inputReadOnly className="form-date-input" />
                </Form.Item>
                <Form.Item
                  name="reason"
                  label="退租原因（必填）"
                  rules={[{ required: true, message: '請輸入退租原因。' }]}
                >
                  <Input placeholder="例如：合約到期退租" />
                </Form.Item>
                <Form.Item name="final_meter_reading" label="退租電表讀數">
                  <InputNumber min={0} precision={0} className="form-number-input" />
                </Form.Item>
                <Form.Item name="cleaning_fee" label="清潔費">
                  <InputNumber min={0} precision={0} className="form-number-input" />
                </Form.Item>
                <Form.Item name="key_card_loss_fee" label="門禁卡遺失費">
                  <InputNumber min={0} precision={0} className="form-number-input" />
                </Form.Item>
                <Form.Item name="other_fee" label="其他費用">
                  <InputNumber min={0} precision={0} className="form-number-input" />
                </Form.Item>
                <Form.Item name="manual_rent_refund_amount" label="人工未到期租金退款">
                  <InputNumber min={0} precision={0} className="form-number-input" />
                </Form.Item>
              </div>
              <Form.Item name="other_fee_reason" label="其他費用原因">
                <Input />
              </Form.Item>
              <Form.Item
                name="manual_rent_refund_reason"
                label="人工租金退款決策原因"
                extra="結算生效日早於租約結束日，或人工退款金額大於 0 時必填；金額可為 0，但原因需說明退款決策。"
              >
                <Input.TextArea rows={2} />
              </Form.Item>
              <Typography.Paragraph type="secondary">
                退租電表讀數會用於系統試算；若可對應最後一期待抄表帳單，會納入退租試算，若帳單週期不符則會列為待處理項目。
              </Typography.Paragraph>
              <Typography.Paragraph type="secondary">
                若結算生效日早於原租約結束日，請填寫人工未到期租金退款決策；系統會依填寫內容進行結算，不會自動推算退款。
              </Typography.Paragraph>
              <Form.Item name="notes" label="退租備註">
                <Input.TextArea rows={3} />
              </Form.Item>
              <Space wrap>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={submittingPreview}
                  disabled={!canSubmitCheckoutSettlement(selectedLease)}
                >
                  產生退租試算
                </Button>
                <Button
                  danger
                  icon={<WarningOutlined />}
                  disabled={!canForceTerminate}
                  title={canForceTerminate ? undefined : '目前角色不可執行強制退租'}
                  onClick={() => {
                    const updated = new URLSearchParams(searchParams);
                    updated.set('mode', 'force');
                    setSearchParams(updated);
                    setPreview(null);
                    setActionError(null);
                  }}
                >
                  強制退租
                </Button>
                <Typography.Text type="secondary">
                  {canForceTerminate
                    ? '強制退租是獨立危險流程，這裡先保留入口。'
                    : '目前角色不可執行強制退租，系統仍會再次確認權限。'}
                </Typography.Text>
              </Space>
            </Form>
          </Space>
        )}

        {selectedLease && workflowMode === 'force' && (
          <Space direction="vertical" size={16} className="page-stack">
            <Alert
              type="warning"
              showIcon
              message="強制退租是獨立危險流程"
              description="此流程不使用正常退租試算、完成退租或結算書匯出控制；送出後會依強制退租規則建立記錄並處理未結清帳單。"
            />
            <Descriptions bordered size="small" column={{ xs: 1, md: 2, xl: 3 }}>
              <Descriptions.Item label="物業">{getOptionalText(selectedLease.property_label)}</Descriptions.Item>
              <Descriptions.Item label="房間">{getOptionalText(selectedLease.room_label)}</Descriptions.Item>
              <Descriptions.Item label="租客">{getOptionalText(selectedLease.tenant_label)}</Descriptions.Item>
              <Descriptions.Item label="租約狀態">
                <Tag color={getStatusColor(selectedLease.status)}>{getLeaseStatusLabel(selectedLease.status)}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="租期">
                {selectedLease.start_date ?? '未提供'} 至 {selectedLease.end_date ?? '未提供'}
              </Descriptions.Item>
              <Descriptions.Item label="押金">
                {renderAmount(selectedLease.deposit_amount)} / {getDepositStatusLabel(selectedLease.deposit_status)}
              </Descriptions.Item>
            </Descriptions>
            {!canForceTerminate && (
              <Alert
                type="error"
                showIcon
                message="目前角色不能執行強制退租"
                description="此入口僅供檢視權限限制；送出動作已停用，實際送出時仍會再次確認權限。"
              />
            )}
            {!canSubmitForceTermination(selectedLease) && (
              <Alert
                type="warning"
                showIcon
                message="此租約狀態不適合強制退租"
                description="強制退租只從進行中租約發起；已到期、已退租或已強制退租資料請使用審核清單與明細頁檢視。"
              />
            )}
            <Form
              form={forceForm}
              layout="vertical"
              requiredMark={false}
              initialValues={defaultForceTerminationValues}
              onFinish={(values) => prepareForceTermination(values)}
            >
              <div className="form-grid two-columns">
                <Form.Item
                  name="termination_date"
                  label="強制退租日（必填）"
                  rules={[{ required: true, message: '請選擇強制退租日。' }]}
                >
                  <DatePicker format="YYYY-MM-DD" inputReadOnly className="form-date-input" />
                </Form.Item>
                <Form.Item
                  name="actual_move_out_date"
                  label="實際搬出日 / 點交日"
                >
                  <DatePicker format="YYYY-MM-DD" inputReadOnly className="form-date-input" />
                </Form.Item>
                <Form.Item
                  name="deposit_handling"
                  label="押金處理（必填）"
                  rules={[{ required: true, message: '請選擇押金處理方式。' }]}
                >
                  <Select
                    aria-label="押金處理（必填）"
                    options={forceDepositHandlingOptions}
                    className="filter-control"
                  />
                </Form.Item>
              </div>
              <Form.Item
                name="reason"
                label="強制退租原因（必填）"
                rules={[{ required: true, message: '請填寫強制退租原因。' }]}
              >
                <Input.TextArea rows={3} />
              </Form.Item>
              <Space wrap>
                <Button
                  type="primary"
                  danger
                  htmlType="submit"
                  loading={forceSubmitting}
                  disabled={!canForceTerminate || !canSubmitForceTermination(selectedLease) || forceSubmitting}
                >
                  送出強制退租
                </Button>
                <Button
                  onClick={() => {
                    const updated = new URLSearchParams(searchParams);
                    if (embeddedWorkflow) {
                      updated.set('mode', 'checkout');
                    } else {
                      updated.delete('mode');
                    }
                    setSearchParams(updated);
                    setActionError(null);
                  }}
                >
                  返回正常退租
                </Button>
              </Space>
            </Form>
          </Space>
        )}

        {actionError && !mainActionError && (
          <Alert
            type={actionError.type === 'finalize' ? 'warning' : 'error'}
            showIcon
            message={actionError.title}
            description={actionError.description}
            action={
              actionError.retryable && leaseId
                ? <Button size="small" onClick={() => loadLease(leaseId)}>重新載入租約</Button>
                : undefined
            }
          />
        )}

        {workflowMode === 'checkout' && preview && (
          <Card title="退租結算試算結果">
            <Space direction="vertical" size={16} className="page-stack">
              <Descriptions bordered size="small" column={{ xs: 1, md: 2, xl: 3 }}>
                <Descriptions.Item label="房間">{preview.room_label}</Descriptions.Item>
                <Descriptions.Item label="租客">{preview.tenant_label}</Descriptions.Item>
                <Descriptions.Item label="結算生效日 / 租約終止日">{preview.checkout_date}</Descriptions.Item>
                <Descriptions.Item label="實際搬出日 / 點交日">
                  {preview.actual_move_out_date ?? '未提供'}
                </Descriptions.Item>
                <Descriptions.Item label="人工租金退款決策">
                  {renderManualRentRefundDecision(preview)}
                </Descriptions.Item>
                <Descriptions.Item label="退租電表讀數">
                  {renderFinalMeterReadingSummary(preview)}
                </Descriptions.Item>
                <Descriptions.Item label="押金">{formatTwd(preview.deposit_amount)}</Descriptions.Item>
                <Descriptions.Item label="退還總額">{formatTwd(preview.total_refund)}</Descriptions.Item>
                <Descriptions.Item label="扣款總額">{formatTwd(preview.total_charge)}</Descriptions.Item>
                <Descriptions.Item label="結算結果">
                  <Tag color={preview.net_direction === 'payable' ? 'red' : 'green'}>
                    {netDirectionLabels[preview.net_direction]} {formatTwd(preview.net_amount)}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="匯出狀態">
                  {preview.export_available ? '可匯出' : '尚不可匯出'}
                </Descriptions.Item>
                <Descriptions.Item label="完成時間">
                  {preview.finalized_at ? formatDashboardDateTime(preview.finalized_at) : '尚未完成'}
                </Descriptions.Item>
              </Descriptions>

              {preview.blockers.length > 0 && (
                <Alert
                  type="warning"
                  showIcon
                  message="退租前還有待處理事項"
                  description="請先處理下列帳單、抄表或押金狀態，再重新產生退租試算。"
                />
              )}

              {preview.warnings.length > 0 && (
                <Alert
                  type="info"
                  showIcon
                  message="退租提醒"
                  description={preview.warnings.map((item) => item.message).join('；')}
                />
              )}

              {preview.blockers.length > 0 && (
                <Table
                  rowKey={(record) => `${record.code}-${record.source_id ?? record.message}`}
                  size="small"
                  pagination={false}
                  columns={[
                    {
                      title: '待處理類型',
                      dataIndex: 'code',
                      width: 180,
                      render: (value: string) => getBlockerLabel(value),
                    },
                    {
                      title: '說明',
                      dataIndex: 'message',
                      render: (_, record) => getBlockerMessage(record),
                    },
                    {
                      title: '處理入口',
                      key: 'action',
                      width: 160,
                      render: (_, record) => isBillBackedBlocker(record) ? (
                        <Button size="small">
                          <Link to={buildPropertyPath(propertyId, '/billing', {
                            leaseId: preview.lease_id,
                            billId: record.source_id ?? undefined,
                          })}
                          >
                            前往帳務
                          </Link>
                        </Button>
                      ) : getBlockerActionText(record.code),
                    },
                  ]}
                  dataSource={preview.blockers}
                />
              )}

              <Table
                rowKey={(record) => `${record.kind}-${record.label}-${record.amount}`}
                pagination={false}
                columns={[
                  { title: '項目', dataIndex: 'label', width: 220 },
                  {
                    title: '方向',
                    dataIndex: 'direction',
                    width: 110,
                    render: (value: string) => lineDirectionLabels[value] ?? value,
                  },
                  {
                    title: '金額',
                    dataIndex: 'amount',
                    width: 140,
                    render: (value: number) => formatTwd(value),
                  },
                  {
                    title: '說明',
                    dataIndex: 'description',
                    render: (value: string | null | undefined, record) => {
                      const electricityDetail = getElectricitySourceDetail(record);

                      return (
                        <Space direction="vertical" size={0}>
                          <Typography.Text>{value ?? '未提供'}</Typography.Text>
                          {electricityDetail && (
                            <Typography.Text type="secondary">{electricityDetail}</Typography.Text>
                          )}
                        </Space>
                      );
                    },
                  },
                ]}
                dataSource={preview.lines}
              />

              <Space wrap>
                <Button
                  type="primary"
                  danger
                  disabled={!canFinalize}
                  onClick={() => setFinalizeOpen(true)}
                >
                  確認完成退租結算
                </Button>
                <Button
                  icon={<ExportOutlined />}
                  loading={exporting}
                  disabled={!canExport}
                  onClick={() => void openExport()}
                >
                  開啟結算書
                </Button>
                <Typography.Text type="secondary">
                  完成退租時會使用這次系統試算結果；若資料已變更，系統會要求重新試算。
                </Typography.Text>
              </Space>
            </Space>
          </Card>
        )}
      </Drawer>

      <Modal
        title="確認完成退租結算"
        open={finalizeOpen}
        okText="確認完成退租"
        okButtonProps={{ danger: true, loading: finalizing }}
        cancelText="取消"
        onOk={() => void submitFinalize()}
        onCancel={() => setFinalizeOpen(false)}
      >
        <Space direction="vertical" size={12}>
          <Alert
            type="warning"
            showIcon
            message="此動作會完成退租結算"
            description="系統會再次確認租約、帳單與押金狀態，完成後會保存結算結果並結束租約。完成後請以重新讀取的資料為準。"
          />
          {preview && (
            <Descriptions size="small" column={1}>
              <Descriptions.Item label="租客">{preview.tenant_label}</Descriptions.Item>
              <Descriptions.Item label="房間">{preview.room_label}</Descriptions.Item>
              <Descriptions.Item label="結算結果">
                {netDirectionLabels[preview.net_direction]} {formatTwd(preview.net_amount)}
              </Descriptions.Item>
            </Descriptions>
          )}
        </Space>
      </Modal>

      <Modal
        title="確認送出強制退租"
        open={forceConfirmOpen}
        okText="確認強制退租"
        okButtonProps={{ danger: true, loading: forceSubmitting, disabled: forceSubmitting }}
        cancelText="取消"
        onOk={() => void submitForceTermination()}
        onCancel={() => setForceConfirmOpen(false)}
      >
        <Space direction="vertical" size={12}>
          <Alert
            type="error"
            showIcon
            message="此動作會建立強制退租記錄"
            description="這不是正常退租結算流程，不會產生退租試算或結算書；送出後請以強制退租明細頁與重新讀取的租約資料為準。"
          />
          {selectedLease && pendingForceRequest && (
            <Descriptions size="small" column={1}>
              <Descriptions.Item label="租客">{getOptionalText(selectedLease.tenant_label)}</Descriptions.Item>
              <Descriptions.Item label="房間">{getOptionalText(selectedLease.room_label)}</Descriptions.Item>
              <Descriptions.Item label="強制退租日">{pendingForceRequest.termination_date}</Descriptions.Item>
              <Descriptions.Item label="押金處理">{getForceDepositHandlingLabel(pendingForceRequest.deposit_handling)}</Descriptions.Item>
            </Descriptions>
          )}
        </Space>
      </Modal>
    </Space>
  );
}
