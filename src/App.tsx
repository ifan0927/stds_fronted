import { Route, Routes } from 'react-router-dom';
import AppShell from './app/AppShell';
import BrandContentPage from './app/BrandContentPage';
import BillingMeterPage from './app/BillingMeterPage';
import CheckoutSettlementPage from './app/CheckoutSettlementPage';
import CurrentUserProfilePage from './app/CurrentUserProfilePage';
import ForceTerminationDetailPage from './app/ForceTerminationDetailPage';
import HomeDashboardPage from './app/HomeDashboardPage';
import JournalPage from './app/JournalPage';
import LeaseDetailPage from './app/LeaseDetailPage';
import LeaseReplacementPage from './app/LeaseReplacementPage';
import MeterHistoryPage from './app/MeterHistoryPage';
import PropertyDashboardPage from './app/PropertyDashboardPage';
import PropertyListPage from './app/PropertyListPage';
import PropertyMasterDataPage from './app/PropertyMasterDataPage';
import PropertyReportsPage from './app/PropertyReportsPage';
import RoomCreatePage from './app/RoomCreatePage';
import RoomDetailPage from './app/RoomDetailPage';
import TenantDetailPage from './app/TenantDetailPage';
import RoomInventoryPage from './app/RoomInventoryPage';
import TenantLeaseRosterPage from './app/TenantLeaseRosterPage';
import UserDetailPage from './app/UserDetailPage';
import UserManagementPage from './app/UserManagementPage';
import { ForbiddenPage, LoginPage, NotFoundPage } from './app/pages';
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
          <Route path="properties/new" element={<PropertyMasterDataPage />} />
          <Route path="properties/:propertyId" element={<PropertyDashboardPage />} />
          <Route path="properties/:propertyId/edit" element={<PropertyMasterDataPage />} />
          <Route path="properties/:propertyId/rooms" element={<RoomInventoryPage />} />
          <Route path="properties/:propertyId/rooms/new" element={<RoomCreatePage />} />
          <Route path="properties/:propertyId/rooms/:roomId" element={<RoomDetailPage />} />
          <Route path="properties/:propertyId/tenants" element={<TenantLeaseRosterPage />} />
          <Route path="properties/:propertyId/tenants/:tenantId" element={<TenantDetailPage />} />
          <Route path="properties/:propertyId/leases/:leaseId/replace" element={<LeaseReplacementPage />} />
          <Route path="properties/:propertyId/leases/:leaseId" element={<LeaseDetailPage />} />
          <Route path="properties/:propertyId/checkout" element={<CheckoutSettlementPage />} />
          <Route path="properties/:propertyId/force-terminations/:forceTerminationId" element={<ForceTerminationDetailPage />} />
          <Route path="properties/:propertyId/billing" element={<BillingMeterPage />} />
          <Route path="properties/:propertyId/billing/meter-history" element={<MeterHistoryPage />} />
          <Route path="properties/:propertyId/journal" element={<JournalPage />} />
          <Route path="properties/:propertyId/reports" element={<PropertyReportsPage />} />
          <Route path="admin/brand" element={<BrandContentPage />} />
          <Route path="admin/members" element={<UserManagementPage />} />
          <Route path="admin/members/:userId" element={<UserDetailPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
