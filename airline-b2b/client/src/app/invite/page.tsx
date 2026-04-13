"use client";

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import type { AxiosError } from 'axios';
import { useAuth } from '@/contexts/AuthContext';

type ApiErrorResponse = {
  error?: string;
};

type AcceptInviteResponse = {
  success?: boolean;
  message?: string;
  token?: string;
  user?: unknown;
};

function getApiErrorMessage(error: unknown): string | undefined {
  const axiosError = error as AxiosError<ApiErrorResponse>;
  return axiosError?.response?.data?.error;
}

function InviteContent() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { token: currentToken, login } = useAuth();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const id = searchParams.get('id') || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token || !id) {
      toast.error('Invalid invitation link');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<AcceptInviteResponse>('/invites/accept', { id, token, password });
      const apiToken = res.data?.token;
      const apiUser = res.data?.user;

      if (!currentToken && apiToken && apiUser) {
        login(apiToken, apiUser);
        toast.success('Account activated. You are now signed in.');
        const role = String((apiUser as any)?.role || '').toLowerCase();
        router.push(role === 'firm' ? '/firm' : '/admin');
      } else {
        toast.success('Account created successfully. Please log in.');
        router.push('/login');
      }
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error) || 'Failed to accept invitation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-foreground">
            Set Your Password
          </h2>
          <p className="mt-2 text-center text-sm text-muted">
            Welcome! Please set a password to activate your account.
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="-space-y-px rounded-md shadow-sm">
            <div>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="relative block w-full rounded-md bg-surface border border-border py-2 px-3 text-foreground placeholder:text-muted focus:z-10 outline-none focus:border-fuchsia-500 transition sm:text-sm"
                placeholder="New Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="mt-3">
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                className="relative block w-full rounded-md bg-surface border border-border py-2 px-3 text-foreground placeholder:text-muted focus:z-10 outline-none focus:border-fuchsia-500 transition sm:text-sm"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative flex w-full justify-center rounded-md bg-indigo-600 py-2 px-3 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              {loading ? 'Activating...' : 'Activate Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function InviteAcceptPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <InviteContent />
    </Suspense>
  );
}
