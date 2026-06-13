/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  PlaneTakeoff,
  ArrowRightLeft,
  Wallet,
  AlertCircle,
  Settings2,
} from 'lucide-react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatMoney, pctChange } from '@/lib/format';
import KpiCard from './KpiCard';
import SimpleLineChart from './SimpleLineChart';
import SimpleDonutChart from './SimpleDonutChart';
import DashboardRightPanel from './DashboardRightPanel';
import QuickActionBar from './QuickActionBar';

type MonthlyRow = { month: string; allocations: number | string; sales: number | string; payments: number | string };

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
  duePayments?: {
    totalOutstanding: number;
    byFirm?: Array<{ firmId: string; firmName: string | null; outstanding: number }>;
    byFlight?: Array<{ flightId: string; flightNumber: string | null; outstanding: number; departure: string | null }>;
  };
  pendingAllocations?: { total: number };
};

const TX_TYPE_UZ: Record<string, string> = {
  SALE: 'Sotuv',
  PAYABLE: 'Qarz',
  PAYMENT: "To'lov",
  ADJUSTMENT: 'Tuzatish',
  ALLOCATION: 'Ajratma',
};

export default function AdoHomeDashboard() {
  const { user } = useAuth();
  const { tr, language } = useLanguage();
  const router = useRouter();
  const isAdmin = user?.role !== 'firm';
  const [loading, setLoading] = useState(true);
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [dashboard, setDashboard] = useState<DashboardReport | null>(null);
  const [recentTx, setRecentTx] = useState<any[]>([]);
  const [firmTotals, setFirmTotals] = useState<{ outstanding?: number; revenue?: number; paid?: number; debt?: number } | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const reqs: Promise<unknown>[] = [
          api.get<MonthlyRow[]>('/reports/monthly'),
          api.get<DashboardReport>('/reports/dashboard'),
          api.get('/transactions', { params: { page: 1, limit: 8 } }),
        ];
        if (!isAdmin) reqs.push(api.get('/reports/firm'));
        const results = await Promise.all(reqs);
        setMonthly((results[0] as any).data || []);
        setDashboard((results[1] as any).data || null);
        const txRes = results[2] as { data: any[] };
        setRecentTx(txRes.data || []);
        if (!isAdmin && results[3]) {
          setFirmTotals((results[3] as any).data?.totals ?? null);
        }
      } catch {
        toast.error(tr('Failed to load dashboard', 'Panel yuklanmadi'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isAdmin, tr]);

  const sortedMonthly = useMemo(
    () => [...monthly].sort((a, b) => String(a.month).localeCompare(String(b.month))),
    [monthly],
  );

  const latest = sortedMonthly[sortedMonthly.length - 1];
  const prev = sortedMonthly[sortedMonthly.length - 2];

  const totals = useMemo(() => {
    const sales = Number(latest?.sales ?? 0);
    const payments = Number(latest?.payments ?? 0);
    const allocations = Number(latest?.allocations ?? 0);
    const outstanding = dashboard?.duePayments?.totalOutstanding ?? (isAdmin ? 0 : Number(firmTotals?.outstanding ?? 0));
    return { sales, payments, allocations, outstanding };
  }, [latest, dashboard, firmTotals, isAdmin]);

  const chartData = useMemo(() => {
    return sortedMonthly.slice(-7).map((m) => ({
      label: String(m.month).slice(5),
      income: Number(m.sales),
      expense: Number(m.payments) + Number(m.allocations) * 0.3,
    }));
  }, [sortedMonthly]);

  const donutSlices = useMemo(() => {
    const s = Number(latest?.sales ?? 0);
    const p = Number(latest?.payments ?? 0);
    const a = Number(latest?.allocations ?? 0);
    return [
      { label: tr('Sales', 'Sotuvlar'), value: s, color: '#34d399' },
      { label: tr('Payments', "To'lovlar"), value: p, color: '#38bdf8' },
      { label: tr('Allocations', 'Ajratmalar'), value: a, color: '#C9A84C' },
    ].filter((x) => x.value > 0);
  }, [latest, tr]);

  const panelNotifications = useMemo(() => {
    const fromApi = dashboard?.notifications || [];
    return fromApi.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      time: format(new Date(n.createdAt), 'dd MMM, HH:mm'),
      urgent: n.urgent,
      href: n.href,
    }));
  }, [dashboard?.notifications]);

  const dueItems = useMemo(() => {
    const firms = dashboard?.duePayments?.byFirm;
    if (firms?.length) {
      return firms.slice(0, 4).map((f) => ({
        id: f.firmId,
        title: f.firmName || f.firmId,
        amount: f.outstanding,
        href: `/transactions?firmId=${encodeURIComponent(f.firmId)}&type=payment`,
      }));
    }
    const flights = dashboard?.duePayments?.byFlight;
    return (flights || []).slice(0, 4).map((f) => ({
      id: f.flightId,
      title: f.flightNumber || tr('Flight', 'Reys'),
      detail: f.departure ? format(new Date(f.departure), 'dd MMM yyyy') : undefined,
      amount: f.outstanding,
      href: `/flights/detail?id=${encodeURIComponent(f.flightId)}`,
    }));
  }, [dashboard, tr]);

  const paymentHref = isAdmin ? '/transactions?type=payment' : '/transactions?openPayment=1';
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
      <div className="space-y-6 pb-24">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl font-bold text-foreground md:text-3xl">
              {tr('Welcome', 'Xush kelibsiz')}, {user?.email?.split('@')[0] || 'Admin'}! 👋
            </h1>
            <p className="mt-1 text-sm text-muted capitalize">{todayLabel}</p>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D4AF37]/80">
              ADO-SYSTEM · {tr('powered by ADO-FINANCE', 'ADO-FINANCE tomonidan')}
            </p>
          </div>
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-foreground hover:border-[#C9A84C]/40"
          >
            <Settings2 size={14} />
            {tr('Customize', 'Sozlash')}
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title={tr('Ticket sales (month)', 'Chipta sotuvlari (oy)')}
            value={formatMoney(totals.sales)}
            trend={prev ? pctChange(Number(latest?.sales), Number(prev?.sales)) : null}
            icon={<PlaneTakeoff size={20} />}
            accent="gold"
            href="/reports"
          />
          <KpiCard
            title={tr('Payments received', "Olingan to'lovlar")}
            value={formatMoney(totals.payments)}
            trend={prev ? pctChange(Number(latest?.payments), Number(prev?.payments)) : null}
            icon={<Wallet size={20} />}
            accent="green"
            href={paymentHref}
          />
          <KpiCard
            title={tr('Allocations (debt)', 'Ajratmalar (qarz)')}
            value={formatMoney(totals.allocations)}
            subtitle={tr('Assigned ticket debt', 'Ajratilgan chipta qarzi')}
            icon={<ArrowRightLeft size={20} />}
            accent="blue"
            href="/transactions?type=payable"
          />
          <KpiCard
            title={tr('Outstanding balance', 'Qoldiq qarz')}
            value={formatMoney(totals.outstanding)}
            subtitle={totals.outstanding > 0 ? tr('Action required', 'Harakat talab qilinadi') : undefined}
            icon={<AlertCircle size={20} />}
            accent="red"
            href={paymentHref}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <div className="space-y-6 xl:col-span-8">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <SimpleLineChart
                title={tr('Cash flow', 'Pul oqimi')}
                subtitle={tr('Income vs outflows by month', 'Oylik kirim va chiqim')}
                data={chartData}
              />
              <SimpleDonutChart
                title={tr('Structure (current month)', 'Tuzilma (joriy oy)')}
                subtitle={tr('Sales, payments, allocations', "Sotuv, to'lov, ajratma")}
                slices={donutSlices.length ? donutSlices : [{ label: tr('No data', "Ma'lumot yo'q"), value: 1, color: '#3f3f46' }]}
              />
            </div>

            <div className="rounded-2xl border border-border bg-surface shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h3 className="text-sm font-bold text-foreground">{tr('Recent operations', "So'nggi operatsiyalar")}</h3>
                <Link href="/transactions" className="text-xs font-semibold text-[#D4AF37] hover:underline">
                  {tr('View all', 'Hammasi')}
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
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
                          <td className="px-5 py-3 text-muted">{format(new Date(tx.createdAt), 'dd.MM.yyyy')}</td>
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
              dueItems={dueItems}
            />
          </div>
        </div>
      </div>
      <QuickActionBar tr={tr} isAdmin={isAdmin} />
    </>
  );
}
