import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './app/AppShell';
import CurrentUserProfilePage from './app/CurrentUserProfilePage';
import HomeDashboardPage from './app/HomeDashboardPage';
import PropertyDashboardPage from './app/PropertyDashboardPage';
import PropertyListPage from './app/PropertyListPage';
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
          <Route path="properties/:propertyId/rooms" element={<PlaceholderPage pageKey="rooms" />} />
          <Route path="properties/:propertyId/tenants" element={<PlaceholderPage pageKey="tenants" />} />
          <Route path="properties/:propertyId/billing" element={<PlaceholderPage pageKey="billing" />} />
          <Route path="properties/:propertyId/journal" element={<PlaceholderPage pageKey="journal" />} />
          <Route path="properties/:propertyId/reports" element={<PlaceholderPage pageKey="reports" />} />
          <Route path="admin/members" element={<Navigate to="/forbidden" replace />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
