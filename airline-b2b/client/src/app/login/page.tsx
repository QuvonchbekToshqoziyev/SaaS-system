"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const { token, user } = res.data;
      login(token, user);
      toast.success('Logged in successfully', {
        style: { background: '#000', color: '#eab308', border: '1px solid #eab308' },
      });
      const role = String(user?.role || '').toLowerCase();
      if (role === 'firm') {
        router.push('/firm');
      } else {
        router.push('/admin');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Login failed', {
        style: { background: '#000', color: '#c026d3', border: '1px solid #c026d3' },
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 bg-surface p-10 rounded-2xl border border-border shadow-lg">
        <div>
          <h2 className="mt-2 text-center text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-600">
            JetStream B2B
          </h2>
          <p className="mt-3 text-center text-sm text-fuchsia-600">
            Wholesale Flight Ticket Distribution
          </p>
          <h3 className="mt-6 text-center text-xl font-bold tracking-tight text-foreground">
            Partner Login
          </h3>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4 rounded-md shadow-sm">
            <div>
              <label className="block text-sm font-medium text-muted mb-1" htmlFor="email-address">Agency Email</label>
              <input
                id="email-address"
                name="email"
                type="email"
                required
                className="relative block w-full rounded-lg bg-surface-2 border border-border py-2.5 px-3 text-foreground placeholder:text-muted focus:z-10 outline-none focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 sm:text-sm"
                placeholder="agency@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-1" htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="relative block w-full rounded-lg bg-surface-2 border border-border py-2.5 px-3 text-foreground placeholder:text-muted focus:z-10 outline-none focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 sm:text-sm"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative flex w-full justify-center rounded-lg bg-fuchsia-600 py-3 px-4 text-sm font-bold text-white transition hover:bg-fuchsia-500 focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:ring-offset-2 focus:ring-offset-background disabled:opacity-70"
            >
              {loading ? 'Authenticating...' : 'Access Portal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
