"use client";

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import type { AxiosError } from 'axios';
import { Plus, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

type ApiErrorResponse = { error?: string };

type FirmRow = {
  id: string;
  name: string;
  currency?: string | null;
  subscriptionEndsAt?: string | null;
};

type AdminRow = {
  id: string;
  email: string;
  fullName?: string | null;
  phone?: string | null;
  role: 'ADMIN' | 'SUPERADMIN';
  firmAccesses?: { firmId: string; firm?: FirmRow | null }[];
  createdAt?: string;
};

type AdminDraft = {
  email: string;
  fullName: string;
  phone: string;
  role: 'ADMIN' | 'SUPERADMIN';
  password: string;
  firmIds: string[];
};

function getApiErrorMessage(error: unknown): string | undefined {
  const axiosError = error as AxiosError<ApiErrorResponse>;
  return axiosError?.response?.data?.error;
}

function initialDraft(admin: AdminRow): AdminDraft {
  return {
    email: admin.email || '',
    fullName: admin.fullName || '',
    phone: admin.phone || '',
    role: admin.role === 'SUPERADMIN' ? 'SUPERADMIN' : 'ADMIN',
    password: '',
    firmIds: (admin.firmAccesses || []).map((access) => access.firmId),
  };
}

export default function AdminsPage() {
  const { user } = useAuth();
  const { tr } = useLanguage();
  const queryClient = useQueryClient();

  const isSuperAdmin = String(user?.role || '').toUpperCase() === 'SUPERADMIN';
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, AdminDraft>>({});
  const [newAdmin, setNewAdmin] = useState<AdminDraft>({
    email: '',
    fullName: '',
    phone: '',
    role: 'ADMIN',
    password: '',
    firmIds: [],
  });
  const [creating, setCreating] = useState(false);

  const { data: admins = [], isLoading: loadingAdmins } = useQuery<AdminRow[]>({
    queryKey: ['admins', user?.id || user?.email || 'anonymous'],
    queryFn: async () => {
      const res = await api.get('/auth/admins');
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: isSuperAdmin,
  });

  const { data: firms = [], isLoading: loadingFirms } = useQuery<FirmRow[]>({
    queryKey: ['firms', user?.id || user?.email || 'anonymous'],
    queryFn: async () => {
      const res = await api.get('/firms');
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: isSuperAdmin,
  });

  const visibleAdmins = useMemo(() => {
    const text = search.trim().toLowerCase();
    if (!text) return admins;
    return admins.filter((admin) => {
      const firmNames = (admin.firmAccesses || []).map((access) => access.firm?.name || access.firmId).join(' ');
      return [admin.email, admin.fullName, admin.phone, admin.role, firmNames]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(text);
    });
  }, [admins, search]);

  const getDraft = (admin: AdminRow) => drafts[admin.id] ?? initialDraft(admin);

  const setDraft = (admin: AdminRow, patch: Partial<AdminDraft>) => {
    setDrafts((current) => ({
      ...current,
      [admin.id]: { ...getDraft(admin), ...patch },
    }));
  };

  const toggleFirm = (firmIds: string[], firmId: string): string[] => {
    return firmIds.includes(firmId) ? firmIds.filter((id) => id !== firmId) : [...firmIds, firmId];
  };

  const createAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdmin.email.trim()) {
      toast.error(tr('Email is required', 'Email kerak'));
      return;
    }
    if (newAdmin.password.length < 6) {
      toast.error(tr('Password must be at least 6 characters', 'Parol kamida 6 ta belgidan iborat bo\'lishi kerak'));
      return;
    }

    setCreating(true);
    try {
      await api.post('/auth/admins', {
        email: newAdmin.email.trim(),
        fullName: newAdmin.fullName.trim(),
        phone: newAdmin.phone.trim(),
        role: newAdmin.role,
        password: newAdmin.password,
        firmIds: newAdmin.role === 'ADMIN' ? newAdmin.firmIds : [],
      });
      setNewAdmin({ email: '', fullName: '', phone: '', role: 'ADMIN', password: '', firmIds: [] });
      toast.success(tr('Admin created', 'Admin yaratildi'));
      queryClient.invalidateQueries({ queryKey: ['admins'] });
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error) || tr('Failed to create admin', 'Admin yaratib bo\'lmadi'));
    } finally {
      setCreating(false);
    }
  };

  const saveAdmin = async (admin: AdminRow) => {
    const draft = getDraft(admin);
    if (!draft.email.trim()) {
      toast.error(tr('Email is required', 'Email kerak'));
      return;
    }
    setSavingId(admin.id);
    try {
      await api.patch(`/auth/admins/${admin.id}`, {
        email: draft.email.trim(),
        fullName: draft.fullName.trim(),
        phone: draft.phone.trim(),
        role: draft.role,
        password: draft.password || undefined,
        firmIds: draft.role === 'ADMIN' ? draft.firmIds : [],
      });
      setDrafts((current) => {
        const next = { ...current };
        delete next[admin.id];
        return next;
      });
      toast.success(tr('Admin updated', 'Admin yangilandi'));
      queryClient.invalidateQueries({ queryKey: ['admins'] });
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error) || tr('Failed to update admin', 'Adminni yangilab bo\'lmadi'));
    } finally {
      setSavingId(null);
    }
  };

  const deleteAdmin = async (admin: AdminRow) => {
    const confirmed = window.confirm(tr(`Delete ${admin.email}?`, `${admin.email} o'chirilsinmi?`));
    if (!confirmed) return;
    setDeletingId(admin.id);
    try {
      await api.delete(`/auth/admins/${admin.id}`);
      toast.success(tr('Admin deleted', 'Admin o\'chirildi'));
      queryClient.invalidateQueries({ queryKey: ['admins'] });
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error) || tr('Failed to delete admin', 'Adminni o\'chirib bo\'lmadi'));
    } finally {
      setDeletingId(null);
    }
  };

  const firmCheckboxes = (firmIds: string[], onChange: (ids: string[]) => void, disabled = false) => (
    <div className="grid max-h-40 min-w-[260px] gap-1 overflow-y-auto rounded-md border border-border bg-surface p-2 scroller-minimal">
      {loadingFirms ? (
        <div className="text-xs text-muted">{tr('Loading firms...', 'Firmalar yuklanmoqda...')}</div>
      ) : firms.length === 0 ? (
        <div className="text-xs text-muted">{tr('No firms found.', 'Firmalar topilmadi.')}</div>
      ) : firms.map((firm) => (
        <label key={firm.id} className="flex items-center gap-2 rounded px-2 py-1 text-xs text-foreground hover:bg-surface-2">
          <input
            type="checkbox"
            checked={firmIds.includes(firm.id)}
            disabled={disabled}
            onChange={() => onChange(toggleFirm(firmIds, firm.id))}
            className="h-4 w-4 accent-[var(--primary)]"
          />
          <span className="truncate">{firm.name}</span>
        </label>
      ))}
    </div>
  );

  if (!isSuperAdmin) {
    return (
      <div className="text-foreground">
        <h2 className="text-2xl font-bold">{tr('Admins', 'Adminlar')}</h2>
        <p className="mt-2 text-muted">{tr('Only superadmin can manage admins.', 'Adminlarni faqat superadmin boshqara oladi.')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">{tr('Admins', 'Adminlar')}</h2>
          <p className="mt-1 text-sm text-muted">
            {tr('Manage admin accounts, firm access, and login details.', 'Admin akkauntlari, firma accesslari va login ma\'lumotlarini boshqaring.')}
          </p>
        </div>
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-muted">
          <ShieldCheck size={18} />
          {visibleAdmins.length} / {admins.length}
        </div>
      </div>

      <div className="glass-panel p-4">
        <h3 className="mb-4 text-lg font-semibold text-foreground">{tr('Create admin', 'Admin yaratish')}</h3>
        <form onSubmit={createAdmin} className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_150px_1fr_auto] lg:items-end">
          <div>
            <label className="compact-label">{tr('Email', 'Email')}</label>
            <input value={newAdmin.email} onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })} type="email" className="compact-control" required />
          </div>
          <div>
            <label className="compact-label">{tr('Full name', 'To\'liq ism')}</label>
            <input value={newAdmin.fullName} onChange={(e) => setNewAdmin({ ...newAdmin, fullName: e.target.value })} className="compact-control" />
          </div>
          <div>
            <label className="compact-label">{tr('Phone', 'Telefon')}</label>
            <input value={newAdmin.phone} onChange={(e) => setNewAdmin({ ...newAdmin, phone: e.target.value })} className="compact-control" />
          </div>
          <div>
            <label className="compact-label">{tr('Role', 'Rol')}</label>
            <select value={newAdmin.role} onChange={(e) => setNewAdmin({ ...newAdmin, role: e.target.value as AdminDraft['role'], firmIds: e.target.value === 'SUPERADMIN' ? [] : newAdmin.firmIds })} className="compact-control">
              <option value="ADMIN">ADMIN</option>
              <option value="SUPERADMIN">SUPERADMIN</option>
            </select>
          </div>
          <div>
            <label className="compact-label">{tr('Password', 'Parol')}</label>
            <input value={newAdmin.password} onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })} type="password" className="compact-control" required />
          </div>
          <button type="submit" disabled={creating} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-bold uppercase tracking-wide text-ink hover:bg-primary-hover disabled:opacity-50">
            <Plus size={16} />
            {creating ? tr('Creating', 'Yaratilmoqda') : tr('Create', 'Yaratish')}
          </button>
        </form>
        {newAdmin.role === 'ADMIN' && (
          <div className="mt-3">
            <label className="compact-label">{tr('Firm access', 'Firma accesslari')}</label>
            {firmCheckboxes(newAdmin.firmIds, (firmIds) => setNewAdmin({ ...newAdmin, firmIds }))}
          </div>
        )}
      </div>

      <div className="glass-panel">
        <div className="border-b border-border px-3 py-2">
          <label className="compact-label">{tr('Search admins', 'Adminlarni qidirish')}</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="compact-control max-w-xl" placeholder={tr('Email, name, phone, role, firm', 'Email, ism, telefon, rol, firma')} />
        </div>

        <div className="overflow-x-auto scroller-minimal">
          <table className="excel-table">
            <thead>
              <tr>
                <th>{tr('Admin', 'Admin')}</th>
                <th>{tr('Contact', 'Aloqa')}</th>
                <th>{tr('Role', 'Rol')}</th>
                <th>{tr('Firm access', 'Firma accesslari')}</th>
                <th>{tr('Password', 'Parol')}</th>
                <th>{tr('Created', 'Yaratilgan')}</th>
                <th>{tr('Actions', 'Amallar')}</th>
              </tr>
            </thead>
            <tbody>
              {loadingAdmins ? (
                <tr><td colSpan={7} className="text-center text-muted">{tr('Loading...', 'Yuklanmoqda...')}</td></tr>
              ) : visibleAdmins.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-muted">{tr('No admins found.', 'Adminlar topilmadi.')}</td></tr>
              ) : visibleAdmins.map((admin) => {
                const draft = getDraft(admin);
                const isSelf = admin.id === user?.id;
                return (
                  <tr key={admin.id}>
                    <td>
                      <input value={draft.email} onChange={(e) => setDraft(admin, { email: e.target.value })} className="compact-control min-w-[220px] font-semibold" />
                      <div className="mt-1 font-mono text-xs text-muted">{admin.id.slice(0, 8)}...</div>
                    </td>
                    <td>
                      <div className="grid min-w-[220px] gap-2">
                        <input value={draft.fullName} onChange={(e) => setDraft(admin, { fullName: e.target.value })} className="compact-control" placeholder={tr('Full name', 'To\'liq ism')} />
                        <input value={draft.phone} onChange={(e) => setDraft(admin, { phone: e.target.value })} className="compact-control" placeholder={tr('Phone', 'Telefon')} />
                      </div>
                    </td>
                    <td>
                      <select
                        value={draft.role}
                        disabled={isSelf}
                        onChange={(e) => setDraft(admin, { role: e.target.value as AdminDraft['role'], firmIds: e.target.value === 'SUPERADMIN' ? [] : draft.firmIds })}
                        className="compact-control min-w-[150px]"
                      >
                        <option value="ADMIN">ADMIN</option>
                        <option value="SUPERADMIN">SUPERADMIN</option>
                      </select>
                    </td>
                    <td>
                      {draft.role === 'SUPERADMIN' ? (
                        <span className="inline-flex rounded-md border border-border bg-surface-2 px-2 py-1 text-xs font-semibold text-foreground">
                          {tr('All firms', 'Barcha firmalar')}
                        </span>
                      ) : firmCheckboxes(draft.firmIds, (firmIds) => setDraft(admin, { firmIds }))}
                    </td>
                    <td>
                      <input value={draft.password} onChange={(e) => setDraft(admin, { password: e.target.value })} type="password" className="compact-control min-w-[160px]" placeholder={tr('Leave blank', 'Bo\'sh qoldiring')} />
                    </td>
                    <td>{admin.createdAt ? new Date(admin.createdAt).toLocaleDateString() : '-'}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => saveAdmin(admin)} disabled={savingId === admin.id} className="inline-flex items-center gap-1 border border-border bg-surface-2 px-2 py-1 text-xs font-semibold text-foreground hover:bg-surface disabled:opacity-50">
                          <Save size={14} />
                          {savingId === admin.id ? tr('Saving', 'Saqlanmoqda') : tr('Update', 'Yangilash')}
                        </button>
                        <button type="button" onClick={() => deleteAdmin(admin)} disabled={isSelf || deletingId === admin.id} className="inline-flex items-center gap-1 border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-500/20 disabled:opacity-50">
                          <Trash2 size={14} />
                          {deletingId === admin.id ? tr('Deleting', 'O\'chirilmoqda') : tr('Delete', 'O\'chirish')}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
