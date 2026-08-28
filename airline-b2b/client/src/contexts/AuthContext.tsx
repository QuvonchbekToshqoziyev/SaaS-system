"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type NormalizedRole = 'superadmin' | 'admin' | 'firm';

const APP_CAPABILITIES = [
  'dashboard.view',
  'platform.admins.manage',
  'audit.view',
  'monitoring.view',
  'airlines.view',
  'organizations.view',
  'flights.view',
  'tours.view',
  'services.view',
  'inventory.view',
  'finance.transactions.view',
  'finance.kassa.view',
  'employees.view',
  'chat.view',
  'reports.view',
  'settings.view',
] as const;

export type AppCapability = typeof APP_CAPABILITIES[number];

const APP_CAPABILITY_SET = new Set<string>(APP_CAPABILITIES);

export interface User {
  id: string;
  email: string;
  fullName?: string | null;
  phone?: string | null;
  role: NormalizedRole;
  readOnlyAccess: boolean;
  firmRole: 'FIRM_ADMIN' | 'MANAGER' | 'KASSIR' | 'OMBOR_MUDIRI';
  firmKind?: 'AGENCY' | 'AIRLINE' | 'CONTRACTOR' | null;
  firmId: string | null;
  subscriptionEndsAt?: string | null;
  capabilities: AppCapability[];
}

export type SavedAccount = User & {
  lastUsedAt: string;
};

interface AuthContextType {
  user: User | null;
  login: (user: unknown) => void;
  logout: () => Promise<void>;
  savedAccounts: SavedAccount[];
  switchAccount: (accountId: string) => void;
  forgetAccount: (accountId: string) => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const SAVED_ACCOUNTS_KEY = 'ado-b2b-saved-accounts';

function normalizeRole(role: unknown): NormalizedRole {
  const r = String(role || '').toLowerCase();
  if (r === 'superadmin' || r === 'admin' || r === 'firm') return r;
  return 'firm';
}

function normalizeFirmRole(role: unknown): User['firmRole'] {
  const r = String(role || '').toUpperCase();
  if (r === 'KASSIR' || r === 'KASSA' || r === 'KASSA_OPERATOR' || r === 'CASHIER') return 'KASSIR';
  if (r === 'OMBOR_MUDIRI' || r === 'OMBORCHI') return 'OMBOR_MUDIRI';
  if (r === 'MANAGER') return 'MANAGER';
  if (r === 'FIRM_ADMIN') return 'FIRM_ADMIN';
  return 'MANAGER';
}

function legacyCapabilities(role: NormalizedRole, firmRole: User['firmRole']): AppCapability[] {
  const common: AppCapability[] = [
    'dashboard.view', 'flights.view', 'tours.view', 'services.view', 'inventory.view',
    'finance.transactions.view', 'finance.kassa.view', 'chat.view', 'reports.view', 'settings.view',
  ];
  if (role === 'superadmin') return [
    ...common, 'platform.admins.manage', 'audit.view', 'monitoring.view', 'airlines.view',
    'organizations.view', 'employees.view',
  ];
  if (role === 'admin' || firmRole === 'FIRM_ADMIN') return [...common, 'organizations.view', 'employees.view'];
  if (firmRole === 'KASSIR') return ['finance.kassa.view', 'chat.view', 'settings.view'];
  if (firmRole === 'OMBOR_MUDIRI') return ['inventory.view'];
  return common;
}

function normalizeUser(raw: unknown): User | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as any;
  const idVal = obj.id;
  const emailVal = obj.email;
  if (!emailVal || typeof emailVal !== 'string') return null;

  const firmIdRaw = obj.firmId ?? obj.firm_id ?? null;
  const firmId = typeof firmIdRaw === 'string' ? firmIdRaw : firmIdRaw ? String(firmIdRaw) : null;

  const role = normalizeRole(obj.role);
  const firmRole = normalizeFirmRole(obj.firmRole ?? obj.firm_role);
  const capabilities = Array.isArray(obj.capabilities)
    ? obj.capabilities.filter((value: unknown): value is AppCapability => typeof value === 'string' && APP_CAPABILITY_SET.has(value))
    : legacyCapabilities(role, firmRole);

  return {
    id: typeof idVal === 'string' ? idVal : idVal ? String(idVal) : '',
    email: emailVal,
    fullName: typeof obj.fullName === 'string' ? obj.fullName : null,
    phone: typeof obj.phone === 'string' ? obj.phone : null,
    role,
    readOnlyAccess: obj.readOnlyAccess === true,
    firmRole,
    firmKind: typeof (obj.firmKind ?? obj.firm_kind) === 'string'
      ? String(obj.firmKind ?? obj.firm_kind).toUpperCase() as User['firmKind']
      : null,
    firmId,
    subscriptionEndsAt: typeof obj.subscriptionEndsAt === 'string' ? obj.subscriptionEndsAt : null,
    capabilities,
  };
}

function writeSavedAccounts(accounts: SavedAccount[]) {
  if (!accounts.length) {
    localStorage.removeItem(SAVED_ACCOUNTS_KEY);
    return;
  }
  localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(accounts));
}

function clearLegacySession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem(SAVED_ACCOUNTS_KEY);
}

function accountHome(user: User): string {
  if (user.role !== 'firm') return '/admin';
  if (user.firmRole === 'KASSIR') return '/kassa';
  if (user.firmRole === 'OMBOR_MUDIRI') return '/inventory';
  return '/firm';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const sessionRequestId = useRef(0);
  const normalizedPathname = pathname !== '/' ? pathname.replace(/\/+$/, '') : pathname;
  const isPublicPath = normalizedPathname === '/'
    || normalizedPathname === '/login'
    || normalizedPathname === '/invite'
    || normalizedPathname.startsWith('/invite/');

  useEffect(() => {
    const requestId = ++sessionRequestId.current;
    clearLegacySession();
    api.get('/auth/session', { timeout: 15_000 })
      .then((response) => {
        if (sessionRequestId.current === requestId) setUser(normalizeUser(response.data?.user));
      })
      .catch(() => {
        if (sessionRequestId.current === requestId) setUser(null);
      })
      .finally(() => {
        if (sessionRequestId.current === requestId) setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!isLoading && !user && !isPublicPath) router.replace('/login');
  }, [isLoading, isPublicPath, router, user]);

  const login = (newUser: unknown) => {
    const normalized = normalizeUser(newUser);
    if (!normalized) return;
    sessionRequestId.current += 1;
    queryClient.clear();
    writeSavedAccounts([]);
    setSavedAccounts([]);
    setUser(normalized);
    setIsLoading(false);
  };

  const logout = async () => {
    await api.post('/auth/logout');
    sessionRequestId.current += 1;
    queryClient.clear();
    writeSavedAccounts([]);
    setSavedAccounts([]);
    clearLegacySession();
    setUser(null);
    router.push('/login');
  };

  const switchAccount = (accountId: string) => {
    const account = savedAccounts.find((item) => item.id === accountId || item.email === accountId);
    if (!account) return;
    queryClient.clear();
    const { lastUsedAt: _lastUsedAt, ...nextUser } = account;
    const nextAccounts = [
      { ...account, lastUsedAt: new Date().toISOString() },
      ...savedAccounts.filter((item) => item.id !== account.id),
    ];
    writeSavedAccounts(nextAccounts);
    setSavedAccounts(nextAccounts);
    setUser(nextUser);
    router.push(accountHome(nextUser));
  };

  const forgetAccount = (accountId: string) => {
    const nextAccounts = savedAccounts.filter((item) => item.id !== accountId && item.email !== accountId);
    writeSavedAccounts(nextAccounts);
    setSavedAccounts(nextAccounts);
    if (user && (user.id === accountId || user.email === accountId)) {
      sessionRequestId.current += 1;
      queryClient.clear();
      clearLegacySession();
      setUser(null);
      void api.post('/auth/logout');
      router.push('/login');
    }
  };

  const content = !isPublicPath && (isLoading || !user) ? (
    <div className="fixed inset-0 z-[9999] flex min-h-dvh items-center justify-center bg-[#030710] text-white">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-white/15 border-t-[#ff2337]" />
        <span className="text-sm font-semibold">Authenticating...</span>
      </div>
    </div>
  ) : children;

  return (
    <AuthContext.Provider value={{ user, login, logout, savedAccounts, switchAccount, forgetAccount, isLoading }}>
      {content}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
