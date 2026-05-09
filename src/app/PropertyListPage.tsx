import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Progress, Space, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { classifyApiErrorForUi, listProperties, type Property } from '../api';
import { useAuth } from '../auth';
import {
  EmptyState,
  ForbiddenState,
  LoadingState,
  RetryableErrorState,
} from './routeState';
import { formatPercent } from './format';
import { abortRequest } from './requestAbort';

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

export default function PropertyListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { getAccessToken } = useAuth();
  const activeRequestRef = useRef<{
    id: number;
    controller: AbortController;
  } | null>(null);
  const requestIdRef = useRef(0);
  const [loadState, setLoadState] = useState<PropertyListLoadState>({
    status: 'loading',
    data: null,
  });

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
        action={<Button onClick={() => loadProperties()}>重新整理</Button>}
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
      width: 300,
      fixed: 'right',
      render: (_value, record) => {
        if (!record.id) {
          return <Tag color="warning">缺少物業識別資料</Tag>;
        }

        return (
          <Space size={8} wrap>
            <Button type="primary" icon={<EyeOutlined />}>
              <Link to={`/properties/${record.id}`}>進入工作台</Link>
            </Button>
            <Button icon={<EditOutlined />}>
              <Link to={`/properties/${record.id}/edit`}>編輯</Link>
            </Button>
            <Button danger icon={<DeleteOutlined />}>
              <Link to={`/properties/${record.id}/delete`}>刪除</Link>
            </Button>
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
          <Button icon={<UploadOutlined />}>
            <Link to="/properties/attachments">匯入附件</Link>
          </Button>
          <Button type="primary" icon={<PlusOutlined />}>
            <Link to="/properties/new">新增物業</Link>
          </Button>
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
    </Space>
  );
}
