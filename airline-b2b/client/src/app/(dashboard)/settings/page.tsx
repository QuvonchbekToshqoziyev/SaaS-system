"use client";

import { useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

export default function SettingsPage() {
  const { user } = useAuth();
  const { tr } = useLanguage();

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
      toast.error(tr('Please fill in all fields', 'Iltimos, barcha maydonlarni to\'ldiring'));
      return;
    }
    if (newPassword.length < 6) {
      toast.error(tr('Password must be at least 6 characters', "Parol kamida 6 ta belgidan iborat bo'lishi kerak"));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(tr('Passwords do not match', 'Parollar mos kelmadi'));
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
      toast.success(tr('Password updated', 'Parol yangilandi'));
    } catch {
      toast.error(tr('Failed to update password', 'Parolni yangilab bo\'lmadi'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-3xl font-bold text-foreground">{tr('Settings', 'Sozlamalar')}</h2>
        <p className="mt-1 text-sm text-muted">
          {tr('Manage your account.', 'Hisobingizni boshqaring.')}
        </p>
      </div>

      <div className="bg-surface-2 border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-foreground">{tr('Theme', 'Mavzu')}</h3>
        <p className="mt-2 text-sm text-muted">
          {tr('Choose how the dashboard looks.', 'Dashboard ko\'rinishini tanlang.')}
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
            {tr('Dark', 'Qorong\'i')}
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
            {tr('Light', 'Yorug\'')}
          </button>
        </div>
      </div>

      <div className="bg-surface-2 border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-foreground">{tr('Account', 'Hisob')}</h3>
        <p className="mt-2 text-sm text-foreground">
          <span className="text-muted">{tr('Email', 'Email')}:</span> {user?.email}
        </p>
        <p className="mt-1 text-sm text-foreground">
          <span className="text-muted">{tr('Role', 'Rol')}:</span> {user?.role}
        </p>
      </div>

      <div className="bg-surface-2 border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">{tr('Change password', 'Parolni almashtirish')}</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted mb-1">{tr('Current password', 'Joriy parol')}</label>
            <input
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              type="password"
              className="w-full bg-surface border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-blue-500 transition placeholder:text-muted"
              placeholder="••••••••"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted mb-1">{tr('New password', 'Yangi parol')}</label>
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              type="password"
              className="w-full bg-surface border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-blue-500 transition placeholder:text-muted"
              placeholder={tr('At least 6 characters', 'Kamida 6 ta belgi')}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted mb-1">{tr('Confirm new password', 'Yangi parolni tasdiqlang')}</label>
            <input
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              type="password"
              className="w-full bg-surface border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-blue-500 transition placeholder:text-muted"
              placeholder={tr('Repeat new password', 'Yangi parolni qayta kiriting')}
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? tr('Updating...', 'Yangilanmoqda...') : tr('Update password', 'Parolni yangilash')}
          </button>
        </form>
      </div>
    </div>
  );
}
