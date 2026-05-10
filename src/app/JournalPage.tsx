import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Avatar,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Segmented,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ApiError,
  classifyApiErrorForUi,
  createJournalLog,
  deleteJournalLog,
  getJournalLog,
  getFormErrorState,
  listJournalExpenseAccountingTitles,
  listJournalLogs,
  listPropertyTenantLeaseRoster,
  updateJournalLog,
  type AccountingTitleOption,
  type CreateJournalLogRequest,
  type JournalLog,
  type JournalLogList,
  type PropertyTenantLeaseRosterRow,
  type UpdateJournalLogRequest,
  type UiErrorState,
} from '../api';
import { useAuth } from '../auth';
import { formatDashboardDateTime, formatTwd } from './format';
import RepairWorkspace from './RepairWorkspace';
import { abortRequest } from './requestAbort';
import {
  ForbiddenState,
  LoadingState,
  NotFoundState,
  RetryableErrorState,
} from './routeState';

const { RangePicker } = DatePicker;

type JournalLoadState =
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: JournalLogList }
  | { status: 'forbidden'; data: null }
  | { status: 'not-found'; data: null }
  | { status: 'error'; data: null };

type DetailState =
  | { status: 'idle'; data: null }
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: JournalLog }
  | { status: 'forbidden'; data: null }
  | { status: 'not-found'; data: null }
  | { status: 'error'; data: null };

type TitleOptionsState =
  | { status: 'idle'; data: AccountingTitleOption[] }
  | { status: 'loading'; data: AccountingTitleOption[] }
  | { status: 'ready'; data: AccountingTitleOption[] }
  | { status: 'error'; data: AccountingTitleOption[] };

type RoomOptionsState =
  | { status: 'idle'; data: PropertyTenantLeaseRosterRow[] }
  | { status: 'loading'; data: PropertyTenantLeaseRosterRow[] }
  | { status: 'ready'; data: PropertyTenantLeaseRosterRow[] }
  | { status: 'error'; data: PropertyTenantLeaseRosterRow[] };

type JournalFormValues = {
  room_id?: string;
  content?: string;
  expense_amount?: number | null;
  expense_description?: string;
  expense_accounting_title_id?: string;
};

type FormMode =
  | { type: 'closed'; record: null }
  | { type: 'create'; record: null }
  | { type: 'edit'; record: JournalLog };

const defaultPage = 1;
const defaultLimit = 20;
const limitOptions = [20, 50, 100] as const;
const dateFormat = 'YYYY-MM-DD';
const finalizedExpenseCode = 'JOURNAL_EXPENSE_SNAPSHOT_FINALIZED';

function getJournalReturnTo(pathname: string, search: string) {
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

function getValidDate(value: string | null) {
  if (!value) {
    return undefined;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value) && dayjs(value, dateFormat, true).isValid() ? value : undefined;
}

function getOptionalText(value: string | null | undefined) {
  return value && value.trim().length > 0 ? value : '未提供';
}

function getAvatarText(value: string | null | undefined) {
  const label = value?.trim();

  return label ? label.slice(0, 1) : '日';
}

function getRoomOptionLabel(row: PropertyTenantLeaseRosterRow) {
  const roomLabel = getOptionalText(row.room_label);
  const tenantLabel = row.tenant_label?.trim();

  return tenantLabel ? `${roomLabel} - ${tenantLabel}` : `${roomLabel} - 空房/未出租`;
}

function getExpenseTitleText(record: JournalLog) {
  if (!record.expense_accounting_title_code && !record.expense_accounting_title_name) {
    return '未提供';
  }

  return [record.expense_accounting_title_code, record.expense_accounting_title_name]
    .filter(Boolean)
    .join(' ');
}

function getExpenseAmountText(value: number | null | undefined) {
  return value === null || value === undefined ? '無費用' : formatTwd(value);
}

function getExpenseTag(record: JournalLog) {
  return record.expense_amount === null || record.expense_amount === undefined
    ? <Tag>一般日誌</Tag>
    : <Tag color="gold">含費用</Tag>;
}

function getCreatedTime(record: JournalLog) {
  const time = record.created_at ? new Date(record.created_at).getTime() : 0;

  return Number.isNaN(time) ? 0 : time;
}

function sortJournalsNewestFirst(records: JournalLog[]) {
  return [...records].sort((first, second) => getCreatedTime(second) - getCreatedTime(first));
}

function getConflictCopy(error: unknown) {
  if (error instanceof ApiError && error.errorCode === finalizedExpenseCode) {
    return '此日誌費用所屬月份已月結，不能改變會計影響。請重新載入確認最新狀態。';
  }

  const state = classifyApiErrorForUi(error);

  return state.kind === 'conflict' ? state.description : state.title;
}

function toDateRangeValue(dateFrom: string | undefined, dateTo: string | undefined): [Dayjs, Dayjs] | null {
  if (!dateFrom || !dateTo) {
    return null;
  }

  return [dayjs(dateFrom, dateFormat), dayjs(dateTo, dateFormat)];
}

function buildJournalPayload(
  propertyId: string,
  values: JournalFormValues,
): CreateJournalLogRequest {
  const amount = values.expense_amount ?? null;
  const hasExpense = amount !== null && amount !== undefined;

  return {
    property_id: propertyId,
    room_id: values.room_id?.trim() || null,
    content: values.content?.trim() ?? '',
    expense_amount: hasExpense ? amount : null,
    expense_description: hasExpense ? values.expense_description?.trim() || null : null,
    expense_accounting_title_id: hasExpense ? values.expense_accounting_title_id ?? null : null,
  };
}

function buildJournalUpdatePayload(values: JournalFormValues): UpdateJournalLogRequest {
  const amount = values.expense_amount;
  const hasExpense = amount !== null && amount !== undefined;

  return {
    content: values.content?.trim(),
    expense_amount: hasExpense ? amount : undefined,
    expense_description: hasExpense ? values.expense_description?.trim() || undefined : undefined,
    expense_accounting_title_id: hasExpense ? values.expense_accounting_title_id ?? null : null,
  };
}

export default function JournalPage() {
  const { propertyId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { getAccessToken, currentUser } = useAuth();
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<JournalFormValues>();
  const listRequestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const detailRequestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const titleRequestRef = useRef<AbortController | null>(null);
  const roomOptionsRequestRef = useRef<AbortController | null>(null);
  const listRequestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);
  const [loadState, setLoadState] = useState<JournalLoadState>({ status: 'loading', data: null });
  const [detailState, setDetailState] = useState<DetailState>({ status: 'idle', data: null });
  const [titleOptionsState, setTitleOptionsState] = useState<TitleOptionsState>({ status: 'idle', data: [] });
  const [roomOptionsState, setRoomOptionsState] = useState<RoomOptionsState>({ status: 'idle', data: [] });
  const [formMode, setFormMode] = useState<FormMode>({ type: 'closed', record: null });
  const [formError, setFormError] = useState<string | null>(null);
  const [pageActionError, setPageActionError] = useState<UiErrorState | null>(null);
  const [detailError, setDetailError] = useState<UiErrorState | null>(null);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const roomId = searchParams.get('roomId')?.trim() || undefined;
  const dateFrom = getValidDate(searchParams.get('date_from'));
  const dateTo = getValidDate(searchParams.get('date_to'));
  const page = getPositiveInteger(searchParams.get('page'), defaultPage);
  const limit = getValidLimit(searchParams.get('limit'));
  const rows = sortJournalsNewestFirst(loadState.status === 'ready' ? loadState.data.data ?? [] : []);
  const pagination = loadState.status === 'ready' ? loadState.data.pagination : undefined;
  const currentPage = pagination?.page ?? page;
  const currentLimit = pagination?.limit ?? limit;
  const total = pagination?.total ?? rows.length;
  const totalPages = pagination?.total_pages ?? 1;
  const repairRequestId = searchParams.get('repairRequestId')?.trim() || undefined;
  const activeWorkspace = repairRequestId || searchParams.get('tab') === 'repair' ? 'repair' : 'journal';
  const canDelete = currentUser?.role !== 'staff';

  const setWorkspaceTab = useCallback((next: 'journal' | 'repair') => {
    setSearchParams((previous) => {
      const updated = new URLSearchParams(previous);

      if (next === 'repair') {
        updated.set('tab', 'repair');
      } else {
        updated.delete('tab');
        updated.delete('repairRequestId');
      }

      return updated;
    });
  }, [setSearchParams]);

  const setJournalQuery = useCallback((next: {
    roomId?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    page?: number;
    limit?: number;
  }) => {
    setSearchParams((previous) => {
      const updated = new URLSearchParams(previous);
      const nextPage = next.page ?? defaultPage;
      const nextLimit = next.limit ?? limit;

      if (next.roomId === null) {
        updated.delete('roomId');
      } else if (next.roomId !== undefined) {
        updated.set('roomId', next.roomId);
      }

      if (next.dateFrom === null) {
        updated.delete('date_from');
      } else if (next.dateFrom !== undefined) {
        updated.set('date_from', next.dateFrom);
      }

      if (next.dateTo === null) {
        updated.delete('date_to');
      } else if (next.dateTo !== undefined) {
        updated.set('date_to', next.dateTo);
      }

      if (nextPage > defaultPage) {
        updated.set('page', String(nextPage));
      } else {
        updated.delete('page');
      }

      if (nextLimit !== defaultLimit) {
        updated.set('limit', String(nextLimit));
      } else {
        updated.delete('limit');
      }

      return updated;
    });
  }, [limit, setSearchParams]);

  const loadJournals = useCallback(() => {
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

    void listJournalLogs(
      getAccessToken,
      {
        property_id: propertyId,
        room_id: roomId,
        date_from: dateFrom,
        date_to: dateTo,
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
          navigate(getJournalReturnTo(location.pathname, location.search), { replace: true });
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
  }, [dateFrom, dateTo, getAccessToken, limit, location.pathname, location.search, navigate, page, propertyId, roomId]);

  const loadTitleOptions = useCallback(() => {
    abortRequest(titleRequestRef.current);
    const controller = new AbortController();
    titleRequestRef.current = controller;
    setTitleOptionsState((previous) => ({ status: 'loading', data: previous.data }));

    void listJournalExpenseAccountingTitles(getAccessToken, { signal: controller.signal })
      .then((response) => {
        if (titleRequestRef.current !== controller) {
          return;
        }

        setTitleOptionsState({ status: 'ready', data: response.data ?? [] });
      })
      .catch((error: unknown) => {
        if (titleRequestRef.current !== controller) {
          return;
        }

        const errorState = classifyApiErrorForUi(error);

        if (errorState.kind === 'cancelled') {
          return;
        }

        setTitleOptionsState((previous) => ({ status: 'error', data: previous.data }));
      });
  }, [getAccessToken]);

  const loadRoomOptions = useCallback(() => {
    if (!propertyId) {
      setRoomOptionsState({ status: 'idle', data: [] });
      return;
    }

    abortRequest(roomOptionsRequestRef.current);
    const controller = new AbortController();
    roomOptionsRequestRef.current = controller;
    setRoomOptionsState((previous) => ({ status: 'loading', data: previous.data }));

    void listPropertyTenantLeaseRoster(
      propertyId,
      getAccessToken,
      { include_vacant: true, page: 1, limit: 100 },
      { signal: controller.signal },
    )
      .then((response) => {
        if (roomOptionsRequestRef.current !== controller) {
          return;
        }

        setRoomOptionsState({ status: 'ready', data: response.data ?? [] });
      })
      .catch((error: unknown) => {
        if (roomOptionsRequestRef.current !== controller) {
          return;
        }

        const errorState = classifyApiErrorForUi(error);

        if (errorState.kind === 'cancelled') {
          return;
        }

        setRoomOptionsState((previous) => ({ status: 'error', data: previous.data }));
      });
  }, [getAccessToken, propertyId]);

  useEffect(() => {
    loadJournals();

    return () => abortRequest(listRequestRef.current?.controller);
  }, [loadJournals]);

  useEffect(() => {
    loadRoomOptions();

    return () => abortRequest(roomOptionsRequestRef.current);
  }, [loadRoomOptions]);

  useEffect(() => () => {
    abortRequest(detailRequestRef.current?.controller);
    abortRequest(titleRequestRef.current);
    abortRequest(roomOptionsRequestRef.current);
  }, []);

  const loadDetail = useCallback((journalLogId: string) => {
    abortRequest(detailRequestRef.current?.controller);
    const controller = new AbortController();
    const requestId = detailRequestIdRef.current + 1;
    detailRequestIdRef.current = requestId;
    detailRequestRef.current = { id: requestId, controller };
    setSelectedDetailId(journalLogId);
    setDetailError(null);
    setDetailState({ status: 'loading', data: null });

    void getJournalLog(journalLogId, getAccessToken, { signal: controller.signal })
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
          navigate(getJournalReturnTo(location.pathname, location.search), { replace: true });
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
  }, [getAccessToken, location.pathname, location.search, navigate]);

  const openCreateDrawer = () => {
    setFormMode({ type: 'create', record: null });
    setFormError(null);
    setPageActionError(null);
    form.setFieldsValue({
      room_id: roomId,
      content: '',
      expense_amount: null,
      expense_description: '',
      expense_accounting_title_id: undefined,
    });
    loadTitleOptions();
  };

  const openEditDrawer = (record: JournalLog) => {
    setFormMode({ type: 'edit', record });
    setFormError(null);
    setPageActionError(null);
    form.setFieldsValue({
      room_id: record.room_id ?? undefined,
      content: record.content ?? '',
      expense_amount: record.expense_amount ?? null,
      expense_description: record.expense_description ?? '',
      expense_accounting_title_id: record.expense_accounting_title_id ?? undefined,
    });
    loadTitleOptions();
  };

  const closeFormDrawer = () => {
    if (submitting) {
      return;
    }

    setFormMode({ type: 'closed', record: null });
    setFormError(null);
    form.resetFields();
  };

  const handleSubmit = async (values: JournalFormValues) => {
    if (!propertyId || submitting) {
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setPageActionError(null);

    try {
      if (formMode.type === 'edit' && formMode.record.id) {
        await updateJournalLog(
          formMode.record.id,
          buildJournalUpdatePayload(values),
          getAccessToken,
        );
        void messageApi.success('日誌已更新。');
      } else {
        await createJournalLog(
          buildJournalPayload(propertyId, values),
          getAccessToken,
        );
        void messageApi.success('日誌已建立。');
      }

      setFormMode({ type: 'closed', record: null });
      setFormError(null);
      form.resetFields();
      loadJournals();
      if (detailState.status === 'ready' && detailState.data.id) {
        loadDetail(detailState.data.id);
      }
    } catch (error: unknown) {
      const errorState = classifyApiErrorForUi(error);

      if (errorState.kind === 'unauthorized') {
        navigate(getJournalReturnTo(location.pathname, location.search), { replace: true });
        return;
      }

      if (errorState.kind === 'validation') {
        const formState = getFormErrorState(error, {
          VALIDATION_JOURNAL_CONTENT_REQUIRED: 'content',
        });
        if (formState.fields.length > 0) {
          form.setFields(formState.fields.map((field) => ({
            name: [field.name as keyof JournalFormValues],
            errors: field.errors,
          })));
        }
        setFormError(formState.message);
        return;
      }

      if (errorState.kind === 'conflict') {
        setFormError(getConflictCopy(error));
        return;
      }

      setFormError(errorState.description);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (record: JournalLog) => {
    if (!record.id || deletingId) {
      return;
    }

    Modal.confirm({
      title: '刪除日誌',
      content: record.expense_amount === null || record.expense_amount === undefined
        ? '刪除後此日誌不會再出現在列表。'
        : '此日誌包含費用資料，相關帳務影響會由系統處理。刪除後此日誌不會再出現在列表。',
      okText: '刪除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        if (!record.id) {
          return;
        }

        setDeletingId(record.id);
        setDetailError(null);
        setPageActionError(null);

        try {
          await deleteJournalLog(record.id, getAccessToken);
          void messageApi.success('日誌已刪除。');
          setPageActionError(null);
          setDetailState({ status: 'idle', data: null });
          setSelectedDetailId(null);
          loadJournals();
        } catch (error: unknown) {
          const errorState = classifyApiErrorForUi(error);

          if (errorState.kind === 'unauthorized') {
            navigate(getJournalReturnTo(location.pathname, location.search), { replace: true });
            return;
          }

          if (errorState.kind === 'conflict') {
            const nextError = {
              kind: 'conflict',
              title: '無法刪除日誌',
              description: getConflictCopy(error),
              retryable: true,
            } satisfies UiErrorState;

            if (detailState.status !== 'idle') {
              setDetailError(nextError);
            } else {
              setPageActionError(nextError);
            }
            return;
          }

          if (detailState.status !== 'idle') {
            setDetailError(errorState);
          } else {
            setPageActionError(errorState);
          }
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

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
    return <RetryableErrorState onRetry={() => loadJournals()} />;
  }

  const titleOptions = titleOptionsState.data
    .filter((option) => option.id)
    .map((option) => ({
      value: option.id as string,
      label: [option.code, option.name].filter(Boolean).join(' ') || '未命名科目',
    }));
  const roomOptionMap = new Map<string, string>();
  roomOptionsState.data.forEach((row) => {
    if (row.room_id) {
      roomOptionMap.set(row.room_id, getRoomOptionLabel(row));
    }
  });
  if (roomId && !roomOptionMap.has(roomId)) {
    roomOptionMap.set(roomId, '已套用房間篩選');
  }
  if (formMode.type === 'edit' && formMode.record.room_id && !roomOptionMap.has(formMode.record.room_id)) {
    roomOptionMap.set(
      formMode.record.room_id,
      getOptionalText(formMode.record.room_label ?? '已選取的房間'),
    );
  }
  const roomOptions = Array.from(roomOptionMap.entries()).map(([value, label]) => ({ value, label }));
  const dateRangeValue = toDateRangeValue(dateFrom, dateTo);
  const formTitle = formMode.type === 'edit' ? '編輯日誌' : '新增日誌';
  const detailRecord = detailState.status === 'ready' ? detailState.data : null;
  const editingExistingExpense = formMode.type === 'edit'
    && formMode.record.expense_amount !== null
    && formMode.record.expense_amount !== undefined;

  return (
    <Space direction="vertical" size={16} className="page-stack">
      {contextHolder}
      <div className="page-header">
        <div>
          <Space size={8} wrap>
            <Tag color="blue">日常作業</Tag>
            <Tag>Journal</Tag>
          </Space>
          <Typography.Title level={1}>日誌與維修</Typography.Title>
          <Typography.Paragraph type="secondary">
            查看與維護目前物業的營運日誌。維修生命週期由維修工作區承接。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          {activeWorkspace === 'journal' && (
            <>
              <Button icon={<ReloadOutlined />} onClick={() => loadJournals()}>
                重新整理
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
                新增日誌
              </Button>
            </>
          )}
        </Space>
      </div>

      <Segmented
        aria-label="日誌維修切換"
        value={activeWorkspace}
        options={[
          { value: 'journal', label: '營運日誌' },
          { value: 'repair', label: '維修工作區', icon: <ToolOutlined /> },
        ]}
        onChange={(value) => setWorkspaceTab(value as 'journal' | 'repair')}
      />

      {activeWorkspace === 'journal' && (
      <Card>
        <Space direction="vertical" size={16} className="page-stack">
          {pageActionError && (
            <Alert
              type={pageActionError.kind === 'conflict' ? 'warning' : 'error'}
              showIcon
              message={pageActionError.title}
              description={pageActionError.description}
              action={pageActionError.retryable
                ? <Button size="small" onClick={() => loadJournals()}>重新載入</Button>
                : undefined}
            />
          )}
          <Space size={12} wrap>
            <Select
              allowClear
              aria-label="房間篩選"
              className="journal-room-filter"
              loading={roomOptionsState.status === 'loading'}
              options={roomOptions}
              placeholder="全部房間"
              popupMatchSelectWidth={false}
              classNames={{ popup: { root: 'journal-room-dropdown' } }}
              value={roomId}
              onChange={(value?: string) => setJournalQuery({
                roomId: value ?? null,
                page: defaultPage,
              })}
            />
            <RangePicker
              aria-label="日誌日期區間"
              format={dateFormat}
              inputReadOnly
              value={dateRangeValue}
              onChange={(dates) => {
                setJournalQuery({
                  dateFrom: dates?.[0]?.format(dateFormat) ?? null,
                  dateTo: dates?.[1]?.format(dateFormat) ?? null,
                  page: defaultPage,
                });
              }}
            />
            <Button
              onClick={() => setJournalQuery({
                roomId: null,
                dateFrom: null,
                dateTo: null,
                page: defaultPage,
                limit: defaultLimit,
              })}
            >
              清除篩選
            </Button>
          </Space>

          {roomId && (
            <Alert
              type="info"
              showIcon
              message="已套用房間篩選"
              description={`目前顯示 ${roomOptionMap.get(roomId) ?? '所選房間'} 的日誌；列表仍以後端回傳的房間標籤為準。`}
            />
          )}
          {roomOptionsState.status === 'error' && (
            <Alert
              type="warning"
              showIcon
              message="房間選單暫時無法載入"
              description="可先查看全部日誌，或稍後重新整理後再篩選房間。"
            />
          )}

          <List
            className="journal-message-list"
            dataSource={rows}
            locale={{
              emptyText: (
                <Empty
                  description={roomId ? '此房間目前沒有日誌。' : '目前沒有日誌。'}
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              ),
            }}
            pagination={{
              current: currentPage,
              pageSize: currentLimit,
              total,
              showSizeChanger: false,
              showTotal: (count) => `共 ${count} 筆，第 ${currentPage} / ${totalPages} 頁`,
              onChange: (nextPage) => {
                setJournalQuery({ page: nextPage, limit });
              },
            }}
            renderItem={(record) => (
              <List.Item
                key={record.id ?? `${record.created_at}-${record.content}`}
                className="journal-message-item"
                actions={[
                  <Button key="detail" size="small" onClick={() => record.id && loadDetail(record.id)}>
                    詳情
                  </Button>,
                  <Button key="edit" size="small" icon={<EditOutlined />} onClick={() => openEditDrawer(record)}>
                    編輯
                  </Button>,
                  <Button
                    key="delete"
                    danger
                    disabled={!canDelete}
                    icon={<DeleteOutlined />}
                    loading={deletingId === record.id}
                    size="small"
                    onClick={() => handleDelete(record)}
                  >
                    刪除
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={<Avatar>{getAvatarText(record.author_label)}</Avatar>}
                  title={(
                    <Space size={8} wrap className="journal-message-title">
                      <Typography.Text strong>{getOptionalText(record.author_label)}</Typography.Text>
                      <Typography.Text type="secondary">
                        {record.created_at ? formatDashboardDateTime(record.created_at) : '時間未提供'}
                      </Typography.Text>
                      <Tag>{getOptionalText(record.room_label ?? '公共區域')}</Tag>
                      {getExpenseTag(record)}
                    </Space>
                  )}
                  description={(
                    <Space direction="vertical" size={8} className="journal-message-body">
                      <Typography.Paragraph>{getOptionalText(record.content)}</Typography.Paragraph>
                      <Space size={8} wrap>
                        <Typography.Text type="secondary">
                          費用：{getExpenseAmountText(record.expense_amount)}
                        </Typography.Text>
                        {record.expense_amount !== null && record.expense_amount !== undefined && (
                          <Typography.Text type="secondary">
                            會計科目：{getExpenseTitleText(record)}
                          </Typography.Text>
                        )}
                      </Space>
                    </Space>
                  )}
                />
              </List.Item>
            )}
          />
        </Space>
      </Card>
      )}

      {activeWorkspace === 'repair' && (
        <Card>
          <RepairWorkspace
            propertyId={propertyId}
            roomId={roomId}
            roomRows={roomOptionsState.data}
            roomOptionsLoading={roomOptionsState.status === 'loading'}
            onRoomContextRefetch={loadRoomOptions}
          />
        </Card>
      )}

      <Drawer
        title="日誌詳情"
        open={detailState.status !== 'idle'}
        onClose={() => {
          abortRequest(detailRequestRef.current?.controller);
          setDetailState({ status: 'idle', data: null });
          setSelectedDetailId(null);
          setDetailError(null);
        }}
        width={720}
      >
        {detailState.status === 'loading' && <LoadingState />}
        {detailState.status === 'forbidden' && <ForbiddenState />}
        {detailState.status === 'not-found' && <NotFoundState />}
        {detailState.status === 'error' && detailState.data === null && (
          <RetryableErrorState onRetry={() => selectedDetailId && loadDetail(selectedDetailId)} />
        )}
        {detailError && (
          <Alert
            type={detailError.kind === 'conflict' ? 'warning' : 'error'}
            showIcon
            message={detailError.title}
            description={detailError.description}
            className="form-alert"
          />
        )}
        {detailRecord && (
          <Space direction="vertical" size={16} className="page-stack">
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="物業">{getOptionalText(detailRecord.property_label)}</Descriptions.Item>
              <Descriptions.Item label="房間">
                {getOptionalText(detailRecord.room_label ?? '公共區域')}
              </Descriptions.Item>
              <Descriptions.Item label="建立人">{getOptionalText(detailRecord.author_label)}</Descriptions.Item>
              <Descriptions.Item label="建立時間">
                {detailRecord.created_at ? formatDashboardDateTime(detailRecord.created_at) : '未提供'}
              </Descriptions.Item>
              <Descriptions.Item label="更新時間">
                {detailRecord.updated_at ? formatDashboardDateTime(detailRecord.updated_at) : '未提供'}
              </Descriptions.Item>
              <Descriptions.Item label="內容">{getOptionalText(detailRecord.content)}</Descriptions.Item>
              <Descriptions.Item label="費用">{getExpenseAmountText(detailRecord.expense_amount)}</Descriptions.Item>
              <Descriptions.Item label="會計科目">{getExpenseTitleText(detailRecord)}</Descriptions.Item>
              <Descriptions.Item label="費用說明">
                {getOptionalText(detailRecord.expense_description)}
              </Descriptions.Item>
            </Descriptions>
            <Alert
              type="info"
              showIcon
              message="附件功能尚未開放"
              description="此階段不提供日誌附件上傳、登記或刪除。"
            />
            <Space wrap>
              <Button icon={<EditOutlined />} onClick={() => openEditDrawer(detailRecord)}>
                編輯
              </Button>
              <Button
                danger
                disabled={!canDelete}
                icon={<DeleteOutlined />}
                loading={deletingId === detailRecord.id}
                onClick={() => handleDelete(detailRecord)}
              >
                刪除
              </Button>
            </Space>
          </Space>
        )}
      </Drawer>

      <Drawer
        title={formTitle}
        open={formMode.type !== 'closed'}
        onClose={closeFormDrawer}
        width={720}
        footer={(
          <Space className="drawer-footer-actions">
            <Button onClick={closeFormDrawer} disabled={submitting}>取消</Button>
            <Button type="primary" loading={submitting} onClick={() => void form.submit()}>
              儲存並重新載入
            </Button>
          </Space>
        )}
      >
        <Space direction="vertical" size={16} className="page-stack">
          {formError && (
            <Alert
              type="error"
              showIcon
              message="無法儲存日誌"
              description={formError}
            />
          )}
          {titleOptionsState.status === 'error' && (
            <Alert
              type="warning"
              showIcon
              message="會計科目暫時無法載入"
              description="若要建立或修改費用日誌，請重新開啟表單或稍後再試。"
            />
          )}
          <Form
            form={form}
            layout="vertical"
            requiredMark={false}
            onFinish={(values) => void handleSubmit(values)}
          >
            <Form.Item label="物業">
              <Input value="目前物業" disabled />
            </Form.Item>
            <Form.Item label="房間" name="room_id">
              <Select
                allowClear
                className="full-width-control"
                loading={roomOptionsState.status === 'loading'}
                options={roomOptions}
                placeholder="公共區域或不指定房間"
                popupMatchSelectWidth={false}
                classNames={{ popup: { root: 'journal-room-dropdown' } }}
              />
            </Form.Item>
            <Form.Item
              label="日誌內容（必填）"
              name="content"
              rules={[{ required: true, whitespace: true, message: '請輸入日誌內容。' }]}
            >
              <Input.TextArea rows={5} />
            </Form.Item>
            <Form.Item
              label={editingExistingExpense ? '費用金額（必填）' : '費用金額'}
              name="expense_amount"
              extra={editingExistingExpense ? '既有費用日誌可調整金額與科目，但不能在此清除費用。' : undefined}
              rules={editingExistingExpense
                ? [{ required: true, message: '既有費用日誌請保留費用金額。' }]
                : []}
            >
              <InputNumber min={0} precision={0} className="form-number-input" placeholder="無費用可留空" />
            </Form.Item>
            <Form.Item
              noStyle
              shouldUpdate={(previous, current) => previous.expense_amount !== current.expense_amount}
            >
              {({ getFieldValue }) => {
                const amount = getFieldValue('expense_amount');
                const hasExpense = amount !== null && amount !== undefined;
                const requiresExpenseFields = hasExpense || editingExistingExpense;

                return (
                  <>
                    <Form.Item
                      label={requiresExpenseFields ? '會計科目（必填）' : '會計科目'}
                      name="expense_accounting_title_id"
                      rules={requiresExpenseFields
                        ? [{ required: true, message: '有費用金額時請選擇會計科目。' }]
                        : []}
                    >
                      <Select
                        allowClear
                        disabled={!requiresExpenseFields}
                        loading={titleOptionsState.status === 'loading'}
                        options={titleOptions}
                        placeholder={requiresExpenseFields ? '選擇會計科目' : '有費用時才需要選擇'}
                      />
                    </Form.Item>
                    <Form.Item label="費用說明" name="expense_description">
                      <Input disabled={!requiresExpenseFields} placeholder="補充費用用途" />
                    </Form.Item>
                  </>
                );
              }}
            </Form.Item>
          </Form>
        </Space>
      </Drawer>
    </Space>
  );
}
