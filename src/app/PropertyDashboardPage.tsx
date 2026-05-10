import {
  AuditOutlined,
  BankOutlined,
  FileTextOutlined,
  ReloadOutlined,
  TeamOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Progress,
  Row,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  classifyApiErrorForUi,
  getProperty,
  getPropertyDashboard,
  type Property,
  type PropertyDashboard,
} from '../api';
import { useAuth } from '../auth';
import {
  ForbiddenState,
  LoadingState,
  NotFoundState,
  RetryableErrorState,
} from './routeState';
import {
  formatDashboardDateTime,
  formatPercent,
  formatTwd,
  getReadableJournalTypeLabel,
  getRoomStatusLabel,
} from './format';
import { abortRequest } from './requestAbort';

type PropertyDashboardLoadState =
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: { property: Property; dashboard: PropertyDashboard } }
  | { status: 'forbidden'; data: null }
  | { status: 'not-found'; data: null }
  | { status: 'error'; data: null };

type PropertyRoom = NonNullable<PropertyDashboard['rooms']>[number];

function getOptionalText(value: string | null | undefined) {
  return value && value.trim().length > 0 ? value : '未提供';
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

function getFacilityLabels(facilities: Property['facilities']) {
  if (!facilities || typeof facilities !== 'object') {
    return [];
  }

  return Object.entries(facilities)
    .filter(([, value]) => value !== false && value !== null && value !== undefined && value !== '')
    .map(([key, value]) => {
      if (value === true) {
        return key;
      }

      if (typeof value === 'string' || typeof value === 'number') {
        return `${key}: ${value}`;
      }

      return key;
    });
}

function getRoomStatusColor(status: PropertyRoom['status']) {
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

function getOverdueSummary(count: number | undefined) {
  if (count === undefined) {
    return {
      color: 'default',
      label: '未提供',
      value: '未提供',
    };
  }

  return {
    color: count > 0 ? 'red' : 'default',
    label: count > 0 ? '需追蹤' : '無逾期',
    value: count,
  };
}

function getPropertyReturnTo(pathname: string) {
  return `/login?reason=session-expired&returnTo=${encodeURIComponent(pathname)}`;
}

export default function PropertyDashboardPage() {
  const { propertyId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { getAccessToken } = useAuth();
  const activeRequestRef = useRef<{
    id: number;
    controller: AbortController;
  } | null>(null);
  const requestIdRef = useRef(0);
  const [loadState, setLoadState] = useState<PropertyDashboardLoadState>({
    status: 'loading',
    data: null,
  });

  const loadPropertyDashboard = useCallback(() => {
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

    void Promise.all([
      getProperty(propertyId, getAccessToken, { signal: controller.signal }),
      getPropertyDashboard(propertyId, getAccessToken, { signal: controller.signal }),
    ])
      .then(([property, dashboard]) => {
        if (activeRequestRef.current?.id !== requestId) {
          return;
        }

        setLoadState({ status: 'ready', data: { property, dashboard } });
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

        if (errorState.kind === 'not-found') {
          setLoadState({ status: 'not-found', data: null });
          return;
        }

        setLoadState({ status: 'error', data: null });
      });
  }, [getAccessToken, location.pathname, navigate, propertyId]);

  useEffect(() => {
    loadPropertyDashboard();

    return () => abortRequest(activeRequestRef.current?.controller);
  }, [loadPropertyDashboard]);

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
    return <RetryableErrorState onRetry={() => loadPropertyDashboard()} />;
  }

  const { property, dashboard } = loadState.data;
  const occupancy = dashboard.occupancy_summary ?? property.occupancy_summary;
  const monthlySummary = dashboard.monthly_summary;
  const rooms = dashboard.rooms ?? [];
  const recentJournals = dashboard.recent_journals ?? [];
  const facilityLabels = getFacilityLabels(property.facilities);
  const propertyName = property.name ?? '物業詳情';
  const propertyAddress = getOptionalText(property.address);
  const overdueSummary = getOverdueSummary(monthlySummary?.overdue_bill_count);
  const roomColumns: TableColumnsType<PropertyRoom> = [
    {
      title: '房間',
      dataIndex: 'name',
      width: 180,
      render: (value: PropertyRoom['name']) => (
        <div>
          <Typography.Text strong>{getOptionalText(value)}</Typography.Text>
        </div>
      ),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      width: 112,
      render: (status: PropertyRoom['status']) => (
        <Tag color={getRoomStatusColor(status)}>{getRoomStatusLabel(status)}</Tag>
      ),
    },
  ];
  const childLinks = [
    {
      title: '房間管理',
      description: '查看目前物業的房間清單與房間狀態。',
      path: `/properties/${propertyId}/rooms`,
      icon: <BankOutlined />,
    },
    {
      title: '租客與租約',
      description: '進入租客資料與租約工作流。',
      path: `/properties/${propertyId}/tenants`,
      icon: <TeamOutlined />,
    },
    {
      title: '抄表與帳單',
      description: '進入抄表、帳單與收款入口。',
      path: `/properties/${propertyId}/billing`,
      icon: <AuditOutlined />,
    },
    {
      title: '日誌與維修',
      description: '查看營運日誌與維修紀錄入口。',
      path: `/properties/${propertyId}/journal`,
      icon: <ToolOutlined />,
    },
    {
      title: '報表中心',
      description: '進入報表查詢與匯出入口。',
      path: `/properties/${propertyId}/reports`,
      icon: <FileTextOutlined />,
    },
  ];

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="page-header">
        <div>
          <Space size={8} wrap>
            <Tag color="blue">目前物業</Tag>
          </Space>
          <Typography.Title level={1}>{propertyName}</Typography.Title>
          <Typography.Paragraph type="secondary">
            {property.subtitle ? `${property.subtitle} · ${propertyAddress}` : propertyAddress}
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Button>
            <Link to="/properties">回物業列表</Link>
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => loadPropertyDashboard()}>
            重新整理
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <Card className="dashboard-metric-card">
            <Typography.Text type="secondary">房間總數</Typography.Text>
            <Typography.Title level={2}>{occupancy?.total_rooms ?? '未提供'}</Typography.Title>
            <Typography.Text type="secondary">系統提供的出租摘要</Typography.Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card className="dashboard-metric-card">
            <div className="metric-card-heading">
              <Typography.Text type="secondary">出租率</Typography.Text>
              <Tag color="green">出租中 {occupancy?.occupied_rooms ?? 0}</Tag>
            </div>
            <Typography.Title level={2}>
              {occupancy ? formatPercent(occupancy.occupancy_rate) : '未提供'}
            </Typography.Title>
            {occupancy && (
              <Progress
                percent={Math.round(occupancy.occupancy_rate * 100)}
                showInfo={false}
                size="small"
              />
            )}
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card className="dashboard-metric-card">
            <Typography.Text type="secondary">本月預期租金</Typography.Text>
            <Typography.Title level={2}>
              {monthlySummary?.expected_rent !== undefined
                ? formatTwd(monthlySummary.expected_rent)
                : '未提供'}
            </Typography.Title>
            <Typography.Text type="secondary">
              已收 {monthlySummary?.collected_rent !== undefined
                ? formatTwd(monthlySummary.collected_rent)
                : '未提供'}
            </Typography.Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card className="dashboard-metric-card">
            <div className="metric-card-heading">
              <Typography.Text type="secondary">逾期帳單</Typography.Text>
              <Tag color={overdueSummary.color}>{overdueSummary.label}</Tag>
            </div>
            <Typography.Title level={2}>{overdueSummary.value}</Typography.Title>
            <Typography.Text type="secondary">本月帳務摘要</Typography.Text>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} align="top">
        <Col xs={24} xl={15}>
          <Space direction="vertical" size={16} className="page-stack">
            <Card title="物業基本資料">
              <Descriptions column={{ xs: 1, md: 2 }} size="small">
                <Descriptions.Item label="物業名稱">{propertyName}</Descriptions.Item>
                <Descriptions.Item label="副標">{getOptionalText(property.subtitle)}</Descriptions.Item>
                <Descriptions.Item label="地址" span={2}>{propertyAddress}</Descriptions.Item>
                <Descriptions.Item label="聯絡電話">
                  {getOptionalText(property.contact_phone)}
                </Descriptions.Item>
                <Descriptions.Item label="聯絡信箱">
                  {getOptionalText(property.contact_email)}
                </Descriptions.Item>
                <Descriptions.Item label="電費單價">
                  {property.electricity_unit_price !== null && property.electricity_unit_price !== undefined
                    ? `${property.electricity_unit_price} 元 / 度`
                    : '未提供'}
                </Descriptions.Item>
                <Descriptions.Item label="預設電費週期">
                  {getBillingCadenceLabel(property.default_electricity_billing_cadence)}
                </Descriptions.Item>
                <Descriptions.Item label="備註" span={2}>{getOptionalText(property.notes)}</Descriptions.Item>
              </Descriptions>
              <div className="property-facilities">
                <Typography.Text type="secondary">常用設施</Typography.Text>
                <Space size={[8, 8]} wrap>
                  {facilityLabels.length > 0
                    ? facilityLabels.map((label) => <Tag key={label}>{label}</Tag>)
                    : <Typography.Text>未提供</Typography.Text>}
                </Space>
              </div>
            </Card>

            <Card title="房間狀態" extra={<Tag>{rooms.length} 間</Tag>}>
              {rooms.length > 0 ? (
                <Table
                  rowKey={(record) => record.id ?? record.name ?? 'room'}
                  columns={roomColumns}
                  dataSource={rooms}
                  pagination={false}
                  scroll={{ x: 420 }}
                  locale={{
                    emptyText: '目前沒有可顯示的房間。',
                  }}
                />
              ) : (
                <Empty description="目前沒有可顯示的房間。" />
              )}
            </Card>
          </Space>
        </Col>

        <Col xs={24} xl={9}>
          <Space direction="vertical" size={16} className="page-stack">
            <Card title="工作入口">
              <div className="property-link-grid">
                {childLinks.map((item) => (
                  <Link className="property-link-row" to={item.path} key={item.path}>
                    <Space size={12} align="start">
                      <span className="property-link-icon">{item.icon}</span>
                      <span>
                        <Typography.Text strong>{item.title}</Typography.Text>
                        <Typography.Text type="secondary">{item.description}</Typography.Text>
                      </span>
                    </Space>
                  </Link>
                ))}
              </div>
            </Card>

            <Card title="近期日誌">
              {recentJournals.length > 0 ? (
                <Space direction="vertical" size={12} className="dashboard-journal-list">
                  {recentJournals.map((item) => (
                    <div className="dashboard-journal-item" key={item.id ?? item.created_at ?? item.content}>
                      <Space size={8} wrap className="dashboard-journal-meta">
                        <Tag color={item.type === 'repair_request' ? 'orange' : 'blue'}>
                          {getReadableJournalTypeLabel(item.type)}
                        </Tag>
                        <Typography.Text type="secondary">
                          {item.created_at ? formatDashboardDateTime(item.created_at) : '時間未提供'}
                        </Typography.Text>
                      </Space>
                      <Typography.Text strong>{getOptionalText(item.content)}</Typography.Text>
                    </div>
                  ))}
                </Space>
              ) : (
                <Empty description="目前沒有近期日誌。" />
              )}
            </Card>
          </Space>
        </Col>
      </Row>

      {!dashboard.rooms && !dashboard.monthly_summary && !dashboard.occupancy_summary && !dashboard.recent_journals && (
        <Alert
          type="info"
          showIcon
          message="目前沒有營運摘要"
          description="系統尚未提供此物業的營運摘要區塊，頁面僅顯示物業基本資料。"
        />
      )}

      {!property.id && (
        <Alert
          type="warning"
          showIcon
          message="物業資料不完整"
          description="後端回應缺少可識別的物業資料，請重新整理後再試。"
        />
      )}
    </Space>
  );
}
