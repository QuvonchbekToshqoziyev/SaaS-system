/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { FormEvent, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { api } from '@/lib/api';
import ActionButtons from '@/components/ui/ActionButtons';

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

    {(manage || editingId) && <form onSubmit={submit} className="operation-form form-grid">
      <div className="form-heading">
        <div>
          <h2 className="form-heading__title">{editingId ? tr('Edit purchased service', 'Olingan xizmatni tahrirlash') : tr('New purchased service', 'Yangi olingan xizmat')}</h2>
          <p className="form-heading__description">{tr('Connect the provider, flight and payment details, then add any useful notes.', 'Ta’minotchi, reys va to‘lov ma’lumotlarini bog‘lang, so‘ng kerakli izohni kiriting.')}</p>
        </div>
      </div>
      <label className="form-field--wide"><span className="compact-label">{tr('Service name', 'Xizmat nomi')}</span><input className="compact-control" placeholder={tr('For example: Visa support', 'Masalan: Viza xizmati')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
      <label className="form-field--wide"><span className="compact-label">{tr('Provider firm', 'Ta’minotchi firma')}</span><select className="compact-control" value={form.providerFirmId} onChange={(e) => {
        const providerFirmId = e.target.value;
        const provider = firms.find((firm) => firm.id === providerFirmId);
        setForm({ ...form, providerFirmId, providerName: provider?.name || '' });
      }}>
        <option value="">{tr('Custom provider', 'Boshqa ta’minotchi')}</option>
        {firms.map((firm) => <option key={firm.id} value={firm.id}>{firm.name}</option>)}
      </select></label>
      <label className="form-field--wide"><span className="compact-label">{tr('Provider name', 'Xizmat ko‘rsatuvchi nomi')}</span><input className="compact-control" placeholder={tr('Full provider name', 'Ta’minotchining to‘liq nomi')} value={form.providerName} onChange={(e) => setForm({ ...form, providerName: e.target.value, providerFirmId: '' })} required /></label>
      <label className="form-field--wide"><span className="compact-label">{tr('Related flight', 'Bog‘langan reys')}</span><select className="compact-control" value={form.flightId} onChange={(e) => setForm({ ...form, flightId: e.target.value })}>
        <option value="">{tr('No flight', 'Reyssiz')}</option>
        {flights.map((flight) => <option key={flight.id} value={flight.id}>{flight.flightNumber} · {flight.route}</option>)}
      </select></label>
      <label className="form-field--compact"><span className="compact-label">{tr('Quantity', 'Soni')}</span><input className="compact-control text-right" type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required /></label>
      <label className="form-field--compact"><span className="compact-label">{tr('Unit price', 'Bir dona narxi')}</span><input className="compact-control text-right" type="number" min="0.01" step="0.01" placeholder="0.00" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} required /></label>
      <label className="form-field--compact"><span className="compact-label">{tr('Currency', 'Valyuta')}</span><select className="compact-control" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}><option>UZS</option><option>USD</option></select></label>
      {form.currency === 'USD' && <label className="form-field--compact"><span className="compact-label">{tr('Firm rate', 'Firma kursi')}</span><input className="compact-control text-right" inputMode="decimal" placeholder={tr('Optional', 'Ixtiyoriy')} value={form.exchangeRate} onChange={(e) => setForm({ ...form, exchangeRate: e.target.value })} /></label>}
      <label className="form-field--compact"><span className="compact-label">{tr('Payment status', 'To‘lov holati')}</span><select className="compact-control" value={form.paymentStatus} onChange={(e) => setForm({ ...form, paymentStatus: e.target.value })}>
        <option value="DEBT">{tr('Debt', 'Qarz')}</option><option value="PAID">{tr('Paid', 'To‘langan')}</option>
      </select></label>
      <label className="form-field--full"><span className="compact-label">{tr('Notes and service details', 'Izoh va xizmat tafsilotlari')}</span><textarea className="compact-control" rows={4} placeholder={tr('Add conditions, passenger details or other useful information…', 'Shartlar, yo‘lovchi ma’lumotlari yoki boshqa kerakli tafsilotlarni kiriting…')} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
      <ActionButtons
        cancelLabel={tr('Cancel', 'Bekor qilish')}
        confirmLabel={tr('Confirm', 'Tasdiqlash')}
        busyLabel={tr('Saving...', 'Saqlanmoqda...')}
        busy={saving}
        onCancel={() => { setEditingId(''); setForm(emptyForm); }}
      />
    </form>}

    <div className="space-y-3">{rows.map((service) => <div key={service.id} className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div><b>{service.name}</b><p className="text-sm text-muted">{tr('Provider', 'Ta\'minotchi')}: {service.providerFirm?.name || service.providerName || service.ownerFirm?.name}{service.flight ? ` · ${service.flight.flightNumber}` : ''}</p></div>
        <div className="flex items-start gap-2"><div className="text-right"><div>{service.quantity} × {Number(service.unitPrice).toLocaleString()} {service.currency}</div><span className={service.paymentStatus === 'PAID' ? 'text-green-600' : 'text-amber-600'}>{service.paymentStatus === 'PAID' ? tr('Paid', 'To\'langan') : tr('Debt', 'Qarz')}</span></div>
          {canEdit && <div className="action-buttons"><button type="button" onClick={() => edit(service)} className="action-button action-button--secondary">{tr('Edit', 'Tahrirlash')}</button><button type="button" onClick={() => remove(service)} className="action-button action-button--danger">{tr('Delete', 'O\'chirish')}</button></div>}
        </div>
      </div>
      {service.description && <p className="mt-2 text-sm text-muted">{service.description}</p>}
    </div>)}</div>
  </div>;
}
