"use client";

import { useAuth } from '@/contexts/AuthContext';
import { usePathname, useRouter } from 'next/navigation';
import { PlaneTakeoff, LayoutDashboard, LogOut, ArrowRightLeft, UserCircle, Settings, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    try {
      const current = document.documentElement.dataset.theme;
      setTheme(current === 'light' ? 'light' : 'dark');
    } catch {
      setTheme('dark');
    }
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      try {
        localStorage.setItem('jetstream-theme', next);
      } catch {
        // ignore
      }
      document.documentElement.dataset.theme = next;
      document.documentElement.style.colorScheme = next;
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="flex items-center gap-3">
          <PlaneTakeoff className="animate-pulse" />
          <span>Authenticating...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const navLinks = user.role === 'firm' ? [
    { name: 'Dashboard', href: '/firm', icon: LayoutDashboard },
    { name: 'Flights', href: '/flights', icon: PlaneTakeoff },
    { name: 'Transactions', href: '/transactions', icon: ArrowRightLeft },
    { name: 'Reports', href: '/reports', icon: BarChart3 },
  ] : [
    { name: 'Admin Dashboard', href: '/admin', icon: LayoutDashboard },
    { name: 'Firms', href: '/firms', icon: UserCircle },
    { name: 'Flights', href: '/flights', icon: PlaneTakeoff },
    { name: 'Transactions', href: '/transactions', icon: ArrowRightLeft },
    { name: 'Reports', href: '/reports', icon: BarChart3 },
  ];

  const pageTitle = pathname.startsWith('/settings')
    ? 'Settings'
    : (navLinks.find(link => pathname.startsWith(link.href))?.name || 'Dashboard');

  return (
    <div className="flex h-screen bg-background text-foreground w-full font-sans">
      {/* Sidebar */}
      <div className="w-64 bg-surface text-foreground flex flex-col h-full overflow-y-auto border-r border-border shadow-[5px_0_15px_rgba(192,38,211,0.1)]">
        <div className="p-5 flex items-center gap-3 border-b border-border">
          <div className="bg-gradient-to-br from-fuchsia-600 to-yellow-500 p-2 rounded-lg">
            <PlaneTakeoff size={24} />
          </div>
          <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-500">JetStream B2B</h1>
        </div>
        <div className="flex-1 px-4 space-y-2 mt-6">
          <div className="mb-4 px-2 text-xs font-semibold text-muted uppercase tracking-wider">
            {user.role === 'firm' ? 'Agency Portal' : 'Admin Console'}
          </div>
          {navLinks.map((link) => {
            const isActive = pathname === link.href || (link.href !== '/firm' && link.href !== '/admin' && pathname.startsWith(link.href));
            return (
              <Link
                key={link.name}
                href={link.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-200 text-sm font-medium ${
                  isActive 
                    ? 'bg-gradient-to-r from-fuchsia-600 to-fuchsia-800 text-white shadow-lg' 
                    : 'text-muted hover:bg-surface-2 hover:text-foreground'
                }`}
              >
                <link.icon size={18} />
                <span>{link.name}</span>
              </Link>
            )
          })}
        </div>
        <div className="p-4 border-t border-border mt-auto">
          <button
            type="button"
            onClick={() => setIsAccountModalOpen(true)}
            className="w-full flex items-center justify-between gap-2 p-2 rounded-md text-muted hover:bg-surface-2 transition-colors"
            aria-haspopup="dialog"
            aria-expanded={isAccountModalOpen}
          >
            <span className="flex items-center gap-2 min-w-0">
              <UserCircle size={24} className="text-yellow-400 shrink-0" />
              <span className="text-sm font-medium truncate">{user.email}</span>
            </span>
            <span className="text-xs text-muted">Account</span>
          </button>
        </div>
      </div>

      {isAccountModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-foreground">Account</h3>
            <p className="mt-1 text-sm text-muted truncate">{user.email}</p>

            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={() => {
                  setIsAccountModalOpen(false);
                  router.push('/settings');
                }}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-surface-2 hover:bg-surface text-foreground rounded-lg transition"
              >
                <Settings size={18} />
                Settings
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsAccountModalOpen(false);
                  logout();
                }}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-red-600/80 hover:bg-red-600 text-white rounded-lg transition"
              >
                <LogOut size={18} />
                Sign out
              </button>

              <button
                type="button"
                onClick={() => setIsAccountModalOpen(false)}
                className="w-full px-4 py-2 bg-transparent hover:bg-surface-2 text-muted rounded-lg transition border border-border"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-surface backdrop-blur-sm shadow-lg h-16 flex items-center justify-between px-8 border-b border-border shrink-0">
          <h2 className="text-xl font-semibold text-foreground">
            {pageTitle}
          </h2>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              className="px-3 py-2 bg-surface-2 hover:bg-surface text-foreground rounded-lg transition border border-border text-sm font-medium"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-8 bg-background">
          <div className="bg-surface p-6 rounded-xl border border-border shadow-2xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
