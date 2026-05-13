import { EditOutlined, PlusOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
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
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  classifyApiErrorForUi,
  createBrandFAQItem,
  deactivateBrandFAQItem,
  getBrandProfile,
  getFormErrorState,
  listBrandFAQItems,
  updateBrandFAQItem,
  upsertBrandProfile,
  type BrandFAQItem,
  type BrandProfile,
} from '../api';
import { useAuth } from '../auth';
import { getMutationSuccessFeedback } from './operation';
import { abortRequest } from './requestAbort';
import {
  ForbiddenState,
  LoadingState,
  RetryableErrorState,
} from './routeState';

type BrandProfileFormValues = {
  brand_name?: string;
  contact_phone?: string | null;
  contact_email?: string | null;
  contact_address?: string | null;
};

type BrandFAQFormValues = {
  question?: string;
  answer?: string;
  sort_order?: number | string | null;
  is_active?: boolean | string;
};

type BrandPageState =
  | { status: 'loading'; profile: BrandProfile | null; faqItems: BrandFAQItem[] }
  | { status: 'ready'; profile: BrandProfile | null; faqItems: BrandFAQItem[] }
  | { status: 'forbidden'; profile: null; faqItems: BrandFAQItem[] }
  | { status: 'error'; profile: null; faqItems: BrandFAQItem[] };

const profileFieldMap: Record<string, keyof BrandProfileFormValues> = {
  VALIDATION_BRAND_NAME_REQUIRED: 'brand_name',
  VALIDATION_CONTACT_EMAIL_INVALID: 'contact_email',
};

const faqFieldMap: Record<string, keyof BrandFAQFormValues> = {
  VALIDATION_QUESTION_REQUIRED: 'question',
  VALIDATION_ANSWER_REQUIRED: 'answer',
  VALIDATION_SORT_ORDER_INVALID: 'sort_order',
};

function getBrandReturnTo(pathname: string) {
  return `/login?reason=session-expired&returnTo=${encodeURIComponent(pathname)}`;
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBoolean(value: unknown) {
  return value === true || value === 'true';
}

function getProfileInitialValues(profile: BrandProfile | null): BrandProfileFormValues {
  return {
    brand_name: profile?.brand_name ?? '',
    contact_phone: profile?.contact_phone ?? '',
    contact_email: profile?.contact_email ?? '',
    contact_address: profile?.contact_address ?? '',
  };
}

function buildProfileRequest(values: BrandProfileFormValues, profile: BrandProfile | null) {
  return {
    brand_name: normalizeText(values.brand_name),
    contact_phone: normalizeText(values.contact_phone) || null,
    contact_email: normalizeText(values.contact_email) || null,
    contact_address: normalizeText(values.contact_address) || null,
    ...(typeof profile?.version === 'number' ? { version: profile.version } : {}),
  };
}

function getFAQInitialValues(item: BrandFAQItem | null): BrandFAQFormValues {
  return {
    question: item?.question ?? '',
    answer: item?.answer ?? '',
    sort_order: item?.sort_order ?? 0,
    is_active: item?.is_active ?? true,
  };
}

function buildCreateFAQRequest(values: BrandFAQFormValues) {
  return {
    question: normalizeText(values.question),
    answer: normalizeText(values.answer),
    sort_order: normalizeOptionalNumber(values.sort_order) ?? 0,
    is_active: normalizeBoolean(values.is_active ?? true),
  };
}

function buildUpdateFAQRequest(values: BrandFAQFormValues, item: BrandFAQItem) {
  return {
    question: normalizeText(values.question),
    answer: normalizeText(values.answer),
    sort_order: normalizeOptionalNumber(values.sort_order) ?? 0,
    is_active: normalizeBoolean(values.is_active ?? true),
    version: item.version ?? 0,
  };
}

function getFAQStatusTag(item: BrandFAQItem) {
  return item.is_active === false
    ? <Tag color="default">停用</Tag>
    : <Tag color="green">啟用</Tag>;
}

export default function BrandContentPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = AntdApp.useApp();
  const { getAccessToken } = useAuth();
  const [profileForm] = Form.useForm<BrandProfileFormValues>();
  const [faqForm] = Form.useForm<BrandFAQFormValues>();
  const activeRequestRef = useRef<AbortController | null>(null);
  const [pageState, setPageState] = useState<BrandPageState>({
    status: 'loading',
    profile: null,
    faqItems: [],
  });
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [faqDrawerOpen, setFAQDrawerOpen] = useState(false);
  const [editingFAQ, setEditingFAQ] = useState<BrandFAQItem | null>(null);
  const [faqSubmitting, setFAQSubmitting] = useState(false);
  const [faqError, setFAQError] = useState<string | null>(null);
  const [deactivatingFAQId, setDeactivatingFAQId] = useState<string | null>(null);

  const loadBrandContent = useCallback(() => {
    abortRequest(activeRequestRef.current);
    const controller = new AbortController();
    activeRequestRef.current = controller;
    setPageState((previous) => ({
      status: 'loading',
      profile: previous.profile,
      faqItems: previous.faqItems,
    }));
    setProfileError(null);
    setFAQError(null);

    void Promise.allSettled([
      getBrandProfile(getAccessToken, { signal: controller.signal }),
      listBrandFAQItems(getAccessToken, { include_inactive: true }, { signal: controller.signal }),
    ]).then((results) => {
      if (activeRequestRef.current !== controller) {
        return;
      }

      const [profileResult, faqResult] = results;
      const profileErrorState = profileResult.status === 'rejected'
        ? classifyApiErrorForUi(profileResult.reason)
        : null;
      const faqErrorState = faqResult.status === 'rejected'
        ? classifyApiErrorForUi(faqResult.reason)
        : null;

      if (profileErrorState?.kind === 'cancelled' || faqErrorState?.kind === 'cancelled') {
        return;
      }

      if (profileErrorState?.kind === 'unauthorized' || faqErrorState?.kind === 'unauthorized') {
        navigate(getBrandReturnTo(location.pathname), { replace: true });
        return;
      }

      if (profileErrorState?.kind === 'forbidden' || faqErrorState?.kind === 'forbidden') {
        setPageState({ status: 'forbidden', profile: null, faqItems: [] });
        return;
      }

      const profile = profileResult.status === 'fulfilled' ? profileResult.value : null;
      const profileMissing = profileResult.status === 'rejected'
        && profileErrorState?.kind === 'not-found';

      if (profileResult.status === 'rejected' && !profileMissing) {
        setPageState({ status: 'error', profile: null, faqItems: [] });
        return;
      }

      if (faqResult.status === 'rejected') {
        setPageState({ status: 'error', profile: null, faqItems: [] });
        return;
      }

      const faqItems = faqResult.value.data ?? [];
      setPageState({ status: 'ready', profile, faqItems });
      profileForm.setFieldsValue(getProfileInitialValues(profile));
    });
  }, [getAccessToken, location.pathname, navigate, profileForm]);

  useEffect(() => {
    loadBrandContent();

    return () => abortRequest(activeRequestRef.current);
  }, [loadBrandContent]);

  const openFAQDrawer = useCallback((item: BrandFAQItem | null = null) => {
    setEditingFAQ(item);
    setFAQError(null);
    faqForm.resetFields();
    faqForm.setFieldsValue(getFAQInitialValues(item));
    setFAQDrawerOpen(true);
  }, [faqForm]);

  const handleDeactivateFAQ = useCallback(async (item: BrandFAQItem) => {
    if (!item.id) {
      setFAQError('FAQ 資料不完整，請重新整理後再試。');
      return;
    }

    setDeactivatingFAQId(item.id);
    setFAQError(null);

    try {
      await deactivateBrandFAQItem(item.id, { version: item.version ?? 0 }, getAccessToken);
      void message.success(getMutationSuccessFeedback('品牌 FAQ 停用').content);
      loadBrandContent();
    } catch (error) {
      const errorState = classifyApiErrorForUi(error);

      if (errorState.kind === 'unauthorized') {
        navigate(getBrandReturnTo(location.pathname), { replace: true });
        return;
      }

      setFAQError(errorState.kind === 'conflict'
        ? '這筆 FAQ 已被其他人更新，請重新整理後再試。'
        : errorState.description);
    } finally {
      setDeactivatingFAQId(null);
    }
  }, [getAccessToken, loadBrandContent, location.pathname, message, navigate]);

  const faqColumns = useMemo<TableColumnsType<BrandFAQItem>>(() => [
    {
      title: '排序',
      dataIndex: 'sort_order',
      width: 90,
      render: (value: BrandFAQItem['sort_order']) => value ?? 0,
    },
    {
      title: '問題',
      dataIndex: 'question',
      width: 280,
      render: (value: BrandFAQItem['question']) => (
        <Typography.Text strong>{value || '未提供問題'}</Typography.Text>
      ),
    },
    {
      title: '回答',
      dataIndex: 'answer',
      render: (value: BrandFAQItem['answer']) => (
        <Typography.Text>{value || '未提供回答'}</Typography.Text>
      ),
    },
    {
      title: '狀態',
      width: 100,
      render: (_, record) => getFAQStatusTag(record),
    },
    {
      title: '動作',
      key: 'actions',
      width: 180,
      render: (_, record) => (
        <Space size={8} wrap>
          <Button size="small" icon={<EditOutlined />} onClick={() => openFAQDrawer(record)}>
            編輯
          </Button>
          {record.is_active !== false && record.id ? (
            <Button
              size="small"
              danger
              loading={deactivatingFAQId === record.id}
              onClick={() => void handleDeactivateFAQ(record)}
            >
              停用
            </Button>
          ) : null}
        </Space>
      ),
    },
  ], [deactivatingFAQId, handleDeactivateFAQ, openFAQDrawer]);

  async function handleProfileSubmit(values: BrandProfileFormValues) {
    setProfileSubmitting(true);
    setProfileError(null);

    try {
      const profile = await upsertBrandProfile(
        buildProfileRequest(values, pageState.profile),
        getAccessToken,
      );
      setPageState((previous) => ({
        ...previous,
        status: 'ready',
        profile,
      }));
      profileForm.setFieldsValue(getProfileInitialValues(profile));
      void message.success(getMutationSuccessFeedback('品牌基本資訊儲存').content);
    } catch (error) {
      const errorState = classifyApiErrorForUi(error);

      if (errorState.kind === 'unauthorized') {
        navigate(getBrandReturnTo(location.pathname), { replace: true });
        return;
      }

      const formState = getFormErrorState(error, profileFieldMap);
      if (formState.fields.length > 0) {
        profileForm.setFields(formState.fields as Parameters<typeof profileForm.setFields>[0]);
      }

      setProfileError(errorState.kind === 'conflict'
        ? '品牌基本資訊已被其他人更新，請重新整理後再試。'
        : formState.message);
    } finally {
      setProfileSubmitting(false);
    }
  }

  async function handleFAQSubmit(values: BrandFAQFormValues) {
    setFAQSubmitting(true);
    setFAQError(null);

    try {
      if (editingFAQ) {
        if (!editingFAQ.id) {
          setFAQError('FAQ 資料不完整，請重新整理後再試。');
          return;
        }

        await updateBrandFAQItem(
          editingFAQ.id,
          buildUpdateFAQRequest(values, editingFAQ),
          getAccessToken,
        );
        void message.success(getMutationSuccessFeedback('品牌 FAQ 更新').content);
      } else {
        await createBrandFAQItem(buildCreateFAQRequest(values), getAccessToken);
        void message.success(getMutationSuccessFeedback('品牌 FAQ 建立').content);
      }

      setFAQDrawerOpen(false);
      setEditingFAQ(null);
      loadBrandContent();
    } catch (error) {
      const errorState = classifyApiErrorForUi(error);

      if (errorState.kind === 'unauthorized') {
        navigate(getBrandReturnTo(location.pathname), { replace: true });
        return;
      }

      const formState = getFormErrorState(error, faqFieldMap);
      if (formState.fields.length > 0) {
        faqForm.setFields(formState.fields as Parameters<typeof faqForm.setFields>[0]);
      }

      setFAQError(errorState.kind === 'conflict'
        ? '這筆 FAQ 已被其他人更新，請重新整理後再試。'
        : formState.message);
    } finally {
      setFAQSubmitting(false);
    }
  }

  if (pageState.status === 'loading') {
    return <LoadingState />;
  }

  if (pageState.status === 'forbidden') {
    return <ForbiddenState />;
  }

  if (pageState.status === 'error') {
    return <RetryableErrorState onRetry={loadBrandContent} />;
  }

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="page-header">
        <div>
          <Space size={8} wrap>
            <Tag color="blue">管理</Tag>
            <Tag>品牌內容</Tag>
          </Space>
          <Typography.Title level={1}>品牌內容</Typography.Title>
          <Typography.Paragraph type="secondary">
            管理 demo 品牌頁會使用的基本資訊與常見問答；公開頁與 thin backend 不在此頁處理。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={loadBrandContent}>
            重新整理
          </Button>
        </Space>
      </div>

      <Tabs
        items={[
          {
            key: 'profile',
            label: '品牌基本資訊',
            children: (
              <Card title="品牌基本資訊">
                {profileError && (
                  <Alert
                    className="form-alert"
                    type="error"
                    showIcon
                    message="品牌基本資訊儲存失敗"
                    description={profileError}
                  />
                )}
                {!pageState.profile && (
                  <Alert
                    className="form-alert"
                    type="info"
                    showIcon
                    message="尚未建立品牌基本資訊"
                    description="填寫後儲存即可建立第一筆品牌基本資訊。"
                  />
                )}
                <Form
                  form={profileForm}
                  layout="vertical"
                  requiredMark={false}
                  initialValues={getProfileInitialValues(pageState.profile)}
                  onFinish={(values) => void handleProfileSubmit(values)}
                >
                  <div className="form-grid two-columns">
                    <Form.Item
                      name="brand_name"
                      label="品牌名稱（必填）"
                      rules={[{ required: true, whitespace: true, message: '請輸入品牌名稱。' }]}
                    >
                      <Input />
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
                    <Form.Item name="contact_address" label="聯絡地址">
                      <Input />
                    </Form.Item>
                  </div>
                  <div className="form-footer-actions">
                    <Button
                      type="primary"
                      icon={<SaveOutlined />}
                      loading={profileSubmitting}
                      onClick={() => profileForm.submit()}
                    >
                      儲存品牌基本資訊
                    </Button>
                  </div>
                </Form>
              </Card>
            ),
          },
          {
            key: 'faq',
            label: '品牌 FAQ',
            children: (
              <Card
                title="品牌 FAQ"
                extra={(
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => openFAQDrawer()}>
                    新增 FAQ
                  </Button>
                )}
              >
                {faqError && (
                  <Alert
                    className="form-alert"
                    type="error"
                    showIcon
                    message="品牌 FAQ 操作失敗"
                    description={faqError}
                  />
                )}
                <Table
                  rowKey={(record) => record.id ?? `${record.sort_order}-${record.question}`}
                  columns={faqColumns}
                  dataSource={pageState.faqItems}
                  pagination={false}
                  scroll={{ x: 900 }}
                />
              </Card>
            ),
          },
        ]}
      />

      <Drawer
        title={editingFAQ ? '編輯 FAQ' : '新增 FAQ'}
        width={640}
        open={faqDrawerOpen}
        onClose={() => setFAQDrawerOpen(false)}
        destroyOnClose
      >
        {faqError && (
          <Alert
            className="form-alert"
            type="error"
            showIcon
            message="FAQ 儲存失敗"
            description={faqError}
          />
        )}
        <Form
          form={faqForm}
          layout="vertical"
          requiredMark={false}
          initialValues={getFAQInitialValues(editingFAQ)}
          onFinish={(values) => void handleFAQSubmit(values)}
        >
          <Form.Item
            name="question"
            label="問題（必填）"
            rules={[{ required: true, whitespace: true, message: '請輸入問題。' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="answer"
            label="回答（必填）"
            rules={[{ required: true, whitespace: true, message: '請輸入回答。' }]}
          >
            <Input.TextArea rows={5} />
          </Form.Item>
          <div className="form-grid two-columns">
            <Form.Item name="sort_order" label="排序值">
              <InputNumber min={0} precision={0} className="form-number-input" />
            </Form.Item>
            <Form.Item name="is_active" label="狀態">
              <Select
                options={[
                  { value: true, label: '啟用' },
                  { value: false, label: '停用' },
                ]}
              />
            </Form.Item>
          </div>
          <div className="form-footer-actions">
            <Button onClick={() => setFAQDrawerOpen(false)}>取消</Button>
            <Button type="primary" loading={faqSubmitting} onClick={() => faqForm.submit()}>
              {editingFAQ ? '儲存 FAQ' : '建立 FAQ'}
            </Button>
          </div>
        </Form>
      </Drawer>
    </Space>
  );
}
