/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { PackageOpen, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

type FirmOption = {
  id: string;
  name: string;
};

type TourPackage = {
  id: string;
  ownerFirmId: string;
  ownerFirm?: FirmOption;
  name: string;
  destination: string;
  startDate?: string | null;
  endDate?: string | null;
  quantity: number;
  availableQuantity: number;
  unitPrice: string | number;
  currency: string;
  status: string;
  notes?: string | null;
};

const emptyCreateRow = {
  ownerFirmId: '',
  name: '',
  destination: '',
  startDate: '',
  endDate: '',
  quantity: 10,
  unitPrice: 0,
  currency: 'UZS',
  notes: '',
};

export default function ToursPage() {
  const { user } = useAuth();
  const { tr } = useLanguage();
  const role = String(user?.role || '').toUpperCase();
  const isAdmin = role === 'ADMIN' || role === 'SUPERADMIN';
  const ownFirmId = user?.firmId || '';

  const [packages, setPackages] = useState<TourPackage[]>([]);
  const [firms, setFirms] = useState<FirmOption[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [createRow, setCreateRow] = useState(emptyCreateRow);
  const [sellRows, setSellRows] = useState<Record<string, { buyerFirmId: string; quantity: number; unitPrice: string; exchangeRate: string }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const firmNameById = useMemo(() => new Map(firms.map((f) => [f.id, f.name])), [firms]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [pkgRes, firmRes, salesRes] = await Promise.all([
        api.get('/tour-packages'),
        api.get('/tour-packages/firms'),
        api.get('/tour-packages/sales'),
      ]);
      setPackages(Array.isArray(pkgRes.data) ? pkgRes.data : []);
      setFirms(Array.isArray(firmRes.data) ? firmRes.data : []);
      setSales(Array.isArray(salesRes.data) ? salesRes.data : []);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || tr('Failed to load tour packages', 'Tur paketlarni yuklab bo\'lmadi'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCreate = () => {
    setCreateRow({ ...emptyCreateRow, ownerFirmId: isAdmin ? '' : ownFirmId });
    setIsCreating(true);
  };

  const createPackage = async () => {
    if (!createRow.name.trim() || !createRow.destination.trim()) {
      toast.error(tr('Name and destination are required', 'Nomi va manzil kerak'));
      return;
    }
    try {
      setBusyId('create');
      await api.post('/tour-packages', createRow);
      toast.success(tr('Tour package created', 'Tur paket yaratildi'));
      setIsCreating(false);
      setCreateRow(emptyCreateRow);
      await loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || tr('Failed to create tour package', 'Tur paket yaratib bo\'lmadi'));
    } finally {
      setBusyId(null);
    }
  };

  const updateSellRow = (packageId: string, patch: Partial<{ buyerFirmId: string; quantity: number; unitPrice: string; exchangeRate: string }>) => {
    setSellRows((current) => ({
      ...current,
      [packageId]: {
        ...(current[packageId] || { buyerFirmId: '', quantity: 1, unitPrice: '', exchangeRate: '' }),
        ...patch,
      },
    }));
  };

  const sellPackage = async (pkg: TourPackage) => {
    const row = sellRows[pkg.id] || { buyerFirmId: '', quantity: 1, unitPrice: '', exchangeRate: '' };
    if (!row.buyerFirmId) {
      toast.error(tr('Select buyer firm', 'Xaridor firmani tanlang'));
      return;
    }
    try {
      setBusyId(pkg.id);
      await api.post(`/tour-packages/${pkg.id}/sell`, {
        buyerFirmId: row.buyerFirmId,
        quantity: row.quantity,
        unitPrice: row.unitPrice || undefined,
        exchangeRate: row.exchangeRate || undefined,
      });
      toast.success(tr('Tour package sold', 'Tur paket sotildi'));
      setSellRows((current) => ({ ...current, [pkg.id]: { buyerFirmId: '', quantity: 1, unitPrice: '', exchangeRate: '' } }));
      await loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || tr('Failed to sell tour package', 'Tur paketni sotib bo\'lmadi'));
    } finally {
      setBusyId(null);
    }
  };

  const formatDate = (value?: string | null) => {
    if (!value) return '-';
    return new Date(value).toLocaleDateString();
  };

  const buyerOptionsFor = (pkg: TourPackage) => firms.filter((f) => f.id !== pkg.ownerFirmId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">{tr('Tour Packages', 'Tur paketlar')}</h2>
          <p className="mt-1 text-sm text-muted">
            {tr('Firm-owned B2B tour inventory and firm-to-firm sales.', 'Firmalarga tegishli B2B tur inventari va firma-firma sotuvlari.')}
          </p>
        </div>
        <button
          type="button"
          onClick={startCreate}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-ink rounded-lg font-bold uppercase tracking-wider text-sm"
        >
          <Plus size={16} />
          {tr('Add package', 'Paket qo\'shish')}
        </button>
      </div>

      <div className="overflow-x-auto scroller-minimal bg-surface-2 border border-border rounded-lg">
        <table className="excel-table">
          <thead>
            <tr>
              <th>{tr('Package', 'Paket')}</th>
              <th>{tr('Owner firm', 'Egasi')}</th>
              <th>{tr('Destination', 'Manzil')}</th>
              <th>{tr('Dates', 'Sanalar')}</th>
              <th className="text-right">{tr('Qty', 'Soni')}</th>
              <th className="text-right">{tr('Available', 'Mavjud')}</th>
              <th className="text-right">{tr('Unit price', 'Birlik narx')}</th>
              <th>{tr('Sell to firm', 'Firmaga sotish')}</th>
            </tr>
          </thead>
          <tbody>
            {isCreating && (
              <tr className="bg-surface">
                <td>
                  <input className="compact-control min-w-44" value={createRow.name} onChange={(e) => setCreateRow({ ...createRow, name: e.target.value })} placeholder={tr('Package name', 'Paket nomi')} />
                </td>
                <td>
                  {isAdmin ? (
                    <select className="compact-control min-w-44" value={createRow.ownerFirmId} onChange={(e) => setCreateRow({ ...createRow, ownerFirmId: e.target.value })}>
                      <option value="">{tr('Select firm', 'Firmani tanlang')}</option>
                      {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  ) : (
                    <span>{firmNameById.get(ownFirmId) || tr('My firm', 'Firmam')}</span>
                  )}
                </td>
                <td>
                  <input className="compact-control min-w-40" value={createRow.destination} onChange={(e) => setCreateRow({ ...createRow, destination: e.target.value })} placeholder={tr('Destination', 'Manzil')} />
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <input type="date" className="compact-control min-w-36" value={createRow.startDate} onChange={(e) => setCreateRow({ ...createRow, startDate: e.target.value })} />
                    <input type="date" className="compact-control min-w-36" value={createRow.endDate} onChange={(e) => setCreateRow({ ...createRow, endDate: e.target.value })} />
                  </div>
                </td>
                <td>
                  <input type="number" min="1" className="compact-control w-24 text-right" value={createRow.quantity} onChange={(e) => setCreateRow({ ...createRow, quantity: Number(e.target.value) })} />
                </td>
                <td className="text-right text-muted">{createRow.quantity}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <input type="number" min="0" className="compact-control w-28 text-right" value={createRow.unitPrice} onChange={(e) => setCreateRow({ ...createRow, unitPrice: Number(e.target.value) })} />
                    <select className="compact-control w-24" value={createRow.currency} onChange={(e) => setCreateRow({ ...createRow, currency: e.target.value })}>
                      <option value="UZS">UZS</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setIsCreating(false)} className="px-3 py-2 bg-surface border border-border rounded-lg text-xs font-semibold uppercase">
                      {tr('Cancel', 'Bekor qilish')}
                    </button>
                    <button type="button" onClick={createPackage} disabled={busyId === 'create'} className="px-3 py-2 bg-primary text-ink rounded-lg text-xs font-bold uppercase disabled:opacity-50">
                      {tr('Create', 'Yaratish')}
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {loading ? (
              <tr><td colSpan={8} className="text-center text-muted">{tr('Loading...', 'Yuklanmoqda...')}</td></tr>
            ) : packages.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-muted">
                  <PackageOpen className="mx-auto mb-2 text-muted" size={28} />
                  {tr('No tour packages yet.', 'Hali tur paketlar yo\'q.')}
                </td>
              </tr>
            ) : packages.map((pkg) => {
              const sellRow = sellRows[pkg.id] || { buyerFirmId: '', quantity: 1, unitPrice: '', exchangeRate: '' };
              const canSell = isAdmin || pkg.ownerFirmId === ownFirmId;
              return (
                <tr key={pkg.id}>
                  <td className="font-semibold">{pkg.name}</td>
                  <td>{pkg.ownerFirm?.name || pkg.ownerFirmId}</td>
                  <td>{pkg.destination}</td>
                  <td>{formatDate(pkg.startDate)} - {formatDate(pkg.endDate)}</td>
                  <td className="text-right font-mono">{pkg.quantity}</td>
                  <td className="text-right font-mono">{pkg.availableQuantity}</td>
                  <td className="text-right font-mono">{Number(pkg.unitPrice).toFixed(2)} {pkg.currency}</td>
                  <td>
                    {canSell ? (
                      <div className="flex min-w-[34rem] items-center gap-2">
                        <select className="compact-control min-w-44" value={sellRow.buyerFirmId} onChange={(e) => updateSellRow(pkg.id, { buyerFirmId: e.target.value })}>
                          <option value="">{tr('Buyer firm', 'Xaridor firma')}</option>
                          {buyerOptionsFor(pkg).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                        <input type="number" min="1" max={pkg.availableQuantity} className="compact-control w-20 text-right" value={sellRow.quantity} onChange={(e) => updateSellRow(pkg.id, { quantity: Number(e.target.value) })} />
                        <input type="number" min="0" className="compact-control w-28 text-right" placeholder={String(pkg.unitPrice)} value={sellRow.unitPrice} onChange={(e) => updateSellRow(pkg.id, { unitPrice: e.target.value })} />
                        {pkg.currency !== 'UZS' && (
                          <input type="number" min="0" className="compact-control w-28 text-right" placeholder={tr('Rate', 'Kurs')} value={sellRow.exchangeRate} onChange={(e) => updateSellRow(pkg.id, { exchangeRate: e.target.value })} />
                        )}
                        <button type="button" onClick={() => sellPackage(pkg)} disabled={busyId === pkg.id || pkg.availableQuantity <= 0} className="px-3 py-2 bg-primary text-ink rounded-lg text-xs font-bold uppercase disabled:opacity-50">
                          {tr('Sell', 'Sotish')}
                        </button>
                      </div>
                    ) : (
                      <span className="text-muted">{tr('Only owner can sell', 'Faqat egasi sotadi')}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-surface-2 border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">{tr('Tour sales ledger', 'Tur sotuvlari jurnali')}</h3>
        </div>
        <div className="overflow-x-auto scroller-minimal">
          <table className="excel-table">
            <thead>
              <tr>
                <th>{tr('Date', 'Sana')}</th>
                <th>{tr('Package', 'Paket')}</th>
                <th>{tr('Seller', 'Sotuvchi')}</th>
                <th>{tr('Buyer', 'Xaridor')}</th>
                <th className="text-right">{tr('Qty', 'Soni')}</th>
                <th className="text-right">{tr('Total', 'Jami')}</th>
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-muted">{tr('No tour sales yet.', 'Hali tur sotuvlari yo\'q.')}</td></tr>
              ) : sales.map((sale) => (
                <tr key={sale.id}>
                  <td>{new Date(sale.createdAt).toLocaleString()}</td>
                  <td>{sale.package?.name || sale.packageId}</td>
                  <td>{sale.sellerFirm?.name || sale.sellerFirmId}</td>
                  <td>{sale.buyerFirm?.name || sale.buyerFirmId}</td>
                  <td className="text-right font-mono">{sale.quantity}</td>
                  <td className="text-right font-mono">{Number(sale.totalAmount).toFixed(2)} {sale.currency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
