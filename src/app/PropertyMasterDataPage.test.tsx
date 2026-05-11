// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  ApiError,
  createProperty,
  createUser,
  deleteProperty,
  getProperty,
  listProperties,
  listUsers,
  updateProperty,
} from '../api';
import PropertyListPage from './PropertyListPage';
import PropertyMasterDataPage from './PropertyMasterDataPage';

const authMocks = vi.hoisted(() => ({
  currentUser: {
    id: 'admin-current',
    email: 'admin@example.com',
    name: '管理員',
    role: 'admin',
  },
  getAccessToken: vi.fn(() => 'firebase-token'),
}));

const antdMocks = vi.hoisted(() => ({
  success: vi.fn(),
}));

vi.mock('@ant-design/icons', () => ({
  DeleteOutlined: () => null,
  EditOutlined: () => null,
  EyeOutlined: () => null,
  PlusOutlined: () => null,
  ReloadOutlined: () => null,
  SaveOutlined: () => null,
  UploadOutlined: () => null,
}));

vi.mock('antd', async () => {
  const React = await import('react');

  type FormInstance = {
    values: Record<string, string | number | undefined>;
    onFinish?: (values: Record<string, string | number | undefined>) => void;
    resetFields: () => void;
    setFieldValue: (name: string, value: string | number | undefined) => void;
    setFields: (fields: Array<{ name: string; errors: string[] }>) => void;
    setFieldsValue: (values: Record<string, string | number | undefined>) => void;
    submit: () => void;
  };

  type Column<T> = {
    title?: string;
    dataIndex?: keyof T;
    key?: string;
    render?: (value: unknown, record: T) => ReactNode;
  };

  const FormContext = React.createContext<FormInstance | null>(null);

  function makeForm(): FormInstance {
    return {
      values: {},
      resetFields() {
        this.values = {};
      },
      setFieldValue(name, value) {
        this.values[name] = value;
      },
      setFields(fields) {
        fields.forEach((field) => {
          this.values[`error:${field.name}`] = field.errors.join(' ');
        });
      },
      setFieldsValue(values) {
        this.values = { ...this.values, ...values };
      },
      submit() {
        this.onFinish?.({ ...this.values });
      },
    };
  }

  const Form = Object.assign(
    ({
      children,
      form,
      initialValues,
      onFinish,
    }: React.PropsWithChildren<{
      className?: string;
      form?: FormInstance;
      initialValues?: Record<string, string | number | undefined>;
      layout?: string;
      onFinish?: (values: Record<string, string | number | undefined>) => void;
    }>) => {
      const formInstance = form ?? makeForm();
      formInstance.onFinish = onFinish;
      formInstance.values = { ...initialValues, ...formInstance.values };

      return <FormContext.Provider value={formInstance}><form>{children}</form></FormContext.Provider>;
    },
    {
      useForm: () => {
        const formRef = React.useRef<FormInstance | null>(null);
        formRef.current ??= makeForm();
        return [formRef.current];
      },
      Item: ({
        children,
        label,
        name,
      }: React.PropsWithChildren<{
        className?: string;
        label?: string;
        name?: string;
        rules?: unknown[];
      }>) => {
        const form = React.useContext(FormContext);
        const child = React.isValidElement(children)
          ? React.cloneElement(children as ReactElement<{
            'aria-label'?: string;
            onChange?: (eventOrValue: { target: { value: string } } | string | number | undefined) => void;
            value?: string | number;
          }>, {
            'aria-label': label,
            value: name ? form?.values[name] ?? '' : undefined,
            onChange: (eventOrValue: { target: { value: string } } | string | number | undefined) => {
              if (name && form) {
                form.values[name] = typeof eventOrValue === 'object'
                  ? eventOrValue.target.value
                  : eventOrValue;
              }
            },
          })
          : children;

        return (
          <div>
            {label ? <span>{label}</span> : null}
            {child}
            {name && form?.values[`error:${name}`] ? <span>{form.values[`error:${name}`]}</span> : null}
          </div>
        );
      },
    },
  );

  return {
    Alert: ({
      description,
      message,
    }: {
      description?: ReactNode;
      message?: ReactNode;
      showIcon?: boolean;
      type?: string;
    }) => (
      <div role="alert">
        <div>{message}</div>
        <div>{description}</div>
      </div>
    ),
    App: {
      useApp: () => ({ message: { success: antdMocks.success } }),
    },
    Button: ({
      children,
      disabled,
      loading,
      onClick,
    }: React.PropsWithChildren<{
      danger?: boolean;
      disabled?: boolean;
      icon?: ReactNode;
      loading?: boolean;
      onClick?: () => void;
      size?: string;
      type?: string;
    }>) => (
      <button disabled={disabled || loading} onClick={onClick} type="button">{children}</button>
    ),
    Card: ({ children, extra, title }: React.PropsWithChildren<{ extra?: ReactNode; title?: ReactNode }>) => (
      <section>
        {title ? <h2>{title}</h2> : null}
        {extra}
        {children}
      </section>
    ),
    Drawer: ({
      children,
      footer,
      open,
      title,
    }: React.PropsWithChildren<{
      destroyOnClose?: boolean;
      footer?: ReactNode;
      onClose?: () => void;
      open?: boolean;
      title?: ReactNode;
      width?: number;
    }>) => (
      open ? (
        <section aria-label={String(title)}>
          <h2>{title}</h2>
          {children}
          {footer}
        </section>
      ) : null
    ),
    Form,
    Input: Object.assign(
      (props: {
        'aria-label'?: string;
        autoComplete?: string;
        onChange?: (event: { target: { value: string } }) => void;
        placeholder?: string;
        value?: string | number;
      }) => (
        <input
          aria-label={props['aria-label']}
          placeholder={props.placeholder}
          value={props.value ?? ''}
          onChange={props.onChange}
        />
      ),
      {
        TextArea: (props: {
          'aria-label'?: string;
          onChange?: (event: { target: { value: string } }) => void;
          rows?: number;
          value?: string | number;
        }) => (
          <textarea aria-label={props['aria-label']} value={props.value ?? ''} onChange={props.onChange} />
        ),
      },
    ),
    InputNumber: (props: {
      'aria-label'?: string;
      addonAfter?: ReactNode;
      className?: string;
      disabled?: boolean;
      min?: number;
      onChange?: (value: number | undefined) => void;
      precision?: number;
      step?: number;
      value?: string | number;
    }) => (
      <input
        aria-label={props['aria-label']}
        disabled={props.disabled}
        type="number"
        value={props.value ?? ''}
        onChange={(event) => props.onChange?.(event.target.value === '' ? undefined : Number(event.target.value))}
      />
    ),
    Modal: ({
      cancelText,
      children,
      okText,
      onCancel,
      onOk,
      open,
      title,
    }: React.PropsWithChildren<{
      cancelText?: ReactNode;
      okButtonProps?: { danger?: boolean; loading?: boolean };
      okText?: ReactNode;
      onCancel?: () => void;
      onOk?: () => void;
      open?: boolean;
      title?: ReactNode;
    }>) => (
      open ? (
        <section aria-label={String(title)}>
          <h2>{title}</h2>
          {children}
          <button onClick={onCancel} type="button">{cancelText ?? '取消'}</button>
          <button onClick={onOk} type="button">{okText ?? '確定'}</button>
        </section>
      ) : null
    ),
    Progress: ({ percent }: { percent?: number }) => <progress value={percent ?? 0} max={100} />,
    Select: ({
      'aria-label': ariaLabel,
      disabled,
      dropdownRender,
      onChange,
      options,
      placeholder,
      value,
    }: {
      'aria-label'?: string;
      disabled?: boolean;
      dropdownRender?: (menu: ReactNode) => ReactNode;
      loading?: boolean;
      onChange?: (value: string | number | undefined) => void;
      optionFilterProp?: string;
      options?: Array<{ value: string | number; label: ReactNode }>;
      placeholder?: string;
      showSearch?: boolean;
      value?: string | number;
    }) => {
      const menu = (
        <select
          aria-label={ariaLabel ?? placeholder}
          disabled={disabled}
          value={value ?? ''}
          onChange={(event) => onChange?.(event.target.value || undefined)}
        >
          <option value="">{placeholder ?? ''}</option>
          {options?.map((option) => (
            <option key={String(option.value)} value={option.value}>{option.label}</option>
          ))}
        </select>
      );

      return <>{menu}{dropdownRender?.(null)}</>;
    },
    Space: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Table: <T extends Record<string, unknown>>({
      columns,
      dataSource,
      rowKey,
    }: {
      columns: Array<Column<T>>;
      dataSource: T[];
      pagination?: false;
      rowKey?: (record: T, index?: number) => string;
    }) => (
      <table>
        <tbody>
          {dataSource.map((record, index) => (
            <tr key={rowKey?.(record, index) ?? String(index)}>
              {columns.map((column) => (
                <td key={column.key ?? String(column.title)}>
                  {column.render
                    ? column.render(column.dataIndex ? record[column.dataIndex] : undefined, record)
                    : String(column.dataIndex ? record[column.dataIndex] ?? '' : '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    ),
    Tag: ({ children }: React.PropsWithChildren<{ color?: string }>) => <span>{children}</span>,
    Tooltip: ({ children }: React.PropsWithChildren<{ title?: ReactNode }>) => <>{children}</>,
    Typography: {
      Paragraph: ({ children }: React.PropsWithChildren<{ type?: string }>) => <p>{children}</p>,
      Text: ({ children }: React.PropsWithChildren<{ strong?: boolean; type?: string }>) => <span>{children}</span>,
      Title: ({ children }: React.PropsWithChildren<{ level?: number }>) => <h1>{children}</h1>,
    },
  };
});

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');

  return {
    ...actual,
    createProperty: vi.fn(),
    createUser: vi.fn(),
    deleteProperty: vi.fn(),
    getProperty: vi.fn(),
    listProperties: vi.fn(),
    listUsers: vi.fn(),
    updateProperty: vi.fn(),
  };
});

vi.mock('../auth', async () => {
  const actual = await vi.importActual<typeof import('../auth')>('../auth');

  return {
    ...actual,
    useAuth: () => ({
      currentUser: authMocks.currentUser,
      getAccessToken: authMocks.getAccessToken,
    }),
  };
});

vi.mock('./routeState', () => ({
  EmptyState: ({ action, description, title }: { action?: ReactNode; description?: ReactNode; title?: ReactNode }) => (
    <section>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </section>
  ),
  ForbiddenState: () => <section><h2>沒有權限查看此頁</h2></section>,
  LoadingState: () => <span>載入中</span>,
  RetryableErrorState: ({ onRetry }: { onRetry?: () => void }) => (
    <section>
      <h2>資料暫時無法載入</h2>
      <button onClick={onRetry} type="button">重試</button>
    </section>
  ),
}));

function renderPropertyListPage() {
  return render(
    <MemoryRouter initialEntries={['/properties']}>
      <Routes>
        <Route path="/properties" element={<PropertyListPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();

  return <output aria-label="目前路徑">{`${location.pathname}${location.search}`}</output>;
}

function renderPropertyMasterDataPage(initialEntry = '/properties/new') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationProbe />
      <Routes>
        <Route path="/properties/new" element={<PropertyMasterDataPage />} />
        <Route path="/properties/:propertyId/edit" element={<PropertyMasterDataPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  authMocks.currentUser = {
    id: 'admin-current',
    email: 'admin@example.com',
    name: '管理員',
    role: 'admin',
  };
});

describe('Property master-data routes', () => {
  it('exposes create, edit, and delete entry points from the property list', async () => {
    vi.mocked(listProperties).mockResolvedValue({
      data: [
        {
          id: 'property-1',
          name: '台北大安物業',
          address: '台北市大安區復興南路一段100號',
          electricity_unit_price: 4.5,
          default_electricity_billing_cadence: 'monthly',
          owner_id: 'owner-1',
          occupancy_summary: {
            total_rooms: 10,
            occupied_rooms: 7,
            vacant_rooms: 2,
            maintenance_rooms: 1,
            occupancy_rate: 0.7,
          },
        },
      ],
    });

    renderPropertyListPage();

    await screen.findByText('台北大安物業');

    expect(screen.getByRole('link', { name: '新增物業' }).getAttribute('href')).toBe('/properties/new');
    expect(screen.getByRole('link', { name: '編輯' }).getAttribute('href')).toBe('/properties/property-1/edit');
    fireEvent.click(screen.getByRole('button', { name: '刪除' }));
    expect(screen.getByRole('heading', { name: '確認刪除物業' })).toBeTruthy();
  });

  it('confirms delete and refetches property list after success', async () => {
    vi.mocked(listProperties)
      .mockResolvedValueOnce({
        data: [
          {
            id: 'property-1',
            name: '台北大安物業',
            address: '台北市大安區復興南路一段100號',
            electricity_unit_price: 4.5,
            default_electricity_billing_cadence: 'monthly',
            owner_id: 'owner-1',
          },
        ],
      })
      .mockResolvedValueOnce({ data: [] });
    vi.mocked(deleteProperty).mockResolvedValue(undefined);

    renderPropertyListPage();
    await screen.findByText('台北大安物業');

    fireEvent.click(screen.getByRole('button', { name: '刪除' }));
    fireEvent.click(screen.getByRole('button', { name: '刪除物業' }));

    await waitFor(() => {
      expect(deleteProperty).toHaveBeenCalledWith('property-1', expect.any(Function));
      expect(listProperties).toHaveBeenCalledTimes(2);
    });
    expect(antdMocks.success).toHaveBeenCalledWith('物業已刪除，正在更新列表。');
  });

  it('keeps the delete modal open when backend rejects the delete', async () => {
    vi.mocked(listProperties).mockResolvedValue({
      data: [
        {
          id: 'property-1',
          name: '台北大安物業',
          address: '台北市大安區復興南路一段100號',
          electricity_unit_price: 4.5,
          default_electricity_billing_cadence: 'monthly',
          owner_id: 'owner-1',
        },
      ],
    });
    vi.mocked(deleteProperty).mockRejectedValue(new ApiError({
      status: 422,
      message: '物業底下有出租中的房間，無法刪除',
      errorCode: 'PROPERTY_HAS_OCCUPIED_ROOMS',
      details: null,
      response: new Response(null, { status: 422 }),
    }));

    renderPropertyListPage();
    await screen.findByText('台北大安物業');

    fireEvent.click(screen.getByRole('button', { name: '刪除' }));
    fireEvent.click(screen.getByRole('button', { name: '刪除物業' }));

    expect(await screen.findByText('刪除物業失敗')).toBeTruthy();
    expect(screen.getByText('此物業仍有出租中房間或關聯資料，暫時無法刪除。請先確認房間與租約狀態後再試。')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '確認刪除物業' })).toBeTruthy();
  });

  it('submits create property payloads and navigates to the created property', async () => {
    vi.mocked(listUsers).mockResolvedValue({
      data: [{ id: 'owner-1', email: 'owner@example.com', name: '王業主', role: 'owner' }],
      pagination: { page: 1, limit: 100, total: 1, total_pages: 1 },
    });
    vi.mocked(createProperty).mockResolvedValue({
      id: 'property-1',
      name: '台北大安物業',
      address: '台北市大安區復興南路一段100號',
    });

    renderPropertyMasterDataPage('/properties/new');

    await screen.findByText('新增物業');
    fireEvent.change(screen.getByLabelText('物業名稱（必填）'), { target: { value: ' 台北大安物業 ' } });
    fireEvent.change(screen.getByLabelText('副標'), { target: { value: ' 大安館 ' } });
    fireEvent.change(screen.getByLabelText('地址（必填）'), { target: { value: ' 台北市大安區復興南路一段100號 ' } });
    fireEvent.change(screen.getByLabelText('聯絡電話'), { target: { value: ' ' } });
    fireEvent.change(screen.getByLabelText('聯絡信箱'), { target: { value: ' owner@example.com ' } });
    fireEvent.change(screen.getByLabelText('電費單價（必填）'), { target: { value: '4.5' } });
    fireEvent.change(screen.getByLabelText('預設電費週期（必填）'), { target: { value: 'monthly' } });
    fireEvent.change(screen.getByLabelText('業主（必填）'), { target: { value: 'owner-1' } });
    fireEvent.change(screen.getByLabelText('常用設施'), { target: { value: ' 電梯, 監視器 ' } });
    fireEvent.change(screen.getByLabelText('備註'), { target: { value: ' 近捷運站 ' } });
    fireEvent.click(screen.getByRole('button', { name: '建立物業' }));

    await waitFor(() => {
      expect(createProperty).toHaveBeenCalledWith(
        {
          name: '台北大安物業',
          subtitle: '大安館',
          address: '台北市大安區復興南路一段100號',
          electricity_unit_price: 4.5,
          default_electricity_billing_cadence: 'monthly',
          owner_id: 'owner-1',
          contact_phone: null,
          contact_email: 'owner@example.com',
          notes: '近捷運站',
          facilities: { 電梯: true, 監視器: true },
        },
        expect.any(Function),
      );
    });
    expect((await screen.findByLabelText('目前路徑')).textContent).toBe('/properties/property-1');
  });

  it('submits edit property payloads without owner and navigates back to detail', async () => {
    vi.mocked(getProperty).mockResolvedValue({
      id: 'property-1',
      name: '台北大安物業',
      subtitle: '大安館',
      address: '台北市',
      electricity_unit_price: 4.5,
      default_electricity_billing_cadence: 'monthly',
      owner_id: 'owner-1',
      contact_phone: '02-2345-6789',
      contact_email: 'owner@example.com',
      notes: '近捷運站',
      facilities: { 電梯: true },
    });
    vi.mocked(listUsers).mockResolvedValue({ data: [], pagination: { page: 1, limit: 100, total: 0, total_pages: 0 } });
    vi.mocked(updateProperty).mockResolvedValue({
      id: 'property-1',
      name: '台北大安新名',
      address: '台北市',
    });

    renderPropertyMasterDataPage('/properties/property-1/edit');

    await screen.findByText('編輯物業');
    fireEvent.change(screen.getByLabelText('物業名稱（必填）'), { target: { value: '台北大安新名' } });
    fireEvent.change(screen.getByLabelText('聯絡電話'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('常用設施'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存變更' }));

    await waitFor(() => {
      expect(updateProperty).toHaveBeenCalledWith(
        'property-1',
        expect.objectContaining({
          name: '台北大安新名',
          contact_phone: null,
          facilities: null,
        }),
        expect.any(Function),
      );
    });
    expect(updateProperty).toHaveBeenCalledWith(
      'property-1',
      expect.not.objectContaining({ owner_id: expect.anything() }),
      expect.any(Function),
    );
    expect((await screen.findByLabelText('目前路徑')).textContent).toBe('/properties/property-1');
  });

  it('maps backend property validation codes to form fields', async () => {
    vi.mocked(listUsers).mockResolvedValue({
      data: [{ id: 'owner-1', email: 'owner@example.com', name: '王業主', role: 'owner' }],
      pagination: { page: 1, limit: 100, total: 1, total_pages: 1 },
    });
    vi.mocked(createProperty).mockRejectedValue(new ApiError({
      status: 400,
      message: 'Name is required.',
      errorCode: 'VALIDATION_NAME_REQUIRED',
      details: null,
      response: new Response(null, { status: 400 }),
    }));

    renderPropertyMasterDataPage('/properties/new');

    await screen.findByText('新增物業');
    fireEvent.change(screen.getByLabelText('物業名稱（必填）'), { target: { value: '台北大安物業' } });
    fireEvent.change(screen.getByLabelText('地址（必填）'), { target: { value: '台北市' } });
    fireEvent.change(screen.getByLabelText('電費單價（必填）'), { target: { value: '4.5' } });
    fireEvent.change(screen.getByLabelText('預設電費週期（必填）'), { target: { value: 'monthly' } });
    fireEvent.change(screen.getByLabelText('業主（必填）'), { target: { value: 'owner-1' } });
    fireEvent.click(screen.getByRole('button', { name: '建立物業' }));

    await waitFor(() => {
      expect(screen.getAllByText('請確認表單內容後再送出。').length).toBeGreaterThanOrEqual(2);
    });
  });

  it('quick-creates an owner and selects the new owner before submit', async () => {
    vi.mocked(listUsers)
      .mockResolvedValueOnce({ data: [], pagination: { page: 1, limit: 100, total: 0, total_pages: 0 } })
      .mockResolvedValueOnce({
        data: [{ id: 'owner-2', email: 'new-owner@example.com', name: '新業主', role: 'owner' }],
        pagination: { page: 1, limit: 100, total: 1, total_pages: 1 },
      });
    vi.mocked(createUser).mockResolvedValue({
      id: 'owner-2',
      email: 'new-owner@example.com',
      name: '新業主',
      role: 'owner',
    });
    vi.mocked(createProperty).mockResolvedValue({
      id: 'property-2',
      name: '台中西區物業',
      address: '台中市西區',
    });

    renderPropertyMasterDataPage('/properties/new');

    await screen.findByText('新增物業');
    fireEvent.click(screen.getByRole('button', { name: '新增業主' }));
    fireEvent.change(screen.getByLabelText('Email（必填）'), { target: { value: ' new-owner@example.com ' } });
    fireEvent.change(screen.getByLabelText('顯示名稱（必填）'), { target: { value: ' 新業主 ' } });
    fireEvent.click(screen.getByRole('button', { name: '建立並選取' }));

    await waitFor(() => {
      expect(createUser).toHaveBeenCalledWith(
        { email: 'new-owner@example.com', name: '新業主', role: 'owner' },
        expect.any(Function),
      );
      expect(listUsers).toHaveBeenCalledTimes(2);
    });

    fireEvent.change(screen.getByLabelText('物業名稱（必填）'), { target: { value: '台中西區物業' } });
    fireEvent.change(screen.getByLabelText('地址（必填）'), { target: { value: '台中市西區' } });
    fireEvent.change(screen.getByLabelText('電費單價（必填）'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('預設電費週期（必填）'), { target: { value: 'bimonthly' } });
    fireEvent.click(screen.getByRole('button', { name: '建立物業' }));

    await waitFor(() => {
      expect(createProperty).toHaveBeenCalledWith(
        expect.objectContaining({ owner_id: 'owner-2' }),
        expect.any(Function),
      );
    });
  });
});
