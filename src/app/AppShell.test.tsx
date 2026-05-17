// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
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
  BugOutlined: () => null,
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
      onChange,
      options,
      value,
    }: {
      'aria-label'?: string;
      disabled?: boolean;
      onChange?: (value: string) => void;
      options?: Array<{ value: string; label: ReactNode }>;
      value?: string;
    }) => (
      <select
        aria-label={ariaLabel}
        disabled={disabled}
        value={value ?? ''}
        onChange={(event) => onChange?.(event.target.value)}
      >
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

function LocationProbe() {
  const location = useLocation();

  return <output aria-label="目前路徑">{`${location.pathname}${location.search}`}</output>;
}

function renderShell(role: NonNullable<CurrentUser['role']>, initialEntry = '/') {
  authMocks.currentUser = makeUser(role);
  vi.mocked(listProperties).mockResolvedValue({
    data: [
      { id: 'property-1', name: '大安物業' },
      { id: 'property-2', name: '信義物業' },
    ],
  });

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<><div>工作台內容</div><LocationProbe /></>} />
          <Route path="*" element={<LocationProbe />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
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

  it('shows the configured bug report link as an external navigation target', () => {
    vi.stubEnv('VITE_BUG_REPORT_URL', 'https://forms.gle/SnkF6wcAMc8mfftC8');

    renderShell('organizer');

    const bugReportLink = screen.getByRole('link', { name: 'BUG 回報' });

    expect(bugReportLink.getAttribute('href')).toBe('https://forms.gle/SnkF6wcAMc8mfftC8');
    expect(bugReportLink.getAttribute('target')).toBe('_blank');
  });

  it('hides the bug report link when the URL is not configured', () => {
    vi.stubEnv('VITE_BUG_REPORT_URL', '');

    renderShell('organizer');

    expect(screen.queryByRole('link', { name: 'BUG 回報' })).toBeNull();
  });
});

describe('AppShell property switch navigation', () => {
  async function switchPropertyFrom(initialEntry: string) {
    renderShell('organizer', initialEntry);

    const selector = await screen.findByRole('combobox', { name: '選擇物業' });
    await waitFor(() => expect((selector as HTMLSelectElement).disabled).toBe(false));
    fireEvent.change(selector, { target: { value: 'property-2' } });

    return screen.getByLabelText('目前路徑').textContent;
  }

  it.each([
    ['/properties/property-1/rooms', '/properties/property-2/rooms'],
    ['/properties/property-1/tenants', '/properties/property-2/tenants'],
    ['/properties/property-1/checkout', '/properties/property-2/checkout'],
    ['/properties/property-1/billing', '/properties/property-2/billing'],
    ['/properties/property-1/billing/meter-history?year=2026&roomId=room-1', '/properties/property-2/billing/meter-history'],
    ['/properties/property-1/journal?roomId=room-1', '/properties/property-2/journal'],
    ['/properties/property-1/reports?year=2026&month=5', '/properties/property-2/reports'],
  ])(
    'keeps list-level property workspaces when switching from %s',
    async (initialEntry, expectedPath) => {
      await expect(switchPropertyFrom(initialEntry)).resolves.toBe(expectedPath);
    },
  );

  it.each([
    ['/properties/property-1/rooms/new', '/properties/property-2/rooms'],
    ['/properties/property-1/rooms/room-1?tab=attachments', '/properties/property-2/rooms'],
    ['/properties/property-1/tenants/tenant-1', '/properties/property-2/tenants'],
    ['/properties/property-1/leases/lease-1', '/properties/property-2/tenants'],
    ['/properties/property-1/leases/lease-1/replace', '/properties/property-2/tenants'],
    ['/properties/property-1/force-terminations/force-1', '/properties/property-2/checkout'],
  ])(
    'falls back from property-specific resource routes when switching from %s',
    async (initialEntry, expectedPath) => {
      await expect(switchPropertyFrom(initialEntry)).resolves.toBe(expectedPath);
    },
  );

  it('falls back to the next property dashboard outside mapped daily routes', async () => {
    await expect(switchPropertyFrom('/admin/members')).resolves.toBe('/properties/property-2');
  });

  it('uses neutral selector copy for the switch behavior', () => {
    renderShell('organizer');

    expect(screen.getByText('選擇後會切換目前物業。')).not.toBeNull();
  });
});
