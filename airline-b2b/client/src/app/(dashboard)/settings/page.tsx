"use client";

import { useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

export default function SettingsPage() {
  const { user } = useAuth();

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    const stored = window.localStorage.getItem('jetstream-theme');
    return stored === 'light' ? 'light' : 'dark';
  });

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const applyTheme = (next: 'dark' | 'light') => {
    setTheme(next);
    try {
      window.localStorage.setItem('jetstream-theme', next);
    } catch {
      // ignore
    }
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword || !newPassword) {
      toast.error('Please fill in all fields');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password updated');
    } catch {
      toast.error('Failed to update password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-3xl font-bold text-foreground">Settings</h2>
        <p className="mt-1 text-sm text-muted">
          Manage your account.
        </p>
      </div>

      <div className="bg-surface-2 border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-foreground">Theme</h3>
        <p className="mt-2 text-sm text-muted">
          Choose how the dashboard looks.
        </p>
        <div className="mt-4 inline-flex rounded-lg border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => applyTheme('dark')}
            aria-pressed={theme === 'dark'}
            className={`px-4 py-2 text-sm font-medium transition ${theme === 'dark'
              ? 'bg-surface text-foreground'
              : 'bg-transparent text-muted hover:bg-surface'
            }`}
          >
            Dark
          </button>
          <button
            type="button"
            onClick={() => applyTheme('light')}
            aria-pressed={theme === 'light'}
            className={`px-4 py-2 text-sm font-medium transition ${theme === 'light'
              ? 'bg-surface text-foreground'
              : 'bg-transparent text-muted hover:bg-surface'
            }`}
          >
            Light
          </button>
        </div>
      </div>

      <div className="bg-surface-2 border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-foreground">Account</h3>
        <p className="mt-2 text-sm text-foreground">
          <span className="text-muted">Email:</span> {user?.email}
        </p>
        <p className="mt-1 text-sm text-foreground">
          <span className="text-muted">Role:</span> {user?.role}
        </p>
      </div>

      <div className="bg-surface-2 border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Change password</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted mb-1">Current password</label>
            <input
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              type="password"
              className="w-full bg-surface border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-fuchsia-500 transition placeholder:text-muted"
              placeholder="••••••••"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted mb-1">New password</label>
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              type="password"
              className="w-full bg-surface border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-fuchsia-500 transition placeholder:text-muted"
              placeholder="At least 6 characters"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted mb-1">Confirm new password</label>
            <input
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              type="password"
              className="w-full bg-surface border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-fuchsia-500 transition placeholder:text-muted"
              placeholder="Repeat new password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Updating...' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
}
