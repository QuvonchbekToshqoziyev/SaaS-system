/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePathname, useRouter } from 'next/navigation';
import { PlaneTakeoff, LayoutDashboard, LogOut, ArrowRightLeft, UserCircle, Settings, BarChart3, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading } = useAuth();
  const { language, toggleLanguage, t, tr } = useLanguage();
  const pathname = usePathname();
  const router = useRouter();
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      const current = document.documentElement.dataset.theme;
      setTheme(current === 'light' ? 'light' : 'dark');
    } catch {
      setTheme('light');
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('jetstream-sidebar-collapsed');
      if (raw === '1' || raw === 'true') setSidebarCollapsed(true);
      if (raw === '0' || raw === 'false') setSidebarCollapsed(false);
    } catch {
      // ignore
    }
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      try {
        localStorage.setItem('jetstream-theme', next);
        document.documentElement.dataset.theme = next;
        document.documentElement.style.colorScheme = next;
      } catch {
        // ignore
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 border-[3px] border-blue-600/20 border-t-blue-600 rounded-full animate-spin"></div>
          <span className="text-sm font-medium">Authenticating...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const navLinks = user.role === 'firm' ? [
    { key: 'navDashboard' as const, href: '/firm', icon: LayoutDashboard },
    { key: 'navFlights' as const, href: '/flights', icon: PlaneTakeoff },
    { key: 'navTransactions' as const, href: '/transactions', icon: ArrowRightLeft },
    { key: 'navReports' as const, href: '/reports', icon: BarChart3 },
    { key: 'navSettings' as const, href: '/settings', icon: Settings },
  ] : [
    { key: 'navAdminDashboard' as const, href: '/admin', icon: LayoutDashboard },
    { key: 'navFirms' as const, href: '/firms', icon: UserCircle },
    { key: 'navFlights' as const, href: '/flights', icon: PlaneTakeoff },
    { key: 'navTransactions' as const, href: '/transactions', icon: ArrowRightLeft },
    { key: 'navReports' as const, href: '/reports', icon: BarChart3 },
    { key: 'navSettings' as const, href: '/settings', icon: Settings },
  ];

  const activeNavLink = navLinks.find((link) => {
    const isTopLevel = link.href === '/firm' || link.href === '/admin';
    if (pathname === link.href) return true;
    if (!isTopLevel && pathname.startsWith(link.href)) return true;
    return false;
  });

  const pageTitle = t(activeNavLink?.key ?? navLinks[0].key);

  return (
    <div className="flex min-h-screen md:h-screen bg-background text-foreground w-full font-sans overflow-hidden">
      {/* Sidebar (desktop) */}
      <div
        className={`hidden md:flex flex-col h-full overflow-visible bg-surface transition-all duration-300 border-r border-border z-30 ${sidebarCollapsed ? 'w-20' : 'w-64'}`}
      >
        {/* Sidebar Header */}
        <div className="h-[72px] px-5 flex items-center gap-3 border-b border-border shrink-0 relative">
          <div className="w-[34px] h-[34px] shrink-0 bg-blue-600 rounded-lg flex items-center justify-center text-white text-[12px] font-bold tracking-widest shadow-sm">
            ADO
          </div>
          {!sidebarCollapsed && (
            <h1 className="text-[15px] font-semibold text-foreground tracking-tight select-none">
              ADO B2B
            </h1>
          )}

          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => {
              const next = !v;
              try { localStorage.setItem('jetstream-sidebar-collapsed', next ? '1' : '0'); } catch {}
              return next;
            })}
            className="absolute -right-3 top-1/2 -translate-y-1/2 flex items-center justify-center h-6 w-6 rounded-full bg-surface hover:bg-surface-2 text-muted shadow-sm border border-border hover:text-foreground  transition-colors z-40"
            aria-label="Toggle Sidebar"
          >
            {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Sidebar Nav */}
        <div className={`flex-1 py-6 flex flex-col gap-1.5 ${sidebarCollapsed ? 'px-3' : 'px-4'}`}>
          {!sidebarCollapsed && (
            <div className="px-3 mb-2 text-[10px] font-bold text-muted uppercase tracking-widest select-none">
              {user.role === 'firm' ? 'Agency Portal' : 'Admin Console'}
            </div>
          )}
          {navLinks.map((link) => {
            const isActive = pathname === link.href || (link.href !== '/firm' && link.href !== '/admin' && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-label={t(link.key)}
                className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 rounded-[10px] transition-all duration-200 text-[13px] ${
                  isActive 
                    ? 'bg-blue-50 text-blue-700 font-semibold dark:bg-blue-500/10 dark:text-blue-400' 
                    : 'text-muted font-medium hover:bg-surface-2 hover:text-foreground'
                }`}
              >
                <link.icon size={18} className={isActive ? 'text-blue-600 dark:text-blue-400' : ''} />
                {!sidebarCollapsed && <span className="tracking-wide">{t(link.key)}</span>}
              </Link>
            )
          })}
        </div>

        {/* Sidebar Footer User Info */}
        <div className="p-4 border-t border-border mt-auto shrink-0 bg-surface-2/50">
          <button
            type="button"
            onClick={() => setIsAccountModalOpen(true)}
            className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between'} gap-2 rounded-xl text-muted hover:text-foreground transition-colors`}
            aria-haspopup="dialog"
            aria-expanded={isAccountModalOpen}
            title={user.email}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                 <UserCircle size={18} className="text-blue-600 dark:text-blue-400" />
              </div>
              {!sidebarCollapsed && <span className="text-[13px] font-semibold truncate tracking-wide text-foreground">{user.email}</span>}
            </span>
          </button>
        </div>
      </div>

      {isAccountModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-surface border border-border rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] w-full max-w-sm p-8 m-4">
            <h3 className="text-lg font-semibold tracking-tight text-foreground">{t('account')}</h3>
            <p className="mt-1 text-sm text-muted truncate">{user.email}</p>

            <div className="mt-8 space-y-3">
              <button
                type="button"
                onClick={() => { setIsAccountModalOpen(false); logout(); }}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 font-semibold text-sm rounded-xl transition-colors"
              >
                <LogOut size={16} />
                {t('signOut')}
              </button>

              <button
                type="button"
                onClick={() => setIsAccountModalOpen(false)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-surface-2 text-foreground hover:bg-black/5 dark:hover:bg-white/5 font-semibold text-sm rounded-xl transition-colors"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Top Header */}
        <header className="h-[72px] px-6 md:px-12 flex items-center justify-between gap-4 bg-surface/80 backdrop-blur-xl border-b border-border shrink-0 sticky top-0 z-20 transition-all duration-300">
          <div className="flex items-center gap-3">
            <h2 className="text-lg md:text-[20px] font-semibold text-foreground tracking-tight">
              {pageTitle}
            </h2>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="p-2 bg-surface-2 hover:bg-black/5 dark:hover:bg-white/5 text-muted rounded-full transition-colors"
              aria-label={'Toggle theme'}
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>

            <button
              onClick={toggleLanguage}
              className="px-3 py-1.5 bg-surface-2 hover:bg-black/5 dark:hover:bg-white/5 text-foreground rounded-full transition-colors text-[11px] uppercase tracking-widest font-bold"
              aria-label={t('toggleLanguageAria')}
            >
              {language === 'en' ? 'UZ' : 'EN'}
            </button>

            <button
              type="button"
              onClick={() => setIsAccountModalOpen(true)}
              className="md:hidden p-2 bg-surface-2 hover:bg-black/5 dark:hover:bg-white/5 text-muted rounded-full transition-colors"
              aria-label={t('account')}
            >
              <UserCircle size={18} />
            </button>
          </div>
        </header>

        {/* Mobile Nav Scroller (Optional but keeping for consistency) */}
        <nav className="md:hidden shrink-0 bg-surface border-b border-border px-4 py-2 overflow-x-auto scroller-hide">
          <div className="flex items-center gap-2 min-w-max">
            {navLinks.map((link) => {
              const isActive = pathname === link.href || (link.href !== '/firm' && link.href !== '/admin' && pathname.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg transition-colors text-[13px] font-semibold ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400'
                      : 'bg-transparent text-muted hover:bg-surface-2'
                  }`}
                >
                  <link.icon size={16} />
                  <span className="whitespace-nowrap tracking-wide">{t(link.key)}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto w-full px-4 py-6 md:px-12 md:py-10 scroller-minimal text-foreground">
           <div className="max-w-screen-2xl mx-auto w-full flex flex-col gap-8 md:gap-12">
             {children}
           </div>
        </main>
      </div>
    </div>
  );
}
