"use client";

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { format } from 'date-fns';
import DashboardCalendar from '@/components/dashboard/DashboardCalendar';

type MonthlyReportRow = {
  month: string;
  allocations: number | string;
  sales: number | string;
  payments: number | string;
};

type FirmReport = {
  firm?: { id: string; name: string };
  totals?: {
    debt?: number | string;
    revenue?: number | string;
    paid?: number | string;
    outstanding?: number | string;
    profit?: number | string;
  };
  tickets?: {
    assigned?: number;
    sold?: number;
    unsold?: number;
    total?: number;
  };
  byFlight?: Array<{
    flightId: string;
    flightNumber: string | null;
    departure: string | null;
    arrival: string | null;
    debt: number | string;
    revenue: number | string;
    paid: number | string;
    outstanding: number | string;
    profit: number | string;
    ticketsAssigned: number;
    ticketsSold: number;
  }>;
};

type DashboardTodo = {
  key: string;
  label: string;
  count: number;
  amount?: number;
};

type DashboardPendingFlight = {
  flightId: string;
  flightNumber: string | null;
  departure: string | null;
  count: number;
};

type DashboardDueFlight = {
  flightId: string;
  flightNumber: string | null;
  departure: string | null;
  debt: number;
  paid: number;
  outstanding: number;
};

type DashboardReport = {
  role: string;
  todos: DashboardTodo[];
  pendingAllocations?: {
    total: number;
    byFlight?: DashboardPendingFlight[];
  };
  duePayments?: {
    totalOutstanding: number;
    byFlight?: DashboardDueFlight[];
  };
};

export default function FirmDashboard() {
  const [monthly, setMonthly] = useState<MonthlyReportRow[] | null>(null);
  const [firmReport, setFirmReport] = useState<FirmReport | null>(null);
  const [dashboard, setDashboard] = useState<DashboardReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmingFlightId, setConfirmingFlightId] = useState<string | null>(null);

  const fetchReport = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    try {
      if (!silent) setLoading(true);
      const [monthlyRes, firmRes, dashRes] = await Promise.all([
        api.get<MonthlyReportRow[]>('/reports/monthly'),
        api.get<FirmReport>('/reports/firm'),
        api.get<DashboardReport>('/reports/dashboard'),
      ]);

      setMonthly(monthlyRes.data);
      setFirmReport(firmRes.data);
      setDashboard(dashRes.data);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error('Failed to load reports');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const confirmPendingAllocations = async (flightId: string, quantity: number) => {
    if (!flightId || !Number.isFinite(quantity) || quantity <= 0) return;
    if (confirmingFlightId) return;

    setConfirmingFlightId(flightId);
    try {
      const res = await api.post('/tickets/confirm', { flightId, quantity });
      const count = res?.data?.count ?? quantity;
      toast.success(`Confirmed ${count} ticket(s)`);
      await fetchReport({ silent: true });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to confirm allocations');
    } finally {
      setConfirmingFlightId(null);
    }
  };

  if (loading) return <div>Loading reports...</div>;

  const totals = firmReport?.totals || {};
  const tickets = firmReport?.tickets || {};
  const byFlight = Array.isArray(firmReport?.byFlight) ? firmReport?.byFlight : [];

  const todos = dashboard?.todos || [];
  const pending = dashboard?.pendingAllocations?.byFlight || [];
  const dueFlights = dashboard?.duePayments?.byFlight || [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-foreground">Firm Overview</h2>
        <p className="mt-1 text-sm text-muted">Your firm-scoped KPIs and monthly breakdown.</p>
      </div>
      
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-surface-2 border border-border overflow-hidden rounded-lg px-4 py-5 sm:p-6">
          <dt className="text-sm font-medium text-muted truncate">Tickets assigned</dt>
          <dd className="mt-1 text-3xl font-semibold text-foreground">{tickets.assigned ?? 0}</dd>
        </div>
        <div className="bg-surface-2 border border-border overflow-hidden rounded-lg px-4 py-5 sm:p-6">
          <dt className="text-sm font-medium text-muted truncate">Tickets sold</dt>
          <dd className="mt-1 text-3xl font-semibold text-foreground">{tickets.sold ?? 0}</dd>
        </div>
        <div className="bg-surface-2 border border-border overflow-hidden rounded-lg px-4 py-5 sm:p-6">
          <dt className="text-sm font-medium text-muted truncate">Debt (USD)</dt>
          <dd className="mt-1 text-3xl font-semibold text-foreground">${Number(totals.debt || 0).toFixed(2)}</dd>
        </div>
        <div className="bg-surface-2 border border-border overflow-hidden rounded-lg px-4 py-5 sm:p-6">
          <dt className="text-sm font-medium text-muted truncate">Outstanding (USD)</dt>
          <dd className="mt-1 text-3xl font-semibold text-foreground">${Number(totals.outstanding || 0).toFixed(2)}</dd>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="bg-surface-2 border border-border overflow-hidden rounded-lg px-4 py-5 sm:p-6">
          <h3 className="text-lg font-semibold text-foreground">Todo</h3>
          <div className="mt-3 space-y-2">
            {todos.map((t) => (
              <div key={t.key} className="flex items-center justify-between text-sm text-foreground">
                <span>{t.label}</span>
                <span className="font-semibold">
                  {typeof t.amount === 'number' ? `${t.amount.toFixed(2)} USD` : t.count}
                </span>
              </div>
            ))}
            {todos.length === 0 && (
              <div className="text-sm text-muted">No todos</div>
            )}
          </div>

          {pending.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <div className="text-sm font-semibold text-foreground">Pending allocations</div>
              <div className="mt-2 space-y-2">
                {pending.slice(0, 6).map((p) => (
                  <div key={p.flightId} className="text-sm text-foreground">
                    <div className="flex items-center justify-between gap-3">
                      <Link href={`/flights/detail?id=${p.flightId}`} className="hover:underline truncate">
                        {p.flightNumber || p.flightId}
                      </Link>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="font-semibold">{p.count}</div>
                        <button
                          type="button"
                          onClick={() => confirmPendingAllocations(p.flightId, p.count)}
                          disabled={Boolean(confirmingFlightId)}
                          className="px-2 py-1 bg-yellow-600/20 text-yellow-300 hover:bg-yellow-600/40 rounded transition border border-yellow-600/50 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {confirmingFlightId === p.flightId ? 'Confirming…' : 'Confirm'}
                        </button>
                      </div>
                    </div>
                    {p.departure && (
                      <div className="text-xs text-muted">{format(new Date(p.departure), 'PPP')}</div>
                    )}
                  </div>
                ))}
                {pending.length > 6 && (
                  <div className="text-xs text-muted">+{pending.length - 6} more</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="bg-surface-2 border border-border max-w-full overflow-x-auto rounded-lg">
          <div className="px-4 py-4 border-b border-border">
            <h3 className="text-lg font-semibold text-foreground">Due payments</h3>
            <p className="mt-1 text-sm text-muted">Flights with outstanding balance (USD).</p>
          </div>
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-surface">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Flight</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Debt</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Paid</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {dueFlights.slice(0, 10).map((f) => (
                <tr key={f.flightId}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                    <Link href={`/flights/detail?id=${f.flightId}`} className="hover:underline">
                      {f.flightNumber || f.flightId}
                    </Link>
                    {f.departure && (
                      <div className="text-xs text-muted">{format(new Date(f.departure), 'PPP')}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">{Number(f.debt || 0).toFixed(2)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">{Number(f.paid || 0).toFixed(2)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground font-semibold">{Number(f.outstanding || 0).toFixed(2)}</td>
                </tr>
              ))}
              {dueFlights.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-center text-sm text-muted">No due payments</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-surface-2 border border-border max-w-full overflow-x-auto rounded-lg">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-surface">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Month</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Allocations (Debt)</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Sales (Revenue)</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Payments</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {monthly?.map((r, idx: number) => (
              <tr key={idx}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">{r.month}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">{Number(r.allocations).toFixed(2)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">{Number(r.sales).toFixed(2)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">{Number(r.payments).toFixed(2)}</td>
              </tr>
            ))}
            {(!monthly || monthly.length === 0) && (
              <tr>
                <td colSpan={4} className="px-6 py-4 text-center text-sm text-muted">
                  No data available yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-xl font-semibold text-foreground">By flight</h3>
          <p className="mt-1 text-sm text-muted">
            Ticket inventory and financials per flight (firm-scoped).
          </p>
        </div>

        <div className="bg-surface-2 border border-border max-w-full overflow-x-auto rounded-lg">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-surface">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Flight</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Departure</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Tickets</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Debt (USD)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Paid (USD)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Outstanding (USD)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {byFlight.map((row) => {
                const dep = row.departure ? format(new Date(row.departure), 'PPP') : '-';
                const debt = Number(row.debt || 0);
                const paid = Number(row.paid || 0);
                const outstanding = Number(row.outstanding || 0);
                const flightLabel = row.flightNumber || row.flightId;
                const unsold = Math.max(0, (row.ticketsAssigned || 0) - (row.ticketsSold || 0));
                return (
                  <tr key={row.flightId}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                      <Link
                        href={`/flights/detail?id=${row.flightId}`}
                        className="hover:underline"
                      >
                        {flightLabel}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">{dep}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                      {row.ticketsSold || 0} sold / {unsold} unsold
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">{debt.toFixed(2)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">{paid.toFixed(2)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">{outstanding.toFixed(2)}</td>
                  </tr>
                );
              })}

              {byFlight.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-sm text-muted">
                    No flight data yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <DashboardCalendar title="Activity calendar" />
    </div>
  );
}
