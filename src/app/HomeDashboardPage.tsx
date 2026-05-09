import { ReloadOutlined } from '@ant-design/icons';
import { Button, Card, Col, Progress, Row, Space, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { classifyApiErrorForUi, getDashboard, type HomeDashboard } from '../api';
import { useAuth } from '../auth';
import {
  EmptyState,
  ForbiddenState,
  LoadingState,
  RetryableErrorState,
} from './routeState';
import {
  formatDashboardDateTime,
  formatPercent,
  formatTwd,
  getJournalTypeLabel,
} from './format';

type DashboardLoadState =
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: HomeDashboard }
  | { status: 'forbidden'; data: null }
  | { status: 'error'; data: null };

function isDashboardEmpty(data: HomeDashboard) {
  return data.portfolio_summary.total_rooms === 0
    && data.monthly_billing_summary.expected_rent === 0
    && data.monthly_billing_summary.collected_rent === 0
    && data.monthly_billing_summary.overdue_bill_count === 0
    && data.property_summaries.length === 0
    && data.recent_journals.length === 0;
}

function getCollectionCountLabel(count: number, label: string) {
  return `${count} ${label}`;
}

export default function HomeDashboardPage() {
  const navigate = useNavigate();
  const { getAccessToken } = useAuth();
  const activeRequestRef = useRef<{
    id: number;
    controller: AbortController;
  } | null>(null);
  const requestIdRef = useRef(0);
  const [loadState, setLoadState] = useState<DashboardLoadState>({
    status: 'loading',
    data: null,
  });

  const loadDashboard = useCallback(() => {
    activeRequestRef.current?.controller.abort();
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    activeRequestRef.current = { id: requestId, controller };

    setLoadState({ status: 'loading', data: null });

    void getDashboard(getAccessToken, { signal: controller.signal })
      .then((data) => {
        if (activeRequestRef.current?.id !== requestId) {
          return;
        }

        setLoadState({ status: 'ready', data });
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
          navigate('/login?reason=session-expired&returnTo=/', { replace: true });
          return;
        }

        if (errorState.kind === 'forbidden') {
          setLoadState({ status: 'forbidden', data: null });
          return;
        }

        setLoadState({ status: 'error', data: null });
      });
  }, [getAccessToken, navigate]);

  useEffect(() => {
    loadDashboard();

    return () => activeRequestRef.current?.controller.abort();
  }, [loadDashboard]);

  if (loadState.status === 'loading') {
    return <LoadingState />;
  }

  if (loadState.status === 'forbidden') {
    return <ForbiddenState />;
  }

  if (loadState.status === 'error') {
    return <RetryableErrorState onRetry={() => loadDashboard()} />;
  }

  const { data } = loadState;

  if (isDashboardEmpty(data)) {
    return (
      <EmptyState
        title="目前沒有可顯示的營運資料"
        description="授權範圍內尚無物業、房間、帳務或日誌摘要。"
        action={<Button onClick={() => loadDashboard()}>重新整理</Button>}
      />
    );
  }

  const propertyColumns: TableColumnsType<HomeDashboard['property_summaries'][number]> = [
    {
      title: '物業',
      dataIndex: 'property_name',
      width: 220,
      render: (_value, record) => (
        <div>
          <Typography.Text strong>{record.property_name}</Typography.Text>
        </div>
      ),
    },
    {
      title: '出租率',
      width: 96,
      render: (_value, record) => (
        <Tag color="green">{formatPercent(record.occupancy_summary.occupancy_rate)}</Tag>
      ),
    },
    {
      title: '房間狀態',
      width: 220,
      render: (_value, record) => {
        const summary = record.occupancy_summary;

        return `${summary.occupied_rooms} 出租中 / ${summary.vacant_rooms} 空房 / ${summary.maintenance_rooms} 維修`;
      },
    },
    {
      title: '預期租金',
      width: 140,
      align: 'right',
      render: (_value, record) => formatTwd(record.monthly_billing_summary.expected_rent),
    },
    {
      title: '已收租金',
      width: 140,
      align: 'right',
      render: (_value, record) => formatTwd(record.monthly_billing_summary.collected_rent),
    },
    {
      title: '逾期',
      width: 88,
      render: (_value, record) => {
        const count = record.monthly_billing_summary.overdue_bill_count;

        return (
          <Tag color={count > 0 ? 'red' : 'default'}>
            {getCollectionCountLabel(count, '筆')}
          </Tag>
        );
      },
    },
  ];

  const portfolio = data.portfolio_summary;
  const billing = data.monthly_billing_summary;

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="page-header">
        <div>
          <Space size={8} wrap>
            <Tag color="blue">總覽</Tag>
            <Tag>營運摘要</Tag>
          </Space>
          <Typography.Title level={1}>工作台</Typography.Title>
          <Typography.Paragraph type="secondary">
            查看授權範圍內的出租狀態、本月帳務摘要、物業概況與近期日誌。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={() => loadDashboard()}>
            重新整理
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <Card className="dashboard-metric-card">
            <Typography.Text type="secondary">房間總數</Typography.Text>
            <Typography.Title level={2}>{portfolio.total_rooms}</Typography.Title>
            <Typography.Text type="secondary">授權物業範圍內</Typography.Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card className="dashboard-metric-card">
            <div className="metric-card-heading">
              <Typography.Text type="secondary">出租率</Typography.Text>
              <Tag color="green">出租中 {portfolio.occupied_rooms}</Tag>
            </div>
            <Typography.Title level={2}>{formatPercent(portfolio.occupancy_rate)}</Typography.Title>
            <Progress
              percent={Math.round(portfolio.occupancy_rate * 100)}
              showInfo={false}
              size="small"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card className="dashboard-metric-card">
            <Typography.Text type="secondary">本月預期租金</Typography.Text>
            <Typography.Title level={2}>{formatTwd(billing.expected_rent)}</Typography.Title>
            <Typography.Text type="secondary">
              已收 {formatTwd(billing.collected_rent)}
            </Typography.Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card className="dashboard-metric-card">
            <div className="metric-card-heading">
              <Typography.Text type="secondary">逾期帳單</Typography.Text>
              <Tag color={billing.overdue_bill_count > 0 ? 'red' : 'default'}>
                {billing.overdue_bill_count > 0 ? '需追蹤' : '無逾期'}
              </Tag>
            </div>
            <Typography.Title level={2}>{billing.overdue_bill_count}</Typography.Title>
            <Typography.Text type="secondary">本月帳務摘要</Typography.Text>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} align="top">
        <Col xs={24} xl={16}>
          <Card
            title="物業摘要"
            extra={<Tag>{getCollectionCountLabel(data.property_summaries.length, '筆物業')}</Tag>}
          >
            <Table
              rowKey="property_id"
              columns={propertyColumns}
              dataSource={data.property_summaries}
              pagination={false}
              scroll={{ x: 860 }}
              locale={{
                emptyText: '目前沒有可顯示的物業摘要。',
              }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <Card title="近期日誌">
            {data.recent_journals.length === 0 ? (
              <EmptyState
                title="目前沒有近期日誌"
                description="授權範圍內尚無近期日誌或維修紀錄。"
              />
            ) : (
              <Space direction="vertical" size={12} className="dashboard-journal-list">
                {data.recent_journals.map((item) => (
                  <div className="dashboard-journal-item" key={item.id}>
                    <Space size={8} wrap className="dashboard-journal-meta">
                      <Tag color={item.type === 'repair_request' ? 'orange' : 'blue'}>
                        {getJournalTypeLabel(item.type)}
                      </Tag>
                      <Typography.Text type="secondary">
                        {formatDashboardDateTime(item.created_at)}
                      </Typography.Text>
                    </Space>
                    <Typography.Text strong>{item.content}</Typography.Text>
                    <Typography.Text type="secondary">{item.property_name}</Typography.Text>
                  </div>
                ))}
              </Space>
            )}
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
