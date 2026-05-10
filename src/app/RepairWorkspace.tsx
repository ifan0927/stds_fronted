import {
  CheckOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  assignRepairRequest,
  cancelRepairRequest,
  classifyApiErrorForUi,
  completeRepairRequest,
  createRepairRequest,
  getFormErrorState,
  getRepairRequest,
  listRepairRequests,
  listUsers,
  progressRepairRequest,
  updateRepairRequest,
  type PropertyTenantLeaseRosterRow,
  type RepairRequest,
  type RepairRequestList,
  type RepairRequestStatus,
  type UiErrorState,
  type User,
} from '../api';
import { useAuth } from '../auth';
import { formatDashboardDateTime } from './format';
import { getMutationSuccessFeedback } from './operation';
import { abortRequest } from './requestAbort';
import {
  ForbiddenState,
  LoadingState,
  NotFoundState,
  RetryableErrorState,
} from './routeState';

type RepairWorkspaceProps = {
  propertyId: string | undefined;
  roomId: string | undefined;
  roomRows: PropertyTenantLeaseRosterRow[];
  roomOptionsLoading: boolean;
  onRoomContextRefetch: () => void;
};

type RepairLoadState =
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: RepairRequestList }
  | { status: 'forbidden'; data: null }
  | { status: 'not-found'; data: null }
  | { status: 'error'; data: null };

type RepairDetailState =
  | { status: 'idle'; data: null }
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: RepairRequest }
  | { status: 'forbidden'; data: null }
  | { status: 'not-found'; data: null }
  | { status: 'error'; data: null };

type StaffOptionsState =
  | { status: 'idle'; data: User[] }
  | { status: 'loading'; data: User[] }
  | { status: 'ready'; data: User[] }
  | { status: 'error'; data: User[] };

type RepairFormValues = {
  room_id?: string;
  title?: string;
  description?: string;
};

type AssignFormValues = {
  assigned_to?: string;
};

type CancelFormValues = {
  reason?: string;
};

type FormMode =
  | { type: 'closed'; record: null }
  | { type: 'create'; record: null }
  | { type: 'edit'; record: RepairRequest };

const defaultPage = 1;
const defaultLimit = 20;
const limitOptions = [20, 50, 100] as const;
const statusOptions: Array<{ value: RepairRequestStatus; label: string }> = [
  { value: 'submitted', label: '待派工' },
  { value: 'assigned', label: '已派工' },
  { value: 'in_progress', label: '處理中' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
];

const workflowErrorCopy: Record<string, string> = {
  REPAIR_INVALID_STATUS_FOR_ASSIGN: '此維修單狀態已更新，不能再派工。請重新載入後確認最新狀態。',
  REPAIR_INVALID_STATUS_FOR_PROGRESS: '此維修單狀態已更新，不能開始處理。請重新載入後確認最新狀態。',
  REPAIR_INVALID_STATUS_FOR_COMPLETE: '此維修單狀態已更新，不能標記完成。請重新載入後確認最新狀態。',
  REPAIR_INVALID_STATUS_FOR_CANCEL: '此維修單狀態已更新，不能取消。請重新載入後確認最新狀態。',
};

function getRepairReturnTo(pathname: string, search: string) {
  return `/login?reason=session-expired&returnTo=${encodeURIComponent(`${pathname}${search}`)}`;
}

function getPositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getValidLimit(value: string | null) {
  const parsed = getPositiveInteger(value, defaultLimit);

  return limitOptions.includes(parsed as (typeof limitOptions)[number]) ? parsed : defaultLimit;
}

function getValidStatus(value: string | null): RepairRequestStatus | undefined {
  return statusOptions.some((option) => option.value === value)
    ? value as RepairRequestStatus
    : undefined;
}

function getOptionalText(value: string | null | undefined) {
  return value && value.trim().length > 0 ? value : '未提供';
}

function getRepairStatusLabel(value: string | null | undefined) {
  return statusOptions.find((option) => option.value === value)?.label ?? '未提供';
}

function getRepairStatusColor(value: string | null | undefined) {
  if (value === 'submitted') {
    return 'gold';
  }

  if (value === 'assigned') {
    return 'blue';
  }

  if (value === 'in_progress') {
    return 'processing';
  }

  if (value === 'completed') {
    return 'green';
  }

  if (value === 'cancelled') {
    return 'default';
  }

  return 'default';
}

function getRoomOptionLabel(row: PropertyTenantLeaseRosterRow) {
  const roomLabel = getOptionalText(row.room_label);
  const tenantLabel = row.tenant_label?.trim();

  return tenantLabel ? `${roomLabel} - ${tenantLabel}` : `${roomLabel} - 空房/未出租`;
}

function getUserOptionLabel(user: User) {
  const name = user.name?.trim();
  const email = user.email?.trim();

  return name && email ? `${name} - ${email}` : name || email || '未命名成員';
}

function getWorkflowErrorCopy(error: unknown, fallback: UiErrorState) {
  const code = error instanceof Error && 'errorCode' in error
    ? (error as { errorCode?: string | null }).errorCode
    : null;

  return code ? workflowErrorCopy[code] ?? fallback.description : fallback.description;
}

function buildCreatePayload(
  propertyId: string,
  lockedRoomId: string | undefined,
  values: RepairFormValues,
) {
  return {
    property_id: propertyId,
    room_id: lockedRoomId ?? values.room_id ?? '',
    title: values.title?.trim() ?? '',
    description: values.description?.trim() ?? '',
  };
}

function buildUpdatePayload(values: RepairFormValues) {
  return {
    title: values.title?.trim(),
    description: values.description?.trim(),
  };
}

export default function RepairWorkspace({
  propertyId,
  roomId,
  roomRows,
  roomOptionsLoading,
  onRoomContextRefetch,
}: RepairWorkspaceProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser, getAccessToken } = useAuth();
  const [messageApi, contextHolder] = message.useMessage();
  const [repairForm] = Form.useForm<RepairFormValues>();
  const [assignForm] = Form.useForm<AssignFormValues>();
  const [cancelForm] = Form.useForm<CancelFormValues>();
  const listRequestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const detailRequestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const staffRequestRef = useRef<AbortController | null>(null);
  const listRequestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);
  const [loadState, setLoadState] = useState<RepairLoadState>({ status: 'loading', data: null });
  const [detailState, setDetailState] = useState<RepairDetailState>({ status: 'idle', data: null });
  const [staffOptionsState, setStaffOptionsState] = useState<StaffOptionsState>({ status: 'idle', data: [] });
  const [formMode, setFormMode] = useState<FormMode>({ type: 'closed', record: null });
  const [assignTarget, setAssignTarget] = useState<RepairRequest | null>(null);
  const [cancelTarget, setCancelTarget] = useState<RepairRequest | null>(null);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<UiErrorState | null>(null);
  const [detailRefreshing, setDetailRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const status = getValidStatus(searchParams.get('repair_status'));
  const assignedTo = searchParams.get('assignedTo')?.trim() || undefined;
  const page = getPositiveInteger(searchParams.get('repairPage'), defaultPage);
  const limit = getValidLimit(searchParams.get('repairLimit'));
  const repairRequestId = searchParams.get('repairRequestId')?.trim() || undefined;
  const rows = loadState.status === 'ready' ? loadState.data.data ?? [] : [];
  const pagination = loadState.status === 'ready' ? loadState.data.pagination : undefined;
  const currentPage = pagination?.page ?? page;
  const currentLimit = pagination?.limit ?? limit;
  const total = pagination?.total ?? rows.length;
  const totalPages = pagination?.total_pages ?? 1;
  const detailRecord = detailState.status === 'ready' ? detailState.data : null;
  const canCreate = currentUser?.role !== 'owner';

  const roomOptions = useMemo(() => {
    const options = roomRows
      .filter((row): row is PropertyTenantLeaseRosterRow & { room_id: string } => typeof row.room_id === 'string')
      .map((row) => ({
        value: row.room_id,
        label: getRoomOptionLabel(row),
      }));

    if (roomId && !options.some((option) => option.value === roomId)) {
      options.unshift({ value: roomId, label: '已套用房間篩選' });
    }

    return options;
  }, [roomId, roomRows]);

  const staffOptions = useMemo(() => staffOptionsState.data
    .filter((user): user is User & { id: string } => typeof user.id === 'string')
    .map((user) => ({
      value: user.id,
      label: getUserOptionLabel(user),
    })), [staffOptionsState.data]);

  const setRepairQuery = useCallback((next: {
    status?: RepairRequestStatus | null;
    assignedTo?: string | null;
    page?: number;
    limit?: number;
    repairRequestId?: string | null;
  }) => {
    setSearchParams((previous) => {
      const updated = new URLSearchParams(previous);
      const nextPage = next.page ?? defaultPage;
      const nextLimit = next.limit ?? limit;

      updated.set('tab', 'repair');

      if (next.status === null) {
        updated.delete('repair_status');
      } else if (next.status !== undefined) {
        updated.set('repair_status', next.status);
      }

      if (next.assignedTo === null) {
        updated.delete('assignedTo');
      } else if (next.assignedTo !== undefined) {
        updated.set('assignedTo', next.assignedTo);
      }

      if (next.repairRequestId === null) {
        updated.delete('repairRequestId');
      } else if (next.repairRequestId !== undefined) {
        updated.set('repairRequestId', next.repairRequestId);
      }

      if (nextPage > defaultPage) {
        updated.set('repairPage', String(nextPage));
      } else {
        updated.delete('repairPage');
      }

      if (nextLimit !== defaultLimit) {
        updated.set('repairLimit', String(nextLimit));
      } else {
        updated.delete('repairLimit');
      }

      return updated;
    });
  }, [limit, setSearchParams]);

  const loadRepairs = useCallback(() => {
    if (!propertyId) {
      setLoadState({ status: 'not-found', data: null });
      return;
    }

    abortRequest(listRequestRef.current?.controller);
    const controller = new AbortController();
    const requestId = listRequestIdRef.current + 1;
    listRequestIdRef.current = requestId;
    listRequestRef.current = { id: requestId, controller };
    setLoadState({ status: 'loading', data: null });

    void listRepairRequests(
      getAccessToken,
      {
        property_id: propertyId,
        room_id: roomId,
        status,
        assigned_to: assignedTo,
        page,
        limit,
      },
      { signal: controller.signal },
    )
      .then((response) => {
        if (listRequestRef.current?.id !== requestId) {
          return;
        }

        setLoadState({ status: 'ready', data: response });
      })
      .catch((error: unknown) => {
        if (listRequestRef.current?.id !== requestId) {
          return;
        }

        const errorState = classifyApiErrorForUi(error);

        if (errorState.kind === 'cancelled') {
          return;
        }

        if (errorState.kind === 'unauthorized') {
          navigate(getRepairReturnTo(location.pathname, location.search), { replace: true });
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
  }, [assignedTo, getAccessToken, limit, location.pathname, location.search, navigate, page, propertyId, roomId, status]);

  const loadDetail = useCallback((repairId: string, syncUrl = true, initialRecord?: RepairRequest) => {
    abortRequest(detailRequestRef.current?.controller);
    const controller = new AbortController();
    const requestId = detailRequestIdRef.current + 1;
    detailRequestIdRef.current = requestId;
    detailRequestRef.current = { id: requestId, controller };
    setSelectedDetailId(repairId);
    setActionError(null);
    if (initialRecord) {
      setDetailState({ status: 'ready', data: initialRecord });
      setDetailRefreshing(true);
    } else {
      setDetailState({ status: 'loading', data: null });
      setDetailRefreshing(false);
    }

    if (syncUrl) {
      setRepairQuery({ repairRequestId: repairId, page });
    }

    void getRepairRequest(repairId, getAccessToken, { signal: controller.signal })
      .then((response) => {
        if (detailRequestRef.current?.id !== requestId) {
          return;
        }

        setDetailState({ status: 'ready', data: response });
        setDetailRefreshing(false);
      })
      .catch((error: unknown) => {
        if (detailRequestRef.current?.id !== requestId) {
          return;
        }

        const errorState = classifyApiErrorForUi(error);
        setDetailRefreshing(false);

        if (errorState.kind === 'cancelled') {
          return;
        }

        if (errorState.kind === 'unauthorized') {
          navigate(getRepairReturnTo(location.pathname, location.search), { replace: true });
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
  }, [getAccessToken, location.pathname, location.search, navigate, page, setRepairQuery]);

  const loadStaffOptions = useCallback(() => {
    abortRequest(staffRequestRef.current);
    const controller = new AbortController();
    staffRequestRef.current = controller;
    setStaffOptionsState((previous) => ({ status: 'loading', data: previous.data }));

    void listUsers(getAccessToken, { role: 'staff', page: 1, limit: 100 }, { signal: controller.signal })
      .then((response) => {
        if (staffRequestRef.current !== controller) {
          return;
        }

        setStaffOptionsState({ status: 'ready', data: response.data ?? [] });
      })
      .catch((error: unknown) => {
        if (staffRequestRef.current !== controller) {
          return;
        }

        const errorState = classifyApiErrorForUi(error);

        if (errorState.kind === 'cancelled') {
          return;
        }

        setStaffOptionsState((previous) => ({ status: 'error', data: previous.data }));
      });
  }, [getAccessToken]);

  useEffect(() => {
    loadRepairs();

    return () => abortRequest(listRequestRef.current?.controller);
  }, [loadRepairs]);

  useEffect(() => {
    if (!repairRequestId) {
      if (detailState.status !== 'idle') {
        abortRequest(detailRequestRef.current?.controller);
        setDetailState({ status: 'idle', data: null });
        setSelectedDetailId(null);
        setDetailRefreshing(false);
      }
      return;
    }

    if (selectedDetailId !== repairRequestId) {
      loadDetail(repairRequestId, false);
    }
  }, [detailState.status, loadDetail, repairRequestId, selectedDetailId]);

  useEffect(() => () => {
    abortRequest(listRequestRef.current?.controller);
    abortRequest(detailRequestRef.current?.controller);
    abortRequest(staffRequestRef.current);
  }, []);

  const refreshAfterMutation = (repairId?: string | null, refetchRoomContext = false) => {
    loadRepairs();
    if (repairId) {
      loadDetail(repairId, false);
    }
    if (refetchRoomContext) {
      onRoomContextRefetch();
    }
  };

  const openCreateDrawer = () => {
    setFormMode({ type: 'create', record: null });
    setFormError(null);
    setActionError(null);
    repairForm.setFieldsValue({
      room_id: roomId,
      title: '',
      description: '',
    });
  };

  const openEditDrawer = (record: RepairRequest) => {
    setFormMode({ type: 'edit', record });
    setFormError(null);
    setActionError(null);
    repairForm.setFieldsValue({
      room_id: record.room_id ?? undefined,
      title: record.title ?? '',
      description: record.description ?? '',
    });
  };

  const closeFormDrawer = () => {
    if (submitting) {
      return;
    }

    setFormMode({ type: 'closed', record: null });
    setFormError(null);
    repairForm.resetFields();
  };

  const handleSubmit = async (values: RepairFormValues) => {
    if (!propertyId || submitting) {
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setActionError(null);

    try {
      let response: RepairRequest;

      if (formMode.type === 'edit' && formMode.record.id) {
        response = await updateRepairRequest(
          formMode.record.id,
          buildUpdatePayload(values),
          getAccessToken,
        );
        void messageApi.success(getMutationSuccessFeedback('維修單更新').content);
      } else {
        response = await createRepairRequest(
          buildCreatePayload(propertyId, roomId, values),
          getAccessToken,
        );
        void messageApi.success(getMutationSuccessFeedback('維修單建立').content);
      }

      setFormMode({ type: 'closed', record: null });
      repairForm.resetFields();
      if (response.id) {
        setRepairQuery({ repairRequestId: response.id, page: defaultPage });
      }
      refreshAfterMutation(response.id, true);
    } catch (error: unknown) {
      const errorState = classifyApiErrorForUi(error);

      if (errorState.kind === 'unauthorized') {
        navigate(getRepairReturnTo(location.pathname, location.search), { replace: true });
        return;
      }

      if (errorState.kind === 'validation') {
        const formState = getFormErrorState(error, {
          VALIDATION_REPAIR_TITLE_REQUIRED: 'title',
          VALIDATION_REPAIR_DESCRIPTION_REQUIRED: 'description',
        });
        if (formState.fields.length > 0) {
          repairForm.setFields(formState.fields.map((field) => ({
            name: [field.name as keyof RepairFormValues],
            errors: field.errors,
          })));
        }
        setFormError(formState.message);
        return;
      }

      setFormError(errorState.description);
    } finally {
      setSubmitting(false);
    }
  };

  const openAssignModal = (record: RepairRequest) => {
    setAssignTarget(record);
    setAssignError(null);
    assignForm.setFieldsValue({ assigned_to: record.assigned_to ?? undefined });
    loadStaffOptions();
  };

  const openCancelModal = (record: RepairRequest) => {
    setCancelTarget(record);
    setCancelError(null);
    cancelForm.resetFields();
  };

  const runWorkflowAction = async (
    record: RepairRequest,
    action: 'progress' | 'complete',
  ) => {
    if (!record.id || actionId) {
      return;
    }

    setActionId(record.id);
    setActionError(null);

    try {
      const response = action === 'progress'
        ? await progressRepairRequest(record.id, getAccessToken)
        : await completeRepairRequest(record.id, getAccessToken);
      void messageApi.success(getMutationSuccessFeedback(action === 'progress' ? '維修狀態更新' : '維修完成').content);
      refreshAfterMutation(response.id ?? record.id, true);
    } catch (error: unknown) {
      const errorState = classifyApiErrorForUi(error);

      if (errorState.kind === 'unauthorized') {
        navigate(getRepairReturnTo(location.pathname, location.search), { replace: true });
        return;
      }

      setActionError({
        ...errorState,
        title: '維修狀態無法更新',
        description: getWorkflowErrorCopy(error, errorState),
      });
      if (errorState.kind === 'validation' || errorState.retryable) {
        refreshAfterMutation(record.id, true);
      }
    } finally {
      setActionId(null);
    }
  };

  const handleAssign = async (values: AssignFormValues) => {
    if (!assignTarget?.id || !values.assigned_to || submitting) {
      return;
    }

    setSubmitting(true);
    setAssignError(null);
    setActionError(null);

    try {
      const response = await assignRepairRequest(
        assignTarget.id,
        { assigned_to: values.assigned_to },
        getAccessToken,
      );
      void messageApi.success(getMutationSuccessFeedback('維修派工').content);
      setAssignTarget(null);
      assignForm.resetFields();
      refreshAfterMutation(response.id ?? assignTarget.id, true);
    } catch (error: unknown) {
      const errorState = classifyApiErrorForUi(error);

      if (errorState.kind === 'unauthorized') {
        navigate(getRepairReturnTo(location.pathname, location.search), { replace: true });
        return;
      }

      setAssignError(getWorkflowErrorCopy(error, errorState));
      if (errorState.kind === 'validation' || errorState.retryable) {
        refreshAfterMutation(assignTarget.id, true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (values: CancelFormValues) => {
    if (!cancelTarget?.id || submitting) {
      return;
    }

    setSubmitting(true);
    setCancelError(null);
    setActionError(null);

    try {
      const reason = values.reason?.trim();
      const response = await cancelRepairRequest(
        cancelTarget.id,
        reason ? { reason } : undefined,
        getAccessToken,
      );
      void messageApi.success(getMutationSuccessFeedback('維修取消').content);
      setCancelTarget(null);
      cancelForm.resetFields();
      refreshAfterMutation(response.id ?? cancelTarget.id, true);
    } catch (error: unknown) {
      const errorState = classifyApiErrorForUi(error);

      if (errorState.kind === 'unauthorized') {
        navigate(getRepairReturnTo(location.pathname, location.search), { replace: true });
        return;
      }

      setCancelError(getWorkflowErrorCopy(error, errorState));
      if (errorState.kind === 'validation' || errorState.retryable) {
        refreshAfterMutation(cancelTarget.id, true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const closeDetailDrawer = () => {
    abortRequest(detailRequestRef.current?.controller);
    setDetailState({ status: 'idle', data: null });
    setSelectedDetailId(null);
    setActionError(null);
    setDetailRefreshing(false);
    setRepairQuery({ repairRequestId: null, page });
  };

  const renderActionButtons = (record: RepairRequest) => {
    const disabled = !record.id || actionId === record.id;

    if (record.status === 'submitted') {
      return (
        <>
          <Button size="small" type="primary" icon={<UserSwitchOutlined />} onClick={() => openAssignModal(record)}>
            派工
          </Button>
          <Button size="small" danger icon={<StopOutlined />} onClick={() => openCancelModal(record)}>
            取消
          </Button>
        </>
      );
    }

    if (record.status === 'assigned') {
      return (
        <>
          <Button
            size="small"
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={actionId === record.id}
            disabled={disabled}
            onClick={() => void runWorkflowAction(record, 'progress')}
          >
            開始處理
          </Button>
          <Button size="small" danger icon={<StopOutlined />} onClick={() => openCancelModal(record)}>
            取消
          </Button>
        </>
      );
    }

    if (record.status === 'in_progress') {
      return (
        <>
          <Button
            size="small"
            type="primary"
            icon={<CheckOutlined />}
            loading={actionId === record.id}
            disabled={disabled}
            onClick={() => void runWorkflowAction(record, 'complete')}
          >
            完成
          </Button>
          <Button size="small" danger icon={<StopOutlined />} onClick={() => openCancelModal(record)}>
            取消
          </Button>
        </>
      );
    }

    return null;
  };

  const columns: TableColumnsType<RepairRequest> = [
    {
      title: '狀態',
      dataIndex: 'status',
      width: 120,
      render: (value: RepairRequest['status']) => (
        <Tag color={getRepairStatusColor(value)}>{getRepairStatusLabel(value)}</Tag>
      ),
    },
    {
      title: '房間',
      dataIndex: 'room_label',
      width: 150,
      render: (value: RepairRequest['room_label'], record) => (
        <div className="table-cell-stack">
          <Typography.Text strong>{getOptionalText(value)}</Typography.Text>
          <Typography.Text type="secondary">{getOptionalText(record.property_label)}</Typography.Text>
        </div>
      ),
    },
    {
      title: '維修事項',
      dataIndex: 'title',
      width: 300,
      render: (value: RepairRequest['title'], record) => (
        <div className="table-cell-stack">
          <Typography.Text strong>{getOptionalText(value)}</Typography.Text>
          <Typography.Text type="secondary" ellipsis>
            {getOptionalText(record.description)}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: '指派',
      dataIndex: 'assigned_to_label',
      width: 160,
      render: (value: RepairRequest['assigned_to_label']) => getOptionalText(value ?? '尚未指派'),
    },
    {
      title: '更新時間',
      dataIndex: 'updated_at',
      width: 170,
      render: (value: RepairRequest['updated_at']) => (
        <Typography.Text>{value ? formatDashboardDateTime(value) : '未提供'}</Typography.Text>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 330,
      fixed: 'right',
      render: (_, record) => (
        <Space size={8} wrap className="row-action-stack">
          <Button size="small" onClick={() => record.id && loadDetail(record.id, true, record)}>
            詳情
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditDrawer(record)}>
            編輯
          </Button>
          {renderActionButtons(record)}
        </Space>
      ),
    },
  ];

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
    return <RetryableErrorState onRetry={() => loadRepairs()} />;
  }

  return (
    <Space direction="vertical" size={16} className="page-stack">
      {contextHolder}
      <div className="filter-toolbar">
        <Space size={12} wrap>
          <Select
            allowClear
            aria-label="維修狀態篩選"
            className="repair-status-filter"
            options={statusOptions}
            placeholder="全部狀態"
            value={status}
            onChange={(value?: RepairRequestStatus) => setRepairQuery({
              status: value ?? null,
              page: defaultPage,
            })}
          />
          <Select
            allowClear
            aria-label="指派人員篩選"
            className="repair-assignee-filter"
            loading={staffOptionsState.status === 'loading'}
            options={staffOptions}
            placeholder="全部指派"
            popupMatchSelectWidth={false}
            value={assignedTo}
            onOpenChange={(open) => {
              if (open && staffOptionsState.status === 'idle') {
                loadStaffOptions();
              }
            }}
            onChange={(value?: string) => setRepairQuery({
              assignedTo: value ?? null,
              page: defaultPage,
            })}
          />
          <Button
            onClick={() => setRepairQuery({
              status: null,
              assignedTo: null,
              repairRequestId: null,
              page: defaultPage,
              limit: defaultLimit,
            })}
          >
            清除篩選
          </Button>
        </Space>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={() => loadRepairs()}>
            重新整理
          </Button>
          <Button type="primary" icon={<PlusOutlined />} disabled={!canCreate} onClick={openCreateDrawer}>
            新增維修
          </Button>
        </Space>
      </div>

      {roomId && (
        <Alert
          type="info"
          showIcon
          message="已套用房間篩選"
          description={`目前顯示 ${roomOptions.find((option) => option.value === roomId)?.label ?? '所選房間'} 的維修單；列表仍以後端回傳的房間標籤為準。`}
        />
      )}
      {staffOptionsState.status === 'error' && (
        <Alert
          type="warning"
          showIcon
          message="成員選單暫時無法載入"
          description="仍可查看維修列表；派工或指派篩選請稍後再試。"
        />
      )}
      {actionError && (
        <Alert
          type={actionError.kind === 'validation' || actionError.kind === 'conflict' ? 'warning' : 'error'}
          showIcon
          message={actionError.title}
          description={actionError.description}
          action={actionError.retryable ? <Button size="small" onClick={() => loadRepairs()}>重新載入</Button> : undefined}
        />
      )}

      <Table
        rowKey={(record) => record.id ?? `${record.room_id}-${record.title}-${record.submitted_at}`}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 1130 }}
        locale={{
          emptyText: (
            <Empty
              description={roomId ? '此房間目前沒有維修單。' : '目前沒有維修單。'}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ),
        }}
        pagination={{
          current: currentPage,
          pageSize: currentLimit,
          total,
          showSizeChanger: true,
          pageSizeOptions: limitOptions.map(String),
          showTotal: (count) => `共 ${count} 筆，第 ${currentPage} / ${totalPages} 頁`,
          onChange: (nextPage, nextLimit) => setRepairQuery({
            page: nextPage,
            limit: nextLimit,
          }),
        }}
      />

      <Drawer
        title="維修詳情"
        open={detailState.status !== 'idle'}
        onClose={closeDetailDrawer}
        width={760}
      >
        {detailState.status === 'loading' && (
          <div className="drawer-inline-loading">
            <Spin />
            <Typography.Text type="secondary">載入維修詳情中</Typography.Text>
          </div>
        )}
        {detailState.status === 'forbidden' && <ForbiddenState />}
        {detailState.status === 'not-found' && <NotFoundState />}
        {detailState.status === 'error' && (
          <RetryableErrorState onRetry={() => selectedDetailId && loadDetail(selectedDetailId, false)} />
        )}
        {detailRecord && (
          <Space direction="vertical" size={16} className="page-stack">
            {detailRefreshing && (
              <Typography.Text type="secondary">正在同步最新維修資料...</Typography.Text>
            )}
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="狀態">
                <Tag color={getRepairStatusColor(detailRecord.status)}>
                  {getRepairStatusLabel(detailRecord.status)}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="物業">{getOptionalText(detailRecord.property_label)}</Descriptions.Item>
              <Descriptions.Item label="房間">{getOptionalText(detailRecord.room_label)}</Descriptions.Item>
              <Descriptions.Item label="標題">{getOptionalText(detailRecord.title)}</Descriptions.Item>
              <Descriptions.Item label="描述">{getOptionalText(detailRecord.description)}</Descriptions.Item>
              <Descriptions.Item label="建立人">{getOptionalText(detailRecord.submitted_by_label)}</Descriptions.Item>
              <Descriptions.Item label="指派人員">{getOptionalText(detailRecord.assigned_to_label)}</Descriptions.Item>
              <Descriptions.Item label="建立時間">
                {detailRecord.submitted_at ? formatDashboardDateTime(detailRecord.submitted_at) : '未提供'}
              </Descriptions.Item>
              <Descriptions.Item label="派工時間">
                {detailRecord.assigned_at ? formatDashboardDateTime(detailRecord.assigned_at) : '未提供'}
              </Descriptions.Item>
              <Descriptions.Item label="完成時間">
                {detailRecord.completed_at ? formatDashboardDateTime(detailRecord.completed_at) : '未提供'}
              </Descriptions.Item>
              <Descriptions.Item label="更新時間">
                {detailRecord.updated_at ? formatDashboardDateTime(detailRecord.updated_at) : '未提供'}
              </Descriptions.Item>
            </Descriptions>
            <Alert
              type="info"
              showIcon
              message="附件功能尚未開放"
              description="此階段不提供維修附件上傳、登記或刪除。"
            />
            <Space wrap>
              <Button icon={<EditOutlined />} onClick={() => openEditDrawer(detailRecord)}>
                編輯
              </Button>
              {renderActionButtons(detailRecord)}
            </Space>
          </Space>
        )}
      </Drawer>

      <Drawer
        title={formMode.type === 'edit' ? '編輯維修單' : '新增維修單'}
        open={formMode.type !== 'closed'}
        onClose={closeFormDrawer}
        width={720}
        footer={(
          <Space className="drawer-footer-actions">
            <Button onClick={closeFormDrawer} disabled={submitting}>取消</Button>
            <Button type="primary" loading={submitting} onClick={() => void repairForm.submit()}>
              儲存並重新載入
            </Button>
          </Space>
        )}
      >
        <Space direction="vertical" size={16} className="page-stack">
          {formError && (
            <Alert type="error" showIcon message="無法儲存維修單" description={formError} />
          )}
          <Form
            form={repairForm}
            layout="vertical"
            requiredMark={false}
            onFinish={(values) => void handleSubmit(values)}
          >
            <Form.Item label="物業">
              <Input value="目前物業" disabled />
            </Form.Item>
            <Form.Item
              label="房間（必填）"
              name="room_id"
              rules={[{ required: !roomId, message: '請選擇維修房間。' }]}
            >
              <Select
                disabled={Boolean(roomId) || formMode.type === 'edit'}
                loading={roomOptionsLoading}
                options={roomOptions}
                placeholder="選擇維修房間"
                popupMatchSelectWidth={false}
              />
            </Form.Item>
            <Form.Item
              label="維修標題（必填）"
              name="title"
              rules={[{ required: true, whitespace: true, message: '請輸入維修標題。' }]}
            >
              <Input placeholder="例如：浴室漏水" />
            </Form.Item>
            <Form.Item
              label="問題描述（必填）"
              name="description"
              rules={[{ required: true, whitespace: true, message: '請輸入問題描述。' }]}
            >
              <Input.TextArea rows={5} placeholder="描述目前看到的問題與需要處理的狀況。" />
            </Form.Item>
          </Form>
        </Space>
      </Drawer>

      <Modal
        title="指派維修"
        open={Boolean(assignTarget)}
        onCancel={() => {
          if (!submitting) {
            setAssignTarget(null);
            setAssignError(null);
          }
        }}
        okText="指派"
        okButtonProps={{ loading: submitting }}
        cancelText="取消"
        onOk={() => void assignForm.submit()}
      >
        <Space direction="vertical" size={16} className="page-stack">
          {assignError && (
            <Alert type="error" showIcon message="無法指派維修" description={assignError} />
          )}
          <Form
            form={assignForm}
            layout="vertical"
            requiredMark={false}
            onFinish={(values) => void handleAssign(values)}
          >
            <Form.Item
              label="工作室成員（必填）"
              name="assigned_to"
              rules={[{ required: true, message: '請選擇指派人員。' }]}
            >
              <Select
                loading={staffOptionsState.status === 'loading'}
                options={staffOptions}
                placeholder="選擇工作室成員"
                popupMatchSelectWidth={false}
              />
            </Form.Item>
          </Form>
        </Space>
      </Modal>

      <Modal
        title="取消維修"
        open={Boolean(cancelTarget)}
        onCancel={() => {
          if (!submitting) {
            setCancelTarget(null);
            setCancelError(null);
          }
        }}
        okText="取消維修"
        okButtonProps={{ danger: true, loading: submitting }}
        cancelText="返回"
        onOk={() => void cancelForm.submit()}
      >
        <Space direction="vertical" size={16} className="page-stack">
          <Alert
            type="warning"
            showIcon
            message="確認取消此維修？"
            description="取消後會重新讀取維修與房間狀態；房間狀態由系統工作流程判斷。"
          />
          {cancelError && (
            <Alert type="error" showIcon message="無法取消維修" description={cancelError} />
          )}
          <Form form={cancelForm} layout="vertical" onFinish={(values) => void handleCancel(values)}>
            <Form.Item label="取消原因" name="reason">
              <Input.TextArea rows={3} placeholder="可留空" />
            </Form.Item>
          </Form>
        </Space>
      </Modal>
    </Space>
  );
}
