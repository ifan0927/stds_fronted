import { PlusOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ApiError,
  classifyApiErrorForUi,
  createProperty,
  createUser,
  getFormErrorState,
  getProperty,
  listUsers,
  updateProperty,
  type CreateUserRequest,
  type Property,
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
  buildCreatePropertyRequest,
  buildUpdatePropertyRequest,
  getPropertyInitialFormValues,
  propertyBillingCadenceOptions,
  type PropertyFormValues,
} from './propertyForm';

type OwnerCreateFormValues = {
  email: string;
  name: string;
};

type PropertyRouteState =
  | { status: 'loading'; property: null }
  | { status: 'ready'; property: Property | null }
  | { status: 'forbidden'; property: null }
  | { status: 'not-found'; property: null }
  | { status: 'error'; property: null };

type OwnerOptionsState =
  | { status: 'loading'; owners: User[] }
  | { status: 'ready'; owners: User[] }
  | { status: 'error'; owners: User[] };

const propertyFieldMap: Record<string, keyof PropertyFormValues> = {
  VALIDATION_NAME_REQUIRED: 'name',
  VALIDATION_PROPERTY_PUBLIC_NAME_REQUIRED: 'property_public_name',
  VALIDATION_ADDRESS_REQUIRED: 'address',
  VALIDATION_ELECTRICITY_PRICE_REQUIRED: 'electricity_unit_price',
  VALIDATION_ELECTRICITY_PRICE_INVALID: 'electricity_unit_price',
  VALIDATION_DEFAULT_ELECTRICITY_BILLING_CADENCE_REQUIRED: 'default_electricity_billing_cadence',
  VALIDATION_OWNER_ID_REQUIRED: 'owner_id',
  VALIDATION_CONTACT_EMAIL_INVALID: 'contact_email',
};

function getPropertyReturnTo(pathname: string) {
  return `/login?reason=session-expired&returnTo=${encodeURIComponent(pathname)}`;
}

function getOwnerDisplayName(owner: User) {
  return owner.name?.trim() || owner.email?.trim() || '未命名業主';
}

function buildOwnerPayload(values: OwnerCreateFormValues): CreateUserRequest {
  return {
    email: values.email.trim(),
    name: values.name.trim(),
    role: 'owner',
  };
}

export default function PropertyMasterDataPage() {
  const { propertyId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = AntdApp.useApp();
  const { currentUser, getAccessToken } = useAuth();
  const [form] = Form.useForm<PropertyFormValues>();
  const [ownerForm] = Form.useForm<OwnerCreateFormValues>();
  const isEditMode = Boolean(propertyId);
  const currentRole = currentUser?.role;
  const canSubmitProperty = currentRole === 'admin'
    || currentRole === 'organizer'
    || currentRole === 'staff';
  const canCreateOwner = currentRole === 'admin' || currentRole === 'organizer';
  const canEditElectricityDefaults = !isEditMode || currentRole !== 'staff';
  const activeRequestRef = useRef<{
    id: number;
    controller: AbortController;
  } | null>(null);
  const ownerRequestRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const [routeState, setRouteState] = useState<PropertyRouteState>({
    status: 'loading',
    property: null,
  });
  const [ownerState, setOwnerState] = useState<OwnerOptionsState>({
    status: 'loading',
    owners: [],
  });
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [ownerDrawerOpen, setOwnerDrawerOpen] = useState(false);
  const [ownerCreateLoading, setOwnerCreateLoading] = useState(false);
  const [ownerCreateError, setOwnerCreateError] = useState<string | null>(null);

  const ownerOptions = useMemo(() => ownerState.owners
    .filter((owner): owner is User & { id: string } => typeof owner.id === 'string')
    .map((owner) => ({
      value: owner.id,
      label: getOwnerDisplayName(owner),
    })), [ownerState.owners]);

  const loadOwners = useCallback((selectedOwnerId?: string) => {
    abortRequest(ownerRequestRef.current);
    const controller = new AbortController();
    ownerRequestRef.current = controller;
    setOwnerState((previous) => ({ status: 'loading', owners: previous.owners }));

    return listUsers(getAccessToken, { role: 'owner' as UserRole, page: 1, limit: 100 }, { signal: controller.signal })
      .then((response) => {
        if (ownerRequestRef.current !== controller) {
          return;
        }

        const owners = response.data ?? [];
        setOwnerState({ status: 'ready', owners });

        if (selectedOwnerId) {
          form.setFieldValue('owner_id', selectedOwnerId);
        }
      })
      .catch((error: unknown) => {
        if (ownerRequestRef.current !== controller) {
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

        setOwnerState((previous) => ({ status: 'error', owners: previous.owners }));
      });
  }, [form, getAccessToken, location.pathname, navigate]);

  const loadProperty = useCallback(() => {
    abortRequest(activeRequestRef.current?.controller);
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    activeRequestRef.current = { id: requestId, controller };

    if (!isEditMode) {
      setRouteState({ status: 'ready', property: null });
      form.setFieldsValue(getPropertyInitialFormValues());
      void loadOwners();
      return;
    }

    if (!propertyId) {
      setRouteState({ status: 'not-found', property: null });
      return;
    }

    setRouteState({ status: 'loading', property: null });

    void getProperty(propertyId, getAccessToken, { signal: controller.signal })
      .then((property) => {
        if (activeRequestRef.current?.id !== requestId) {
          return;
        }

        setRouteState({ status: 'ready', property });
        form.setFieldsValue(getPropertyInitialFormValues(property));
        void loadOwners();
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
          setRouteState({ status: 'forbidden', property: null });
          return;
        }

        if (errorState.kind === 'not-found') {
          setRouteState({ status: 'not-found', property: null });
          return;
        }

        setRouteState({ status: 'error', property: null });
      });
  }, [form, getAccessToken, isEditMode, loadOwners, location.pathname, navigate, propertyId]);

  useEffect(() => {
    loadProperty();

    return () => {
      abortRequest(activeRequestRef.current?.controller);
      abortRequest(ownerRequestRef.current);
    };
  }, [loadProperty]);

  const handleSubmit = useCallback(async (values: PropertyFormValues) => {
    setSubmitLoading(true);
    setSubmitError(null);

    try {
      if (isEditMode && (!propertyId || !routeState.property)) {
        setSubmitError('找不到要更新的物業資料，請重新整理後再試。');
        return;
      }

      const savedProperty = isEditMode
        ? await updateProperty(
          propertyId as string,
          buildUpdatePropertyRequest(values, routeState.property as Property),
          getAccessToken,
        )
        : await createProperty(buildCreatePropertyRequest(values), getAccessToken);
      const feedback = getMutationSuccessFeedback(isEditMode ? '物業更新' : '物業建立');
      void message.success(feedback.content);
      navigate(savedProperty.id ? `/properties/${savedProperty.id}` : '/properties');
    } catch (error) {
      const errorState = classifyApiErrorForUi(error);

      if (errorState.kind === 'unauthorized') {
        navigate(getPropertyReturnTo(location.pathname), { replace: true });
        return;
      }

      const formState = getFormErrorState(error, propertyFieldMap);
      if (formState.fields.length > 0) {
        form.setFields(formState.fields.map((field) => ({
          ...field,
          name: field.name as keyof PropertyFormValues,
        })));
      }

      if (error instanceof ApiError && [400, 409, 422].includes(error.status)) {
        setSubmitError(formState.message);
        return;
      }

      setSubmitError(errorState.description);
    } finally {
      setSubmitLoading(false);
    }
  }, [
    form,
    getAccessToken,
    isEditMode,
    location.pathname,
    message,
    navigate,
    propertyId,
    routeState.property,
  ]);

  const handleCreateOwner = useCallback(async (values: OwnerCreateFormValues) => {
    setOwnerCreateLoading(true);
    setOwnerCreateError(null);

    try {
      const owner = await createUser(buildOwnerPayload(values), getAccessToken);
      const feedback = getMutationSuccessFeedback('業主建立');
      void message.success(feedback.content);
      setOwnerDrawerOpen(false);
      ownerForm.resetFields();
      if (owner.id) {
        await loadOwners(owner.id);
      } else {
        await loadOwners();
        void message.warning('業主已建立，但資料暫時不完整，請重新選擇業主。');
      }
    } catch (error) {
      const errorState = classifyApiErrorForUi(error);

      if (errorState.kind === 'unauthorized') {
        navigate(getPropertyReturnTo(location.pathname), { replace: true });
        return;
      }

      if (error instanceof ApiError && [400, 409, 422].includes(error.status)) {
        setOwnerCreateError(errorState.kind === 'conflict'
          ? '此 email 已被使用，請改用其他 email。'
          : errorState.description);
        return;
      }

      setOwnerCreateError(errorState.description);
    } finally {
      setOwnerCreateLoading(false);
    }
  }, [getAccessToken, loadOwners, location.pathname, message, navigate, ownerForm]);

  if (routeState.status === 'loading') {
    return <LoadingState />;
  }

  if (routeState.status === 'forbidden') {
    return <ForbiddenState />;
  }

  if (routeState.status === 'not-found') {
    return <NotFoundState />;
  }

  if (routeState.status === 'error') {
    return <RetryableErrorState onRetry={() => loadProperty()} />;
  }

  const pageTitle = isEditMode ? '編輯物業' : '新增物業';
  const pageDescription = isEditMode
    ? '調整物業基本資料；工作室成員不能修改電費單價與預設電費週期。'
    : '建立物業主檔，並選擇或新增業主。';

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="page-header">
        <div>
          <Space size={8} wrap>
            <Tag color="blue">管理</Tag>
            <Tag>物業主檔</Tag>
          </Space>
          <Typography.Title level={1}>{pageTitle}</Typography.Title>
          <Typography.Paragraph type="secondary">{pageDescription}</Typography.Paragraph>
        </div>
        <Space wrap>
          <Button>
            <Link to={propertyId ? `/properties/${propertyId}` : '/properties'}>取消</Link>
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => loadProperty()}>
            重新整理
          </Button>
        </Space>
      </div>

      {submitError && (
        <Alert
          type="error"
          showIcon
          message={isEditMode ? '更新物業失敗' : '建立物業失敗'}
          description={submitError}
        />
      )}

      {ownerState.status === 'error' && (
        <Alert
          type="warning"
          showIcon
          message="業主選項暫時無法讀取"
          description="可以重新載入業主選項；若仍失敗，請稍後再試。"
          action={<Button size="small" onClick={() => void loadOwners()}>重試</Button>}
        />
      )}

      {!canSubmitProperty && (
        <Alert
          type="info"
          showIcon
          message="目前角色不能異動物業主檔"
          description="此頁保留為導覽邊界；物業新增與編輯需由工作室成員操作。"
        />
      )}

      <Card title="物業基本資料">
        <Form
          form={form}
          layout="vertical"
          className="property-master-form"
          initialValues={getPropertyInitialFormValues(routeState.property ?? undefined)}
          onFinish={(values) => void handleSubmit(values)}
        >
          <div className="property-form-grid">
            <Form.Item
              name="name"
              label="內部物業名稱（必填）"
              rules={[{ required: true, whitespace: true, message: '請輸入物業名稱。' }]}
            >
              <Input autoComplete="organization" />
            </Form.Item>
            <Form.Item
              name="property_public_name"
              label="品牌頁公開名稱"
              extra="顯示在品牌頁與對外列表；留空時建立物業會沿用內部物業名稱。"
            >
              <Input />
            </Form.Item>
            <Form.Item name="subtitle" label="副標">
              <Input />
            </Form.Item>
            <Form.Item
              name="address"
              label="地址（必填）"
              rules={[{ required: true, whitespace: true, message: '請輸入地址。' }]}
            >
              <Input autoComplete="street-address" />
            </Form.Item>
            <Form.Item name="contact_phone" label="聯絡電話">
              <Input autoComplete="tel" />
            </Form.Item>
            <Form.Item
              name="contact_email"
              label="聯絡信箱"
              rules={[{ type: 'email', message: '請輸入有效的 email。' }]}
            >
              <Input autoComplete="email" />
            </Form.Item>
            <Form.Item
              name="electricity_unit_price"
              label="電費單價（必填）"
              rules={[{ required: true, message: '請輸入電費單價。' }]}
            >
              <InputNumber
                className="form-number-input"
                min={0.01}
                step={0.1}
                precision={2}
                addonAfter="元 / 度"
                disabled={!canEditElectricityDefaults}
              />
            </Form.Item>
            <Form.Item
              name="default_electricity_billing_cadence"
              label="預設電費週期（必填）"
              rules={[{ required: true, message: '請選擇預設電費週期。' }]}
            >
              <Select
                options={propertyBillingCadenceOptions}
                disabled={!canEditElectricityDefaults}
              />
            </Form.Item>
            {!canEditElectricityDefaults && (
              <Alert
                className="property-form-grid-full"
                type="info"
                showIcon
                message="目前角色不能修改電費預設值"
                description="仍可編輯物業名稱、地址、聯絡資料、備註與設施。"
              />
            )}
            {!isEditMode && (
              <Form.Item
                className="property-form-grid-full"
                name="owner_id"
                label="業主（必填）"
                rules={[{ required: true, message: '請選擇業主。' }]}
              >
                <Select
                  showSearch
                  loading={ownerState.status === 'loading'}
                  placeholder="選擇業主"
                  options={ownerOptions}
                  optionFilterProp="label"
                  dropdownRender={(menu) => (
                    <>
                      {menu}
                      <div className="owner-select-footer">
                        {canCreateOwner ? (
                          <Button
                            type="link"
                            icon={<PlusOutlined />}
                            onClick={() => {
                              setOwnerCreateError(null);
                              ownerForm.resetFields();
                              setOwnerDrawerOpen(true);
                            }}
                          >
                            新增業主
                          </Button>
                        ) : (
                          <Space size={8} wrap>
                            <Button type="link" disabled icon={<PlusOutlined />}>
                              新增業主
                            </Button>
                            <Typography.Text type="secondary">
                              {getRoleLabel(currentRole)} 不能建立業主。
                            </Typography.Text>
                          </Space>
                        )}
                      </div>
                    </>
                  )}
                />
              </Form.Item>
            )}
            <Form.Item className="property-form-grid-full" name="facilities" label="常用設施">
              <Input placeholder="以逗號分隔，例如：電梯, 停車位, 飲水機" />
            </Form.Item>
            <Form.Item className="property-form-grid-full" name="notes" label="備註">
              <Input.TextArea rows={4} />
            </Form.Item>
          </div>

          <div className="form-footer-actions">
            <Button>
              <Link to={propertyId ? `/properties/${propertyId}` : '/properties'}>取消</Link>
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={submitLoading}
              disabled={!canSubmitProperty}
              onClick={() => form.submit()}
            >
              {isEditMode ? '儲存變更' : '建立物業'}
            </Button>
          </div>
        </Form>
      </Card>

      <Alert
        type="info"
        showIcon
        message="附件與權限管理入口"
        description="本頁只維護物業主檔；附件上傳與權限指派會在後續功能提供。"
      />

      <Drawer
        title="新增業主"
        width={420}
        open={ownerDrawerOpen}
        onClose={() => setOwnerDrawerOpen(false)}
        destroyOnClose
        footer={(
          <Space className="drawer-footer-actions">
            <Button onClick={() => setOwnerDrawerOpen(false)}>取消</Button>
            <Button type="primary" loading={ownerCreateLoading} onClick={() => ownerForm.submit()}>
              建立並選取
            </Button>
          </Space>
        )}
      >
        {ownerCreateError && (
          <Alert
            className="form-alert"
            type="error"
            showIcon
            message="建立業主失敗"
            description={ownerCreateError}
          />
        )}
        <Form
          form={ownerForm}
          layout="vertical"
          onFinish={(values) => void handleCreateOwner(values)}
        >
          <Form.Item
            name="email"
            label="Email（必填）"
            rules={[
              { required: true, message: '請輸入 email。' },
              { type: 'email', message: '請輸入有效的 email。' },
            ]}
          >
            <Input autoComplete="email" />
          </Form.Item>
          <Form.Item
            name="name"
            label="顯示名稱（必填）"
            rules={[{ required: true, whitespace: true, message: '請輸入顯示名稱。' }]}
          >
            <Input autoComplete="name" />
          </Form.Item>
          <Alert
            type="info"
            showIcon
            message="角色固定為業主"
            description="建立後系統會建立業主帳號並寄出設定密碼信，接著重新載入業主選項並自動選取這位業主。"
          />
        </Form>
      </Drawer>
    </Space>
  );
}
