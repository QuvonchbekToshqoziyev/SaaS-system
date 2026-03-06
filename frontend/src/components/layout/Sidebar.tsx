import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard, ArrowLeftRight, Building2, Users, Package,
  UserCheck, GitBranch, BarChart3, MessageCircle, Shield,
  Settings, LogOut, Menu, X,
} from 'lucide-react';
import { useState } from 'react';

const mainNav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/transactions', icon: ArrowLeftRight, label: 'Tranzaksiyalar' },
  { to: '/companies', icon: Building2, label: 'Kompaniyalar' },
  { to: '/counterparties', icon: Users, label: 'Kontragentlar' },
  { to: '/inventory', icon: Package, label: 'Ombor' },
  { to: '/employees', icon: UserCheck, label: 'Xodimlar' },
  { to: '/branches', icon: GitBranch, label: 'Filiallar' },
];

const secondaryNav = [
  { to: '/reports', icon: BarChart3, label: 'Hisobotlar' },
  { to: '/chat', icon: MessageCircle, label: 'Chat' },
  // { to: '/subscriptions', icon: CreditCard, label: 'Obuna & To\'lov' }, // admin manages subscriptions
  { to: '/audit', icon: Shield, label: 'Audit log' },
  { to: '/users', icon: Users, label: 'Foydalanuvchilar' },
  { to: '/settings', icon: Settings, label: 'Sozlamalar' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const initials = user ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() : '??';

  const roleLabels: Record<string, string> = {
    platform_admin: 'Admin',
    accountant_admin: 'Bosh hisobchi',
    accountant: 'Hisobchi',
    client_admin: 'Kompaniya admin',
    client_user: 'Foydalanuvchi',
    viewer: 'Ko\'ruvchi',
  };

  return (
    <>
      <button className="navbar-btn mobile-menu-btn" onClick={() => setMobileOpen(!mobileOpen)}
        style={{ position: 'fixed', top: 16, left: 16, zIndex: 200 }}>
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="logo-icon">AH</div>
          <div className="logo-text">Aniq <span>Hisob</span></div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section">
            <div className="sidebar-section-title">Asosiy</div>
            {mainNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                onClick={() => setMobileOpen(false)}
              >
                <item.icon className="sidebar-link-icon" size={20} />
                {item.label}
              </NavLink>
            ))}
          </div>

          <div className="sidebar-section">
            <div className="sidebar-section-title">Qo'shimcha</div>
            {secondaryNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                onClick={() => setMobileOpen(false)}
              >
                <item.icon className="sidebar-link-icon" size={20} />
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="sidebar-user">
          <div className="user-avatar">{initials}</div>
          <div className="user-info">
            <div className="user-name">{user?.firstName} {user?.lastName}</div>
            <div className="user-role">{roleLabels[user?.role || ''] || user?.role}</div>
          </div>
          <button className="navbar-btn" onClick={logout} title="Chiqish" style={{ width: 32, height: 32, borderRadius: 6, borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)' }}>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
    </>
  );
}
