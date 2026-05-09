import type { ReactNode } from 'react';
import { Button, Empty, Result, Space, Spin, Typography } from 'antd';
import { Link } from 'react-router-dom';

type RouteStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

type RetryableErrorStateProps = {
  onRetry?: () => void;
};

export function LoadingState() {
  return (
    <div className="route-state route-state-panel">
      <Spin size="large" />
      <Typography.Title level={3}>載入中</Typography.Title>
      <Typography.Text type="secondary">正在準備頁面內容，請稍候。</Typography.Text>
    </div>
  );
}

export function EmptyState({ title, description, action }: RouteStateProps) {
  return (
    <div className="route-state-panel">
      <Empty description={title}>
        <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>
        {action}
      </Empty>
    </div>
  );
}

export function RetryableErrorState({ onRetry }: RetryableErrorStateProps) {
  return (
    <Result
      status="error"
      title="頁面載入失敗"
      subTitle="資料暫時無法讀取，請稍後重試。"
      extra={
        <Space wrap>
          <Button>
            <Link to="/">回工作台</Link>
          </Button>
          {onRetry && (
            <Button type="primary" onClick={onRetry}>
              重試
            </Button>
          )}
        </Space>
      }
    />
  );
}

export function ForbiddenState() {
  return (
    <Result
      status="403"
      title="沒有權限查看此頁"
      subTitle="此頁面不在目前角色或物業授權範圍內。"
      extra={
        <Button type="primary">
          <Link to="/">回工作台</Link>
        </Button>
      }
    />
  );
}

export function NotFoundState() {
  return (
    <Result
      status="404"
      title="找不到頁面或資料"
      subTitle="請確認連結是否正確，或回到工作台重新選擇。"
      extra={
        <Button type="primary">
          <Link to="/">回工作台</Link>
        </Button>
      }
    />
  );
}
