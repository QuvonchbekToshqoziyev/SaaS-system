/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePathname, useRouter } from 'next/navigation';
import { PlaneTakeoff, LayoutDashboard, LogOut, ArrowRightLeft, UserCircle, Settings, BarChart3, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import ThemeLanguageSwitcher from '@/components/ui/ThemeLanguageSwitcher';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading } = useAuth();
  const { language, t, tr } = useLanguage();
  const pathname = usePathname();
  const router = useRouter();
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('jetstream-sidebar-collapsed');
      if (raw === '1' || raw === 'true') setSidebarCollapsed(true);
      if (raw === '0' || raw === 'false') setSidebarCollapsed(false);
    } catch {
      // ignore
    }
  }, []);

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
        className={`hidden md:flex flex-col h-full overflow-visible bg-surface transition-all duration-300 border-r border-border z-30 shadow-[4px_0_24px_rgba(0,0,0,0.02)] ${sidebarCollapsed ? 'w-20' : 'w-[260px]'}`}
      >
        {/* Sidebar Header */}
        <div className="h-[72px] px-6 flex items-center gap-3 shrink-0 relative border-b border-border">
          <div className="w-[38px] h-[38px] shrink-0 bg-transparent flex items-center justify-center rounded-xl overflow-hidden shadow-sm shadow-primary/20">
            <img src="/logo.png" alt="ADO Logo" className="w-full h-full object-contain p-1" />
          </div>
          {!sidebarCollapsed && (
            <div className="flex flex-col justify-center">
              <h1 className="text-[17px] font-bold text-foreground tracking-tight select-none leading-none mb-[2px]">
                ADO Financial
              </h1>
              <span className="text-[10px] text-muted uppercase tracking-[0.05em] select-none leading-none font-medium">
                Accounting & Carrier
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => {
              const next = !v;
              try { localStorage.setItem('jetstream-sidebar-collapsed', next ? '1' : '0'); } catch {}
              return next;
            })}
            className="absolute -right-3 top-1/2 -translate-y-1/2 flex items-center justify-center h-6 w-6 rounded-full bg-surface text-muted shadow-md border border-border hover:text-primary transition-all z-40 outline-none"
            aria-label="Toggle Sidebar"
          >
            {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Sidebar Nav */}
        <div className={`flex-1 py-6 flex flex-col gap-2 ${sidebarCollapsed ? 'px-3' : 'px-5'}`}>
          {!sidebarCollapsed && (
            <div className="px-2 mb-2 text-[10px] text-muted uppercase tracking-widest font-semibold select-none">
              {user.role === 'firm' ? 'Agency Actions' : 'Platform Setup'}
            </div>
          )}
          {navLinks.map((link) => {
            const isActive = pathname === link.href || (link.href !== '/firm' && link.href !== '/admin' && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-label={t(link.key)}
                className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 rounded-lg transition-all duration-200 text-[14px] font-medium tracking-wide ${
                  isActive 
                    ? 'bg-primary/5 text-primary shadow-inner' 
                    : 'text-muted hover:bg-surface-2 hover:text-foreground'
                }`}
              >
                <link.icon size={20} strokeWidth={isActive ? 2.5 : 2} className="shrink-0" />
                {!sidebarCollapsed && <span>{t(link.key)}</span>}
              </Link>
            );
          })}
        </div>

        {/* User Info / Logout */}
        <div className={`p-5 mb-2 mt-auto border-t border-border shrink-0 flex flex-col gap-3 ${sidebarCollapsed ? 'items-center' : ''}`}>
          {!sidebarCollapsed ? (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-surface-2 border border-border flex items-center justify-center shadow-inner shrink-0">
                <UserCircle size={22} className="text-muted" />
              </div>
              <div className="overflow-hidden w-full px-2">
                <p className="text-[14px] font-bold text-foreground truncate">{user.email}</p>
                <p className="text-[12px] text-muted truncate uppercase tracking-widest">{user.role}</p>
              </div>
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-surface-2 border border-border flex items-center justify-center shadow-inner shrink-0 mb-2">
              <UserCircle size={22} className="text-muted" />
            </div>
          )}

          <button
            onClick={logout}
            className={`flex items-center justify-center gap-2 w-full py-2 bg-surface-2 hover:bg-primary text-foreground hover:text-white rounded-lg transition-all border border-border hover:border-primary shadow-sm text-[13px] font-semibold uppercase tracking-wide ${sidebarCollapsed ? 'px-0' : 'px-4'}`}
          >
            <LogOut size={16} />
            {!sidebarCollapsed && <span>{t('signOut')}</span>}
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 flex flex-col overflow-hidden relative bg-surface-2/30">
        {/* Top Header */}
        <header className="h-[72px] px-6 lg:px-10 flex items-center justify-between gap-4 bg-surface/80 backdrop-blur-xl border-b border-border shrink-0 sticky top-0 z-20 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
          <div className="flex items-center gap-4">
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
              {pageTitle}
            </h2>
          </div>
          
          <div className="flex items-center gap-4">
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

        {/* Scrollable Page Content */}
        <main className="flex-1 overflow-y-auto scroller-minimal p-4 md:p-8 lg:p-10 relative">
          <div className="max-w-[1600px] mx-auto w-full relative z-10 h-full">
            {children}
          </div>
        </main>
      </div>

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
                <p className="text-sm text-primary font-medium mt-1 uppercase tracking-wide">{user.role}</p>
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
