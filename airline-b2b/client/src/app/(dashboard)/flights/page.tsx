"use client";

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Plane, Plus, Edit, Trash2, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { AxiosError } from 'axios';

type ApiErrorResponse = {
  error?: string;
};

type Flight = {
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
  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
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
    currency: 'USD'
  });

  const fetchFlights = async () => {
    try {
      const res = await api.get('/flights');
      setFlights(res.data);
    } catch {
      toast.error('Failed to load flights');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlights();
  }, []);

  const openCreateModal = () => {
    setModalMode('create');
    setFormData({
      flightNumber: '',
      departure: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
      arrival: new Date(Date.now() + 86400000 + 7200000).toISOString().slice(0, 16),
      ticketCount: 10,
      ticketPrice: 500,
      currency: 'USD'
    });
    setIsModalOpen(true);
  };

  const openEditModal = (e: React.MouseEvent, flight: Flight) => {
    e.preventDefault();
    const flightId = flight.id ?? flight.flight_id;
    if (!flightId) {
      toast.error('Invalid flight id');
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
      currency: flight.currency || 'USD'
    });
    setIsModalOpen(true);
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.flightNumber) {
      toast.error("Flight Number is required");
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
        toast.success('Flight updated!');
      }
      setIsModalOpen(false);
      fetchFlights();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error) || (modalMode === 'create' ? 'Failed to create flight.' : 'Failed to update flight.'));
    }
  };

  const handleCancelFlight = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const flight = flights.find((f) => (f.id || f.flight_id) === id);
    setConfirm({
      kind: 'cancel',
      id,
      label: flight?.flightNumber || `Flight ${id}`,
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
        toast.success('Flight created successfully!');
      } else {
        await api.delete(`/flights/${confirm.id}`);
        toast.success('Flight cancelled!');
      }
      setConfirm(null);
      fetchFlights();
    } catch (error: unknown) {
      if (confirm.kind === 'create') {
        toast.error(getApiErrorMessage(error) || 'Failed to create flight.');
      } else {
        toast.error(getApiErrorMessage(error) || 'Failed to cancel flight.');
      }
      setConfirmBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center text-muted">
        <Plane className="mx-auto h-12 w-12 animate-pulse text-fuchsia-500" />
        <p className="mt-2">Loading available flights...</p>
      </div>
    );
  }

  const canEdit = ['SUPERADMIN', 'ADMIN'].includes(user?.role?.toUpperCase() || '');

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold text-foreground">Available Flights</h2>
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
              List
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
              Boxes
            </button>
          </div>
          {canEdit && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-lg font-medium transition"
            >
              <Plus size={18} />
              Create Flight
            </button>
          )}
        </div>
      </div>

      {flightsView === 'boxes' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {flights.map((flight: Flight) => (
            <Link href={`/flights/detail?id=${flight.flight_id || flight.id}`} key={flight.flight_id || flight.id}>
              <div className="bg-surface-2 border border-border rounded-lg shadow-lg hover:shadow-fuchsia-500/20 hover:border-fuchsia-700 transition-all duration-300 p-5 group">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Plane className="text-fuchsia-500" size={24} />
                    <p className="text-lg font-bold text-foreground truncate group-hover:text-fuchsia-600">
                      {flight.flightNumber || `Flight ${flight.flight_id || flight.id}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const cancelled = isCancelledFlight(flight.status);
                      const label = (flight.status || 'SCHEDULED').toString();
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
                          onClick={(e) => openEditModal(e, flight)}
                          disabled={isCancelledFlight(flight.status)}
                          className="text-muted hover:text-fuchsia-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Edit"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            const flightId = flight.id ?? flight.flight_id;
                            if (!flightId) {
                              toast.error('Invalid flight id');
                              return;
                            }
                            handleCancelFlight(e, flightId);
                          }}
                          disabled={isCancelledFlight(flight.status)}
                          className="text-muted hover:text-red-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Cancel flight"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                
                <div className="text-sm text-foreground space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-muted">Departure:</span>
                    <span>{new Date(flight.departure).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-muted">Arrival:</span>
                    <span>{new Date(flight.arrival).toLocaleString()}</span>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-border grid grid-cols-3 gap-2 text-center">
                  <div className="text-muted">
                    <p className="text-xs">Allocations</p>
                    <p className="font-bold text-lg text-yellow-600">${Number(flight.total_allocated || 0).toLocaleString()}</p>
                  </div>
                  <div className="text-muted">
                    <p className="text-xs">Sales</p>
                    <p className="font-bold text-lg text-green-600">${Number(flight.total_sales || 0).toLocaleString()}</p>
                  </div>
                  <div className="text-muted">
                    <p className="text-xs">Payments</p>
                    <p className="font-bold text-lg text-fuchsia-600">${Number(flight.total_payments || 0).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {flights.length === 0 && (
            <div className="col-span-full text-center py-12 bg-surface-2 border border-dashed border-border rounded-lg">
              <Plane className="mx-auto h-12 w-12 text-muted" />
              <h3 className="mt-2 text-lg font-medium text-foreground">No flights available</h3>
              <p className="mt-1 text-sm text-muted">Check back later or contact an administrator to add new flights.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto bg-surface-2 border border-border rounded-lg">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-surface">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Flight</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Departure</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Arrival</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Allocations</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Sales</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Payments</th>
                {canEdit && (
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {flights.map((flight: Flight) => {
                const flightId = flight.flight_id || flight.id;
                return (
                  <tr key={flightId} className="hover:bg-surface transition">
                    <td className="px-4 py-3 text-sm text-foreground font-medium">
                      {flightId ? (
                        <Link href={`/flights/detail?id=${flightId}`} className="hover:text-fuchsia-600 transition">
                          {flight.flightNumber || `Flight ${flightId}`}
                        </Link>
                      ) : (
                        <span>{flight.flightNumber || 'Flight'}</span>
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
                        {(flight.status || 'SCHEDULED').toString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted whitespace-nowrap">{new Date(flight.departure).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-muted whitespace-nowrap">{new Date(flight.arrival).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-yellow-600 font-medium whitespace-nowrap">${Number(flight.total_allocated || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-green-600 font-medium whitespace-nowrap">${Number(flight.total_sales || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-fuchsia-600 font-medium whitespace-nowrap">${Number(flight.total_payments || 0).toLocaleString()}</td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right text-sm">
                        <div className="inline-flex items-center gap-3">
                          <button
                            onClick={(e) => openEditModal(e, flight)}
                            disabled={isCancelledFlight(flight.status)}
                            className="text-muted hover:text-fuchsia-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Edit"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={(e) => {
                              if (!flightId) {
                                toast.error('Invalid flight id');
                                return;
                              }
                              handleCancelFlight(e, flightId);
                            }}
                            disabled={isCancelledFlight(flight.status)}
                            className="text-muted hover:text-red-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Cancel flight"
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
                    No flights available.
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
                {modalMode === 'create' ? 'Create New Flight' : 'Edit Flight'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-muted hover:text-foreground">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleModalSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-1">Flight Number</label>
                <input
                  type="text"
                  required
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-fuchsia-500 transition"
                  placeholder="e.g. B2B-999"
                  value={formData.flightNumber}
                  onChange={(e) => setFormData({...formData, flightNumber: e.target.value})}
                />
              </div>

              {modalMode === 'create' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-muted mb-1">Departure</label>
                      <input
                        type="datetime-local"
                        required
                        className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-fuchsia-500 transition"
                        value={formData.departure}
                        onChange={(e) => setFormData({...formData, departure: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted mb-1">Arrival</label>
                      <input
                        type="datetime-local"
                        required
                        className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-fuchsia-500 transition"
                        value={formData.arrival}
                        onChange={(e) => setFormData({...formData, arrival: e.target.value})}
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-muted mb-1">Ticket Count</label>
                      <input
                        type="number"
                        min="1"
                        required
                        className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-fuchsia-500 transition"
                        value={formData.ticketCount}
                        onChange={(e) => setFormData({...formData, ticketCount: Number(e.target.value)})}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted mb-1">Ticket Price</label>
                      <input
                        type="number"
                        min="0"
                        required
                        className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-fuchsia-500 transition"
                        value={formData.ticketPrice}
                        onChange={(e) => setFormData({...formData, ticketPrice: Number(e.target.value)})}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-muted mb-1">Currency</label>
                    <select
                      className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-fuchsia-500 transition"
                      value={formData.currency}
                      onChange={(e) => setFormData({...formData, currency: e.target.value})}
                    >
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
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-lg transition"
                >
                  {modalMode === 'create' ? 'Create Flight' : 'Save Changes'}
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
                {confirm.kind === 'create' ? 'Confirm flight creation' : 'Confirm cancellation'}
              </h3>
              <button onClick={closeConfirm} className="text-muted hover:text-foreground" aria-label="Close confirmation">
                <X size={20} />
              </button>
            </div>

            {confirm.kind === 'create' ? (
              <div className="space-y-3 text-sm text-foreground">
                <p className="text-foreground">
                  Create flight <span className="font-semibold text-foreground">{confirm.payload.flightNumber}</span>?
                </p>
                <div className="bg-surface-2 border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Departure</span>
                    <span className="text-foreground">{new Date(confirm.payload.departure).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Arrival</span>
                    <span className="text-foreground">{new Date(confirm.payload.arrival).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Tickets</span>
                    <span className="text-foreground">{confirm.payload.ticketCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Price</span>
                    <span className="text-foreground">
                      {confirm.payload.ticketPrice} {confirm.payload.currency}
                    </span>
                  </div>
                </div>
                <p className="text-muted">
                  This action will create the flight and generate its tickets.
                </p>
              </div>
            ) : (
              <div className="space-y-3 text-sm text-foreground">
                <p className="text-foreground">
                  Cancel <span className="font-semibold text-foreground">{confirm.label}</span>?
                </p>
                <p className="text-muted">
                  This marks the flight as CANCELLED and keeps historical tickets and transactions.
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
                {confirm.kind === 'create' ? 'Back' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={confirmProceed}
                disabled={confirmBusy}
                className={
                  confirm.kind === 'cancel'
                    ? 'px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed'
                    : 'px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed'
                }
              >
                {confirmBusy ? 'Please wait...' : confirm.kind === 'create' ? 'Confirm create' : 'Cancel flight'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
