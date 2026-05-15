// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Modal } from 'antd';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type React from 'react';
import { ApiError } from '../api';
import JournalPage from './JournalPage';

const repairWorkspaceSpy = vi.hoisted(() => vi.fn());

const apiMocks = vi.hoisted(() => ({
  assignRepairRequest: vi.fn(),
  cancelRepairRequest: vi.fn(),
  completeRepairRequest: vi.fn(),
  createAttachmentUploadUrl: vi.fn(),
  createJournalLog: vi.fn(),
  createRepairRequest: vi.fn(),
  deleteJournalLog: vi.fn(),
  getRepairRequest: vi.fn(),
  getJournalLog: vi.fn(),
  listJournalLogAttachments: vi.fn(),
  listRepairRequestAttachments: vi.fn(),
  listRepairRequests: vi.fn(),
  listUsers: vi.fn(),
  listJournalExpenseAccountingTitles: vi.fn(),
  listJournalLogs: vi.fn(),
  listPropertyTenantLeaseRoster: vi.fn(),
  progressRepairRequest: vi.fn(),
  registerJournalLogAttachment: vi.fn(),
  registerRepairRequestAttachment: vi.fn(),
  updateRepairRequest: vi.fn(),
  updateJournalLog: vi.fn(),
  uploadAttachmentFile: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  currentUser: { role: 'organizer' },
  getAccessToken: vi.fn(() => 'firebase-token'),
}));

vi.mock('@ant-design/icons', () => ({
  CheckOutlined: () => null,
  DeleteOutlined: () => null,
  DownloadOutlined: () => null,
  EditOutlined: () => null,
  EyeOutlined: () => null,
  PaperClipOutlined: () => null,
  PlayCircleOutlined: () => null,
  PlusOutlined: () => null,
  ReloadOutlined: () => null,
  StopOutlined: () => null,
  ToolOutlined: () => null,
  UploadOutlined: () => null,
  UserSwitchOutlined: () => null,
}));

vi.mock('antd', async () => {
  const ReactModule = await vi.importActual<typeof import('react')>('react');
  const FormContext = ReactModule.createContext<{
    form: {
      values: Record<string, unknown>;
      getFieldValue: (name: string) => unknown;
      onFinish?: (values: Record<string, unknown>) => void;
    };
  } | null>(null);

  function createForm() {
    return {
      values: {} as Record<string, unknown>,
      getFieldValue(name: string) {
        return this.values[name];
      },
      onFinish: undefined as ((values: Record<string, unknown>) => void) | undefined,
      resetFields() {
        this.values = {};
      },
      setFields() {},
      setFieldsValue(nextValues: Record<string, unknown>) {
        this.values = { ...this.values, ...nextValues };
      },
      submit() {
        this.onFinish?.(this.values);
      },
    };
  }

  const FormComponent = ({
    children,
    form,
    onFinish,
  }: {
    children?: React.ReactNode;
    form?: ReturnType<typeof createForm>;
    onFinish?: (values: Record<string, unknown>) => void;
  }) => {
    const currentForm = form ?? createForm();
    currentForm.onFinish = onFinish;

    return (
      <FormContext.Provider value={{ form: currentForm }}>
        <form>{children}</form>
      </FormContext.Provider>
    );
  };

  const FormItem = ({
    children,
    extra,
    label,
    name,
  }: {
    children?: React.ReactNode | ((form: { getFieldValue: (name: string) => unknown }) => React.ReactNode);
    extra?: React.ReactNode;
    label?: React.ReactNode;
    name?: string;
  }) => {
    const context = ReactModule.useContext(FormContext);

    if (typeof children === 'function') {
      return <>{children({ getFieldValue: (fieldName) => context?.form.getFieldValue(fieldName) })}</>;
    }

    const controlId = typeof label === 'string' ? label : undefined;
    const child = ReactModule.isValidElement(children) && name && context
      ? ReactModule.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        'aria-label': controlId,
        defaultValue: context.form.values[name] as string | number | readonly string[] | undefined,
        onChange: (event: { target?: { value?: unknown } }) => {
          context.form.values[name] = event.target?.value;
        },
      })
      : children;

    return (
      <label>
        {label}
        {child}
        {extra && <span>{extra}</span>}
      </label>
    );
  };

  const Form = Object.assign(FormComponent, {
    Item: FormItem,
    useForm: () => {
      const formRef = ReactModule.useRef<ReturnType<typeof createForm> | null>(null);
      if (!formRef.current) {
        formRef.current = createForm();
      }

      return [formRef.current];
    },
  });

  const Descriptions = Object.assign(
    ({ children }: { children?: React.ReactNode }) => <dl>{children}</dl>,
    {
      Item: ({ children, label }: { children?: React.ReactNode; label?: React.ReactNode }) => (
        <div>
          <dt>{label}</dt>
          <dd>{children}</dd>
        </div>
      ),
    },
  );
  const Empty = Object.assign(
    ({ children, description }: { children?: React.ReactNode; description?: React.ReactNode }) => (
      <div>
        {description}
        {children}
      </div>
    ),
    { PRESENTED_IMAGE_SIMPLE: 'simple' },
  );
  const Input = Object.assign(
    (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
    {
      TextArea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
    },
  );
  const Typography = {
    Paragraph: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
    Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
    Title: ({ children }: { children?: React.ReactNode }) => <h1>{children}</h1>,
  };
  const Modal = Object.assign(
    ({
      cancelText = '取消',
      children,
      okButtonProps,
      okText = '確定',
      onCancel,
      onOk,
      open,
      title,
    }: {
      cancelText?: React.ReactNode;
      children?: React.ReactNode;
      okButtonProps?: { disabled?: boolean; loading?: boolean };
      okText?: React.ReactNode;
      onCancel?: () => void;
      onOk?: () => void;
      open?: boolean;
      title?: React.ReactNode;
    }) => (open ? (
      <section role="dialog" aria-label={typeof title === 'string' ? title : undefined}>
        <h2>{title}</h2>
        {children}
        <button type="button" onClick={onCancel}>
          {cancelText}
        </button>
        <button
          type="button"
          disabled={okButtonProps?.disabled || okButtonProps?.loading}
          onClick={onOk}
        >
          {okText}
        </button>
      </section>
    ) : null),
    {
      confirm: vi.fn(),
    },
  );

  return {
    Alert: ({ description, message }: { description?: React.ReactNode; message?: React.ReactNode }) => (
      <div>
        <span>{message}</span>
        <span>{description}</span>
      </div>
    ),
    Avatar: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
    Button: ({
      children,
      disabled,
      icon,
      loading,
      onClick,
    }: {
      children?: React.ReactNode;
      disabled?: boolean;
      icon?: React.ReactNode;
      loading?: boolean;
      onClick?: () => void;
    }) => (
      <button type="button" disabled={disabled || loading} onClick={onClick}>
        {icon}
        {children}
      </button>
    ),
    Card: ({ children }: { children?: React.ReactNode }) => <section>{children}</section>,
    DatePicker: {
      RangePicker: ({ 'aria-label': ariaLabel }: { 'aria-label'?: string }) => (
        <input aria-label={ariaLabel} readOnly />
      ),
    },
    Descriptions,
    Drawer: ({
      children,
      footer,
      open,
      title,
    }: {
      children?: React.ReactNode;
      footer?: React.ReactNode;
      open?: boolean;
      title?: React.ReactNode;
    }) => (open ? (
      <section role="dialog" aria-label={typeof title === 'string' ? title : undefined}>
        <h2>{title}</h2>
        {children}
        {footer}
      </section>
    ) : null),
    Empty,
    Form,
    Input,
    InputNumber: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input type="number" {...props} />,
    List: Object.assign(
      ({
        dataSource,
        renderItem,
      }: {
        dataSource?: Array<Record<string, unknown>>;
        renderItem?: (record: Record<string, unknown>, index: number) => React.ReactNode;
      }) => (
        <div>
          {(dataSource ?? []).map((record, index) => (
            <div key={String(record.id ?? index)}>
              {renderItem?.(record, index)}
            </div>
          ))}
        </div>
      ),
      {
        Item: Object.assign(
          ({ actions, children }: { actions?: React.ReactNode[]; children?: React.ReactNode }) => (
            <article>
              {children}
              <div>{actions}</div>
            </article>
          ),
          {
            Meta: ({
              avatar,
              description,
              title,
            }: {
              avatar?: React.ReactNode;
              description?: React.ReactNode;
              title?: React.ReactNode;
            }) => (
              <div>
                {avatar}
                {title}
                {description}
              </div>
            ),
          },
        ),
      },
    ),
    Modal,
    Segmented: ({
      'aria-label': ariaLabel,
      onChange,
      options,
      value,
    }: {
      'aria-label'?: string;
      onChange?: (value: string) => void;
      options?: Array<{ label: React.ReactNode; value: string }>;
      value?: string;
    }) => (
      <div aria-label={ariaLabel}>
        {(options ?? []).map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              checked={value === option.value}
              onChange={() => onChange?.(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    ),
    Select: ({
      'aria-label': ariaLabel,
      disabled,
      onChange,
      options,
      value,
    }: {
      'aria-label'?: string;
      disabled?: boolean;
      onChange?: (value?: string) => void;
      options?: Array<{ label: React.ReactNode; value: string }>;
      value?: string;
    }) => (
      <select
        aria-label={ariaLabel}
        disabled={disabled}
        value={value ?? ''}
        onChange={(event) => onChange?.(event.target.value || undefined)}
      >
        <option value="" />
        {(options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ),
    Space: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Spin: () => <span>loading</span>,
    Tag: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
    Typography,
    message: {
      useMessage: () => [{ success: vi.fn() }, null],
    },
  };
});

vi.mock('../auth', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');

  return {
    ...actual,
    assignRepairRequest: apiMocks.assignRepairRequest,
    cancelRepairRequest: apiMocks.cancelRepairRequest,
    completeRepairRequest: apiMocks.completeRepairRequest,
    createAttachmentUploadUrl: apiMocks.createAttachmentUploadUrl,
    createJournalLog: apiMocks.createJournalLog,
    createRepairRequest: apiMocks.createRepairRequest,
    deleteJournalLog: apiMocks.deleteJournalLog,
    getRepairRequest: apiMocks.getRepairRequest,
    getJournalLog: apiMocks.getJournalLog,
    listJournalLogAttachments: apiMocks.listJournalLogAttachments,
    listRepairRequestAttachments: apiMocks.listRepairRequestAttachments,
    listRepairRequests: apiMocks.listRepairRequests,
    listUsers: apiMocks.listUsers,
    listJournalExpenseAccountingTitles: apiMocks.listJournalExpenseAccountingTitles,
    listJournalLogs: apiMocks.listJournalLogs,
    listPropertyTenantLeaseRoster: apiMocks.listPropertyTenantLeaseRoster,
    progressRepairRequest: apiMocks.progressRepairRequest,
    registerJournalLogAttachment: apiMocks.registerJournalLogAttachment,
    registerRepairRequestAttachment: apiMocks.registerRepairRequestAttachment,
    updateRepairRequest: apiMocks.updateRepairRequest,
    updateJournalLog: apiMocks.updateJournalLog,
    uploadAttachmentFile: apiMocks.uploadAttachmentFile,
  };
});

vi.mock('./attachments', () => ({
  JournalAttachmentManager: ({ journalLogId }: { journalLogId: string }) => (
    <section aria-label="日誌附件" data-resource-id={journalLogId}>
      日誌附件
    </section>
  ),
}));

vi.mock('./RepairWorkspace', () => ({
  default: (props: {
    propertyId: string | undefined;
    roomId: string | undefined;
    roomRows: Array<{ room_id?: string | null; room_label?: string | null; tenant_label?: string | null }>;
  }) => {
    repairWorkspaceSpy(props);

    return (
      <section aria-label="維修工作區掛載">
        <span>維修工作區</span>
        <span aria-label="維修物業">{props.propertyId}</span>
        <span aria-label="維修房間">{props.roomId}</span>
      </section>
    );
  },
}));

function RouteProbe() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <>
      <span aria-label="目前路徑">{`${location.pathname}${location.search}`}</span>
      <button
        type="button"
        onClick={() => navigate('/properties/property-1/journal?tab=repair&roomId=room-1&repairRequestId=repair-2')}
      >
        切到第二維修
      </button>
      <button
        type="button"
        onClick={() => navigate('/properties/property-1/journal?tab=repair&roomId=room-1')}
      >
        清除維修詳情
      </button>
    </>
  );
}

function renderJournalPage(initialEntry = '/properties/property-1/journal?roomId=room-1&date_from=2026-05-01&date_to=2026-05-31&page=2&limit=50') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <RouteProbe />
      <Routes>
        <Route path="/properties/:propertyId/journal" element={<JournalPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockJournalData() {
  apiMocks.listJournalLogs.mockResolvedValue({
    data: [
      {
        id: 'journal-1',
        property_id: 'property-1',
        room_id: 'room-1',
        property_label: '台北大安物業',
        room_label: '201',
        author_label: '王小明',
        content: '浴室漏水修繕',
        expense_amount: 3500,
        expense_accounting_title_id: 'title-1',
        expense_accounting_title_code: '6681',
        expense_accounting_title_name: '其他支出',
        created_at: '2026-05-08T06:30:00Z',
        updated_at: '2026-05-08T06:30:00Z',
      },
      {
        id: 'journal-2',
        property_id: 'property-1',
        room_id: 'room-1',
        property_label: '台北大安物業',
        room_label: '201',
        author_label: '陳美芳',
        content: '最新巡檢完成',
        expense_amount: null,
        created_at: '2026-05-09T02:00:00Z',
        updated_at: '2026-05-09T02:00:00Z',
      },
    ],
    pagination: { page: 2, limit: 50, total: 60, total_pages: 2 },
  });
  apiMocks.listJournalExpenseAccountingTitles.mockResolvedValue({
    data: [{ id: 'title-1', code: '6681', name: '其他支出', kind: 'expense' }],
  });
  apiMocks.listPropertyTenantLeaseRoster.mockResolvedValue({
    data: [
      {
        property_id: 'property-1',
        room_id: 'room-1',
        room_label: '201',
        room_status: 'occupied',
        tenant_id: 'tenant-1',
        tenant_label: '林怡君',
      },
      {
        property_id: 'property-1',
        room_id: 'room-2',
        room_label: '202',
        room_status: 'vacant',
        tenant_id: null,
        tenant_label: null,
      },
    ],
    pagination: { page: 1, limit: 100, total: 2, total_pages: 1 },
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.values(apiMocks).forEach((mock) => mock.mockReset());
  repairWorkspaceSpy.mockClear();
  authMocks.currentUser = { role: 'organizer' };
  authMocks.getAccessToken.mockReset();
  authMocks.getAccessToken.mockReturnValue('firebase-token');
});

describe('JournalPage', () => {
  it('loads journal logs from route property and URL query filters', async () => {
    mockJournalData();

    renderJournalPage();

    await waitFor(() => {
      expect(apiMocks.listJournalLogs).toHaveBeenCalledWith(
        authMocks.getAccessToken,
        {
          property_id: 'property-1',
          room_id: 'room-1',
          date_from: '2026-05-01',
          date_to: '2026-05-31',
          page: 2,
          limit: 50,
        },
        expect.any(Object),
      );
    });

    expect(await screen.findByText('浴室漏水修繕')).toBeTruthy();
    expect(screen.getByText('最新巡檢完成').compareDocumentPosition(screen.getByText('浴室漏水修繕')))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByText('會計科目：6681 其他支出')).toBeTruthy();
    expect(screen.getByText('已套用房間篩選')).toBeTruthy();
    expect(screen.getByText('目前顯示 201 - 林怡君 的日誌；列表仍以最新房間資料為準。')).toBeTruthy();
    expect(screen.getByRole('radio', { name: '維修工作區' })).toBeTruthy();
    expect(apiMocks.listPropertyTenantLeaseRoster).toHaveBeenCalledWith(
      'property-1',
      authMocks.getAccessToken,
      { include_vacant: true, page: 1, limit: 100 },
      expect.any(Object),
    );
  });

  it('clears room and date filters back to the property-scoped journal route', async () => {
    mockJournalData();

    renderJournalPage();

    await screen.findByText('浴室漏水修繕');
    fireEvent.click(screen.getByRole('button', { name: '清除篩選' }));

    await waitFor(() => {
      expect(screen.getByLabelText('目前路徑').textContent).toBe('/properties/property-1/journal');
    });
  });

  it('surfaces list delete conflicts on the page when the detail drawer is closed', async () => {
    mockJournalData();
    let confirmConfig: { onOk?: () => Promise<void> | void } | undefined;
    vi.spyOn(Modal, 'confirm').mockImplementation((config) => {
      confirmConfig = config as typeof confirmConfig;

      return {
        destroy: vi.fn(),
        update: vi.fn(),
      } as ReturnType<typeof Modal.confirm>;
    });
    apiMocks.deleteJournalLog.mockRejectedValue(new ApiError({
      status: 409,
      message: 'Journal expense belongs to a finalized monthly snapshot.',
      errorCode: 'JOURNAL_EXPENSE_SNAPSHOT_FINALIZED',
      details: null,
      response: new Response(null, { status: 409 }),
    }));

    renderJournalPage();

    await screen.findByText('浴室漏水修繕');
    fireEvent.click(screen.getAllByRole('button', { name: '刪除' })[0]);
    expect(confirmConfig).toBeTruthy();
    await confirmConfig?.onOk?.();

    expect(await screen.findByText('無法刪除日誌')).toBeTruthy();
    expect(screen.getByText('此日誌費用所屬月份已月結，不能改變會計影響。請重新載入確認最新狀態。')).toBeTruthy();
  });

  it('shows that existing expense journals cannot clear expense data in edit mode', async () => {
    mockJournalData();

    renderJournalPage();

    await screen.findByText('浴室漏水修繕');
    fireEvent.click(screen.getAllByRole('button', { name: '編輯' })[1]);

    expect(await screen.findByText('既有費用日誌可調整金額與科目，但不能在此清除費用。')).toBeTruthy();
    expect(screen.getByText('費用金額（必填）')).toBeTruthy();
    expect(screen.getByText('會計科目（必填）')).toBeTruthy();
  });

  it('mounts journal attachments in the journal detail drawer', async () => {
    mockJournalData();
    apiMocks.getJournalLog.mockResolvedValue({
      id: 'journal-1',
      property_id: 'property-1',
      room_id: 'room-1',
      property_label: '台北大安物業',
      room_label: '201',
      author_label: '王小明',
      content: '浴室漏水修繕',
      expense_amount: 3500,
      expense_accounting_title_id: 'title-1',
      expense_accounting_title_code: '6681',
      expense_accounting_title_name: '其他支出',
      expense_description: '修繕材料',
      created_at: '2026-05-08T06:30:00Z',
      updated_at: '2026-05-08T06:30:00Z',
    });

    renderJournalPage();

    await screen.findByText('浴室漏水修繕');
    fireEvent.click(screen.getAllByRole('button', { name: /詳\s*情/ })[1]);

    expect(await screen.findByText('日誌附件')).toBeTruthy();
    expect(screen.queryByText('附件功能尚未開放')).toBeNull();
    expect(screen.getByLabelText('日誌附件').getAttribute('data-resource-id')).toBe('journal-1');
  });

  it('loads repair workspace from URL tab and passes room context', async () => {
    mockJournalData();

    renderJournalPage('/properties/property-1/journal?tab=repair&roomId=room-1&repair_status=submitted');

    await waitFor(() => {
      expect(repairWorkspaceSpy).toHaveBeenCalledWith(expect.objectContaining({
        propertyId: 'property-1',
        roomId: 'room-1',
      }));
    });

    expect(await screen.findByLabelText('維修工作區掛載')).toBeTruthy();
    expect(screen.getByLabelText('維修物業').textContent).toBe('property-1');
    expect(screen.getByLabelText('維修房間').textContent).toBe('room-1');
  }, 10000);
});
