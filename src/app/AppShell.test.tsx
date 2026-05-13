// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { listProperties } from '../api';
import type { CurrentUser } from '../api/auth';
import AppShell from './AppShell';

const authMocks = vi.hoisted(() => ({
  currentUser: null as CurrentUser | null,
  getAccessToken: vi.fn(() => 'firebase-token'),
  logout: vi.fn(),
}));

vi.mock('@ant-design/icons', () => ({
  AppstoreOutlined: () => null,
  AuditOutlined: () => null,
  BankOutlined: () => null,
  CarryOutOutlined: () => null,
  DashboardOutlined: () => null,
  FileTextOutlined: () => null,
  GlobalOutlined: () => null,
  HomeOutlined: () => null,
  LogoutOutlined: () => null,
  MenuFoldOutlined: () => null,
  ReadOutlined: () => null,
  TeamOutlined: () => null,
  ToolOutlined: () => null,
  UserOutlined: () => null,
}));

vi.mock('antd', async () => {
  const React = await import('react');

  type MenuItem = {
    key?: string;
    label?: ReactNode;
    children?: MenuItem[];
    type?: string;
  };

  function renderMenuItems(items: MenuItem[] = []): ReactNode {
    return items.map((item) => {
      if (item.type === 'group') {
        return (
          <section key={item.key ?? String(item.label)}>
            <h2>{item.label}</h2>
            {renderMenuItems(item.children)}
          </section>
        );
      }

      return <div key={item.key}>{item.label}</div>;
    });
  }

  const Layout = ({ children, className }: React.PropsWithChildren<{ className?: string }>) => (
    <div className={className}>{children}</div>
  );
  Layout.Header = ({ children }: React.PropsWithChildren) => <header>{children}</header>;
  Layout.Content = ({ children }: React.PropsWithChildren) => <main>{children}</main>;
  Layout.Sider = ({ children }: React.PropsWithChildren) => <aside>{children}</aside>;

  return {
    Avatar: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
    Button: ({
      'aria-label': ariaLabel,
      children,
      onClick,
    }: React.PropsWithChildren<{ 'aria-label'?: string; onClick?: () => void }>) => (
      <button aria-label={ariaLabel} onClick={onClick} type="button">{children}</button>
    ),
    Drawer: ({ children, open }: React.PropsWithChildren<{ open?: boolean }>) => (open ? <aside>{children}</aside> : null),
    Grid: {
      useBreakpoint: () => ({ md: true }),
    },
    Layout,
    Menu: ({ items }: { items?: MenuItem[] }) => <nav>{renderMenuItems(items)}</nav>,
    Select: ({
      'aria-label': ariaLabel,
      disabled,
      options,
      value,
    }: {
      'aria-label'?: string;
      disabled?: boolean;
      options?: Array<{ value: string; label: ReactNode }>;
      value?: string;
    }) => (
      <select aria-label={ariaLabel} disabled={disabled} value={value ?? ''} onChange={() => undefined}>
        <option value="" />
        {options?.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    ),
    Space: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Tag: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
    Typography: {
      Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
    },
  };
});

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');

  return {
    ...actual,
    listProperties: vi.fn(),
  };
});

vi.mock('../auth', async () => {
  const actual = await vi.importActual<typeof import('../auth')>('../auth');

  return {
    ...actual,
    useAuth: () => ({
      currentUser: authMocks.currentUser,
      getAccessToken: authMocks.getAccessToken,
      logout: authMocks.logout,
    }),
  };
});

function makeUser(role: NonNullable<CurrentUser['role']>): CurrentUser {
  return {
    id: `${role}-user`,
    firebase_uid: `${role}-uid`,
    email: `${role}@example.com`,
    name: role,
    role,
    assigned_property_ids: ['property-1'],
  };
}

function renderShell(role: NonNullable<CurrentUser['role']>) {
  authMocks.currentUser = makeUser(role);
  vi.mocked(listProperties).mockResolvedValue({
    data: [{ id: 'property-1', name: '大安物業' }],
  });

  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<div>工作台內容</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  authMocks.currentUser = null;
});

describe('AppShell user management navigation', () => {
  it('shows the checkout workspace entry for the active property', () => {
    renderShell('organizer');

    expect(screen.getByRole('link', { name: '退租審核' }).getAttribute('href')).toBe('/properties/property-1/checkout');
  });

  it.each(['admin', 'organizer', 'staff'] as const)(
    'shows the member management entry for %s',
    (role) => {
      renderShell(role);

      expect(screen.getByRole('link', { name: '成員與權限' }).getAttribute('href')).toBe('/admin/members');
    },
  );

  it.each(['admin', 'organizer'] as const)(
    'shows the brand content entry for %s',
    (role) => {
      renderShell(role);

      expect(screen.getByRole('link', { name: '品牌內容' }).getAttribute('href')).toBe('/admin/brand');
    },
  );

  it.each(['staff', 'owner'] as const)(
    'hides the brand content entry for %s',
    (role) => {
      renderShell(role);

      expect(screen.queryByRole('link', { name: '品牌內容' })).toBeNull();
    },
  );

  it('hides the member management entry for owner', () => {
    renderShell('owner');

    expect(screen.queryByRole('link', { name: '成員與權限' })).toBeNull();
  });
});
