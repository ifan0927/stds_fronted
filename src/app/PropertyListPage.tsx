import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PaperClipOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { Alert, App as AntdApp, Button, Card, Drawer, Modal, Progress, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, classifyApiErrorForUi, deleteProperty, listProperties, type Property } from '../api';
import { useAuth } from '../auth';
import {
  EmptyState,
  ForbiddenState,
  LoadingState,
  RetryableErrorState,
} from './routeState';
import { formatPercent } from './format';
import { abortRequest } from './requestAbort';
import { PropertyAttachmentManager } from './attachments';

type PropertyListLoadState =
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: Property[] }
  | { status: 'forbidden'; data: null }
  | { status: 'error'; data: null };

const unitPriceFormatter = new Intl.NumberFormat('zh-TW', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

function getOptionalText(value: string | null | undefined) {
  return value && value.trim().length > 0 ? value : '未提供';
}

function getPropertyDisplayName(property: Property) {
  return property.name?.trim() || property.address?.trim() || '未命名物業';
}

function getBillingCadenceLabel(value: Property['default_electricity_billing_cadence']) {
  if (value === 'monthly') {
    return '每月';
  }

  if (value === 'bimonthly') {
    return '雙月';
  }

  return '未提供';
}

function getElectricityUnitPriceLabel(value: Property['electricity_unit_price']) {
  if (value === null || value === undefined) {
    return '未提供';
  }

  return `NT$${unitPriceFormatter.format(value)} / 度`;
}

function getOccupancyTagColor(rate: number) {
  if (rate >= 0.8) {
    return 'green';
  }

  if (rate >= 0.5) {
    return 'gold';
  }

  return 'blue';
}

function getPropertyReturnTo(pathname: string) {
  return `/login?reason=session-expired&returnTo=${encodeURIComponent(pathname)}`;
}

function getDeleteFailureMessage(error: unknown) {
  const errorState = classifyApiErrorForUi(error);

  if (errorState.kind === 'forbidden') {
    return '目前角色沒有權限刪除此物業。';
  }

  if (error instanceof ApiError && error.status === 422) {
    return '此物業仍有出租中房間或關聯資料，暫時無法刪除。請先確認房間與租約狀態後再試。';
  }

  return errorState.description;
}

export default function PropertyListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = AntdApp.useApp();
  const { currentUser, getAccessToken } = useAuth();
  const activeRequestRef = useRef<{
    id: number;
    controller: AbortController;
  } | null>(null);
  const requestIdRef = useRef(0);
  const [loadState, setLoadState] = useState<PropertyListLoadState>({
    status: 'loading',
    data: null,
  });
  const [deleteTarget, setDeleteTarget] = useState<Property | null>(null);
  const [attachmentTarget, setAttachmentTarget] = useState<Property | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const canWriteProperty = currentUser?.role === 'admin'
    || currentUser?.role === 'organizer'
    || currentUser?.role === 'staff';
  const canDeleteProperty = currentUser?.role === 'admin' || currentUser?.role === 'organizer';

  const loadProperties = useCallback(() => {
    abortRequest(activeRequestRef.current?.controller);
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    activeRequestRef.current = { id: requestId, controller };

    setLoadState({ status: 'loading', data: null });

    void listProperties(getAccessToken, { signal: controller.signal })
      .then((response) => {
        if (activeRequestRef.current?.id !== requestId) {
          return;
        }

        setLoadState({ status: 'ready', data: response.data ?? [] });
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
          navigate(getPropertyReturnTo(location.pathname), { replace: true });
          return;
        }

        if (errorState.kind === 'forbidden') {
          setLoadState({ status: 'forbidden', data: null });
          return;
        }

        setLoadState({ status: 'error', data: null });
      });
  }, [getAccessToken, location.pathname, navigate]);

  useEffect(() => {
    loadProperties();

    return () => abortRequest(activeRequestRef.current?.controller);
  }, [loadProperties]);

  const handleDeleteProperty = useCallback(async () => {
    if (!deleteTarget?.id) {
      return;
    }

    setDeleteLoading(true);
    setDeleteError(null);

    try {
      await deleteProperty(deleteTarget.id, getAccessToken);
      void message.success('物業已刪除，正在更新列表。');
      setDeleteTarget(null);
      loadProperties();
    } catch (error) {
      const errorState = classifyApiErrorForUi(error);

      if (errorState.kind === 'unauthorized') {
        navigate(getPropertyReturnTo(location.pathname), { replace: true });
        return;
      }

      setDeleteError(getDeleteFailureMessage(error));
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteTarget?.id, getAccessToken, loadProperties, location.pathname, message, navigate]);

  if (loadState.status === 'loading') {
    return <LoadingState />;
  }

  if (loadState.status === 'forbidden') {
    return <ForbiddenState />;
  }

  if (loadState.status === 'error') {
    return <RetryableErrorState onRetry={() => loadProperties()} />;
  }

  if (loadState.data.length === 0) {
    return (
      <EmptyState
        title="目前沒有可顯示的物業"
        description="此帳號的授權範圍內尚未提供物業資料，或系統目前沒有可列出的資料。"
        action={(
          <Space wrap>
            <Button onClick={() => loadProperties()}>重新整理</Button>
            <Tooltip title={canWriteProperty ? undefined : '目前角色沒有新增物業權限。'}>
              <Button type="primary" icon={<PlusOutlined />} disabled={!canWriteProperty}>
                {canWriteProperty ? <Link to="/properties/new">新增物業</Link> : '新增物業'}
              </Button>
            </Tooltip>
          </Space>
        )}
      />
    );
  }

  const columns: TableColumnsType<Property> = [
    {
      title: '物業',
      width: 240,
      render: (_value, record) => (
        <div className="table-cell-stack">
          <Typography.Text strong>{getPropertyDisplayName(record)}</Typography.Text>
          <Typography.Text type="secondary">
            副標：{getOptionalText(record.subtitle)}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: '地址 / 聯絡',
      width: 280,
      render: (_value, record) => (
        <div className="table-cell-stack">
          <Typography.Text>{getOptionalText(record.address)}</Typography.Text>
          <Typography.Text type="secondary">
            {getOptionalText(record.contact_phone)} / {getOptionalText(record.contact_email)}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: '出租概況',
      width: 220,
      render: (_value, record) => {
        const summary = record.occupancy_summary;

        if (!summary) {
          return <Tag>未提供</Tag>;
        }

        return (
          <div className="table-cell-stack">
            <Space size={8} wrap>
              <Tag color={getOccupancyTagColor(summary.occupancy_rate)}>
                出租率 {formatPercent(summary.occupancy_rate)}
              </Tag>
              <Typography.Text type="secondary">{summary.total_rooms} 間</Typography.Text>
            </Space>
            <Progress
              percent={Math.round(summary.occupancy_rate * 100)}
              showInfo={false}
              size="small"
            />
            <Typography.Text type="secondary">
              {summary.occupied_rooms} 出租中 / {summary.vacant_rooms} 空房 / {summary.maintenance_rooms} 維修中
            </Typography.Text>
          </div>
        );
      },
    },
    {
      title: '預設電費',
      width: 150,
      render: (_value, record) => (
        <div className="table-cell-stack">
          <Typography.Text>{getElectricityUnitPriceLabel(record.electricity_unit_price)}</Typography.Text>
          <Typography.Text type="secondary">
            {getBillingCadenceLabel(record.default_electricity_billing_cadence)}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: '操作',
      width: 340,
      fixed: 'right',
      render: (_value, record) => {
        if (!record.id) {
          return <Tag color="warning">物業資料不完整</Tag>;
        }

        return (
          <Space size={8} wrap>
            <Button type="primary" icon={<EyeOutlined />}>
              <Link to={`/properties/${record.id}`}>進入工作台</Link>
            </Button>
            <Button
              icon={<PaperClipOutlined />}
              onClick={() => setAttachmentTarget(record)}
            >
              附件
            </Button>
            <Tooltip title={canWriteProperty ? undefined : '目前角色沒有編輯物業權限。'}>
              <Button icon={<EditOutlined />} disabled={!canWriteProperty}>
                {canWriteProperty ? <Link to={`/properties/${record.id}/edit`}>編輯</Link> : '編輯'}
              </Button>
            </Tooltip>
            <Tooltip title={canDeleteProperty ? undefined : '目前角色沒有刪除物業權限。'}>
              <Button
                danger
                icon={<DeleteOutlined />}
                disabled={!canDeleteProperty}
                onClick={() => {
                  setDeleteError(null);
                  setDeleteTarget(record);
                }}
              >
                刪除
              </Button>
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="page-header">
        <div>
          <Space size={8} wrap>
            <Tag color="blue">管理</Tag>
            <Tag>授權物業</Tag>
          </Space>
          <Typography.Title level={1}>物業管理</Typography.Title>
          <Typography.Paragraph type="secondary">
            查看目前帳號可存取的物業、基本聯絡資料與系統提供的出租摘要。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={() => loadProperties()}>
            重新整理
          </Button>
          <Tooltip title={canWriteProperty ? undefined : '目前角色沒有新增物業權限。'}>
            <Button type="primary" icon={<PlusOutlined />} disabled={!canWriteProperty}>
              {canWriteProperty ? <Link to="/properties/new">新增物業</Link> : '新增物業'}
            </Button>
          </Tooltip>
        </Space>
      </div>

      <Alert
        type="info"
        showIcon
        message="列表依授權範圍顯示"
        description="可見物業由系統依角色與物業指派決定；出租摘要以系統資料為準。"
      />

      <Card
        title="物業列表"
        extra={<Tag>{loadState.data.length} 筆物業</Tag>}
      >
        <Table
          rowKey={(record, index) => record.id ?? record.name ?? record.address ?? `property-${index}`}
          columns={columns}
          dataSource={loadState.data}
          pagination={false}
          scroll={{ x: 1190 }}
          locale={{
            emptyText: '目前沒有可顯示的物業。',
          }}
        />
      </Card>

      <Modal
        title="確認刪除物業"
        open={Boolean(deleteTarget)}
        okText="刪除物業"
        okButtonProps={{ danger: true, loading: deleteLoading }}
        cancelText="取消"
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onOk={() => void handleDeleteProperty()}
      >
        <Space direction="vertical" size={12} className="page-stack">
          <Typography.Text>
            刪除後此物業會從一般管理列表移除；若仍有房間或其他關聯資料，系統可能拒絕刪除。
          </Typography.Text>
          <Typography.Text strong>{deleteTarget ? getPropertyDisplayName(deleteTarget) : ''}</Typography.Text>
          {deleteError && (
            <Alert
              type="error"
              showIcon
              message="刪除物業失敗"
              description={deleteError}
            />
          )}
        </Space>
      </Modal>

      <Drawer
        title={attachmentTarget ? `物業附件：${getPropertyDisplayName(attachmentTarget)}` : '物業附件'}
        open={Boolean(attachmentTarget)}
        onClose={() => setAttachmentTarget(null)}
        width={720}
        destroyOnClose
      >
        {attachmentTarget?.id && (
          <PropertyAttachmentManager
            propertyId={attachmentTarget.id}
            canMutate={canWriteProperty}
            readOnlyReason="此角色只能查看與下載物業附件。"
          />
        )}
      </Drawer>
    </Space>
  );
}
