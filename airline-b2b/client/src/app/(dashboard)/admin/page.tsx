"use client";

import { useEffect, useState } from 'react';
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

type DashboardTodo = {
  key: string;
  label: string;
  count: number;
  amount?: number;
};

type DashboardDueFirm = {
  firmId: string;
  firmName: string | null;
  debt: number;
  paid: number;
  outstanding: number;
};

type DashboardPending = {
  firmId: string;
  firmName: string | null;
  flightId: string;
  flightNumber: string | null;
  departure: string | null;
  count: number;
};

type DashboardReport = {
  role: string;
  todos: DashboardTodo[];
  pendingAllocations?: {
    total: number;
    byFirmFlight?: DashboardPending[];
  };
  duePayments?: {
    totalOutstanding: number;
    byFirm?: DashboardDueFirm[];
  };
};

export default function AdminDashboard() {
  const [report, setReport] = useState<MonthlyReportRow[] | null>(null);
  const [dashboard, setDashboard] = useState<DashboardReport | null>(null);
  const [loading, setLoading] = useState(true);

  const [rateDate, setRateDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [rateTargetCurrency, setRateTargetCurrency] = useState<string>('UZS');
  const [rateValue, setRateValue] = useState<string>('');
  const [savingRate, setSavingRate] = useState(false);

  const [calendarReloadKey, setCalendarReloadKey] = useState(0);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const [monthlyRes, dashboardRes] = await Promise.all([
          api.get<MonthlyReportRow[]>('/reports/monthly'),
          api.get<DashboardReport>('/reports/dashboard'),
        ]);
        setReport(monthlyRes.data);
        setDashboard(dashboardRes.data);
      } catch {
        toast.error('Failed to load reports');
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, []);

  const submitRate = async () => {
    if (savingRate) return;
    const targetCurrency = rateTargetCurrency.trim().toUpperCase();
    const rate = rateValue.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rateDate)) {
      toast.error('Select a valid date');
      return;
    }
    if (!/^[A-Z]{3}$/.test(targetCurrency)) {
      toast.error('Target currency must be a 3-letter code');
      return;
    }
    if (!rate || !Number.isFinite(Number(rate)) || Number(rate) <= 0) {
      toast.error('Enter a valid exchange rate');
      return;
    }

    try {
      setSavingRate(true);
      await api.post('/currency-rates', {
        baseCurrency: 'USD',
        targetCurrency,
        rate,
        date: rateDate,
        source: 'manual',
      });
      toast.success('Exchange rate saved');
      setRateValue('');
      setCalendarReloadKey((k) => k + 1);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to save exchange rate');
    } finally {
      setSavingRate(false);
    }
  };

  if (loading) return <div>Loading reports...</div>;

  const dueFirms = dashboard?.duePayments?.byFirm || [];
  const pending = dashboard?.pendingAllocations?.byFirmFlight || [];
  const todos = dashboard?.todos || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Admin Overview</h2>
          <p className="mt-1 text-sm text-muted">Quick links and monthly reports.</p>
        </div>
        <Link
          href="/firms"
          className="inline-flex items-center justify-center px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-lg font-medium transition"
        >
          Firms
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Placeholder summary cards until we process monthly real data */}
        <div className="bg-surface-2 border border-border overflow-hidden rounded-lg px-4 py-5 sm:p-6">
          <dt className="text-sm font-medium text-muted truncate">Total Reporting Periods</dt>
          <dd className="mt-1 text-3xl font-semibold text-foreground">{report?.length || 0}</dd>
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
              <div className="text-sm font-semibold text-foreground">Pending confirmations</div>
              <div className="mt-2 space-y-2">
                {pending.slice(0, 6).map((p) => (
                  <div key={`${p.firmId}:${p.flightId}`} className="text-sm text-foreground">
                    <div className="flex items-center justify-between gap-3">
                      <div className="truncate">
                        {p.firmName || p.firmId} · {p.flightNumber || p.flightId}
                      </div>
                      <div className="font-semibold">{p.count}</div>
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

        <div className="bg-surface-2 border border-border overflow-hidden rounded-lg px-4 py-5 sm:p-6">
          <h3 className="text-lg font-semibold text-foreground">Exchange rate</h3>
          <p className="mt-1 text-sm text-muted">Save the daily USD→currency rate.</p>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-sm font-medium text-muted">Date</label>
              <input
                type="date"
                value={rateDate}
                onChange={(e) => setRateDate(e.target.value)}
                className="mt-1 w-full bg-surface border border-border rounded-lg px-3 py-2 text-foreground"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted">Target</label>
              <input
                value={rateTargetCurrency}
                onChange={(e) => setRateTargetCurrency(e.target.value)}
                placeholder="UZS"
                className="mt-1 w-full bg-surface border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted">Rate</label>
              <input
                type="number"
                step="0.000001"
                min={0}
                value={rateValue}
                onChange={(e) => setRateValue(e.target.value)}
                placeholder="e.g. 12500"
                className="mt-1 w-full bg-surface border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={submitRate}
              disabled={savingRate}
              className="px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-lg font-medium transition disabled:opacity-50"
            >
              {savingRate ? 'Saving…' : 'Save rate'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-surface-2 border border-border max-w-full overflow-x-auto rounded-lg">
        <div className="px-4 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">Due payments</h3>
          <p className="mt-1 text-sm text-muted">Firms with outstanding balance (USD).</p>
        </div>
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-surface">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Firm</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Debt</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Paid</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Outstanding</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {dueFirms.slice(0, 12).map((f) => (
              <tr key={f.firmId}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">{f.firmName || f.firmId}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">{Number(f.debt || 0).toFixed(2)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">{Number(f.paid || 0).toFixed(2)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground font-semibold">{Number(f.outstanding || 0).toFixed(2)}</td>
              </tr>
            ))}
            {dueFirms.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-4 text-center text-sm text-muted">No due payments</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <DashboardCalendar title="Activity calendar" reloadKey={calendarReloadKey} />
      
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
            {report?.map((r, idx: number) => (
              <tr key={idx}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">{r.month}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">{Number(r.allocations).toFixed(2)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">{Number(r.sales).toFixed(2)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">{Number(r.payments).toFixed(2)}</td>
              </tr>
            ))}
            {(!report || report.length === 0) && (
              <tr>
                <td colSpan={4} className="px-6 py-4 text-center text-sm text-muted">
                  No data available yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
