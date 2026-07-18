/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format, isValid } from 'date-fns';
import {
  PlaneTakeoff,
  ArrowRightLeft,
  Wallet,
  AlertCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatMoney } from '@/lib/format';
import KpiCard from './KpiCard';
import DashboardRightPanel from './DashboardRightPanel';

type MoneyRow = { currency: string; total: number };
type DebtRow = { firmId: string; firmName: string; ownerFirmId?: string; ownerFirmName?: string; currency: string; charged: number; paid: number; currentDebt: number };
type UpcomingFlight = { id: string; flightNumber: string; route: string; departure: string; arrival?: string | null; airline?: { name?: string | null } | null; ownerFirm?: { name?: string | null } | null };

type DashboardNotification = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  urgent: boolean;
  href: string;
};

type DashboardActivity = {
  id: string;
  title: string;
  subtitle: string;
  createdAt: string;
  href: string;
};

type DashboardReport = {
  todos: Array<{ key: string; label: string; count: number; amount?: number; href: string }>;
  notifications?: DashboardNotification[];
  activityFeed?: DashboardActivity[];
  counts?: { notifications: number; messages: number };
  summary?: {
    totalSales: MoneyRow[];
    totalPurchases: MoneyRow[];
    paymentsReceived: MoneyRow[];
    paymentsMade: MoneyRow[];
    receivableTotals: MoneyRow[];
    payableTotals: MoneyRow[];
  };
  upcomingFlights?: UpcomingFlight[];
  debts?: { receivables: DebtRow[]; payables: DebtRow[] };
  pendingAllocations?: { total: number };
};

const TX_TYPE_UZ: Record<string, string> = {
  SALE: 'Sotuv',
  PAYABLE: 'Qarz',
  PAYMENT: "To'lov",
  ADJUSTMENT: 'Tuzatish',
  ALLOCATION: 'Ajratma',
};

// Safe date formatter to prevent crashes on invalid dates
const safeFormat = (date: any, formatStr: string) => {
  if (!date) return '-';
  const d = new Date(date);
  return isValid(d) ? format(d, formatStr) : '-';
};

export default function AdoHomeDashboard() {
  const { user } = useAuth();
  const { tr, language } = useLanguage();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardReport | null>(null);
  const [recentTx, setRecentTx] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const reqs = [
          api.get<DashboardReport>('/reports/dashboard'),
          api.get('/transactions', { params: { page: 1, limit: 8 } }),
        ];
        const results = await Promise.all(reqs);
        setDashboard(results[0].data || null);
        
        // The transactions endpoint returns { data: [...], meta: { ... } }
        const txResponseData = results[1].data;
        setRecentTx(Array.isArray(txResponseData) ? txResponseData : (txResponseData?.data || []));
      } catch (err: any) {
        console.error('Dashboard load error:', err);
        toast.error(tr('Failed to load dashboard', 'Panel yuklanmadi'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user, tr]);

  const fmtAmounts = (rows: MoneyRow[] | undefined) => rows?.length
    ? rows.map((row) => `${Number(row.total || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${row.currency}`).join(' · ')
    : '0';

  const panelNotifications = useMemo(() => {
    const fromApi = dashboard?.notifications || [];
    return fromApi.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      time: safeFormat(n.createdAt, 'dd MMM, HH:mm'),
      urgent: n.urgent,
      href: n.href,
    }));
  }, [dashboard?.notifications]);

  const paymentHref = '/kassa';
  const todayLabel = format(new Date(), language === 'uz' ? 'd MMMM yyyy, EEEE' : 'MMMM d, yyyy — EEEE');

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#C9A84C]/30 border-t-[#C9A84C]" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="page-intro flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="page-eyebrow">{tr('Operations desk', 'Operatsion markaz')}</p>
            <h1 className="page-title mt-1 text-3xl text-foreground md:text-4xl">
              {tr('Welcome', 'Xush kelibsiz')}, {user?.email?.split('@')[0] || 'Admin'}
            </h1>
            <p className="mt-1 text-sm text-muted capitalize">{todayLabel}</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-signal">
              ADO-SYSTEM · {tr('powered by ADO-FINANCE', 'ADO-FINANCE tomonidan')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title={tr('Total sales', 'Jami sotuv')}
            value={fmtAmounts(dashboard?.summary?.totalSales)}
            icon={<PlaneTakeoff size={20} />}
            accent="gold"
            href="/reports"
          />
          <KpiCard
            title={tr('Payments received', "Olingan to'lovlar")}
            value={fmtAmounts(dashboard?.summary?.paymentsReceived)}
            icon={<Wallet size={20} />}
            accent="green"
            href={paymentHref}
          />
          <KpiCard
            title={tr('Receivables', 'Olinadigan qarz')}
            value={fmtAmounts(dashboard?.summary?.receivableTotals)}
            subtitle={tr('Firms owe us', 'Bizdan qarzi bor firmalar')}
            icon={<ArrowRightLeft size={20} />}
            accent="blue"
            href="/reports"
          />
          <KpiCard
            title={tr('Payables', 'To‘lanadigan qarz')}
            value={fmtAmounts(dashboard?.summary?.payableTotals)}
            subtitle={tr('We owe airlines / firms', 'Biz qarz bo‘lgan airline / firmalar')}
            icon={<AlertCircle size={20} />}
            accent="red"
            href="/reports"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <UpcomingFlightsTable rows={dashboard?.upcomingFlights || []} tr={tr} />
          <DashboardDebtTable title={tr('Firms owing us', 'Bizdan qarzdorlar')} rows={dashboard?.debts?.receivables || []} kind="receivable" tr={tr} />
          <DashboardDebtTable title={tr('Firms we owe', 'Biz qarz bo‘lganlar')} rows={dashboard?.debts?.payables || []} kind="payable" tr={tr} />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <div className="space-y-6 xl:col-span-8">
            <div className="data-panel">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h3 className="text-sm font-bold text-foreground">{tr('Recent operations', "So'nggi operatsiyalar")}</h3>
                <Link href="/transactions" className="text-xs font-semibold text-signal hover:underline">
                  {tr('View all', 'Hammasi')}
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="excel-table">
                  <thead>
                    <tr className="border-b border-border bg-surface-2/50 text-left text-[10px] uppercase tracking-wider text-muted">
                      <th className="px-5 py-3">{tr('Type', 'Turi')}</th>
                      <th className="px-5 py-3">{tr('Description', 'Tavsif')}</th>
                      <th className="px-5 py-3">{tr('Amount', 'Summa')}</th>
                      <th className="px-5 py-3">{tr('Date', 'Sana')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {recentTx.map((tx) => {
                      const amt = Number(tx.baseAmount ?? tx.base_amount ?? 0);
                      const positive = tx.type === 'SALE' || tx.type === 'PAYMENT';
                      return (
                        <tr
                          key={tx.id}
                          onClick={() => router.push(`/transactions/detail?id=${tx.id}`)}
                          className="cursor-pointer hover:bg-surface-2/40"
                        >
                          <td className="px-5 py-3 font-medium text-foreground">
                            {language === 'uz' ? TX_TYPE_UZ[tx.type] || tx.type : tx.type}
                          </td>
                          <td className="max-w-[200px] truncate px-5 py-3 text-muted">
                            {tx.firm?.name || tx.flight?.flightNumber || tx.id?.slice(0, 8)}
                          </td>
                          <td className={`px-5 py-3 font-semibold ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
                            {positive ? '+' : '-'}{formatMoney(Math.abs(amt))}
                          </td>
                          <td className="px-5 py-3 text-muted">{safeFormat(tx.createdAt, 'dd.MM.yyyy')}</td>
                        </tr>
                      );
                    })}
                    {recentTx.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-5 py-8 text-center text-muted">
                          {tr('No transactions yet', "Hali tranzaksiyalar yo'q")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="xl:col-span-4">
            <DashboardRightPanel
              tr={tr}
              todos={dashboard?.todos || []}
              notifications={panelNotifications}
              dueItems={[]}
            />
          </div>
        </div>
      </div>
    </>
  );
}

function UpcomingFlightsTable({ rows, tr }: { rows: UpcomingFlight[]; tr: (en: string, uz: string) => string }) {
  return (
    <div className="data-panel overflow-hidden">
      <div className="border-b border-border px-4 py-3"><h3 className="text-sm font-bold text-foreground">{tr('Next 5 flights', 'Eng yaqin uchadigan 5 ta reys')}</h3></div>
      <div className="overflow-x-auto"><table className="excel-table"><thead><tr><th>{tr('Flight', 'Reys')}</th><th>{tr('Departure', 'Uchish')}</th></tr></thead>
        <tbody>{rows.length ? rows.slice(0, 5).map((flight) => <tr key={flight.id}>
          <td><Link href={`/flights/detail?id=${encodeURIComponent(flight.id)}`} className="font-semibold text-foreground hover:text-signal">{flight.flightNumber}</Link><div className="text-xs text-muted">{flight.route} · {flight.airline?.name || flight.ownerFirm?.name || '-'}</div></td>
          <td className="whitespace-nowrap">{safeFormat(flight.departure, 'dd.MM.yyyy HH:mm')}</td>
        </tr>) : <tr><td colSpan={2} className="text-center text-muted">{tr('No upcoming flights', 'Yaqin reys yo‘q')}</td></tr>}</tbody>
      </table></div>
    </div>
  );
}

function DashboardDebtTable({ title, rows, kind, tr }: { title: string; rows: DebtRow[]; kind: 'receivable' | 'payable'; tr: (en: string, uz: string) => string }) {
  return (
    <div className="data-panel overflow-hidden">
      <div className="border-b border-border px-4 py-3"><h3 className="text-sm font-bold text-foreground">{title}</h3><p className="mt-1 text-xs text-muted">{tr('Largest balance first', 'Qarzi kattadan kichikka')}</p></div>
      <div className="overflow-x-auto"><table className="excel-table"><thead><tr><th>{tr('Airline / firm', 'Airline / firma')}</th><th>{tr('Paid', 'To‘langan')}</th><th>{tr('Current debt', 'Hozirgi qarz')}</th></tr></thead>
        <tbody>{rows.length ? rows.slice(0, 5).map((row) => <tr key={`${row.ownerFirmId || ''}-${row.firmId}-${row.currency}`}>
          <td className="font-semibold">{row.firmName}<div className="text-xs font-normal text-muted">{kind === 'receivable' ? `${row.firmName} → ${row.ownerFirmName || tr('Us', 'Biz')}` : `${row.ownerFirmName || tr('Us', 'Biz')} → ${row.firmName}`}</div></td>
          <td className="whitespace-nowrap font-mono">{Number(row.paid || 0).toLocaleString()} {row.currency}</td>
          <td className={`whitespace-nowrap font-mono font-bold ${kind === 'receivable' ? 'text-red-400' : 'text-amber-400'}`}>{Number(row.currentDebt || 0).toLocaleString()} {row.currency}</td>
        </tr>) : <tr><td colSpan={3} className="text-center text-muted">{tr('No debt', 'Qarz yo‘q')}</td></tr>}</tbody>
      </table></div>
    </div>
  );
}
