import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './app/AppShell';
import BillingMeterPage from './app/BillingMeterPage';
import CurrentUserProfilePage from './app/CurrentUserProfilePage';
import HomeDashboardPage from './app/HomeDashboardPage';
import LeaseDetailPage from './app/LeaseDetailPage';
import MeterHistoryPage from './app/MeterHistoryPage';
import PropertyDashboardPage from './app/PropertyDashboardPage';
import PropertyListPage from './app/PropertyListPage';
import PropertyReportsPage from './app/PropertyReportsPage';
import RoomCreatePage from './app/RoomCreatePage';
import RoomDetailPage from './app/RoomDetailPage';
import TenantDetailPage from './app/TenantDetailPage';
import RoomInventoryPage from './app/RoomInventoryPage';
import TenantLeaseRosterPage from './app/TenantLeaseRosterPage';
import { ForbiddenPage, LoginPage, NotFoundPage, PlaceholderPage } from './app/pages';
import { ProtectedRoute } from './auth';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forbidden" element={<ForbiddenPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<HomeDashboardPage />} />
          <Route path="account" element={<CurrentUserProfilePage />} />
          <Route path="properties" element={<PropertyListPage />} />
          <Route path="properties/:propertyId" element={<PropertyDashboardPage />} />
          <Route path="properties/:propertyId/rooms" element={<RoomInventoryPage />} />
          <Route path="properties/:propertyId/rooms/new" element={<RoomCreatePage />} />
          <Route path="properties/:propertyId/rooms/:roomId" element={<RoomDetailPage />} />
          <Route path="properties/:propertyId/tenants" element={<TenantLeaseRosterPage />} />
          <Route path="properties/:propertyId/tenants/:tenantId" element={<TenantDetailPage />} />
          <Route path="properties/:propertyId/leases/:leaseId" element={<LeaseDetailPage />} />
          <Route path="properties/:propertyId/checkout" element={<PlaceholderPage pageKey="checkout" />} />
          <Route path="properties/:propertyId/billing" element={<BillingMeterPage />} />
          <Route path="properties/:propertyId/billing/meter-history" element={<MeterHistoryPage />} />
          <Route path="properties/:propertyId/journal" element={<PlaceholderPage pageKey="journal" />} />
          <Route path="properties/:propertyId/reports" element={<PropertyReportsPage />} />
          <Route path="admin/members" element={<Navigate to="/forbidden" replace />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
