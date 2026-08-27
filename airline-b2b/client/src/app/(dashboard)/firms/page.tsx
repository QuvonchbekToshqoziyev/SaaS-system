"use client";

import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Save, Trash2, X } from 'lucide-react';
import type { AxiosError } from 'axios';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ExportActions from '@/components/ui/ExportActions';
import ActionButtons from '@/components/ui/ActionButtons';
import { MIN_PASSWORD_LENGTH, passwordLengthMessage } from '@/lib/password-policy';

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
  accountCreated?: boolean;
};

type FirmRow = {
  id: string;
  name: string;
  contactFullName?: string | null;
  phone?: string | null;
  subscriptionEndsAt?: string | null;
  creditLimit?: number | string;
  currency?: string;
  kind?: 'AGENCY' | 'AIRLINE' | 'CONTRACTOR' | string;
  status?: string;
  balance?: number | string;
  outstanding?: number | string;
  createdAt: string;
};

type FirmDraft = {
  name: string;
  contactFullName: string;
  phone: string;
  subscriptionEndsAt: string;
  creditLimit: string;
  currency: string;
  kind: string;
  status: string;
  balanceAdjustmentAmount: string;
  balanceAdjustmentCurrency: string;
  balanceAdjustmentDirection: 'DEBT' | 'CREDIT';
  balanceAdjustmentCounterpartyFirmId: string;
  balanceAdjustmentNote: string;
  balanceAdjustmentExchangeRate: string;
};

type AirlineOption = {
  id: string;
  name: string;
  firmId?: string | null;
  firm?: { id: string; name: string | null; kind?: string | null } | null;
};

type AirlineConnection = {
  id: string;
  airlineFirmId: string;
  firmId: string;
  status: string;
  airlineFirm?: { id: string; name: string | null };
  firm?: { id: string; name: string | null };
};

export default function FirmsPage() {
  const { user } = useAuth();
  const { tr } = useLanguage();
  const queryClient = useQueryClient();

  const role = (user?.role || '').toString().toUpperCase();
  const canManage = role === 'ADMIN' || role === 'SUPERADMIN' || role === 'FIRM';
  const isSuperAdmin = role === 'SUPERADMIN';
  const isFirmUser = role === 'FIRM';

  const [firmName, setFirmName] = useState('');
  const [email, setEmail] = useState('');
  const [initialPassword, setInitialPassword] = useState('');
  const [contactFullName, setContactFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [subscriptionDays, setSubscriptionDays] = useState('30');
  const [priorBalanceAmount, setPriorBalanceAmount] = useState('');
  const [priorBalanceCurrency, setPriorBalanceCurrency] = useState('UZS');
  const [priorBalanceDirection, setPriorBalanceDirection] = useState<'DEBT' | 'CREDIT'>('DEBT');
  const [priorBalanceCounterpartyFirmId, setPriorBalanceCounterpartyFirmId] = useState('');
  const [priorBalanceExchangeRate, setPriorBalanceExchangeRate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [savingCreditFirmId, setSavingCreditFirmId] = useState<string | null>(null);
  const [deletingFirmId, setDeletingFirmId] = useState<string | null>(null);
  const [firmDrafts, setFirmDrafts] = useState<Record<string, FirmDraft>>({});
  const [firmSearch, setFirmSearch] = useState('');
  const [sortKey, setSortKey] = useState<'name' | 'balance' | 'outstanding' | 'creditLimit'>('outstanding');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteExpiresAt, setInviteExpiresAt] = useState<string | null>(null);
  const [createdFirmId, setCreatedFirmId] = useState<string | null>(null);
  const [connectionDraft, setConnectionDraft] = useState({ airlineFirmId: '', firmId: '' });
  const [savingConnection, setSavingConnection] = useState(false);

  const resetCreateFirm = () => {
    setFirmName(''); setEmail(''); setInitialPassword(''); setContactFullName(''); setPhone('');
    setSubscriptionDays('30'); setPriorBalanceAmount(''); setPriorBalanceCurrency('UZS');
    setPriorBalanceDirection('DEBT'); setPriorBalanceCounterpartyFirmId(''); setPriorBalanceExchangeRate('');
  };

  const closeModal = () => {
    setInviteLink(null);
    setInviteExpiresAt(null);
    setCreatedFirmId(null);
  };

  const { data: firms, isLoading: loadingFirms } = useQuery<FirmRow[]>({
    queryKey: ['firms', user?.id || user?.email || 'anonymous'],
    queryFn: async () => {
      if (!canManage) return [];
      const res = await api.get('/firms');
      return res.data;
    },
    enabled: canManage,
  });

  const { data: airlines = [] } = useQuery<AirlineOption[]>({
    queryKey: ['airlines'],
    queryFn: async () => (await api.get('/airlines')).data,
    enabled: isSuperAdmin,
  });

  const { data: airlineConnections = [] } = useQuery<AirlineConnection[]>({
    queryKey: ['airline-connections'],
    queryFn: async () => (await api.get('/airlines/connections')).data,
    enabled: isSuperAdmin,
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = firmName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      toast.error(tr('Firm name is required', 'Firma nomi kerak'));
      return;
    }
    if (isSuperAdmin && !trimmedEmail) {
      toast.error(tr('Firm email is required', 'Firma emaili kerak'));
      return;
    }
    if (isSuperAdmin && initialPassword.length < MIN_PASSWORD_LENGTH) {
      toast.error(tr(passwordLengthMessage.en, passwordLengthMessage.uz));
      return;
    }
    if (!contactFullName.trim()) {
      toast.error(tr('Full name is required', 'To\'liq ism kerak'));
      return;
    }
    if (!phone.trim()) {
      toast.error(tr('Phone number is required', 'Telefon raqam kerak'));
      return;
    }
    if (!subscriptionDays.trim() || !Number.isFinite(Number(subscriptionDays)) || Number(subscriptionDays) <= 0) {
      toast.error(tr('Enter subscription duration in days', 'Obuna muddatini kunlarda kiriting'));
      return;
    }
    if (priorBalanceAmount.trim()) {
      if (!Number.isFinite(Number(priorBalanceAmount)) || Number(priorBalanceAmount) <= 0) {
        toast.error(tr('Enter a valid prior balance', 'To\'g\'ri boshlang\'ich qarz summasini kiriting'));
        return;
      }
      if (priorBalanceCurrency.trim().toUpperCase() !== 'UZS' && (!priorBalanceExchangeRate.trim() || Number(priorBalanceExchangeRate) <= 0)) {
        toast.error(tr('Enter exchange rate to UZS', 'UZS kursini kiriting'));
        return;
      }
    }

    setSubmitting(true);
    try {
      if (!isSuperAdmin) {
        const subscriptionEndsAt = new Date(Date.now() + Number(subscriptionDays) * 24 * 60 * 60 * 1000).toISOString();
        const res = await api.post<FirmRow>('/firms', {
          name: trimmedName,
          contactFullName: contactFullName.trim(),
          phone: phone.trim(),
          subscriptionEndsAt,
          currency: 'USD',
          priorBalanceAmount: priorBalanceAmount.trim() || undefined,
          priorBalanceCurrency: priorBalanceCurrency.trim().toUpperCase() || undefined,
          priorBalanceDirection,
          priorBalanceCounterpartyFirmId: priorBalanceCounterpartyFirmId || undefined,
          priorBalanceExchangeRate: priorBalanceCurrency.trim().toUpperCase() !== 'UZS' ? priorBalanceExchangeRate.trim() : undefined,
        });

        setCreatedFirmId(res.data.id);
        setInviteLink(null);
        setInviteExpiresAt(null);
        setFirmName('');
        setContactFullName('');
        setPhone('');
        setSubscriptionDays('30');
        setPriorBalanceAmount('');
        setPriorBalanceExchangeRate('');
        toast.success(isFirmUser
          ? tr('Partner firm added.', 'Partner firma qo\'shildi.')
          : tr('Firm added.', 'Firma qo\'shildi.'));
        queryClient.invalidateQueries({ queryKey: ['firms'] });
        return;
      }

      const res = await api.post<CreateFirmInviteResponse>('/invites', {
          email: trimmedEmail,
          role: 'FIRM',
          firmName: trimmedName,
          password: initialPassword,
          fullName: contactFullName.trim(),
          phone: phone.trim(),
          subscriptionDays: Number(subscriptionDays),
          priorBalanceAmount: priorBalanceAmount.trim() || undefined,
          priorBalanceCurrency: priorBalanceCurrency.trim().toUpperCase() || undefined,
          priorBalanceDirection,
          priorBalanceCounterpartyFirmId: priorBalanceCounterpartyFirmId || undefined,
          priorBalanceExchangeRate: priorBalanceCurrency.trim().toUpperCase() !== 'UZS' ? priorBalanceExchangeRate.trim() : undefined,
        });

      const { inviteId, token, firmId, expiresAt, link, accountCreated } = res.data;

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

      setInviteLink(accountCreated ? null : computedLink);
      setInviteExpiresAt(accountCreated ? null : (expiresAt || null));
      setCreatedFirmId(firmId ? String(firmId) : null);

      setFirmName('');
      setEmail('');
      setInitialPassword('');
      setContactFullName('');
      setPhone('');
      setSubscriptionDays('30');
      setPriorBalanceAmount('');
      setPriorBalanceExchangeRate('');
      toast.success(accountCreated
        ? tr('Firm and login account created.', 'Firma va login akkaunt yaratildi.')
        : tr('Firm created. Invite link generated.', 'Firma yaratildi. Taklif havolasi yaratildi.'));
      queryClient.invalidateQueries({ queryKey: ['firms'] });
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

  const getFirmDraft = (firm: FirmRow): FirmDraft => firmDrafts[firm.id] ?? {
    name: firm.name || '',
    contactFullName: firm.contactFullName || '',
    phone: firm.phone || '',
    subscriptionEndsAt: firm.subscriptionEndsAt ? String(firm.subscriptionEndsAt).slice(0, 10) : '',
    creditLimit: String(Math.round(Number(firm.creditLimit || 0))),
    currency: String(firm.currency || 'USD'),
    kind: String(firm.kind || 'AGENCY'),
    status: String(firm.status || 'ACTIVE'),
    balanceAdjustmentAmount: '',
    balanceAdjustmentCurrency: String(firm.currency || 'UZS'),
    balanceAdjustmentDirection: 'DEBT',
    balanceAdjustmentCounterpartyFirmId: '',
    balanceAdjustmentNote: '',
    balanceAdjustmentExchangeRate: '',
  };

  const setFirmDraft = (firm: FirmRow, patch: Partial<FirmDraft>) => {
    setFirmDrafts((drafts) => ({
      ...drafts,
      [firm.id]: { ...getFirmDraft(firm), ...patch },
    }));
  };

  const saveFirm = async (firm: FirmRow) => {
    if (!isSuperAdmin) return;
    const row = getFirmDraft(firm);
    if (!row.name.trim()) {
      toast.error(tr('Firm name is required', 'Firma nomi kerak'));
      return;
    }
    if (row.balanceAdjustmentAmount.trim()) {
      if (!Number.isFinite(Number(row.balanceAdjustmentAmount)) || Number(row.balanceAdjustmentAmount) <= 0) {
        toast.error(tr('Enter a valid balance adjustment', 'To\'g\'ri balans tuzatish summasini kiriting'));
        return;
      }
      if (row.balanceAdjustmentCurrency.trim().toUpperCase() !== 'UZS' && (!row.balanceAdjustmentExchangeRate.trim() || Number(row.balanceAdjustmentExchangeRate) <= 0)) {
        toast.error(tr('Enter exchange rate to UZS', 'UZS kursini kiriting'));
        return;
      }
    }
    try {
      setSavingCreditFirmId(firm.id);
      await api.patch(`/firms/${firm.id}`, {
        name: row.name.trim(),
        contactFullName: row.contactFullName.trim(),
        phone: row.phone.trim(),
        subscriptionEndsAt: row.subscriptionEndsAt || null,
        creditLimit: row.creditLimit.trim() || '0',
        currency: row.currency.trim().toUpperCase() || 'USD',
        kind: row.kind,
        status: row.status,
        balanceAdjustmentAmount: row.balanceAdjustmentAmount.trim() || undefined,
        balanceAdjustmentCurrency: row.balanceAdjustmentCurrency.trim().toUpperCase() || undefined,
        balanceAdjustmentDirection: row.balanceAdjustmentDirection,
        balanceAdjustmentCounterpartyFirmId: row.balanceAdjustmentCounterpartyFirmId || undefined,
        balanceAdjustmentNote: row.balanceAdjustmentNote.trim() || undefined,
        balanceAdjustmentExchangeRate: row.balanceAdjustmentCurrency.trim().toUpperCase() !== 'UZS' ? row.balanceAdjustmentExchangeRate.trim() : undefined,
      });
      toast.success(tr('Firm updated', 'Firma yangilandi'));
      setFirmDrafts((drafts) => {
        const next = { ...drafts };
        delete next[firm.id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['firms'] });
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error) || tr('Failed to update firm', 'Firmani yangilab bo\'lmadi'));
    } finally {
      setSavingCreditFirmId(null);
    }
  };

  const deleteFirm = async (firm: FirmRow) => {
    if (!isSuperAdmin || deletingFirmId) return;
    const confirmed = window.confirm(tr(`Delete ${firm.name}?`, `${firm.name} o'chirilsinmi?`));
    if (!confirmed) return;

    try {
      setDeletingFirmId(firm.id);
      await api.delete(`/firms/${firm.id}`);
      toast.success(tr('Firm deleted', 'Firma o\'chirildi'));
      queryClient.invalidateQueries({ queryKey: ['firms'] });
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error) || tr('Failed to delete firm', 'Firmani o\'chirib bo\'lmadi'));
    } finally {
      setDeletingFirmId(null);
    }
  };

  const saveAirlineConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectionDraft.airlineFirmId || !connectionDraft.firmId) {
      toast.error(tr('Select airline and firm', 'Aviakompaniya va firmani tanlang'));
      return;
    }
    try {
      setSavingConnection(true);
      await api.post('/airlines/connections', {
        airlineFirmId: connectionDraft.airlineFirmId,
        firmId: connectionDraft.firmId,
        status: 'ACTIVE',
      });
      toast.success(tr('Airline connected to firm', 'Aviakompaniya firmaga ulandi'));
      setConnectionDraft({ airlineFirmId: '', firmId: '' });
      queryClient.invalidateQueries({ queryKey: ['airline-connections'] });
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error) || tr('Failed to connect airline', 'Aviakompaniyani ulab bo\'lmadi'));
    } finally {
      setSavingConnection(false);
    }
  };

  const visibleFirms = useMemo(() => {
    const text = firmSearch.trim().toLowerCase();
    const rows = (firms || []).filter((firm) => {
      if (!text) return true;
      return [firm.name, firm.id, firm.kind, firm.balance, firm.outstanding, firm.creditLimit]
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
  const subscriptionLabel = (value?: string | null) => {
    if (!value) return tr('No subscription', 'Obuna yo\'q');
    const end = new Date(value);
    if (Number.isNaN(end.getTime())) return '-';
    const days = Math.ceil((end.getTime() - Date.now()) / 86400000);
    if (days < 0) return tr('Expired', 'Muddati tugagan');
    return `${days} ${tr('days left', 'kun qoldi')}`;
  };

  if (!canManage) {
    return (
      <div className="text-foreground">
        <h2 className="text-2xl font-bold text-foreground">{tr('Firms', 'Firmalar')}</h2>
        <p className="mt-2 text-muted">{tr('You do not have access to firms.', 'Firmalarga kirish huquqingiz yo\'q.')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">{tr('Firms', 'Firmalar')}</h2>
          <p className="mt-1 text-sm text-muted">
            {isSuperAdmin
              ? tr('Create firms, edit firm names, and manage system-wide firm settings.', 'Firmalar yarating, firma nomlarini tahrirlang va system-wide sozlamalarni boshqaring.')
              : isFirmUser
                ? tr('Add and view partner firms created by your firm.', 'Firmangiz yaratgan partner firmalarni qo\'shing va ko\'ring.')
                : tr('Add firms and view firms assigned to your admin access.', 'Firmalar qo\'shing va admin accessingizga biriktirilgan firmalarni ko\'ring.')}
          </p>
        </div>
        <ExportActions filename="ado-firmalar" sheet={{
          name: 'Firmalar',
          columns: [{ header: 'Firma', key: 'name' }, { header: 'Mas’ul shaxs', key: 'contact' }, { header: 'Telefon', key: 'phone' }, { header: 'Turi', key: 'kind' }, { header: 'Balans', key: 'balance' }, { header: 'Qarzdorlik', key: 'outstanding' }, { header: 'Valyuta', key: 'currency' }, { header: 'Status', key: 'status' }],
          rows: (firms || []).map((firm) => ({ name: firm.name, contact: firm.contactFullName || '', phone: firm.phone || '', kind: firm.kind || '', balance: Number(firm.balance || 0), outstanding: Number(firm.outstanding || 0), currency: firm.currency || '', status: firm.status || '' })),
        }} />
      </div>

      <div className="glass-panel p-6 max-w-xl">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          {isSuperAdmin ? tr('Create new firm', 'Yangi firma yaratish') : tr('Add firm', 'Firma qo\'shish')}
        </h3>
        {!isSuperAdmin && (
          <p className="mb-4 text-sm text-muted">
            {tr('This creates a firm record without a login account or invite link.', 'Bu login akkaunt yoki invite linksiz firma record yaratadi.')}
          </p>
        )}
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

          {isSuperAdmin && (
            <>
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

              <div>
                <label className="block text-sm font-medium text-muted mb-1">{tr('Initial password', 'Boshlang\'ich parol')}</label>
                <input
                  value={initialPassword}
                  onChange={(e) => setInitialPassword(e.target.value)}
                  type="password"
                  minLength={6}
                  className="w-full bg-surface border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-primary transition"
                  placeholder="••••••••"
                  required
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-muted mb-1">{tr('Full name', 'To\'liq ism')}</label>
            <input
              value={contactFullName}
              onChange={(e) => setContactFullName(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-primary transition"
              placeholder={tr('Responsible person', 'Mas\'ul shaxs')}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted mb-1">{tr('Phone number', 'Telefon raqam')}</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-primary transition"
              placeholder="+998..."
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted mb-1">{tr('Subscription duration (days)', 'Obuna muddati (kun)')}</label>
            <input
              type="number"
              min="1"
              value={subscriptionDays}
              onChange={(e) => setSubscriptionDays(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-primary transition"
              placeholder="30"
              required
            />
          </div>

          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="text-sm font-semibold text-foreground">{tr('Prior balance', 'Boshlang\'ich qarz')}</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="compact-label">{tr('Amount', 'Summa')}</label>
                <input type="number" min="0.01" step="0.01" value={priorBalanceAmount} onChange={(e) => setPriorBalanceAmount(e.target.value)} className="compact-control" placeholder="0" />
              </div>
              <div>
                <label className="compact-label">{tr('Currency', 'Valyuta')}</label>
                <input maxLength={3} value={priorBalanceCurrency} onChange={(e) => setPriorBalanceCurrency(e.target.value.toUpperCase())} className="compact-control uppercase" />
              </div>
              <div>
                <label className="compact-label">{tr('Direction', 'Yo\'nalish')}</label>
                <select value={priorBalanceDirection} onChange={(e) => setPriorBalanceDirection(e.target.value as 'DEBT' | 'CREDIT')} className="compact-control">
                  <option value="DEBT">{tr('New firm owes', 'Yangi firma qarzdor')}</option>
                  <option value="CREDIT">{tr('New firm is owed', 'Yangi firmadan qarzdor')}</option>
                </select>
              </div>
              <div>
                <label className="compact-label">{tr('Counterparty', 'Qarshi firma')}</label>
                <select value={priorBalanceCounterpartyFirmId} onChange={(e) => setPriorBalanceCounterpartyFirmId(e.target.value)} className="compact-control">
                  <option value="">{isFirmUser ? tr('My firm', 'Mening firmam') : tr('System / none', 'System / yo\'q')}</option>
                  {(firms || []).map((firm) => (
                    <option key={firm.id} value={firm.id}>{firm.name}</option>
                  ))}
                </select>
              </div>
              {priorBalanceCurrency.trim().toUpperCase() !== 'UZS' && (
                <div>
                  <label className="compact-label">{tr('Rate to UZS', 'UZS kursi')}</label>
                  <input type="number" min="0.000001" step="any" value={priorBalanceExchangeRate} onChange={(e) => setPriorBalanceExchangeRate(e.target.value)} className="compact-control" placeholder="12600" required={Boolean(priorBalanceAmount.trim())} />
                </div>
              )}
            </div>
          </div>

          <ActionButtons
            cancelLabel={tr('Cancel', 'Bekor qilish')}
            confirmLabel={tr('Confirm', 'Tasdiqlash')}
            busyLabel={tr('Creating...', 'Yaratilmoqda...')}
            busy={submitting}
            canConfirm={!priorBalanceAmount.trim() || (Number(priorBalanceAmount) > 0 && (priorBalanceCurrency.trim().toUpperCase() === 'UZS' || Number(priorBalanceExchangeRate) > 0))}
            onCancel={resetCreateFirm}
          />
        </form>
      </div>

      {isSuperAdmin && (
        <div className="glass-panel p-6">
          <h3 className="text-lg font-semibold text-foreground mb-1">{tr('Listed airline access', 'Ro\'yxatdagi aviakompaniya ruxsati')}</h3>
          <p className="mb-4 text-sm text-muted">
            {tr('Connect a firm to a listed airline brand so it can create flights with that airline.', 'Firma ro\'yxatdagi aviakompaniya brendi bilan reys yaratishi uchun ruxsat bering.')}
          </p>
          <form onSubmit={saveAirlineConnection} className="compact-toolbar">
            <div>
              <label className="compact-label">{tr('Airline', 'Aviakompaniya')}</label>
              <select value={connectionDraft.airlineFirmId} onChange={(e) => setConnectionDraft({ ...connectionDraft, airlineFirmId: e.target.value })} className="compact-control" required>
                <option value="">{tr('Select airline', 'Aviakompaniyani tanlang')}</option>
                {airlines.filter((airline) => airline.firmId).map((airline) => (
                  <option key={airline.id} value={airline.firmId || ''}>{airline.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="compact-label">{tr('Firm', 'Firma')}</label>
              <select value={connectionDraft.firmId} onChange={(e) => setConnectionDraft({ ...connectionDraft, firmId: e.target.value })} className="compact-control" required>
                <option value="">{tr('Select firm', 'Firmani tanlang')}</option>
                {(firms || []).filter((firm) => firm.kind !== 'AIRLINE').map((firm) => (
                  <option key={firm.id} value={firm.id}>{firm.name}{firm.kind === 'CONTRACTOR' ? ` · ${tr('Contractor', 'Pudratchi')}` : ''}</option>
                ))}
              </select>
            </div>
            <ActionButtons
              className="col-span-full"
              cancelLabel={tr('Cancel', 'Bekor qilish')}
              confirmLabel={tr('Confirm', 'Tasdiqlash')}
              busyLabel={tr('Saving...', 'Saqlanmoqda...')}
              busy={savingConnection}
              onCancel={() => setConnectionDraft({ airlineFirmId: '', firmId: '' })}
            />
          </form>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {airlineConnections.length === 0 ? (
              <p className="text-sm text-muted">{tr('No airline connections yet.', 'Hali aviakompaniya ulanishlari yo\'q.')}</p>
            ) : airlineConnections.map((row) => (
              <div key={row.id} className="border border-border bg-surface-2 px-3 py-2 text-sm">
                <span className="font-semibold">{row.airlineFirm?.name || row.airlineFirmId}</span>
                <span className="text-muted"> {'->'} </span>
                <span>{row.firm?.name || row.firmId}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div id="firm-list" className="scroll-mt-24 glass-panel">
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
                <th>{tr('Type', 'Turi')}</th>
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
                <th>{tr('Subscription', 'Obuna')}</th>
                <th>{tr('Actions', 'Amallar')}</th>
              </tr>
            </thead>
            <tbody>
              {loadingFirms ? (
                <tr><td colSpan={8} className="text-center text-muted">{tr('Loading...', 'Yuklanmoqda...')}</td></tr>
              ) : visibleFirms.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-muted">{tr('No firms found.', 'Guruhlar topilmadi.')}</td></tr>
              ) : visibleFirms.map((firm) => {
                const draft = getFirmDraft(firm);
                return (
                <tr key={firm.id}>
                  <td>
                    {isSuperAdmin ? (
                      <input
                        value={draft.name}
                        onChange={(e) => setFirmDraft(firm, { name: e.target.value })}
                        className="compact-control min-w-[180px] font-semibold"
                      />
                    ) : (
                      <div className="font-semibold">{firm.name}</div>
                    )}
                    <div className="font-mono text-xs text-muted">{firm.id.slice(0, 8)}...</div>
                    {isSuperAdmin ? (
                      <div className="mt-2 grid gap-1">
                        <input value={draft.contactFullName} onChange={(e) => setFirmDraft(firm, { contactFullName: e.target.value })} className="compact-control" placeholder={tr('Full name', 'To\'liq ism')} />
                        <input value={draft.phone} onChange={(e) => setFirmDraft(firm, { phone: e.target.value })} className="compact-control" placeholder={tr('Phone', 'Telefon')} />
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-muted">{firm.contactFullName || '-'} {firm.phone ? `· ${firm.phone}` : ''}</div>
                    )}
                  </td>
                  <td>
                    {isSuperAdmin ? (
                      <select value={draft.kind} onChange={(e) => setFirmDraft(firm, { kind: e.target.value })} className="compact-control min-w-[130px]">
                        <option value="AGENCY">{tr('Firm', 'Firma')}</option>
                        <option value="AIRLINE">{tr('Airline', 'Aviakompaniya')}</option>
                        <option value="CONTRACTOR">{tr('Contractor', 'Pudratchi')}</option>
                      </select>
                    ) : (
                      <span className="rounded border border-border bg-surface-2 px-2 py-1 text-xs font-semibold">
                        {firm.kind === 'AIRLINE' ? tr('Airline', 'Aviakompaniya') : firm.kind === 'CONTRACTOR' ? tr('Contractor', 'Pudratchi') : tr('Firm', 'Firma')}
                      </span>
                    )}
                  </td>
                  <td className={`text-right font-mono font-bold ${Number(firm.balance || 0) < 0 ? 'text-red-600' : 'text-green-700'}`}>
                    {formatMoney(firm.balance)}
                  </td>
                  <td className="text-right font-mono font-bold text-red-600">
                    {formatMoney(firm.outstanding)}
                  </td>
                  <td className="text-right">
                    {isSuperAdmin ? (
                      <div className="flex min-w-[190px] items-center justify-end gap-2">
                        <input
                          inputMode="decimal"
                          value={draft.creditLimit}
                          onChange={(e) => setFirmDraft(firm, { creditLimit: e.target.value })}
                          className="compact-control w-28 text-right font-mono"
                        />
                        <input
                          maxLength={3}
                          value={draft.currency}
                          onChange={(e) => setFirmDraft(firm, { currency: e.target.value.toUpperCase() })}
                          className="compact-control w-20 uppercase"
                        />
                      </div>
                    ) : (
                      <span className="font-mono">{formatMoney(firm.creditLimit)}</span>
                    )}
                  </td>
                  <td>{new Date(firm.createdAt).toLocaleDateString()}</td>
                  <td>
                    {isSuperAdmin ? (
                      <div className="space-y-1">
                        <input type="date" value={draft.subscriptionEndsAt} onChange={(e) => setFirmDraft(firm, { subscriptionEndsAt: e.target.value })} className="compact-control min-w-[150px]" />
                        <div className="text-xs text-muted">{subscriptionLabel(draft.subscriptionEndsAt)}</div>
                      </div>
                    ) : subscriptionLabel(firm.subscriptionEndsAt)}
                  </td>
                  <td>
                    {isSuperAdmin && (
                      <div className="mb-2 grid min-w-[260px] gap-1 rounded border border-border bg-surface-2 p-2">
                        <div className="text-[11px] font-bold uppercase text-muted">{tr('Balance adjustment', 'Balans tuzatish')}</div>
                        <div className="grid grid-cols-[1fr_70px] gap-1">
                          <input inputMode="decimal" value={draft.balanceAdjustmentAmount} onChange={(e) => setFirmDraft(firm, { balanceAdjustmentAmount: e.target.value })} className="compact-control" placeholder={tr('Amount', 'Summa')} />
                          <input maxLength={3} value={draft.balanceAdjustmentCurrency} onChange={(e) => setFirmDraft(firm, { balanceAdjustmentCurrency: e.target.value.toUpperCase() })} className="compact-control uppercase" />
                        </div>
                        <select value={draft.balanceAdjustmentDirection} onChange={(e) => setFirmDraft(firm, { balanceAdjustmentDirection: e.target.value as 'DEBT' | 'CREDIT' })} className="compact-control">
                          <option value="DEBT">{tr('Firm owes', 'Firma qarzdor')}</option>
                          <option value="CREDIT">{tr('Firm is owed', 'Firmadan qarzdor')}</option>
                        </select>
                        <select value={draft.balanceAdjustmentCounterpartyFirmId} onChange={(e) => setFirmDraft(firm, { balanceAdjustmentCounterpartyFirmId: e.target.value })} className="compact-control">
                          <option value="">{tr('Counterparty optional', 'Qarshi firma ixtiyoriy')}</option>
                          {(firms || []).filter((item) => item.id !== firm.id).map((item) => (
                            <option key={item.id} value={item.id}>{item.name}</option>
                          ))}
                        </select>
                        {draft.balanceAdjustmentCurrency.trim().toUpperCase() !== 'UZS' && (
                          <input inputMode="decimal" value={draft.balanceAdjustmentExchangeRate} onChange={(e) => setFirmDraft(firm, { balanceAdjustmentExchangeRate: e.target.value })} className="compact-control" placeholder={tr('Rate to UZS', 'UZS kursi')} />
                        )}
                        <input value={draft.balanceAdjustmentNote} onChange={(e) => setFirmDraft(firm, { balanceAdjustmentNote: e.target.value })} className="compact-control" placeholder={tr('Note', 'Izoh')} />
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {isSuperAdmin && (
                        <button
                          type="button"
                          onClick={() => setFirmDrafts((drafts) => { const next = { ...drafts }; delete next[firm.id]; return next; })}
                          className="border border-border bg-surface-2 px-2 py-1 text-xs font-semibold text-foreground hover:bg-surface"
                        >
                          {tr('Cancel', 'Bekor qilish')}
                        </button>
                      )}
                      {isSuperAdmin && (
                        <button
                          type="button"
                          onClick={() => saveFirm(firm)}
                          disabled={
                            savingCreditFirmId === firm.id
                            || !draft.name.trim()
                            || !Number.isFinite(Number(draft.creditLimit))
                            || Number(draft.creditLimit) < 0
                            || !/^[A-Z]{3}$/.test(draft.currency.trim().toUpperCase())
                            || !/^[A-Z]{3}$/.test(draft.balanceAdjustmentCurrency.trim().toUpperCase())
                            || (Boolean(draft.balanceAdjustmentAmount.trim()) && (
                              !Number.isFinite(Number(draft.balanceAdjustmentAmount))
                              || Number(draft.balanceAdjustmentAmount) <= 0
                              || (draft.balanceAdjustmentCurrency.trim().toUpperCase() !== 'UZS' && Number(draft.balanceAdjustmentExchangeRate) <= 0)
                            ))
                          }
                          className="inline-flex items-center gap-1 border border-border bg-surface-2 px-2 py-1 text-xs font-semibold text-foreground hover:bg-surface disabled:opacity-50"
                        >
                          <Save size={14} />
                          {savingCreditFirmId === firm.id ? tr('Saving', 'Saqlanmoqda') : tr('Confirm', 'Tasdiqlash')}
                        </button>
                      )}
                      <Link href={`/transactions?firmId=${encodeURIComponent(firm.id)}`} className="border border-border bg-surface-2 px-2 py-1 text-xs font-semibold text-foreground hover:bg-surface">
                        {tr('History', 'Tarix')}
                      </Link>
                      <Link href={`/reports?firmId=${encodeURIComponent(firm.id)}`} className="border border-border bg-surface-2 px-2 py-1 text-xs font-semibold text-foreground hover:bg-surface">
                        {tr('Report', 'Hisobot')}
                      </Link>
                      {isSuperAdmin && (
                        <button
                          type="button"
                          onClick={() => deleteFirm(firm)}
                          disabled={deletingFirmId === firm.id}
                          className="inline-flex items-center gap-1 border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-500/20 disabled:opacity-50"
                        >
                          <Trash2 size={14} />
                          {deletingFirmId === firm.id ? tr('Deleting', 'O\'chirilmoqda') : tr('Delete', 'O\'chirish')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )})}
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
