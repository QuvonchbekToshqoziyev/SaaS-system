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

type FlightOption = {
  id: string;
  flightNumber: string;
  route: string;
  departure?: string | null;
  arrival?: string | null;
  currency?: string | null;
};

type TourPackage = {
  id: string;
  ownerFirmId: string;
  ownerFirm?: FirmOption;
  flightId?: string | null;
  flight?: FlightOption | null;
  name: string;
  destination: string;
  startDate?: string | null;
  endDate?: string | null;
  quantity: number;
  availableQuantity: number;
  unitPrice: string | number;
  ticketPrice?: string | number;
  servicePrice?: string | number;
  currency: string;
  status: string;
  notes?: string | null;
};

const emptyCreateRow = {
  ownerFirmId: '',
  flightId: '',
  name: '',
  destination: '',
  quantity: 10,
  ticketPrice: 0,
  servicePrice: 0,
  currency: 'UZS',
  notes: '',
};

export default function ToursPage() {
  const { user } = useAuth();
  const { tr } = useLanguage();
  const role = String(user?.role || '').toUpperCase();
  const firmRole = user?.firmRole || 'FIRM_ADMIN';
  const isAdmin = role === 'ADMIN' || role === 'SUPERADMIN';
  const canCreateTours = role === 'FIRM' && (firmRole === 'FIRM_ADMIN' || firmRole === 'MANAGER');
  const ownFirmId = user?.firmId || '';

  const [packages, setPackages] = useState<TourPackage[]>([]);
  const [firms, setFirms] = useState<FirmOption[]>([]);
  const [flights, setFlights] = useState<FlightOption[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [createRow, setCreateRow] = useState(emptyCreateRow);
  const [sellRows, setSellRows] = useState<Record<string, { buyerFirmId: string; quantity: number; unitPrice: string; exchangeRate: string }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filters, setFilters] = useState({ q: '', firmId: 'ALL', status: 'ACTIVE' });

  const firmNameById = useMemo(() => new Map(firms.map((f) => [f.id, f.name])), [firms]);
  const flightNameById = useMemo(() => new Map(flights.map((flight) => [flight.id, `${flight.flightNumber} - ${flight.route}`])), [flights]);
  const visiblePackages = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return packages.filter((pkg) => {
      const status = String(pkg.status || '').toUpperCase();
      const haystack = [
        pkg.name,
        pkg.destination,
        pkg.ownerFirm?.name,
        pkg.flight?.flightNumber,
        pkg.flight?.route,
        pkg.currency,
        status,
      ].filter(Boolean).join(' ').toLowerCase();
      if (filters.firmId !== 'ALL' && pkg.ownerFirmId !== filters.firmId) return false;
      if (filters.status !== 'ALL' && status !== filters.status) return false;
      if (q && !haystack.includes(q)) return false;
      return true;
    });
  }, [filters, packages]);
  const visibleSales = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return sales.filter((sale) => {
      const sellerId = String(sale.sellerFirmId || '');
      const buyerId = String(sale.buyerFirmId || '');
      const haystack = [
        sale.package?.name,
        sale.package?.destination,
        sale.sellerFirm?.name,
        sale.buyerFirm?.name,
        sale.currency,
      ].filter(Boolean).join(' ').toLowerCase();
      if (filters.firmId !== 'ALL' && sellerId !== filters.firmId && buyerId !== filters.firmId) return false;
      if (q && !haystack.includes(q)) return false;
      return true;
    });
  }, [filters, sales]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [pkgRes, firmRes, salesRes, flightRes] = await Promise.all([
        api.get('/tour-packages'),
        api.get('/tour-packages/firms'),
        api.get('/tour-packages/sales'),
        api.get('/flights'),
      ]);
      setPackages(Array.isArray(pkgRes.data) ? pkgRes.data : []);
      setFirms(Array.isArray(firmRes.data) ? firmRes.data : []);
      setSales(Array.isArray(salesRes.data) ? salesRes.data : []);
      setFlights(Array.isArray(flightRes.data) ? flightRes.data : []);
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
    if (!canCreateTours) return;
    setCreateRow({ ...emptyCreateRow, ownerFirmId: isAdmin ? '' : ownFirmId });
    setIsCreating(true);
  };

  const createPackage = async () => {
    if (!canCreateTours) {
      toast.error(tr('Only firm admins can create tours', 'Turlarni faqat firma adminlari yaratadi'));
      return;
    }
    if (!createRow.flightId) {
      toast.error(tr('Choose a flight for this tour', 'Bu tur uchun reys tanlang'));
      return;
    }
    if (!createRow.name.trim() || !createRow.destination.trim()) {
      toast.error(tr('Name and destination are required', 'Nomi va manzil kerak'));
      return;
    }
    try {
      setBusyId('create');
      await api.post('/tour-packages', {
        ...createRow,
        unitPrice: Number(createRow.ticketPrice || 0) + Number(createRow.servicePrice || 0),
      });
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
      [packageId]: { ...(current[packageId] || { buyerFirmId: '', quantity: 1, unitPrice: '', exchangeRate: '' }), ...patch },
    }));
  };

  const sellPackage = async (pkg: TourPackage) => {
    const row = sellRows[pkg.id] || { buyerFirmId: '', quantity: 1, unitPrice: '', exchangeRate: '' };
    if (!row.buyerFirmId) {
      toast.error(tr('Select buyer firm', 'Xaridor firmani tanlang'));
      return;
    }
    const currency = String(pkg.currency || 'UZS').trim().toUpperCase();
    try {
      setBusyId(pkg.id);
      await api.post(`/tour-packages/${pkg.id}/sell`, {
        buyerFirmId: row.buyerFirmId,
        quantity: row.quantity,
        unitPrice: row.unitPrice || undefined,
        exchangeRate: currency !== 'UZS' ? row.exchangeRate.trim() : undefined,
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

  const formatDateTime = (value?: string | null) => {
    if (!value) return '-';
    return new Date(value).toLocaleString();
  };
  const flightLabel = (flight?: FlightOption | null, fallbackId?: string | null) => {
    if (flight) return `${flight.flightNumber} - ${flight.route}`;
    if (fallbackId && flightNameById.has(fallbackId)) return flightNameById.get(fallbackId) || fallbackId;
    return fallbackId || '-';
  };

  const buyerOptionsFor = (pkg: TourPackage) => firms.filter((f) => f.id !== pkg.ownerFirmId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">
            {isAdmin ? tr('All Tour Packages', 'Barcha tur paketlar') : tr('Tour Packages', 'Tur paketlar')}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {isAdmin
              ? tr('Platform-wide tour inventory, sales ledger, and firm filters.', 'Barcha tur inventari, sotuvlar jurnali va firma filtrlari.')
              : tr('Firm-owned B2B tour inventory and firm-to-firm sales.', 'Firmalarga tegishli B2B tur inventari va firma-firma sotuvlari.')}
          </p>
        </div>
        {canCreateTours && (
          <button
            type="button"
            onClick={startCreate}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-ink rounded-lg font-bold uppercase tracking-wider text-sm"
          >
            <Plus size={16} />
            {tr('Add tour', 'Tur qo\'shish')}
          </button>
        )}
      </div>

      <div className="grid gap-3 rounded-lg border border-border bg-surface-2 p-3 md:grid-cols-[minmax(220px,1fr)_minmax(180px,260px)_minmax(150px,200px)_auto] md:items-end">
        <label className="block">
          <span className="compact-label">{tr('Search', 'Qidirish')}</span>
          <input
            className="compact-control"
            value={filters.q}
            onChange={(e) => setFilters((current) => ({ ...current, q: e.target.value }))}
            placeholder={tr('Package, firm, flight...', 'Paket, firma, reys...')}
          />
        </label>
        <label className="block">
          <span className="compact-label">{tr('Firm', 'Firma')}</span>
          <select className="compact-control" value={filters.firmId} onChange={(e) => setFilters((current) => ({ ...current, firmId: e.target.value }))}>
            <option value="ALL">{tr('All firms', 'Barcha firmalar')}</option>
            {firms.map((firm) => <option key={firm.id} value={firm.id}>{firm.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="compact-label">{tr('Package status', 'Paket holati')}</span>
          <select className="compact-control" value={filters.status} onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value }))}>
            <option value="ACTIVE">{tr('Active', 'Aktiv')}</option>
            <option value="ALL">{tr('All statuses', 'Barcha holatlar')}</option>
            <option value="INACTIVE">{tr('Inactive', 'Nofaol')}</option>
            <option value="CANCELLED">{tr('Cancelled', 'Bekor qilingan')}</option>
          </select>
        </label>
        <div className="text-sm text-muted md:text-right">
          <span className="font-semibold text-foreground">{visiblePackages.length}</span> / {packages.length}
        </div>
      </div>

      {canCreateTours && isCreating && (
        <div className="glass-panel p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">{tr('New tour package', 'Yangi tur paket')}</h3>
            <button type="button" onClick={() => setIsCreating(false)} className="px-3 py-2 bg-surface border border-border rounded-lg text-xs font-semibold uppercase">
              {tr('Cancel', 'Bekor qilish')}
            </button>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(190px,1fr)_minmax(220px,1.35fr)_minmax(160px,1fr)_110px_150px_150px_90px_120px] lg:items-end">
            <label className="block">
              <span className="compact-label">{tr('Tour', 'Tur')}</span>
              <input className="compact-control" value={createRow.name} onChange={(e) => setCreateRow({ ...createRow, name: e.target.value })} placeholder={tr('Tour name', 'Tur nomi')} />
            </label>

            <label className="block">
              <span className="compact-label">{tr('Flight', 'Reys')}</span>
              <select className="compact-control" value={createRow.flightId} onChange={(e) => setCreateRow({ ...createRow, flightId: e.target.value })}>
                <option value="">{tr('Select flight', 'Reys tanlang')}</option>
                {flights.map((flight) => (
                  <option key={flight.id} value={flight.id}>
                    {flight.flightNumber} - {flight.route}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="compact-label">{tr('Destination', 'Manzil')}</span>
              <input className="compact-control" value={createRow.destination} onChange={(e) => setCreateRow({ ...createRow, destination: e.target.value })} placeholder={tr('Destination', 'Manzil')} />
            </label>

            <label className="block">
              <span className="compact-label">{tr('Qty', 'Soni')}</span>
              <input type="number" min="1" className="compact-control text-right" value={createRow.quantity} onChange={(e) => setCreateRow({ ...createRow, quantity: Number(e.target.value) })} />
            </label>

            <label className="block">
              <span className="compact-label">{tr('Ticket price', 'Chipta narxi')}</span>
              <input type="number" min="0" className="compact-control text-right" value={createRow.ticketPrice} onChange={(e) => setCreateRow({ ...createRow, ticketPrice: Number(e.target.value) })} />
            </label>

            <label className="block">
              <span className="compact-label">{tr('Services', 'Xizmatlar')}</span>
              <input type="number" min="0" className="compact-control text-right" value={createRow.servicePrice} onChange={(e) => setCreateRow({ ...createRow, servicePrice: Number(e.target.value) })} />
            </label>

            <label className="block">
              <span className="compact-label">{tr('Currency', 'Valyuta')}</span>
              <select className="compact-control" value={createRow.currency} onChange={(e) => setCreateRow({ ...createRow, currency: e.target.value })}>
                <option value="UZS">UZS</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </label>

            <button type="button" onClick={createPackage} disabled={busyId === 'create'} className="h-9 px-3 bg-primary text-ink rounded-lg text-xs font-bold uppercase disabled:opacity-50">
              {tr('Create', 'Yaratish')}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto scroller-minimal glass-panel">
        <table className="excel-table">
          <thead>
            <tr>
              <th>{tr('Package', 'Paket')}</th>
              <th>{tr('Owner firm', 'Egasi')}</th>
              <th>{tr('Flight', 'Reys')}</th>
              <th>{tr('Destination', 'Manzil')}</th>
              <th className="text-right">{tr('Qty', 'Soni')}</th>
              <th className="text-right">{tr('Available', 'Mavjud')}</th>
              <th className="text-right">{tr('Price split', 'Narx taqsimoti')}</th>
              <th>{tr('Sell to firm', 'Firmaga sotish')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center text-muted">{tr('Loading...', 'Yuklanmoqda...')}</td></tr>
            ) : visiblePackages.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-muted">
                  <PackageOpen className="mx-auto mb-2 text-muted" size={28} />
                  {tr('No tour packages yet.', 'Hali tur paketlar yo\'q.')}
                </td>
              </tr>
            ) : visiblePackages.map((pkg) => {
              const sellRow = sellRows[pkg.id] || { buyerFirmId: '', quantity: 1, unitPrice: '', exchangeRate: '' };
              const canSell = isAdmin || pkg.ownerFirmId === ownFirmId;
              return (
                <tr key={pkg.id}>
                  <td className="font-semibold">{pkg.name}</td>
                  <td>
                    <div className="font-semibold">{pkg.ownerFirm?.name || pkg.ownerFirmId}</div>
                    <div className="text-xs text-muted">{tr('Creator firm', 'Yaratuvchi firma')}</div>
                  </td>
                  <td>
                    <div className="font-semibold">{flightLabel(pkg.flight, pkg.flightId)}</div>
                    <div className="text-xs text-muted">{formatDateTime(pkg.flight?.departure)}</div>
                  </td>
                  <td>{pkg.destination}</td>
                  <td className="text-right font-mono">{pkg.quantity}</td>
                  <td className="text-right font-mono">{pkg.availableQuantity}</td>
                  <td className="text-right font-mono">
                    <div>{Number(pkg.unitPrice).toFixed(2)} {pkg.currency}</div>
                    <div className="text-xs text-muted">
                      {Number(pkg.ticketPrice || 0).toFixed(2)} + {Number(pkg.servicePrice || 0).toFixed(2)}
                    </div>
                  </td>
                  <td>
                    {canSell ? (
                      <div className="flex min-w-[34rem] items-center gap-2">
                        <select className="compact-control min-w-44" value={sellRow.buyerFirmId} onChange={(e) => updateSellRow(pkg.id, { buyerFirmId: e.target.value })}>
                          <option value="">{tr('Buyer firm', 'Xaridor firma')}</option>
                          {buyerOptionsFor(pkg).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                        <input type="number" min="1" max={pkg.availableQuantity} className="compact-control w-20 text-right" value={sellRow.quantity} onChange={(e) => updateSellRow(pkg.id, { quantity: Number(e.target.value) })} />
                        <input type="number" min="0" className="compact-control w-28 text-right" placeholder={String(pkg.unitPrice)} value={sellRow.unitPrice} onChange={(e) => updateSellRow(pkg.id, { unitPrice: e.target.value })} />
                        {String(pkg.currency || 'UZS').trim().toUpperCase() !== 'UZS' && (
                          <input inputMode="decimal" className="compact-control w-28 text-right" placeholder={tr('Rate to UZS', 'UZS kursi')} value={sellRow.exchangeRate} onChange={(e) => updateSellRow(pkg.id, { exchangeRate: e.target.value })} />
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

      <div className="glass-panel overflow-hidden">
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
              {visibleSales.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-muted">{tr('No tour sales yet.', 'Hali tur sotuvlari yo\'q.')}</td></tr>
              ) : visibleSales.map((sale) => (
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
