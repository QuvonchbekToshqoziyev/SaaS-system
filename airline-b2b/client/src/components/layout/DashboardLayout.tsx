"use client";
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { PlaneTakeoff, LayoutDashboard, LogOut, ArrowRightLeft, ChevronDown, UserCircle } from 'lucide-react';
import Link from 'next/link';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
        <div className="flex items-center gap-3">
          <PlaneTakeoff className="animate-pulse" />
          <span>Authenticating...</span>
        </div>
      </div>
    );
  }

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [isLoading, user, router]);

  if (!user) {
    return null;
  }

  const userRole = user.role.toLowerCase();
  const navLinks = userRole === 'firm' ? [
    { name: 'Dashboard', href: '/firm', icon: LayoutDashboard },
    { name: 'Flights', href: '/flights', icon: PlaneTakeoff },
    { name: 'Transactions', href: '/transactions', icon: ArrowRightLeft },
  ] : [
    { name: 'Admin Dashboard', href: '/admin', icon: LayoutDashboard },
    { name: 'Flights', href: '/flights', icon: PlaneTakeoff },
    { name: 'Transactions', href: '/transactions', icon: ArrowRightLeft },
  ];

  const pageTitle = navLinks.find(link => pathname.startsWith(link.href))?.name || 'Dashboard';

  return (
    <div className="flex h-screen bg-slate-900 w-full font-sans">
      {/* Sidebar */}
      <div className="w-64 bg-black text-white flex flex-col h-full overflow-y-auto border-r border-fuchsia-900/50 shadow-[5px_0_15px_rgba(192,38,211,0.1)]">
        <div className="p-5 flex items-center gap-3 border-b border-slate-800">
          <div className="bg-gradient-to-br from-fuchsia-600 to-yellow-500 p-2 rounded-lg">
            <PlaneTakeoff size={24} />
          </div>
          <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-500">JetStream B2B</h1>
        </div>
        <div className="flex-1 px-4 space-y-2 mt-6">
          <div className="mb-4 px-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {userRole === 'firm' ? 'Agency Portal' : 'Admin Console'}
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
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <link.icon size={18} />
                <span>{link.name}</span>
              </Link>
            )
          })}
        </div>
        <div className="p-4 border-t border-slate-800 mt-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <UserCircle size={24} className="text-yellow-400" />
              <span className="text-sm font-medium text-slate-300 truncate">{user.email}</span>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-2 p-2 rounded-md text-slate-400 hover:bg-red-900/50 hover:text-white transition-colors"
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-black/50 backdrop-blur-sm shadow-lg h-16 flex items-center justify-between px-8 border-b border-slate-800 shrink-0">
          <h2 className="text-xl font-semibold text-white">
            {pageTitle}
          </h2>
          {/* You can add more header items here, like notifications or a search bar */}
        </header>
        <main className="flex-1 overflow-y-auto p-8 bg-slate-950/50">
          <div className="bg-black/30 p-6 rounded-xl border border-slate-800 shadow-2xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
