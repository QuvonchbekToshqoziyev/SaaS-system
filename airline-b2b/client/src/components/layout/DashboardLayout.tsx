"use client";

import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePathname, useRouter } from 'next/navigation';
import { Plane, PlaneTakeoff, LayoutDashboard, LogOut, ArrowRightLeft, UserCircle, Settings, BarChart3, Wallet, PackageOpen, BriefcaseBusiness, Users, ShieldCheck, MessageCircle, History, Bell, CheckCheck, Menu, MoreHorizontal, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import ThemeLanguageSwitcher from '@/components/ui/ThemeLanguageSwitcher';
import { api } from '@/lib/api';

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
  | 'navAirlines'
  | 'navFirms'
  | 'navFlights'
  | 'navTours'
  | 'navServices'
  | 'navTransactions'
  | 'navKassa'
  | 'navEmployees'
  | 'navChat'
  | 'navReports'
  | 'navSettings';

type NavLinkItem = {
  key: NavKey;
  href: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
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
  const normalizedRole = String(user?.role || '').toLowerCase();
  const firmRole = String(user?.firmRole || 'FIRM_ADMIN').toUpperCase();
  const isAirlineFirm = false;
  const isFirmKassir = normalizedRole === 'firm' && firmRole === 'KASSIR';
  const isFirmManager = normalizedRole === 'firm' && firmRole === 'MANAGER';
  const isKassirAllowedPath = pathname.startsWith('/kassa') || pathname.startsWith('/chat') || pathname.startsWith('/settings');

  useEffect(() => {
    if (!isLoading && isFirmKassir && !isKassirAllowedPath) {
      router.replace('/kassa');
    }
  }, [isLoading, isFirmKassir, isKassirAllowedPath, router]);

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

  const markNotificationRead = async (id: string) => {
    try {
      await api.post(`/notifications/${id}/read`);
      setNotifications((rows) => rows.map((row) => row.id === id ? { ...row, readAt: row.readAt || new Date().toISOString() } : row));
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch {
      // ignore
    }
  };

  const markAllNotificationsRead = async () => {
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
          <span className="text-sm font-medium">Authenticating...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const airlineNavLinks: NavLinkItem[] = [
    { key: 'navFlights', href: '/flights', icon: PlaneTakeoff },
    { key: 'navTransactions', href: '/transactions', icon: ArrowRightLeft },
    { key: 'navKassa', href: '/kassa', icon: Wallet },
    { key: 'navChat', href: '/chat', icon: MessageCircle },
    { key: 'navReports', href: '/reports', icon: BarChart3 },
    { key: 'navSettings', href: '/settings', icon: Settings },
  ];

  const firmNavLinks = isAirlineFirm ? airlineNavLinks : isFirmKassir ? [
    { key: 'navKassa' as const, href: '/kassa', icon: Wallet },
    { key: 'navChat' as const, href: '/chat', icon: MessageCircle },
    { key: 'navSettings' as const, href: '/settings', icon: Settings },
  ] : [
    { key: 'navDashboard' as const, href: '/firm', icon: LayoutDashboard },
    ...(isFirmManager ? [] : [{ key: 'navFirms' as const, href: '/firms', icon: UserCircle }]),
    { key: 'navFlights' as const, href: '/flights', icon: PlaneTakeoff },
    { key: 'navTours' as const, href: '/tours', icon: PackageOpen },
    { key: 'navServices' as const, href: '/services', icon: BriefcaseBusiness },
    { key: 'navTransactions' as const, href: '/transactions', icon: ArrowRightLeft },
    { key: 'navKassa' as const, href: '/kassa', icon: Wallet },
    ...(isFirmManager ? [] : [{ key: 'navEmployees' as const, href: '/employees', icon: Users }]),
    { key: 'navChat' as const, href: '/chat', icon: MessageCircle },
    { key: 'navReports' as const, href: '/reports', icon: BarChart3 },
    { key: 'navSettings' as const, href: '/settings', icon: Settings },
  ];

  const adminNavLinks: NavLinkItem[] = [
    { key: 'navAdminDashboard', href: '/admin', icon: LayoutDashboard },
    ...(normalizedRole === 'superadmin' ? [{ key: 'navAdmins' as const, href: '/admins', icon: ShieldCheck }] : []),
    ...(normalizedRole === 'superadmin' ? [{ key: 'navAuditLog' as const, href: '/audit-log', icon: History }] : []),
    ...(normalizedRole === 'superadmin' ? [{ key: 'navAirlines' as const, href: '/airlines', icon: Plane }] : []),
    { key: 'navFirms', href: '/firms', icon: UserCircle },
    { key: 'navFlights', href: '/flights', icon: PlaneTakeoff },
    { key: 'navTours', href: '/tours', icon: PackageOpen },
    { key: 'navServices', href: '/services', icon: BriefcaseBusiness },
    { key: 'navTransactions', href: '/transactions', icon: ArrowRightLeft },
    { key: 'navKassa', href: '/kassa', icon: Wallet },
    { key: 'navEmployees', href: '/employees', icon: Users },
    { key: 'navChat', href: '/chat', icon: MessageCircle },
    { key: 'navReports', href: '/reports', icon: BarChart3 },
    { key: 'navSettings', href: '/settings', icon: Settings },
  ];

  const navLinks = normalizedRole === 'firm' ? firmNavLinks : adminNavLinks;
  const navGroups: NavGroup[] = normalizedRole === 'firm'
    ? isAirlineFirm
      ? [
          { label: 'Inventory', links: airlineNavLinks.filter((link) => ['/flights'].includes(link.href)) },
          { label: 'Money', links: airlineNavLinks.filter((link) => ['/transactions', '/kassa', '/reports'].includes(link.href)) },
          { label: 'Workspace', links: airlineNavLinks.filter((link) => ['/chat', '/settings'].includes(link.href)) },
        ]
      : isFirmKassir
        ? [{ label: 'Kassa Access', links: firmNavLinks }]
        : [
            { label: 'Overview', links: firmNavLinks.filter((link) => ['/firm', '/reports'].includes(link.href)) },
            { label: 'Operations', links: firmNavLinks.filter((link) => ['/firms', '/flights', '/tours', '/services', '/employees'].includes(link.href)) },
            { label: 'Money', links: firmNavLinks.filter((link) => ['/transactions', '/kassa'].includes(link.href)) },
            { label: 'Workspace', links: firmNavLinks.filter((link) => ['/chat', '/settings'].includes(link.href)) },
          ]
    : [
        { label: normalizedRole === 'superadmin' ? 'Command Center' : 'Overview', links: adminNavLinks.filter((link) => ['/admin', '/reports'].includes(link.href)) },
        { label: 'Organizations', links: adminNavLinks.filter((link) => ['/admins', '/airlines', '/firms', '/employees'].includes(link.href)) },
        { label: 'Operations', links: adminNavLinks.filter((link) => ['/flights', '/tours', '/services'].includes(link.href)) },
        { label: 'Finance', links: adminNavLinks.filter((link) => ['/transactions', '/kassa'].includes(link.href)) },
        { label: 'Oversight', links: adminNavLinks.filter((link) => ['/audit-log', '/chat', '/settings'].includes(link.href)) },
      ];

  const activeNavLink = navLinks.find((link) => {
    const isTopLevel = link.href === '/firm' || link.href === '/admin';
    if (pathname === link.href) return true;
    if (!isTopLevel && pathname.startsWith(link.href)) return true;
    return false;
  });

  const pageTitle = t(activeNavLink?.key ?? navLinks[0].key);
  const bottomNavLinks = isFirmKassir ? navLinks : navLinks.filter((link) => ['/admin', '/firm', '/firms', '/flights', '/kassa', '/chat', '/reports'].includes(link.href)).slice(0, 4);
  const bottomMoreLinks = navLinks.filter((link) => !bottomNavLinks.some((item) => item.href === link.href));

  return (
    <div className="flex min-h-dvh md:h-screen bg-transparent text-foreground w-full font-sans overflow-x-hidden md:overflow-hidden">
      {/* Sidebar (desktop) */}
      <div className="hidden w-[260px] md:flex flex-col h-full overflow-visible glass-soft border-r border-border z-30">
        {/* Sidebar Header */}
        <div className="h-[72px] px-6 flex items-center gap-3 shrink-0 relative border-b border-border">
          <div className="w-[38px] h-[38px] shrink-0 bg-gradient-to-br from-emerald-500 to-yellow-600 flex items-center justify-center rounded-xl overflow-hidden shadow-sm shadow-primary/20">
            <img src="/ADO-icon.png" alt="ADO Logo" className="w-full h-full object-contain p-1" />
          </div>
          <div className="flex flex-col justify-center">
            <h1 className="text-[17px] font-bold text-foreground tracking-tight select-none leading-none mb-[2px]">ADO Financial</h1>
            <span className="text-[10px] text-muted uppercase tracking-[0.05em] select-none leading-none font-medium">Accounting & Carrier</span>
          </div>
        </div>

        {/* Sidebar Nav */}
        <div className="flex-1 min-h-0 overflow-y-auto scroller-minimal py-4 flex flex-col gap-1 px-3">
          {navGroups.map((group) => group.links.length > 0 && (
            <div key={group.label} className="mb-2">
              <div className="px-2 pb-1 text-[10px] text-muted uppercase tracking-widest font-semibold select-none">
                {group.label}
              </div>
              <div className="flex flex-col gap-1">
                {group.links.map((link) => {
                  const isActive = pathname === link.href || (link.href !== '/firm' && link.href !== '/admin' && pathname.startsWith(link.href));
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      aria-label={t(link.key)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md text-[14px] font-medium tracking-wide ${
                        isActive
                          ? 'bg-surface-2 text-foreground border border-border shadow-sm'
                          : 'text-muted hover:bg-surface-2 hover:text-foreground'
                      }`}
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
            className="flex items-center justify-center gap-2 w-full py-2 bg-surface-2 hover:bg-surface text-foreground rounded-md border border-border text-[13px] font-semibold uppercase tracking-wide"
          >
            <LogOut size={16} />
            <span>{t('signOut')}</span>
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Top Header */}
        <header className="h-[64px] md:h-[72px] px-3 sm:px-4 lg:px-6 flex items-center justify-between gap-3 glass-soft border-b border-border shrink-0 sticky top-0 z-20">
          <div className="flex min-w-0 items-center gap-2 md:gap-4">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden grid h-10 w-10 place-items-center rounded-md border border-border bg-surface-2 text-foreground"
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <h2 className="truncate text-xl md:text-2xl font-bold tracking-tight text-foreground">
              {pageTitle}
            </h2>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsNotificationsOpen((open) => !open)}
                className="relative p-2 bg-surface-2 border border-border hover:border-primary text-muted rounded-full transition-all shadow-sm"
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
                <div className="absolute right-0 top-12 z-50 w-[340px] max-w-[calc(100vw-2rem)] border border-border bg-surface shadow-2xl">
                  <div className="flex items-center justify-between border-b border-border px-3 py-2">
                    <div className="text-sm font-bold text-foreground">Notifications</div>
                    <button type="button" onClick={markAllNotificationsRead} className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-foreground">
                      <CheckCheck size={14} />
                      Mark all
                    </button>
                  </div>
                  <div className="max-h-[420px] overflow-y-auto scroller-minimal">
                    {notifications.length === 0 ? (
                      <div className="px-3 py-6 text-center text-sm text-muted">No notifications</div>
                    ) : notifications.map((item) => {
                      const unread = !item.readAt;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => markNotificationRead(item.id)}
                          className={`block w-full border-b border-border px-3 py-3 text-left hover:bg-surface-2 ${unread ? 'bg-primary/10' : 'bg-surface'}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-foreground">{item.title}</div>
                              <div className="mt-1 line-clamp-2 text-xs text-muted">{item.body}</div>
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
                </div>
              )}
            </div>
            <ThemeLanguageSwitcher />

            <button
              type="button"
              onClick={() => setIsAccountModalOpen(true)}
              className="md:hidden p-2 bg-surface-2 border border-border hover:border-primary text-muted rounded-full transition-all shadow-sm"
              aria-label={t('account')}
            >
              <UserCircle size={18} />
            </button>
          </div>
        </header>

        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-flow-col auto-cols-fr border-t border-border bg-surface/95 px-1 pb-[calc(env(safe-area-inset-bottom)+0.25rem)] pt-1 backdrop-blur md:hidden">
          {bottomNavLinks.map((link) => {
            const isActive = pathname === link.href || (link.href !== '/firm' && link.href !== '/admin' && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[11px] font-semibold ${
                  isActive ? 'bg-surface-2 text-foreground' : 'text-muted'
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
              className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[11px] font-semibold text-muted"
            >
              <MoreHorizontal size={18} />
              <span>More</span>
            </button>
          )}
        </nav>

        {/* Scrollable Page Content */}
        <main className="flex-1 overflow-y-auto scroller-minimal p-3 pb-24 md:p-5 relative">
          <div className="max-w-[1600px] mx-auto w-full relative z-10 min-h-full">
            {children}
          </div>
        </main>
      </div>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[90] md:hidden">
          <button className="absolute inset-0 bg-black/60" aria-label="Close navigation" onClick={() => setIsMobileMenuOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-dvh w-[min(86vw,360px)] flex-col border-r border-border bg-surface p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-4">
              <div className="min-w-0">
                <div className="text-lg font-bold text-foreground">ADO Financial</div>
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
