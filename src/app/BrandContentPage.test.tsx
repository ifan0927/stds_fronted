// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  createBrandFAQItem,
  getBrandProfile,
  listBrandFAQItems,
  upsertBrandProfile,
} from '../api';
import BrandContentPage from './BrandContentPage';

const authMocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(() => 'firebase-token'),
}));

const antdMocks = vi.hoisted(() => ({
  success: vi.fn(),
}));

vi.mock('@ant-design/icons', () => ({
  EditOutlined: () => null,
  PlusOutlined: () => null,
  ReloadOutlined: () => null,
  SaveOutlined: () => null,
}));

vi.mock('antd', async () => {
  const React = await import('react');

  type FormInstance = {
    values: Record<string, string | number | boolean | undefined>;
    onFinish?: (values: Record<string, string | number | boolean | undefined>) => void;
    resetFields: () => void;
    setFields: (fields: Array<{ name: string; errors: string[] }>) => void;
    setFieldsValue: (values: Record<string, string | number | boolean | undefined>) => void;
    submit: () => void;
  };

  type Column<T> = {
    dataIndex?: keyof T;
    key?: string;
    render?: (value: unknown, record: T) => ReactNode;
    title?: string;
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
      form?: FormInstance;
      initialValues?: Record<string, string | number | boolean | undefined>;
      layout?: string;
      onFinish?: (values: Record<string, string | number | boolean | undefined>) => void;
      requiredMark?: boolean;
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
        label?: string;
        name?: string;
        rules?: unknown[];
      }>) => {
        const form = React.useContext(FormContext);
        const child = React.isValidElement(children)
          ? React.cloneElement(children as ReactElement<{
            'aria-label'?: string;
            onChange?: (eventOrValue: { target: { value: string } } | string | number | boolean | undefined) => void;
            value?: string | number | boolean;
          }>, {
            'aria-label': label,
            value: name ? form?.values[name] ?? '' : undefined,
            onChange: (eventOrValue: { target: { value: string } } | string | number | boolean | undefined) => {
              if (!name || !form) {
                return;
              }

              form.values[name] = typeof eventOrValue === 'object'
                ? eventOrValue.target.value
                : eventOrValue;
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
    Alert: ({ description, message }: { description?: ReactNode; message?: ReactNode }) => (
      <div role="alert"><div>{message}</div><div>{description}</div></div>
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
    Drawer: ({ children, open, title }: React.PropsWithChildren<{ open?: boolean; title?: ReactNode }>) => (
      open ? <section aria-label={String(title)}><h2>{title}</h2>{children}</section> : null
    ),
    Form,
    Input: Object.assign(
      (props: {
        'aria-label'?: string;
        onChange?: (event: { target: { value: string } }) => void;
        value?: string | number | boolean;
      }) => <input aria-label={props['aria-label']} value={String(props.value ?? '')} onChange={props.onChange} />,
      {
        TextArea: (props: {
          'aria-label'?: string;
          onChange?: (event: { target: { value: string } }) => void;
          rows?: number;
          value?: string | number | boolean;
        }) => <textarea aria-label={props['aria-label']} value={String(props.value ?? '')} onChange={props.onChange} />,
      },
    ),
    InputNumber: (props: {
      'aria-label'?: string;
      className?: string;
      min?: number;
      onChange?: (value: number | undefined) => void;
      precision?: number;
      value?: string | number | boolean;
    }) => (
      <input
        aria-label={props['aria-label']}
        type="number"
        value={String(props.value ?? '')}
        onChange={(event) => props.onChange?.(event.target.value === '' ? undefined : Number(event.target.value))}
      />
    ),
    Select: ({
      'aria-label': ariaLabel,
      onChange,
      options,
      value,
    }: {
      'aria-label'?: string;
      onChange?: (value: string | boolean | undefined) => void;
      options?: Array<{ value: string | boolean; label: ReactNode }>;
      value?: string | boolean;
    }) => (
      <select
        aria-label={ariaLabel}
        value={String(value ?? '')}
        onChange={(event) => {
          const raw = event.target.value;
          onChange?.(raw === 'true' ? true : raw === 'false' ? false : raw || undefined);
        }}
      >
        <option value="" />
        {options?.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>{option.label}</option>
        ))}
      </select>
    ),
    Space: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Spin: () => <span>載入中</span>,
    Table: <T extends Record<string, unknown>>({
      columns,
      dataSource,
      rowKey,
    }: {
      columns: Array<Column<T>>;
      dataSource: T[];
      pagination?: false;
      rowKey?: (record: T, index?: number) => string;
      scroll?: { x?: number };
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
    Tabs: ({ items }: { items?: Array<{ key: string; label: ReactNode; children: ReactNode }> }) => (
      <div>
        {items?.map((item) => (
          <section key={item.key}>
            <h2>{item.label}</h2>
            {item.children}
          </section>
        ))}
      </div>
    ),
    Tag: ({ children }: React.PropsWithChildren<{ color?: string }>) => <span>{children}</span>,
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
    createBrandFAQItem: vi.fn(),
    deactivateBrandFAQItem: vi.fn(),
    getBrandProfile: vi.fn(),
    listBrandFAQItems: vi.fn(),
    updateBrandFAQItem: vi.fn(),
    upsertBrandProfile: vi.fn(),
  };
});

vi.mock('../auth', async () => {
  const actual = await vi.importActual<typeof import('../auth')>('../auth');

  return {
    ...actual,
    useAuth: () => ({
      getAccessToken: authMocks.getAccessToken,
    }),
  };
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/brand']}>
      <Routes>
        <Route path="/admin/brand" element={<BrandContentPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('BrandContentPage', () => {
  it('loads brand profile and FAQ items', async () => {
    vi.mocked(getBrandProfile).mockResolvedValue({
      id: 'brand-1',
      brand_name: 'STDS Demo',
      contact_email: 'hello@example.com',
      version: 1,
    });
    vi.mocked(listBrandFAQItems).mockResolvedValue({
      data: [{ id: 'faq-1', question: '如何預約？', answer: '請來電預約。', sort_order: 1, is_active: true, version: 1 }],
    });

    renderPage();

    expect(await screen.findByRole('heading', { name: '品牌內容', level: 1 })).toBeTruthy();
    expect(screen.getByLabelText('品牌名稱（必填）')).toHaveProperty('value', 'STDS Demo');
    expect(screen.getByText('如何預約？')).toBeTruthy();
    expect(listBrandFAQItems).toHaveBeenCalledWith(
      expect.any(Function),
      { include_inactive: true },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('saves profile with the current version', async () => {
    vi.mocked(getBrandProfile).mockResolvedValue({
      id: 'brand-1',
      brand_name: 'STDS Demo',
      version: 7,
    });
    vi.mocked(listBrandFAQItems).mockResolvedValue({ data: [] });
    vi.mocked(upsertBrandProfile).mockResolvedValue({
      id: 'brand-1',
      brand_name: 'STDS Demo Plus',
      version: 8,
    });

    renderPage();
    await screen.findByRole('heading', { name: '品牌內容', level: 1 });

    fireEvent.change(screen.getByLabelText('品牌名稱（必填）'), { target: { value: ' STDS Demo Plus ' } });
    fireEvent.change(screen.getByLabelText('聯絡信箱'), { target: { value: ' hello@example.com ' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存品牌基本資訊' }));

    await waitFor(() => {
      expect(upsertBrandProfile).toHaveBeenCalledWith(
        {
          brand_name: 'STDS Demo Plus',
          contact_phone: null,
          contact_email: 'hello@example.com',
          contact_address: null,
          version: 7,
        },
        expect.any(Function),
      );
    });
  });

  it('creates a FAQ item and reloads the list', async () => {
    vi.mocked(getBrandProfile).mockResolvedValue({ id: 'brand-1', brand_name: 'STDS Demo', version: 1 });
    vi.mocked(listBrandFAQItems)
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [{ id: 'faq-1', question: '可以看房嗎？', answer: '可以。', sort_order: 2, is_active: true, version: 1 }],
      });
    vi.mocked(createBrandFAQItem).mockResolvedValue({
      id: 'faq-1',
      question: '可以看房嗎？',
      answer: '可以。',
      sort_order: 2,
      is_active: true,
      version: 1,
    });

    renderPage();
    await screen.findByRole('heading', { name: '品牌內容', level: 1 });

    fireEvent.click(screen.getByRole('button', { name: '新增 FAQ' }));
    fireEvent.change(screen.getByLabelText('問題（必填）'), { target: { value: ' 可以看房嗎？ ' } });
    fireEvent.change(screen.getByLabelText('回答（必填）'), { target: { value: ' 可以。 ' } });
    fireEvent.change(screen.getByLabelText('排序值'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: '建立 FAQ' }));

    await waitFor(() => {
      expect(createBrandFAQItem).toHaveBeenCalledWith(
        { question: '可以看房嗎？', answer: '可以。', sort_order: 2, is_active: true },
        expect.any(Function),
      );
      expect(listBrandFAQItems).toHaveBeenCalledTimes(2);
    });
  });
});
