"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

export type NormalizedRole = 'superadmin' | 'admin' | 'firm';

export interface User {
  id: string;
  email: string;
  fullName?: string | null;
  phone?: string | null;
  role: NormalizedRole;
  readOnlyAccess: boolean;
  firmRole: 'FIRM_ADMIN' | 'MANAGER' | 'KASSIR';
  firmKind?: 'AGENCY' | 'AIRLINE' | 'CONTRACTOR' | null;
  firmId: string | null;
  subscriptionEndsAt?: string | null;
}

export type SavedAccount = User & {
  token: string;
  lastUsedAt: string;
};

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: unknown) => void;
  logout: () => void;
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
  if (r === 'MANAGER') return 'MANAGER';
  if (r === 'FIRM_ADMIN') return 'FIRM_ADMIN';
  return 'MANAGER';
}

function normalizeUser(raw: unknown): User | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as any;
  const idVal = obj.id;
  const emailVal = obj.email;
  if (!emailVal || typeof emailVal !== 'string') return null;

  const firmIdRaw = obj.firmId ?? obj.firm_id ?? null;
  const firmId = typeof firmIdRaw === 'string' ? firmIdRaw : firmIdRaw ? String(firmIdRaw) : null;

  return {
    id: typeof idVal === 'string' ? idVal : idVal ? String(idVal) : '',
    email: emailVal,
    fullName: typeof obj.fullName === 'string' ? obj.fullName : null,
    phone: typeof obj.phone === 'string' ? obj.phone : null,
    role: normalizeRole(obj.role),
    readOnlyAccess: obj.readOnlyAccess === true,
    firmRole: normalizeFirmRole(obj.firmRole ?? obj.firm_role),
    firmKind: typeof (obj.firmKind ?? obj.firm_kind) === 'string'
      ? String(obj.firmKind ?? obj.firm_kind).toUpperCase() as User['firmKind']
      : null,
    firmId,
    subscriptionEndsAt: typeof obj.subscriptionEndsAt === 'string' ? obj.subscriptionEndsAt : null,
  };
}

function readSavedAccounts(): SavedAccount[] {
  if (typeof window === 'undefined') return [];
  localStorage.removeItem(SAVED_ACCOUNTS_KEY);
  return [];
}

function writeSavedAccounts(accounts: SavedAccount[]) {
  if (!accounts.length) {
    localStorage.removeItem(SAVED_ACCOUNTS_KEY);
    return;
  }
  localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(accounts));
}

function persistActiveSession(nextToken: string, nextUser: User) {
  localStorage.setItem('token', nextToken);
  localStorage.setItem('user', JSON.stringify(nextUser));
}

function clearActiveSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

function accountHome(user: User): string {
  return user.role === 'firm' ? '/firm' : '/admin';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  useEffect(() => {
    setSavedAccounts(readSavedAccounts());
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (storedToken && storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        const normalized = normalizeUser(parsed);
        if (normalized) {
          setToken(storedToken);
          setUser(normalized);
          persistActiveSession(storedToken, normalized);
        } else {
          clearActiveSession();
        }
      } catch {
        clearActiveSession();
      }
    }
    setIsLoading(false);
  }, []);

  const login = (newToken: string, newUser: unknown) => {
    const normalized = normalizeUser(newUser);
    if (!normalized) return;
    queryClient.clear();
    writeSavedAccounts([]);
    setSavedAccounts([]);
    persistActiveSession(newToken, normalized);
    setToken(newToken);
    setUser(normalized);
  };

  const logout = () => {
    queryClient.clear();
    writeSavedAccounts([]);
    setSavedAccounts([]);
    clearActiveSession();
    setToken(null);
    setUser(null);
    router.push('/login');
  };

  const switchAccount = (accountId: string) => {
    const account = savedAccounts.find((item) => item.id === accountId || item.email === accountId);
    if (!account) return;
    queryClient.clear();
    const { token: accountToken, lastUsedAt: _lastUsedAt, ...nextUser } = account;
    const nextAccounts = [
      { ...account, lastUsedAt: new Date().toISOString() },
      ...savedAccounts.filter((item) => item.id !== account.id),
    ];
    writeSavedAccounts(nextAccounts);
    setSavedAccounts(nextAccounts);
    persistActiveSession(accountToken, nextUser);
    setToken(accountToken);
    setUser(nextUser);
    router.push(accountHome(nextUser));
  };

  const forgetAccount = (accountId: string) => {
    const nextAccounts = savedAccounts.filter((item) => item.id !== accountId && item.email !== accountId);
    writeSavedAccounts(nextAccounts);
    setSavedAccounts(nextAccounts);
    if (user && (user.id === accountId || user.email === accountId)) {
      queryClient.clear();
      const nextAccount = nextAccounts[0];
      if (nextAccount) {
        const { token: nextToken, lastUsedAt: _lastUsedAt, ...nextUser } = nextAccount;
        persistActiveSession(nextToken, nextUser);
        setToken(nextToken);
        setUser(nextUser);
        router.push(accountHome(nextUser));
      } else {
        clearActiveSession();
        setToken(null);
        setUser(null);
        router.push('/login');
      }
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, savedAccounts, switchAccount, forgetAccount, isLoading }}>
      {children}
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
