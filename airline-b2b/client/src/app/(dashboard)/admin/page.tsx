/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { format } from 'date-fns';
import DashboardCalendar from '@/components/dashboard/DashboardCalendar';
import CollapsibleCard from '@/components/ui/CollapsibleCard';
import { useLanguage } from '@/contexts/LanguageContext';

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

type CancellationRequest = {
  id: string;
  ticketId: string;
  flightId: string;
  firmId: string;
  reason: string;
  createdAt: string;
  firm?: { name?: string | null } | null;
};

export default function AdminDashboard() {
  const { tr } = useLanguage();
  const [report, setReport] = useState<MonthlyReportRow[] | null>(null);
  const [dashboard, setDashboard] = useState<DashboardReport | null>(null);
  const [cancelRequests, setCancelRequests] = useState<CancellationRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [rateDate, setRateDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [rateTargetCurrency, setRateTargetCurrency] = useState<string>('USD');
  const [rateValue, setRateValue] = useState<string>('');
  const [savingRate, setSavingRate] = useState(false);

  const [calendarReloadKey, setCalendarReloadKey] = useState(0);
  const [decisionReasons, setDecisionReasons] = useState<Record<string, string>>({});
  const [approvingRequestId, setApprovingRequestId] = useState<string | null>(null);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const [monthlyRes, dashboardRes, cancelRes] = await Promise.all([
          api.get<MonthlyReportRow[]>('/reports/monthly'),
          api.get<DashboardReport>('/reports/dashboard'),
          api.get<CancellationRequest[]>('/tickets/cancel-sale-requests?status=PENDING').catch(() => ({ data: [] })),
        ]);
        setReport(monthlyRes.data);
        setDashboard(dashboardRes.data);
        setCancelRequests(Array.isArray(cancelRes.data) ? cancelRes.data : []);
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
        baseCurrency: 'UZS',
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

  const approveCancellation = async (request: CancellationRequest) => {
    if (approvingRequestId) return;
    const decisionReason = (decisionReasons[request.id] || request.reason || '').trim();
    if (!decisionReason) {
      toast.error('Enter a reason before approving');
      return;
    }

    try {
      setApprovingRequestId(request.id);
      await api.post('/tickets/cancel-sale-requests/approve', {
        requestId: request.id,
        decisionReason,
      });
      toast.success('Cancellation approved');
      setCancelRequests((rows) => rows.filter((row) => row.id !== request.id));
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to approve cancellation');
    } finally {
      setApprovingRequestId(null);
    }
  };

  if (loading) return <div>{tr('Loading reports...', 'Hisobotlar yuklanmoqda...')}</div>;

  const dueFirms = dashboard?.duePayments?.byFirm || [];
  const pending = dashboard?.pendingAllocations?.byFirmFlight || [];
  const todos = dashboard?.todos || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">{tr('Admin Overview', "Admin ko'rinishi")}</h2>
          <p className="mt-1 text-sm text-muted">{tr('Quick links and monthly reports.', 'Tezkor havolalar va oylik hisobotlar.')}</p>
        </div>
        <Link
          href="/firms"
          className="inline-flex items-center justify-center px-4 py-2 bg-primary hover:bg-primary-hover text-ink font-bold uppercase tracking-wider rounded-lg font-medium transition"
        >
          {tr('Firms', 'Firmalar')}
        </Link>
      </div>

      <CollapsibleCard
        title={tr('Start here', 'Boshlash')}
        description={tr('A quick checklist for the daily flow.', 'Kundalik jarayon uchun tezkor ro\'yxat.')}
        defaultOpen={false}
        storageKey="jetstream-admin-start-here-open"
        className="shadow sm:rounded-lg"
      >
        <ol className="space-y-2 text-sm text-foreground list-decimal list-inside">
          <li>
            <Link href="/firms" className="hover:underline">
              {tr('Create a firm invite', 'Firma taklifini yarating')}
            </Link>
            <span className="text-muted"> — {tr('generate a one-time link.', 'bir martalik havola yarating.')}</span>
          </li>
          <li>
            <Link href="/flights" className="hover:underline">
              {tr('Create a flight', 'Reys yarating')}
            </Link>
            <span className="text-muted"> — {tr('then open it to allocate tickets.', 'so\'ng chiptalarni ajratish uchun oching.')}</span>
          </li>
          <li>
            <Link href="/kassa" className="hover:underline">
              {tr('Open kassa and record payments', "Kassani oching va to'lovlarni qayd eting")}
            </Link>
            <span className="text-muted"> — {tr('keep balances accurate.', 'balansni aniq saqlang.')}</span>
          </li>
          <li>
            <Link href="/reports" className="hover:underline">
              {tr('Review reports', 'Hisobotlarni ko\'ring')}
            </Link>
            <span className="text-muted"> — {tr('check performance and debt.', 'natija va qarzni tekshiring.')}</span>
          </li>
        </ol>
      </CollapsibleCard>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Placeholder summary cards until we process monthly real data */}
        <div className="bg-surface-2 border border-border overflow-hidden rounded-lg px-4 py-5 sm:p-6">
          <dt className="text-sm font-medium text-muted truncate">{tr('Total Reporting Periods', 'Hisobot davrlari soni')}</dt>
          <dd className="mt-1 text-3xl font-semibold text-foreground">{report?.length || 0}</dd>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <CollapsibleCard
          title={tr('Todo', 'Vazifalar')}
          defaultOpen={false}
          storageKey="jetstream-admin-todo-open"
          className="overflow-hidden"
          contentClassName="px-4 py-5 sm:p-6"
        >
          <div className="space-y-2">
            {todos.map((t) => (
              <div key={t.key} className="flex items-center justify-between text-sm text-foreground">
                <span>{t.label}</span>
                <span className="font-semibold">
                  {typeof t.amount === 'number' ? `${t.amount.toFixed(2)} UZS` : t.count}
                </span>
              </div>
            ))}
            {todos.length === 0 && (
              <div className="text-sm text-muted">{tr('No todos', "Vazifalar yo'q")}</div>
            )}
          </div>

          {pending.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <div className="text-sm font-semibold text-foreground">{tr('Pending confirmations', 'Kutilayotgan tasdiqlar')}</div>
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
                  <div className="text-xs text-muted">{tr(`+${pending.length - 6} more`, `+${pending.length - 6} ta yana`)}</div>
                )}
              </div>
            </div>
          )}
        </CollapsibleCard>

        <CollapsibleCard
          title={tr('Exchange rate', 'Valyuta kursi')}
          description={tr('Save the daily currency→UZS rate (UZS per 1 currency).', 'Kundalik valyuta→UZS kursini saqlang (1 valyuta uchun UZS).')}
          defaultOpen={false}
          storageKey="jetstream-admin-exchange-rate-open"
          className="overflow-hidden"
          contentClassName="px-4 py-5 sm:p-6"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-sm font-medium text-muted">{tr('Date', 'Sana')}</label>
              <input
                type="date"
                value={rateDate}
                onChange={(e) => setRateDate(e.target.value)}
                className="mt-1 w-full bg-surface border border-border rounded-lg px-3 py-2 text-foreground"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted">{tr('Currency', 'Valyuta')}</label>
              <input
                value={rateTargetCurrency}
                onChange={(e) => setRateTargetCurrency(e.target.value)}
                placeholder="USD"
                className="mt-1 w-full bg-surface border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted">{tr('Rate', 'Kurs')}</label>
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
              className="px-4 py-2 bg-primary hover:bg-primary-hover text-ink font-bold uppercase tracking-wider rounded-lg font-medium transition disabled:opacity-50"
            >
              {savingRate ? tr('Saving…', 'Saqlanmoqda…') : tr('Save rate', 'Kursni saqlash')}
            </button>
          </div>
        </CollapsibleCard>
      </div>

      <CollapsibleCard
        title={tr('Due payments', "To'lanishi kerak")}
        description={tr('Firms with outstanding balance (UZS).', 'Qoldiq qarzi bor firmalar (UZS).')}
        defaultOpen={false}
        storageKey="jetstream-admin-due-payments-open"
        contentClassName="p-0"
      >
        <div className="max-w-full overflow-x-auto">
          <table className="excel-table">
            <thead className="bg-surface">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">{tr('Firm', 'Firma')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">{tr('Debt', 'Qarz')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">{tr('Paid', "To'langan")}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">{tr('Outstanding', 'Qoldiq')}</th>
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
                  <td colSpan={4} className="px-6 py-4 text-center text-sm text-muted">{tr('No due payments', "Qarz to'lovlari yo'q")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CollapsibleCard>

      <div className="border border-border bg-surface">
        <div className="border-b border-border px-3 py-2 flex items-center justify-between">
          <h3 className="text-base font-bold text-foreground">{tr('Cancellation requests', 'Bekor qilish so\'rovlari')}</h3>
          <span className="font-mono text-sm text-muted">{cancelRequests.length}</span>
        </div>
        <div className="overflow-x-auto scroller-minimal">
          <table className="excel-table">
            <thead>
              <tr>
                <th>{tr('Date', 'Sana')}</th>
                <th>{tr('Firm', 'Firma')}</th>
                <th>{tr('Flight', 'Reys')}</th>
                <th>{tr('Ticket', 'Chipta')}</th>
                <th>{tr('Firm reason', 'Firma sababi')}</th>
                <th>{tr('Admin reason', 'Admin sababi')}</th>
                <th>{tr('Action', 'Amal')}</th>
              </tr>
            </thead>
            <tbody>
              {cancelRequests.map((request) => (
                <tr key={request.id}>
                  <td>{format(new Date(request.createdAt), 'yyyy-MM-dd HH:mm')}</td>
                  <td>{request.firm?.name || request.firmId}</td>
                  <td>{request.flightId}</td>
                  <td>{request.ticketId.slice(0, 8)}...</td>
                  <td className="max-w-[260px] truncate" title={request.reason}>{request.reason}</td>
                  <td>
                    <input
                      value={decisionReasons[request.id] ?? request.reason}
                      onChange={(e) => setDecisionReasons((draft) => ({ ...draft, [request.id]: e.target.value }))}
                      className="h-8 min-w-[220px] border border-border bg-surface px-2 text-sm text-foreground outline-none focus:border-primary"
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => approveCancellation(request)}
                      disabled={approvingRequestId === request.id}
                      className="border border-border bg-surface-2 px-2 py-1 text-xs font-semibold text-foreground hover:bg-surface disabled:opacity-50"
                    >
                      {approvingRequestId === request.id ? tr('Approving', 'Tasdiqlanmoqda') : tr('Approve', 'Tasdiqlash')}
                    </button>
                  </td>
                </tr>
              ))}
              {cancelRequests.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-muted">{tr('No pending requests', "Kutilayotgan so'rovlar yo'q")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <DashboardCalendar
        title={tr('Activity calendar', 'Faollik taqvimi')}
        reloadKey={calendarReloadKey}
        defaultOpen={false}
        storageKey="jetstream-admin-calendar-open"
      />

      <CollapsibleCard
        title={tr('Monthly report', 'Oylik hisobot')}
        defaultOpen={false}
        storageKey="jetstream-admin-monthly-open"
        contentClassName="p-0"
      >
        <div className="max-w-full overflow-x-auto">
          <table className="excel-table">
            <thead className="bg-surface">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">{tr('Month', 'Oy')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">{tr('Allocations (Debt)', 'Ajratmalar (Qarz)')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">{tr('Sales (Revenue)', 'Sotuvlar (Daromad)')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">{tr('Payments', "To'lovlar")}</th>
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
                    {tr('No data available yet', "Hali ma'lumot yo'q")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CollapsibleCard>
    </div>
  );
}
