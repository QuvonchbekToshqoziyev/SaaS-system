"use client";

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Plane, Plus, Edit, Trash2, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import type { AxiosError } from 'axios';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';

// Assuming you exported from shared/types.ts earlier so let's import directly.
// Actually, let's keep the internal type map for a moment, or use the global one.
// Let's rely on internal one to avoid too many file replaces since we symlinked. Or I will just make it use useQuery.

type ApiErrorResponse = {
  error?: string;
};

type LocalFlight = {
  id?: string;
  flight_id?: string;
  flightNumber?: string;
  departure: string;
  arrival: string;
  status?: string;
  ticketCount?: number;
  ticketPrice?: number;
  currency?: string;
  total_allocated?: number | string;
  total_sales?: number | string;
  total_payments?: number | string;
};

function getApiErrorMessage(error: unknown): string | undefined {
  const axiosError = error as AxiosError<ApiErrorResponse>;
  return axiosError?.response?.data?.error;
}

function isCancelledFlight(status?: string): boolean {
  return String(status || '').trim().toUpperCase() === 'CANCELLED';
}

export default function FlightsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { tr } = useLanguage();
  
  const { data: flights = [], isLoading: loading } = useQuery<LocalFlight[]>({
    queryKey: ['flights'],
    queryFn: async () => {
      const res = await api.get('/flights');
      return res.data;
    }
  });

  const [flightsView, setFlightsView] = useState<'boxes' | 'list'>('boxes');
  const [confirm, setConfirm] = useState<
    | null
    | {
        kind: 'create';
        payload: {
          flightNumber: string;
          departure: string;
          arrival: string;
          ticketCount: number;
          ticketPrice: number;
          currency: string;
        };
      }
    | { kind: 'cancel'; id: string; label: string }
  >(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [currentFlightId, setCurrentFlightId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    flightNumber: '',
    departure: '',
    arrival: '',
    ticketCount: 10,
    ticketPrice: 500,
    currency: 'UZS'
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem('jetstream-flights-view');
      if (raw === 'list' || raw === 'boxes') {
        setFlightsView(raw);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('jetstream-flights-view', flightsView);
    } catch {
      // ignore
    }
  }, [flightsView]);

  const openCreateModal = () => {
    setModalMode('create');
    setFormData({
      flightNumber: '',
      departure: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
      arrival: new Date(Date.now() + 86400000 + 7200000).toISOString().slice(0, 16),
      ticketCount: 10,
      ticketPrice: 500,
      currency: 'UZS'
    });
    setIsModalOpen(true);
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
      departure: new Date(flight.departure).toISOString().slice(0, 16),
      arrival: new Date(flight.arrival).toISOString().slice(0, 16),
      ticketCount: flight.ticketCount || 10,
      ticketPrice: flight.ticketPrice || 500,
      currency: flight.currency || 'UZS'
    });
    setIsModalOpen(true);
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.flightNumber) {
      toast.error(tr('Flight Number is required', 'Reys raqami kerak'));
      return;
    }
    
    try {
      if (modalMode === 'create') {
        const payload = {
          flightNumber: formData.flightNumber,
          departure: new Date(formData.departure).toISOString(),
          arrival: new Date(formData.arrival).toISOString(),
          ticketCount: Number(formData.ticketCount),
          ticketPrice: Number(formData.ticketPrice),
          currency: formData.currency
        };
        setIsModalOpen(false);
        setConfirm({ kind: 'create', payload });
        return;
      } else {
        await api.put(`/flights/${currentFlightId}`, { flightNumber: formData.flightNumber });
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
      setIsModalOpen(true);
    }
  };

  const confirmProceed = async () => {
    if (!confirm || confirmBusy) return;
    setConfirmBusy(true);
    try {
      if (confirm.kind === 'create') {
        await api.post('/flights', confirm.payload);
        toast.success(tr('Flight created successfully!', 'Reys muvaffaqiyatli yaratildi!'));
      } else {
        await api.delete(`/flights/${confirm.id}`);
        toast.success(tr('Flight cancelled!', 'Reys bekor qilindi!'));
      }
      setConfirm(null);
      queryClient.invalidateQueries({ queryKey: ["flights"] });
    } catch (error: unknown) {
      if (confirm.kind === 'create') {
        toast.error(getApiErrorMessage(error) || tr('Failed to create flight.', 'Reysni yaratib bo\'lmadi.'));
      } else {
        toast.error(getApiErrorMessage(error) || tr('Failed to cancel flight.', 'Reysni bekor qilib bo\'lmadi.'));
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

  const canEdit = ['SUPERADMIN', 'ADMIN'].includes(user?.role?.toUpperCase() || '');

  const getStatusLabel = (status?: string) => {
    const normalized = String(status || 'SCHEDULED').trim().toUpperCase();
    if (normalized === 'CANCELLED') return tr('CANCELLED', 'BEKOR QILINGAN');
    if (normalized === 'SCHEDULED') return tr('SCHEDULED', 'REJALASHTIRILGAN');
    return normalized;
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold text-foreground">{tr('Available Flights', 'Mavjud reyslar')}</h2>
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
          {canEdit && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-ink font-bold uppercase tracking-wider rounded-lg font-medium transition"
            >
              <Plus size={18} />
              {tr('Create Flight', 'Reys yaratish')}
            </button>
          )}
        </div>
      </div>

      {flightsView === 'boxes' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {flights.map((flight: LocalFlight) => {
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
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => openEditModal(e, flight)}
                          disabled={isCancelledFlight(flight.status)}
                          className="text-muted hover:text-primary transition disabled:opacity-50 disabled:cursor-not-allowed"
                          title={tr('Edit', 'Tahrirlash')}
                        >
                          <Edit size={16} />
                        </button>
                        <button
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
                          title={tr('Cancel flight', 'Reysni bekor qilish')}
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                
                <div className="text-sm text-foreground space-y-3">
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
                    <p className="text-xs">{tr('Allocations (UZS)', 'Ajratmalar (UZS)')}</p>
                    <p className="font-bold text-lg text-yellow-600">{Number(flight.total_allocated || 0).toLocaleString()}</p>
                  </div>
                  <div className="text-muted">
                    <p className="text-xs">{tr('Sales (UZS)', 'Sotuvlar (UZS)')}</p>
                    <p className="font-bold text-lg text-green-600">{Number(flight.total_sales || 0).toLocaleString()}</p>
                  </div>
                  <div className="text-muted">
                    <p className="text-xs">{tr('Payments (UZS)', "To'lovlar (UZS)")}</p>
                    <p className="font-bold text-lg text-primary">{Number(flight.total_payments || 0).toLocaleString()}</p>
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
          {flights.length === 0 && (
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
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-surface">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">{tr('Flight', 'Reys')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">{tr('Status', 'Holat')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">{tr('Departure', 'Jo\'nab ketish')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">{tr('Arrival', 'Yetib kelish')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">{tr('Allocations (UZS)', 'Ajratmalar (UZS)')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">{tr('Sales (UZS)', 'Sotuvlar (UZS)')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">{tr('Payments (UZS)', "To'lovlar (UZS)")}</th>
                {canEdit && (
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">{tr('Actions', 'Amallar')}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {flights.map((flight: LocalFlight) => {
                const flightId = flight.flight_id || flight.id;
                return (
                  <tr key={flightId} className="hover:bg-surface transition">
                    <td className="px-4 py-3 text-sm text-foreground font-medium">
                      {flightId ? (
                        <div>
                          <Link href={`/flights/detail?id=${flightId}`} className="hover:text-primary transition">
                            {flight.flightNumber || `Flight ${flightId}`}
                          </Link>
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => router.push(`/transactions?flightId=${encodeURIComponent(flightId)}`)}
                              className="px-2 py-1 bg-surface hover:bg-surface-2 text-foreground rounded-lg transition border border-border text-xs font-medium"
                            >
                              {tr('Transactions', 'Tranzaksiyalar')}
                            </button>
                            <button
                              type="button"
                              onClick={() => router.push(`/reports?flightId=${encodeURIComponent(flightId)}`)}
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
                    <td className="px-4 py-3 text-sm text-yellow-600 font-medium whitespace-nowrap">{Number(flight.total_allocated || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-green-600 font-medium whitespace-nowrap">{Number(flight.total_sales || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-primary font-medium whitespace-nowrap">{Number(flight.total_payments || 0).toLocaleString()}</td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right text-sm">
                        <div className="inline-flex items-center gap-3">
                          <button
                            onClick={(e) => openEditModal(e, flight)}
                            disabled={isCancelledFlight(flight.status)}
                            className="text-muted hover:text-primary transition disabled:opacity-50 disabled:cursor-not-allowed"
                            title={tr('Edit', 'Tahrirlash')}
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={(e) => {
                              if (!flightId) {
                                toast.error(tr('Invalid flight id', 'Reys ID xato'));
                                return;
                              }
                              handleCancelFlight(e, flightId);
                            }}
                            disabled={isCancelledFlight(flight.status)}
                            className="text-muted hover:text-red-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                            title={tr('Cancel flight', 'Reysni bekor qilish')}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {flights.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 8 : 7} className="px-4 py-10 text-center text-sm text-muted">
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
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-foreground">
                {modalMode === 'create'
                  ? tr('Create New Flight', 'Yangi reys yaratish')
                  : tr('Edit Flight', 'Reysni tahrirlash')}
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

              {modalMode === 'create' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-muted mb-1">{tr('Departure', 'Jo\'nab ketish')}</label>
                      <input
                        type="datetime-local"
                        required
                        className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-primary transition"
                        value={formData.departure}
                        onChange={(e) => setFormData({...formData, departure: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted mb-1">{tr('Arrival', 'Yetib kelish')}</label>
                      <input
                        type="datetime-local"
                        required
                        className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-primary transition"
                        value={formData.arrival}
                        onChange={(e) => setFormData({...formData, arrival: e.target.value})}
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-muted mb-1">{tr('Ticket Count', 'Chipta soni')}</label>
                      <input
                        type="number"
                        min="1"
                        required
                        className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-primary transition"
                        value={formData.ticketCount}
                        onChange={(e) => setFormData({...formData, ticketCount: Number(e.target.value)})}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted mb-1">{tr('Ticket Price', 'Chipta narxi')}</label>
                      <input
                        type="number"
                        min="0"
                        required
                        className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-primary transition"
                        value={formData.ticketPrice}
                        onChange={(e) => setFormData({...formData, ticketPrice: Number(e.target.value)})}
                      />
                    </div>
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
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                </>
              )}
              
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-surface-2 hover:bg-surface text-foreground rounded-lg transition"
                >
                  {tr('Cancel', 'Bekor qilish')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary hover:bg-primary-hover text-ink font-bold uppercase tracking-wider rounded-lg transition"
                >
                  {modalMode === 'create'
                    ? tr('Create Flight', 'Reys yaratish')
                    : tr('Save Changes', "O'zgarishlarni saqlash")}
                </button>
              </div>
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
                  : tr('Confirm cancellation', 'Bekor qilishni tasdiqlash')}
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
                    <span className="text-muted">{tr('Departure', 'Jo\'nab ketish')}</span>
                    <span className="text-foreground">{new Date(confirm.payload.departure).toLocaleString()}</span>
                  </div>
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
                  {tr('Cancel', 'Bekor qilish')}{' '}
                  <span className="font-semibold text-foreground">{confirm.label}</span>?
                </p>
                <p className="text-muted">
                  {tr(
                    'This marks the flight as CANCELLED and keeps historical tickets and transactions.',
                    'Bu reysni CANCELLED deb belgilaydi va tarixiy chiptalar hamda tranzaksiyalarni saqlab qoladi.'
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
                    : tr('Cancel flight', 'Reysni bekor qilish')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
