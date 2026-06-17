"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export type NormalizedRole = 'superadmin' | 'admin' | 'firm';

export interface User {
  id: string;
  email: string;
  role: NormalizedRole;
  firmId: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: unknown) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function normalizeRole(role: unknown): NormalizedRole {
  const r = String(role || '').toLowerCase();
  if (r === 'superadmin' || r === 'admin' || r === 'firm') return r;
  return 'firm';
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
    role: normalizeRole(obj.role),
    firmId,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (storedToken && storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        const normalized = normalizeUser(parsed);
        if (normalized) {
          setToken(storedToken);
          setUser(normalized);
          localStorage.setItem('user', JSON.stringify(normalized));
        } else {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        }
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = (newToken: string, newUser: unknown) => {
    const normalized = normalizeUser(newUser);
    if (!normalized) return;
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(normalized));
    setToken(newToken);
    setUser(normalized);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
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
