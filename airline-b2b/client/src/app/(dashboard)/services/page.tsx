'use client';

import { FormEvent, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { api } from '@/lib/api';

const emptyForm = {
  name: '', providerFirmId: '', providerName: '', flightId: '', quantity: '1',
  unitPrice: '', currency: 'UZS', exchangeRate: '', paymentStatus: 'DEBT', description: '',
};

export default function ServicesPage() {
  const { user } = useAuth();
  const { tr } = useLanguage();
  const [rows, setRows] = useState<any[]>([]);
  const [firms, setFirms] = useState<any[]>([]);
  const [flights, setFlights] = useState<any[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [saving, setSaving] = useState(false);
  const role = String(user?.role).toUpperCase();
  const firmRole = String(user?.firmRole || 'MANAGER').toUpperCase();
  const manage = role === 'FIRM'
    && ['FIRM_ADMIN', 'MANAGER'].includes(String(user?.firmRole || 'MANAGER').toUpperCase());
  const canEdit = role === 'SUPERADMIN' || (role === 'FIRM' && firmRole === 'FIRM_ADMIN');

  const load = async () => {
    const [services, firmRows, flightRows] = await Promise.all([
      api.get('/services'), api.get('/firms'), api.get('/flights'),
    ]);
    setRows(services.data || []);
    setFirms((firmRows.data || []).filter((firm: any) => firm.id !== user?.firmId));
    setFlights(flightRows.data || []);
  };

  useEffect(() => { if (user) load().catch(() => toast.error(tr('Failed to load services', 'Xizmatlarni yuklab bo\'lmadi'))); }, [user]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setSaving(true);
      const payload = {
        ...form,
        providerFirmId: form.providerFirmId || undefined,
        flightId: form.flightId || undefined,
        exchangeRate: form.currency === 'USD' && form.exchangeRate ? form.exchangeRate : undefined,
        quantity: Number(form.quantity),
        unitPrice: Number(form.unitPrice),
      };
      if (editingId) await api.patch(`/services/${editingId}`, payload);
      else await api.post('/services', payload);
      setForm(emptyForm);
      setEditingId('');
      toast.success(editingId ? tr('Service updated', 'Xizmat yangilandi') : tr('Service purchase recorded', 'Olingan xizmat qayd etildi'));
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || tr('Failed to record service', 'Xizmatni qayd etib bo\'lmadi'));
    } finally {
      setSaving(false);
    }
  };

  const edit = (service: any) => {
    setEditingId(service.id);
    setForm({
      name: service.name || '', providerFirmId: service.providerFirmId || '', providerName: service.providerName || service.providerFirm?.name || '',
      flightId: service.flightId || '', quantity: String(service.quantity || 1), unitPrice: String(service.unitPrice || ''), currency: service.currency || 'UZS',
      exchangeRate: '', paymentStatus: service.paymentStatus || 'DEBT', description: service.description || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (service: any) => {
    if (!window.confirm(tr('Delete this service?', 'Ushbu xizmat o\'chirilsinmi?'))) return;
    try {
      await api.delete(`/services/${service.id}`);
      toast.success(tr('Service deleted', 'Xizmat o\'chirildi'));
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || tr('Failed to delete service', 'Xizmatni o\'chirib bo\'lmadi'));
    }
  };

  return <div className="space-y-6">
    <div>
      <h1 className="text-3xl font-bold">{tr('Purchased services', 'Olingan xizmatlar')}</h1>
      <p className="text-muted">{tr('Record services your firm receives from another provider.', 'Firmangiz boshqa ta\'minotchidan olgan xizmatlarni qayd eting.')}</p>
    </div>

    {(manage || editingId) && <form onSubmit={submit} className="grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-3">
      <input className="compact-control" placeholder={tr('Service name, e.g. Visa', 'Xizmat nomi, masalan Viza')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      <select className="compact-control" value={form.providerFirmId} onChange={(e) => {
        const providerFirmId = e.target.value;
        const provider = firms.find((firm) => firm.id === providerFirmId);
        setForm({ ...form, providerFirmId, providerName: provider?.name || '' });
      }}>
        <option value="">{tr('Custom provider', 'Boshqa ta\'minotchi')}</option>
        {firms.map((firm) => <option key={firm.id} value={firm.id}>{firm.name}</option>)}
      </select>
      <input className="compact-control" placeholder={tr('Provider name', 'Xizmat ko\'rsatuvchi nomi')} value={form.providerName} onChange={(e) => setForm({ ...form, providerName: e.target.value, providerFirmId: '' })} required />
      <select className="compact-control" value={form.flightId} onChange={(e) => setForm({ ...form, flightId: e.target.value })}>
        <option value="">{tr('No flight', 'Reyssiz')}</option>
        {flights.map((flight) => <option key={flight.id} value={flight.id}>{flight.flightNumber} · {flight.route}</option>)}
      </select>
      <input className="compact-control" type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
      <input className="compact-control" type="number" min="0.01" step="0.01" placeholder={tr('Unit price', 'Bir dona narxi')} value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} required />
      <select className="compact-control" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}><option>UZS</option><option>USD</option></select>
      {form.currency === 'USD' && <input className="compact-control" inputMode="decimal" placeholder={tr('Firm rate (optional)', 'Firma kursi (ixtiyoriy)')} value={form.exchangeRate} onChange={(e) => setForm({ ...form, exchangeRate: e.target.value })} />}
      <select className="compact-control" value={form.paymentStatus} onChange={(e) => setForm({ ...form, paymentStatus: e.target.value })}>
        <option value="DEBT">{tr('Debt', 'Qarz')}</option><option value="PAID">{tr('Paid', 'To\'langan')}</option>
      </select>
      <textarea className="compact-control md:col-span-2" placeholder={tr('Notes', 'Izoh')} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <button disabled={saving} className="rounded bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50">{saving ? tr('Saving...', 'Saqlanmoqda...') : editingId ? tr('Save changes', 'O\'zgarishlarni saqlash') : tr('Record service', 'Xizmatni qayd etish')}</button>
      {editingId && <button type="button" onClick={() => { setEditingId(''); setForm(emptyForm); }} className="rounded border border-border px-4 py-2">{tr('Cancel', 'Bekor qilish')}</button>}
    </form>}

    <div className="space-y-3">{rows.map((service) => <div key={service.id} className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div><b>{service.name}</b><p className="text-sm text-muted">{tr('Provider', 'Ta\'minotchi')}: {service.providerFirm?.name || service.providerName || service.ownerFirm?.name}{service.flight ? ` · ${service.flight.flightNumber}` : ''}</p></div>
        <div className="flex items-start gap-2"><div className="text-right"><div>{service.quantity} × {Number(service.unitPrice).toLocaleString()} {service.currency}</div><span className={service.paymentStatus === 'PAID' ? 'text-green-600' : 'text-amber-600'}>{service.paymentStatus === 'PAID' ? tr('Paid', 'To\'langan') : tr('Debt', 'Qarz')}</span></div>
          {canEdit && <div className="flex gap-1"><button type="button" onClick={() => edit(service)} className="rounded border border-border px-2 py-1 text-xs">{tr('Edit', 'Tahrirlash')}</button><button type="button" onClick={() => remove(service)} className="rounded border border-red-500/30 px-2 py-1 text-xs text-red-600">{tr('Delete', 'O\'chirish')}</button></div>}
        </div>
      </div>
      {service.description && <p className="mt-2 text-sm text-muted">{service.description}</p>}
    </div>)}</div>
  </div>;
}
