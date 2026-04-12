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
    <div className="flex min-h-screen items-center justify-center bg-blue-950 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 bg-black p-10 rounded-2xl border-2 border-yellow-500 shadow-[0_0_30px_rgba(234,179,8,0.2)]">
        <div>
          <h2 className="mt-2 text-center text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-600">
            JetStream B2B
          </h2>
          <p className="mt-3 text-center text-sm text-fuchsia-400">
            Wholesale Flight Ticket Distribution
          </p>
          <h3 className="mt-6 text-center text-xl font-bold tracking-tight text-white">
            Partner Login
          </h3>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4 rounded-md shadow-sm">
            <div>
              <label className="block text-sm font-medium text-yellow-500 mb-1" htmlFor="email-address">Agency Email</label>
              <input
                id="email-address"
                name="email"
                type="email"
                required
                className="relative block w-full rounded-lg border border-gray-700 bg-gray-900 py-2.5 px-3 text-white placeholder:text-gray-500 focus:z-10 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 sm:text-sm"
                placeholder="agency@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-yellow-500 mb-1" htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="relative block w-full rounded-lg border border-gray-700 bg-gray-900 py-2.5 px-3 text-white placeholder:text-gray-500 focus:z-10 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 sm:text-sm"
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
              className="group relative flex w-full justify-center rounded-lg bg-fuchsia-600 py-3 px-4 text-sm font-bold text-white transition-all hover:bg-fuchsia-500 focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:ring-offset-2 focus:ring-offset-black disabled:opacity-70 shadow-[0_0_15px_rgba(192,38,211,0.4)]"
            >
              {loading ? 'Authenticating...' : 'Access Portal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
