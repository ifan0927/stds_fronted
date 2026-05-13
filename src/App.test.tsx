// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Outlet } from 'react-router-dom';
import App from './App';

vi.mock('./auth', () => ({
  ProtectedRoute: () => <Outlet />,
}));

vi.mock('./app/AppShell', () => ({
  default: () => <Outlet />,
}));

vi.mock('./app/LeaseReplacementPage', () => ({
  default: () => <div>租約更換頁</div>,
}));

vi.mock('./app/LeaseDetailPage', () => ({
  default: () => <div>租約詳情頁</div>,
}));

vi.mock('./app/pages', () => ({
  ForbiddenPage: () => <div>權限不足</div>,
  LoginPage: () => <div>登入</div>,
  NotFoundPage: () => <div>找不到頁面</div>,
}));

vi.mock('./app/BillingMeterPage', () => ({ default: () => null }));
vi.mock('./app/CheckoutSettlementPage', () => ({ default: () => null }));
vi.mock('./app/CurrentUserProfilePage', () => ({ default: () => null }));
vi.mock('./app/ForceTerminationDetailPage', () => ({ default: () => null }));
vi.mock('./app/HomeDashboardPage', () => ({ default: () => null }));
vi.mock('./app/JournalPage', () => ({ default: () => null }));
vi.mock('./app/MeterHistoryPage', () => ({ default: () => null }));
vi.mock('./app/PropertyDashboardPage', () => ({ default: () => null }));
vi.mock('./app/PropertyListPage', () => ({ default: () => null }));
vi.mock('./app/PropertyMasterDataPage', () => ({ default: () => null }));
vi.mock('./app/PropertyReportsPage', () => ({ default: () => null }));
vi.mock('./app/RoomCreatePage', () => ({ default: () => null }));
vi.mock('./app/RoomDetailPage', () => ({ default: () => null }));
vi.mock('./app/RoomInventoryPage', () => ({ default: () => null }));
vi.mock('./app/TenantDetailPage', () => ({ default: () => null }));
vi.mock('./app/TenantLeaseRosterPage', () => ({ default: () => null }));
vi.mock('./app/UserDetailPage', () => ({ default: () => null }));
vi.mock('./app/UserManagementPage', () => ({ default: () => null }));

function renderAppAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('App routing', () => {
  it('routes lease replacement paths to the replacement workflow', () => {
    renderAppAt('/properties/property-1/leases/lease-1/replace');

    expect(screen.getByText('租約更換頁')).toBeTruthy();
    expect(screen.queryByText('找不到頁面')).toBeNull();
    expect(screen.queryByText('租約詳情頁')).toBeNull();
  });
});
