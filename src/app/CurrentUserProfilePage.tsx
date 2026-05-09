import { ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ApiError,
  classifyApiErrorForUi,
  getCurrentUser,
  listProperties,
  updateCurrentUser,
  type CurrentUser,
  type Property,
  type UiErrorState,
} from '../api';
import { getRoleLabel, useAuth } from '../auth';
import {
  ForbiddenState,
  LoadingState,
  NotFoundState,
  RetryableErrorState,
} from './routeState';
import {
  getAccountReturnTo,
  getAccountSummaryItems,
  getDisplayName,
  getProfileFormErrorState,
  type AccountPropertyOption,
} from './accountProfile';
import { getMutationSuccessFeedback } from './operation';
import { abortRequest } from './requestAbort';

type ProfileLoadState =
  | { status: 'loading'; user: null }
  | { status: 'ready'; user: CurrentUser }
  | { status: 'forbidden'; user: null }
  | { status: 'not-found'; user: null }
  | { status: 'error'; user: null };

type PropertyContextState =
  | { status: 'idle'; options: AccountPropertyOption[] }
  | { status: 'loading'; options: AccountPropertyOption[] }
  | { status: 'ready'; options: AccountPropertyOption[] }
  | { status: 'error'; options: AccountPropertyOption[] };

type ProfileFormValues = {
  name: string;
};

function getPropertyDisplayName(property: Property) {
  return property.name?.trim() || property.address?.trim() || '未命名物業';
}

function getPropertyOptions(properties: Property[]) {
  return properties
    .filter((property): property is Property & { id: string } => typeof property.id === 'string')
    .map((property) => ({
      value: property.id,
      label: getPropertyDisplayName(property),
    }));
}

function getProfileSaveFailureMessage(errorState: UiErrorState) {
  if (errorState.kind === 'forbidden') {
    return '目前帳號沒有權限更新個人資料。';
  }

  if (errorState.kind === 'not-found') {
    return '找不到目前使用者資料，請重新登入後再試。';
  }

  return errorState.description;
}

export default function CurrentUserProfilePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = AntdApp.useApp();
  const { getAccessToken, refreshCurrentUser } = useAuth();
  const [form] = Form.useForm<ProfileFormValues>();
  const profileRequestRef = useRef<{
    id: number;
    controller: AbortController;
  } | null>(null);
  const propertyRequestRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const [loadState, setLoadState] = useState<ProfileLoadState>({
    status: 'loading',
    user: null,
  });
  const [propertyContextState, setPropertyContextState] = useState<PropertyContextState>({
    status: 'idle',
    options: [],
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sessionRefreshWarning, setSessionRefreshWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadProfile = useCallback(() => {
    abortRequest(profileRequestRef.current?.controller);
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    profileRequestRef.current = { id: requestId, controller };
    setSubmitError(null);
    setSessionRefreshWarning(null);
    setLoadState({ status: 'loading', user: null });

    void getCurrentUser(getAccessToken, { signal: controller.signal })
      .then((user) => {
        if (profileRequestRef.current?.id !== requestId) {
          return;
        }

        form.setFieldsValue({ name: user.name ?? '' });
        setLoadState({ status: 'ready', user });
      })
      .catch((error: unknown) => {
        if (profileRequestRef.current?.id !== requestId) {
          return;
        }

        const errorState = classifyApiErrorForUi(error);

        if (errorState.kind === 'cancelled') {
          return;
        }

        if (errorState.kind === 'unauthorized') {
          navigate(getAccountReturnTo(location.pathname), { replace: true });
          return;
        }

        if (errorState.kind === 'forbidden') {
          setLoadState({ status: 'forbidden', user: null });
          return;
        }

        if (errorState.kind === 'not-found') {
          setLoadState({ status: 'not-found', user: null });
          return;
        }

        setLoadState({ status: 'error', user: null });
      });
  }, [form, getAccessToken, location.pathname, navigate]);

  const loadPropertyContext = useCallback(() => {
    abortRequest(propertyRequestRef.current);
    const controller = new AbortController();
    propertyRequestRef.current = controller;
    setPropertyContextState((previous) => ({ status: 'loading', options: previous.options }));

    void listProperties(getAccessToken, { signal: controller.signal })
      .then((response) => {
        if (propertyRequestRef.current !== controller) {
          return;
        }

        setPropertyContextState({
          status: 'ready',
          options: getPropertyOptions(response.data ?? []),
        });
      })
      .catch((error: unknown) => {
        if (propertyRequestRef.current !== controller) {
          return;
        }

        const errorState = classifyApiErrorForUi(error);

        if (errorState.kind === 'cancelled') {
          return;
        }

        setPropertyContextState((previous) => ({ status: 'error', options: previous.options }));
      });
  }, [getAccessToken]);

  useEffect(() => {
    loadProfile();
    loadPropertyContext();

    return () => {
      abortRequest(profileRequestRef.current?.controller);
      abortRequest(propertyRequestRef.current);
    };
  }, [loadProfile, loadPropertyContext]);

  const handleSubmit = useCallback(async (values: ProfileFormValues) => {
    const name = values.name.trim();
    setSubmitting(true);
    setSubmitError(null);
    setSessionRefreshWarning(null);

    try {
      const updatedUser = await updateCurrentUser(getAccessToken, { name });
      let visibleUser = updatedUser;

      try {
        const refreshedUser = await refreshCurrentUser();
        visibleUser = refreshedUser ?? updatedUser;
      } catch {
        setSessionRefreshWarning('名稱已儲存，但頁首帳號資料暫時無法同步。請重新整理或重新登入後確認。');
      }

      form.setFieldsValue({ name: visibleUser.name ?? '' });
      setLoadState({ status: 'ready', user: visibleUser });

      const feedback = getMutationSuccessFeedback('顯示名稱');
      void message.success(feedback.content);
    } catch (error) {
      const errorState = classifyApiErrorForUi(error);

      if (errorState.kind === 'unauthorized') {
        navigate(getAccountReturnTo(location.pathname), { replace: true });
        return;
      }

      const formError = getProfileFormErrorState(error);

      if (formError.fields.length > 0) {
        form.setFields(formError.fields.map((field) => ({
          ...field,
          name: field.name as keyof ProfileFormValues,
        })));
      }

      if (error instanceof ApiError && (error.status === 400 || error.status === 422)) {
        setSubmitError(formError.message);
        return;
      }

      setSubmitError(getProfileSaveFailureMessage(errorState));
    } finally {
      setSubmitting(false);
    }
  }, [form, getAccessToken, location.pathname, message, navigate, refreshCurrentUser]);

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
    return <RetryableErrorState onRetry={() => loadProfile()} />;
  }

  const { user } = loadState;
  const displayName = getDisplayName(user);
  const summaryItems = getAccountSummaryItems(user, propertyContextState.options);
  const roleLabel = getRoleLabel(user.role);

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="page-header">
        <div>
          <Space size={8} wrap>
            <Tag color="blue">帳號</Tag>
            <Tag color="green">{roleLabel}</Tag>
          </Space>
          <Typography.Title level={1}>我的帳號</Typography.Title>
          <Typography.Paragraph type="secondary">
            查看目前登入帳號資料、角色與可管理物業，並更新顯示名稱。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={() => {
            loadProfile();
            loadPropertyContext();
          }}
          >
            重新整理
          </Button>
        </Space>
      </div>

      {propertyContextState.status === 'error' && (
        <Alert
          type="warning"
          showIcon
          message="物業名稱暫時無法讀取"
          description="帳號資料仍可查看與更新；可管理物業會先以授權筆數顯示。"
        />
      )}

      {sessionRefreshWarning && (
        <Alert
          type="warning"
          showIcon
          message="帳號同步提醒"
          description={sessionRefreshWarning}
        />
      )}

      <Card title="帳號資料">
        <Descriptions
          bordered
          column={{ xs: 1, md: 2 }}
          items={summaryItems}
        />
      </Card>

      <Card title="更新顯示名稱">
        <Space direction="vertical" size={16} className="account-form-stack">
          <Typography.Paragraph type="secondary">
            顯示名稱會出現在頁首與操作介面；角色、電子信箱與物業授權由系統管理。
          </Typography.Paragraph>

          {submitError && (
            <Alert
              type="error"
              showIcon
              message="更新失敗"
              description={submitError}
            />
          )}

          <Form
            form={form}
            layout="vertical"
            requiredMark={false}
            initialValues={{ name: displayName }}
            onFinish={(values) => void handleSubmit(values)}
          >
            <Form.Item
              label="顯示名稱"
              name="name"
              rules={[
                { required: true, message: '請輸入顯示名稱。' },
                { whitespace: true, message: '請輸入顯示名稱。' },
                { max: 100, message: '顯示名稱不可超過 100 個字。' },
              ]}
            >
              <Input autoComplete="name" maxLength={100} showCount />
            </Form.Item>

            <Space wrap>
              <Button onClick={() => {
                form.setFieldsValue({ name: user.name ?? '' });
                setSubmitError(null);
              }}
              >
                取消
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SaveOutlined />}
                loading={submitting}
              >
                儲存名稱
              </Button>
            </Space>
          </Form>
        </Space>
      </Card>
    </Space>
  );
}
