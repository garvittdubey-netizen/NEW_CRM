import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import MainLayout from '@/components/layout/MainLayout';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import UnauthorizedPage from '@/pages/UnauthorizedPage';
import LeadsPage from '@/pages/LeadsPage';
import LeadDetailPage from '@/pages/LeadDetailPage';
import FollowUpsPage from '@/pages/FollowUpsPage';
import CommunicationsPage from '@/pages/CommunicationsPage';
import ActivitiesPage from '@/pages/ActivitiesPage';
import PipelinePage from '@/pages/PipelinePage';
import UsersPage from '@/pages/UsersPage';
import PropertiesPage from '@/pages/PropertiesPage';
import PropertyDetailPage from '@/pages/PropertyDetailPage';
import ClientsPage from '@/pages/ClientsPage';
import ClientDetailPage from '@/pages/ClientDetailPage';
import DealsPage from '@/pages/DealsPage';
import DealBoardPage from '@/pages/DealBoardPage';
import DealDetailPage from '@/pages/DealDetailPage';
import ReportsPage from '@/pages/ReportsPage';
import SettingsPage from '@/pages/SettingsPage';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />

        {/* Protected routes wrapped in layout */}
        <Route element={<ProtectedRoute />}>
          <Route element={<MainLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/leads" element={<LeadsPage />} />
            <Route path="/leads/:id" element={<LeadDetailPage />} />
            <Route path="/pipeline" element={<PipelinePage />} />
            <Route path="/followups" element={<FollowUpsPage />} />
            <Route path="/communications" element={<CommunicationsPage />} />
            <Route path="/activity" element={<ActivitiesPage />} />
            <Route path="/properties" element={<PropertiesPage />} />
            <Route path="/properties/:id" element={<PropertyDetailPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/clients/:id" element={<ClientDetailPage />} />
            <Route path="/deals" element={<DealsPage />} />
            <Route path="/deals/board" element={<DealBoardPage />} />
            <Route path="/deals/:id" element={<DealDetailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          {/* Admin-only routes */}
          <Route element={<ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']} />}>
            <Route element={<MainLayout />}>
              <Route path="/users" element={<UsersPage />} />
              <Route path="/reports" element={<ReportsPage />} />
            </Route>
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}
