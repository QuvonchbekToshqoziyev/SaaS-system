import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import TransactionsPage from './pages/transactions/TransactionsPage';
import CompaniesPage from './pages/companies/CompaniesPage';
import CounterpartiesPage from './pages/counterparties/CounterpartiesPage';
import InventoryPage from './pages/inventory/InventoryPage';
import EmployeesPage from './pages/employees/EmployeesPage';
import BranchesPage from './pages/branches/BranchesPage';
import ReportsPage from './pages/reports/ReportsPage';
import ChatPage from './pages/chat/ChatPage';
import UsersPage from './pages/users/UsersPage';
import AuditPage from './pages/audit/AuditPage';
import SettingsPage from './pages/settings/SettingsPage';
import SubscriptionsPage from './pages/subscriptions/SubscriptionsPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary)' }}>
        <div className="spinner" />
      </div>
    );
  }
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/" replace /> : <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: 'var(--card-bg)',
              color: 'var(--text-primary)',
              border: '1px solid var(--card-border)',
              borderRadius: '12px',
              boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
              fontSize: '14px',
              fontFamily: 'Inter, sans-serif',
            },
            success: { iconTheme: { primary: '#10B981', secondary: '#FFFFFF' } },
            error: { iconTheme: { primary: '#EF4444', secondary: '#FFFFFF' } },
          }}
        />
        <Routes>
          {/* Auth */}
          <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
          <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />

          {/* Protected */}
          <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route index element={<DashboardPage />} />
            <Route path="transactions" element={<TransactionsPage />} />
            <Route path="companies" element={<CompaniesPage />} />
            <Route path="counterparties" element={<CounterpartiesPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="employees" element={<EmployeesPage />} />
            <Route path="branches" element={<BranchesPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="subscriptions" element={<SubscriptionsPage />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
