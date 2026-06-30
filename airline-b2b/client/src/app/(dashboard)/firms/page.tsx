"use client";

import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Plus, X } from 'lucide-react';
import type { AxiosError } from 'axios';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';

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

type FirmRow = {
  id: string;
  name: string;
  creditLimit?: number | string;
  balance?: number | string;
  outstanding?: number | string;
  createdAt: string;
};

export default function FirmsPage() {
  const { user } = useAuth();
  const { tr } = useLanguage();
  const queryClient = useQueryClient();

  const role = (user?.role || '').toString().toUpperCase();
  const canManage = role === 'ADMIN' || role === 'SUPERADMIN';

  const [firmName, setFirmName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [savingCreditFirmId, setSavingCreditFirmId] = useState<string | null>(null);
  const [creditDrafts, setCreditDrafts] = useState<Record<string, string>>({});
  const [firmSearch, setFirmSearch] = useState('');
  const [sortKey, setSortKey] = useState<'name' | 'balance' | 'outstanding' | 'creditLimit'>('outstanding');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteExpiresAt, setInviteExpiresAt] = useState<string | null>(null);
  const [createdFirmId, setCreatedFirmId] = useState<string | null>(null);

  const closeModal = () => {
    setInviteLink(null);
    setInviteExpiresAt(null);
    setCreatedFirmId(null);
  };

  const { data: firms, isLoading: loadingFirms } = useQuery<FirmRow[]>({
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

  const formatMoney = (value: unknown) => {
    const n = Number(value || 0);
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0);
  };

  const saveCreditLimit = async (firmId: string, currentValue: unknown) => {
    const value = creditDrafts[firmId] ?? String(currentValue ?? '0');
    try {
      setSavingCreditFirmId(firmId);
      await api.patch(`/firms/${firmId}`, { creditLimit: value.trim() || '0' });
      toast.success(tr('Credit limit saved', 'Kredit limiti saqlandi'));
      queryClient.invalidateQueries({ queryKey: ['firms'] });
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error) || tr('Failed to save credit limit', 'Kredit limitini saqlab bo\'lmadi'));
    } finally {
      setSavingCreditFirmId(null);
    }
  };

  const visibleFirms = useMemo(() => {
    const text = firmSearch.trim().toLowerCase();
    const rows = (firms || []).filter((firm) => {
      if (!text) return true;
      return [firm.name, firm.id, firm.balance, firm.outstanding, firm.creditLimit]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(text);
    });

    return [...rows].sort((a, b) => {
      const direction = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'name') return a.name.localeCompare(b.name) * direction;
      return (Number(a[sortKey] || 0) - Number(b[sortKey] || 0)) * direction;
    });
  }, [firmSearch, firms, sortDir, sortKey]);

  const setSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const sortLabel = (key: typeof sortKey) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

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

      <div className="border border-border bg-surface">
        <div className="grid grid-cols-1 gap-2 border-b border-border px-3 py-2 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <label htmlFor="firmSearch" className="compact-label">{tr('Search firms', 'Firmalarni qidirish')}</label>
            <input
              id="firmSearch"
              value={firmSearch}
              onChange={(e) => setFirmSearch(e.target.value)}
              className="compact-control"
              placeholder={tr('Type firm name or ID', 'Firma nomi yoki ID kiriting')}
            />
          </div>
          <div className="text-sm font-mono text-muted">
            {visibleFirms.length} / {firms?.length || 0} {tr('Total', 'Jami')}
          </div>
        </div>

        <div className="overflow-x-auto scroller-minimal">
          <table className="excel-table">
            <thead>
              <tr>
                <th>
                  <button type="button" onClick={() => setSort('name')} className="font-bold">
                    {tr('Firm', 'Firma')}{sortLabel('name')}
                  </button>
                </th>
                <th className="text-right">
                  <button type="button" onClick={() => setSort('balance')} className="font-bold">
                    {tr('Balance', 'Balans')}{sortLabel('balance')}
                  </button>
                </th>
                <th className="text-right">
                  <button type="button" onClick={() => setSort('outstanding')} className="font-bold">
                    {tr('Debt', 'Qarz')}{sortLabel('outstanding')}
                  </button>
                </th>
                <th className="text-right">
                  <button type="button" onClick={() => setSort('creditLimit')} className="font-bold">
                    {tr('Credit limit', 'Kredit limiti')}{sortLabel('creditLimit')}
                  </button>
                </th>
                <th>{tr('Registered', 'Ro\'yxatdan o\'tgan')}</th>
                <th>{tr('Actions', 'Amallar')}</th>
              </tr>
            </thead>
            <tbody>
              {loadingFirms ? (
                <tr><td colSpan={6} className="text-center text-muted">{tr('Loading...', 'Yuklanmoqda...')}</td></tr>
              ) : visibleFirms.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-muted">{tr('No firms found.', 'Guruhlar topilmadi.')}</td></tr>
              ) : visibleFirms.map((firm) => (
                <tr key={firm.id}>
                  <td>
                    <div className="font-semibold">{firm.name}</div>
                    <div className="font-mono text-xs text-muted">{firm.id.slice(0, 8)}...</div>
                  </td>
                  <td className={`text-right font-mono font-bold ${Number(firm.balance || 0) < 0 ? 'text-red-600' : 'text-green-700'}`}>
                    {formatMoney(firm.balance)}
                  </td>
                  <td className="text-right font-mono font-bold text-red-600">
                    {formatMoney(firm.outstanding)}
                  </td>
                  <td className="text-right">
                    <div className="flex min-w-[190px] items-center justify-end gap-2">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={creditDrafts[firm.id] ?? String(Math.round(Number(firm.creditLimit || 0)))}
                        onChange={(e) => setCreditDrafts((drafts) => ({ ...drafts, [firm.id]: e.target.value }))}
                        className="h-8 w-28 border border-border bg-surface px-2 text-right font-mono text-sm text-foreground outline-none focus:border-primary"
                      />
                      <button
                        type="button"
                        onClick={() => saveCreditLimit(firm.id, firm.creditLimit)}
                        disabled={savingCreditFirmId === firm.id}
                        className="h-8 border border-border bg-surface-2 px-2 text-xs font-semibold text-foreground hover:bg-surface disabled:opacity-50"
                      >
                        {savingCreditFirmId === firm.id ? tr('Saving', 'Saqlanmoqda') : tr('Save', 'Saqlash')}
                      </button>
                    </div>
                  </td>
                  <td>{new Date(firm.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div className="flex gap-2">
                      <Link href={`/transactions?firmId=${encodeURIComponent(firm.id)}`} className="border border-border bg-surface-2 px-2 py-1 text-xs font-semibold text-foreground hover:bg-surface">
                        {tr('History', 'Tarix')}
                      </Link>
                      <Link href={`/reports?firmId=${encodeURIComponent(firm.id)}`} className="border border-border bg-surface-2 px-2 py-1 text-xs font-semibold text-foreground hover:bg-surface">
                        {tr('Report', 'Hisobot')}
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
