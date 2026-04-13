/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

type FlightOption = {
  id: string;
  flightNumber: string;
  departure: string;
  arrival: string;
};

type FirmOption = {
  id: string;
  name: string;
};

function toISODateOrNull(dateValue: string): string | null {
  if (!dateValue) return null;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function ReportsPage() {
  const { user } = useAuth();

  const role = String(user?.role || '').toLowerCase();
  const isFirm = role === 'firm';
  const isAdmin = role === 'admin' || role === 'superadmin';
  const canAccess = isAdmin || isFirm;
  const isSuperadmin = role === 'superadmin';

  const [flights, setFlights] = useState<FlightOption[]>([]);
  const [firms, setFirms] = useState<FirmOption[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [selectedFlightId, setSelectedFlightId] = useState<string>('');
  const [selectedFirmId, setSelectedFirmId] = useState<string>('');

  const [flightReport, setFlightReport] = useState<any>(null);
  const [firmReport, setFirmReport] = useState<any>(null);
  const [paymentsReport, setPaymentsReport] = useState<any>(null);
  const [transactionsReport, setTransactionsReport] = useState<any>(null);
  const [interactionsReport, setInteractionsReport] = useState<any>(null);

  const [loadingFlightReport, setLoadingFlightReport] = useState(false);
  const [loadingFirmReport, setLoadingFirmReport] = useState(false);
  const [loadingPaymentsReport, setLoadingPaymentsReport] = useState(false);
  const [loadingTransactionsReport, setLoadingTransactionsReport] = useState(false);
  const [loadingInteractionsReport, setLoadingInteractionsReport] = useState(false);

  const dateParams = useMemo(() => {
    const fromISO = toISODateOrNull(dateFrom);
    const toISO = toISODateOrNull(dateTo);
    return {
      dateFrom: fromISO || undefined,
      dateTo: toISO || undefined,
    };
  }, [dateFrom, dateTo]);

  useEffect(() => {
    const fetchMeta = async () => {
      if (!canAccess) {
        setLoadingMeta(false);
        return;
      }

      try {
        setLoadingMeta(true);
        const [flightsRes, firmsRes] = await Promise.all([
          api.get('/flights'),
          isAdmin ? api.get('/firms') : Promise.resolve({ data: [] }),
        ]);

        const flightOptions: FlightOption[] = (flightsRes.data || [])
          .filter((f: any) => f && (f.id || f.flight_id))
          .map((f: any) => ({
            id: String(f.id || f.flight_id),
            flightNumber: String(f.flightNumber || f.flight_number || f.id || f.flight_id),
            departure: String(f.departure),
            arrival: String(f.arrival),
          }));

        const firmOptions: FirmOption[] = isAdmin
          ? (firmsRes.data || [])
              .filter((x: any) => x && x.id)
              .map((x: any) => ({ id: String(x.id), name: String(x.name || x.id) }))
          : [];

        setFlights(flightOptions);
        setFirms(firmOptions);

        if (!selectedFlightId && flightOptions.length > 0) setSelectedFlightId(flightOptions[0].id);
        if (isAdmin && !selectedFirmId && firmOptions.length > 0) setSelectedFirmId(firmOptions[0].id);
      } catch (error: any) {
        toast.error(error?.response?.data?.error || 'Failed to load report options');
      } finally {
        setLoadingMeta(false);
      }
    };

    fetchMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess, isAdmin]);

  const loadFlightReport = async () => {
    if (!selectedFlightId) {
      toast.error('Select a flight');
      return;
    }
    try {
      setLoadingFlightReport(true);
      const res = await api.get(`/reports/flight?flightId=${encodeURIComponent(selectedFlightId)}`);
      setFlightReport(res.data);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to load flight report');
    } finally {
      setLoadingFlightReport(false);
    }
  };

  const loadFirmReport = async () => {
    try {
      setLoadingFirmReport(true);
      const query = new URLSearchParams();
      if (isAdmin) {
        if (!selectedFirmId) {
          toast.error('Select a firm');
          return;
        }
        query.set('firmId', selectedFirmId);
      }
      if (dateParams.dateFrom) query.set('dateFrom', dateParams.dateFrom);
      if (dateParams.dateTo) query.set('dateTo', dateParams.dateTo);

      const res = await api.get(`/reports/firm?${query.toString()}`);
      setFirmReport(res.data);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to load firm report');
    } finally {
      setLoadingFirmReport(false);
    }
  };

  const loadPaymentsReport = async () => {
    try {
      setLoadingPaymentsReport(true);
      const query = new URLSearchParams();
      if (isAdmin && selectedFirmId) query.set('firmId', selectedFirmId);
      if (selectedFlightId) query.set('flightId', selectedFlightId);
      if (dateParams.dateFrom) query.set('dateFrom', dateParams.dateFrom);
      if (dateParams.dateTo) query.set('dateTo', dateParams.dateTo);

      const res = await api.get(`/reports/payments?${query.toString()}`);
      setPaymentsReport(res.data);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to load payments report');
    } finally {
      setLoadingPaymentsReport(false);
    }
  };

  const loadTransactionsReport = async () => {
    try {
      setLoadingTransactionsReport(true);
      const query = new URLSearchParams();
      if (isAdmin && selectedFirmId) query.set('firmId', selectedFirmId);
      if (selectedFlightId) query.set('flightId', selectedFlightId);
      if (dateParams.dateFrom) query.set('dateFrom', dateParams.dateFrom);
      if (dateParams.dateTo) query.set('dateTo', dateParams.dateTo);

      const res = await api.get(`/reports/transactions?${query.toString()}`);
      setTransactionsReport(res.data);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to load transactions report');
    } finally {
      setLoadingTransactionsReport(false);
    }
  };

  const loadInteractionsReport = async () => {
    if (!isSuperadmin) {
      toast.error('Superadmin only');
      return;
    }
    try {
      setLoadingInteractionsReport(true);
      const query = new URLSearchParams();
      if (dateParams.dateFrom) query.set('dateFrom', dateParams.dateFrom);
      if (dateParams.dateTo) query.set('dateTo', dateParams.dateTo);

      const res = await api.get(`/reports/interactions?${query.toString()}`);
      setInteractionsReport(res.data);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to load interactions report');
    } finally {
      setLoadingInteractionsReport(false);
    }
  };

  if (!canAccess) {
    return (
      <div className="text-foreground">
        <h2 className="text-3xl font-bold text-foreground">Reports</h2>
        <p className="mt-2 text-muted">You do not have access to reports.</p>
      </div>
    );
  }

  const flightOptionsDisabled = loadingMeta || flights.length === 0;
  const firmOptionsDisabled = loadingMeta || firms.length === 0;

  return (
    <div className="space-y-8 text-foreground">
      <div>
        <h2 className="text-3xl font-bold">Reports</h2>
        <p className="mt-1 text-sm text-muted">
          {isFirm
            ? 'Your firm-scoped performance and finance reports.'
            : 'Flight, firm, payments, transactions — plus superadmin interaction overview.'}
        </p>
      </div>

      <div className="bg-surface-2 border border-border rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-semibold">Scope</h3>
        <div className={`grid grid-cols-1 ${isAdmin ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4`}>
          <div>
            <label className="block text-sm font-medium text-muted mb-1">Flight</label>
            <select
              value={selectedFlightId}
              onChange={(e) => setSelectedFlightId(e.target.value)}
              disabled={flightOptionsDisabled}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-foreground outline-none focus:border-fuchsia-500 transition disabled:opacity-50"
            >
              {flights.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.flightNumber}
                </option>
              ))}
            </select>
          </div>

          {isAdmin && (
            <div>
              <label className="block text-sm font-medium text-muted mb-1">Firm</label>
              <select
                value={selectedFirmId}
                onChange={(e) => setSelectedFirmId(e.target.value)}
                disabled={firmOptionsDisabled}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-foreground outline-none focus:border-fuchsia-500 transition disabled:opacity-50"
              >
                {firms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-muted mb-1">Date from</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-foreground outline-none focus:border-fuchsia-500 transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted mb-1">Date to</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-foreground outline-none focus:border-fuchsia-500 transition"
            />
          </div>
        </div>

        {loadingMeta && (
          <p className="text-sm text-muted">Loading report options...</p>
        )}
      </div>

      {/* Flight report */}
      <div className="bg-surface-2 border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{isFirm ? 'Flight report (your firm)' : 'Flight report'}</h3>
          <button
            type="button"
            onClick={loadFlightReport}
            disabled={loadingFlightReport || !selectedFlightId}
            className="px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-lg transition disabled:opacity-50"
          >
            {loadingFlightReport ? 'Loading…' : 'Load'}
          </button>
        </div>

        {flightReport && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="bg-surface border border-border rounded-lg p-4">
                <p className="text-xs text-muted">Debt (Payable)</p>
                <p className="text-2xl font-bold text-yellow-600">${Number(flightReport.debt || 0).toFixed(2)}</p>
              </div>
              <div className="bg-surface border border-border rounded-lg p-4">
                <p className="text-xs text-muted">Revenue (Sales)</p>
                <p className="text-2xl font-bold text-green-600">${Number(flightReport.revenue || 0).toFixed(2)}</p>
              </div>
              <div className="bg-surface border border-border rounded-lg p-4">
                <p className="text-xs text-muted">Payments</p>
                <p className="text-2xl font-bold text-fuchsia-600">${Number(flightReport.paid || 0).toFixed(2)}</p>
              </div>
              <div className="bg-surface border border-border rounded-lg p-4">
                <p className="text-xs text-muted">Outstanding</p>
                <p className="text-2xl font-bold">${Number(flightReport.outstanding || 0).toFixed(2)}</p>
              </div>
              <div className="bg-surface border border-border rounded-lg p-4">
                <p className="text-xs text-muted">Profit</p>
                <p className="text-2xl font-bold text-indigo-600">${Number(flightReport.profit || 0).toFixed(2)}</p>
              </div>
            </div>

            {flightReport.tickets && (
              <div className="text-sm text-muted">
                Tickets: total {flightReport.tickets.total}, available {flightReport.tickets.available}, assigned {flightReport.tickets.assigned}, sold {flightReport.tickets.sold}
              </div>
            )}

            {isAdmin ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted uppercase">Firm</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted uppercase">Tickets</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted uppercase">Sold</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted uppercase">Debt</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted uppercase">Revenue</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted uppercase">Paid</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted uppercase">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(flightReport.firms || []).map((row: any) => (
                      <tr key={row.firmId}>
                        <td className="px-4 py-2 text-sm text-foreground">{row.firmName || row.firmId}</td>
                        <td className="px-4 py-2 text-sm text-foreground">{row.ticketsAssigned || 0}</td>
                        <td className="px-4 py-2 text-sm text-foreground">{row.ticketsSold || 0}</td>
                        <td className="px-4 py-2 text-sm text-foreground">{Number(row.debt || 0).toFixed(2)}</td>
                        <td className="px-4 py-2 text-sm text-foreground">{Number(row.revenue || 0).toFixed(2)}</td>
                        <td className="px-4 py-2 text-sm text-foreground">{Number(row.paid || 0).toFixed(2)}</td>
                        <td className="px-4 py-2 text-sm text-foreground">{Number(row.outstanding || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                    {(flightReport.firms || []).length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-4 text-center text-sm text-muted">
                          No firm activity for this flight yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-muted">
                Your firm breakdown: {(flightReport.firms || []).length > 0 ? (
                  <span>
                    tickets {(flightReport.firms?.[0]?.ticketsAssigned ?? 0)} / sold {(flightReport.firms?.[0]?.ticketsSold ?? 0)}
                  </span>
                ) : (
                  <span className="text-muted">No activity for this flight yet.</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Firm report */}
      <div className="bg-surface-2 border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{isFirm ? 'My firm report' : 'Firm report'}</h3>
          <button
            type="button"
            onClick={loadFirmReport}
            disabled={loadingFirmReport || (isAdmin && !selectedFirmId)}
            className="px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-lg transition disabled:opacity-50"
          >
            {loadingFirmReport ? 'Loading…' : 'Load'}
          </button>
        </div>

        {firmReport && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="bg-surface border border-border rounded-lg p-4">
                <p className="text-xs text-muted">Debt</p>
                <p className="text-2xl font-bold text-yellow-600">${Number(firmReport.totals?.debt || 0).toFixed(2)}</p>
              </div>
              <div className="bg-surface border border-border rounded-lg p-4">
                <p className="text-xs text-muted">Revenue</p>
                <p className="text-2xl font-bold text-green-600">${Number(firmReport.totals?.revenue || 0).toFixed(2)}</p>
              </div>
              <div className="bg-surface border border-border rounded-lg p-4">
                <p className="text-xs text-muted">Paid</p>
                <p className="text-2xl font-bold text-fuchsia-600">${Number(firmReport.totals?.paid || 0).toFixed(2)}</p>
              </div>
              <div className="bg-surface border border-border rounded-lg p-4">
                <p className="text-xs text-muted">Outstanding</p>
                <p className="text-2xl font-bold">${Number(firmReport.totals?.outstanding || 0).toFixed(2)}</p>
              </div>
              <div className="bg-surface border border-border rounded-lg p-4">
                <p className="text-xs text-muted">Profit</p>
                <p className="text-2xl font-bold text-indigo-600">${Number(firmReport.totals?.profit || 0).toFixed(2)}</p>
              </div>
            </div>

            <div className="text-sm text-muted">
              Tickets: assigned {firmReport.tickets?.assigned || 0}, sold {firmReport.tickets?.sold || 0}, unsold {firmReport.tickets?.unsold || 0}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-surface border border-border rounded-lg p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">Transactions by type</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-surface-2">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Type</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Count</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Total (USD)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(firmReport.transactionsByType || []).map((r: any) => (
                        <tr key={r.type}>
                          <td className="px-3 py-2 text-sm text-foreground">{r.type}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{r.count}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{Number(r.totalBaseAmount || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                      {(firmReport.transactionsByType || []).length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-3 py-3 text-center text-sm text-muted">No data</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-surface border border-border rounded-lg p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">Payments by method</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-surface-2">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Method</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Count</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Total (USD)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(firmReport.paymentsByMethod || []).map((r: any) => (
                        <tr key={r.method}>
                          <td className="px-3 py-2 text-sm text-foreground capitalize">{r.method}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{r.count}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{Number(r.totalBaseAmount || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                      {(firmReport.paymentsByMethod || []).length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-3 py-3 text-center text-sm text-muted">No data</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="bg-surface border border-border rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">By flight</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface-2">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Flight</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Debt</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Revenue</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Paid</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Outstanding</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Tickets</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Sold</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(firmReport.byFlight || []).map((r: any) => (
                      <tr key={r.flightId}>
                        <td className="px-3 py-2 text-sm text-foreground">{r.flightNumber || r.flightId}</td>
                        <td className="px-3 py-2 text-sm text-foreground">{Number(r.debt || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-sm text-foreground">{Number(r.revenue || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-sm text-foreground">{Number(r.paid || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-sm text-foreground">{Number(r.outstanding || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-sm text-foreground">{r.ticketsAssigned || 0}</td>
                        <td className="px-3 py-2 text-sm text-foreground">{r.ticketsSold || 0}</td>
                      </tr>
                    ))}
                    {(firmReport.byFlight || []).length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-3 text-center text-sm text-muted">No data</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Payments report */}
      <div className="bg-surface-2 border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{isFirm ? 'My payments report' : 'Payments report'}</h3>
          <button
            type="button"
            onClick={loadPaymentsReport}
            disabled={loadingPaymentsReport}
            className="px-4 py-2 bg-surface hover:bg-surface-2 text-foreground rounded-lg transition disabled:opacity-50"
          >
            {loadingPaymentsReport ? 'Loading…' : 'Load'}
          </button>
        </div>

        {paymentsReport && (
          <div className="space-y-4">
            <div className="text-sm text-muted">
              Total payments: {paymentsReport.totals?.count || 0} — ${Number(paymentsReport.totals?.totalBaseAmount || 0).toFixed(2)} USD
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-surface border border-border rounded-lg p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">By method</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-surface-2">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Method</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Count</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Total (USD)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(paymentsReport.byMethod || []).map((r: any) => (
                        <tr key={r.method}>
                          <td className="px-3 py-2 text-sm text-foreground capitalize">{r.method}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{r.count}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{Number(r.totalBaseAmount || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                      {(paymentsReport.byMethod || []).length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-3 py-3 text-center text-sm text-muted">No data</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-surface border border-border rounded-lg p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">By currency</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-surface-2">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Currency</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Count</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Total (USD)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(paymentsReport.byCurrency || []).map((r: any) => (
                        <tr key={r.currency}>
                          <td className="px-3 py-2 text-sm text-foreground">{r.currency}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{r.count}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{Number(r.totalBaseAmount || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                      {(paymentsReport.byCurrency || []).length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-3 py-3 text-center text-sm text-muted">No data</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Transactions report */}
      <div className="bg-surface-2 border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{isFirm ? 'My transactions report' : 'Transactions report'}</h3>
          <button
            type="button"
            onClick={loadTransactionsReport}
            disabled={loadingTransactionsReport}
            className="px-4 py-2 bg-surface hover:bg-surface-2 text-foreground rounded-lg transition disabled:opacity-50"
          >
            {loadingTransactionsReport ? 'Loading…' : 'Load'}
          </button>
        </div>

        {transactionsReport && (
          <div className="space-y-4">
            <div className="text-sm text-muted">
              Total transactions: {transactionsReport.totals?.count || 0} — ${Number(transactionsReport.totals?.totalBaseAmount || 0).toFixed(2)} USD
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-surface border border-border rounded-lg p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">By type</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-surface-2">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Type</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Count</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Total (USD)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(transactionsReport.byType || []).map((r: any) => (
                        <tr key={r.type}>
                          <td className="px-3 py-2 text-sm text-foreground">{r.type}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{r.count}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{Number(r.totalBaseAmount || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                      {(transactionsReport.byType || []).length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-3 py-3 text-center text-sm text-muted">No data</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-surface border border-border rounded-lg p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">By currency</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-surface-2">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Currency</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Count</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Total (USD)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(transactionsReport.byCurrency || []).map((r: any) => (
                        <tr key={r.currency}>
                          <td className="px-3 py-2 text-sm text-foreground">{r.currency}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{r.count}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{Number(r.totalBaseAmount || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                      {(transactionsReport.byCurrency || []).length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-3 py-3 text-center text-sm text-muted">No data</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Superadmin interactions */}
      {isSuperadmin && (
        <div className="bg-surface-2 border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Admin ↔ Firm interactions (superadmin)</h3>
            <button
              type="button"
              onClick={loadInteractionsReport}
              disabled={loadingInteractionsReport}
              className="px-4 py-2 bg-surface hover:bg-surface-2 text-foreground rounded-lg transition disabled:opacity-50"
            >
              {loadingInteractionsReport ? 'Loading…' : 'Load'}
            </button>
          </div>

          {interactionsReport && (
            <div className="space-y-4">
              <div className="text-sm text-muted">
                Invites: {interactionsReport.totals?.invitesSent || 0} — Allocations ${Number(interactionsReport.totals?.allocationsBaseAmount || 0).toFixed(2)} — Payments ${Number(interactionsReport.totals?.paymentsBaseAmount || 0).toFixed(2)}
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Admin</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Firm</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Invites</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Allocations (USD)</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Payments (USD)</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">Sales (USD)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(interactionsReport.pairs || []).map((p: any) => (
                      <tr key={`${p.adminId}-${p.firmId}`}>
                        <td className="px-3 py-2 text-sm text-foreground">{p.adminEmail}</td>
                        <td className="px-3 py-2 text-sm text-foreground">{p.firmName || p.firmId}</td>
                        <td className="px-3 py-2 text-sm text-foreground">{p.invitesSent}</td>
                        <td className="px-3 py-2 text-sm text-foreground">{Number(p.allocationsBaseAmount || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-sm text-foreground">{Number(p.paymentsBaseAmount || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-sm text-foreground">{Number(p.salesBaseAmount || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                    {(interactionsReport.pairs || []).length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-3 text-center text-sm text-muted">No interactions in this period</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-muted">
                Note: allocations/payments/sales are counted only when the acting user was an admin/superadmin.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
