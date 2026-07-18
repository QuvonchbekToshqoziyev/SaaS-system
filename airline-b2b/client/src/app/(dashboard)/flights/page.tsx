"use client";

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Plane, Plus, Edit, Trash2, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiErrorMessage, isCancelledFlight, type AirlineOption, type LocalFlight } from '@/features/flights/model';
import ActionButtons from '@/components/ui/ActionButtons';

type FlightFormData = {
  flightNumber: string; route: string; airlineMode: string; airlineId: string; airlineName: string; airlineCode: string;
  tripType: 'ROUND_TRIP' | 'ONE_WAY';
  outboundOrigin: string; outboundDestination: string; returnOrigin: string; returnDestination: string;
  departure: string; arrival: string; returnDeparture: string; returnArrival: string;
  ticketCount: number; ticketPrice: number; outboundCost: number; returnCost: number; currency: string;
};

type FlightPayload = {
  flightNumber: string; route?: string; airlineId?: string; airlineName?: string; airlineCode?: string;
  tripType: 'ROUND_TRIP' | 'ONE_WAY'; outboundOrigin: string; outboundDestination: string;
  returnOrigin?: string; returnDestination?: string; departure: string; arrival: string;
  returnDeparture?: string; returnArrival?: string; ticketCount: number; ticketPrice: number;
  outboundCost: number; returnCost?: number; currency: string; baseTotal: number;
};

// Assuming you exported from shared/types.ts earlier so let's import directly.
// Actually, let's keep the internal type map for a moment, or use the global one.
// Let's rely on internal one to avoid too many file replaces since we symlinked. Or I will just make it use useQuery.

export default function FlightsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { tr } = useLanguage();
  const role = user?.role?.toUpperCase() || '';
  const firmRole = String(user?.firmRole || 'FIRM_ADMIN').toUpperCase();
  const canCreateFlight = role === 'FIRM' && firmRole !== 'KASSIR';
  const showFlightActions = ['SUPERADMIN', 'ADMIN'].includes(role) || canCreateFlight;
  
  const { data: flights = [], isLoading: loading } = useQuery<LocalFlight[]>({
    queryKey: ['flights', user?.id || user?.email || role],
    queryFn: async () => {
      const res = await api.get('/flights');
      return res.data;
    }
  });
  const { data: listedAirlines = [] } = useQuery<AirlineOption[]>({
    queryKey: ['airlines', 'flight-options', user?.id || user?.email || role],
    queryFn: async () => (await api.get('/airlines')).data,
    enabled: ['FIRM', 'ADMIN', 'SUPERADMIN'].includes(role),
  });

  const [flightsView, setFlightsView] = useState<'boxes' | 'list'>(() => {
    if (typeof window === 'undefined') return 'list';
    try {
      const raw = localStorage.getItem('jetstream-flights-view-v2');
      return raw === 'boxes' ? 'boxes' : 'list';
    } catch {
      return 'list';
    }
  });
  const [confirm, setConfirm] = useState<
    | null
    | {
        kind: 'create';
        payload: FlightPayload;
      }
    | { kind: 'cancel'; id: string; label: string }
  >(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  
  const [isCreatingFlight, setIsCreatingFlight] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [currentFlightId, setCurrentFlightId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FlightFormData>({
    flightNumber: '',
    route: '',
    airlineMode: 'LISTED',
    airlineId: '',
    airlineName: '',
    airlineCode: '',
    tripType: 'ROUND_TRIP',
    outboundOrigin: '',
    outboundDestination: '',
    returnOrigin: '',
    returnDestination: '',
    departure: '',
    arrival: '',
    returnDeparture: '',
    returnArrival: '',
    ticketCount: 10,
    ticketPrice: 500,
    outboundCost: 250,
    returnCost: 250,
    currency: 'UZS'
  });
  const createBaseTotal = Number(formData.ticketCount || 0) * Number(formData.ticketPrice || 0);
  const [filters, setFilters] = useState({ q: '', airlineId: 'ALL', status: 'ACTIVE' });
  const isSuperadmin = role === 'SUPERADMIN';
  const connectedListedAirlines = useMemo(() => listedAirlines.filter((airline) => airline.firmId), [listedAirlines]);
  const editableListedAirlines = useMemo(
    () => (isSuperadmin ? listedAirlines : connectedListedAirlines),
    [connectedListedAirlines, isSuperadmin, listedAirlines]
  );

  const airlineOptions = useMemo(() => {
    const rows = new Map<string, { id: string; name: string }>();
    for (const flight of flights) {
      const airlineId = flight.airline?.id || flight.airlineId || '';
      if (!airlineId) continue;
      rows.set(airlineId, { id: airlineId, name: flight.airline?.name || flight.airline?.code || airlineId });
    }
    return Array.from(rows.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [flights]);

  const visibleFlights = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return flights.filter((flight) => {
      const status = String(flight.status || 'SCHEDULED').toUpperCase();
      const airlineId = flight.airline?.id || flight.airlineId || '';
      const haystack = [
        flight.flightNumber,
        flight.airline?.name,
        flight.airline?.code,
        flight.currency,
        status,
      ].filter(Boolean).join(' ').toLowerCase();
      if (filters.status === 'ACTIVE' && status === 'CANCELLED') return false;
      if (filters.status !== 'ALL' && filters.status !== 'ACTIVE' && status !== filters.status) return false;
      if (filters.airlineId !== 'ALL' && airlineId !== filters.airlineId) return false;
      if (q && !haystack.includes(q)) return false;
      return true;
    });
  }, [filters, flights]);

  useEffect(() => {
    try {
      localStorage.setItem('jetstream-flights-view-v2', flightsView);
    } catch {
      // ignore
    }
  }, [flightsView]);

  const resetCreateForm = () => {
    setModalMode('create');
    setFormData({
      flightNumber: '',
      route: '',
      airlineMode: connectedListedAirlines.length > 0 ? 'LISTED' : 'EXTERNAL',
      airlineId: connectedListedAirlines[0]?.id || '',
      airlineName: '',
      airlineCode: '',
      tripType: 'ROUND_TRIP',
      outboundOrigin: '',
      outboundDestination: '',
      returnOrigin: '',
      returnDestination: '',
      departure: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
      arrival: new Date(Date.now() + 86400000 + 7200000).toISOString().slice(0, 16),
      returnDeparture: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
      returnArrival: new Date(Date.now() + 7 * 86400000 + 7200000).toISOString().slice(0, 16),
      ticketCount: 10,
      ticketPrice: 500,
      outboundCost: 250,
      returnCost: 250,
      currency: 'UZS'
    });
  };

  const validateFlightForm = () => {
    if (!formData.flightNumber.trim()) return tr('Flight Number is required', 'Reys raqami kerak');
    if (!formData.outboundOrigin.trim() || !formData.outboundDestination.trim()) return tr('Outbound route is required', 'Borish yo‘nalishini to‘liq kiriting');
    if (!formData.departure || !formData.arrival) return tr('Outbound times are required', 'Borish vaqtlarini kiriting');
    if (formData.tripType === 'ROUND_TRIP') {
      if (!formData.returnOrigin.trim() || !formData.returnDestination.trim()) return tr('Return route is required', 'Qaytish yo‘nalishini to‘liq kiriting');
      if (!formData.returnDeparture || !formData.returnArrival) return tr('Return times are required', 'Qaytish vaqtlarini kiriting');
      if (Number(formData.outboundCost) + Number(formData.returnCost) !== Number(formData.ticketPrice)) {
        return tr('Outbound + return cost must equal RT total cost', 'Borish + qaytish tannarxi RT jami tannarxiga teng bo‘lishi kerak');
      }
    }
    return '';
  };

  const buildFlightPayload = (): FlightPayload => ({
    flightNumber: formData.flightNumber.trim(),
    route: formData.route.trim() || (formData.tripType === 'ROUND_TRIP'
      ? `${formData.outboundOrigin} → ${formData.outboundDestination} → ${formData.returnDestination}`
      : `${formData.outboundOrigin} → ${formData.outboundDestination}`),
    ...(formData.airlineMode === 'LISTED'
      ? { airlineId: formData.airlineId }
      : { airlineName: formData.airlineName.trim(), airlineCode: formData.airlineCode.trim().toUpperCase() || undefined }),
    tripType: formData.tripType,
    outboundOrigin: formData.outboundOrigin.trim(),
    outboundDestination: formData.outboundDestination.trim(),
    ...(formData.tripType === 'ROUND_TRIP' ? {
      returnOrigin: formData.returnOrigin.trim(), returnDestination: formData.returnDestination.trim(),
      returnDeparture: new Date(formData.returnDeparture).toISOString(), returnArrival: new Date(formData.returnArrival).toISOString(),
    } : {}),
    departure: new Date(formData.departure).toISOString(),
    arrival: new Date(formData.arrival).toISOString(),
    ticketCount: Number(formData.ticketCount),
    ticketPrice: Number(formData.ticketPrice),
    outboundCost: formData.tripType === 'ROUND_TRIP' ? Number(formData.outboundCost) : Number(formData.ticketPrice),
    ...(formData.tripType === 'ROUND_TRIP' ? { returnCost: Number(formData.returnCost) } : {}),
    currency: formData.currency,
    baseTotal: Number(formData.ticketCount) * Number(formData.ticketPrice),
  });

  const openCreateRow = () => {
    resetCreateForm();
    setFlightsView('list');
    setIsCreatingFlight(true);
  };

  const submitCreateRow = () => {
    const validationError = validateFlightForm();
    if (validationError) {
      toast.error(validationError);
      return;
    }
    if (formData.airlineMode === 'LISTED' && !formData.airlineId) {
      toast.error(tr('Select a connected airline or use external airline', 'Ulangan aviakompaniyani tanlang yoki tashqi aviakompaniya kiriting'));
      return;
    }
    if (formData.airlineMode === 'EXTERNAL' && !formData.airlineName.trim()) {
      toast.error(tr('External airline name is required', 'Tashqi aviakompaniya nomi kerak'));
      return;
    }
    setConfirm({
      kind: 'create',
      payload: buildFlightPayload(),
    });
  };

  const openEditModal = (e: React.MouseEvent, flight: LocalFlight) => {
    e.preventDefault();
    e.stopPropagation();
    const flightId = flight.id ?? flight.flight_id;
    if (!flightId) {
      toast.error(tr('Invalid flight id', 'Reys ID xato'));
      return;
    }
    setModalMode('edit');
    setCurrentFlightId(flightId);
    setFormData({
      flightNumber: flight.flightNumber || '',
      route: flight.route || '',
      airlineMode: flight.airline?.id ? 'LISTED' : 'EXTERNAL',
      airlineId: flight.airline?.id || '',
      airlineName: flight.airline?.name || '',
      airlineCode: flight.airline?.code || '',
      tripType: flight.tripType || 'ONE_WAY',
      outboundOrigin: flight.outboundOrigin || (flight.route || '').split(/→|->/)[0]?.trim() || '',
      outboundDestination: flight.outboundDestination || (flight.route || '').split(/→|->/)[1]?.trim() || '',
      returnOrigin: flight.returnOrigin || flight.outboundDestination || '',
      returnDestination: flight.returnDestination || flight.outboundOrigin || '',
      departure: new Date(flight.departure).toISOString().slice(0, 16),
      arrival: new Date(flight.arrival).toISOString().slice(0, 16),
      returnDeparture: flight.returnDeparture ? new Date(flight.returnDeparture).toISOString().slice(0, 16) : '',
      returnArrival: flight.returnArrival ? new Date(flight.returnArrival).toISOString().slice(0, 16) : '',
      ticketCount: flight.ticketCount || 10,
      ticketPrice: flight.ticketPrice || 500,
      outboundCost: flight.outboundCost ?? (flight.ticketPrice ? flight.ticketPrice / (flight.tripType === 'ROUND_TRIP' ? 2 : 1) : 0),
      returnCost: flight.returnCost ?? (flight.tripType === 'ROUND_TRIP' && flight.ticketPrice ? flight.ticketPrice / 2 : 0),
      currency: flight.currency || 'UZS'
    });
    setIsModalOpen(true);
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateFlightForm();
    if (validationError) {
      toast.error(validationError);
      return;
    }
    
    try {
      if (modalMode === 'create') {
        const payload = buildFlightPayload();
        setIsModalOpen(false);
        setConfirm({ kind: 'create', payload });
        return;
      } else {
        await api.put(`/flights/${currentFlightId}`, buildFlightPayload());
        toast.success(tr('Flight updated!', 'Reys yangilandi!'));
      }
      setIsModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["flights"] });
    } catch (error: unknown) {
      toast.error(
        getApiErrorMessage(error) ||
          (modalMode === 'create'
            ? tr('Failed to create flight.', 'Reysni yaratib bo\'lmadi.')
            : tr('Failed to update flight.', 'Reysni yangilab bo\'lmadi.'))
      );
    }
  };

  const handleCancelFlight = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const flight = flights.find((f) => (f.id || f.flight_id) === id);
    setConfirm({
      kind: 'cancel',
      id,
      label: flight?.flightNumber || `${tr('Flight', 'Reys')} ${id}`,
    });
  };

  const closeConfirm = () => {
    const prev = confirm;
    setConfirm(null);
    setConfirmBusy(false);

    if (prev?.kind === 'create') {
      setIsCreatingFlight(true);
    }
  };

  const confirmProceed = async () => {
    if (!confirm || confirmBusy) return;
    setConfirmBusy(true);
    try {
      if (confirm.kind === 'create') {
        await api.post('/flights', confirm.payload);
        toast.success(tr('Flight created successfully!', 'Reys muvaffaqiyatli yaratildi!'));
        resetCreateForm();
        setIsCreatingFlight(false);
      } else {
        await api.delete(`/flights/${confirm.id}`);
        toast.success(tr('Flight deleted!', 'Reys o‘chirildi!'));
      }
      setConfirm(null);
      queryClient.invalidateQueries({ queryKey: ["flights"] });
    } catch (error: unknown) {
      if (confirm.kind === 'create') {
        toast.error(getApiErrorMessage(error) || tr('Failed to create flight.', 'Reysni yaratib bo\'lmadi.'));
      } else {
        toast.error(getApiErrorMessage(error) || tr('Failed to delete flight.', 'Reysni o‘chirib bo\'lmadi.'));
      }
      setConfirmBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center text-muted">
        <Plane className="mx-auto h-12 w-12 animate-pulse text-primary" />
        <p className="mt-2">{tr('Loading available flights...', 'Mavjud reyslar yuklanmoqda...')}</p>
      </div>
    );
  }

  const getStatusLabel = (status?: string) => {
    const normalized = String(status || 'SCHEDULED').trim().toUpperCase();
    if (normalized === 'CANCELLED') return tr('CANCELLED', 'BEKOR QILINGAN');
    if (normalized === 'SCHEDULED') return tr('SCHEDULED', 'REJALASHTIRILGAN');
    return normalized;
  };

  const inventoryMetric = (metric?: { count?: number; amounts?: Array<{ currency: string; total: number }> }) => (
    <div>
      <div className="font-bold text-base text-foreground">{Number(metric?.count || 0).toLocaleString()} ta</div>
      {(metric?.amounts || []).map((amount) => (
        <div key={amount.currency} className="text-xs text-muted">{Number(amount.total || 0).toLocaleString()} {amount.currency}</div>
      ))}
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">
            {isSuperadmin ? tr('All Flights', 'Barcha reyslar') : tr('Available Flights', 'Mavjud reyslar')}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {isSuperadmin
              ? tr('Platform-wide flight monitoring, airline filtering, and correction tools.', 'Barcha reyslarni kuzatish, aviakompaniya bo\'yicha filtrlash va tuzatish vositalari.')
              : tr('Flights available for your account.', 'Akkauntingiz uchun mavjud reyslar.')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setFlightsView('list')}
              aria-pressed={flightsView === 'list'}
              className={`px-3 py-2 text-sm font-medium transition ${flightsView === 'list'
                ? 'bg-surface-2 text-foreground'
                : 'bg-surface text-muted hover:bg-surface-2'
              }`}
            >
              {tr('List', "Ro'yxat")}
            </button>
            <button
              type="button"
              onClick={() => setFlightsView('boxes')}
              aria-pressed={flightsView === 'boxes'}
              className={`px-3 py-2 text-sm font-medium transition ${flightsView === 'boxes'
                ? 'bg-surface-2 text-foreground'
                : 'bg-surface text-muted hover:bg-surface-2'
              }`}
            >
              {tr('Boxes', 'Kartalar')}
            </button>
          </div>
          {canCreateFlight && (
            <button
              onClick={openCreateRow}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-ink font-bold uppercase tracking-wider rounded-lg font-medium transition"
            >
              <Plus size={18} />
              {tr('Create Flight', 'Reys yaratish')}
            </button>
          )}
        </div>
      </div>

      <div id="flight-list" className="scroll-mt-24 grid gap-3 rounded-lg border border-border bg-surface-2 p-3 md:grid-cols-[minmax(220px,1fr)_minmax(180px,240px)_minmax(150px,200px)_auto] md:items-end">
        <label className="block">
          <span className="compact-label">{tr('Search', 'Qidirish')}</span>
          <input
            className="compact-control"
            value={filters.q}
            onChange={(e) => setFilters((current) => ({ ...current, q: e.target.value }))}
            placeholder={tr('Flight, airline, status...', 'Reys, aviakompaniya, holat...')}
          />
        </label>
        <label className="block">
          <span className="compact-label">{tr('Airline', 'Aviakompaniya')}</span>
          <select className="compact-control" value={filters.airlineId} onChange={(e) => setFilters((current) => ({ ...current, airlineId: e.target.value }))}>
            <option value="ALL">{tr('All airlines', 'Barcha aviakompaniyalar')}</option>
            {airlineOptions.map((airline) => <option key={airline.id} value={airline.id}>{airline.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="compact-label">{tr('Status', 'Holat')}</span>
          <select className="compact-control" value={filters.status} onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value }))}>
            <option value="ACTIVE">{tr('Active only', 'Faqat aktiv')}</option>
            <option value="ALL">{tr('All statuses', 'Barcha holatlar')}</option>
            <option value="SCHEDULED">{tr('Scheduled', 'Rejalashtirilgan')}</option>
            <option value="CANCELLED">{tr('Cancelled', 'Bekor qilingan')}</option>
          </select>
        </label>
        <div className="text-sm text-muted md:text-right">
          <span className="font-semibold text-foreground">{visibleFlights.length}</span> / {flights.length}
        </div>
      </div>

      {flightsView === 'boxes' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleFlights.map((flight: LocalFlight) => {
            const flightId = flight.flight_id || flight.id;
            if (!flightId) return null;

            return (
              <div
                key={flightId}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/flights/detail?id=${flightId}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    router.push(`/flights/detail?id=${flightId}`);
                  }
                }}
                className="bg-surface-2 border border-border rounded-lg shadow-lg hover:shadow-primary/20 hover:border-primary transition-all duration-300 p-5 group cursor-pointer"
                aria-label={tr('Open flight details', 'Reys tafsilotlarini ochish')}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Plane className="text-primary" size={24} />
                    <p className="text-lg font-bold text-foreground truncate group-hover:text-primary">
                      {flight.flightNumber || `${tr('Flight', 'Reys')} ${flight.flight_id || flight.id}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const cancelled = isCancelledFlight(flight.status);
                      const label = getStatusLabel(flight.status);
                      return (
                        <p
                          className={
                            cancelled
                              ? 'px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-900/50 text-red-300 border border-red-700'
                              : 'px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-900/50 text-green-300 border border-green-700'
                          }
                        >
                          {label}
                        </p>
                      );
                    })()}
                    {(flight.canEdit || flight.canDelete) && (
                      <>
                        {flight.canEdit && <button
                          type="button"
                          onClick={(e) => openEditModal(e, flight)}
                          disabled={isCancelledFlight(flight.status)}
                          className="text-muted hover:text-primary transition disabled:opacity-50 disabled:cursor-not-allowed"
                          title={tr('Edit', 'Tahrirlash')}
                        >
                          <Edit size={16} />
                        </button>}
                        {flight.canDelete && <button
                          type="button"
                          onClick={(e) => {
                            const flightId = flight.id ?? flight.flight_id;
                            if (!flightId) {
                              toast.error(tr('Invalid flight id', 'Reys ID xato'));
                              return;
                            }
                            handleCancelFlight(e, flightId);
                          }}
                          disabled={isCancelledFlight(flight.status)}
                          className="text-muted hover:text-red-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                          title={tr('Delete flight', 'Reysni o‘chirish')}
                        >
                          <Trash2 size={16} />
                        </button>}
                      </>
                    )}
                  </div>
                </div>
                
                <div className="text-sm text-foreground space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-muted">{tr('Airline', 'Aviakompaniya')}:</span>
                    <span className="flex items-center gap-2"><span className="rounded bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">{flight.tripType === 'ROUND_TRIP' ? 'RT' : 'OW'}</span>{flight.airline?.name || '-'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-muted">{tr('Departure', 'Jo\'nab ketish')}:</span>
                    <span>{new Date(flight.departure).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-muted">{tr('Arrival', 'Yetib kelish')}:</span>
                    <span>{new Date(flight.arrival).toLocaleString()}</span>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-border grid grid-cols-3 gap-2 text-center">
                  <div className="text-muted">
                    <p className="mb-1 text-xs">{tr('Total acquired tickets / cost', 'Jami olingan bilet soni / summasi')}</p>
                    {inventoryMetric(flight.inventorySummary?.received)}
                    <p className="mt-1 text-[11px]">OUT {flight.inventorySummary?.rtOw?.originalOutboundLegs || 0} · RETURN {flight.inventorySummary?.rtOw?.originalReturnLegs || 0}</p>
                  </div>
                  <div className="text-muted">
                    <p className="mb-1 text-xs">{tr('Sold / allocated tickets / amount', 'Sotilgan / ajratilgan bilet soni / summasi')}</p>
                    {inventoryMetric(flight.inventorySummary?.soldOrAllocated)}
                    <p className="mt-1 text-[11px]">{tr('Pending', 'Kutilmoqda')}: {flight.inventorySummary?.pendingAllocationCount || 0} · {tr('Direct', 'To‘g‘ridan')}: {flight.inventorySummary?.directSoldTicketCount || 0}</p>
                  </div>
                  <div className="text-muted">
                    <p className="mb-1 text-xs">{tr('Remaining tickets / cost', 'Qolgan bilet soni / summasi')}</p>
                    {inventoryMetric(flight.inventorySummary?.remaining)}
                    <p className="mt-1 text-[11px]">RT {flight.inventorySummary?.rtOw?.availableRoundTripCount || 0} · OUT {flight.inventorySummary?.rtOw?.availableOutboundLegCount || 0} · RETURN {flight.inventorySummary?.rtOw?.availableReturnLegCount || 0}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      router.push(`/transactions?flightId=${encodeURIComponent(flightId)}`);
                    }}
                    className="px-3 py-2 bg-surface hover:bg-surface-2 text-foreground rounded-lg transition border border-border text-sm font-medium"
                  >
                    {tr('Transactions', 'Tranzaksiyalar')}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      router.push(`/reports?flightId=${encodeURIComponent(flightId)}`);
                    }}
                    className="px-3 py-2 bg-surface hover:bg-surface-2 text-foreground rounded-lg transition border border-border text-sm font-medium"
                  >
                    {tr('Reports', 'Hisobotlar')}
                  </button>
                </div>
              </div>
            );
          })}
          {visibleFlights.length === 0 && (
            <div className="col-span-full text-center py-12 bg-surface-2 border border-dashed border-border rounded-lg">
              <Plane className="mx-auto h-12 w-12 text-muted" />
              <h3 className="mt-2 text-lg font-medium text-foreground">{tr('No flights available', 'Reyslar mavjud emas')}</h3>
              <p className="mt-1 text-sm text-muted">
                {tr(
                  'Check back later or contact an administrator to add new flights.',
                  "Keyinroq qayta tekshiring yoki admin bilan bog'lanib yangi reys qo'shing."
                )}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto bg-surface-2 border border-border rounded-lg">
          <table className="excel-table">
            <thead className="bg-surface">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">{tr('Flight', 'Reys')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">{tr('Airline', 'Aviakompaniya')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">{tr('Status', 'Holat')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">{tr('Departure', 'Jo\'nab ketish')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">{tr('Arrival', 'Yetib kelish')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">{tr('Total acquired / cost', 'Jami olingan / summasi')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">{tr('Sold / allocated / amount', 'Sotilgan-ajratilgan / summasi')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">{tr('Remaining / cost', 'Qolgan / summasi')}</th>
                {showFlightActions && (
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">{tr('Actions', 'Amallar')}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {canCreateFlight && isCreatingFlight && (
                <tr className="bg-surface">
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      required
                      className="compact-control min-w-[180px]"
                      placeholder="B2B-999"
                      value={formData.flightNumber}
                      onChange={(e) => setFormData({ ...formData, flightNumber: e.target.value })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex min-w-[320px] items-center gap-2">
                      <select
                        className="compact-control min-w-[150px]"
                        value={formData.airlineMode}
                        onChange={(e) => setFormData({
                          ...formData,
                          airlineMode: e.target.value,
                          airlineId: e.target.value === 'LISTED' ? (connectedListedAirlines[0]?.id || '') : '',
                        })}
                      >
                        <option value="LISTED" disabled={connectedListedAirlines.length === 0}>{tr('Listed', 'Ro\'yxatdagi')}</option>
                        <option value="EXTERNAL">{tr('External', 'Tashqi')}</option>
                      </select>
                      {formData.airlineMode === 'LISTED' ? (
                        <select className="compact-control min-w-[190px]" value={formData.airlineId} onChange={(e) => setFormData({ ...formData, airlineId: e.target.value })}>
                          <option value="">{tr('Connected airline', 'Ulangan aviakompaniya')}</option>
                          {connectedListedAirlines.map((airline) => (
                            <option key={airline.id} value={airline.id}>{airline.name}{airline.code ? ` (${airline.code})` : ''}</option>
                          ))}
                        </select>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input className="compact-control min-w-[180px]" placeholder={tr('Airline name', 'Aviakompaniya nomi')} value={formData.airlineName} onChange={(e) => setFormData({ ...formData, airlineName: e.target.value })} />
                          <input className="compact-control w-24" placeholder={tr('Code', 'Kod')} value={formData.airlineCode} onChange={(e) => setFormData({ ...formData, airlineCode: e.target.value.toUpperCase() })} />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-900/50 text-green-300 border border-green-700">
                      {tr('NEW', 'YANGI')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="datetime-local"
                      required
                      className="compact-control min-w-44"
                      value={formData.departure}
                      onChange={(e) => setFormData({ ...formData, departure: e.target.value })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="datetime-local"
                      required
                      className="compact-control min-w-44"
                      value={formData.arrival}
                      onChange={(e) => setFormData({ ...formData, arrival: e.target.value })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min="1"
                      required
                      className="compact-control min-w-[120px]"
                      title={tr('Ticket count', 'Bilet soni')}
                      value={formData.ticketCount}
                      onChange={(e) => setFormData({ ...formData, ticketCount: Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        required
                        className="compact-control min-w-[140px]"
                        title={tr('Ticket amount', 'Bilet summasi')}
                        value={formData.ticketPrice}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          const outbound = formData.tripType === 'ROUND_TRIP' ? Number((value / 2).toFixed(4)) : value;
                          setFormData({ ...formData, ticketPrice: value, outboundCost: outbound, returnCost: Number((value - outbound).toFixed(4)) });
                        }}
                      />
                      <select
                        className="compact-control min-w-[96px]"
                        value={formData.currency}
                        onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                      >
                        <option value="UZS">UZS</option>
                        <option value="USD">USD</option>
                      </select>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted whitespace-nowrap">
                    <span className="font-semibold text-foreground">{Number.isFinite(createBaseTotal) ? createBaseTotal.toLocaleString() : '0'} {formData.currency}</span>
                    <span className="block text-xs">{tr('Base total', 'Bazaviy jami')}</span>
                    <input
                      className="compact-control mt-2 min-w-[180px]"
                      placeholder={tr('Route', 'Yo\'nalish')}
                      value={formData.route}
                      onChange={(e) => setFormData({ ...formData, route: e.target.value })}
                    />
                    <details className="mt-2 min-w-[360px] rounded-lg border border-border bg-surface-2 p-2 text-left">
                      <summary className="cursor-pointer text-xs font-semibold text-primary">{tr('RT / OW details', 'RT / OW tafsilotlari')}</summary>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <label className="col-span-2">
                          <span className="compact-label">{tr('Ticket type', 'Bilet turi')}</span>
                          <select className="compact-control" value={formData.tripType} onChange={(e) => {
                            const tripType = e.target.value as FlightFormData['tripType'];
                            const outbound = tripType === 'ROUND_TRIP' ? Number((formData.ticketPrice / 2).toFixed(4)) : formData.ticketPrice;
                            setFormData({ ...formData, tripType, outboundCost: outbound, returnCost: tripType === 'ROUND_TRIP' ? Number((formData.ticketPrice - outbound).toFixed(4)) : 0 });
                          }}>
                            <option value="ROUND_TRIP">RT — borish–kelish</option>
                            <option value="ONE_WAY">OW — bir tomon</option>
                          </select>
                        </label>
                        <input className="compact-control" placeholder="TAS" value={formData.outboundOrigin} onChange={(e) => setFormData({ ...formData, outboundOrigin: e.target.value.toUpperCase() })} />
                        <input className="compact-control" placeholder="IST" value={formData.outboundDestination} onChange={(e) => setFormData({ ...formData, outboundDestination: e.target.value.toUpperCase() })} />
                        {formData.tripType === 'ROUND_TRIP' && <>
                          <input className="compact-control" placeholder="IST" value={formData.returnOrigin} onChange={(e) => setFormData({ ...formData, returnOrigin: e.target.value.toUpperCase() })} />
                          <input className="compact-control" placeholder="TAS" value={formData.returnDestination} onChange={(e) => setFormData({ ...formData, returnDestination: e.target.value.toUpperCase() })} />
                          <input type="datetime-local" className="compact-control" value={formData.returnDeparture} onChange={(e) => setFormData({ ...formData, returnDeparture: e.target.value })} />
                          <input type="datetime-local" className="compact-control" value={formData.returnArrival} onChange={(e) => setFormData({ ...formData, returnArrival: e.target.value })} />
                          <input type="number" min="0" className="compact-control" title={tr('Outbound cost', 'Borish tannarxi')} value={formData.outboundCost} onChange={(e) => setFormData({ ...formData, outboundCost: Number(e.target.value) })} />
                          <input type="number" min="0" className="compact-control" title={tr('Return cost', 'Qaytish tannarxi')} value={formData.returnCost} onChange={(e) => setFormData({ ...formData, returnCost: Number(e.target.value) })} />
                        </>}
                      </div>
                    </details>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreatingFlight(false);
                          resetCreateForm();
                        }}
                        className="px-3 py-2 bg-surface-2 hover:bg-surface text-foreground rounded-lg transition border border-border text-xs font-semibold uppercase"
                      >
                        {tr('Cancel', 'Bekor qilish')}
                      </button>
                      <button
                        type="button"
                        onClick={submitCreateRow}
                        disabled={Boolean(validateFlightForm()) || (formData.airlineMode === 'LISTED' ? !formData.airlineId : !formData.airlineName.trim())}
                        className="px-3 py-2 bg-primary hover:bg-primary-hover text-ink rounded-lg transition text-xs font-bold uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {tr('Create', 'Yaratish')}
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {visibleFlights.map((flight: LocalFlight) => {
                const flightId = flight.flight_id || flight.id;
                return (
                  <tr
                    key={flightId}
                    role={flightId ? 'link' : undefined}
                    tabIndex={flightId ? 0 : undefined}
                    onClick={() => flightId && router.push(`/flights/detail?id=${flightId}`)}
                    onKeyDown={(event) => {
                      if (flightId && (event.key === 'Enter' || event.key === ' ')) {
                        event.preventDefault();
                        router.push(`/flights/detail?id=${flightId}`);
                      }
                    }}
                    className={`hover:bg-surface transition ${flightId ? 'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary' : ''}`}
                    aria-label={flightId ? tr('Open flight details', 'Reys tafsilotlarini ochish') : undefined}
                  >
                    <td className="px-4 py-3 text-sm text-foreground font-medium">
                      {flightId ? (
                        <div>
                          <Link href={`/flights/detail?id=${flightId}`} className="hover:text-primary transition">
                            {flight.flightNumber || `Flight ${flightId}`}
                          </Link>
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(event) => { event.stopPropagation(); router.push(`/transactions?flightId=${encodeURIComponent(flightId)}`); }}
                              className="px-2 py-1 bg-surface hover:bg-surface-2 text-foreground rounded-lg transition border border-border text-xs font-medium"
                            >
                              {tr('Transactions', 'Tranzaksiyalar')}
                            </button>
                            <button
                              type="button"
                              onClick={(event) => { event.stopPropagation(); router.push(`/reports?flightId=${encodeURIComponent(flightId)}`); }}
                              className="px-2 py-1 bg-surface hover:bg-surface-2 text-foreground rounded-lg transition border border-border text-xs font-medium"
                            >
                              {tr('Reports', 'Hisobotlar')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span>{flight.flightNumber || tr('Flight', 'Reys')}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted whitespace-nowrap">{flight.airline?.name || '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={
                          isCancelledFlight(flight.status)
                            ? 'px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-900/50 text-red-300 border border-red-700'
                            : 'px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-900/50 text-green-300 border border-green-700'
                        }
                      >
                        {getStatusLabel(flight.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted whitespace-nowrap">{new Date(flight.departure).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-muted whitespace-nowrap">{new Date(flight.arrival).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      {inventoryMetric(flight.inventorySummary?.received)}
                      <span className="text-[11px] text-muted">OUT {flight.inventorySummary?.rtOw?.originalOutboundLegs || 0} · RETURN {flight.inventorySummary?.rtOw?.originalReturnLegs || 0}</span>
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      {inventoryMetric(flight.inventorySummary?.soldOrAllocated)}
                      <span className="text-[11px] text-muted">{tr('Pending', 'Kutilmoqda')} {flight.inventorySummary?.pendingAllocationCount || 0} · {tr('Direct', 'To‘g‘ridan')} {flight.inventorySummary?.directSoldTicketCount || 0}</span>
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      {inventoryMetric(flight.inventorySummary?.remaining)}
                      <span className="text-[11px] text-muted">RT {flight.inventorySummary?.rtOw?.availableRoundTripCount || 0} · OUT {flight.inventorySummary?.rtOw?.availableOutboundLegCount || 0} · RETURN {flight.inventorySummary?.rtOw?.availableReturnLegCount || 0}</span>
                    </td>
                    {showFlightActions && (
                      <td className="px-4 py-3 text-right text-sm">
                        {(flight.canEdit || flight.canDelete) && (
                          <div className="inline-flex items-center gap-3">
                            {flight.canEdit && <button
                              onClick={(e) => openEditModal(e, flight)}
                              disabled={isCancelledFlight(flight.status)}
                              className="text-muted hover:text-primary transition disabled:opacity-50 disabled:cursor-not-allowed"
                              title={tr('Edit', 'Tahrirlash')}
                            >
                              <Edit size={16} />
                            </button>}
                            {flight.canDelete && <button
                              onClick={(e) => {
                                if (!flightId) {
                                  toast.error(tr('Invalid flight id', 'Reys ID xato'));
                                  return;
                                }
                                handleCancelFlight(e, flightId);
                              }}
                              disabled={isCancelledFlight(flight.status)}
                              className="text-muted hover:text-red-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                              title={tr('Delete flight', 'Reysni o‘chirish')}
                            >
                              <Trash2 size={16} />
                            </button>}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {visibleFlights.length === 0 && (
                <tr>
                  <td colSpan={showFlightActions ? 9 : 8} className="px-4 py-10 text-center text-sm text-muted">
                    {tr('No flights available.', 'Reyslar mavjud emas.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-foreground">
                {tr('Edit Flight', 'Reysni tahrirlash')}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-muted hover:text-foreground">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleModalSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-1">{tr('Flight Number', 'Reys raqami')}</label>
                <input
                  type="text"
                  required
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-primary transition"
                  placeholder="e.g. B2B-999"
                  value={formData.flightNumber}
                  onChange={(e) => setFormData({...formData, flightNumber: e.target.value})}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-[160px_1fr]">
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">{tr('Airline type', 'Aviakompaniya turi')}</label>
                  <select
                    className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-primary transition"
                    value={formData.airlineMode}
                    onChange={(e) => setFormData({
                      ...formData,
                      airlineMode: e.target.value,
                      airlineId: e.target.value === 'LISTED' ? (editableListedAirlines[0]?.id || '') : '',
                    })}
                  >
                    <option value="LISTED" disabled={editableListedAirlines.length === 0}>{tr('Listed', 'Ro\'yxatdagi')}</option>
                    <option value="EXTERNAL">{tr('External', 'Tashqi')}</option>
                  </select>
                </div>
                {formData.airlineMode === 'LISTED' ? (
                  <div>
                    <label className="block text-sm font-medium text-muted mb-1">{tr('Airline', 'Aviakompaniya')}</label>
                    <select
                      className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-primary transition"
                      value={formData.airlineId}
                      onChange={(e) => setFormData({...formData, airlineId: e.target.value})}
                    >
                      <option value="">{tr('Select airline', 'Aviakompaniyani tanlang')}</option>
                      {editableListedAirlines.map((airline) => (
                        <option key={airline.id} value={airline.id}>{airline.name}{airline.code ? ` (${airline.code})` : ''}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-[1fr_120px]">
                    <div>
                      <label className="block text-sm font-medium text-muted mb-1">{tr('Airline name', 'Aviakompaniya nomi')}</label>
                      <input
                        className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-primary transition"
                        value={formData.airlineName}
                        onChange={(e) => setFormData({...formData, airlineName: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted mb-1">{tr('Code', 'Kod')}</label>
                      <input
                        className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-primary transition"
                        value={formData.airlineCode}
                        onChange={(e) => setFormData({...formData, airlineCode: e.target.value.toUpperCase()})}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">{tr('Route', 'Yo\'nalish')}</label>
                <input
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-primary transition"
                  value={formData.route}
                  onChange={(e) => setFormData({...formData, route: e.target.value})}
                />
              </div>

              <div className="rounded-xl border border-border bg-surface-2 p-4 space-y-4">
                <div className="grid gap-4 md:grid-cols-[180px_1fr_1fr]">
                  <div>
                    <label className="block text-sm font-medium text-muted mb-1">{tr('Ticket type', 'Bilet turi')}</label>
                    <select
                      className="w-full bg-surface border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-primary transition disabled:opacity-60"
                      value={formData.tripType}
                      disabled={modalMode === 'edit'}
                      onChange={(e) => {
                        const tripType = e.target.value as FlightFormData['tripType'];
                        const outbound = tripType === 'ROUND_TRIP' ? Number((formData.ticketPrice / 2).toFixed(4)) : formData.ticketPrice;
                        setFormData({ ...formData, tripType, outboundCost: outbound, returnCost: tripType === 'ROUND_TRIP' ? Number((formData.ticketPrice - outbound).toFixed(4)) : 0 });
                      }}
                    >
                      <option value="ROUND_TRIP">RT — borish–kelish</option>
                      <option value="ONE_WAY">OW — bir tomon</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted mb-1">OUTBOUND: {tr('origin', 'qayerdan')}</label>
                    <input className="w-full bg-surface border border-border rounded-lg px-4 py-2 text-foreground" value={formData.outboundOrigin} onChange={(e) => setFormData({ ...formData, outboundOrigin: e.target.value.toUpperCase() })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted mb-1">OUTBOUND: {tr('destination', 'qayerga')}</label>
                    <input className="w-full bg-surface border border-border rounded-lg px-4 py-2 text-foreground" value={formData.outboundDestination} onChange={(e) => setFormData({ ...formData, outboundDestination: e.target.value.toUpperCase() })} />
                  </div>
                </div>
                {formData.tripType === 'ROUND_TRIP' && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-muted mb-1">RETURN: {tr('origin', 'qayerdan')}</label>
                      <input className="w-full bg-surface border border-border rounded-lg px-4 py-2 text-foreground" value={formData.returnOrigin} onChange={(e) => setFormData({ ...formData, returnOrigin: e.target.value.toUpperCase() })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted mb-1">RETURN: {tr('destination', 'qayerga')}</label>
                      <input className="w-full bg-surface border border-border rounded-lg px-4 py-2 text-foreground" value={formData.returnDestination} onChange={(e) => setFormData({ ...formData, returnDestination: e.target.value.toUpperCase() })} />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">OUTBOUND — {tr('Departure', 'Jo\'nab ketish')}</label>
                  <input
                    type="datetime-local"
                    required
                    className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-primary transition"
                    value={formData.departure}
                    onChange={(e) => setFormData({...formData, departure: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">OUTBOUND — {tr('Arrival', 'Yetib kelish')}</label>
                  <input
                    type="datetime-local"
                    required
                    className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-primary transition"
                    value={formData.arrival}
                    onChange={(e) => setFormData({...formData, arrival: e.target.value})}
                  />
                </div>
              </div>

              {formData.tripType === 'ROUND_TRIP' && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-muted mb-1">RETURN — {tr('Departure', 'Jo‘nab ketish')}</label>
                    <input type="datetime-local" required className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground" value={formData.returnDeparture} onChange={(e) => setFormData({ ...formData, returnDeparture: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted mb-1">RETURN — {tr('Arrival', 'Yetib kelish')}</label>
                    <input type="datetime-local" required className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground" value={formData.returnArrival} onChange={(e) => setFormData({ ...formData, returnArrival: e.target.value })} />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_120px]">
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">{tr('Ticket Count', 'Bilet soni')}</label>
                  <input
                    type="number"
                    min="0"
                    required
                    className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-primary transition"
                    value={formData.ticketCount}
                    onChange={(e) => setFormData({...formData, ticketCount: Number(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">{tr('Ticket Amount', 'Bilet summasi')}</label>
                  <input
                    type="number"
                    min="0"
                    required
                    className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-primary transition"
                    value={formData.ticketPrice}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      const outbound = formData.tripType === 'ROUND_TRIP' ? Number((value / 2).toFixed(4)) : value;
                      setFormData({ ...formData, ticketPrice: value, outboundCost: outbound, returnCost: Number((value - outbound).toFixed(4)) });
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">{tr('Currency', 'Valyuta')}</label>
                  <select
                    className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-primary transition"
                    value={formData.currency}
                    onChange={(e) => setFormData({...formData, currency: e.target.value})}
                  >
                    <option value="UZS">UZS</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>

              {formData.tripType === 'ROUND_TRIP' && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-muted mb-1">{tr('Outbound cost', 'Borish tannarxi')}</label>
                    <input type="number" min="0" required className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground" value={formData.outboundCost} onChange={(e) => setFormData({ ...formData, outboundCost: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted mb-1">{tr('Return cost', 'Qaytish tannarxi')}</label>
                    <input type="number" min="0" required className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground" value={formData.returnCost} onChange={(e) => setFormData({ ...formData, returnCost: Number(e.target.value) })} />
                  </div>
                </div>
              )}
              
              <ActionButtons
                className="mt-6"
                cancelLabel={tr('Cancel', 'Bekor qilish')}
                confirmLabel={tr('Confirm', 'Tasdiqlash')}
                canConfirm={!validateFlightForm() && (formData.airlineMode === 'LISTED' ? Boolean(formData.airlineId) : Boolean(formData.airlineName.trim()))}
                onCancel={() => setIsModalOpen(false)}
              />
            </form>
          </div>
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-foreground">
                {confirm.kind === 'create'
                  ? tr('Confirm flight creation', 'Reys yaratishni tasdiqlash')
                  : tr('Confirm deletion', 'O‘chirishni tasdiqlash')}
              </h3>
              <button
                onClick={closeConfirm}
                className="text-muted hover:text-foreground"
                aria-label={tr('Close confirmation', 'Tasdiqlashni yopish')}
              >
                <X size={20} />
              </button>
            </div>

            {confirm.kind === 'create' ? (
              <div className="space-y-3 text-sm text-foreground">
                <p className="text-foreground">
                  {tr('Create flight', 'Reysni yaratish')}{' '}
                  <span className="font-semibold text-foreground">{confirm.payload.flightNumber}</span>?
                </p>
                <div className="bg-surface-2 border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-muted">{tr('Ticket type', 'Bilet turi')}</span>
                    <strong>{confirm.payload.tripType === 'ROUND_TRIP' ? 'RT — borish–kelish' : 'OW — bir tomon'}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">OUTBOUND</span>
                    <span className="text-foreground">{confirm.payload.outboundOrigin} → {confirm.payload.outboundDestination}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">{tr('Departure', 'Jo\'nab ketish')}</span>
                    <span className="text-foreground">{new Date(confirm.payload.departure).toLocaleString()}</span>
                  </div>
                  {confirm.payload.tripType === 'ROUND_TRIP' && <>
                    <div className="flex items-center justify-between">
                      <span className="text-muted">RETURN</span>
                      <span className="text-foreground">{confirm.payload.returnOrigin} → {confirm.payload.returnDestination}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted">{tr('Return departure', 'Qaytish jo‘nashi')}</span>
                      <span className="text-foreground">{confirm.payload.returnDeparture ? new Date(confirm.payload.returnDeparture).toLocaleString() : '—'}</span>
                    </div>
                  </>}
                  <div className="flex items-center justify-between">
                    <span className="text-muted">{tr('Arrival', 'Yetib kelish')}</span>
                    <span className="text-foreground">{new Date(confirm.payload.arrival).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">{tr('Tickets', 'Chiptalar')}</span>
                    <span className="text-foreground">{confirm.payload.ticketCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">{tr('Price', 'Narx')}</span>
                    <span className="text-foreground">
                      {confirm.payload.ticketPrice} {confirm.payload.currency}
                    </span>
                  </div>
                  {confirm.payload.tripType === 'ROUND_TRIP' && <div className="flex items-center justify-between text-xs">
                    <span className="text-muted">{tr('Cost split', 'Tannarx taqsimoti')}</span>
                    <span>{confirm.payload.outboundCost.toLocaleString()} + {Number(confirm.payload.returnCost || 0).toLocaleString()} {confirm.payload.currency}</span>
                  </div>}
                  <div className="flex items-center justify-between border-t border-border pt-2">
                    <span className="text-muted">{tr('Base total', 'Bazaviy jami')}</span>
                    <span className="font-bold text-foreground">
                      {confirm.payload.baseTotal.toLocaleString()} {confirm.payload.currency}
                    </span>
                  </div>
                </div>
                <p className="text-muted">
                  {tr(
                    'This action will create the flight and generate its tickets.',
                    'Bu amal reysni yaratadi va uning chiptalarini yaratadi.'
                  )}
                </p>
              </div>
            ) : (
              <div className="space-y-3 text-sm text-foreground">
                <p className="text-foreground">
                  {tr('Delete', 'O‘chirish')}{' '}
                  <span className="font-semibold text-foreground">{confirm.label}</span>?
                </p>
                <p className="text-muted">
                  {tr(
                    'This removes the flight from active screens while keeping historical records.',
                    'Bu reysni faol oynalardan olib tashlaydi va tarixiy ma’lumotlarni saqlab qoladi.'
                  )}
                </p>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeConfirm}
                disabled={confirmBusy}
                className="px-4 py-2 bg-surface-2 hover:bg-surface text-foreground rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {confirm.kind === 'create' ? tr('Back', 'Orqaga') : tr('Cancel', 'Bekor qilish')}
              </button>
              <button
                type="button"
                onClick={confirmProceed}
                disabled={confirmBusy}
                className={
                  confirm.kind === 'cancel'
                    ? 'px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed'
                    : 'px-4 py-2 bg-primary hover:bg-primary-hover text-ink font-bold uppercase tracking-wider rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed'
                }
              >
                {confirmBusy
                  ? tr('Please wait...', 'Iltimos kuting...')
                  : confirm.kind === 'create'
                    ? tr('Confirm create', 'Yaratishni tasdiqlash')
                    : tr('Delete flight', 'Reysni o‘chirish')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
