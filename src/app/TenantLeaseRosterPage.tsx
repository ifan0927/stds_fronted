import {
  AuditOutlined,
  FileTextOutlined,
  HistoryOutlined,
  ReloadOutlined,
  SwapOutlined,
  TeamOutlined,
  ToolOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { TableColumnsType, TablePaginationConfig } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ApiError,
  classifyApiErrorForUi,
  createLease,
  createTenant,
  exportPropertyTenantRoster,
  getLease,
  getRoom,
  getTenant,
  listBills,
  listLeases,
  listPropertyTenantLeaseRoster,
  listTenants,
  openHtmlDocumentPreview,
  type BillList,
  type CreateLeaseRequest,
  type CreateTenantRequest,
  type AccessTokenProvider,
  type HtmlPreviewWindow,
  type Lease,
  type PropertyTenantLeaseRoster,
  type PropertyTenantLeaseRosterRow,
  type Room,
  type Tenant,
  type TenantList,
  type UiErrorState,
} from '../api';
import { hasRole, useAuth } from '../auth';
import CheckoutSettlementPage from './CheckoutSettlementPage';
import { formatTwd, getRoomStatusLabel } from './format';
import { abortRequest } from './requestAbort';
import {
  ForbiddenState,
  LoadingState,
  NotFoundState,
  RetryableErrorState,
} from './routeState';

type TenantRosterLoadState =
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: PropertyTenantLeaseRoster }
  | { status: 'forbidden'; data: null }
  | { status: 'not-found'; data: null }
  | { status: 'error'; data: null };

type HubLoadState =
  | { status: 'idle'; data: null }
  | {
      status: 'ready';
      data: {
        lease: Lease;
        tenant: Tenant | null;
        bills: BillList | null;
        billsStatus: 'loading' | 'ready' | 'error';
      };
    }
  | { status: 'inconsistent'; data: null }
  | { status: 'forbidden'; data: null }
  | { status: 'not-found'; data: null }
  | { status: 'error'; data: null };

type MoveInRoomState =
  | { status: 'idle'; room: null; tenants: Tenant[] }
  | { status: 'loading'; room: null; tenants: Tenant[] }
  | { status: 'ready'; room: Room; tenants: Tenant[]; tenantsStatus: 'loading' | 'ready' | 'error' }
  | { status: 'stale'; room: Room; tenants: Tenant[] }
  | { status: 'forbidden'; room: null; tenants: Tenant[] }
  | { status: 'not-found'; room: null; tenants: Tenant[] }
  | { status: 'error'; room: null; tenants: Tenant[] };

type MoveInFormValues = {
  tenantMode?: 'existing' | 'new';
  tenant_id?: string;
  tenant_name?: string;
  tenant_email?: string;
  tenant_phone?: string;
  tenant_birth_date?: string | { format: (format: string) => string };
  tenant_national_id?: string;
  tenant_address?: string;
  tenant_occupation?: string;
  rent_amount?: number;
  rent_billing_cadence?: CreateLeaseRequest['rent_billing_cadence'];
  start_date?: string | { format: (format: string) => string };
  end_date?: string | { format: (format: string) => string };
  deposit_amount?: number;
  electricity_billing_cadence?: CreateLeaseRequest['electricity_billing_cadence'];
  starting_meter_reading?: number;
  notes?: string;
};

const defaultPage = 1;
const defaultLimit = 20;
const limitOptions = [20, 50, 100] as const;
const dateFormat = 'YYYY-MM-DD';

type TenantRosterExportErrorState = UiErrorState | null;

function getTenantReturnTo(pathname: string, search: string) {
  return `/login?reason=session-expired&returnTo=${encodeURIComponent(`${pathname}${search}`)}`;
}

function getDefaultAsOfDate(now = new Date()) {
  return dayjs(now).format(dateFormat);
}

function getOptionalText(value: string | null | undefined) {
  return value && value.trim().length > 0 ? value : '未提供';
}

function getPositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getValidLimit(value: string | null) {
  const parsed = getPositiveInteger(value, defaultLimit);
  return limitOptions.includes(parsed as (typeof limitOptions)[number]) ? parsed : defaultLimit;
}

function getIncludeVacant(value: string | null) {
  return value === 'true';
}

function getDateRange(startDate: string | null | undefined, endDate: string | null | undefined) {
  if (!startDate && !endDate) {
    return '未提供';
  }

  return `${startDate ?? '未提供'} - ${endDate ?? '未提供'}`;
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
    return '已退租';
  }

  if (value === 'force_terminated') {
    return '強制退租';
  }

  return '未提供';
}

function getDepositStatusLabel(value: string | null | undefined) {
  if (value === 'held') {
    return '保留中';
  }

  if (value === 'settled') {
    return '已結清';
  }

  if (value === 'written_off') {
    return '已沖銷';
  }

  return '未提供';
}

function getBillStatusLabel(value: string | null | undefined) {
  if (value === 'pending_meter') {
    return '待抄表';
  }

  if (value === 'pending_payment') {
    return '待收款';
  }

  if (value === 'paid') {
    return '已付款';
  }

  if (value === 'overdue') {
    return '逾期';
  }

  if (value === 'voided') {
    return '已作廢';
  }

  if (value === 'written_off') {
    return '已沖銷';
  }

  return '未提供';
}

function getStatusColor(value: string | null | undefined) {
  if (value === 'occupied' || value === 'active' || value === 'paid' || value === 'held') {
    return 'green';
  }

  if (value === 'vacant') {
    return 'blue';
  }

  if (value === 'maintenance' || value === 'pending_payment' || value === 'overdue') {
    return 'orange';
  }

  return 'default';
}

function getRoomStatusCopy(value: string | null | undefined) {
  if (value === 'vacant' || value === 'occupied' || value === 'maintenance') {
    return getRoomStatusLabel(value);
  }

  return getOptionalText(value);
}

function getRosterLeaseSummary(row: PropertyTenantLeaseRosterRow, leaseId: string): Lease {
  return {
    id: leaseId,
    property_id: row.property_id,
    room_id: row.room_id,
    room_label: row.room_label,
    tenant_id: row.tenant_id ?? undefined,
    tenant_label: row.tenant_label ?? undefined,
    status: row.lease_status === 'active' ? 'active' : undefined,
    rent_amount: row.rent_amount ?? undefined,
    rent_billing_cadence: row.rent_billing_cadence === 'monthly'
      || row.rent_billing_cadence === 'quarterly'
      || row.rent_billing_cadence === 'semiannual'
      || row.rent_billing_cadence === 'annual'
      ? row.rent_billing_cadence
      : undefined,
    start_date: row.start_date ?? undefined,
    end_date: row.end_date ?? undefined,
    deposit_amount: row.deposit_amount ?? undefined,
    deposit_status: row.deposit_status === 'held'
      || row.deposit_status === 'settled'
      || row.deposit_status === 'written_off'
      ? row.deposit_status
      : undefined,
    notes: row.notes ?? undefined,
  };
}

function isOccupiedRosterRow(row: PropertyTenantLeaseRosterRow) {
  return row.room_status === 'occupied' || Boolean(row.lease_id || row.tenant_id);
}

function buildPropertyPath(propertyId: string, suffix: string, query?: Record<string, string>) {
  const searchParams = new URLSearchParams(query);
  const search = searchParams.toString();

  return `/properties/${encodeURIComponent(propertyId)}${suffix}${search ? `?${search}` : ''}`;
}

function buildActionQuery(query: Record<string, string | null | undefined>) {
  const result: Record<string, string> = {};

  Object.entries(query).forEach(([key, value]) => {
    if (value) {
      result[key] = value;
    }
  });

  return result;
}

function getTextOrUndefined(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function getTextOrNull(value: string | null | undefined) {
  return getTextOrUndefined(value) ?? null;
}

function formatDateValue(value: MoveInFormValues['start_date']) {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  return value.format(dateFormat);
}

function getTenantRosterExportFailureDescription(state: UiErrorState) {
  if (state.kind === 'not-found') {
    return '找不到此物業，請返回物業列表重新確認。';
  }

  if (state.kind === 'forbidden') {
    return '目前帳號沒有此物業房客名冊的存取權限。';
  }

  if (state.kind === 'validation') {
    return '名冊基準日或空房設定未通過檢查，請調整後再試一次。';
  }

  return state.description;
}

function getMoveInErrorCopy(error: unknown) {
  if (error instanceof ApiError && error.errorCode === 'ROOM_NOT_VACANT') {
    return '房間狀態已變更，無法辦理入住。請重新整理房間與名冊後再確認。';
  }

  const errorState = classifyApiErrorForUi(error);

  if (errorState.kind === 'conflict') {
    return '資料已被其他操作更新，請重新整理後再試一次。';
  }

  if (errorState.kind === 'validation') {
    return '表單資料未通過檢查，請確認必填欄位與日期、金額、起始電表讀數。';
  }

  return errorState.description;
}

function buildCreateTenantRequest(values: MoveInFormValues): CreateTenantRequest {
  return {
    name: getTextOrUndefined(values.tenant_name) ?? '',
    email: getTextOrUndefined(values.tenant_email) ?? '',
    phone: getTextOrUndefined(values.tenant_phone),
    birth_date: formatDateValue(values.tenant_birth_date) ?? null,
    national_id: getTextOrNull(values.tenant_national_id),
    address: getTextOrNull(values.tenant_address),
    occupation: getTextOrNull(values.tenant_occupation),
  };
}

function buildCreateLeaseRequest(values: MoveInFormValues, roomId: string, tenantId: string): CreateLeaseRequest {
  return {
    tenant_id: tenantId,
    room_id: roomId,
    rent_amount: values.rent_amount ?? 0,
    rent_billing_cadence: values.rent_billing_cadence,
    start_date: formatDateValue(values.start_date) ?? '',
    end_date: formatDateValue(values.end_date) ?? '',
    deposit_amount: values.deposit_amount ?? 0,
    electricity_billing_cadence: values.electricity_billing_cadence,
    starting_meter_reading: values.starting_meter_reading ?? 0,
    notes: getTextOrNull(values.notes),
  };
}

export default function TenantLeaseRosterPage() {
  const { propertyId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser, getAccessToken } = useAuth();
  const rosterRequestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const hubRequestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const locationSearchRef = useRef(location.search);
  const rosterRequestIdRef = useRef(0);
  const hubRequestIdRef = useRef(0);
  const [loadState, setLoadState] = useState<TenantRosterLoadState>({ status: 'loading', data: null });
  const [hubState, setHubState] = useState<HubLoadState>({ status: 'idle', data: null });
  const [exportingTenantRoster, setExportingTenantRoster] = useState(false);
  const [tenantRosterExportError, setTenantRosterExportError] = useState<TenantRosterExportErrorState>(null);
  const [tenantRosterAsOf, setTenantRosterAsOf] = useState(() => getDefaultAsOfDate());
  const [tenantRosterIncludeVacant, setTenantRosterIncludeVacant] = useState(true);
  const [messageApi, contextHolder] = message.useMessage();

  const includeVacant = getIncludeVacant(searchParams.get('include_vacant'));
  const page = getPositiveInteger(searchParams.get('page'), defaultPage);
  const limit = getValidLimit(searchParams.get('limit'));
  const selectedRoomId = searchParams.get('roomId') ?? undefined;
  const selectedLeaseId = searchParams.get('leaseId') ?? undefined;
  const selectedView = searchParams.get('view') ?? undefined;
  const selectedMode = searchParams.get('mode') ?? undefined;
  const shouldShowCheckoutWorkflow = Boolean(
    selectedRoomId
    && selectedLeaseId
    && selectedView === 'hub'
    && (selectedMode === 'checkout' || selectedMode === 'force'),
  );
  const shouldShowHub = Boolean(selectedRoomId && selectedView === 'hub' && !shouldShowCheckoutWorkflow);
  const shouldShowMoveInPlaceholder = Boolean(selectedRoomId && selectedMode === 'move-in');
  const selectedRosterRow = loadState.status === 'ready'
    ? loadState.data.data?.find((row) => (
      (selectedLeaseId && row.lease_id === selectedLeaseId)
      || (selectedRoomId && row.room_id === selectedRoomId)
    ))
    : undefined;

  useEffect(() => {
    locationSearchRef.current = location.search;
  }, [location.search]);

  const setRosterQuery = useCallback((next: {
    includeVacant?: boolean;
    page?: number;
    limit?: number;
    roomId?: string | null;
    view?: string | null;
    mode?: string | null;
    leaseId?: string | null;
  }) => {
    setSearchParams((previous) => {
      const updated = new URLSearchParams(previous);
      const nextIncludeVacant = next.includeVacant ?? includeVacant;
      const nextPage = next.page ?? defaultPage;
      const nextLimit = next.limit ?? limit;

      if (nextIncludeVacant) {
        updated.set('include_vacant', 'true');
      } else {
        updated.delete('include_vacant');
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

      if (next.roomId === null) {
        updated.delete('roomId');
      } else if (next.roomId) {
        updated.set('roomId', next.roomId);
      }

      if (next.view === null) {
        updated.delete('view');
      } else if (next.view) {
        updated.set('view', next.view);
      }

      if (next.mode === null) {
        updated.delete('mode');
      } else if (next.mode) {
        updated.set('mode', next.mode);
      }

      if (next.leaseId === null) {
        updated.delete('leaseId');
      } else if (next.leaseId) {
        updated.set('leaseId', next.leaseId);
      }

      return updated;
    });
  }, [includeVacant, limit, setSearchParams]);

  const openTenantRosterExport = useCallback(async () => {
    if (!propertyId) {
      return;
    }

    const previewWindow = window.open('', '_blank');
    setExportingTenantRoster(true);
    setTenantRosterExportError(null);

    try {
      const response = await exportPropertyTenantRoster(
        propertyId,
        { as_of: tenantRosterAsOf, include_vacant: tenantRosterIncludeVacant, format: 'html' },
        getAccessToken,
      );
      const result = openHtmlDocumentPreview(response, previewWindow as HtmlPreviewWindow | null);

      if (!result.ok) {
        void messageApi.warning(
          result.reason === 'popup-blocked'
            ? '瀏覽器阻擋了名冊預覽視窗，請允許彈出視窗後再試一次。'
            : '名冊預覽格式無法開啟。',
        );
        return;
      }

      void messageApi.success('房客名冊已開啟。');
    } catch (error: unknown) {
      previewWindow?.close();
      const errorState = classifyApiErrorForUi(error);

      if (errorState.kind === 'unauthorized') {
        navigate(getTenantReturnTo(location.pathname, locationSearchRef.current), { replace: true });
        return;
      }

      setTenantRosterExportError(errorState);
    } finally {
      setExportingTenantRoster(false);
    }
  }, [
    getAccessToken,
    location.pathname,
    messageApi,
    navigate,
    propertyId,
    tenantRosterAsOf,
    tenantRosterIncludeVacant,
  ]);

  const updateTenantRosterAsOf = useCallback((value: Dayjs | null) => {
    setTenantRosterAsOf((previous) => value?.format(dateFormat) ?? previous);
  }, []);

  const loadRoster = useCallback(() => {
    if (!propertyId) {
      setLoadState({ status: 'not-found', data: null });
      return;
    }

    abortRequest(rosterRequestRef.current?.controller);
    const controller = new AbortController();
    const requestId = rosterRequestIdRef.current + 1;
    rosterRequestIdRef.current = requestId;
    rosterRequestRef.current = { id: requestId, controller };

    setLoadState({ status: 'loading', data: null });

    void listPropertyTenantLeaseRoster(
      propertyId,
      getAccessToken,
      { include_vacant: includeVacant, page, limit },
      { signal: controller.signal },
    )
      .then((response) => {
        if (rosterRequestRef.current?.id !== requestId) {
          return;
        }

        setLoadState({ status: 'ready', data: response });
      })
      .catch((error: unknown) => {
        if (rosterRequestRef.current?.id !== requestId) {
          return;
        }

        const errorState = classifyApiErrorForUi(error);

        if (errorState.kind === 'cancelled') {
          return;
        }

        if (errorState.kind === 'unauthorized') {
          navigate(getTenantReturnTo(location.pathname, locationSearchRef.current), { replace: true });
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
  }, [getAccessToken, includeVacant, limit, location.pathname, navigate, page, propertyId]);

  const loadHub = useCallback(() => {
    if (!selectedRoomId) {
      setHubState({ status: 'idle', data: null });
      return;
    }

    abortRequest(hubRequestRef.current?.controller);
    const controller = new AbortController();
    const requestId = hubRequestIdRef.current + 1;
    hubRequestIdRef.current = requestId;
    hubRequestRef.current = { id: requestId, controller };

    const rosterLeaseId = selectedRosterRow?.lease_id ?? undefined;

    if (rosterLeaseId && selectedRosterRow) {
      if (selectedLeaseId && selectedLeaseId !== rosterLeaseId) {
        setRosterQuery({
          roomId: selectedRosterRow.room_id ?? selectedRoomId,
          view: 'hub',
          mode: null,
          leaseId: rosterLeaseId,
          page,
          limit,
        });
        return;
      }

      const leaseSummary = getRosterLeaseSummary(selectedRosterRow, rosterLeaseId);

      setHubState({
        status: 'ready',
        data: {
          lease: leaseSummary,
          tenant: null,
          bills: null,
          billsStatus: 'loading',
        },
      });

      void listBills(
        getAccessToken,
        { lease_id: rosterLeaseId, type: 'rent', page: 1, limit: 5 },
        { signal: controller.signal },
      )
        .then((bills) => {
          if (hubRequestRef.current?.id !== requestId) {
            return;
          }

          setHubState({
            status: 'ready',
            data: {
              lease: leaseSummary,
              tenant: null,
              bills,
              billsStatus: 'ready',
            },
          });
        })
        .catch((error: unknown) => {
          if (hubRequestRef.current?.id !== requestId) {
            return;
          }

          const errorState = classifyApiErrorForUi(error);

          if (errorState.kind === 'cancelled') {
            return;
          }

          if (errorState.kind === 'unauthorized') {
            navigate(getTenantReturnTo(location.pathname, locationSearchRef.current), { replace: true });
            return;
          }

          if (errorState.kind === 'forbidden') {
            setHubState({ status: 'forbidden', data: null });
            return;
          }

          if (errorState.kind === 'not-found') {
            setHubState({ status: 'not-found', data: null });
            return;
          }

          setHubState({
            status: 'ready',
            data: {
              lease: leaseSummary,
              tenant: null,
              bills: null,
              billsStatus: 'error',
            },
          });
        });
      return;
    }

    setHubState({ status: 'idle', data: null });

    const activeLeaseIdPromise = selectedLeaseId
      ? Promise.resolve(selectedLeaseId)
      : listLeases(
        getAccessToken,
        { room_id: selectedRoomId, status: 'active', page: 1, limit: 1 },
        { signal: controller.signal },
      ).then((leases) => leases.data?.[0]?.id);

    void activeLeaseIdPromise
      .then(async (activeLeaseId) => {
        if (hubRequestRef.current?.id !== requestId) {
          return;
        }

        if (!activeLeaseId) {
          setHubState({ status: 'inconsistent', data: null });
          return;
        }

        const lease = await getLease(activeLeaseId, getAccessToken, { signal: controller.signal });

        const tenant = lease.tenant_id
          ? await getTenant(lease.tenant_id, getAccessToken, { signal: controller.signal })
          : null;

        if (hubRequestRef.current?.id !== requestId) {
          return;
        }

        setHubState({
          status: 'ready',
          data: { lease, tenant, bills: null, billsStatus: 'loading' },
        });

        const bills = await listBills(
          getAccessToken,
          { lease_id: activeLeaseId, type: 'rent', page: 1, limit: 5 },
          { signal: controller.signal },
        );

        if (hubRequestRef.current?.id !== requestId) {
          return;
        }

        setHubState({
          status: 'ready',
          data: { lease, tenant, bills, billsStatus: 'ready' },
        });
      })
      .catch((error: unknown) => {
        if (hubRequestRef.current?.id !== requestId) {
          return;
        }

        const errorState = classifyApiErrorForUi(error);

        if (errorState.kind === 'cancelled') {
          return;
        }

        if (errorState.kind === 'unauthorized') {
          navigate(getTenantReturnTo(location.pathname, locationSearchRef.current), { replace: true });
          return;
        }

        if (errorState.kind === 'forbidden') {
          setHubState({ status: 'forbidden', data: null });
          return;
        }

        if (errorState.kind === 'not-found') {
          setHubState({ status: 'not-found', data: null });
          return;
        }

        setHubState({ status: 'error', data: null });
      });
  }, [
    getAccessToken,
    location.pathname,
    limit,
    navigate,
    page,
    selectedLeaseId,
    selectedRoomId,
    selectedRosterRow,
    setRosterQuery,
  ]);

  useEffect(() => {
    loadRoster();

    return () => abortRequest(rosterRequestRef.current?.controller);
  }, [loadRoster]);

  useEffect(() => {
    if (shouldShowHub && loadState.status === 'ready') {
      loadHub();
      return () => abortRequest(hubRequestRef.current?.controller);
    }

    abortRequest(hubRequestRef.current?.controller);
    setHubState({ status: 'idle', data: null });
    return undefined;
  }, [loadHub, loadState.status, shouldShowHub]);

  const columns = useMemo<TableColumnsType<PropertyTenantLeaseRosterRow>>(() => [
    {
      title: '房間',
      dataIndex: 'room_label',
      width: 150,
      render: (value: PropertyTenantLeaseRosterRow['room_label'], record) => (
        <div className="table-cell-stack">
          <Typography.Text strong>{getOptionalText(value)}</Typography.Text>
          <Tag color={getStatusColor(record.room_status)}>{getRoomStatusCopy(record.room_status)}</Tag>
        </div>
      ),
    },
    {
      title: '租客',
      dataIndex: 'tenant_label',
      width: 170,
      render: (value: PropertyTenantLeaseRosterRow['tenant_label'], record) => (
        <div className="table-cell-stack">
          <Typography.Text>{getOptionalText(value)}</Typography.Text>
          <Typography.Text type="secondary">{getOptionalText(record.tenant_phone)}</Typography.Text>
        </div>
      ),
    },
    {
      title: '租約期間',
      width: 210,
      render: (_, record) => (
        <div className="table-cell-stack">
          <Typography.Text>{getDateRange(record.start_date, record.end_date)}</Typography.Text>
          <Tag color={getStatusColor(record.lease_status)}>{getLeaseStatusLabel(record.lease_status)}</Tag>
        </div>
      ),
    },
    {
      title: '租金',
      width: 160,
      align: 'right',
      render: (_, record) => (
        <div className="table-cell-stack">
          <Typography.Text>{getMoneyText(record.rent_amount)}</Typography.Text>
          <Typography.Text type="secondary">{getCadenceLabel(record.rent_billing_cadence)}</Typography.Text>
        </div>
      ),
    },
    {
      title: '押金',
      width: 150,
      align: 'right',
      render: (_, record) => (
        <div className="table-cell-stack">
          <Typography.Text>{getMoneyText(record.deposit_amount)}</Typography.Text>
          <Typography.Text type="secondary">{getDepositStatusLabel(record.deposit_status)}</Typography.Text>
        </div>
      ),
    },
    {
      title: '下期租金',
      width: 170,
      render: (_, record) => (
        <div className="table-cell-stack">
          <Typography.Text>{getOptionalText(record.next_rent_due_date)}</Typography.Text>
          <Tag color={getStatusColor(record.next_rent_status)}>{getBillStatusLabel(record.next_rent_status)}</Tag>
        </div>
      ),
    },
    {
      title: '備註',
      dataIndex: 'notes',
      width: 240,
      ellipsis: true,
      render: (value: PropertyTenantLeaseRosterRow['notes']) => <Typography.Text>{getOptionalText(value)}</Typography.Text>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 360,
      fixed: 'right',
      render: (_, record) => {
        const roomId = record.room_id;

        if (!propertyId || !roomId) {
          return <Typography.Text type="secondary">缺少房間識別</Typography.Text>;
        }

        if (!isOccupiedRosterRow(record)) {
          return (
            <Space size={8} wrap className="row-action-stack">
              <Button
                size="small"
                type="primary"
                icon={<TeamOutlined />}
                onClick={() => setRosterQuery({
                  includeVacant: true,
                  page,
                  limit,
                  roomId,
                  mode: 'move-in',
                  view: null,
                  leaseId: null,
                })}
              >
                辦理入住
              </Button>
              <Button
                size="small"
                onClick={() => navigate(buildPropertyPath(propertyId, `/rooms/${roomId}`))}
              >
                查看房間
              </Button>
            </Space>
          );
        }

        return (
          <Space size={8} wrap className="row-action-stack">
            <Button
              size="small"
              type="primary"
              icon={<TeamOutlined />}
              onClick={() => setRosterQuery({
                page,
                limit,
                roomId,
                view: 'hub',
                mode: null,
                leaseId: record.lease_id ?? null,
              })}
            >
              進入 Hub
            </Button>
            <Button
              size="small"
              icon={<AuditOutlined />}
              onClick={() => navigate(buildPropertyPath(propertyId, '/billing', buildActionQuery({
                roomId,
                leaseId: record.lease_id,
              })))}
            >
              帳單
            </Button>
            <Button
              size="small"
              icon={<ToolOutlined />}
              onClick={() => navigate(buildPropertyPath(propertyId, '/journal', { roomId }))}
            >
              日誌維修
            </Button>
          </Space>
        );
      },
    },
  ], [limit, navigate, page, propertyId, setRosterQuery]);

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
    return <RetryableErrorState onRetry={() => loadRoster()} />;
  }

  const rows = loadState.data.data ?? [];
  const pagination = loadState.data.pagination;
  const currentPage = pagination?.page ?? page;
  const currentLimit = pagination?.limit ?? limit;
  const total = pagination?.total ?? rows.length;
  const totalPages = pagination?.total_pages ?? 1;

  return (
    <Space direction="vertical" size={16} className="page-stack">
      {contextHolder}
      <div className="page-header">
        <div>
          <Space size={8} wrap>
            <Tag color="blue">租客與租約</Tag>
            <Tag>目前物業</Tag>
          </Space>
          <Typography.Title level={1}>租客與租約名冊</Typography.Title>
          <Typography.Paragraph type="secondary">
            查看後端名冊 read model，並從出租中房間進入租客、租約、帳單、抄表、維修與退租工作入口。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Button onClick={() => navigate(propertyId ? `/properties/${propertyId}` : '/properties')}>
            回物業工作台
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => loadRoster()}>
            重新整理
          </Button>
          <Button
            icon={<TeamOutlined />}
            onClick={() => setRosterQuery({
              includeVacant: true,
              page: defaultPage,
              limit,
              roomId: null,
              view: null,
              mode: null,
              leaseId: null,
            })}
          >
            顯示空房
          </Button>
        </Space>
      </div>

      <Card>
        <Space direction="vertical" size={12} className="page-stack">
          <Space size={12} wrap>
            <div className="filter-field">
              <Typography.Text type="secondary">名冊基準日</Typography.Text>
              <DatePicker
                aria-label="名冊基準日"
                value={dayjs(tenantRosterAsOf, dateFormat)}
                format={dateFormat}
                inputReadOnly
                onChange={updateTenantRosterAsOf}
              />
            </div>
            <div className="filter-field">
              <Typography.Text type="secondary">名冊內容</Typography.Text>
              <Select
                aria-label="名冊內容"
                className="tenant-roster-export-select"
                value={tenantRosterIncludeVacant ? 'true' : 'false'}
                options={[
                  { value: 'true', label: '包含空房' },
                  { value: 'false', label: '只列出租中' },
                ]}
                onChange={(value) => setTenantRosterIncludeVacant(value === 'true')}
              />
            </div>
            <Button
              type="primary"
              icon={<FileTextOutlined />}
              loading={exportingTenantRoster}
              onClick={() => void openTenantRosterExport()}
            >
              匯出房客名冊
            </Button>
          </Space>
          {tenantRosterExportError && (
            <Alert
              type="error"
              showIcon
              message="房客名冊無法開啟"
              description={getTenantRosterExportFailureDescription(tenantRosterExportError)}
              action={
                tenantRosterExportError.retryable
                  ? <Button size="small" onClick={() => void openTenantRosterExport()}>重試</Button>
                  : undefined
              }
            />
          )}
        </Space>
      </Card>

      <Card>
        <Space direction="vertical" size={16} className="page-stack">
          <div className="filter-toolbar">
            <Space size={12} wrap>
              <div className="filter-field">
                <Typography.Text type="secondary">顯示空房</Typography.Text>
                <Select
                  aria-label="顯示空房"
                  className="tenant-include-vacant-filter"
                  value={includeVacant ? 'true' : 'false'}
                  options={[
                    { value: 'false', label: '只看出租中' },
                    { value: 'true', label: '包含空房' },
                  ]}
                  onChange={(value) => setRosterQuery({
                    includeVacant: value === 'true',
                    page: defaultPage,
                    limit,
                  })}
                />
              </div>
              <div className="filter-field">
                <Typography.Text type="secondary">每頁筆數</Typography.Text>
                <Select
                  aria-label="每頁筆數"
                  className="room-limit-filter"
                  value={limit}
                  options={limitOptions.map((value) => ({ value, label: `${value} 筆` }))}
                  onChange={(value) => setRosterQuery({ includeVacant, page: defaultPage, limit: value })}
                />
              </div>
            </Space>
            <Button onClick={() => setRosterQuery({
              includeVacant: false,
              page: defaultPage,
              limit: defaultLimit,
              roomId: null,
              view: null,
              mode: null,
              leaseId: null,
            })}
            >
              清除篩選
            </Button>
          </div>

          <Table
            rowKey={(record) => record.room_id ?? `${record.room_label}-${record.tenant_id}`}
            columns={columns}
            dataSource={rows}
            scroll={{ x: 1610 }}
            pagination={{
              current: currentPage,
              pageSize: currentLimit,
              total,
              showSizeChanger: false,
              showTotal: (count) => `共 ${count} 筆，第 ${currentPage} / ${totalPages} 頁`,
            }}
            onChange={(tablePagination: TablePaginationConfig) => {
              setRosterQuery({
                includeVacant,
                page: tablePagination.current ?? defaultPage,
                limit: tablePagination.pageSize ?? limit,
              });
            }}
            locale={{
              emptyText: (
                <Empty
                  description={includeVacant ? '目前沒有可顯示的房間租約資料。' : '目前沒有出租中的租客租約資料。'}
                />
              ),
            }}
          />
        </Space>
      </Card>

      {shouldShowHub && selectedRoomId && (
        <OccupiedRoomHub
          propertyId={propertyId}
          roomId={selectedRoomId}
          state={hubState}
          canForceTerminate={hasRole(currentUser, ['admin', 'organizer'])}
          canReplaceLease={hasRole(currentUser, ['admin', 'organizer', 'staff'])}
          onRetry={() => loadHub()}
          onClose={() => setRosterQuery({ roomId: null, view: null, mode: null, leaseId: null })}
        />
      )}
      {shouldShowCheckoutWorkflow && (
        <CheckoutSettlementPage
          embeddedWorkflow
          onEmbeddedClose={() => setRosterQuery({ view: 'hub', mode: null })}
          onEmbeddedWorkflowSuccess={() => {
            loadRoster();
            setRosterQuery({ view: 'hub', mode: null });
          }}
        />
      )}
      {shouldShowMoveInPlaceholder && selectedRoomId && (
        <MoveInDrawer
          propertyId={propertyId}
          roomId={selectedRoomId}
          getAccessToken={getAccessToken}
          onClose={() => setRosterQuery({ roomId: null, mode: null, view: null, leaseId: null })}
          onSuccess={(lease) => {
            void messageApi.success('入住已建立，正在更新名冊。');
            loadRoster();
            setRosterQuery({
              includeVacant: false,
              page: defaultPage,
              limit,
              roomId: lease.room_id ?? selectedRoomId,
              view: 'hub',
              mode: null,
              leaseId: lease.id ?? null,
            });
          }}
        />
      )}
    </Space>
  );
}

type OccupiedRoomHubProps = {
  propertyId: string | undefined;
  roomId: string;
  state: HubLoadState;
  canForceTerminate: boolean;
  canReplaceLease: boolean;
  onRetry: () => void;
  onClose: () => void;
};

type MoveInDrawerProps = {
  propertyId: string | undefined;
  roomId: string;
  getAccessToken: AccessTokenProvider;
  onClose: () => void;
  onSuccess: (lease: Lease) => void;
};

function MoveInDrawer({
  propertyId,
  roomId,
  getAccessToken,
  onClose,
  onSuccess,
}: MoveInDrawerProps) {
  const [form] = Form.useForm<MoveInFormValues>();
  const activeRequestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const requestIdRef = useRef(0);
  const [state, setState] = useState<MoveInRoomState>({ status: 'idle', room: null, tenants: [] });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const tenantMode = Form.useWatch('tenantMode', form) ?? 'existing';

  const loadContext = useCallback(() => {
    abortRequest(activeRequestRef.current?.controller);
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    activeRequestRef.current = { id: requestId, controller };
    setState((previous) => ({ status: 'loading', room: null, tenants: previous.tenants }));

    void getRoom(roomId, getAccessToken, { signal: controller.signal })
      .then((room) => {
        if (activeRequestRef.current?.id !== requestId) {
          return;
        }

        if (room.status !== 'vacant') {
          setState({ status: 'stale', room, tenants: [] });
          return;
        }

        setState((previous) => ({
          status: 'ready',
          room,
          tenants: previous.tenants,
          tenantsStatus: 'loading',
        }));

        return listTenants(
          getAccessToken,
          { property_id: propertyId, page: 1, limit: 100 },
          { signal: controller.signal },
        )
          .then((tenants: TenantList) => {
            if (activeRequestRef.current?.id !== requestId) {
              return;
            }

            setState({
              status: 'ready',
              room,
              tenants: tenants.data ?? [],
              tenantsStatus: 'ready',
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

            setState({
              status: 'ready',
              room,
              tenants: [],
              tenantsStatus: 'error',
            });
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

        if (errorState.kind === 'forbidden') {
          setState({ status: 'forbidden', room: null, tenants: [] });
          return;
        }

        if (errorState.kind === 'not-found') {
          setState({ status: 'not-found', room: null, tenants: [] });
          return;
        }

        setState({ status: 'error', room: null, tenants: [] });
      });
  }, [getAccessToken, propertyId, roomId]);

  useEffect(() => {
    form.setFieldsValue({
      tenantMode: 'existing',
      rent_billing_cadence: 'monthly',
      electricity_billing_cadence: 'monthly',
    });
    loadContext();

    return () => abortRequest(activeRequestRef.current?.controller);
  }, [form, loadContext]);

  const submitMoveIn = (values: MoveInFormValues) => {
    if (state.status !== 'ready') {
      return;
    }

    const controller = new AbortController();
    setSubmitting(true);
    setSubmitError(null);

    const tenantPromise = values.tenantMode === 'new'
      ? createTenant(buildCreateTenantRequest(values), getAccessToken, { signal: controller.signal })
      : Promise.resolve({ id: values.tenant_id } as Tenant);

    void tenantPromise
      .then((tenant) => {
        if (!tenant.id) {
          throw new Error('missing tenant id');
        }

        return createLease(
          buildCreateLeaseRequest(values, roomId, tenant.id),
          getAccessToken,
          { signal: controller.signal },
        );
      })
      .then((lease) => {
        setSubmitting(false);
        onSuccess(lease);
      })
      .catch((error: unknown) => {
        const errorState = classifyApiErrorForUi(error);

        if (errorState.kind === 'cancelled') {
          return;
        }

        setSubmitting(false);
        setSubmitError(getMoveInErrorCopy(error));

        if (
          errorState.kind === 'conflict'
          || (error instanceof ApiError && error.errorCode === 'ROOM_NOT_VACANT')
        ) {
          loadContext();
        }
      });
  };

  return (
    <Drawer
      title="空房入住"
      open
      onClose={onClose}
      width={760}
      extra={<Button icon={<ReloadOutlined />} onClick={loadContext}>重新整理</Button>}
    >
      <Space direction="vertical" size={16} className="page-stack">
        {state.status === 'loading' && <LoadingState />}
        {state.status === 'forbidden' && <ForbiddenState />}
        {state.status === 'not-found' && <NotFoundState />}
        {state.status === 'error' && <RetryableErrorState onRetry={loadContext} />}
        {state.status === 'stale' && (
          <Alert
            type="warning"
            showIcon
            message="房間狀態已變更，無法辦理入住"
            description="此房間目前不是空房。請重新整理名冊後，再從可入住的空房重新進入。"
            action={<Button onClick={loadContext}>重新整理</Button>}
          />
        )}
        {state.status === 'ready' && (
          <>
            <Card size="small" title="入住房間">
              <Descriptions column={{ xs: 1, md: 2 }} size="small">
                <Descriptions.Item label="房間">{getOptionalText(state.room.name)}</Descriptions.Item>
                <Descriptions.Item label="房況">
                  <Tag color="blue">{getRoomStatusCopy(state.room.status)}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="預設租金">{getMoneyText(state.room.default_rent_amount)}</Descriptions.Item>
                <Descriptions.Item label="區域">{getOptionalText(state.room.zone)}</Descriptions.Item>
              </Descriptions>
            </Card>
            {state.tenantsStatus === 'error' && (
              <Alert
                type="warning"
                showIcon
                message="既有租客清單暫時無法讀取"
                description="仍可改用新增租客完成入住。"
              />
            )}
            {submitError && (
              <Alert type="error" showIcon message="入住建立失敗" description={submitError} />
            )}
            <Form
              form={form}
              layout="vertical"
              requiredMark
              onFinish={submitMoveIn}
            >
              <Card size="small" title="租客">
                <Form.Item name="tenantMode" label="租客來源">
                  <Radio.Group>
                    <Radio.Button value="existing">選擇既有租客</Radio.Button>
                    <Radio.Button value="new">新增租客</Radio.Button>
                  </Radio.Group>
                </Form.Item>
                {tenantMode === 'existing' ? (
                  <Form.Item
                    name="tenant_id"
                    label="既有租客（必填）"
                    rules={[{ required: true, message: '請選擇租客，或改用新增租客。' }]}
                  >
                    <Select
                      aria-label="既有租客"
                      loading={state.tenantsStatus === 'loading'}
                      placeholder="選擇租客"
                      options={state.tenants.map((tenant) => ({
                        value: tenant.id ?? '',
                        label: `${getOptionalText(tenant.name)}${tenant.phone ? ` / ${tenant.phone}` : ''}`,
                      })).filter((item) => item.value)}
                    />
                  </Form.Item>
                ) : (
                  <>
                    <Form.Item
                      name="tenant_name"
                      label="租客姓名（必填）"
                      rules={[{ required: true, message: '請輸入租客姓名。' }]}
                    >
                      <Input />
                    </Form.Item>
                    <Form.Item
                      name="tenant_email"
                      label="電子信箱（必填）"
                      rules={[
                        { required: true, message: '請輸入電子信箱。' },
                        { type: 'email', message: '請輸入有效的電子信箱。' },
                      ]}
                    >
                      <Input />
                    </Form.Item>
                    <Form.Item name="tenant_phone" label="電話">
                      <Input />
                    </Form.Item>
                    <Form.Item name="tenant_birth_date" label="生日">
                      <DatePicker format="YYYY-MM-DD" inputReadOnly className="form-date-input" />
                    </Form.Item>
                    <Form.Item name="tenant_national_id" label="身分證字號">
                      <Input />
                    </Form.Item>
                    <Form.Item name="tenant_address" label="地址">
                      <Input />
                    </Form.Item>
                    <Form.Item name="tenant_occupation" label="職業">
                      <Input />
                    </Form.Item>
                  </>
                )}
              </Card>
              <Card size="small" title="租約條件">
                <Form.Item
                  name="rent_amount"
                  label="租金（必填）"
                  rules={[{ required: true, message: '請輸入租金。' }]}
                >
                  <InputNumber min={0} precision={0} className="form-number-input" />
                </Form.Item>
                <Form.Item name="rent_billing_cadence" label="租金週期">
                  <Select
                    aria-label="租金週期"
                    options={[
                      { value: 'monthly', label: '月繳' },
                      { value: 'quarterly', label: '季繳' },
                      { value: 'semiannual', label: '半年繳' },
                      { value: 'annual', label: '年繳' },
                    ]}
                  />
                </Form.Item>
                <Form.Item
                  name="start_date"
                  label="租約開始（必填）"
                  rules={[{ required: true, message: '請輸入租約開始日。' }]}
                >
                  <DatePicker format="YYYY-MM-DD" inputReadOnly className="form-date-input" />
                </Form.Item>
                <Form.Item
                  name="end_date"
                  label="租約結束（必填）"
                  rules={[{ required: true, message: '請輸入租約結束日。' }]}
                >
                  <DatePicker format="YYYY-MM-DD" inputReadOnly className="form-date-input" />
                </Form.Item>
                <Form.Item
                  name="deposit_amount"
                  label="押金（必填）"
                  rules={[{ required: true, message: '請輸入押金。' }]}
                >
                  <InputNumber min={0} precision={0} className="form-number-input" />
                </Form.Item>
                <Form.Item name="electricity_billing_cadence" label="電費週期">
                  <Select
                    aria-label="電費週期"
                    options={[
                      { value: 'monthly', label: '每月' },
                      { value: 'bimonthly', label: '雙月' },
                    ]}
                  />
                </Form.Item>
                <Form.Item
                  name="starting_meter_reading"
                  label="起始電表讀數（必填）"
                  rules={[{ required: true, message: '請輸入起始電表讀數；0 也是有效值。' }]}
                >
                  <InputNumber min={0} precision={0} className="form-number-input" />
                </Form.Item>
                <Form.Item name="notes" label="租約備註">
                  <Input.TextArea rows={3} />
                </Form.Item>
              </Card>
              <Alert
                type="info"
                showIcon
                message="文件與附件將由 P2 接手"
                description="入住後的租客與租約附件不在本流程上傳；P2 roadmap #33 會承接 real upload 與文件補齊。"
              />
              <Space wrap>
                <Button onClick={onClose}>取消</Button>
                <Button type="primary" htmlType="submit" loading={submitting} disabled={submitting}>
                  建立租約
                </Button>
              </Space>
            </Form>
          </>
        )}
      </Space>
    </Drawer>
  );
}

function OccupiedRoomHub({
  propertyId,
  roomId,
  state,
  canForceTerminate,
  canReplaceLease,
  onRetry,
  onClose,
}: OccupiedRoomHubProps) {
  const hubTitle = '出租中房間 Hub';

  if (state.status === 'inconsistent') {
    return (
      <Drawer title={hubTitle} open onClose={onClose} width={760}>
        <Alert
          type="warning"
          showIcon
          message="房間狀態與租約資料不一致"
          description="此房間看起來是出租中，但目前查不到有效租約。請重新整理；系統不會把它當成空房。"
          action={
            <Space wrap>
              <Button onClick={onClose}>關閉</Button>
              <Button type="primary" onClick={onRetry}>重新整理</Button>
            </Space>
          }
        />
      </Drawer>
    );
  }

  if (state.status === 'forbidden') {
    return (
      <Drawer title={hubTitle} open onClose={onClose} width={760}>
        <Alert type="error" showIcon message="沒有權限查看此房間租約脈絡。" />
      </Drawer>
    );
  }

  if (state.status === 'not-found') {
    return (
      <Drawer title={hubTitle} open onClose={onClose} width={760}>
        <Alert type="warning" showIcon message="找不到此房間的租約或租客資料。" />
      </Drawer>
    );
  }

  if (state.status === 'error') {
    return (
      <Drawer title={hubTitle} open onClose={onClose} width={760}>
        <RetryableErrorState onRetry={onRetry} />
      </Drawer>
    );
  }

  if (state.status !== 'ready') {
    return null;
  }

  const { lease, tenant, bills, billsStatus } = state.data;
  const rentBills = bills?.data ?? [];
  const defaultHistoryPeriod = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);

  return (
    <Drawer
      title={hubTitle}
      open
      onClose={onClose}
      width={760}
      extra={
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={onRetry}>重新整理</Button>
        </Space>
      }
    >
      <Space direction="vertical" size={16} className="page-stack">
        <Descriptions column={{ xs: 1, md: 2 }} size="small">
          <Descriptions.Item label="房間">{getOptionalText(lease.room_label) || roomId}</Descriptions.Item>
          <Descriptions.Item label="租客">{getOptionalText(tenant?.name ?? lease.tenant_label)}</Descriptions.Item>
          <Descriptions.Item label="租客電話">{getOptionalText(tenant?.phone)}</Descriptions.Item>
          <Descriptions.Item label="租約狀態">
            <Tag color={getStatusColor(lease.status)}>{getLeaseStatusLabel(lease.status)}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="租約期間">{getDateRange(lease.start_date, lease.end_date)}</Descriptions.Item>
          <Descriptions.Item label="租金">
            {getMoneyText(lease.rent_amount)} / {getCadenceLabel(lease.rent_billing_cadence)}
          </Descriptions.Item>
          <Descriptions.Item label="押金">
            {getMoneyText(lease.deposit_amount)} / {getDepositStatusLabel(lease.deposit_status)}
          </Descriptions.Item>
          <Descriptions.Item label="備註" span={2}>{getOptionalText(lease.notes)}</Descriptions.Item>
        </Descriptions>

        <Card size="small" title="租金帳單摘要">
          {billsStatus === 'loading' && (
            <LoadingState />
          )}
          {billsStatus === 'error' && (
            <Alert
              type="error"
              showIcon
              message="租金帳單暫時無法讀取"
              description="租客與租約摘要仍可使用，請稍後重新整理帳單資料。"
              action={<Button onClick={onRetry}>重新整理</Button>}
            />
          )}
          {billsStatus === 'ready' && rentBills.length > 0 && (
            <Table
              rowKey={(record) => record.id ?? `${record.due_date}-${record.amount}`}
              dataSource={rentBills}
              pagination={false}
              scroll={{ x: 760 }}
              columns={[
                {
                  title: '期別',
                  dataIndex: 'period_label',
                  width: 160,
                  render: (value: string | null | undefined) => getOptionalText(value),
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
                  render: (value: number | null | undefined) => getMoneyText(value),
                },
                {
                  title: '狀態',
                  dataIndex: 'status',
                  width: 120,
                  render: (value: string | null | undefined) => (
                    <Tag color={getStatusColor(value)}>{getBillStatusLabel(value)}</Tag>
                  ),
                },
              ]}
            />
          )}
          {billsStatus === 'ready' && rentBills.length === 0 && (
            <Empty description="目前沒有租金帳單資料。" />
          )}
        </Card>

        <Card size="small" title="工作入口">
          <div className="property-link-grid">
            {propertyId && lease.tenant_id && (
              <WorkflowLink
                title="租客詳情"
                description="前往租客 detail/edit 預留頁；實際維護流程由 #53 承接。"
                path={buildPropertyPath(propertyId, `/tenants/${lease.tenant_id}`, buildActionQuery({
                  roomId: lease.room_id,
                  leaseId: lease.id,
                }))}
              />
            )}
            {propertyId && lease.id && (
              <WorkflowLink
                title="租約詳情"
                description="前往租約 detail/edit 預留頁；租金調整由 #53 承接。"
                path={buildPropertyPath(propertyId, `/leases/${lease.id}`, buildActionQuery({
                  roomId: lease.room_id,
                  tenantId: lease.tenant_id,
                }))}
              />
            )}
            {propertyId && lease.id && (
              <WorkflowLink
                title="收款與收據"
                description="前往帳務入口並帶租約脈絡；付款與收據流程不屬於 #51。"
                path={buildPropertyPath(propertyId, '/billing', buildActionQuery({
                  roomId: lease.room_id,
                  leaseId: lease.id,
                  tenantId: lease.tenant_id,
                  view: 'rent-payment',
                }))}
              />
            )}
            {propertyId && lease.id && (
              <WorkflowLink
                title="退租結算"
                description="從此租約建立正常退租試算，完成後可匯出結算書。"
                path={buildPropertyPath(propertyId, '/tenants', buildActionQuery({
                  roomId: lease.room_id,
                  leaseId: lease.id,
                  tenantId: lease.tenant_id,
                  view: 'hub',
                  mode: 'checkout',
                }))}
              />
            )}
            {propertyId && lease.id && canReplaceLease && (
              <WorkflowLink
                title="租約更換"
                description="續約、週期變更或重發合約，會以新租約承接舊租約條件。"
                icon={<SwapOutlined />}
                path={buildPropertyPath(propertyId, `/leases/${lease.id}/replace`)}
              />
            )}
            {propertyId && lease.id && !canReplaceLease && (
              <div className="property-link-row disabled-link-row">
                <Space size={12} align="start">
                  <span className="property-link-icon"><SwapOutlined /></span>
                  <span>
                    <Typography.Text strong>租約更換</Typography.Text>
                    <Typography.Text type="secondary">目前角色不可執行租約更換；後端仍會再次檢查權限。</Typography.Text>
                  </span>
                </Space>
              </div>
            )}
            {propertyId && lease.id && canForceTerminate && (
              <WorkflowLink
                title="強制退租"
                description="特殊危險流程；送出前會重新載入租約並要求確認。"
                icon={<WarningOutlined />}
                path={buildPropertyPath(propertyId, '/tenants', buildActionQuery({
                  roomId: lease.room_id,
                  leaseId: lease.id,
                  tenantId: lease.tenant_id,
                  view: 'hub',
                  mode: 'force',
                }))}
              />
            )}
            {propertyId && lease.id && !canForceTerminate && (
              <div className="property-link-row disabled-link-row">
                <Space size={12} align="start">
                  <span className="property-link-icon"><WarningOutlined /></span>
                  <span>
                    <Typography.Text strong>強制退租</Typography.Text>
                    <Typography.Text type="secondary">目前角色不可執行強制退租；後端仍會再次檢查權限。</Typography.Text>
                  </span>
                </Space>
              </div>
            )}
            {propertyId && lease.room_id && (
              <Link
                className="property-link-row"
                to={buildPropertyPath(propertyId, '/billing', buildActionQuery({
                  roomId: lease.room_id,
                  leaseId: lease.id,
                }))}
              >
                <Space size={12} align="start">
                  <span className="property-link-icon"><AuditOutlined /></span>
                  <span>
                    <Typography.Text strong>抄表與帳單</Typography.Text>
                    <Typography.Text type="secondary">前往帳務工作區，實際抄表/帳單流程由 #54/#55 承接。</Typography.Text>
                  </span>
                </Space>
              </Link>
            )}
            {propertyId && lease.room_id && (
              <Link
                className="property-link-row"
                to={buildPropertyPath(propertyId, '/billing/meter-history', buildActionQuery({
                  roomId: lease.room_id,
                  year: String(defaultHistoryPeriod.getFullYear()),
                  month: String(defaultHistoryPeriod.getMonth() + 1),
                }))}
              >
                <Space size={12} align="start">
                  <span className="property-link-icon"><HistoryOutlined /></span>
                  <span>
                    <Typography.Text strong>抄表歷史</Typography.Text>
                    <Typography.Text type="secondary">前往此房間的電表歷史，內容由 #55 承接。</Typography.Text>
                  </span>
                </Space>
              </Link>
            )}
            {propertyId && lease.room_id && (
              <Link
                className="property-link-row"
                to={buildPropertyPath(propertyId, '/journal', { roomId: lease.room_id })}
              >
                <Space size={12} align="start">
                  <span className="property-link-icon"><ToolOutlined /></span>
                  <span>
                    <Typography.Text strong>日誌與維修</Typography.Text>
                    <Typography.Text type="secondary">前往日誌/維修工作區，實際 lifecycle 由 #57/#58 承接。</Typography.Text>
                  </span>
                </Space>
              </Link>
            )}
            {propertyId && (
              <Link className="property-link-row" to={buildPropertyPath(propertyId, '/reports')}>
                <Space size={12} align="start">
                  <span className="property-link-icon"><FileTextOutlined /></span>
                  <span>
                    <Typography.Text strong>報表與匯出</Typography.Text>
                    <Typography.Text type="secondary">前往報表入口；runtime HTML preview 由 #56 承接。</Typography.Text>
                  </span>
                </Space>
              </Link>
            )}
          </div>
        </Card>
      </Space>
    </Drawer>
  );
}

type WorkflowLinkProps = {
  title: string;
  description: string;
  path: string;
  icon?: ReactNode;
};

function WorkflowLink({ title, description, path, icon = <TeamOutlined /> }: WorkflowLinkProps) {
  return (
    <Link className="property-link-row" to={path}>
      <Space size={12} align="start">
        <span className="property-link-icon">{icon}</span>
        <span>
          <Typography.Text strong>{title}</Typography.Text>
          <Typography.Text type="secondary">{description}</Typography.Text>
        </span>
      </Space>
    </Link>
  );
}
