/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { BarChart3, BriefcaseBusiness, Eye, History, PackageOpen, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import ExportActions from '@/components/ui/ExportActions';
import ActionButtons from '@/components/ui/ActionButtons';
import { formatFlightDisplayName } from '@/lib/flight-display';
import { formatNumber } from '@/lib/format';

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
type SellRow = { buyerFirmId: string; quantity: number; unitPrice: string; exchangeRate: string; discountAmount: string; saleNote: string };

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

const emptySellRow: SellRow = { buyerFirmId: '', quantity: 1, unitPrice: '', exchangeRate: '', discountAmount: '0', saleNote: '' };

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
  const [sellingId, setSellingId] = useState<string | null>(null);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [isAddingService, setIsAddingService] = useState(false);
  const [serviceRow, setServiceRow] = useState(emptyServiceRow);
  const [createRow, setCreateRow] = useState(emptyCreateRow);
  const [sellRows, setSellRows] = useState<Record<string, SellRow>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filters, setFilters] = useState({ q: '', firmId: 'ALL', status: 'ACTIVE' });

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
    if (!serviceDraftValid) {
      toast.error(tr('Fill all required service fields correctly', 'Xizmatning barcha majburiy maydonlarini to‘g‘ri to‘ldiring'));
      return;
    }
    try {
      setBusyId('service');
      const response = await api.post('/services', {
        ...serviceRow,
        providerFirmId: serviceRow.providerFirmId || undefined,
        flightId: serviceRow.flightId || undefined,
        exchangeRate: serviceRow.currency === 'USD' && serviceRow.exchangeRate ? serviceRow.exchangeRate : undefined,
        quantity: Number(serviceRow.quantity),
        unitPrice: Number(serviceRow.unitPrice),
      });
      const created = response.data as ServiceOffering;
      setServices((current) => [...current.filter((service) => service.id !== created.id), created].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedServices((current) => current.some((row) => row.serviceId === created.id)
        ? current
        : [...current, { serviceId: created.id, quantityPerTour: 1, exchangeRate: '' }]);
      toast.success(tr('Service recorded', 'Xizmat qayd etildi'));
      setServiceRow(emptyServiceRow);
      setIsAddingService(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || tr('Failed to record service', 'Xizmatni qayd etib bo\'lmadi'));
    } finally {
      setBusyId(null);
    }
  };

  const updateSellRow = (packageId: string, patch: Partial<SellRow>) => {
    setSellRows((current) => ({
      ...current,
      [packageId]: { ...(current[packageId] || emptySellRow), ...patch },
    }));
  };

  const openSale = (packageId: string) => {
    setSellRows((current) => ({ ...current, [packageId]: { ...emptySellRow } }));
    setEditingSaleId(null);
    setSellingId(packageId);
  };

  const closeSale = (packageId: string) => {
    setSellRows((current) => ({ ...current, [packageId]: { ...emptySellRow } }));
    setEditingSaleId(null);
    setSellingId(null);
  };

  const editSale = (sale: any) => {
    setSellRows((current) => ({ ...current, [sale.packageId]: {
      buyerFirmId: String(sale.buyerFirmId || ''), quantity: Number(sale.quantity || 1),
      unitPrice: String(sale.unitPrice || ''), exchangeRate: String(sale.transaction?.exchangeRate || ''),
      discountAmount: String(sale.discountAmount || 0), saleNote: String(sale.saleNote || sale.notes || ''),
    } }));
    setEditingSaleId(sale.id);
    setSellingId(sale.packageId);
  };

  const sellPackage = async (pkg: TourPackage) => {
    const row = sellRows[pkg.id] || emptySellRow;
    if (!row.buyerFirmId) {
      toast.error(tr('Select buyer firm', 'Xaridor firmani tanlang'));
      return;
    }
    const currency = String(pkg.currency || 'UZS').trim().toUpperCase();
    const editingSale = editingSaleId ? sales.find((sale) => sale.id === editingSaleId) : null;
    const maxQuantity = pkg.availableQuantity + Number(editingSale?.quantity || 0);
    if (!Number.isInteger(Number(row.quantity)) || Number(row.quantity) < 1 || Number(row.quantity) > maxQuantity) {
      toast.error(tr('Enter a valid quantity within the available stock', 'Mavjud qoldiq doirasida to‘g‘ri son kiriting'));
      return;
    }
    if (row.unitPrice && Number(row.unitPrice) <= 0) {
      toast.error(tr('Sale price must be greater than zero', 'Sotuv narxi noldan katta bo‘lishi kerak'));
      return;
    }
    if (currency !== 'UZS' && Number(row.exchangeRate) <= 0) {
      toast.error(tr('Enter a valid exchange rate', 'To‘g‘ri valyuta kursini kiriting'));
      return;
    }
    const grossAmount = Number(row.quantity) * Number(row.unitPrice || pkg.unitPrice);
    const discountAmount = Number(row.discountAmount || 0);
    if (!Number.isFinite(discountAmount)) {
      toast.error(tr('Enter a valid discount amount', 'Chegirma summasini to‘g‘ri kiriting'));
      return;
    }
    const saleNote = row.saleNote.trim();
    if (saleNote.length < 3 || saleNote.length > 1000) {
      toast.error(tr('A 3–1000 character sale note is required', 'Tur sotuviga 3–1000 belgili izoh yozish majburiy.'));
      return;
    }
    const fullDiscount = grossAmount > 0 && discountAmount === grossAmount;
    if (fullDiscount && !window.confirm(tr('The final amount is 0. Continue with a free/100% discount sale?', 'Ushbu sotuvning yakuniy summasi 0. Operatsiyani bepul/100% chegirma bilan davom ettirmoqchimisiz?'))) return;
    try {
      setBusyId(pkg.id);
      const payload: any = {
        buyerFirmId: row.buyerFirmId,
        quantity: row.quantity,
        unitPrice: row.unitPrice || undefined,
        exchangeRate: currency !== 'UZS' ? row.exchangeRate.trim() : undefined,
        discountAmount,
        saleNote,
        confirmFullDiscount: fullDiscount,
      };
      if (editingSale) {
        const reason = window.prompt(tr('Why is this sale being corrected?', 'Sotuv nima sababdan tahrirlanmoqda?'))?.trim();
        if (!reason) return;
        payload.reason = reason;
        await api.patch(`/tour-packages/sales/${editingSale.id}`, payload);
        toast.success(tr('Tour sale updated', 'Tur sotuv tahrirlandi'));
      } else {
        await api.post(`/tour-packages/${pkg.id}/sell`, payload);
        toast.success(tr('Tour package sold', 'Tur paket sotildi'));
      }
      setSellRows((current) => ({ ...current, [pkg.id]: { ...emptySellRow } }));
      setEditingSaleId(null);
      setSellingId(null);
      await loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || tr('Failed to sell tour package', 'Tur paketni sotib bo\'lmadi'));
    } finally {
      setBusyId(null);
    }
  };

  const deleteSale = async (sale: any) => {
    const reason = window.prompt(tr('Why should this sale be deleted?', 'Sotuv nima sababdan o‘chirilmoqda?'))?.trim();
    if (!reason || !window.confirm(tr('Delete this sold tour and restore its inventory?', 'Sotilgan turni o‘chirib, inventarni qaytarasizmi?'))) return;
    try {
      setBusyId(`delete-sale-${sale.id}`);
      await api.delete(`/tour-packages/sales/${sale.id}`, { data: { reason } });
      toast.success(tr('Tour sale deleted', 'Tur sotuv o‘chirildi'));
      await loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || tr('Failed to delete tour sale', 'Tur sotuvini o‘chirib bo‘lmadi'));
    } finally {
      setBusyId(null);
    }
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return '-';
    return new Date(value).toLocaleString();
  };
  const flightLabel = (flight?: FlightOption | null, fallbackId?: string | null) => {
    if (flight) return formatFlightDisplayName(flight);
    if (fallbackId && flightNameById.has(fallbackId)) return flightNameById.get(fallbackId) || formatFlightDisplayName({ id: fallbackId });
    return fallbackId ? formatFlightDisplayName({ id: fallbackId }) : '-';
  };

  const buyerOptionsFor = (pkg: TourPackage) => firms.filter((f) => f.id !== pkg.ownerFirmId);
  const sellingPackage = packages.find((pkg) => pkg.id === sellingId) || null;
  const serviceDraftValid = Boolean(
    serviceRow.name.trim()
    && serviceRow.providerName.trim()
    && Number.isInteger(Number(serviceRow.quantity))
    && Number(serviceRow.quantity) > 0
    && Number(serviceRow.unitPrice) > 0
    && /^[A-Z]{3}$/.test(String(serviceRow.currency || '').trim().toUpperCase())
  );
  const selectedCreateFlight = flights.find((flight) => flight.id === createRow.flightId);
  const createAvailableUnits = createRow.ticketProductType === 'ROUND_TRIP'
    ? Number(selectedCreateFlight?.availableRoundTripCount || 0)
    : createRow.ticketDirection === 'RETURN'
      ? Number(selectedCreateFlight?.availableReturnCount || 0)
      : Number(selectedCreateFlight?.availableOutboundCount || 0);
  const createRequiredUnits = Number(createRow.quantity || 0) * Number(createRow.ticketsPerTour || 0);
  const selectedServicesValid = selectedServices.every((row, index) => {
    const service = selectedService(row.serviceId);
    if (!service || !Number.isInteger(Number(row.quantityPerTour)) || Number(row.quantityPerTour) < 1) return false;
    if (selectedServices.some((other, otherIndex) => otherIndex !== index && other.serviceId === row.serviceId)) return false;
    if (String(service.currency).toUpperCase() !== String(createRow.currency).toUpperCase() && Number(row.exchangeRate) <= 0) return false;
    return Boolean(editingId) || Number(createRow.quantity) * Number(row.quantityPerTour) <= service.availableQuantity;
  });
  const ticketNeedsRate = Boolean(selectedCreateFlight?.currency && selectedCreateFlight.currency !== createRow.currency);
  const tourDraftValid = Boolean(
    createRow.ownerFirmId
    && createRow.flightId
    && createRow.name.trim()
    && createRow.destination.trim()
    && Number.isInteger(Number(createRow.quantity))
    && Number(createRow.quantity) > 0
    && Number.isInteger(Number(createRow.ticketsPerTour))
    && Number(createRow.ticketsPerTour) > 0
    && (Boolean(editingId) || createRequiredUnits <= createAvailableUnits)
    && (!ticketNeedsRate || Number(createRow.ticketExchangeRate) > 0)
    && selectedServicesValid
  );

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
            onClick={() => {
              setServiceRow((current) => ({ ...current, flightId: current.flightId || createRow.flightId }));
              setIsAddingService((value) => !value);
            }}
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
        <div className="operation-form form-grid">
          <div className="form-heading"><div><h3 className="form-heading__title">{tr('Add service inventory', 'Xizmat inventarini qo‘shish')}</h3><p className="form-heading__description">{tr('Record the service once, then connect it to one or more tour packages.', 'Xizmatni bir marta qayd eting, so‘ng uni bir yoki bir nechta tur paketiga bog‘lang.')}</p></div></div>
          <label className="form-field--wide"><span className="compact-label">{tr('Service name', 'Xizmat nomi')}</span><input className="compact-control" placeholder={tr('For example: Visa support', 'Masalan: Viza xizmati')} value={serviceRow.name} onChange={(e) => setServiceRow({ ...serviceRow, name: e.target.value })} required /></label>
          <label className="form-field--wide"><span className="compact-label">{tr('Provider firm', 'Ta’minotchi firma')}</span><select className="compact-control" value={serviceRow.providerFirmId} onChange={(e) => {
            const providerFirmId = e.target.value;
            setServiceRow({ ...serviceRow, providerFirmId, providerName: firms.find((firm) => firm.id === providerFirmId)?.name || '' });
          }}>
            <option value="">{tr('Custom provider', 'Boshqa ta’minotchi')}</option>
            {firms.filter((firm) => firm.id !== ownFirmId).map((firm) => <option key={firm.id} value={firm.id}>{firm.name}</option>)}
          </select></label>
          <label className="form-field--wide"><span className="compact-label">{tr('Provider name', 'Xizmat ko‘rsatuvchi nomi')}</span><input className="compact-control" placeholder={tr('Full provider name', 'Ta’minotchining to‘liq nomi')} value={serviceRow.providerName} onChange={(e) => setServiceRow({ ...serviceRow, providerName: e.target.value, providerFirmId: '' })} required /></label>
          <label className="form-field--wide"><span className="compact-label">{tr('Related flight', 'Bog‘langan reys')}</span><select className="compact-control" value={serviceRow.flightId} onChange={(e) => setServiceRow({ ...serviceRow, flightId: e.target.value })}>
            <option value="">{tr('No flight', 'Reyssiz')}</option>
            {flights.map((flight) => <option key={flight.id} value={flight.id}>{flight.flightNumber} · {flight.route}</option>)}
          </select></label>
          <label className="form-field--compact"><span className="compact-label">{tr('Quantity', 'Soni')}</span><input className="compact-control text-right" type="number" min="1" value={serviceRow.quantity} onChange={(e) => setServiceRow({ ...serviceRow, quantity: e.target.value })} required /></label>
          <label className="form-field--compact"><span className="compact-label">{tr('Unit price', 'Bir dona narxi')}</span><input className="compact-control text-right" type="number" min="0.01" step="0.01" placeholder="0.00" value={serviceRow.unitPrice} onChange={(e) => setServiceRow({ ...serviceRow, unitPrice: e.target.value })} required /></label>
          <label className="form-field--compact"><span className="compact-label">{tr('Currency', 'Valyuta')}</span><select className="compact-control" value={serviceRow.currency} onChange={(e) => setServiceRow({ ...serviceRow, currency: e.target.value })}><option>UZS</option><option>USD</option></select></label>
          {serviceRow.currency === 'USD' && <label className="form-field--compact"><span className="compact-label">{tr('Firm rate', 'Firma kursi')}</span><input className="compact-control text-right" inputMode="decimal" placeholder={tr('Optional', 'Ixtiyoriy')} value={serviceRow.exchangeRate} onChange={(e) => setServiceRow({ ...serviceRow, exchangeRate: e.target.value })} /></label>}
          <label className="form-field--compact"><span className="compact-label">{tr('Payment status', 'To‘lov holati')}</span><select className="compact-control" value={serviceRow.paymentStatus} onChange={(e) => setServiceRow({ ...serviceRow, paymentStatus: e.target.value })}>
            <option value="DEBT">{tr('Debt', 'Qarz')}</option><option value="PAID">{tr('Paid', 'To‘langan')}</option>
          </select></label>
          <label className="form-field--full"><span className="compact-label">{tr('Notes and service details', 'Izoh va xizmat tafsilotlari')}</span><textarea className="compact-control" rows={4} placeholder={tr('Add conditions or other useful information…', 'Shartlar yoki boshqa kerakli tafsilotlarni kiriting…')} value={serviceRow.description} onChange={(e) => setServiceRow({ ...serviceRow, description: e.target.value })} /></label>
          <ActionButtons
            cancelLabel={tr('Cancel', 'Bekor qilish')}
            confirmLabel={tr('Record service', 'Xizmatni qayd etish')}
            busyLabel={tr('Saving...', 'Saqlanmoqda...')}
            busy={busyId === 'service'}
            canConfirm={serviceDraftValid}
            onCancel={() => { setServiceRow(emptyServiceRow); setIsAddingService(false); }}
            onConfirm={createService}
          />
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
        <div className="operation-form">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">{editingId ? tr('Edit tour package', 'Tur paketini tahrirlash') : tr('New tour package', 'Yangi tur paket')}</h3>
            <button type="button" onClick={() => { setIsCreating(false); setEditingId(null); setSelectedServices([]); }} className="px-3 py-2 bg-surface border border-border rounded-lg text-xs font-semibold uppercase">
              {tr('Cancel', 'Bekor qilish')}
            </button>
          </div>

          <div className="form-grid">
            <label className="form-field--wide">
              <span className="compact-label">{tr('Tour', 'Tur')}</span>
              <input className="compact-control" value={createRow.name} onChange={(e) => setCreateRow({ ...createRow, name: e.target.value })} placeholder={tr('Tour name', 'Tur nomi')} />
            </label>

            <label className="form-field--wide">
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

            <label>
              <span className="compact-label">{tr('Ticket product', 'Bilet mahsuloti')}</span>
              <select className="compact-control" value={createRow.ticketProductType} onChange={(e) => setCreateRow({ ...createRow, ticketProductType: e.target.value as 'ROUND_TRIP' | 'ONE_WAY' })}>
                <option value="ROUND_TRIP">RT — borish–kelish</option>
                <option value="ONE_WAY">OW — segment</option>
              </select>
            </label>

            {createRow.ticketProductType === 'ONE_WAY' && <label>
              <span className="compact-label">{tr('Ticket direction', 'Bilet yo‘nalishi')}</span>
              <select className="compact-control" value={createRow.ticketDirection} onChange={(e) => setCreateRow({ ...createRow, ticketDirection: e.target.value as 'OUTBOUND' | 'RETURN' })}>
                <option value="OUTBOUND">OUTBOUND ({flights.find((flight) => flight.id === createRow.flightId)?.availableOutboundCount || 0})</option>
                <option value="RETURN">RETURN ({flights.find((flight) => flight.id === createRow.flightId)?.availableReturnCount || 0})</option>
              </select>
            </label>}

            <label className="form-field--wide">
              <span className="compact-label">{tr('Destination', 'Manzil')}</span>
              <input className="compact-control" value={createRow.destination} onChange={(e) => setCreateRow({ ...createRow, destination: e.target.value })} placeholder={tr('Destination', 'Manzil')} />
            </label>

            <label className="form-field--compact">
              <span className="compact-label">{tr('Tour quantity', 'Tur soni')}</span>
              <input type="number" min="1" className="compact-control text-right" value={createRow.quantity} onChange={(e) => setCreateRow({ ...createRow, quantity: Number(e.target.value) })} />
            </label>

            <label className="form-field--compact">
              <span className="compact-label">{tr('Tickets per tour', 'Har bir turga bilet')}</span>
              <input type="number" min="1" className="compact-control text-right" value={createRow.ticketsPerTour} onChange={(e) => setCreateRow({ ...createRow, ticketsPerTour: Number(e.target.value) })} />
            </label>

            <label className="form-field--compact">
              <span className="compact-label">{tr('Currency', 'Valyuta')}</span>
              <select className="compact-control" value={createRow.currency} onChange={(e) => setCreateRow({ ...createRow, currency: e.target.value })}>
                <option value="UZS">UZS</option>
                <option value="USD">USD</option>
              </select>
            </label>
            {flights.find((flight) => flight.id === createRow.flightId)?.currency && flights.find((flight) => flight.id === createRow.flightId)?.currency !== createRow.currency && (
              <label><span className="compact-label">{tr('Ticket currency rate', 'Bilet valyuta kursi')}</span><input inputMode="decimal" className="compact-control text-right" value={createRow.ticketExchangeRate} onChange={(e) => setCreateRow({ ...createRow, ticketExchangeRate: e.target.value })} placeholder="1 USD = ... UZS" /></label>
            )}
            <label className="form-field--full"><span className="compact-label">{tr('Notes and tour details', 'Izoh va tur tafsilotlari')}</span><textarea className="compact-control" rows={4} placeholder={tr('Add hotel, passenger, transfer or other package details…', 'Mehmonxona, yo‘lovchi, transfer yoki boshqa paket tafsilotlarini kiriting…')} value={createRow.notes} onChange={(e) => setCreateRow({ ...createRow, notes: e.target.value })} /></label>
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
                return <div key={index} className="form-grid form-subsection">
                  <label className="form-field--wide"><span className="compact-label">{tr('Select service', 'Xizmatni tanlash')}</span><select className="compact-control" value={row.serviceId} onChange={(e) => updateServiceSelection(index, { serviceId: e.target.value })}><option value="">{tr('Choose...', 'Tanlang...')}</option>{services.filter((item) => !item.flightId || item.flightId === createRow.flightId).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.providerFirm?.name || item.providerName || '-'} · {item.availableQuantity} ta</option>)}</select>{duplicate && <span className="text-xs text-danger">{tr('Already added', 'Ushbu xizmat tur paketiga allaqachon qo‘shilgan.')}</span>}</label>
                  <label className="form-field--compact"><span className="compact-label">{tr('Per tour', 'Har bir turga')}</span><input type="number" min="1" className="compact-control text-right" value={row.quantityPerTour} onChange={(e) => updateServiceSelection(index, { quantityPerTour: Number(e.target.value) })} /></label>
                  <div className="form-field form-field--compact"><span className="compact-label">{tr('Available', 'Mavjud')}</span><div className="form-readout">{service?.availableQuantity ?? '-'}</div></div>
                  <div className="form-field form-field--compact"><span className="compact-label">{tr('Unit cost', 'Bir dona tannarx')}</span><div className="form-readout">{service ? `${Number(service.unitPrice).toFixed(2)} ${service.currency}` : '-'}</div></div>
                  <div className="form-field form-field--compact"><span className="compact-label">{tr('Required', 'Kerak bo‘ladi')}</span><div className={`form-readout ${service && required > service.availableQuantity ? 'text-danger' : ''}`}>{required}</div></div>
                  {needsRate ? <label><span className="compact-label">{tr('Currency rate', 'Valyuta kursi')}</span><input inputMode="decimal" className="compact-control text-right" value={row.exchangeRate} onChange={(e) => updateServiceSelection(index, { exchangeRate: e.target.value })} placeholder="1 USD = ... UZS" /></label> : <div className="form-field"><span className="compact-label">{tr('Total', 'Jami')}</span><div className="form-readout">{(serviceRowCost(row) * Number(createRow.quantity || 0)).toFixed(2)} {createRow.currency}</div></div>}
                  <button type="button" title={tr('Remove', 'Olib tashlash')} onClick={() => setSelectedServices((rows) => rows.filter((_, rowIndex) => rowIndex !== index))} className="form-row-remove rounded-lg border border-danger/40 p-2 text-danger"><X size={17} /></button>
                  {needsRate && <div className="form-preview">{tr('Service total', 'Xizmat jami')}: {(serviceRowCost(row) * Number(createRow.quantity || 0)).toFixed(2)} {createRow.currency}</div>}
                </div>;
              })}
              {!selectedServices.length && <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted">{tr('No services selected. Add one if this tour includes purchased services.', 'Xizmat tanlanmagan. Turda oldindan olingan xizmat bo‘lsa, qo‘shing.')}</p>}
            </div>
          </div>
          <ActionButtons
            className="mt-4"
            cancelLabel={tr('Cancel', 'Bekor qilish')}
            confirmLabel={editingId ? tr('Confirm changes', 'O‘zgarishlarni tasdiqlash') : tr('Create', 'Yaratish')}
            busyLabel={tr('Saving...', 'Saqlanmoqda...')}
            busy={busyId === 'create'}
            canConfirm={tourDraftValid}
            onCancel={() => { setIsCreating(false); setEditingId(null); setCreateRow(emptyCreateRow); setSelectedServices([]); }}
            onConfirm={createPackage}
          />
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
                      <button type="button" onClick={() => openSale(pkg.id)} disabled={pkg.availableQuantity < 1} className="action-button action-button--primary disabled:opacity-50">
                        {tr('Sell', 'Sotish')}
                      </button>
                    ) : (
                      <span className="text-muted">{tr('Only owner can sell', 'Faqat egasi sotadi')}</span>
                    )}
                  </td>
                  <td><div className="flex min-w-56 gap-2">
                    <button type="button" aria-label={tr('Details', 'Tafsilotlar')} title={tr('Details', 'Tafsilotlar')} onClick={() => setDetailId(detailId === pkg.id ? null : pkg.id)} className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-surface hover:border-primary hover:text-primary"><Eye size={17} /></button>
                    <button type="button" aria-label={tr('History', 'Tarix')} title={tr('History', 'Tarix')} onClick={() => viewHistory(pkg)} className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-surface hover:border-primary hover:text-primary"><History size={17} /></button>
                    <button type="button" aria-label={tr('Report', 'Hisobot')} title={tr('Report', 'Hisobot')} onClick={() => { window.location.href = '/reports'; }} className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-surface hover:border-primary hover:text-primary"><BarChart3 size={17} /></button>
                    {canCorrectTours && (role === 'SUPERADMIN' || pkg.ownerFirmId === ownFirmId) && !pkg.deletedAt && <button type="button" aria-label={tr('Edit', 'Tahrirlash')} title={tr('Edit', 'Tahrirlash')} onClick={() => startEdit(pkg)} className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-surface hover:border-primary hover:text-primary"><Pencil size={17} /></button>}
                    {canCorrectTours && (role === 'SUPERADMIN' || pkg.ownerFirmId === ownFirmId) && pkg.status !== 'CANCELLED' && <button type="button" aria-label={tr('Cancel', 'Bekor qilish')} title={tr('Cancel', 'Bekor qilish')} onClick={() => cancelPackage(pkg)} disabled={busyId === `cancel-${pkg.id}`} className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-danger/40 bg-surface text-danger disabled:opacity-50"><Trash2 size={17} /></button>}
                  </div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sellingPackage && (() => {
        const sellRow = sellRows[sellingPackage.id] || emptySellRow;
        const editingSale = editingSaleId ? sales.find((sale) => sale.id === editingSaleId) : null;
        const maxQuantity = sellingPackage.availableQuantity + Number(editingSale?.quantity || 0);
        const needsRate = String(sellingPackage.currency || 'UZS').trim().toUpperCase() !== 'UZS';
        const grossAmount = Number(sellRow.quantity || 0) * Number(sellRow.unitPrice || sellingPackage.unitPrice || 0);
        const discountAmount = Number(sellRow.discountAmount || 0);
        const netAmount = Math.max(grossAmount - (Number.isFinite(discountAmount) ? discountAmount : 0), 0);
        const rate = needsRate ? Number(sellRow.exchangeRate || 0) : 1;
        return <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          onMouseDown={(event) => { if (event.target === event.currentTarget) closeSale(sellingPackage.id); }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="tour-sale-title" className="operation-form max-h-[90vh] w-full max-w-3xl overflow-y-auto shadow-2xl">
            <div className="form-heading mb-4">
              <div>
                <h3 id="tour-sale-title" className="form-heading__title">{editingSale ? tr('Edit sold tour', 'Sotilgan turni tahrirlash') : tr('Sell tour package', 'Tur paketini sotish')}</h3>
                <p className="form-heading__description">{sellingPackage.name} · {maxQuantity} {tr('available for this operation', 'bu amal uchun mavjud')} · {sellingPackage.currency}</p>
              </div>
              <button type="button" onClick={() => closeSale(sellingPackage.id)} aria-label={tr('Close', 'Yopish')} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted hover:text-foreground"><X size={20} /></button>
            </div>
            <div className="form-grid">
              <label className="form-field--wide"><span className="compact-label">{tr('Buyer firm', 'Xaridor firma')}</span><select className="compact-control" value={sellRow.buyerFirmId} onChange={(e) => updateSellRow(sellingPackage.id, { buyerFirmId: e.target.value })}>
                <option value="">{tr('Select buyer firm', 'Xaridor firmani tanlang')}</option>
                {buyerOptionsFor(sellingPackage).map((firm) => <option key={firm.id} value={firm.id}>{firm.name}</option>)}
              </select></label>
              <label className="form-field--compact"><span className="compact-label">{tr('Quantity', 'Soni')}</span><input type="number" min="1" max={maxQuantity} className="compact-control text-right" value={sellRow.quantity} onChange={(e) => updateSellRow(sellingPackage.id, { quantity: Number(e.target.value) })} /></label>
              <label className="form-field--compact"><span className="compact-label">{tr('Unit price', 'Bir dona narxi')}</span><input type="number" min="0.01" step="0.01" className="compact-control text-right" placeholder={String(sellingPackage.unitPrice)} value={sellRow.unitPrice} onChange={(e) => updateSellRow(sellingPackage.id, { unitPrice: e.target.value })} /></label>
              {needsRate && <label className="form-field--compact"><span className="compact-label">{tr('Rate to UZS', 'UZS kursi')}</span><input type="number" inputMode="decimal" min="0.000001" step="any" className="compact-control text-right" placeholder="0.00" value={sellRow.exchangeRate} onChange={(e) => updateSellRow(sellingPackage.id, { exchangeRate: e.target.value })} /></label>}
              <label className="form-field--compact"><span className="compact-label">{tr('Discount amount (- increases price)', 'Chegirma summasi (minus narxni oshiradi)')} ({sellingPackage.currency})</span><input type="number" step="0.01" className="compact-control text-right" value={sellRow.discountAmount} onChange={(e) => updateSellRow(sellingPackage.id, { discountAmount: e.target.value })} /></label>
              <label className="form-field--full"><span className="compact-label">{tr('Note / discount reason', 'Izoh / chegirma sababi')}</span><textarea rows={3} minLength={3} maxLength={1000} className="compact-control" value={sellRow.saleNote} onChange={(e) => updateSellRow(sellingPackage.id, { saleNote: e.target.value })} /></label>
              <div className="form-preview space-y-1">
                <div className="font-bold">{tr('Sale summary', 'Sotuv xulosasi')}</div>
                <div>{tr('Tour', 'Tur')}: {sellingPackage.name} · {formatFlightDisplayName(sellingPackage.flight)}</div>
                <div>{tr('Buyer', 'Xaridor')}: {firms.find((firm) => firm.id === sellRow.buyerFirmId)?.name || tr('not selected', 'tanlanmagan')}</div>
                <div>{tr('Quantity', 'Miqdor')}: {sellRow.quantity} ta · {tr('Unit price', 'Bir dona narxi')}: {Number(sellRow.unitPrice || sellingPackage.unitPrice || 0).toLocaleString()} {sellingPackage.currency}</div>
                <div>{tr('Gross amount', 'Brutto summa')}: {formatNumber(grossAmount)} {sellingPackage.currency}</div>
                <div>{tr('Discount', 'Chegirma')}: {formatNumber(Number.isFinite(discountAmount) ? discountAmount : 0)} {sellingPackage.currency}</div>
                <div className="font-bold">{tr('Final amount', 'Yakuniy summa')}: {formatNumber(netAmount)} {sellingPackage.currency}</div>
                {needsRate && rate > 0 && <div>{tr('Final UZS', 'Yakuniy UZS')}: {formatNumber(netAmount * rate)} UZS</div>}
                {grossAmount > 0 && netAmount === 0 && <div className="mt-2 rounded border border-yellow-600/50 bg-yellow-600/10 p-2 font-semibold text-yellow-500">{tr('100% discount: extra confirmation will be required.', '100% chegirma: qo‘shimcha tasdiq talab qilinadi.')}</div>}
              </div>
              <ActionButtons
                cancelLabel={tr('Cancel', 'Bekor qilish')}
                confirmLabel={editingSale ? tr('Save changes', 'O‘zgarishni saqlash') : tr('Sell', 'Sotish')}
                busyLabel={editingSale ? tr('Saving...', 'Saqlanmoqda...') : tr('Selling...', 'Sotilmoqda...')}
                busy={busyId === sellingPackage.id}
                canConfirm={Boolean(
                  sellRow.buyerFirmId
                  && Number.isInteger(Number(sellRow.quantity))
                  && Number(sellRow.quantity) > 0
                  && Number(sellRow.quantity) <= maxQuantity
                  && (!sellRow.unitPrice || Number(sellRow.unitPrice) > 0)
                  && (!needsRate || Number(sellRow.exchangeRate) > 0)
                  && Number.isFinite(discountAmount)
                  && discountAmount >= 0
                  && discountAmount <= grossAmount
                  && sellRow.saleNote.trim().length >= 3
                  && sellRow.saleNote.trim().length <= 1000
                )}
                onCancel={() => closeSale(sellingPackage.id)}
                onConfirm={() => sellPackage(sellingPackage)}
              />
            </div>
          </section>
        </div>;
      })()}

      {detailId && (() => {
        const pkg = packages.find((item) => item.id === detailId);
        if (!pkg) return null;
        return <div className="glass-panel p-4">
          <div className="mb-4 flex items-start justify-between"><div><h3 className="text-xl font-bold">{pkg.name}</h3><p className="text-sm text-muted">{flightLabel(pkg.flight, pkg.flightId)} · {pkg.destination}</p></div><button type="button" onClick={() => setDetailId(null)}><X /></button></div>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div><span className="compact-label">{tr('Total quantity', 'Jami soni')}</span><strong>{formatNumber(pkg.quantity)}</strong></div><div><span className="compact-label">{tr('Sold', 'Sotilgan')}</span><strong>{formatNumber(pkg.soldQuantity || 0)}</strong></div><div><span className="compact-label">{tr('Available', 'Qolgan')}</span><strong>{formatNumber(pkg.availableQuantity)}</strong></div><div><span className="compact-label">{tr('Unit cost', 'Bir dona tannarx')}</span><strong>{formatNumber(pkg.unitPrice, 2)} {pkg.currency}</strong></div><div><span className="compact-label">{tr('Total cost', 'Jami tannarx')}</span><strong>{formatNumber(pkg.totalCost || 0, 2)} {pkg.currency}</strong></div>
          </div>
          <div className="overflow-x-auto"><table className="excel-table"><thead><tr><th>{tr('Component', 'Komponent')}</th><th className="text-right">{tr('Per tour', 'Har bir turga')}</th><th className="text-right">{tr('Total reserved', 'Jami band')}</th><th className="text-right">{tr('Unit cost', 'Bir dona tannarx')}</th><th className="text-right">{tr('Cost per tour', 'Bir turga tannarx')}</th><th className="text-right">{tr('Total cost', 'Jami tannarx')}</th></tr></thead><tbody>{(pkg.components || []).map((component) => <tr key={component.id}><td>{component.componentType === 'TICKET' ? tr('Ticket', 'Bilet') : component.service?.name || tr('Service', 'Xizmat')}</td><td className="text-right">{formatNumber(component.quantityPerTour)}</td><td className="text-right">{formatNumber(component.totalReservedQuantity)}</td><td className="text-right">{formatNumber(component.unitCostSnapshot, 2)} {component.originalCurrency}</td><td className="text-right">{formatNumber(component.costPerTourSnapshot, 2)} {component.currencySnapshot}</td><td className="text-right">{formatNumber(component.totalCostSnapshot, 2)} {component.currencySnapshot}</td></tr>)}</tbody></table></div>
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
                <th>{tr('Tour', 'Tur')}</th>
                <th>{tr('Buyer', 'Xaridor')}</th>
                <th className="text-right">{tr('Qty', 'Soni')}</th>
                <th className="text-right">{tr('Unit price', 'Bir dona narxi')}</th>
                <th className="text-right">{tr('Gross', 'Brutto summa')}</th>
                <th className="text-right">{tr('Discount', 'Chegirma')}</th>
                <th className="text-right">{tr('Final', 'Yakuniy summa')}</th>
                <th className="text-right">{tr('Cost', 'Tannarx')}</th>
                <th className="text-right">{tr('Gross profit', 'Yalpi foyda')}</th>
                <th>{tr('Note', 'Izoh')}</th>
                <th>{tr('Seller', 'Sotuvchi')}</th>
                <th>{tr('Kassa', 'Kassa')}</th>
                <th>{tr('Status', 'Holat')}</th>
                <th>{tr('Actions', 'Amallar')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleSales.length === 0 ? (
                <tr><td colSpan={15} className="text-center text-muted">{tr('No tour sales yet.', 'Hali tur sotuvlari yo\'q.')}</td></tr>
              ) : visibleSales.map((sale) => (
                <tr key={sale.id}>
                  <td>{new Date(sale.createdAt).toLocaleString()}</td>
                  <td>{sale.package?.name || '—'}</td>
                  <td>{sale.buyerFirm?.name || '—'}</td>
                  <td className="text-right font-mono">{sale.quantity}</td>
                  <td className="text-right font-mono">{formatNumber(sale.unitPrice || 0, 2)} {sale.currency}</td>
                  <td className="text-right font-mono">{formatNumber(sale.grossAmount || sale.totalAmount || 0, 2)} {sale.currency}</td>
                  <td className="text-right font-mono">{formatNumber(sale.discountAmount || 0, 2)} {sale.currency}</td>
                  <td className="text-right font-mono font-bold">{formatNumber(sale.netAmount ?? sale.totalAmount ?? 0, 2)} {sale.currency}</td>
                  <td className="text-right font-mono">{formatNumber(sale.costOfGoodsSold || 0, 2)} {sale.currency}</td>
                  <td className={`text-right font-mono ${Number(sale.grossProfit || 0) < 0 ? 'text-danger' : 'text-green-500'}`}>{formatNumber(sale.grossProfit || 0, 2)} {sale.currency}</td>
                  <td className="max-w-64 whitespace-normal" title={sale.saleNote || sale.notes || ''}>{String(sale.saleNote || sale.notes || '—').length > 60 ? `${String(sale.saleNote || sale.notes).slice(0, 60)}…` : sale.saleNote || sale.notes || '—'}</td>
                  <td><div>{sale.transaction?.createdBy?.fullName || sale.transaction?.createdBy?.email || '—'}</div><div className="text-xs text-muted">{sale.sellerFirm?.name || '—'}</div></td>
                  <td>{sale.transaction?.kassaDesk ? [sale.transaction.kassaDesk.code, sale.transaction.kassaDesk.name].filter(Boolean).join(' — ') : '—'}</td>
                  <td><span className="rounded border border-border px-2 py-1 text-xs">{Number(sale.discountPercent || 0) === 100 ? tr('100% discount', '100% chegirma') : sale.status}</span></td>
                  <td>{canCorrectTours && (role === 'SUPERADMIN' || sale.sellerFirmId === ownFirmId) ? <div className="flex gap-2">
                    <button type="button" aria-label={tr('Edit', 'Tahrirlash')} title={tr('Edit', 'Tahrirlash')} onClick={() => editSale(sale)} className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-surface hover:border-primary hover:text-primary"><Pencil size={17} /></button>
                    <button type="button" aria-label={tr('Delete', 'O‘chirish')} title={tr('Delete', 'O‘chirish')} onClick={() => deleteSale(sale)} disabled={busyId === `delete-sale-${sale.id}`} className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-danger/40 bg-surface text-danger disabled:opacity-50"><Trash2 size={17} /></button>
                  </div> : <span className="text-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
