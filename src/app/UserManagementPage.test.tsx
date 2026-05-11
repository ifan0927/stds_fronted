// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ApiError, createUser, listUsers } from '../api';
import type { CurrentUser } from '../api/auth';
import UserManagementPage from './UserManagementPage';

const authMocks = vi.hoisted(() => ({
  currentUser: {
    id: 'admin-current',
    email: 'admin@example.com',
    name: '管理員',
    role: 'admin',
  } as CurrentUser,
  getAccessToken: vi.fn(() => 'firebase-token'),
}));

vi.mock('@ant-design/icons', () => ({
  EyeOutlined: () => null,
  PlusOutlined: () => null,
  ReloadOutlined: () => null,
}));

vi.mock('antd', async () => {
  const React = await import('react');

  type FormInstance = {
    values: Record<string, string>;
    onFinish?: (values: Record<string, string>) => void;
    resetFields: () => void;
    setFields: (fields: Array<{ name: string; errors: string[] }>) => void;
    submit: () => void;
  };

  const FormContext = React.createContext<FormInstance | null>(null);

  function makeForm(): FormInstance {
    return {
      values: {},
      resetFields() {
        this.values = {};
      },
      setFields(fields) {
        fields.forEach((field) => {
          this.values[`error:${field.name}`] = field.errors.join(' ');
        });
      },
      submit() {
        this.onFinish?.({ ...this.values });
      },
    };
  }

  type Column<T> = {
    title?: string;
    dataIndex?: keyof T;
    key?: string;
    render?: (value: unknown, record: T) => ReactNode;
  };

  const Form = Object.assign(
    ({
      children,
      form,
      initialValues,
      onFinish,
    }: React.PropsWithChildren<{
      form?: FormInstance;
      initialValues?: Record<string, string>;
      onFinish?: (values: Record<string, string>) => void;
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
      }: React.PropsWithChildren<{ label?: string; name?: string }>) => {
        const form = React.useContext(FormContext);
        const child = React.isValidElement(children)
          ? React.cloneElement(children as ReactElement<{
            'aria-label'?: string;
            onChange?: (event: { target: { value: string } }) => void;
            value?: string;
          }>, {
            'aria-label': label,
            value: name ? form?.values[name] ?? '' : undefined,
            onChange: (eventOrValue: { target: { value: string } } | string | number | undefined) => {
              if (name && form) {
                form.values[name] = typeof eventOrValue === 'object'
                  ? eventOrValue.target.value
                  : String(eventOrValue ?? '');
              }
            },
          })
          : children;

        return (
          <label>
            {label}
            {child}
            {name && form?.values[`error:${name}`] ? <span>{form.values[`error:${name}`]}</span> : null}
          </label>
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
    }) => (
      <div role="alert">
        <div>{message}</div>
        <div>{description}</div>
      </div>
    ),
    App: {
      useApp: () => ({ message: { success: vi.fn(), warning: vi.fn() } }),
    },
    Button: ({
      children,
      disabled,
      onClick,
    }: React.PropsWithChildren<{ disabled?: boolean; onClick?: () => void; type?: string }>) => (
      <button disabled={disabled} onClick={onClick} type="button">{children}</button>
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
    }: React.PropsWithChildren<{ footer?: ReactNode; open?: boolean; title?: ReactNode }>) => (
      open ? (
        <section aria-label={String(title)}>
          <h2>{title}</h2>
          {children}
          {footer}
        </section>
      ) : null
    ),
    Form,
    Input: (props: { 'aria-label'?: string; onChange?: (event: { target: { value: string } }) => void; value?: string }) => (
      <input aria-label={props['aria-label']} value={props.value ?? ''} onChange={props.onChange} />
    ),
    Select: ({
      'aria-label': ariaLabel,
      onChange,
      options,
      placeholder,
      value,
    }: {
      'aria-label'?: string;
      allowClear?: boolean;
      onChange?: (value: string | number | undefined) => void;
      options?: Array<{ value: string | number; label: ReactNode }>;
      placeholder?: string;
      value?: string | number;
    }) => (
      <select
        aria-label={ariaLabel ?? placeholder}
        value={value ?? ''}
        onChange={(event) => onChange?.(event.target.value || undefined)}
      >
        <option value="">{placeholder ?? ''}</option>
        {options?.map((option) => (
          <option key={String(option.value)} value={option.value}>{option.label}</option>
        ))}
      </select>
    ),
    Space: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Table: <T extends Record<string, unknown>>({
      columns,
      dataSource,
      pagination,
      rowKey,
    }: {
      columns: Array<Column<T>>;
      dataSource: T[];
      pagination?: {
        current?: number;
        onChange?: (page: number, pageSize: number) => void;
        pageSize?: number;
        total?: number;
      };
      rowKey?: (record: T, index?: number) => string;
    }) => (
      <div>
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
        <button
          type="button"
          onClick={() => pagination?.onChange?.((pagination.current ?? 1) + 1, pagination.pageSize ?? 20)}
        >
          下一頁
        </button>
      </div>
    ),
    Tag: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
    Typography: {
      Paragraph: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
      Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
      Title: ({ children }: React.PropsWithChildren) => <h1>{children}</h1>,
    },
  };
});

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');

  return {
    ...actual,
    createUser: vi.fn(),
    listUsers: vi.fn(),
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

function createApiError(status: number, errorCode: string | null = null) {
  return new ApiError({
    status,
    message: 'Backend error.',
    errorCode,
    details: null,
    response: new Response(null, { status }),
  });
}

function LocationProbe() {
  const location = useLocation();

  return <output aria-label="目前路徑">{`${location.pathname}${location.search}`}</output>;
}

function renderUserManagementPage(initialEntry = '/admin/members') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationProbe />
      <Routes>
        <Route path="/admin/members" element={<UserManagementPage />} />
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

describe('UserManagementPage', () => {
  it('loads users from role and pagination URL state', async () => {
    vi.mocked(listUsers).mockResolvedValue({
      data: [{ id: 'staff-1', email: 'staff@example.com', name: '陳美芳', role: 'staff' }],
      pagination: { page: 2, limit: 50, total: 60, total_pages: 2 },
    });

    renderUserManagementPage('/admin/members?role=staff&page=2&limit=50');

    await screen.findByText('陳美芳');

    expect(listUsers).toHaveBeenCalledWith(
      expect.any(Function),
      { role: 'staff', page: 2, limit: 50 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('updates page and limit query state from table pagination', async () => {
    vi.mocked(listUsers).mockResolvedValue({
      data: [{ id: 'staff-1', email: 'staff@example.com', name: '陳美芳', role: 'staff' }],
      pagination: { page: 1, limit: 20, total: 60, total_pages: 3 },
    });

    renderUserManagementPage('/admin/members?role=staff');
    await screen.findByText('陳美芳');

    fireEvent.click(screen.getByText('下一頁'));

    expect((await screen.findByLabelText('目前路徑')).textContent).toBe('/admin/members?role=staff&page=2');
  });

  it('creates a user and navigates to the created detail page', async () => {
    vi.mocked(listUsers).mockResolvedValue({ data: [], pagination: { page: 1, limit: 20, total: 0, total_pages: 0 } });
    vi.mocked(createUser).mockResolvedValue({
      id: 'staff-1',
      email: 'staff@example.com',
      name: '陳美芳',
      role: 'staff',
    });

    renderUserManagementPage();
    await screen.findByText('目前沒有符合條件的成員');

    fireEvent.click(screen.getByText('新增成員'));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'staff@example.com' } });
    fireEvent.change(screen.getByLabelText('顯示名稱'), { target: { value: ' 陳美芳 ' } });
    fireEvent.change(screen.getByLabelText('角色'), { target: { value: 'staff' } });
    fireEvent.click(screen.getByText('建立並寄出設定信'));

    await waitFor(() => {
      expect(createUser).toHaveBeenCalledWith(
        {
          email: 'staff@example.com',
          name: '陳美芳',
          role: 'staff',
        },
        expect.any(Function),
      );
    });
    expect((await screen.findByLabelText('目前路徑')).textContent).toBe('/admin/members/staff-1');
  });

  it('limits organizer create role to owner and submits owner payload', async () => {
    authMocks.currentUser = {
      id: 'organizer-current',
      email: 'organizer@example.com',
      name: '營運',
      role: 'organizer',
    };
    vi.mocked(listUsers).mockResolvedValue({ data: [], pagination: { page: 1, limit: 20, total: 0, total_pages: 0 } });
    vi.mocked(createUser).mockResolvedValue({
      id: 'owner-1',
      email: 'owner@example.com',
      name: '王業主',
      role: 'owner',
    });

    renderUserManagementPage();
    await screen.findByText('目前沒有符合條件的成員');

    fireEvent.click(screen.getByText('新增成員'));
    const roleSelect = screen.getByLabelText('角色') as HTMLSelectElement;
    expect(Array.from(roleSelect.options).map((option) => option.value)).toEqual(['', 'owner']);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@example.com' } });
    fireEvent.change(screen.getByLabelText('顯示名稱'), { target: { value: ' 王業主 ' } });
    fireEvent.click(screen.getByText('建立並寄出設定信'));

    await waitFor(() => {
      expect(createUser).toHaveBeenCalledWith(
        {
          email: 'owner@example.com',
          name: '王業主',
          role: 'owner',
        },
        expect.any(Function),
      );
    });
  });

  it('keeps staff list readable without an enabled create action', async () => {
    authMocks.currentUser = {
      id: 'staff-current',
      email: 'viewer@example.com',
      name: '櫃檯',
      role: 'staff',
    };
    vi.mocked(listUsers).mockResolvedValue({
      data: [{ id: 'staff-1', email: 'staff@example.com', name: '陳美芳', role: 'staff' }],
      pagination: { page: 1, limit: 20, total: 1, total_pages: 1 },
    });

    renderUserManagementPage();
    await screen.findByText('陳美芳');

    const createButton = screen.getByRole('button', { name: '新增成員' });
    expect((createButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(createButton);
    expect(screen.queryByLabelText('新增成員')).toBeNull();
  });

  it('surfaces conflict errors when create user email already exists', async () => {
    vi.mocked(listUsers).mockResolvedValue({ data: [], pagination: { page: 1, limit: 20, total: 0, total_pages: 0 } });
    vi.mocked(createUser).mockRejectedValue(createApiError(409, 'EMAIL_ALREADY_EXISTS'));

    renderUserManagementPage();
    await screen.findByText('目前沒有符合條件的成員');

    fireEvent.click(screen.getByText('新增成員'));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'used@example.com' } });
    fireEvent.change(screen.getByLabelText('顯示名稱'), { target: { value: '既有成員' } });
    fireEvent.click(screen.getByText('建立並寄出設定信'));

    expect(await screen.findByText('此 email 已被使用，請改用其他 email。')).toBeTruthy();
  });

  it('shows forbidden and retryable list states distinctly', async () => {
    vi.mocked(listUsers)
      .mockRejectedValueOnce(createApiError(403, 'FORBIDDEN'))
      .mockRejectedValueOnce(createApiError(500))
      .mockResolvedValueOnce({
        data: [{ id: 'admin-1', email: 'admin@example.com', name: '管理員', role: 'admin' }],
        pagination: { page: 1, limit: 20, total: 1, total_pages: 1 },
      });

    const { unmount } = renderUserManagementPage();
    expect(await screen.findByText('沒有權限查看此頁')).toBeTruthy();

    unmount();
    renderUserManagementPage();
    expect(await screen.findByText('資料暫時無法載入')).toBeTruthy();

    fireEvent.click(screen.getByText('重試'));
    expect(await screen.findByText('管理員')).toBeTruthy();
  });
});
