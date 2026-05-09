import {
  AuditOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  TeamOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Empty,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { TableColumnsType, TablePaginationConfig } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  classifyApiErrorForUi,
  listPropertyRooms,
  type Room,
  type RoomList,
  type RoomStatus,
} from '../api';
import { useAuth } from '../auth';
import { formatTwd, getRoomStatusLabel } from './format';
import { abortRequest } from './requestAbort';
import {
  ForbiddenState,
  LoadingState,
  NotFoundState,
  RetryableErrorState,
} from './routeState';

type RoomInventoryLoadState =
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: RoomList }
  | { status: 'forbidden'; data: null }
  | { status: 'not-found'; data: null }
  | { status: 'error'; data: null };

const defaultPage = 1;
const defaultLimit = 20;
const limitOptions = [20, 50, 100] as const;
const roomStatusOptions: Array<{ value: RoomStatus; label: string }> = [
  { value: 'vacant', label: '空房' },
  { value: 'occupied', label: '出租中' },
  { value: 'maintenance', label: '維修中' },
];
const roomStatusFilterOptions: Array<{ value: RoomStatus | 'all'; label: string }> = [
  { value: 'all', label: '全部房況' },
  ...roomStatusOptions,
];

function getPropertyReturnTo(pathname: string, search: string) {
  return `/login?reason=session-expired&returnTo=${encodeURIComponent(`${pathname}${search}`)}`;
}

function getOptionalText(value: string | null | undefined) {
  return value && value.trim().length > 0 ? value : '未提供';
}

function getOptionalNumberText(value: number | null | undefined, suffix: string) {
  return value === null || value === undefined ? '未提供' : `${value}${suffix}`;
}

function getRoomStatusColor(status: Room['status']) {
  if (status === 'occupied') {
    return 'green';
  }

  if (status === 'maintenance') {
    return 'orange';
  }

  if (status === 'vacant') {
    return 'blue';
  }

  return 'default';
}

function getValidStatus(value: string | null): RoomStatus | undefined {
  return roomStatusOptions.some((option) => option.value === value) ? (value as RoomStatus) : undefined;
}

function getPositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getValidLimit(value: string | null) {
  const parsed = getPositiveInteger(value, defaultLimit);
  return limitOptions.includes(parsed as (typeof limitOptions)[number]) ? parsed : defaultLimit;
}

function buildRoomActionPath(propertyId: string, suffix: string, query?: Record<string, string>) {
  const searchParams = new URLSearchParams(query);
  const search = searchParams.toString();
  return `/properties/${encodeURIComponent(propertyId)}${suffix}${search ? `?${search}` : ''}`;
}

export default function RoomInventoryPage() {
  const { propertyId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { getAccessToken } = useAuth();
  const activeRequestRef = useRef<{
    id: number;
    controller: AbortController;
  } | null>(null);
  const requestIdRef = useRef(0);
  const [loadState, setLoadState] = useState<RoomInventoryLoadState>({
    status: 'loading',
    data: null,
  });

  const status = getValidStatus(searchParams.get('status'));
  const page = getPositiveInteger(searchParams.get('page'), defaultPage);
  const limit = getValidLimit(searchParams.get('limit'));

  const setRoomQuery = useCallback((next: { status?: RoomStatus; page?: number; limit?: number }) => {
    setSearchParams((previous) => {
      const updated = new URLSearchParams(previous);
      const nextStatus = next.status;
      const nextPage = next.page ?? defaultPage;
      const nextLimit = next.limit ?? limit;

      if (nextStatus) {
        updated.set('status', nextStatus);
      } else {
        updated.delete('status');
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

  const loadRooms = useCallback(() => {
    if (!propertyId) {
      setLoadState({ status: 'not-found', data: null });
      return;
    }

    abortRequest(activeRequestRef.current?.controller);
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    activeRequestRef.current = { id: requestId, controller };

    setLoadState({ status: 'loading', data: null });

    void listPropertyRooms(
      propertyId,
      getAccessToken,
      { status, page, limit },
      { signal: controller.signal },
    )
      .then((response) => {
        if (activeRequestRef.current?.id !== requestId) {
          return;
        }

        setLoadState({ status: 'ready', data: response });
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
          navigate(getPropertyReturnTo(location.pathname, location.search), { replace: true });
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
  }, [getAccessToken, limit, location.pathname, location.search, navigate, page, propertyId, status]);

  useEffect(() => {
    loadRooms();

    return () => abortRequest(activeRequestRef.current?.controller);
  }, [loadRooms]);

  const columns = useMemo<TableColumnsType<Room>>(() => [
    {
      title: '房間',
      dataIndex: 'name',
      width: 190,
      render: (value: Room['name'], record) => (
        <div className="table-cell-stack">
          <Typography.Text strong>{getOptionalText(value)}</Typography.Text>
          <Typography.Text type="secondary">
            房型：{getOptionalText(record.room_type)}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      width: 120,
      render: (value: Room['status']) => (
        <Tag color={getRoomStatusColor(value)}>{getRoomStatusLabel(value)}</Tag>
      ),
    },
    {
      title: '坪數 / 樓層 / 區域',
      width: 200,
      render: (_, record) => (
        <Typography.Text>
          {getOptionalNumberText(record.size, ' 坪')} / {getOptionalText(record.floor)} / {getOptionalText(record.zone)}
        </Typography.Text>
      ),
    },
    {
      title: '預設租金',
      dataIndex: 'default_rent_amount',
      width: 140,
      align: 'right',
      render: (value: Room['default_rent_amount']) => (
        <Typography.Text>{value === null || value === undefined ? '未提供' : formatTwd(value)}</Typography.Text>
      ),
    },
    {
      title: '備註',
      dataIndex: 'notes',
      width: 260,
      ellipsis: true,
      render: (value: Room['notes']) => <Typography.Text>{getOptionalText(value)}</Typography.Text>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 310,
      fixed: 'right',
      render: (_, record) => {
        const roomId = record.id;

        if (!propertyId || !roomId) {
          return <Typography.Text type="secondary">缺少房間識別</Typography.Text>;
        }

        return (
          <Space size={8} wrap className="row-action-stack">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(buildRoomActionPath(propertyId, `/rooms/${roomId}`))}
            >
              查看
            </Button>
            {record.status === 'vacant' && (
              <Button
                size="small"
                icon={<TeamOutlined />}
                onClick={() => navigate(buildRoomActionPath(propertyId, '/tenants', { roomId, mode: 'move-in' }))}
              >
                搬入
              </Button>
            )}
            <Button
              size="small"
              icon={<AuditOutlined />}
              onClick={() => navigate(buildRoomActionPath(propertyId, '/billing', { roomId }))}
            >
              帳單
            </Button>
            <Button
              size="small"
              icon={<ToolOutlined />}
              onClick={() => navigate(buildRoomActionPath(propertyId, '/journal', { roomId }))}
            >
              日誌維修
            </Button>
          </Space>
        );
      },
    },
  ], [navigate, propertyId]);

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
    return <RetryableErrorState onRetry={() => loadRooms()} />;
  }

  const rooms = loadState.data.data ?? [];
  const pagination = loadState.data.pagination;
  const currentPage = pagination?.page ?? page;
  const currentLimit = pagination?.limit ?? limit;
  const total = pagination?.total ?? rooms.length;
  const totalPages = pagination?.total_pages ?? 1;

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="page-header">
        <div>
          <Space size={8} wrap>
            <Tag color="blue">房間管理</Tag>
            <Tag>目前物業</Tag>
          </Space>
          <Typography.Title level={1}>房間清冊</Typography.Title>
          <Typography.Paragraph type="secondary">
            查看目前物業的房間狀態、基本資料與相鄰工作流入口。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Button onClick={() => navigate(propertyId ? `/properties/${propertyId}` : '/properties')}>
            回物業工作台
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => loadRooms()}>
            重新整理
          </Button>
          {propertyId && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate(`/properties/${propertyId}/rooms/new`)}
            >
              新增房間
            </Button>
          )}
        </Space>
      </div>

      <Card>
        <Space direction="vertical" size={16} className="page-stack">
          <div className="filter-toolbar">
            <Space size={12} wrap>
              <div className="filter-field">
                <Typography.Text type="secondary">房況</Typography.Text>
                <Select
                  aria-label="房況"
                  className="room-status-filter"
                  value={status ?? 'all'}
                  options={roomStatusFilterOptions}
                  onChange={(value: RoomStatus | 'all') => setRoomQuery({
                    status: value === 'all' ? undefined : value,
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
                  onChange={(value) => setRoomQuery({ status, page: defaultPage, limit: value })}
                />
              </div>
            </Space>
            <Button onClick={() => setRoomQuery({ page: defaultPage, limit: defaultLimit })}>
              清除篩選
            </Button>
          </div>

          <Table
            rowKey={(record) => record.id ?? `${record.name}-${record.floor}-${record.zone}`}
            columns={columns}
            dataSource={rooms}
            scroll={{ x: 1220 }}
            pagination={{
              current: currentPage,
              pageSize: currentLimit,
              total,
              showSizeChanger: false,
              showTotal: (count) => `共 ${count} 間，第 ${currentPage} / ${totalPages} 頁`,
            }}
            onChange={(tablePagination: TablePaginationConfig) => {
              setRoomQuery({
                status,
                page: tablePagination.current ?? defaultPage,
                limit: tablePagination.pageSize ?? limit,
              });
            }}
            locale={{
              emptyText: (
                <Empty
                  description={status ? '此房況目前沒有房間。' : '目前沒有可顯示的房間。'}
                />
              ),
            }}
          />
        </Space>
      </Card>
    </Space>
  );
}
