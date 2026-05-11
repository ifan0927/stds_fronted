// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  ApiError,
  assignUserProperties,
  getUser,
  listProperties,
  triggerUserPasswordReset,
  updateUser,
} from '../api';
import type { CurrentUser } from '../api/auth';
import UserDetailPage from './UserDetailPage';

const authMocks = vi.hoisted(() => ({
  currentUser: null as CurrentUser | null,
  getAccessToken: vi.fn(() => 'firebase-token'),
  refreshCurrentUser: vi.fn(),
}));

vi.mock('@ant-design/icons', () => ({
  KeyOutlined: () => null,
  ReloadOutlined: () => null,
  SaveOutlined: () => null,
  TeamOutlined: () => null,
}));

vi.mock('antd', async () => {
  const React = await import('react');

  type FormValue = string | string[];
  type FormInstance = {
    values: Record<string, FormValue>;
    onFinish?: (values: Record<string, FormValue>) => void;
    setFields: (fields: Array<{ name: string; errors: string[] }>) => void;
    setFieldsValue: (values: Record<string, FormValue>) => void;
    submit: () => void;
  };

  const FormContext = React.createContext<FormInstance | null>(null);

  function makeForm(): FormInstance {
    return {
      values: {},
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
      onFinish,
    }: React.PropsWithChildren<{
      form?: FormInstance;
      onFinish?: (values: Record<string, FormValue>) => void;
    }>) => {
      const formInstance = form ?? makeForm();
      formInstance.onFinish = onFinish;

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
            onChange?: (value: unknown) => void;
            value?: FormValue;
          }>, {
            'aria-label': label,
            value: name ? form?.values[name] ?? '' : undefined,
            onChange: (eventOrValue: unknown) => {
              if (!name || !form) {
                return;
              }

              if (Array.isArray(eventOrValue)) {
                form.values[name] = eventOrValue;
                return;
              }

              if (
                typeof eventOrValue === 'object'
                && eventOrValue !== null
                && 'target' in eventOrValue
              ) {
                form.values[name] = String((eventOrValue as { target: { value: string } }).target.value);
                return;
              }

              form.values[name] = String(eventOrValue ?? '');
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
    Alert: ({ description, message }: { description?: ReactNode; message?: ReactNode }) => (
      <div role="alert">
        <div>{message}</div>
        <div>{description}</div>
      </div>
    ),
    App: {
      useApp: () => ({ message: { success: vi.fn() } }),
    },
    Button: ({
      children,
      disabled,
      onClick,
    }: React.PropsWithChildren<{ disabled?: boolean; onClick?: () => void }>) => (
      <button disabled={disabled} onClick={onClick} type="button">{children}</button>
    ),
    Card: ({ children, extra, title }: React.PropsWithChildren<{ extra?: ReactNode; title?: ReactNode }>) => (
      <section>
        {title ? <h2>{title}</h2> : null}
        {extra}
        {children}
      </section>
    ),
    Descriptions: ({ items }: { items?: Array<{ key: string; label: ReactNode; children: ReactNode }> }) => (
      <dl>
        {items?.map((item) => (
          <div key={item.key}>
            <dt>{item.label}</dt>
            <dd>{item.children}</dd>
          </div>
        ))}
      </dl>
    ),
    Form,
    Input: ({
      'aria-label': ariaLabel,
      disabled,
      onChange,
      value,
    }: {
      'aria-label'?: string;
      disabled?: boolean;
      onChange?: (event: { target: { value: string } }) => void;
      value?: FormValue;
    }) => (
      <input
        aria-label={ariaLabel}
        disabled={disabled}
        value={typeof value === 'string' ? value : ''}
        onChange={onChange}
      />
    ),
    Select: ({
      'aria-label': ariaLabel,
      disabled,
      mode,
      onChange,
      options,
      placeholder,
      value,
    }: {
      'aria-label'?: string;
      disabled?: boolean;
      mode?: string;
      onChange?: (value: string | string[]) => void;
      options?: Array<{ value: string; label: ReactNode }>;
      placeholder?: string;
      value?: FormValue;
    }) => (
      <select
        aria-label={ariaLabel ?? placeholder}
        disabled={disabled}
        value={Array.isArray(value) ? value[0] ?? '' : value ?? ''}
        onChange={(event) => onChange?.(mode === 'multiple' ? [event.target.value] : event.target.value)}
      >
        <option value="">{placeholder ?? ''}</option>
        {options?.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    ),
    Space: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
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
    assignUserProperties: vi.fn(),
    getUser: vi.fn(),
    listProperties: vi.fn(),
    triggerUserPasswordReset: vi.fn(),
    updateUser: vi.fn(),
  };
});

vi.mock('../auth', async () => {
  const actual = await vi.importActual<typeof import('../auth')>('../auth');

  return {
    ...actual,
    useAuth: () => ({
      currentUser: authMocks.currentUser,
      getAccessToken: authMocks.getAccessToken,
      refreshCurrentUser: authMocks.refreshCurrentUser,
    }),
  };
});

vi.mock('./routeState', () => ({
  ForbiddenState: () => <section><h2>沒有權限查看此頁</h2></section>,
  LoadingState: () => <span>載入中</span>,
  NotFoundState: () => <section><h2>找不到資料</h2></section>,
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

function makeCurrentUser(role: NonNullable<CurrentUser['role']>): CurrentUser {
  return {
    id: `${role}-current`,
    firebase_uid: `${role}-uid`,
    email: `${role}@example.com`,
    name: role,
    role,
    assigned_property_ids: ['property-1'],
  };
}

function mockReadyDetail() {
  vi.mocked(getUser)
    .mockResolvedValueOnce({
      id: 'staff-1',
      email: 'staff@example.com',
      name: '陳美芳',
      role: 'staff',
      assigned_property_ids: ['property-1'],
    })
    .mockResolvedValue({
      id: 'staff-1',
      email: 'staff@example.com',
      name: '陳美芳',
      role: 'staff',
      assigned_property_ids: ['property-2'],
    });
  vi.mocked(listProperties).mockResolvedValue({
    data: [
      { id: 'property-1', name: '大安物業' },
      { id: 'property-2', name: '信義物業' },
    ],
  });
}

function renderUserDetailPage(initialEntry = '/admin/members/staff-1') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/admin/members/:userId" element={<UserDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  authMocks.currentUser = null;
});

describe('UserDetailPage', () => {
  it.each([
    { status: 403, errorCode: 'FORBIDDEN', text: '沒有權限查看此頁' },
    { status: 404, errorCode: 'USER_NOT_FOUND', text: '找不到資料' },
    { status: 500, errorCode: null, text: '資料暫時無法載入' },
  ])('maps get user $status failures to the expected route state', async ({ errorCode, status, text }) => {
    authMocks.currentUser = makeCurrentUser('admin');
    vi.mocked(listProperties).mockResolvedValue({ data: [] });
    vi.mocked(getUser).mockRejectedValue(createApiError(status, errorCode));

    renderUserDetailPage();
    expect(await screen.findByText(text)).toBeTruthy();
  });

  it('shows admin-only disabled reason for non-admin detail viewers', async () => {
    authMocks.currentUser = makeCurrentUser('staff');
    mockReadyDetail();

    renderUserDetailPage();

    expect((await screen.findAllByText('陳美芳')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('只有系統管理員可以執行此操作。').length).toBeGreaterThan(0);
    expect(screen.getByText('儲存成員資料').closest('button')?.disabled).toBe(true);
    expect(screen.getByText('重寄設定密碼信').closest('button')?.disabled).toBe(true);
  });

  it('updates user fields, sends password reset, and assigns properties with readable labels loaded', async () => {
    authMocks.currentUser = makeCurrentUser('admin');
    mockReadyDetail();
    vi.mocked(updateUser).mockResolvedValue({ id: 'staff-1', name: '王大明', role: 'organizer' });
    vi.mocked(assignUserProperties).mockResolvedValue({ id: 'staff-1', assigned_property_ids: ['property-2'] });
    vi.mocked(triggerUserPasswordReset).mockResolvedValue(undefined);

    renderUserDetailPage();

    expect((await screen.findAllByText('大安物業')).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('顯示名稱'), { target: { value: ' 王大明 ' } });
    fireEvent.change(screen.getByLabelText('角色'), { target: { value: 'organizer' } });
    fireEvent.click(screen.getByText('儲存成員資料'));

    await waitFor(() => {
      expect(updateUser).toHaveBeenCalledWith(
        'staff-1',
        { name: '王大明', role: 'organizer' },
        expect.any(Function),
      );
    });

    fireEvent.click(screen.getByText('重寄設定密碼信'));
    await waitFor(() => {
      expect(triggerUserPasswordReset).toHaveBeenCalledWith('staff-1', expect.any(Function));
    });

    fireEvent.change(screen.getByLabelText('可管理物業'), { target: { value: 'property-2' } });
    fireEvent.click(screen.getByText('儲存物業指派'));

    await waitFor(() => {
      expect(assignUserProperties).toHaveBeenCalledWith(
        'staff-1',
        { property_ids: ['property-2'] },
        expect.any(Function),
      );
    });
    expect(screen.getAllByText('信義物業').length).toBeGreaterThan(0);
  });

  it('does not use raw property UUIDs as the primary UX when property labels fail to load', async () => {
    authMocks.currentUser = makeCurrentUser('admin');
    vi.mocked(getUser).mockResolvedValue({
      id: 'staff-1',
      email: 'staff@example.com',
      name: '陳美芳',
      role: 'staff',
      assigned_property_ids: [
        '10000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000002',
      ],
    });
    vi.mocked(listProperties).mockRejectedValue(createApiError(500));

    renderUserDetailPage();

    expect(await screen.findByText('已指派 2 筆物業')).toBeTruthy();
    expect(screen.getAllByText('物業名稱暫時無法讀取').length).toBeGreaterThan(0);
    expect(screen.queryByText('10000000-0000-0000-0000-000000000001')).toBeNull();
  });
});
