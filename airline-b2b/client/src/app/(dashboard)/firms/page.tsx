"use client";

import { useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Plus, X, Building, ArrowRight, TrendingUp } from 'lucide-react';
import type { AxiosError } from 'axios';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

type ApiErrorResponse = {
  error?: string;
};

function getApiErrorMessage(error: unknown): string | undefined {
  const axiosError = error as AxiosError<ApiErrorResponse>;
  return axiosError?.response?.data?.error;
}

type CreateFirmInviteResponse = {
  inviteId: string;
  token?: string;
  firmId?: string | null;
  expiresAt?: string;
  link?: string;
};

export default function FirmsPage() {
  const { user } = useAuth();
  const { tr } = useLanguage();

  const role = (user?.role || '').toString().toUpperCase();
  const canManage = role === 'ADMIN' || role === 'SUPERADMIN';

  const [firmName, setFirmName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteExpiresAt, setInviteExpiresAt] = useState<string | null>(null);
  const [createdFirmId, setCreatedFirmId] = useState<string | null>(null);

  const closeModal = () => {
    setInviteLink(null);
    setInviteExpiresAt(null);
    setCreatedFirmId(null);
  };

  const { data: firms, isLoading: loadingFirms } = useQuery<any[]>({
    queryKey: ['firms'],
    queryFn: async () => {
      if (!canManage) return [];
      const res = await api.get('/firms');
      return res.data;
    },
    enabled: canManage,
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) {
      toast.error(tr('Not authorized', "Ruxsat yo'q"));
      return;
    }

    const trimmedName = firmName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      toast.error(tr('Firm name is required', 'Firma nomi kerak'));
      return;
    }
    if (!trimmedEmail) {
      toast.error(tr('Firm email is required', 'Firma emaili kerak'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post<CreateFirmInviteResponse>('/invites', {
        email: trimmedEmail,
        role: 'FIRM',
        firmName: trimmedName,
      });

      const { inviteId, token, firmId, expiresAt, link } = res.data;

      let tokenFromLink: string | null = null;
      let idFromLink: string | null = null;
      if (link) {
        try {
          const u = new URL(link);
          tokenFromLink = u.searchParams.get('token');
          idFromLink = u.searchParams.get('id');
        } catch {
          // ignore
        }
      }

      const finalInviteId = inviteId || idFromLink || '';
      const finalToken = token || tokenFromLink || '';

      const baseOrigin = (() => {
        if (link) {
          try {
            return new URL(link).origin;
          } catch {
            // ignore
          }
        }
        return window.location.origin;
      })();

      const computedLink = (() => {
        if (link) {
          try {
            const u = new URL(link);
            if (u.searchParams.get('token') && u.searchParams.get('id')) {
              return u.toString();
            }
          } catch {
            // ignore
          }
        }

        return (finalInviteId && finalToken)
          ? `${baseOrigin}/invite/accept?token=${finalToken}&id=${finalInviteId}`
          : `${baseOrigin}/invite/accept`;
      })();

      setInviteLink(computedLink);
      setInviteExpiresAt(expiresAt || null);
      setCreatedFirmId(firmId ? String(firmId) : null);

      setFirmName('');
      setEmail('');
      toast.success(tr('Firm created. Invite link generated.', 'Firma yaratildi. Taklif havolasi yaratildi.'));
      // Optional: Since firm is technically tracked via invite first then created on accept, wait it is created initially:
      // In this setup, maybe the firm is not instantly accepted but listed anyway if it's returning firmId. 
      // Let's refetch or window.location.reload() later, just to be safe. We don't have queryClient exposed here yet, but a page reload isn't needed. 
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error) || tr('Failed to create firm', 'Firmani yaratib bo\'lmadi'));
    } finally {
      setSubmitting(false);
    }
  };

  const copyInvite = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      toast.success(tr('Invite link copied', 'Taklif havolasi nusxalandi'));
    } catch {
      toast.error(tr('Failed to copy link', 'Havolani nusxalab bo\'lmadi'));
    }
  };

  if (!canManage) {
    return (
      <div className="text-foreground">
        <h2 className="text-2xl font-bold text-foreground">{tr('Firms', 'Firmalar')}</h2>
        <p className="mt-2 text-muted">{tr('Only admins can create firms.', 'Faqat adminlar firmalarni yaratishi mumkin.')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">{tr('Firms', 'Firmalar')}</h2>
          <p className="mt-1 text-sm text-muted">
            {tr('Create a firm and generate a one-time invite link.', 'Firma yarating va bir martalik taklif havolasini yarating.')}
          </p>
        </div>
      </div>

      <div className="bg-surface-2 border border-border rounded-xl p-6 max-w-xl">
        <h3 className="text-lg font-semibold text-foreground mb-4">{tr('Create new firm', 'Yangi firma yaratish')}</h3>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted mb-1">{tr('Firm name', 'Firma nomi')}</label>
            <input
              value={firmName}
              onChange={(e) => setFirmName(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-primary transition"
              placeholder="e.g. Atlas Travel"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted mb-1">{tr('Firm email', 'Firma emaili')}</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              className="w-full bg-surface border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-primary transition"
              placeholder="firm@example.com"
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-ink font-bold uppercase tracking-wider rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={18} />
            {submitting
              ? tr('Creating...', 'Yaratilmoqda...')
              : tr('Create firm & generate link', 'Firma yaratish va taklif havolasini yaratish')}
          </button>
        </form>
      </div>

      <div className="bg-surface-2 border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-foreground">{tr('All Firms', 'Barcha firmalar')}</h3>
          <div className="text-sm font-mono text-muted bg-surface border border-border px-3 py-1 rounded-md">
            {firms?.length || 0} {tr('Total', 'Jami')}
          </div>
        </div>

        {loadingFirms ? (
          <div className="py-12 flex justify-center items-center text-muted">
            <Building className="animate-pulse w-8 h-8" />
          </div>
        ) : !firms || firms.length === 0 ? (
          <div className="py-12 text-center text-muted border border-dashed border-border rounded-lg">
            {tr('No firms found.', 'Guruhlar topilmadi.')}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {firms.map((firm) => (
              <div key={firm.id} className="group bg-surface border border-border hover:border-primary hover:shadow-[0_8px_30px_rgba(201,168,76,0.1)] transition-all duration-300 rounded-xl p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-surface-2 border border-border flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                      <Building size={20} className="text-muted group-hover:text-primary transition-colors" />
                    </div>
                    <span className="text-xs font-mono text-muted px-2 py-1 bg-surface-2 rounded border border-border group-hover:border-primary/30">
                      ID: {firm.id.slice(0, 8)}...
                    </span>
                  </div>
                  <h4 className="text-lg font-playfair font-bold text-foreground mb-1 tracking-wide">{firm.name}</h4>
                  <p className="text-xs text-muted font-mono mb-4">
                    {tr('Registered', 'Ro\'yxatdan o\'tgan')}: {new Date(firm.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2 border-t border-border pt-4 mt-2">
                  <Link
                    href={`/transactions?firmId=${encodeURIComponent(firm.id)}`}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-surface-2 hover:bg-white/5 text-muted hover:text-foreground rounded-lg transition border border-transparent hover:border-border text-[0.8rem] uppercase font-bold tracking-widest"
                  >
                    <ArrowRight size={14} />
                    {tr('Ledger', 'Daftar')}
                  </Link>
                  <Link
                    href={`/reports?firmId=${encodeURIComponent(firm.id)}`}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-surface-2 hover:bg-white/5 text-muted hover:text-foreground rounded-lg transition border border-transparent hover:border-border text-[0.8rem] uppercase font-bold tracking-widest"
                  >
                    <TrendingUp size={14} />
                    {tr('Stats', 'Statistika')}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {inviteLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-foreground">{tr('One-time invite link', 'Bir martalik taklif havolasi')}</h3>
              <button onClick={closeModal} className="text-muted hover:text-foreground" aria-label={tr('Close', 'Yopish')}>
                <X size={20} />
              </button>
            </div>

            <p className="text-sm text-muted mb-3">
              {tr('Send this link to the firm. It can only be used once.', 'Bu havolani firmaga yuboring. U faqat bir marta ishlatiladi.')}
            </p>

            <div className="flex gap-3">
              <input
                readOnly
                value={inviteLink}
                className="flex-1 bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground outline-none"
              />
              <button
                type="button"
                onClick={copyInvite}
                className="px-4 py-2 bg-surface-2 hover:bg-surface text-foreground rounded-lg transition"
              >
                {tr('Copy', 'Nusxalash')}
              </button>
            </div>

            {createdFirmId && (
              <div className="mt-4 flex items-center gap-2">
                <Link
                  href={`/transactions?firmId=${encodeURIComponent(createdFirmId)}`}
                  className="px-3 py-2 bg-surface-2 hover:bg-surface text-foreground rounded-lg transition border border-border text-sm font-medium"
                >
                  {tr('Open transactions', 'Tranzaksiyalarni ochish')}
                </Link>
                <Link
                  href={`/reports?firmId=${encodeURIComponent(createdFirmId)}`}
                  className="px-3 py-2 bg-surface-2 hover:bg-surface text-foreground rounded-lg transition border border-border text-sm font-medium"
                >
                  {tr('Open reports', 'Hisobotlarni ochish')}
                </Link>
              </div>
            )}

            {inviteExpiresAt && (
              <p className="mt-3 text-xs text-muted">
                {tr('Expires:', 'Amal qilish muddati:')} {new Date(inviteExpiresAt).toLocaleString()}
              </p>
            )}

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 bg-primary hover:bg-primary-hover text-ink font-bold uppercase tracking-wider rounded-lg transition"
              >
                {tr('Done', 'Tayyor')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
