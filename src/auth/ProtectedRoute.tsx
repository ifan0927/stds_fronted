import type { ReactNode } from 'react';
import { Alert, Button, Result, Space } from 'antd';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LoadingState, RetryableErrorState } from '../app/routeState';
import { useAuth } from './AuthContext';

type ProtectedRouteProps = {
  children?: ReactNode;
};

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation();
  const { status, logout, retrySync } = useAuth();
  const returnTo = encodeURIComponent(`${location.pathname}${location.search}`);

  if (status === 'loading' || status === 'syncing') {
    return <LoadingState />;
  }

  if (status === 'unauthenticated' || status === 'invalid-session') {
    const reason = status === 'invalid-session' ? '&reason=session-expired' : '';
    return <Navigate to={`/login?returnTo=${returnTo}${reason}`} replace />;
  }

  if (status === 'config-error') {
    return (
      <main className="public-page">
        <Result
          status="error"
          title="登入設定尚未完成"
          subTitle="系統目前無法啟動登入流程，請聯絡管理員確認部署設定。"
          extra={<Alert type="warning" showIcon message="請聯絡管理員確認登入設定。" />}
        />
      </main>
    );
  }

  if (status === 'account-not-found') {
    return (
      <main className="public-page">
        <Result
          status="403"
          title="帳號尚未開通"
          subTitle="此登入帳號尚未建立後台使用權限，請聯絡管理員。"
          extra={
            <Space wrap>
              <Button onClick={() => void logout()}>登出</Button>
            </Space>
          }
        />
      </main>
    );
  }

  if (status === 'retryable-sync-error') {
    return <RetryableErrorState onRetry={() => void retrySync()} />;
  }

  return children ?? <Outlet />;
}
