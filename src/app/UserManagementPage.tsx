import { EyeOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Drawer,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { TableColumnsType, TablePaginationConfig } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ApiError,
  classifyApiErrorForUi,
  createUser,
  listUsers,
  type CreateUserRequest,
  type User,
  type UserList,
  type UserRole,
  type UiErrorState,
} from '../api';
import { getRoleLabel, useAuth } from '../auth';
import {
  EmptyState,
  ForbiddenState,
  LoadingState,
  RetryableErrorState,
} from './routeState';
import { getMutationSuccessFeedback } from './operation';
import { abortRequest } from './requestAbort';
import {
  getUserDisplayName,
  getUserEmail,
  getUserFormErrorState,
  userRoleOptions,
} from './userManagement';

type UserListLoadState =
  | { status: 'loading'; response: null }
  | { status: 'ready'; response: UserList }
  | { status: 'forbidden'; response: null }
  | { status: 'error'; response: null };

type CreateUserFormValues = {
  email: string;
  name: string;
  role: UserRole;
};

const defaultPage = 1;
const defaultLimit = 20;
const limitOptions = [10, 20, 50, 100].map((value) => ({ value, label: `${value} 筆` }));

function getMembersReturnTo(pathname: string, search: string) {
  return `/login?reason=session-expired&returnTo=${encodeURIComponent(`${pathname}${search}`)}`;
}

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseRole(value: string | null): UserRole | undefined {
  return userRoleOptions.some((option) => option.value === value) ? value as UserRole : undefined;
}

function getCreateFailureMessage(errorState: UiErrorState) {
  if (errorState.kind === 'forbidden') {
    return '目前角色沒有權限建立此成員。';
  }

  if (errorState.kind === 'conflict') {
    return '此 email 已被使用，請改用其他 email。';
  }

  return errorState.description;
}

function buildCreatePayload(values: CreateUserFormValues): CreateUserRequest {
  return {
    email: values.email.trim(),
    name: values.name.trim(),
    role: values.role,
  };
}

export default function UserManagementPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { message } = AntdApp.useApp();
  const { currentUser, getAccessToken } = useAuth();
  const [createForm] = Form.useForm<CreateUserFormValues>();
  const activeRequestRef = useRef<{
    id: number;
    controller: AbortController;
  } | null>(null);
  const requestIdRef = useRef(0);
  const [loadState, setLoadState] = useState<UserListLoadState>({
    status: 'loading',
    response: null,
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const currentRole = currentUser?.role;
  const canCreateUser = currentRole === 'admin' || currentRole === 'organizer';
  const createRoleOptions = currentRole === 'organizer'
    ? userRoleOptions.filter((option) => option.value === 'owner')
    : userRoleOptions;
  const defaultCreateRole: UserRole = currentRole === 'organizer' ? 'owner' : 'staff';
  const emptyDescription = canCreateUser
    ? '請調整角色篩選或新增成員。'
    : '請調整角色篩選，或聯絡系統管理員新增成員。';

  const filters = useMemo(() => ({
    role: parseRole(searchParams.get('role')),
    page: parsePositiveInt(searchParams.get('page'), defaultPage),
    limit: parsePositiveInt(searchParams.get('limit'), defaultLimit),
  }), [searchParams]);

  const replaceQuery = useCallback((next: Partial<typeof filters>) => {
    const merged = { ...filters, ...next };
    const params = new URLSearchParams();

    if (merged.role) {
      params.set('role', merged.role);
    }
    if (merged.page !== defaultPage) {
      params.set('page', String(merged.page));
    }
    if (merged.limit !== defaultLimit) {
      params.set('limit', String(merged.limit));
    }

    navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
  }, [filters, location.pathname, navigate]);

  const loadUsers = useCallback(() => {
    abortRequest(activeRequestRef.current?.controller);
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    activeRequestRef.current = { id: requestId, controller };
    setLoadState({ status: 'loading', response: null });

    void listUsers(getAccessToken, filters, { signal: controller.signal })
      .then((response) => {
        if (activeRequestRef.current?.id !== requestId) {
          return;
        }

        setLoadState({ status: 'ready', response });
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
          navigate(getMembersReturnTo(location.pathname, location.search), { replace: true });
          return;
        }

        if (errorState.kind === 'forbidden') {
          setLoadState({ status: 'forbidden', response: null });
          return;
        }

        setLoadState({ status: 'error', response: null });
      });
  }, [filters, getAccessToken, location.pathname, location.search, navigate]);

  useEffect(() => {
    loadUsers();

    return () => abortRequest(activeRequestRef.current?.controller);
  }, [loadUsers]);

  const handleCreate = useCallback(async (values: CreateUserFormValues) => {
    setCreating(true);
    setCreateError(null);

    try {
      const payload = buildCreatePayload({
        ...values,
        role: currentRole === 'organizer' ? 'owner' : values.role,
      });
      const createdUser = await createUser(payload, getAccessToken);
      const feedback = getMutationSuccessFeedback('成員建立');
      void message.success(feedback.content);
      setDrawerOpen(false);
      createForm.resetFields();
      if (createdUser.id) {
        navigate(`/admin/members/${createdUser.id}`);
      } else {
        void message.warning('成員已建立，但回應缺少詳情頁識別資料，已留在列表供重新確認。');
        loadUsers();
      }
    } catch (error) {
      const errorState = classifyApiErrorForUi(error);

      if (errorState.kind === 'unauthorized') {
        navigate(getMembersReturnTo(location.pathname, location.search), { replace: true });
        return;
      }

      const formError = getUserFormErrorState(error);

      if (formError.fields.length > 0) {
        createForm.setFields(formError.fields.map((field) => ({
          ...field,
          name: field.name as keyof CreateUserFormValues,
        })));
      }

      if (error instanceof ApiError && [400, 409, 422].includes(error.status)) {
        setCreateError(getCreateFailureMessage(errorState));
        return;
      }

      setCreateError(errorState.description);
    } finally {
      setCreating(false);
    }
  }, [createForm, currentRole, getAccessToken, loadUsers, location.pathname, location.search, message, navigate]);

  const columns: TableColumnsType<User> = [
    {
      title: '成員',
      width: 280,
      render: (_value, record) => (
        <div className="table-cell-stack">
          <Typography.Text strong>{getUserDisplayName(record)}</Typography.Text>
          <Typography.Text type="secondary">{getUserEmail(record)}</Typography.Text>
        </div>
      ),
    },
    {
      title: '角色',
      width: 160,
      render: (_value, record) => <Tag color="blue">{getRoleLabel(record.role)}</Tag>,
    },
    {
      title: '可管理物業',
      width: 160,
      render: (_value, record) => (
        <Typography.Text>{record.assigned_property_ids?.length ?? 0} 筆</Typography.Text>
      ),
    },
    {
      title: '操作',
      width: 140,
      fixed: 'right',
      render: (_value, record) => {
        if (!record.id) {
          return <Tag color="warning">缺少識別資料</Tag>;
        }

        return (
          <Button type="link" icon={<EyeOutlined />}>
            <Link to={`/admin/members/${record.id}`}>查看詳情</Link>
          </Button>
        );
      },
    },
  ];

  if (loadState.status === 'loading') {
    return <LoadingState />;
  }

  if (loadState.status === 'forbidden') {
    return <ForbiddenState />;
  }

  if (loadState.status === 'error') {
    return <RetryableErrorState onRetry={() => loadUsers()} />;
  }

  const users = loadState.response.data ?? [];
  const pagination = loadState.response.pagination;
  const tablePagination: TablePaginationConfig = {
    current: pagination?.page ?? filters.page,
    pageSize: pagination?.limit ?? filters.limit,
    total: pagination?.total ?? users.length,
    showSizeChanger: true,
    pageSizeOptions: limitOptions.map((option) => String(option.value)),
    showTotal: (total) => `共 ${total} 筆`,
    onChange: (page, pageSize) => replaceQuery({ page, limit: pageSize }),
  };

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="page-header">
        <div>
          <Space size={8} wrap>
            <Tag color="blue">管理</Tag>
            <Tag>成員與權限</Tag>
          </Space>
          <Typography.Title level={1}>成員與權限</Typography.Title>
          <Typography.Paragraph type="secondary">
            查看工作室成員、建立帳號並進入詳情調整權限。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={() => loadUsers()}>
            重新整理
          </Button>
          {canCreateUser ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => {
              setCreateError(null);
              createForm.resetFields();
              setDrawerOpen(true);
            }}
            >
              新增成員
            </Button>
          ) : (
            <Space size={8} wrap>
              <Button disabled icon={<PlusOutlined />}>新增成員</Button>
              <Typography.Text type="secondary">目前角色僅能查看成員列表。</Typography.Text>
            </Space>
          )}
        </Space>
      </div>

      <div className="filter-toolbar">
        <Space size={12} wrap>
          <div className="filter-field">
            <Typography.Text type="secondary">角色</Typography.Text>
            <Select
              allowClear
              className="member-role-filter"
              aria-label="角色篩選"
              placeholder="全部角色"
              value={filters.role}
              options={userRoleOptions}
              onChange={(role) => replaceQuery({ role, page: defaultPage })}
            />
          </div>
          <div className="filter-field">
            <Typography.Text type="secondary">每頁筆數</Typography.Text>
            <Select
              className="member-limit-filter"
              aria-label="每頁筆數"
              value={filters.limit}
              options={limitOptions}
              onChange={(limit) => replaceQuery({ limit, page: defaultPage })}
            />
          </div>
        </Space>
      </div>

      {users.length === 0 ? (
        <EmptyState
          title="目前沒有符合條件的成員"
          description={emptyDescription}
          action={<Button onClick={() => replaceQuery({ role: undefined, page: defaultPage })}>清除篩選</Button>}
        />
      ) : (
        <Card title="成員列表" extra={<Tag>{pagination?.total ?? users.length} 筆成員</Tag>}>
          <Table
            rowKey={(record, index) => record.id ?? record.email ?? `user-${index}`}
            columns={columns}
            dataSource={users}
            pagination={tablePagination}
            scroll={{ x: 740 }}
            locale={{ emptyText: '目前沒有符合條件的成員。' }}
          />
        </Card>
      )}

      <Drawer
        title="新增成員"
        width={420}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnClose
        footer={(
          <Space className="drawer-footer-actions">
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" loading={creating} onClick={() => createForm.submit()}>
              建立並寄出設定信
            </Button>
          </Space>
        )}
      >
        {createError && (
          <Alert
            className="form-alert"
            type="error"
            showIcon
            message="建立成員失敗"
            description={createError}
          />
        )}
        <Form
          form={createForm}
          layout="vertical"
          initialValues={{ role: defaultCreateRole }}
          onFinish={(values) => void handleCreate(values)}
        >
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: '請輸入 email。' },
              { type: 'email', message: '請輸入有效的 email。' },
            ]}
          >
            <Input autoComplete="email" />
          </Form.Item>
          <Form.Item
            name="name"
            label="顯示名稱"
            rules={[{ required: true, whitespace: true, message: '請輸入顯示名稱。' }]}
          >
            <Input autoComplete="name" />
          </Form.Item>
          <Form.Item
            name="role"
            label="角色"
            rules={[{ required: true, message: '請選擇角色。' }]}
          >
            <Select options={createRoleOptions} />
          </Form.Item>
          <Alert
            type="info"
            showIcon
            message="不需設定密碼"
            description="後端會建立帳號並寄出設定密碼信。"
          />
        </Form>
      </Drawer>
    </Space>
  );
}
