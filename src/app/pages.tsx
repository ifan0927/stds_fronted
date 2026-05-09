import { FirebaseError } from 'firebase/app';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Form, Input, Result, Row, Space, Tag, Typography } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  EmptyState,
  ForbiddenState,
  LoadingState,
  NotFoundState,
  RetryableErrorState,
} from './routeState';
import {
  getLoginViewState,
  getSafeReturnTo,
  shouldShowSessionExpiredNotice,
  useAuth,
} from '../auth';

const pageContent = {
  dashboard: {
    title: '工作台',
    description: '顯示營運摘要、近期事件與常用入口；實際資料會在後續 API foundation 接上。',
    tag: '總覽',
  },
  properties: {
    title: '物業管理',
    description: '管理物業清單與物業層級入口；此階段僅保留 route 與 shell 位置。',
    tag: '管理',
  },
  propertyDashboard: {
    title: '物業工作台',
    description: '物業 context 由 route 決定，後續頁面不應只依賴側邊切換器。',
    tag: '目前物業',
  },
  rooms: {
    title: '房間管理',
    description: '房間、設備與狀態工作流的入口 placeholder。',
    tag: '日常作業',
  },
  tenants: {
    title: '租客與租約',
    description: '租客資料、租約與搬遷流程的入口 placeholder。',
    tag: '日常作業',
  },
  tenantDetail: {
    title: '租客詳情',
    description: '租客 detail/edit 將由後續 issue 實作；此頁先保留導覽入口與路由位置。',
    tag: '租客與租約',
  },
  leaseDetail: {
    title: '租約詳情',
    description: '租約 detail/edit 與租金調整將由後續 issue 實作；此頁先保留導覽入口與路由位置。',
    tag: '租客與租約',
  },
  checkout: {
    title: '退租處理',
    description: '退租、checkout preview/finalize 與相關結算流程將由後續 issue 實作。',
    tag: '租客與租約',
  },
  billing: {
    title: '抄表與帳單',
    description: '抄表、帳單、收款與收據流程的入口 placeholder。',
    tag: '日常作業',
  },
  journal: {
    title: '日誌與維修',
    description: '營運日誌與維修單工作流的入口 placeholder。',
    tag: '日常作業',
  },
  reports: {
    title: '財務報表',
    description: '報表查詢與 runtime HTML export 行為的入口 placeholder。',
    tag: '報表',
  },
} as const;

type PageKey = keyof typeof pageContent;

type PlaceholderPageProps = {
  pageKey: PageKey;
};

export function PlaceholderPage({ pageKey }: PlaceholderPageProps) {
  const content = pageContent[pageKey];

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="page-header">
        <div>
          <Space size={8} wrap>
            <Tag color="blue">{content.tag}</Tag>
            <Tag>Foundation</Tag>
          </Space>
          <Typography.Title level={1}>{content.title}</Typography.Title>
          <Typography.Paragraph type="secondary">{content.description}</Typography.Paragraph>
        </div>
        <Space wrap>
          <Button>重新整理</Button>
          <Button type="primary">主要動作</Button>
        </Space>
      </div>

      <Card>
        <Typography.Title level={2}>Route 狀態樣式</Typography.Title>
        <Typography.Paragraph type="secondary">
          此頁只建立 shell 與可重用的視覺語言。真實 API、授權與錯誤碼映射會由後續 foundation issues 接上。
        </Typography.Paragraph>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12} xl={6}>
            <div className="state-sample">
              <LoadingState />
            </div>
          </Col>
          <Col xs={24} md={12} xl={6}>
            <EmptyState
              title="目前沒有資料"
              description="列表頁應說明空狀態原因，並保留可用的下一步。"
              action={<Button>清除篩選</Button>}
            />
          </Col>
          <Col xs={24} md={12} xl={6}>
            <RetryableErrorState />
          </Col>
          <Col xs={24} md={12} xl={6}>
            <ForbiddenState />
          </Col>
        </Row>
      </Card>
    </Space>
  );
}

function getLoginErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    if (
      error.code === 'auth/invalid-credential'
      || error.code === 'auth/user-not-found'
      || error.code === 'auth/wrong-password'
    ) {
      return '電子信箱或密碼不正確，請確認後再試一次。';
    }

    if (error.code === 'auth/too-many-requests') {
      return '登入嘗試次數過多，請稍後再試。';
    }
  }

  return '登入暫時無法完成，請稍後再試。';
}

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, logout, retrySync, status } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const returnTo = getSafeReturnTo(searchParams.get('returnTo'));
  const sessionExpired = shouldShowSessionExpiredNotice(
    status,
    searchParams.get('reason') === 'session-expired',
  );
  const loginViewState = getLoginViewState(status);

  useEffect(() => {
    if (status === 'authenticated') {
      navigate(returnTo, { replace: true });
    }
  }, [navigate, returnTo, status]);

  if (status === 'authenticated') {
    return null;
  }

  if (loginViewState === 'account-not-found') {
    return (
      <main className="public-page">
        <Result
          status="403"
          title="帳號尚未開通"
          subTitle="此登入帳號尚未建立後台使用權限，請聯絡管理員。"
          extra={<Button onClick={() => void logout()}>登出</Button>}
        />
      </main>
    );
  }

  if (loginViewState === 'retryable-sync-error') {
    return (
      <main className="public-page">
        <Result
          status="error"
          title="登入同步失敗"
          subTitle="帳號狀態暫時無法確認，請稍後重試。"
          extra={
            <Space wrap>
              <Button onClick={() => void logout()}>登出</Button>
              <Button type="primary" onClick={() => void retrySync()}>
                重試
              </Button>
            </Space>
          }
        />
      </main>
    );
  }

  if (loginViewState === 'config-error') {
    return (
      <main className="public-page">
        <Result
          status="error"
          title="登入設定尚未完成"
          subTitle="系統目前無法啟動登入流程，請聯絡管理員確認部署設定。"
        />
      </main>
    );
  }

  return (
    <main className="public-page">
      <Card className="public-panel">
        <Typography.Title level={1}>STDS 管理後台</Typography.Title>
        <Typography.Paragraph type="secondary">
          請使用已開通的後台帳號登入。
        </Typography.Paragraph>
        <Space direction="vertical" size={16} className="login-stack">
          {sessionExpired && (
            <Alert
              type="warning"
              showIcon
              message="登入狀態已失效"
              description="請重新登入後繼續使用。"
            />
          )}
          {submitError && (
            <Alert
              type="error"
              showIcon
              message="登入失敗"
              description={submitError}
            />
          )}
          <Form
            layout="vertical"
            requiredMark={false}
            onFinish={(values: { email: string; password: string }) => {
              setSubmitError(null);
              void login(values.email, values.password).catch((error: unknown) => {
                setSubmitError(getLoginErrorMessage(error));
              });
            }}
          >
            <Form.Item
              label="電子信箱"
              name="email"
              rules={[
                { required: true, message: '請輸入電子信箱。' },
                { type: 'email', message: '請輸入有效的電子信箱。' },
              ]}
            >
              <Input autoComplete="username" />
            </Form.Item>
            <Form.Item
              label="密碼"
              name="password"
              rules={[{ required: true, message: '請輸入密碼。' }]}
            >
              <Input.Password autoComplete="current-password" />
            </Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={status === 'syncing'}
              block
            >
              登入
            </Button>
          </Form>
        </Space>
      </Card>
    </main>
  );
}

export function ForbiddenPage() {
  return (
    <main className="public-page">
      <ForbiddenState />
    </main>
  );
}

export function NotFoundPage() {
  return (
    <main className="public-page">
      <NotFoundState />
    </main>
  );
}
