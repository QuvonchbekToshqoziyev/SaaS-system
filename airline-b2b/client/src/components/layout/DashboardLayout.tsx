"use client";

import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePathname } from 'next/navigation';
import { PlaneTakeoff, LayoutDashboard, LogOut, ArrowRightLeft, UserCircle, Settings, BarChart3, Wallet, PackageOpen } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import ThemeLanguageSwitcher from '@/components/ui/ThemeLanguageSwitcher';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading } = useAuth();
  const { t } = useLanguage();
  const pathname = usePathname();
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);

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
    { key: 'navTours' as const, href: '/tours', icon: PackageOpen },
    { key: 'navTransactions' as const, href: '/transactions', icon: ArrowRightLeft },
    { key: 'navKassa' as const, href: '/kassa', icon: Wallet },
    { key: 'navReports' as const, href: '/reports', icon: BarChart3 },
    { key: 'navSettings' as const, href: '/settings', icon: Settings },
  ] : [
    { key: 'navAdminDashboard' as const, href: '/admin', icon: LayoutDashboard },
    { key: 'navFirms' as const, href: '/firms', icon: UserCircle },
    { key: 'navFlights' as const, href: '/flights', icon: PlaneTakeoff },
    { key: 'navTours' as const, href: '/tours', icon: PackageOpen },
    { key: 'navTransactions' as const, href: '/transactions', icon: ArrowRightLeft },
    { key: 'navKassa' as const, href: '/kassa', icon: Wallet },
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
      <div className="hidden w-[260px] md:flex flex-col h-full overflow-visible bg-surface border-r border-border z-30">
        {/* Sidebar Header */}
        <div className="h-[72px] px-6 flex items-center gap-3 shrink-0 relative border-b border-border">
          <div className="w-[38px] h-[38px] shrink-0 bg-transparent flex items-center justify-center rounded-xl overflow-hidden shadow-sm shadow-primary/20">
            <img src="/ADO-icon.png" alt="ADO Logo" className="w-full h-full object-contain p-1" />
          </div>
          <div className="flex flex-col justify-center">
            <h1 className="text-[17px] font-bold text-foreground tracking-tight select-none leading-none mb-[2px]">ADO Financial</h1>
            <span className="text-[10px] text-muted uppercase tracking-[0.05em] select-none leading-none font-medium">Accounting & Carrier</span>
          </div>
        </div>

        {/* Sidebar Nav */}
        <div className="flex-1 min-h-0 overflow-y-auto scroller-minimal py-4 flex flex-col gap-1 px-3">
          <div className="px-2 mb-2 text-[10px] text-muted uppercase tracking-widest font-semibold select-none">
            {user.role === 'firm' ? 'Agency Actions' : 'Platform Setup'}
          </div>
          {navLinks.map((link) => {
            const isActive = pathname === link.href || (link.href !== '/firm' && link.href !== '/admin' && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-label={t(link.key)}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-[14px] font-medium tracking-wide ${
                  isActive 
                    ? 'bg-surface-2 text-foreground border border-border' 
                    : 'text-muted hover:bg-surface-2 hover:text-foreground'
                }`}
              >
                <link.icon size={20} strokeWidth={isActive ? 2.5 : 2} className="shrink-0" />
                <span>{t(link.key)}</span>
              </Link>
            );
          })}
        </div>

        {/* User Info / Logout */}
        <div className="p-4 mt-auto border-t border-border shrink-0 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-surface-2 border border-border flex items-center justify-center shadow-inner shrink-0">
              <UserCircle size={22} className="text-muted" />
            </div>
            <div className="overflow-hidden w-full px-2">
              <p className="text-[14px] font-bold text-foreground truncate">{user.email}</p>
              <p className="text-[12px] text-muted truncate uppercase tracking-widest">{user.role}</p>
            </div>
          </div>

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
      <div className="flex-1 flex flex-col overflow-hidden relative bg-surface-2/30">
        {/* Top Header */}
        <header className="h-[72px] px-4 lg:px-6 flex items-center justify-between gap-4 bg-surface border-b border-border shrink-0 sticky top-0 z-20">
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

        <nav className="md:hidden flex gap-1 overflow-x-auto border-b border-border bg-surface px-2 py-2 scroller-minimal">
          {navLinks.map((link) => {
            const isActive = pathname === link.href || (link.href !== '/firm' && link.href !== '/admin' && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`shrink-0 border px-3 py-2 text-sm font-semibold ${
                  isActive ? 'border-border bg-surface-2 text-foreground' : 'border-transparent text-muted'
                }`}
              >
                {t(link.key)}
              </Link>
            );
          })}
        </nav>

        {/* Scrollable Page Content */}
        <main className="flex-1 overflow-y-auto scroller-minimal p-3 md:p-5 relative">
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
