import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './app/AppShell';
import { ForbiddenPage, LoginPlaceholder, NotFoundPage, PlaceholderPage } from './app/pages';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPlaceholder />} />
      <Route path="/forbidden" element={<ForbiddenPage />} />
      <Route element={<AppShell />}>
        <Route index element={<PlaceholderPage pageKey="dashboard" />} />
        <Route path="properties" element={<PlaceholderPage pageKey="properties" />} />
        <Route path="properties/:propertyId" element={<PlaceholderPage pageKey="propertyDashboard" />} />
        <Route path="properties/:propertyId/rooms" element={<PlaceholderPage pageKey="rooms" />} />
        <Route path="properties/:propertyId/tenants" element={<PlaceholderPage pageKey="tenants" />} />
        <Route path="properties/:propertyId/billing" element={<PlaceholderPage pageKey="billing" />} />
        <Route path="properties/:propertyId/journal" element={<PlaceholderPage pageKey="journal" />} />
        <Route path="properties/:propertyId/reports" element={<PlaceholderPage pageKey="reports" />} />
        <Route path="admin/members" element={<Navigate to="/forbidden" replace />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
