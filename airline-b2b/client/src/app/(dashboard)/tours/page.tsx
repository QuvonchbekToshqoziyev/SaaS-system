/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { BarChart3, BriefcaseBusiness, Eye, History, PackageOpen, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import ExportActions from '@/components/ui/ExportActions';

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
  ticketCurrency?: string | null;
  availableTicketCount?: number;
  availableRoundTripCount?: number;
  availableOutboundCount?: number;
  availableReturnCount?: number;
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
  soldQuantity?: number;
  ticketsPerTour?: number;
  ticketProductType?: 'ROUND_TRIP' | 'ONE_WAY';
  ticketDirection?: 'OUTBOUND' | 'RETURN' | null;
  unitPrice: string | number;
  ticketPrice?: string | number;
  servicePrice?: string | number;
  totalCost?: string | number;
  currency: string;
  status: string;
  deletedAt?: string | null;
  notes?: string | null;
  components?: TourComponent[];
};

type ServiceOffering = {
  id: string; name: string; quantity: number; availableQuantity: number; reservedQuantity?: number; consumedQuantity?: number;
  unitPrice: string | number; currency: string; flightId?: string | null; providerName?: string | null; providerFirm?: FirmOption | null;
};

type TourComponent = {
  id: string; componentType: string; serviceId?: string | null; quantityPerTour: number; totalReservedQuantity: number;
  consumedQuantity: number; unitCostSnapshot: string | number; originalCurrency: string; currencySnapshot: string;
  exchangeRateSnapshot: string | number; costPerTourSnapshot: string | number; totalCostSnapshot: string | number; service?: ServiceOffering | null;
};

type SelectedServiceRow = { serviceId: string; quantityPerTour: number; exchangeRate: string };

const emptyCreateRow = {
  ownerFirmId: '',
  flightId: '',
  name: '',
  destination: '',
  quantity: 10,
  ticketsPerTour: 1,
  ticketProductType: 'ROUND_TRIP' as 'ROUND_TRIP' | 'ONE_WAY',
  ticketDirection: 'OUTBOUND' as 'OUTBOUND' | 'RETURN',
  ticketExchangeRate: '',
  currency: 'UZS',
  notes: '',
};

const emptyServiceRow = {
  name: '', providerFirmId: '', providerName: '', flightId: '', quantity: '1',
  unitPrice: '', currency: 'UZS', exchangeRate: '', paymentStatus: 'DEBT', description: '',
};

export default function ToursPage() {
  const { user } = useAuth();
  const { tr } = useLanguage();
  const role = String(user?.role || '').toUpperCase();
  const firmRole = user?.firmRole || 'FIRM_ADMIN';
  const isAdmin = role === 'ADMIN' || role === 'SUPERADMIN';
  const canCreateTours = role === 'FIRM' && (firmRole === 'FIRM_ADMIN' || firmRole === 'MANAGER');
  const canCorrectTours = canCreateTours || role === 'SUPERADMIN';
  const ownFirmId = user?.firmId || '';

  const [packages, setPackages] = useState<TourPackage[]>([]);
  const [firms, setFirms] = useState<FirmOption[]>([]);
  const [flights, setFlights] = useState<FlightOption[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [services, setServices] = useState<ServiceOffering[]>([]);
  const [selectedServices, setSelectedServices] = useState<SelectedServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [isAddingService, setIsAddingService] = useState(false);
  const [serviceRow, setServiceRow] = useState(emptyServiceRow);
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
      const [pkgRes, firmRes, salesRes, flightRes, serviceRes] = await Promise.all([
        api.get('/tour-packages?status=ALL'),
        api.get('/tour-packages/firms'),
        api.get('/tour-packages/sales'),
        canCreateTours ? api.get('/tour-packages/flights') : api.get('/flights'),
        canCreateTours ? api.get('/tour-packages/services') : Promise.resolve({ data: [] }),
      ]);
      setPackages(Array.isArray(pkgRes.data) ? pkgRes.data : []);
      setFirms(Array.isArray(firmRes.data) ? firmRes.data : []);
      setSales(Array.isArray(salesRes.data) ? salesRes.data : []);
      setFlights(Array.isArray(flightRes.data) ? flightRes.data : []);
      setServices(Array.isArray(serviceRes.data) ? serviceRes.data : []);
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
    setSelectedServices([]);
    setEditingId(null);
    setIsCreating(true);
  };

  const startEdit = (pkg: TourPackage) => {
    setCreateRow({
      ownerFirmId: pkg.ownerFirmId, flightId: pkg.flightId || '', name: pkg.name, destination: pkg.destination,
      quantity: pkg.quantity, ticketsPerTour: pkg.ticketsPerTour || 1, ticketExchangeRate: '', currency: pkg.currency, notes: pkg.notes || '',
      ticketProductType: pkg.ticketProductType || 'ROUND_TRIP', ticketDirection: pkg.ticketDirection || 'OUTBOUND',
    });
    setSelectedServices((pkg.components || []).filter((item) => item.componentType === 'SERVICE' && item.serviceId).map((item) => ({ serviceId: item.serviceId!, quantityPerTour: item.quantityPerTour, exchangeRate: '' })));
    setEditingId(pkg.id);
    setIsCreating(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const createPackage = async () => {
    if ((!editingId && !canCreateTours) || (editingId && !canCorrectTours)) {
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
    const selectedFlight = flights.find((flight) => flight.id === createRow.flightId);
    const availableUnits = createRow.ticketProductType === 'ROUND_TRIP'
      ? Number(selectedFlight?.availableRoundTripCount || 0)
      : createRow.ticketDirection === 'RETURN'
        ? Number(selectedFlight?.availableReturnCount || 0)
        : Number(selectedFlight?.availableOutboundCount || 0);
    const requiredUnits = Number(createRow.quantity || 0) * Number(createRow.ticketsPerTour || 0);
    if (!editingId && requiredUnits > availableUnits) {
      toast.error(tr(`Only ${availableUnits} selected ticket units are available`, `Tanlangan turdan faqat ${availableUnits} ta bilet mavjud`));
      return;
    }
    try {
      setBusyId('create');
      let payload: any = {
        ...createRow,
        ticketCurrency: flights.find((flight) => flight.id === createRow.flightId)?.currency || createRow.currency,
        services: selectedServices.map((row) => ({ ...row, exchangeRate: row.exchangeRate || undefined })),
      };
      const editedPackage = editingId ? packages.find((pkg) => pkg.id === editingId) : undefined;
      if (editedPackage && Number(editedPackage.soldQuantity || 0) > 0) payload = { name: createRow.name, notes: createRow.notes, status: editedPackage.status };
      if (editingId && role === 'SUPERADMIN') {
        const reason = window.prompt(tr('Correction reason is required', 'Tuzatish sababini kiriting'))?.trim();
        if (!reason) return;
        payload.reason = reason;
      }
      if (editingId) await api.put(`/tour-packages/${editingId}`, payload);
      else await api.post('/tour-packages', payload);
      toast.success(editingId ? tr('Tour package updated', 'Tur paket yangilandi') : tr('Tour package created', 'Tur paket yaratildi'));
      setIsCreating(false);
      setCreateRow(emptyCreateRow);
      setSelectedServices([]);
      setEditingId(null);
      await loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || tr('Failed to create tour package', 'Tur paket yaratib bo\'lmadi'));
    } finally {
      setBusyId(null);
    }
  };

  const cancelPackage = async (pkg: TourPackage) => {
    const reason = window.prompt(tr('Cancellation reason is required', 'Bekor qilish sababini kiriting'))?.trim();
    if (!reason) return;
    if (!window.confirm(tr('Do you want to cancel this tour package?', 'Ushbu tur paketini bekor qilmoqchimisiz?'))) return;
    try {
      setBusyId(`cancel-${pkg.id}`);
      await api.post(`/tour-packages/${pkg.id}/cancel`, { reason });
      toast.success(tr('Tour package cancelled', 'Tur paket bekor qilindi'));
      await loadData();
    } catch (err: any) { toast.error(err?.response?.data?.error || tr('Failed to cancel tour', 'Turni bekor qilib bo‘lmadi')); }
    finally { setBusyId(null); }
  };

  const addServiceSelection = () => setSelectedServices((rows) => [...rows, { serviceId: '', quantityPerTour: 1, exchangeRate: '' }]);
  const updateServiceSelection = (index: number, patch: Partial<SelectedServiceRow>) => setSelectedServices((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  const selectedService = (id: string) => services.find((service) => service.id === id);
  const serviceRowCost = (row: SelectedServiceRow) => {
    const service = selectedService(row.serviceId);
    if (!service) return 0;
    const source = String(service.currency).toUpperCase();
    const target = String(createRow.currency).toUpperCase();
    const rate = Number(row.exchangeRate || 0);
    const multiplier = source === target ? 1 : source === 'USD' && target === 'UZS' ? rate : rate > 0 ? 1 / rate : 0;
    return Number(service.unitPrice) * row.quantityPerTour * multiplier;
  };
  const viewHistory = (pkg: TourPackage) => {
    setFilters((current) => ({ ...current, q: pkg.name }));
    setTimeout(() => document.getElementById('tour-history')?.scrollIntoView({ behavior: 'smooth' }), 0);
  };

  const createService = async () => {
    try {
      setBusyId('service');
      await api.post('/services', {
        ...serviceRow,
        providerFirmId: serviceRow.providerFirmId || undefined,
        flightId: serviceRow.flightId || undefined,
        exchangeRate: serviceRow.currency === 'USD' && serviceRow.exchangeRate ? serviceRow.exchangeRate : undefined,
        quantity: Number(serviceRow.quantity),
        unitPrice: Number(serviceRow.unitPrice),
      });
      toast.success(tr('Service recorded', 'Xizmat qayd etildi'));
      setServiceRow(emptyServiceRow);
      setIsAddingService(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || tr('Failed to record service', 'Xizmatni qayd etib bo\'lmadi'));
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
        <div className="flex flex-wrap gap-2">
        <ExportActions filename="ado-tur-paketlar" sheet={{
          name: 'Tur paketlar',
          columns: [{ header: 'Tur nomi', key: 'name' }, { header: 'Yo‘nalish', key: 'destination' }, { header: 'Firma', key: 'firm' }, { header: 'Jami soni', key: 'quantity' }, { header: 'Qoldiq', key: 'available' }, { header: 'Narxi', key: 'price' }, { header: 'Valyuta', key: 'currency' }, { header: 'Status', key: 'status' }],
          rows: visiblePackages.map((pkg) => ({ name: pkg.name, destination: pkg.destination, firm: pkg.ownerFirm?.name || '', quantity: pkg.quantity, available: pkg.availableQuantity, price: Number(pkg.unitPrice || 0), currency: pkg.currency, status: pkg.status })),
        }} />
        {canCreateTours && (
          <button
            type="button"
            onClick={() => setIsAddingService((value) => !value)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-bold uppercase tracking-wider text-foreground hover:border-primary hover:text-primary"
          >
            <BriefcaseBusiness size={16} />
            {tr('Add service', 'Xizmat qo‘shish')}
          </button>
        )}
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
      </div>

      {isAddingService && canCreateTours && (
        <div className="grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-3">
          <input className="compact-control" placeholder={tr('Service name, e.g. Visa', 'Xizmat nomi, masalan Viza')} value={serviceRow.name} onChange={(e) => setServiceRow({ ...serviceRow, name: e.target.value })} required />
          <select className="compact-control" value={serviceRow.providerFirmId} onChange={(e) => {
            const providerFirmId = e.target.value;
            setServiceRow({ ...serviceRow, providerFirmId, providerName: firms.find((firm) => firm.id === providerFirmId)?.name || '' });
          }}>
            <option value="">{tr('Custom provider', 'Boshqa ta’minotchi')}</option>
            {firms.filter((firm) => firm.id !== ownFirmId).map((firm) => <option key={firm.id} value={firm.id}>{firm.name}</option>)}
          </select>
          <input className="compact-control" placeholder={tr('Provider name', 'Xizmat ko‘rsatuvchi nomi')} value={serviceRow.providerName} onChange={(e) => setServiceRow({ ...serviceRow, providerName: e.target.value, providerFirmId: '' })} required />
          <select className="compact-control" value={serviceRow.flightId} onChange={(e) => setServiceRow({ ...serviceRow, flightId: e.target.value })}>
            <option value="">{tr('No flight', 'Reyssiz')}</option>
            {flights.map((flight) => <option key={flight.id} value={flight.id}>{flight.flightNumber} · {flight.route}</option>)}
          </select>
          <input className="compact-control" type="number" min="1" value={serviceRow.quantity} onChange={(e) => setServiceRow({ ...serviceRow, quantity: e.target.value })} required />
          <input className="compact-control" type="number" min="0.01" step="0.01" placeholder={tr('Unit price', 'Bir dona narxi')} value={serviceRow.unitPrice} onChange={(e) => setServiceRow({ ...serviceRow, unitPrice: e.target.value })} required />
          <select className="compact-control" value={serviceRow.currency} onChange={(e) => setServiceRow({ ...serviceRow, currency: e.target.value })}><option>UZS</option><option>USD</option></select>
          {serviceRow.currency === 'USD' && <input className="compact-control" inputMode="decimal" placeholder={tr('Firm rate (optional)', 'Firma kursi (ixtiyoriy)')} value={serviceRow.exchangeRate} onChange={(e) => setServiceRow({ ...serviceRow, exchangeRate: e.target.value })} />}
          <select className="compact-control" value={serviceRow.paymentStatus} onChange={(e) => setServiceRow({ ...serviceRow, paymentStatus: e.target.value })}>
            <option value="DEBT">{tr('Debt', 'Qarz')}</option><option value="PAID">{tr('Paid', 'To‘langan')}</option>
          </select>
          <textarea className="compact-control md:col-span-2" placeholder={tr('Notes', 'Izoh')} value={serviceRow.description} onChange={(e) => setServiceRow({ ...serviceRow, description: e.target.value })} />
          <div className="flex gap-2">
            <button type="button" onClick={createService} disabled={busyId === 'service'} className="rounded bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50">{busyId === 'service' ? tr('Saving...', 'Saqlanmoqda...') : tr('Record service', 'Xizmatni qayd etish')}</button>
            <button type="button" onClick={() => setIsAddingService(false)} className="rounded border border-border px-4 py-2">{tr('Cancel', 'Bekor qilish')}</button>
          </div>
        </div>
      )}

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

      {canCorrectTours && isCreating && (
        <div className="glass-panel p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">{editingId ? tr('Edit tour package', 'Tur paketini tahrirlash') : tr('New tour package', 'Yangi tur paket')}</h3>
            <button type="button" onClick={() => { setIsCreating(false); setEditingId(null); setSelectedServices([]); }} className="px-3 py-2 bg-surface border border-border rounded-lg text-xs font-semibold uppercase">
              {tr('Cancel', 'Bekor qilish')}
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="block">
              <span className="compact-label">{tr('Tour', 'Tur')}</span>
              <input className="compact-control" value={createRow.name} onChange={(e) => setCreateRow({ ...createRow, name: e.target.value })} placeholder={tr('Tour name', 'Tur nomi')} />
            </label>

            <label className="block">
              <span className="compact-label">{tr('Flight', 'Reys')}</span>
              <select className="compact-control" value={createRow.flightId} onChange={(e) => {
                const flight = flights.find((row) => row.id === e.target.value);
                const ticketProductType = Number(flight?.availableRoundTripCount || 0) > 0 ? 'ROUND_TRIP' : 'ONE_WAY';
                const ticketDirection = Number(flight?.availableOutboundCount || 0) > 0 ? 'OUTBOUND' : 'RETURN';
                setCreateRow({ ...createRow, flightId: e.target.value, ticketProductType, ticketDirection });
              }}>
                <option value="">{tr('Select flight', 'Reys tanlang')}</option>
                {flights.map((flight) => (
                  <option key={flight.id} value={flight.id} disabled={!editingId && Number(flight.availableTicketCount || 0) <= 0}>
                    {flight.flightNumber} - {flight.route}{flight.availableTicketCount != null ? ` · RT ${flight.availableRoundTripCount || 0} · OUT ${flight.availableOutboundCount || 0} · RETURN ${flight.availableReturnCount || 0}` : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="compact-label">{tr('Ticket product', 'Bilet mahsuloti')}</span>
              <select className="compact-control" value={createRow.ticketProductType} onChange={(e) => setCreateRow({ ...createRow, ticketProductType: e.target.value as 'ROUND_TRIP' | 'ONE_WAY' })}>
                <option value="ROUND_TRIP">RT — borish–kelish</option>
                <option value="ONE_WAY">OW — segment</option>
              </select>
            </label>

            {createRow.ticketProductType === 'ONE_WAY' && <label className="block">
              <span className="compact-label">{tr('Ticket direction', 'Bilet yo‘nalishi')}</span>
              <select className="compact-control" value={createRow.ticketDirection} onChange={(e) => setCreateRow({ ...createRow, ticketDirection: e.target.value as 'OUTBOUND' | 'RETURN' })}>
                <option value="OUTBOUND">OUTBOUND ({flights.find((flight) => flight.id === createRow.flightId)?.availableOutboundCount || 0})</option>
                <option value="RETURN">RETURN ({flights.find((flight) => flight.id === createRow.flightId)?.availableReturnCount || 0})</option>
              </select>
            </label>}

            <label className="block">
              <span className="compact-label">{tr('Destination', 'Manzil')}</span>
              <input className="compact-control" value={createRow.destination} onChange={(e) => setCreateRow({ ...createRow, destination: e.target.value })} placeholder={tr('Destination', 'Manzil')} />
            </label>

            <label className="block">
              <span className="compact-label">{tr('Tour quantity', 'Tur soni')}</span>
              <input type="number" min="1" className="compact-control text-right" value={createRow.quantity} onChange={(e) => setCreateRow({ ...createRow, quantity: Number(e.target.value) })} />
            </label>

            <label className="block">
              <span className="compact-label">{tr('Tickets per tour', 'Har bir turga bilet')}</span>
              <input type="number" min="1" className="compact-control text-right" value={createRow.ticketsPerTour} onChange={(e) => setCreateRow({ ...createRow, ticketsPerTour: Number(e.target.value) })} />
            </label>

            <label className="block">
              <span className="compact-label">{tr('Currency', 'Valyuta')}</span>
              <select className="compact-control" value={createRow.currency} onChange={(e) => setCreateRow({ ...createRow, currency: e.target.value })}>
                <option value="UZS">UZS</option>
                <option value="USD">USD</option>
              </select>
            </label>
            {flights.find((flight) => flight.id === createRow.flightId)?.currency && flights.find((flight) => flight.id === createRow.flightId)?.currency !== createRow.currency && (
              <label className="block"><span className="compact-label">{tr('Ticket currency rate', 'Bilet valyuta kursi')}</span><input inputMode="decimal" className="compact-control text-right" value={createRow.ticketExchangeRate} onChange={(e) => setCreateRow({ ...createRow, ticketExchangeRate: e.target.value })} placeholder="1 USD = ... UZS" /></label>
            )}
            <label className="block md:col-span-2 xl:col-span-4"><span className="compact-label">{tr('Notes', 'Izoh')}</span><textarea className="compact-control" value={createRow.notes} onChange={(e) => setCreateRow({ ...createRow, notes: e.target.value })} /></label>
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div><h4 className="font-bold">{tr('Tour services', 'Tur xizmatlari')}</h4><p className="text-xs text-muted">{tr('Costs are always read from service inventory.', 'Tannarx har doim xizmat inventaridan olinadi.')}</p></div>
              <button type="button" onClick={addServiceSelection} className="inline-flex items-center gap-2 rounded-lg border border-primary px-3 py-2 text-sm font-bold text-primary"><Plus size={15} />{tr('Add service', 'Xizmat qo‘shish')}</button>
            </div>
            <div className="space-y-3">
              {selectedServices.map((row, index) => {
                const service = selectedService(row.serviceId);
                const required = Number(createRow.quantity || 0) * Number(row.quantityPerTour || 0);
                const duplicate = row.serviceId && selectedServices.some((other, otherIndex) => otherIndex !== index && other.serviceId === row.serviceId);
                const needsRate = service && String(service.currency).toUpperCase() !== String(createRow.currency).toUpperCase();
                return <div key={index} className="grid gap-2 rounded-lg border border-border bg-surface-2 p-3 md:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] xl:items-end">
                  <label><span className="compact-label">{tr('Select service', 'Xizmatni tanlash')}</span><select className="compact-control" value={row.serviceId} onChange={(e) => updateServiceSelection(index, { serviceId: e.target.value })}><option value="">{tr('Choose...', 'Tanlang...')}</option>{services.filter((item) => !item.flightId || item.flightId === createRow.flightId).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.providerFirm?.name || item.providerName || '-'} · {item.availableQuantity} ta</option>)}</select>{duplicate && <span className="text-xs text-danger">{tr('Already added', 'Ushbu xizmat tur paketiga allaqachon qo‘shilgan.')}</span>}</label>
                  <label><span className="compact-label">{tr('Per tour', 'Har bir turga')}</span><input type="number" min="1" className="compact-control text-right" value={row.quantityPerTour} onChange={(e) => updateServiceSelection(index, { quantityPerTour: Number(e.target.value) })} /></label>
                  <div><span className="compact-label">{tr('Available', 'Mavjud')}</span><div className="compact-control text-right">{service?.availableQuantity ?? '-'}</div></div>
                  <div><span className="compact-label">{tr('Unit cost', 'Bir dona tannarx')}</span><div className="compact-control text-right">{service ? `${Number(service.unitPrice).toFixed(2)} ${service.currency}` : '-'}</div></div>
                  <div><span className="compact-label">{tr('Required', 'Kerak bo‘ladi')}</span><div className={`compact-control text-right ${service && required > service.availableQuantity ? 'text-danger' : ''}`}>{required}</div></div>
                  {needsRate ? <label><span className="compact-label">{tr('Currency rate', 'Valyuta kursi')}</span><input inputMode="decimal" className="compact-control text-right" value={row.exchangeRate} onChange={(e) => updateServiceSelection(index, { exchangeRate: e.target.value })} placeholder="1 USD = ... UZS" /></label> : <div><span className="compact-label">{tr('Total', 'Jami')}</span><div className="compact-control text-right">{(serviceRowCost(row) * Number(createRow.quantity || 0)).toFixed(2)} {createRow.currency}</div></div>}
                  <button type="button" title={tr('Remove', 'Olib tashlash')} onClick={() => setSelectedServices((rows) => rows.filter((_, rowIndex) => rowIndex !== index))} className="rounded-lg border border-danger/40 p-2 text-danger"><X size={17} /></button>
                  {needsRate && <div className="text-right text-sm font-semibold md:col-span-2 xl:col-span-7">{tr('Service total', 'Xizmat jami')}: {(serviceRowCost(row) * Number(createRow.quantity || 0)).toFixed(2)} {createRow.currency}</div>}
                </div>;
              })}
              {!selectedServices.length && <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted">{tr('No services selected. Add one if this tour includes purchased services.', 'Xizmat tanlanmagan. Turda oldindan olingan xizmat bo‘lsa, qo‘shing.')}</p>}
            </div>
          </div>
          <div className="mt-4 flex justify-end"><button type="button" onClick={createPackage} disabled={busyId === 'create'} className="px-5 py-2 bg-primary text-ink rounded-lg text-xs font-bold uppercase disabled:opacity-50">{busyId === 'create' ? tr('Saving...', 'Saqlanmoqda...') : editingId ? tr('Save changes', 'O‘zgarishlarni saqlash') : tr('Create', 'Yaratish')}</button></div>
        </div>
      )}

      <div id="tour-sales" className="scroll-mt-24 overflow-x-auto scroller-minimal glass-panel">
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
              <th className="text-right">{tr('Total cost', 'Jami tannarx')}</th>
              <th>{tr('Sell to firm', 'Firmaga sotish')}</th>
              <th>{tr('Actions', 'Amallar')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="text-center text-muted">{tr('Loading...', 'Yuklanmoqda...')}</td></tr>
            ) : visiblePackages.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center text-muted">
                  <PackageOpen className="mx-auto mb-2 text-muted" size={28} />
                  {tr('No tour packages yet.', 'Hali tur paketlar yo\'q.')}
                </td>
              </tr>
            ) : visiblePackages.map((pkg) => {
              const sellRow = sellRows[pkg.id] || { buyerFirmId: '', quantity: 1, unitPrice: '', exchangeRate: '' };
              const canSell = isAdmin || pkg.ownerFirmId === ownFirmId;
              return (
                <tr key={pkg.id}>
                  <td className="font-semibold"><div>{pkg.name}</div><span className="mt-1 inline-block rounded bg-primary/15 px-2 py-0.5 text-xs text-primary">{pkg.ticketProductType === 'ONE_WAY' ? `OW · ${pkg.ticketDirection}` : 'RT'}</span></td>
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
                      {tr('Ticket', 'Bilet')}: {Number(pkg.ticketPrice || 0).toFixed(2)} · {tr('Services', 'Xizmatlar')}: {Number(pkg.servicePrice || 0).toFixed(2)}
                    </div>
                  </td>
                  <td className="text-right font-mono">{Number(pkg.totalCost || Number(pkg.unitPrice) * pkg.quantity).toFixed(2)} {pkg.currency}</td>
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
                  <td><div className="flex min-w-36 gap-1">
                    <button type="button" title={tr('Details', 'Tafsilotlar')} onClick={() => setDetailId(detailId === pkg.id ? null : pkg.id)} className="rounded border border-border p-2 hover:text-primary"><Eye size={15} /></button>
                    <button type="button" title={tr('History', 'Tarix')} onClick={() => viewHistory(pkg)} className="rounded border border-border p-2 hover:text-primary"><History size={15} /></button>
                    <button type="button" title={tr('Report', 'Hisobot')} onClick={() => { window.location.href = '/reports'; }} className="rounded border border-border p-2 hover:text-primary"><BarChart3 size={15} /></button>
                    {canCorrectTours && (role === 'SUPERADMIN' || pkg.ownerFirmId === ownFirmId) && !pkg.deletedAt && <button type="button" title={tr('Edit', 'Tahrirlash')} onClick={() => startEdit(pkg)} className="rounded border border-border p-2 hover:text-primary"><Pencil size={15} /></button>}
                    {canCorrectTours && (role === 'SUPERADMIN' || pkg.ownerFirmId === ownFirmId) && pkg.status !== 'CANCELLED' && <button type="button" title={tr('Cancel', 'Bekor qilish')} onClick={() => cancelPackage(pkg)} disabled={busyId === `cancel-${pkg.id}`} className="rounded border border-danger/40 p-2 text-danger disabled:opacity-50"><Trash2 size={15} /></button>}
                  </div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {detailId && (() => {
        const pkg = packages.find((item) => item.id === detailId);
        if (!pkg) return null;
        return <div className="glass-panel p-4">
          <div className="mb-4 flex items-start justify-between"><div><h3 className="text-xl font-bold">{pkg.name}</h3><p className="text-sm text-muted">{flightLabel(pkg.flight, pkg.flightId)} · {pkg.destination}</p></div><button type="button" onClick={() => setDetailId(null)}><X /></button></div>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div><span className="compact-label">{tr('Total quantity', 'Jami soni')}</span><strong>{pkg.quantity}</strong></div><div><span className="compact-label">{tr('Sold', 'Sotilgan')}</span><strong>{pkg.soldQuantity || 0}</strong></div><div><span className="compact-label">{tr('Available', 'Qolgan')}</span><strong>{pkg.availableQuantity}</strong></div><div><span className="compact-label">{tr('Unit cost', 'Bir dona tannarx')}</span><strong>{Number(pkg.unitPrice).toFixed(2)} {pkg.currency}</strong></div><div><span className="compact-label">{tr('Total cost', 'Jami tannarx')}</span><strong>{Number(pkg.totalCost || 0).toFixed(2)} {pkg.currency}</strong></div>
          </div>
          <div className="overflow-x-auto"><table className="excel-table"><thead><tr><th>{tr('Component', 'Komponent')}</th><th className="text-right">{tr('Per tour', 'Har bir turga')}</th><th className="text-right">{tr('Total reserved', 'Jami band')}</th><th className="text-right">{tr('Unit cost', 'Bir dona tannarx')}</th><th className="text-right">{tr('Cost per tour', 'Bir turga tannarx')}</th><th className="text-right">{tr('Total cost', 'Jami tannarx')}</th></tr></thead><tbody>{(pkg.components || []).map((component) => <tr key={component.id}><td>{component.componentType === 'TICKET' ? tr('Ticket', 'Bilet') : component.service?.name || tr('Service', 'Xizmat')}</td><td className="text-right">{component.quantityPerTour}</td><td className="text-right">{component.totalReservedQuantity}</td><td className="text-right">{Number(component.unitCostSnapshot).toFixed(2)} {component.originalCurrency}</td><td className="text-right">{Number(component.costPerTourSnapshot).toFixed(2)} {component.currencySnapshot}</td><td className="text-right">{Number(component.totalCostSnapshot).toFixed(2)} {component.currencySnapshot}</td></tr>)}</tbody></table></div>
        </div>;
      })()}

      <div id="tour-history" className="scroll-mt-24 glass-panel overflow-hidden">
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
