"use client";

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plane, Plus, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import type { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

type ApiErrorResponse = { error?: string };

type AirlineRow = {
  id: string;
  name: string;
  code?: string | null;
  firmId?: string | null;
  firm?: {
    id: string;
    name: string | null;
    currency?: string | null;
    users?: Array<{ id: string; email: string; fullName?: string | null }>;
  } | null;
  status?: string;
  createdAt: string;
};

function getApiErrorMessage(error: unknown): string | undefined {
  const axiosError = error as AxiosError<ApiErrorResponse>;
  return axiosError?.response?.data?.error;
}

export default function AirlinesPage() {
  const { user } = useAuth();
  const { tr } = useLanguage();
  const queryClient = useQueryClient();
  const isSuperAdmin = user?.role === 'superadmin';
  const [form, setForm] = useState({
    name: '',
    code: '',
    currency: 'USD',
  });
  const [submitting, setSubmitting] = useState(false);

  const { data: airlines = [], isLoading } = useQuery<AirlineRow[]>({
    queryKey: ['airlines'],
    queryFn: async () => (await api.get('/airlines')).data,
    enabled: isSuperAdmin,
  });

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) {
      toast.error(tr('Airline name is required', 'Aviakompaniya nomi kerak'));
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/airlines', {
        name,
        code: form.code.trim() || undefined,
        currency: form.currency,
      });
      toast.success(tr('Listed airline created.', 'Ro\'yxatdagi aviakompaniya yaratildi.'));
      setForm({ name: '', code: '', currency: 'USD' });
      queryClient.invalidateQueries({ queryKey: ['airlines'] });
      queryClient.invalidateQueries({ queryKey: ['firms'] });
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error) || tr('Failed to create airline.', 'Aviakompaniyani yaratib bo\'lmadi.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="rounded-lg border border-border bg-surface-2 p-6 text-sm text-muted">
        {tr('Only superadmin can manage airlines.', 'Aviakompaniyalarni faqat superadmin boshqaradi.')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">{tr('Airlines', 'Aviakompaniyalar')}</h2>
          <p className="mt-1 text-sm text-muted">
            {tr('Maintain listed airline brands. Firms can use listed airlines only after superadmin connects them.', 'Ro\'yxatdagi aviakompaniya brendlarini boshqaring. Firmalar ularni faqat superadmin ulaganidan keyin ishlatadi.')}
          </p>
        </div>
        <Plane className="h-9 w-9 text-primary" />
      </div>

      <form onSubmit={handleCreate} className="border border-border bg-surface-2 p-4">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
          <Plus size={16} />
          {tr('New airline', 'Yangi aviakompaniya')}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <input className="compact-control" placeholder={tr('Airline name', 'Aviakompaniya nomi')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="compact-control" placeholder={tr('Code', 'Kod')} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
          <select className="compact-control" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
            <option value="USD">USD</option>
            <option value="UZS">UZS</option>
          </select>
          <button type="submit" disabled={submitting} className="inline-flex items-center justify-center gap-2 bg-primary px-4 py-2 text-sm font-bold uppercase tracking-wide text-ink disabled:opacity-60">
            <Save size={16} />
            {submitting ? tr('Saving...', 'Saqlanmoqda...') : tr('Create', 'Yaratish')}
          </button>
        </div>
      </form>

      <div className="overflow-x-auto border border-border bg-surface-2">
        <table className="excel-table">
          <thead className="bg-surface">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted">{tr('Airline', 'Aviakompaniya')}</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted">{tr('Code', 'Kod')}</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted">{tr('Managed profile', 'Boshqariladigan profil')}</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted">{tr('Currency', 'Valyuta')}</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted">{tr('Status', 'Holat')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted">{tr('Loading...', 'Yuklanmoqda...')}</td></tr>
            ) : airlines.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted">{tr('No airlines yet.', 'Hali aviakompaniyalar yo\'q.')}</td></tr>
            ) : airlines.map((airline) => (
              <tr key={airline.id} className="hover:bg-surface">
                <td className="px-4 py-3 text-sm font-semibold text-foreground">{airline.name}</td>
                <td className="px-4 py-3 text-sm text-muted">{airline.code || '-'}</td>
                <td className="px-4 py-3 text-sm text-muted">
                  {airline.firmId
                    ? tr('Listed airline, no separate login', 'Ro\'yxatdagi aviakompaniya, alohida login yo\'q')
                    : tr('External firm-entered airline', 'Firma kiritgan tashqi aviakompaniya')}
                </td>
                <td className="px-4 py-3 text-sm text-muted">{airline.firm?.currency || '-'}</td>
                <td className="px-4 py-3 text-sm text-muted">{airline.status || 'ACTIVE'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
