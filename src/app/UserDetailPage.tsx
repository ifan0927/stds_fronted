import {
  KeyOutlined,
  ReloadOutlined,
  SaveOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ApiError,
  assignUserProperties,
  classifyApiErrorForUi,
  getUser,
  listProperties,
  triggerUserPasswordReset,
  updateUser,
  type UiErrorState,
  type User,
  type UserRole,
} from '../api';
import { getRoleLabel, useAuth } from '../auth';
import {
  ForbiddenState,
  LoadingState,
  NotFoundState,
  RetryableErrorState,
} from './routeState';
import { getMutationSuccessFeedback } from './operation';
import { abortRequest } from './requestAbort';
import {
  getPropertyLabels,
  getPropertyOptions,
  getUserDisplayName,
  getUserEmail,
  getUserFormErrorState,
  isStudioMember,
  type PropertyOption,
  userRoleOptions,
} from './userManagement';

type UserDetailLoadState =
  | { status: 'loading'; user: null }
  | { status: 'ready'; user: User }
  | { status: 'forbidden'; user: null }
  | { status: 'not-found'; user: null }
  | { status: 'error'; user: null };

type PropertyOptionsState =
  | { status: 'idle'; options: PropertyOption[] }
  | { status: 'loading'; options: PropertyOption[] }
  | { status: 'ready'; options: PropertyOption[] }
  | { status: 'error'; options: PropertyOption[] };

type UserEditFormValues = {
  name: string;
  role: UserRole;
};

type OperationAlert = {
  type: 'error' | 'warning';
  message: string;
  description: string;
};

function getMembersReturnTo(pathname: string) {
  return `/login?reason=session-expired&returnTo=${encodeURIComponent(pathname)}`;
}

function getActionFailureMessage(errorState: UiErrorState) {
  if (errorState.kind === 'forbidden') {
    return '目前角色沒有權限執行此管理操作。';
  }

  if (errorState.kind === 'not-found') {
    return '找不到此成員，請返回列表重新確認。';
  }

  return errorState.description;
}

function buildEditPayload(values: UserEditFormValues) {
  return {
    name: values.name.trim(),
    role: values.role,
  };
}

function getAdminDisabledReason(isAdmin: boolean) {
  return isAdmin ? null : '只有系統管理員可以執行此操作。';
}

async function refreshSessionIfNeeded(
  targetUserId: string | undefined,
  currentUserId: string | undefined,
  refreshCurrentUser: () => Promise<User | null>,
  setOperationAlert: (alert: OperationAlert | null) => void,
) {
  if (!targetUserId || targetUserId !== currentUserId) {
    return;
  }

  try {
    await refreshCurrentUser();
  } catch {
    setOperationAlert({
      type: 'warning',
      message: '資料已更新，頁首帳號暫時無法同步',
      description: '請重新整理或重新登入後確認目前帳號權限。後續操作仍會再次確認權限。',
    });
  }
}

export default function UserDetailPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = AntdApp.useApp();
  const { currentUser, getAccessToken, refreshCurrentUser } = useAuth();
  const [editForm] = Form.useForm<UserEditFormValues>();
  const [assignmentForm] = Form.useForm<{ property_ids: string[] }>();
  const userRequestRef = useRef<{
    id: number;
    controller: AbortController;
  } | null>(null);
  const propertyRequestRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const [loadState, setLoadState] = useState<UserDetailLoadState>({
    status: 'loading',
    user: null,
  });
  const [propertyOptionsState, setPropertyOptionsState] = useState<PropertyOptionsState>({
    status: 'idle',
    options: [],
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [operationAlert, setOperationAlert] = useState<OperationAlert | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  const isAdmin = currentUser?.role === 'admin';
  const adminDisabledReason = getAdminDisabledReason(isAdmin);

  const loadUser = useCallback(() => {
    if (!userId) {
      setLoadState({ status: 'not-found', user: null });
      return;
    }

    abortRequest(userRequestRef.current?.controller);
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    userRequestRef.current = { id: requestId, controller };
    setEditError(null);
    setOperationAlert(null);
    setLoadState({ status: 'loading', user: null });

    void getUser(userId, getAccessToken, { signal: controller.signal })
      .then((user) => {
        if (userRequestRef.current?.id !== requestId) {
          return;
        }

        editForm.setFieldsValue({
          name: user.name ?? '',
          role: user.role ?? 'staff',
        });
        assignmentForm.setFieldsValue({
          property_ids: user.assigned_property_ids ?? [],
        });
        setLoadState({ status: 'ready', user });
      })
      .catch((error: unknown) => {
        if (userRequestRef.current?.id !== requestId) {
          return;
        }

        const errorState = classifyApiErrorForUi(error);

        if (errorState.kind === 'cancelled') {
          return;
        }

        if (errorState.kind === 'unauthorized') {
          navigate(getMembersReturnTo(location.pathname), { replace: true });
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
  }, [assignmentForm, editForm, getAccessToken, location.pathname, navigate, userId]);

  const loadProperties = useCallback(() => {
    abortRequest(propertyRequestRef.current);
    const controller = new AbortController();
    propertyRequestRef.current = controller;
    setPropertyOptionsState((previous) => ({ status: 'loading', options: previous.options }));

    void listProperties(getAccessToken, { signal: controller.signal })
      .then((response) => {
        if (propertyRequestRef.current !== controller) {
          return;
        }

        setPropertyOptionsState({
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

        setPropertyOptionsState((previous) => ({ status: 'error', options: previous.options }));
      });
  }, [getAccessToken]);

  useEffect(() => {
    loadUser();
    loadProperties();

    return () => {
      abortRequest(userRequestRef.current?.controller);
      abortRequest(propertyRequestRef.current);
    };
  }, [loadProperties, loadUser]);

  const refetchUserAfterMutation = useCallback(async () => {
    if (!userId) {
      return;
    }

    const user = await getUser(userId, getAccessToken);
    editForm.setFieldsValue({
      name: user.name ?? '',
      role: user.role ?? 'staff',
    });
    assignmentForm.setFieldsValue({
      property_ids: user.assigned_property_ids ?? [],
    });
    setLoadState({ status: 'ready', user });
  }, [assignmentForm, editForm, getAccessToken, userId]);

  const handleSaveProfile = useCallback(async (values: UserEditFormValues) => {
    if (!userId) {
      return;
    }

    setSavingProfile(true);
    setEditError(null);
    setOperationAlert(null);

    try {
      await updateUser(userId, buildEditPayload(values), getAccessToken);
      await refetchUserAfterMutation();
      await refreshSessionIfNeeded(userId, currentUser?.id, refreshCurrentUser, setOperationAlert);
      const feedback = getMutationSuccessFeedback('成員資料');
      void message.success(feedback.content);
    } catch (error) {
      const errorState = classifyApiErrorForUi(error);

      if (errorState.kind === 'unauthorized') {
        navigate(getMembersReturnTo(location.pathname), { replace: true });
        return;
      }

      const formError = getUserFormErrorState(error);
      if (formError.fields.length > 0) {
        editForm.setFields(formError.fields.map((field) => ({
          ...field,
          name: field.name as keyof UserEditFormValues,
        })));
      }

      if (error instanceof ApiError && [400, 422].includes(error.status)) {
        setEditError(getActionFailureMessage(errorState));
      } else {
        setOperationAlert({
          type: 'error',
          message: '成員資料儲存失敗',
          description: getActionFailureMessage(errorState),
        });
      }
    } finally {
      setSavingProfile(false);
    }
  }, [currentUser?.id, editForm, getAccessToken, location.pathname, message, navigate, refetchUserAfterMutation, refreshCurrentUser, userId]);

  const handleSaveAssignments = useCallback(async (values: { property_ids: string[] }) => {
    if (!userId) {
      return;
    }

    setSavingAssignments(true);
    setOperationAlert(null);

    try {
      await assignUserProperties(userId, { property_ids: values.property_ids ?? [] }, getAccessToken);
      await refetchUserAfterMutation();
      await refreshSessionIfNeeded(userId, currentUser?.id, refreshCurrentUser, setOperationAlert);
      const feedback = getMutationSuccessFeedback('物業指派');
      void message.success(feedback.content);
    } catch (error) {
      const errorState = classifyApiErrorForUi(error);

      if (errorState.kind === 'unauthorized') {
        navigate(getMembersReturnTo(location.pathname), { replace: true });
        return;
      }

      setOperationAlert({
        type: 'error',
        message: '物業指派儲存失敗',
        description: getActionFailureMessage(errorState),
      });
    } finally {
      setSavingAssignments(false);
    }
  }, [currentUser?.id, getAccessToken, location.pathname, message, navigate, refetchUserAfterMutation, refreshCurrentUser, userId]);

  const handlePasswordReset = useCallback(async () => {
    if (!userId) {
      return;
    }

    setSendingReset(true);
    setOperationAlert(null);

    try {
      await triggerUserPasswordReset(userId, getAccessToken);
      const feedback = getMutationSuccessFeedback('設定密碼信寄送');
      void message.success(feedback.content);
    } catch (error) {
      const errorState = classifyApiErrorForUi(error);

      if (errorState.kind === 'unauthorized') {
        navigate(getMembersReturnTo(location.pathname), { replace: true });
        return;
      }

      setOperationAlert({
        type: 'error',
        message: '設定密碼信寄送失敗',
        description: getActionFailureMessage(errorState),
      });
    } finally {
      setSendingReset(false);
    }
  }, [getAccessToken, location.pathname, message, navigate, userId]);

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
    return <RetryableErrorState onRetry={() => loadUser()} />;
  }

  const { user } = loadState;
  const displayName = getUserDisplayName(user);
  const propertyLabels = getPropertyLabels(
    user.assigned_property_ids,
    propertyOptionsState.options,
    propertyOptionsState.status === 'ready',
  );
  const canAssignProperties = isAdmin && isStudioMember(user.role);
  const assignmentDisabledReason = adminDisabledReason
    ?? (!isStudioMember(user.role) ? '業主帳號不適用工作室物業指派。' : null);
  const assignmentDisabled = Boolean(assignmentDisabledReason) || propertyOptionsState.status === 'error';

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="page-header">
        <div>
          <Space size={8} wrap>
            <Tag color="blue">成員</Tag>
            <Tag color="green">{getRoleLabel(user.role)}</Tag>
          </Space>
          <Typography.Title level={1}>{displayName}</Typography.Title>
          <Typography.Paragraph type="secondary">
            查看成員帳號、角色與物業指派狀態。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Button>
            <Link to="/admin/members">返回列表</Link>
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => {
            loadUser();
            loadProperties();
          }}
          >
            重新整理
          </Button>
        </Space>
      </div>

      {operationAlert && (
        <Alert
          type={operationAlert.type}
          showIcon
          message={operationAlert.message}
          description={operationAlert.description}
        />
      )}

      {propertyOptionsState.status === 'error' && (
        <Alert
          type="warning"
          showIcon
          message="物業名稱暫時無法讀取"
          description="成員詳情仍可查看；物業名稱暫時無法讀取，先以指派筆數顯示。"
        />
      )}

      <Card title="帳號摘要">
        <Descriptions
          column={{ xs: 1, md: 2 }}
          items={[
            { key: 'name', label: '顯示名稱', children: displayName },
            { key: 'email', label: 'Email', children: getUserEmail(user) },
            { key: 'role', label: '角色', children: <Tag color="blue">{getRoleLabel(user.role)}</Tag> },
            { key: 'properties', label: '可管理物業', children: propertyLabels.join('、') },
          ]}
        />
      </Card>

      <Card
        title="管理資料"
        extra={adminDisabledReason ? <Tag color="default">{adminDisabledReason}</Tag> : <Tag color="blue">限系統管理員</Tag>}
      >
        {editError && (
          <Alert
            className="form-alert"
            type="error"
            showIcon
            message="成員資料儲存失敗"
            description={editError}
          />
        )}
        {adminDisabledReason && (
          <Alert
            className="form-alert"
            type="info"
            showIcon
            message="操作未開放"
            description={adminDisabledReason}
          />
        )}
        <Form form={editForm} layout="vertical" onFinish={(values) => void handleSaveProfile(values)}>
          <div className="member-form-grid">
            <Form.Item
              name="name"
              label="顯示名稱"
              rules={[{ required: true, whitespace: true, message: '請輸入顯示名稱。' }]}
            >
              <Input disabled={!isAdmin} />
            </Form.Item>
            <Form.Item
              name="role"
              label="角色"
              rules={[{ required: true, message: '請選擇角色。' }]}
            >
              <Select disabled={!isAdmin} options={userRoleOptions} />
            </Form.Item>
          </div>
          <Space className="form-footer-actions">
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={savingProfile}
              disabled={!isAdmin}
              onClick={() => editForm.submit()}
            >
              儲存成員資料
            </Button>
            <Button
              icon={<KeyOutlined />}
              loading={sendingReset}
              disabled={!isAdmin}
              onClick={() => void handlePasswordReset()}
            >
              重寄設定密碼信
            </Button>
          </Space>
        </Form>
      </Card>

      <Card
        title="物業指派"
        extra={assignmentDisabledReason ? <Tag color="default">{assignmentDisabledReason}</Tag> : <Tag color="blue">限系統管理員</Tag>}
      >
        {assignmentDisabledReason && (
          <Alert
            className="form-alert"
            type="info"
            showIcon
            message="操作未開放"
            description={assignmentDisabledReason}
          />
        )}
        <Form form={assignmentForm} layout="vertical" onFinish={(values) => void handleSaveAssignments(values)}>
          {propertyOptionsState.status === 'ready' ? (
            <Form.Item name="property_ids" label="可管理物業">
              <Select
                mode="multiple"
                allowClear
                showSearch
                optionFilterProp="label"
                className="full-width-control"
                placeholder="選擇物業"
                disabled={assignmentDisabled}
                options={propertyOptionsState.options}
              />
            </Form.Item>
          ) : (
            <Alert
              className="form-alert"
              type={propertyOptionsState.status === 'error' ? 'warning' : 'info'}
              showIcon
              message={propertyOptionsState.status === 'error' ? '物業名稱暫時無法讀取' : '物業名稱載入中'}
              description={propertyOptionsState.status === 'error'
                ? `此成員目前有 ${user.assigned_property_ids?.length ?? 0} 筆物業指派；物業名稱載入失敗，請稍後重試。`
                : '物業指派欄位會在可讀名稱載入後顯示。'}
            />
          )}
          <Space className="form-footer-actions">
            <Button
              type="primary"
              icon={<TeamOutlined />}
              loading={savingAssignments}
              disabled={!canAssignProperties || propertyOptionsState.status !== 'ready'}
              onClick={() => assignmentForm.submit()}
            >
              儲存物業指派
            </Button>
          </Space>
        </Form>
      </Card>
    </Space>
  );
}
