"use client";

import { useAuth, type AppCapability } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePathname, useRouter } from 'next/navigation';
import { Plane, PlaneTakeoff, LayoutDashboard, LogOut, ArrowRightLeft, UserCircle, Settings, BarChart3, Wallet, PackageOpen, BriefcaseBusiness, Users, ShieldCheck, MessageCircle, History, Bell, CheckCheck, Menu, MoreHorizontal, X, Activity, Warehouse } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import ThemeLanguageSwitcher from '@/components/ui/ThemeLanguageSwitcher';
import { api } from '@/lib/api';
import NewOperationLauncher from '@/components/layout/NewOperationLauncher';

type NotificationRow = {
  id: string;
  title: string;
  body: string;
  type?: string;
  readAt?: string | null;
  createdAt: string;
  firm?: { id: string; name: string | null; kind?: string | null } | null;
};

type NavKey =
  | 'navAdminDashboard'
  | 'navDashboard'
  | 'navAdmins'
  | 'navAuditLog'
  | 'navMonitoring'
  | 'navAirlines'
  | 'navFirms'
  | 'navFlights'
  | 'navTours'
  | 'navServices'
  | 'navTransactions'
  | 'navKassa'
  | 'navInventory'
  | 'navEmployees'
  | 'navChat'
  | 'navReports'
  | 'navSettings';

type NavLinkItem = {
  key: NavKey;
  href: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  capability: AppCapability;
};

type NavGroup = {
  label: string;
  links: NavLinkItem[];
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading, savedAccounts, switchAccount, forgetAccount } = useAuth();
  const { t } = useLanguage();
  const pathname = usePathname();
  const router = useRouter();
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const normalizedRole = String(user?.role || '').toLowerCase();
  const isReadOnly = Boolean(user?.readOnlyAccess);
  const firmRole = String(user?.firmRole || 'FIRM_ADMIN').toUpperCase();
  const isAirlineFirm = false;
  const isFirmKassir = normalizedRole === 'firm' && firmRole === 'KASSIR';
  const isWarehouseManager = normalizedRole === 'firm' && firmRole === 'OMBOR_MUDIRI';
  const isKassirAllowedPath = pathname.startsWith('/kassa') || pathname.startsWith('/chat') || pathname.startsWith('/settings');
  const isWarehouseManagerAllowedPath = pathname.startsWith('/inventory');

  useEffect(() => {
    const id = window.setTimeout(() => setCurrentTime(Date.now()), 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!isLoading && isFirmKassir && !isKassirAllowedPath) {
      router.replace('/kassa');
    }
  }, [isLoading, isFirmKassir, isKassirAllowedPath, router]);

  useEffect(() => {
    if (!isLoading && isWarehouseManager && !isWarehouseManagerAllowedPath) router.replace('/inventory');
  }, [isLoading, isWarehouseManager, isWarehouseManagerAllowedPath, router]);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [isLoading, router, user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const loadNotifications = async () => {
      try {
        const res = await api.get('/notifications', { params: { limit: 20 } });
        if (cancelled) return;
        setNotifications(Array.isArray(res.data?.items) ? res.data.items : []);
        setUnreadCount(Number(res.data?.unreadCount || 0));
      } catch {
        // Non-fatal; the rest of the dashboard should stay usable.
      }
    };
    loadNotifications();
    const id = window.setInterval(loadNotifications, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [user]);

  useEffect(() => {
    const overlayOpen = isMobileMenuOpen || isNotificationsOpen || isAccountModalOpen;
    if (!overlayOpen) return;
    const closeOverlay = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsMobileMenuOpen(false);
      setIsNotificationsOpen(false);
      setIsAccountModalOpen(false);
    };
    document.addEventListener('keydown', closeOverlay);
    return () => document.removeEventListener('keydown', closeOverlay);
  }, [isAccountModalOpen, isMobileMenuOpen, isNotificationsOpen]);

  const markNotificationRead = async (id: string) => {
    if (isReadOnly) return;
    try {
      await api.post(`/notifications/${id}/read`);
      setNotifications((rows) => rows.map((row) => row.id === id ? { ...row, readAt: row.readAt || new Date().toISOString() } : row));
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch {
      // ignore
    }
  };

  const markAllNotificationsRead = async () => {
    if (isReadOnly) return;
    try {
      await api.post('/notifications/read-all');
      const now = new Date().toISOString();
      setNotifications((rows) => rows.map((row) => ({ ...row, readAt: row.readAt || now })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  };

  const goToAccountHome = (account: { role?: unknown; firmKind?: unknown }) => {
    const role = String(account?.role || '').toLowerCase();
    if (role === 'firm') {
      router.push('/firm');
      return;
    }
    router.push('/admin');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <span className="text-sm font-medium">Authenticating…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <div className="min-h-screen bg-background" />;
  }

  const hasCapability = (capability: AppCapability) => user.capabilities.includes(capability);
  const visible = (links: NavLinkItem[]) => links.filter((link) => hasCapability(link.capability));

  const airlineNavLinks: NavLinkItem[] = visible([
    { key: 'navFlights', href: '/flights', icon: PlaneTakeoff, capability: 'flights.view' },
    { key: 'navTransactions', href: '/transactions', icon: ArrowRightLeft, capability: 'finance.transactions.view' },
    { key: 'navKassa', href: '/kassa', icon: Wallet, capability: 'finance.kassa.view' },
    { key: 'navChat', href: '/chat', icon: MessageCircle, capability: 'chat.view' },
    { key: 'navReports', href: '/reports', icon: BarChart3, capability: 'reports.view' },
    { key: 'navSettings', href: '/settings', icon: Settings, capability: 'settings.view' },
  ]);

  const firmNavLinks = isAirlineFirm ? airlineNavLinks : isWarehouseManager ? [
    { key: 'navInventory' as const, href: '/inventory', icon: Warehouse, capability: 'inventory.view' as const },
  ] : isFirmKassir ? [
    { key: 'navKassa' as const, href: '/kassa', icon: Wallet, capability: 'finance.kassa.view' as const },
    { key: 'navChat' as const, href: '/chat', icon: MessageCircle, capability: 'chat.view' as const },
    { key: 'navSettings' as const, href: '/settings', icon: Settings, capability: 'settings.view' as const },
  ] : [
    { key: 'navDashboard' as const, href: '/firm', icon: LayoutDashboard, capability: 'dashboard.view' as const },
    { key: 'navFirms' as const, href: '/firms', icon: UserCircle, capability: 'organizations.view' as const },
    { key: 'navFlights' as const, href: '/flights', icon: PlaneTakeoff, capability: 'flights.view' as const },
    { key: 'navTours' as const, href: '/tours', icon: PackageOpen, capability: 'tours.view' as const },
    { key: 'navServices' as const, href: '/services', icon: BriefcaseBusiness, capability: 'services.view' as const },
    { key: 'navInventory' as const, href: '/inventory', icon: Warehouse, capability: 'inventory.view' as const },
    { key: 'navTransactions' as const, href: '/transactions', icon: ArrowRightLeft, capability: 'finance.transactions.view' as const },
    { key: 'navKassa' as const, href: '/kassa', icon: Wallet, capability: 'finance.kassa.view' as const },
    { key: 'navEmployees' as const, href: '/employees', icon: Users, capability: 'employees.view' as const },
    { key: 'navChat' as const, href: '/chat', icon: MessageCircle, capability: 'chat.view' as const },
    { key: 'navReports' as const, href: '/reports', icon: BarChart3, capability: 'reports.view' as const },
    { key: 'navSettings' as const, href: '/settings', icon: Settings, capability: 'settings.view' as const },
  ].filter((link) => hasCapability(link.capability));

  const adminNavLinks: NavLinkItem[] = visible([
    { key: 'navAdminDashboard', href: '/admin', icon: LayoutDashboard, capability: 'dashboard.view' },
    { key: 'navAdmins', href: '/admins', icon: ShieldCheck, capability: 'platform.admins.manage' },
    { key: 'navAuditLog', href: '/audit-log', icon: History, capability: 'audit.view' },
    { key: 'navMonitoring', href: '/monitoring', icon: Activity, capability: 'monitoring.view' },
    { key: 'navAirlines', href: '/airlines', icon: Plane, capability: 'airlines.view' },
    { key: 'navFirms', href: '/firms', icon: UserCircle, capability: 'organizations.view' },
    { key: 'navFlights', href: '/flights', icon: PlaneTakeoff, capability: 'flights.view' },
    { key: 'navTours', href: '/tours', icon: PackageOpen, capability: 'tours.view' },
    { key: 'navServices', href: '/services', icon: BriefcaseBusiness, capability: 'services.view' },
    { key: 'navInventory', href: '/inventory', icon: Warehouse, capability: 'inventory.view' },
    { key: 'navTransactions', href: '/transactions', icon: ArrowRightLeft, capability: 'finance.transactions.view' },
    { key: 'navKassa', href: '/kassa', icon: Wallet, capability: 'finance.kassa.view' },
    { key: 'navEmployees', href: '/employees', icon: Users, capability: 'employees.view' },
    { key: 'navChat', href: '/chat', icon: MessageCircle, capability: 'chat.view' },
    { key: 'navReports', href: '/reports', icon: BarChart3, capability: 'reports.view' },
    { key: 'navSettings', href: '/settings', icon: Settings, capability: 'settings.view' },
  ]);

  const navLinks = normalizedRole === 'firm' ? firmNavLinks : adminNavLinks;
  const navGroups: NavGroup[] = normalizedRole === 'firm'
    ? isAirlineFirm
      ? [
          { label: 'Inventory', links: airlineNavLinks.filter((link) => ['/flights'].includes(link.href)) },
          { label: 'Money', links: airlineNavLinks.filter((link) => ['/transactions', '/kassa', '/reports'].includes(link.href)) },
          { label: 'Workspace', links: airlineNavLinks.filter((link) => ['/chat', '/settings'].includes(link.href)) },
        ]
      : isWarehouseManager
        ? [{ label: 'Ombor nazorati', links: firmNavLinks }]
      : isFirmKassir
        ? [{ label: 'Kassa Access', links: firmNavLinks }]
        : [
            { label: 'Overview', links: firmNavLinks.filter((link) => ['/firm', '/reports'].includes(link.href)) },
            { label: 'Operations', links: firmNavLinks.filter((link) => ['/firms', '/flights', '/tours', '/services', '/inventory', '/employees'].includes(link.href)) },
            { label: 'Money', links: firmNavLinks.filter((link) => ['/transactions', '/kassa'].includes(link.href)) },
            { label: 'Workspace', links: firmNavLinks.filter((link) => ['/chat', '/settings'].includes(link.href)) },
          ]
    : [
        { label: normalizedRole === 'superadmin' ? 'Command Center' : 'Overview', links: adminNavLinks.filter((link) => ['/admin', '/reports'].includes(link.href)) },
        { label: 'Organizations', links: adminNavLinks.filter((link) => ['/admins', '/airlines', '/firms', '/employees'].includes(link.href)) },
        { label: 'Operations', links: adminNavLinks.filter((link) => ['/flights', '/tours', '/services', '/inventory'].includes(link.href)) },
        { label: 'Finance', links: adminNavLinks.filter((link) => ['/transactions', '/kassa'].includes(link.href)) },
        { label: 'Oversight', links: adminNavLinks.filter((link) => ['/audit-log', '/monitoring', '/chat', '/settings'].includes(link.href)) },
      ];

  const activeNavLink = navLinks.find((link) => {
    const isTopLevel = link.href === '/firm' || link.href === '/admin';
    if (pathname === link.href) return true;
    if (!isTopLevel && pathname.startsWith(link.href)) return true;
    return false;
  });

  const pageTitle = t(activeNavLink?.key ?? (normalizedRole === 'firm' ? 'navDashboard' : 'navAdminDashboard'));
  const subscriptionDays = user.subscriptionEndsAt && currentTime !== null ? Math.max(0, Math.ceil((new Date(user.subscriptionEndsAt).getTime() - currentTime) / 86400000)) : null;
  const subscriptionCountdown = normalizedRole === 'firm' && subscriptionDays !== null ? (
    <div className={`rounded-lg border px-3 py-2 text-center ${subscriptionDays <= 7 ? 'border-red-500/40 bg-red-500/10 text-red-600' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600'}`}>
      <div className="text-2xl font-black leading-none">{subscriptionDays}</div>
      <div className="mt-1 text-[11px] font-bold uppercase tracking-wide">{subscriptionDays === 0 ? 'Obuna muddati tugadi' : 'kun qoldi'}</div>
    </div>
  ) : null;
  const bottomNavLinks = isFirmKassir || isWarehouseManager ? navLinks : navLinks.filter((link) => ['/admin', '/firm', '/firms', '/flights', '/kassa', '/chat', '/reports'].includes(link.href)).slice(0, 4);
  const bottomMoreLinks = navLinks.filter((link) => !bottomNavLinks.some((item) => item.href === link.href));

  return (
    <div className="app-shell flex min-h-dvh w-full overflow-x-hidden bg-transparent font-sans text-foreground md:h-screen md:overflow-hidden">
      <a href="#main-content" className="skip-link">Asosiy qismga o‘tish</a>
      {/* Sidebar (desktop) */}
      <div className="app-sidebar z-30 hidden h-full w-[272px] flex-col overflow-visible border-r md:flex">
        {/* Sidebar Header */}
        <div className="h-[72px] px-6 flex items-center gap-3 shrink-0 relative border-b border-border">
          <div className="brand-mark flex h-[38px] w-[38px] shrink-0 items-center justify-center overflow-hidden">
            <Image src="/ADO-icon.png" alt="ADO Logo" width={38} height={38} priority className="h-full w-full object-contain p-1" />
          </div>
          <div className="flex flex-col justify-center">
            <h1 className="mb-[2px] select-none text-[17px] font-bold leading-none text-foreground">ADO SYSTEM</h1>
            <span className="select-none text-[10px] font-medium uppercase tracking-normal text-muted">Business Management</span>
          </div>
        </div>

        {/* Sidebar Nav */}
        <div className="flex-1 min-h-0 overflow-y-auto scroller-minimal py-4 flex flex-col gap-1 px-3">
          {navGroups.map((group) => group.links.length > 0 && (
            <div key={group.label} className="mb-2">
              <div className="nav-section-label px-2 pb-1 select-none">
                {group.label}
              </div>
              <div className="flex flex-col gap-1">
                {group.links.map((link) => {
                  const isActive = pathname === link.href || (link.href !== '/firm' && link.href !== '/admin' && pathname.startsWith(link.href));
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      prefetch={false}
                      aria-label={t(link.key)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`nav-item flex items-center gap-3 px-3 py-2 text-[14px] font-semibold ${isActive ? 'nav-item--active' : ''}`}
                    >
                      <link.icon size={20} strokeWidth={isActive ? 2.5 : 2} className="shrink-0" />
                      <span>{t(link.key)}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* User Info / Logout */}
        <div className="p-4 mt-auto border-t border-border shrink-0 flex flex-col gap-3">
          {subscriptionCountdown}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-yellow-600 border border-border flex items-center justify-center shadow-inner shrink-0">
              <UserCircle size={22} className="text-muted" />
            </div>
            <div className="overflow-hidden w-full px-2">
              <p className="text-[14px] font-bold text-foreground truncate">{user.email}</p>
              <p className="text-[12px] text-muted truncate uppercase tracking-widest">{normalizedRole === 'firm' ? firmRole.replace('_', ' ') : user.role}</p>
            </div>
          </div>

          {savedAccounts.length > 1 && (
            <div className="rounded-md border border-border bg-surface-2 p-2">
              <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted">Switch Account</div>
              <div className="max-h-40 space-y-1 overflow-y-auto scroller-minimal">
                {savedAccounts.map((account) => {
                  const isCurrent = account.id === user.id || account.email === user.email;
                  return (
                    <div key={account.id || account.email} className={`flex items-center gap-1 rounded-md ${isCurrent ? 'bg-surface' : ''}`}>
                      <button
                        type="button"
                        onClick={() => {
                          switchAccount(account.id || account.email);
                          goToAccountHome(account);
                        }}
                        className="min-w-0 flex-1 px-2 py-1.5 text-left"
                      >
                        <div className="truncate text-xs font-semibold text-foreground">{account.fullName || account.email}</div>
                        <div className="truncate text-[10px] uppercase tracking-wide text-muted">
                          {account.role === 'firm' ? account.firmRole.replace('_', ' ') : account.role}
                        </div>
                      </button>
                      {!isCurrent && (
                        <button
                          type="button"
                          onClick={() => forgetAccount(account.id || account.email)}
                          className="h-7 w-7 shrink-0 rounded-md text-muted hover:bg-surface hover:text-foreground"
                          aria-label="Remove saved account"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <button
            onClick={logout}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[var(--sidebar-border)] bg-[var(--sidebar-2)] py-2 text-[13px] font-semibold uppercase tracking-wide text-[var(--sidebar-foreground)] hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300"
          >
            <LogOut size={16} />
            <span>{t('signOut')}</span>
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Top Header */}
        <header className="app-topbar sticky top-0 z-20 flex h-[64px] shrink-0 items-center justify-between gap-3 border-b px-3 sm:px-4 md:h-[72px] lg:px-6">
          <div className="flex min-w-0 items-center gap-2 md:gap-4">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden grid h-10 w-10 place-items-center rounded-md border border-border bg-surface-2 text-foreground"
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <h2 className="app-page-title truncate text-2xl text-foreground md:text-[1.7rem]">
              {pageTitle}
            </h2>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-3">
            {!isReadOnly && !isWarehouseManager && <NewOperationLauncher role={normalizedRole} firmRole={firmRole} />}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsNotificationsOpen((open) => !open)}
                className="relative rounded-full border border-border bg-surface-2 p-2 text-muted shadow-sm transition-[color,border-color,background-color,box-shadow] hover:border-primary"
                aria-label="Notifications"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-ink">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {isNotificationsOpen && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-40 bg-black/45 md:bg-transparent"
                    aria-label="Close notifications"
                    onClick={() => setIsNotificationsOpen(false)}
                  />
                  <section
                    aria-label="Notifications"
                    className="fixed inset-x-0 bottom-0 z-50 flex max-h-[min(78dvh,640px)] flex-col rounded-t-2xl border border-border bg-surface shadow-2xl backdrop-blur-xl md:absolute md:inset-x-auto md:bottom-auto md:right-0 md:top-12 md:w-[380px] md:max-w-[calc(100vw-2rem)] md:rounded-xl"
                  >
                  <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                    <div>
                      <div className="text-base font-bold text-foreground">Notifications</div>
                      <div className="text-xs text-muted">{unreadCount > 0 ? `${unreadCount} unread` : 'You are all caught up'}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      {unreadCount > 0 && !isReadOnly && (
                        <button type="button" onClick={markAllNotificationsRead} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-muted hover:bg-surface-2 hover:text-foreground">
                          <CheckCheck size={15} />
                          Mark all
                        </button>
                      )}
                      <button type="button" onClick={() => setIsNotificationsOpen(false)} className="grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground" aria-label="Close notifications">
                        <X size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroller-minimal">
                    {notifications.length === 0 ? (
                      <div className="grid min-h-40 place-items-center px-6 py-10 text-center">
                        <div>
                          <Bell size={28} className="mx-auto mb-3 text-muted" />
                          <div className="text-sm font-semibold text-foreground">No notifications</div>
                          <div className="mt-1 text-xs text-muted">New activity will appear here.</div>
                        </div>
                      </div>
                    ) : notifications.map((item) => {
                      const unread = !item.readAt;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => markNotificationRead(item.id)}
                          aria-disabled={isReadOnly}
                          className={`block min-h-[76px] w-full border-b border-border px-4 py-3 text-left transition hover:bg-surface-2 ${unread ? 'bg-primary/10' : 'bg-transparent'}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold leading-5 text-foreground">{item.title}</div>
                              <div className="mt-1 line-clamp-3 text-xs leading-5 text-muted md:line-clamp-2">{item.body}</div>
                              <div className="mt-2 text-[11px] text-muted">
                                {item.firm?.name ? `${item.firm.name} · ` : ''}{new Date(item.createdAt).toLocaleString()}
                              </div>
                            </div>
                            {unread && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  </section>
                </>
              )}
            </div>
            <div className="hidden sm:block"><ThemeLanguageSwitcher /></div>

            <button
              type="button"
              onClick={() => setIsAccountModalOpen(true)}
              className="rounded-full border border-border bg-surface-2 p-2 text-muted shadow-sm transition-[color,border-color,background-color,box-shadow] hover:border-primary md:hidden"
              aria-label={t('account')}
            >
              <UserCircle size={18} />
            </button>
          </div>
        </header>

        <nav className="app-topbar fixed inset-x-0 bottom-0 z-40 grid grid-flow-col auto-cols-fr border-t px-1 pb-[max(env(safe-area-inset-bottom),0.25rem)] pt-1 md:hidden">
          {bottomNavLinks.map((link) => {
            const isActive = pathname === link.href || (link.href !== '/firm' && link.href !== '/admin' && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                prefetch={false}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-semibold ${
                  isActive ? 'bg-primary/10 text-primary' : 'text-muted'
                }`}
              >
                <link.icon size={18} />
                <span className="max-w-full truncate">{t(link.key)}</span>
              </Link>
            );
          })}
          {bottomMoreLinks.length > 0 && (
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-semibold text-muted"
            >
              <MoreHorizontal size={18} />
              <span>More</span>
            </button>
          )}
        </nav>

        {/* Scrollable Page Content */}
        <main id="main-content" tabIndex={-1} className="app-main scroller-minimal relative flex-1 overflow-y-auto overscroll-contain p-3 pb-24 sm:p-4 sm:pb-24 md:p-6">
          <div className="app-content relative z-10 mx-auto min-h-full w-full max-w-[1680px]">
            {isReadOnly && (
              <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-700 dark:text-amber-300">
                Faqat ko‘rish rejimi — barcha o‘zgartirish, qo‘shish va o‘chirish amallari serverda bloklangan.
              </div>
            )}
            {children}
          </div>
        </main>
      </div>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[90] md:hidden">
          <button className="absolute inset-0 bg-black/60" aria-label="Close navigation" onClick={() => setIsMobileMenuOpen(false)} />
          <aside className="app-sidebar absolute left-0 top-0 flex h-dvh w-[min(86vw,360px)] flex-col border-r p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-4">
              <div className="min-w-0">
                <div className="text-lg font-bold text-foreground">ADO SYSTEM</div>
                <div className="truncate text-xs uppercase tracking-wide text-muted">{normalizedRole === 'firm' ? firmRole.replace('_', ' ') : user.role}</div>
              </div>
              <button type="button" onClick={() => setIsMobileMenuOpen(false)} className="grid h-10 w-10 place-items-center rounded-md border border-border bg-surface-2" aria-label="Close navigation">
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto scroller-minimal">
              {navGroups.map((group) => group.links.length > 0 && (
                <div key={group.label} className="mb-4">
                  <div className="mb-1 px-1 text-[11px] font-bold uppercase tracking-widest text-muted">{group.label}</div>
                  <div className="grid gap-1">
                    {group.links.map((link) => {
                      const isActive = pathname === link.href || (link.href !== '/firm' && link.href !== '/admin' && pathname.startsWith(link.href));
                      return (
                        <Link
                          key={link.href}
                          href={link.href}
                          prefetch={false}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className={`flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-semibold ${isActive ? 'bg-surface-2 text-foreground' : 'text-muted'}`}
                        >
                          <link.icon size={20} />
                          {t(link.key)}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={logout} className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 font-bold text-red-600">
              <LogOut size={18} />
              {t('signOut')}
            </button>
          </aside>
        </div>
      )}

      {/* Mobile Account Modal - Hidden on desktop mostly */}
      {isAccountModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-0 md:hidden">
          <div className="bg-surface border border-border w-full sm:w-[400px] rounded-[24px] rounded-b-none sm:rounded-[24px] shadow-2xl p-6 animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:fade-in-0 duration-200">
            <div className="flex justify-between items-center mb-6 border-b border-border pb-4">
              <h3 className="text-xl font-bold text-foreground">{t('account')}</h3>
              <button 
                onClick={() => setIsAccountModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-muted hover:text-foreground hover:bg-border transition-colors font-medium"
              >
                ✕
              </button>
            </div>
            
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl border border-primary/20 shadow-inner">
                {user.email.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-lg text-foreground leading-tight truncate max-w-[200px]">{user.email}</p>
                <p className="text-sm text-primary font-medium mt-1 uppercase tracking-wide">{normalizedRole === 'firm' ? firmRole.replace('_', ' ') : user.role}</p>
              </div>
            </div>
            
            <div className="bg-surface-2 rounded-xl p-4 mb-6 border border-border shadow-sm">
              <p className="text-xs text-muted uppercase tracking-wider font-semibold mb-1">Email</p>
              <p className="font-mono text-sm text-foreground overflow-hidden text-ellipsis">{user.email}</p>
            </div>
            {subscriptionCountdown && <div className="mb-6">{subscriptionCountdown}</div>}

            <div className="flex flex-col gap-3">
              <button
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 bg-red-500/10 text-red-600 hover:bg-red-500/20 py-3.5 px-4 rounded-xl font-bold uppercase tracking-wider transition-colors border border-red-500/20"
              >
                <LogOut size={18} />
                {t('signOut')}
              </button>
              <button
                onClick={() => setIsAccountModalOpen(false)}
                className="w-full bg-surface-2 text-muted hover:text-foreground py-3.5 px-4 rounded-xl font-bold uppercase tracking-wider transition-colors border border-border"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
