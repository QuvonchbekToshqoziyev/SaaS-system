/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Activity, ArrowRightLeft, BarChart3, Building2, PlaneTakeoff, ReceiptText, RefreshCw, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatNumber } from '@/lib/format';

type FlightOption = { id: string; flightNumber: string };
type FirmOption = { id: string; name: string };
type BranchOption = { id: string; name: string; code?: string | null; firmId?: string | null; firm?: { name?: string | null } | null };

type TabKey = 'health' | 'profitability' | 'cash-flow' | 'expense-estimate' | 'debt' | 'agents' | 'flight-profitability';

const tabs: Array<{ key: TabKey; icon: any; labelEn: string; labelUz: string }> = [
  { key: 'health', icon: Activity, labelEn: 'Financial health', labelUz: 'Moliyaviy holat' },
  { key: 'profitability', icon: BarChart3, labelEn: 'Profitability', labelUz: 'Foyda va rentabellik' },
  { key: 'cash-flow', icon: Wallet, labelEn: 'Cash flow', labelUz: 'Pul oqimi' },
  { key: 'expense-estimate', icon: ReceiptText, labelEn: 'Expense estimate', labelUz: 'Xarajatlar smetasi' },
  { key: 'debt', icon: ArrowRightLeft, labelEn: 'Receivables / Payables', labelUz: 'Debitor / Kreditor' },
  { key: 'agents', icon: Building2, labelEn: 'Agent ledger', labelUz: 'Agentlar hisoboti' },
  { key: 'flight-profitability', icon: PlaneTakeoff, labelEn: 'Flight profitability', labelUz: 'Reys rentabelligi' },
];

function normalizeDateParam(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return raw.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || '';
}

function fmt(value: unknown, suffix = ' UZS') {
  return `${formatNumber(value as number)}${suffix}`;
}

function fmtAmounts(values: any[] | undefined) {
  if (!Array.isArray(values) || values.length === 0) return '0';
  return values.map((row) => `${formatNumber(row.total || 0, 2)} ${row.currency || 'UZS'}`).join(' · ');
}

function amountText(amount: unknown, currency = 'UZS') {
  return `${formatNumber(amount as number, 2)} ${currency || 'UZS'}`;
}

function buildAgentTimeline(agent: any) {
  if (!agent) return [];
  const rows: Array<{ id: string; date: string; operation: string; debit: string; credit: string; settlement: string; balance: string }> = [];
  const push = (row: any) => rows.push(row);
  for (const row of [...(agent.flightPurchases || []), ...(agent.ticketPurchases || []), ...(agent.tourPurchases || []), ...(agent.servicePurchases || [])]) {
    const amount = row.totalAmount ?? row.total ?? Number(row.quantity || 0) * Number(row.unitPrice || 0);
    push({ id: `purchase-${row.id}`, date: row.createdAt, operation: row.flightNumber ? `Biz undan oldik: ${row.flightNumber}` : `Biz undan oldik: ${row.packageName || row.name || 'xizmat'}`, debit: 'Xarid / Inventory', credit: 'Kreditorlik', settlement: '—', balance: amountText(amount, row.currency) });
  }
  for (const row of [...(agent.serviceSales || [])]) {
    const amount = row.totalAmount ?? Number(row.quantity || 0) * Number(row.unitPrice || 0);
    push({ id: `sale-${row.id}`, date: row.createdAt, operation: `Biz unga sotdik: ${row.name || row.serviceType || 'xizmat'}`, debit: 'Debitorlik', credit: 'Revenue', settlement: '—', balance: amountText(amount, row.currency) });
  }
  for (const row of [...(agent.paymentsReceived || [])]) {
    push({ id: `received-${row.id}`, date: row.createdAt, operation: 'Pul to‘lovi olindi', debit: row.sourceMode || row.paymentMethod || 'Kassa/Bank', credit: 'Debitorlik', settlement: amountText(row.amount, row.currency), balance: amountText(row.amount, row.currency) });
  }
  for (const row of [...(agent.paymentsMade || [])]) {
    push({ id: `made-${row.id}`, date: row.createdAt, operation: 'Pul to‘lovi qilindi', debit: 'Kreditorlik', credit: row.sourceMode || row.paymentMethod || 'Kassa/Bank', settlement: amountText(row.amount, row.currency), balance: amountText(row.amount, row.currency) });
  }
  for (const row of [...(agent.settlements || [])]) {
    push({ id: `settlement-${row.id}`, date: row.createdAt, operation: row.operationType || 'SETTLEMENT', debit: 'Kreditorlik', credit: 'Debitorlik', settlement: amountText(row.amount, row.currency), balance: amountText(row.amount, row.currency) });
  }
  return rows.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
}

function pct(value: unknown) {
  if (value == null || !Number.isFinite(Number(value))) return 'Ma’lumot yo‘q';
  return `${Number(value).toFixed(1)}%`;
}

function ratioValue(value: unknown) {
  if (value == null || !Number.isFinite(Number(value))) return 'Ma’lumot yo‘q';
  return formatNumber(value as number, 2);
}

function delta(current: unknown, previous: unknown) {
  const c = Number(current || 0);
  const p = Number(previous || 0);
  return c - p;
}

function KpiCard({ label, value, detail, trend, status = 'neutral' }: { label: string; value: string; detail?: string; trend?: string; status?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const tone = status === 'good' ? 'text-emerald-500' : status === 'warn' ? 'text-amber-500' : status === 'bad' ? 'text-red-500' : 'text-muted';
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
        <span className={`rounded border border-border px-2 py-0.5 text-[10px] uppercase ${tone}`}>{status === 'good' ? 'yaxshi' : status === 'warn' ? 'ehtiyot' : status === 'bad' ? 'xavf' : 'me’yorda'}</span>
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight text-foreground">{value}</div>
      {detail && <p className="mt-1 text-xs text-muted">{detail}</p>}
      {trend && <p className={`mt-2 text-xs font-semibold ${tone}`}>{trend}</p>}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="h-32 animate-pulse rounded-lg border border-border bg-surface" />
      ))}
    </div>
  );
}

function MultiLineChart({ title, data, series }: { title: string; data: any[]; series: Array<{ key: string; label: string; color: string }> }) {
  const w = 720;
  const h = 220;
  const pad = { t: 18, r: 18, b: 32, l: 52 };
  const points = data.length ? data : [{ label: '-', month: '-', empty: 0 }];
  const values = points.flatMap((point) => series.map((s) => Number(point[s.key] || 0)));
  const max = Math.max(1, ...values.map(Math.abs));
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const xAt = (i: number) => pad.l + (i / Math.max(1, points.length - 1)) * innerW;
  const yAt = (v: number) => pad.t + innerH / 2 - (v / max) * (innerH / 2);
  const path = (key: string) => points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(Number(p[key] || 0))}`).join(' ');
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        <div className="flex flex-wrap gap-3 text-[11px] text-muted">
          {series.map((s) => <span key={s.key} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}</span>)}
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" aria-hidden>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = pad.t + innerH * t;
          return <line key={t} x1={pad.l} x2={w - pad.r} y1={y} y2={y} stroke="currentColor" className="text-border" strokeWidth="1" />;
        })}
        <line x1={pad.l} x2={w - pad.r} y1={yAt(0)} y2={yAt(0)} stroke="currentColor" className="text-muted" strokeWidth="1" />
        {series.map((s) => <path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />)}
        {points.map((p, i) => (
          <text key={`${p.month || p.label}-${i}`} x={xAt(i)} y={h - 8} textAnchor="middle" className="fill-muted text-[10px]">
            {p.label || String(p.month || '').slice(5)}
          </text>
        ))}
      </svg>
    </div>
  );
}

function Bars({ title, data, keys }: { title: string; data: any[]; keys: Array<{ key: string; label: string; color: string }> }) {
  const rows = data.length ? data : [{ label: '-', month: '-' }];
  const max = Math.max(1, ...rows.flatMap((row) => keys.map((k) => Math.abs(Number(row[k.key] || 0)))));
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="mb-4 text-sm font-bold text-foreground">{title}</h3>
      <div className="flex h-56 items-end gap-2 overflow-x-auto pb-2">
        {rows.map((row, index) => (
          <div key={`${row.month || row.label}-${index}`} className="flex min-w-[44px] flex-1 flex-col items-center gap-2">
            <div className="flex h-44 w-full items-end justify-center gap-1">
              {keys.map((k) => {
                const height = Math.max(2, (Math.abs(Number(row[k.key] || 0)) / max) * 170);
                return <span key={k.key} className="w-2 rounded-t" style={{ height, background: k.color }} title={`${k.label}: ${row[k.key] || 0}`} />;
              })}
            </div>
            <span className="text-[10px] text-muted">{row.label || String(row.month || '').slice(5)}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted">
        {keys.map((k) => <span key={k.key} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: k.color }} />{k.label}</span>)}
      </div>
    </div>
  );
}

function DebtStructure({ rows }: { rows: any[] }) {
  const total = rows.reduce((sum, row) => sum + Math.max(0, Number(row.value || 0)), 0) || 1;
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="text-sm font-bold text-foreground">Qarzlar tarkibi</h3>
      <div className="mt-4 space-y-3">
        {rows.map((row) => {
          const width = `${Math.max(1, (Math.max(0, Number(row.value || 0)) / total) * 100)}%`;
          return (
            <div key={row.label}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-muted">{row.label}</span>
                <span className="font-mono text-foreground">{fmt(row.value)}</span>
              </div>
              <div className="h-2 rounded bg-surface-2"><div className="h-2 rounded bg-primary" style={{ width }} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { user } = useAuth();
  const { tr } = useLanguage();
  const searchParams = useSearchParams();
  const role = String(user?.role || '').toLowerCase();
  const isAdmin = role === 'admin' || role === 'superadmin';
  const canAccess = role === 'firm' || isAdmin;
  const canReconcile = isAdmin || (role === 'firm' && String((user as any)?.firmRole || 'MANAGER').toUpperCase() !== 'KASSIR');

  const now = new Date();
  const [activeTab, setActiveTab] = useState<TabKey>(searchParams.get('flightId') ? 'flight-profitability' : 'health');
  const [firms, setFirms] = useState<FirmOption[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [flights, setFlights] = useState<FlightOption[]>([]);
  const [companyId, setCompanyId] = useState(searchParams.get('companyId') || searchParams.get('firmId') || '');
  const [branchId, setBranchId] = useState(searchParams.get('branchId') || searchParams.get('kassaDeskId') || '');
  const [flightId, setFlightId] = useState(searchParams.get('flightId') || '');
  const [year, setYear] = useState(searchParams.get('year') || String(now.getFullYear()));
  const [month, setMonth] = useState(searchParams.get('month') || '');
  const [dateFrom, setDateFrom] = useState(normalizeDateParam(searchParams.get('dateFrom') || ''));
  const [dateTo, setDateTo] = useState(normalizeDateParam(searchParams.get('dateTo') || ''));
  const [currency, setCurrency] = useState(searchParams.get('currency') || '');
  const [report, setReport] = useState<any>(null);
  const [expenseEstimate, setExpenseEstimate] = useState<any>(null);
  const [expenseDetail, setExpenseDetail] = useState<any>(null);
  const [loadingExpenseDetail, setLoadingExpenseDetail] = useState(false);
  const [agentLedger, setAgentLedger] = useState<any>(null);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [flightInventory, setFlightInventory] = useState<any>(null);
  const [flightReport, setFlightReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [reconciling, setReconciling] = useState(false);

  useEffect(() => {
    if (!canAccess) return;
    const loadMeta = async () => {
      try {
        setLoadingMeta(true);
        const [flightsRes, firmsRes, desksRes] = await Promise.all([
          api.get('/flights'),
          isAdmin ? api.get('/firms') : Promise.resolve({ data: [] }),
          api.get('/kassa/desks').catch(() => ({ data: [] })),
        ]);
        setFlights((flightsRes.data || []).filter((f: any) => f?.id || f?.flight_id).map((f: any) => ({ id: String(f.id || f.flight_id), flightNumber: String(f.flightNumber || f.id || f.flight_id) })));
        setFirms(isAdmin ? (firmsRes.data || []).filter((f: any) => f?.id).map((f: any) => ({ id: String(f.id), name: String(f.name || f.id) })) : []);
        setBranches((desksRes.data || []).filter((d: any) => d?.id).map((d: any) => ({ id: String(d.id), name: String(d.name || d.id), code: d.code, firmId: d.firmId, firm: d.firm })));
      } catch (error: any) {
        toast.error(error?.response?.data?.error || tr('Failed to load report options', 'Hisobot parametrlarini yuklab bo\'lmadi'));
      } finally {
        setLoadingMeta(false);
      }
    };
    loadMeta();
  }, [canAccess, isAdmin, tr]);

  const queryString = useMemo(() => {
    const q = new URLSearchParams();
    if (isAdmin && companyId) q.set('companyId', companyId);
    if (branchId) q.set('branchId', branchId);
    if (flightId) q.set('flightId', flightId);
    if (year) q.set('year', year);
    if (month) q.set('month', month);
    if (dateFrom) q.set('dateFrom', dateFrom);
    if (dateTo) q.set('dateTo', dateTo);
    if (currency) q.set('currency', currency.toUpperCase());
    return q.toString();
  }, [branchId, companyId, currency, dateFrom, dateTo, flightId, isAdmin, month, year]);

  const loadReport = useCallback(async () => {
    if (!canAccess) return;
    try {
      setLoading(true);
      const flightParams = new URLSearchParams();
      if (flightId) flightParams.set('flight_id', flightId);
      if (isAdmin && companyId) flightParams.set('firm_id', companyId);
      const [res, flightRes, agentRes, expenseRes] = await Promise.all([
        api.get(`/reports/analytics?${queryString}`),
        flightId ? api.get(`/reports/flight?${flightParams.toString()}`) : Promise.resolve({ data: null }),
        (!isAdmin || companyId) ? api.get('/reports/agents', { params: companyId ? { companyId } : undefined }) : Promise.resolve({ data: null }),
        api.get(`/reports/expense-estimate?${queryString}`),
      ]);
      setReport(res.data);
      setExpenseEstimate(expenseRes.data);
      setAgentLedger(agentRes.data || null);
      setFlightReport(flightRes.data || null);
      setFlightInventory(flightRes.data?.inventorySummary || null);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || tr('Failed to load reports', 'Hisobotlarni yuklab bo\'lmadi'));
    } finally {
      setLoading(false);
    }
  }, [canAccess, companyId, flightId, isAdmin, queryString, tr]);

  const runReconciliation = useCallback(async () => {
    if (!flightId || !canReconcile) return;
    try {
      setReconciling(true);
      const response = await api.post('/reports/flight/reconcile', { flightId, ...(isAdmin && companyId ? { firmId: companyId } : {}) });
      setFlightReport((current: any) => ({
        ...(current || {}),
        reconciliation: { ...response.data, issues: response.data?.discrepancies || [] },
      }));
      toast.success(response.data?.required
        ? tr('Reconciliation completed: discrepancies found', 'Tekshiruv tugadi: farqlar topildi')
        : tr('Reconciliation completed: no discrepancies', 'Tekshiruv tugadi: farq topilmadi'));
    } catch (error: any) {
      toast.error(error?.response?.data?.error || tr('Reconciliation failed', 'Hisobni tekshirib bo‘lmadi'));
    } finally {
      setReconciling(false);
    }
  }, [canReconcile, companyId, flightId, isAdmin, tr]);

  const openExpenseDetail = useCallback(async (row: any) => {
    const categoryId = row?.categoryId || 'UNCLASSIFIED';
    try {
      setLoadingExpenseDetail(true);
      const detailQuery = new URLSearchParams(queryString);
      const response = await api.get(`/reports/expense-estimate/categories/${encodeURIComponent(categoryId)}/details?${detailQuery.toString()}`);
      setExpenseDetail({ category: row, ...response.data });
    } catch (error: any) {
      toast.error(error?.response?.data?.error || tr('Failed to load expense details', 'Xarajat tafsilotlarini yuklab bo‘lmadi'));
    } finally {
      setLoadingExpenseDetail(false);
    }
  }, [queryString, tr]);

  useEffect(() => {
    if (!loadingMeta) loadReport();
  }, [loadReport, loadingMeta]);

  const p = report?.profitability || {};
  const l = report?.liquidity || {};
  const d = report?.debt || {};
  const cf = report?.cashFlow || {};
  const rcv = report?.receivables || {};
  const pay = report?.payables || {};
  const eff = report?.efficiency || {};
  const monthly = report?.monthly || [];
  const flightsRows = report?.flightProfitability || [];
  const agents = agentLedger?.agents || [];
  const selectedAgent = agents.find((agent: any) => agent.id === selectedAgentId) || null;
  const selectedAgentTimeline = useMemo(() => buildAgentTimeline(selectedAgent), [selectedAgent]);

  if (!canAccess) {
    return (
      <div className="text-foreground">
        <h2 className="text-3xl font-bold">{tr('Financial Report', 'Moliyaviy Hisobot')}</h2>
        <p className="mt-2 text-muted">{tr('You do not have access to reports.', 'Hisobotlarga kirish huquqingiz yo\'q.')}</p>
      </div>
    );
  }

  const renderHealth = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Aktivlar rentabelligi (ROA)" value={pct(p.roa)} detail={`Sof foyda: ${fmt(p.netProfit)} · O‘rtacha aktivlar: ${fmt(p.supportingValues?.averageAssets)}`} trend={`${delta(p.netProfit, p.previous?.netProfit).toLocaleString()} oldingi davrga nisbatan`} />
        <KpiCard label="O‘z mablag‘i rentabelligi (ROE)" value={pct(p.roe)} detail={`Sof foyda: ${fmt(p.netProfit)} · O‘rtacha o‘z mablag‘i: ${fmt(p.supportingValues?.averageEquity)}`} />
        <KpiCard label="Joriy likvidlik" value={ratioValue(l.currentRatio)} detail={`Joriy aktivlar: ${fmt(l.currentAssets)}`} />
        <KpiCard label="Tezkor likvidlik" value={ratioValue(l.quickRatio)} detail="Pul + olinadigan qarzlar / majburiyatlar" />
        <KpiCard label="Qarzning aktivlarga nisbati" value={pct(d.debtToAssets)} detail={`Majburiyatlar: ${fmt(d.totalLiabilities)}`} />
        <KpiCard label="Qarzning o‘z mablag‘iga nisbati" value={ratioValue(d.debtToEquity)} />
        <KpiCard label="Sof aylanma mablag‘" value={fmt(l.workingCapital)} detail="Joriy aktivlar − joriy majburiyatlar" />
        <KpiCard label="Sof qarz" value={fmt(d.netDebt)} detail="Foizli qarz − pul mablag‘i" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {[
          ['FOYDA VA RENTABELLIK', [['Yalpi foyda marjasi', pct(p.grossMargin)], ['Operatsion marja', pct(p.operatingMargin)], ['Sof foyda marjasi', pct(p.netMargin)], ['Aktivlar rentabelligi', pct(p.roa)], ['O‘z mablag‘i rentabelligi', pct(p.roe)]]],
          ['LIKVIDLIK', [['Joriy likvidlik', ratioValue(l.currentRatio)], ['Tezkor likvidlik', ratioValue(l.quickRatio)], ['Aylanma mablag‘', fmt(l.workingCapital)], ['Pul qoldig‘i', fmt(l.cash)]]],
          ['QARZLAR', [['Qarz / aktivlar', pct(d.debtToAssets)], ['Qarz / o‘z mablag‘i', ratioValue(d.debtToEquity)], ['Sof qarz', fmt(d.netDebt)], ['Ta’minotchilarga qarz', fmt(d.tradePayables)], ['Ta’sischidan qarz', fmt(d.founderDebt)], ['Bank qarzi', fmt(d.bankDebt)]]],
          ['PUL OQIMI', [['Asosiy faoliyat', fmt(cf.operating)], ['Investitsiya', fmt(cf.investing)], ['Moliyalashtirish', fmt(cf.financing)], ['Sof pul oqimi', fmt(cf.netCashFlow)], ['Erkin pul oqimi', fmt(cf.freeCashFlow)]]],
          ['OLINADIGAN / TO‘LANADIGAN QARZLAR', [['Jami olinadigan qarz', fmt(rcv.total)], ['Muddati o‘tgan olinadigan qarz', fmt(rcv.overdue)], ['Jami to‘lanadigan qarz', fmt(pay.total)], ['Muddati o‘tgan to‘lanadigan qarz', fmt(pay.overdue)]]],
          ['SAMARADORLIK', [['Bilet sotilish darajasi', pct(eff.ticketSellThrough)], ['Turpaket sotilish darajasi', pct(eff.packageSellThrough)], ['Bir yo‘lovchidan tushum', fmt(eff.revenuePerPassenger)], ['Bir yo‘lovchidan foyda', fmt(eff.profitPerPassenger)]]],
        ].map(([title, rows]: any) => (
          <div key={title} className="rounded-lg border border-border bg-surface p-4">
            <h3 className="text-sm font-bold text-foreground">{title}</h3>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {rows.map(([label, value]: [string, string]) => <div key={label} className="flex justify-between gap-3 border-b border-border/60 py-2 text-sm"><span className="text-muted">{label}</span><span className="font-semibold text-foreground">{value}</span></div>)}
            </div>
          </div>
        ))}
      </div>
      <DebtStructure rows={d.debtStructure || []} />
    </div>
  );

  const renderProfitability = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Tushum" value={fmt(p.revenue)} trend={`${delta(p.revenue, p.previous?.revenue).toLocaleString()} oldingi davrga nisbatan`} />
        <KpiCard label="Sotilgan xizmatlar tannarxi" value={fmt(p.cogs)} />
        <KpiCard label="Yalpi foyda" value={fmt(p.grossProfit)} />
        <KpiCard label="Yalpi foyda marjasi" value={pct(p.grossMargin)} />
        <KpiCard label="Operatsion foyda" value={fmt(p.operatingProfit)} />
        <KpiCard label="Operatsion marja" value={pct(p.operatingMargin)} />
        <KpiCard label="Sof foyda" value={fmt(p.netProfit)} />
        <KpiCard label="Sof foyda marjasi" value={pct(p.netMargin)} />
      </div>
      <Bars title="Tushum, tannarx va yalpi foyda" data={monthly} keys={[{ key: 'revenue', label: 'Tushum', color: '#34d399' }, { key: 'cogs', label: 'Tannarx', color: '#f87171' }, { key: 'grossProfit', label: 'Yalpi foyda', color: '#facc15' }]} />
      <MultiLineChart title="Foyda marjasi o‘zgarishi" data={monthly} series={[{ key: 'grossMargin', label: 'Yalpi', color: '#34d399' }, { key: 'operatingMargin', label: 'Operatsion', color: '#60a5fa' }, { key: 'netMargin', label: 'Sof', color: '#facc15' }]} />
      <MultiLineChart title="Oylik sof foyda" data={monthly} series={[{ key: 'netProfit', label: 'Sof foyda', color: '#34d399' }]} />
    </div>
  );

  const renderCashFlow = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Boshlang‘ich pul qoldig‘i" value={fmt(cf.openingCash)} />
        <KpiCard label="Asosiy faoliyat pul oqimi" value={fmt(cf.operating)} />
        <KpiCard label="Investitsiya pul oqimi" value={fmt(cf.investing)} />
        <KpiCard label="Moliyalashtirish pul oqimi" value={fmt(cf.financing)} />
        <KpiCard label="Sof pul oqimi" value={fmt(cf.netCashFlow)} />
        <KpiCard label="Yakuniy pul qoldig‘i" value={fmt(cf.closingCash)} />
        <KpiCard label="Erkin pul oqimi" value={fmt(cf.freeCashFlow)} />
      </div>
      <MultiLineChart title="12 oylik pul oqimi" data={monthly} series={[{ key: 'operatingCashFlow', label: 'Asosiy faoliyat', color: '#34d399' }, { key: 'investingCashFlow', label: 'Investitsiya', color: '#60a5fa' }, { key: 'financingCashFlow', label: 'Moliyalashtirish', color: '#facc15' }, { key: 'netCashFlow', label: 'Sof oqim', color: '#f87171' }]} />
      <MultiLineChart title="Pul qoldig‘i o‘zgarishi" data={monthly} series={[{ key: 'closingCash', label: 'Yakuniy qoldiq', color: '#34d399' }]} />
    </div>
  );

  const renderExpenseEstimate = () => {
    const estimate = expenseEstimate || {};
    const kpi = estimate.kpis || {};
    return <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Jami rejalashtirilgan xarajat" value={fmt(kpi.budgetAmount)} />
        <KpiCard label="Jami haqiqiy xarajat" value={fmt(kpi.actualExpense)} />
        <KpiCard label="Farq" value={fmt(kpi.variance)} status={Number(kpi.variance) > 0 ? 'warn' : 'good'} />
        <KpiCard label="Budjetdan foydalanish" value={pct(kpi.budgetUsagePercent)} status={Number(kpi.budgetUsagePercent) > 100 ? 'bad' : 'neutral'} />
        <KpiCard label="Xarajat operatsiyalari" value={String(kpi.transactionCount || 0)} />
        <KpiCard label="O‘rtacha kunlik xarajat" value={fmt(kpi.averageDailyExpense)} />
        <KpiCard label="Eng katta kategoriya" value={kpi.largestCategory?.name || '—'} detail={fmt(kpi.largestCategory?.amount)} />
        <KpiCard label="Eski tasniflanmagan chiqim" value={fmt(kpi.unclassifiedOutflow)} detail="P&Lga avtomatik qo‘shilmadi" status={Number(kpi.unclassifiedOutflow) > 0 ? 'warn' : 'neutral'} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <div className="overflow-x-auto rounded-lg border border-border bg-surface"><table className="excel-table"><thead><tr><th>Kategoriya</th><th className="text-right">Amaldagi</th><th className="text-right">Budjet</th><th className="text-right">Farq</th><th className="text-right">Foydalanish</th><th className="text-right">Soni</th></tr></thead><tbody>{(estimate.categories || []).map((row: any) => <tr key={row.categoryId || row.code} onClick={() => openExpenseDetail(row)} className="cursor-pointer hover:bg-surface-2"><td><div className="font-semibold">{row.name}</div><div className="font-mono text-xs text-muted">{row.code}</div></td><td className="text-right font-mono">{fmt(row.amount)}</td><td className="text-right font-mono">{fmt(row.budget)}</td><td className={`text-right font-mono ${Number(row.variance) > 0 ? 'text-red-500' : 'text-emerald-500'}`}>{fmt(row.variance)}</td><td className="text-right">{pct(row.budgetUsagePercent)}</td><td className="text-right">{row.count}</td></tr>)}{!(estimate.categories || []).length && <tr><td colSpan={6} className="text-center text-muted">Tanlangan davr uchun tasniflangan xarajat yo‘q</td></tr>}</tbody></table></div>
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-surface p-4"><h3 className="text-sm font-bold">Original valyutalar</h3><div className="mt-3 space-y-2">{(estimate.byCurrency || []).map((row: any) => <div key={row.currency} className="flex justify-between border-b border-border/60 pb-2"><span>{row.currency}</span><strong>{Number(row.amount || 0).toLocaleString()}</strong></div>)}</div></div>
          <div className="rounded-lg border border-border bg-surface p-4"><h3 className="text-sm font-bold">Chiqim yo‘nalishlari</h3><div className="mt-3 space-y-2">{(estimate.byDirection || []).map((row: any) => <div key={row.direction} className="flex justify-between gap-3 border-b border-border/60 pb-2 text-sm"><span>{row.direction}</span><strong>{fmt(row.amount)}</strong></div>)}</div></div>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-surface p-3 text-sm text-muted">{estimate.note}</div>
      {loadingExpenseDetail && <div className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">Tafsilotlar yuklanmoqda...</div>}
      {expenseDetail && <ExpenseDetailPanel detail={expenseDetail} onClose={() => setExpenseDetail(null)} />}
    </div>;
  };

  const renderDebt = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Jami olinadigan qarz" value={agentLedger ? fmtAmounts(agentLedger.receivableTotals) : fmt(rcv.total)} />
        <KpiCard label="Muddati o‘tgan olinadigan qarz" value={fmt(rcv.overdue)} />
        <KpiCard label="Yaqinda olinadi" value={fmt(rcv.dueSoon)} />
        <KpiCard label="Undirish darajasi" value={pct(rcv.collectionRate)} />
        <KpiCard label="Jami to‘lanadigan qarz" value={agentLedger ? fmtAmounts(agentLedger.payableTotals) : fmt(pay.total)} />
        <KpiCard label="Muddati o‘tgan to‘lanadigan qarz" value={fmt(pay.overdue)} />
        <KpiCard label="Shu hafta to‘lanadi" value={fmt(pay.dueSoon)} />
        <KpiCard label="Asosiy ta’minotchi" value={agentLedger?.payables?.[0]?.firmName || (pay.rows?.[0]?.supplier ? pay.rows[0].supplier : 'Ma’lumot yo‘q')} />
      </div>
      {isAdmin && !companyId ? <div className="rounded-lg border border-border bg-surface p-8 text-center text-muted">Qarzdor firmalarni ko‘rish uchun kompaniyani tanlang.</div> : <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <CurrentDebtTable title="Olinadigan qarz — bizdan qarzi bor firmalar" rows={agentLedger?.receivables || []} kind="receivable" />
        <CurrentDebtTable title="To‘lanadigan qarz — biz qarz bo‘lgan firmalar" rows={agentLedger?.payables || []} kind="payable" />
      </div>}
    </div>
  );

  const renderAgents = () => (
    <div className="space-y-6">
      {isAdmin && !companyId ? <div className="rounded-lg border border-border bg-surface p-8 text-center text-muted">Agentlar hisoboti uchun kompaniyani tanlang.</div> : <>
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="excel-table">
            <thead><tr><th>Agent / firma</th><th>Eski qoldiq</th><th className="text-right">Sotilgan bilet</th><th className="text-right">Olgan biletimiz</th><th className="text-right">Jami tur</th><th>Jami sotuv</th><th>Jami xarid</th><th>O‘zaro hisobga olindi</th><th>Bilet bilan yopildi</th><th>Tur bilan yopildi</th><th>Xizmat bilan yopildi</th><th>Kompensatsiya</th><th>Pul bilan yopildi</th><th>Joriy debitorlik</th><th>Joriy kreditorlik</th><th>Net pozitsiya</th></tr></thead>
            <tbody>{agents.length ? agents.map((agent: any) => <tr key={agent.id} onClick={() => setSelectedAgentId(agent.id)} className={`cursor-pointer ${selectedAgentId === agent.id ? 'bg-primary/10' : ''}`}>
              <td className="font-semibold">{agent.name}</td><td className="font-mono">{fmtAmounts(agent.oldBalance)}</td><td className="text-right font-mono">{agent.ticketCount}</td><td className="text-right font-mono">{agent.purchasedTicketCount || 0}</td><td className="text-right font-mono">{agent.tourCount}</td><td className="font-mono">{fmtAmounts(agent.totalSales)}</td><td className="font-mono">{fmtAmounts(agent.totalPurchases)}</td><td className="font-mono">{fmtAmounts(agent.mutualOffset)}</td><td className="font-mono">{fmtAmounts(agent.ticketOffset)}</td><td className="font-mono">{fmtAmounts(agent.tourOffset)}</td><td className="font-mono">{fmtAmounts(agent.serviceOffset)}</td><td className="font-mono">{fmtAmounts(agent.compensation)}</td><td className="font-mono">{fmtAmounts(agent.cashSettled)}</td><td className="font-mono">{fmtAmounts(agent.receivable)}</td><td className="font-mono">{fmtAmounts(agent.payable)}</td><td className="font-mono font-bold">{fmtAmounts(agent.currentBalance)}</td>
            </tr>) : <tr><td colSpan={16} className="text-center text-muted">Hozircha agent hisob-kitobi mavjud emas</td></tr>}</tbody>
          </table>
        </div>
        {selectedAgent && <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
          <div><h3 className="text-xl font-bold">{selectedAgent.name}</h3><p className="text-sm text-muted">{agentLedger?.ownerFirm?.name} bilan joriy hisob: {fmtAmounts(selectedAgent.currentBalance)}</p></div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface-2 p-4"><div className="text-xs uppercase text-muted">Bizdan qarzi</div><div className="mt-1 text-lg font-bold text-red-500">{fmtAmounts(selectedAgent.receivable)}</div></div>
            <div className="rounded-lg border border-border bg-surface-2 p-4"><div className="text-xs uppercase text-muted">Bizning undan qarzimiz</div><div className="mt-1 text-lg font-bold text-amber-500">{fmtAmounts(selectedAgent.payable)}</div></div>
          </div>
          <div className="overflow-x-auto"><h4 className="mb-2 font-bold">Olgan reys va biletlar</h4><table className="excel-table"><thead><tr><th>Reys</th><th>Yo‘nalish</th><th className="text-right">Bilet soni</th><th>Qanchadan olgan</th><th>Jami qancha</th></tr></thead><tbody>{selectedAgent.ticketPurchases?.length ? selectedAgent.ticketPurchases.map((row: any) => <tr key={row.id}><td>{row.flightNumber}</td><td>{row.route}</td><td className="text-right">{row.quantity}</td><td>{row.priceRows?.map((price: any) => `${price.quantity} × ${Number(price.unitPrice).toLocaleString()} ${row.currency}`).join(' · ')}</td><td className="font-mono">{Number(row.totalAmount).toLocaleString()} {row.currency}</td></tr>) : <tr><td colSpan={5} className="text-center text-muted">Bilet olmagan</td></tr>}</tbody></table></div>
          <div className="overflow-x-auto"><h4 className="mb-2 font-bold">Olgan turlari</h4><table className="excel-table"><thead><tr><th>Tur</th><th>Qaysi reys turi</th><th className="text-right">Nechta</th><th>Qanchadan olgan</th><th>Jami qancha</th></tr></thead><tbody>{selectedAgent.tourPurchases?.length ? selectedAgent.tourPurchases.map((row: any) => <tr key={row.id}><td>{row.packageName}</td><td>{row.flightNumber || '-'} · {row.route || '-'}</td><td className="text-right">{row.quantity}</td><td className="font-mono">{Number(row.unitPrice).toLocaleString()} {row.currency}</td><td className="font-mono">{Number(row.totalAmount).toLocaleString()} {row.currency}</td></tr>) : <tr><td colSpan={5} className="text-center text-muted">Tur olmagan</td></tr>}</tbody></table></div>
          <AgentFlightPurchases rows={selectedAgent.flightPurchases || []} />
          <AgentServices purchases={selectedAgent.servicePurchases || []} sales={selectedAgent.serviceSales || []} />
          <AgentPayments received={selectedAgent.paymentsReceived || []} made={selectedAgent.paymentsMade || []} />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-border bg-surface-2 p-4"><div className="text-xs uppercase text-muted">Pul to‘lovlari</div><div className="mt-1 font-mono font-bold">{fmtAmounts(selectedAgent.cashSettled)}</div></div>
            <div className="rounded-lg border border-border bg-surface-2 p-4"><div className="text-xs uppercase text-muted">Bilet/tur/xizmat settlementlari</div><div className="mt-1 font-mono font-bold">{fmtAmounts([...(selectedAgent.ticketOffset || []), ...(selectedAgent.tourOffset || []), ...(selectedAgent.serviceOffset || [])])}</div></div>
            <div className="rounded-lg border border-border bg-surface-2 p-4"><div className="text-xs uppercase text-muted">O‘zaro hisobga olishlar</div><div className="mt-1 font-mono font-bold">{fmtAmounts(selectedAgent.mutualOffset)}</div></div>
            <div className="rounded-lg border border-border bg-surface-2 p-4"><div className="text-xs uppercase text-muted">Avanslar / kompensatsiya</div><div className="mt-1 font-mono font-bold">{fmtAmounts(selectedAgent.compensation)}</div></div>
          </div>
          <div className="overflow-x-auto"><h4 className="mb-2 font-bold">Settlementlar</h4><table className="excel-table"><thead><tr><th>Sana</th><th>Operatsiya</th><th className="text-right">Summa</th></tr></thead><tbody>{selectedAgent.settlements?.length ? selectedAgent.settlements.map((row: any) => <tr key={row.id}><td>{new Date(row.createdAt).toLocaleDateString('uz-UZ')}</td><td>{row.operationType}</td><td className="text-right font-mono">{amountText(row.amount, row.currency)}</td></tr>) : <tr><td colSpan={3} className="text-center text-muted">Settlement yo‘q</td></tr>}</tbody></table></div>
          <div className="overflow-x-auto"><h4 className="mb-2 font-bold">Timeline</h4><table className="excel-table"><thead><tr><th>Sana</th><th>Operatsiya</th><th>Debit</th><th>Credit</th><th>Settlement</th><th>Qoldiq</th></tr></thead><tbody>{selectedAgentTimeline.length ? selectedAgentTimeline.map((row) => <tr key={row.id}><td>{row.date ? new Date(row.date).toLocaleString('uz-UZ') : '—'}</td><td>{row.operation}</td><td>{row.debit}</td><td>{row.credit}</td><td className="font-mono">{row.settlement}</td><td className="font-mono">{row.balance}</td></tr>) : <tr><td colSpan={6} className="text-center text-muted">Timeline yozuvlari yo‘q</td></tr>}</tbody></table></div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface-2 p-4"><h4 className="mb-2 font-bold">Hujjatlar</h4><div className="font-mono text-lg font-bold">{selectedAgentTimeline.length}</div></div>
            <div className="rounded-lg border border-border bg-surface-2 p-4"><h4 className="mb-2 font-bold">Audit tarixi</h4><div className="font-mono text-lg font-bold">{selectedAgent.settlements?.length || 0}</div></div>
          </div>
        </div>}
      </>}
    </div>
  );

  const renderFlightProfitability = () => (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="excel-table">
          <thead>
            <tr>
              {['Reys', 'Aviakompaniya', 'Yo‘nalish', 'Jo‘nash', 'Biletlar', 'Bilet sotilishi', 'Turpaketlar', 'Turpaket sotilishi', 'Tushum', 'Tannarx', 'Yalpi foyda', 'Bevosita xarajat', 'Umumiy xarajat', 'Natija', 'Marja', 'Olinadigan qarz', 'To‘lanadigan qarz', 'Yo‘lovchidan tushum', 'Yo‘lovchidan foyda'].map((h) => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {flightsRows.length === 0 ? (
              <tr><td colSpan={19} className="text-center text-muted">{tr('Tanlangan davr uchun ma\'lumot mavjud emas', 'Tanlangan davr uchun ma\'lumot mavjud emas')}</td></tr>
            ) : flightsRows.map((row: any) => (
              <tr key={row.flightId}>
                <td className="font-semibold">{row.flightCode}</td>
                <td>{row.airline || '-'}</td>
                <td>{row.route || '-'}</td>
                <td>{row.departureDate ? new Date(row.departureDate).toLocaleDateString() : '-'}</td>
                <td>{row.soldTickets}/{row.purchasedTickets}</td>
                <td>{pct(row.ticketSellThrough)}</td>
                <td>{row.soldPackages}/{row.purchasedPackages}</td>
                <td>{pct(row.packageSellThrough)}</td>
                <td>{fmt(row.revenue)}</td>
                <td>{fmt(row.cogs)}</td>
                <td>{fmt(row.grossProfit)}</td>
                <td>{fmt(row.directExpenses)}</td>
                <td>{fmt(row.allocatedOverhead)}</td>
                <td className={Number(row.operatingResult || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}>{fmt(row.operatingResult)}</td>
                <td>{pct(row.margin)}</td>
                <td>{fmt(row.receivables)}</td>
                <td>{fmt(row.payables)}</td>
                <td>{row.revenuePerPassenger == null ? 'N/A' : fmt(row.revenuePerPassenger)}</td>
                <td>{row.profitPerPassenger == null ? 'N/A' : fmt(row.profitPerPassenger)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">{tr('Financial Report', 'Moliyaviy Hisobot')}</h2>
          <p className="mt-1 text-sm text-muted">{tr('Financial analysis based on current accounting records.', 'Amaldagi hisob ma\'lumotlari asosidagi moliyaviy tahlil.')}</p>
        </div>
        <button type="button" onClick={loadReport} className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-surface-2">
          <RefreshCw size={16} />
          {tr('Refresh', 'Yangilash')}
        </button>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="compact-toolbar">
          {isAdmin && (
            <div>
              <label className="compact-label">{tr('Company', 'Kompaniya')}</label>
              <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="compact-control min-w-[180px]">
                <option value="">{tr('All permitted companies', 'Ruxsat etilgan barcha kompaniyalar')}</option>
                {firms.map((firm) => <option key={firm.id} value={firm.id}>{firm.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="compact-label">{tr('Branch', 'Filial')}</label>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="compact-control min-w-[180px]">
              <option value="">{tr('All branches', 'Barcha filiallar')}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.firm?.name ? `${b.firm.name} · ` : ''}{b.name}{b.code ? ` (${b.code})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="compact-label">{tr('Year', 'Yil')}</label>
            <input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} className="compact-control w-24" />
          </div>
          <div>
            <label className="compact-label">{tr('Month', 'Oy')}</label>
            <select value={month} onChange={(e) => setMonth(e.target.value)} className="compact-control w-28">
              <option value="">{tr('Full year', 'Butun yil')}</option>
              {Array.from({ length: 12 }).map((_, i) => <option key={i + 1} value={String(i + 1)}>{String(i + 1).padStart(2, '0')}</option>)}
            </select>
          </div>
          <div>
            <label className="compact-label">{tr('Date from', 'Sana dan')}</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="compact-control" />
          </div>
          <div>
            <label className="compact-label">{tr('Date to', 'Sana gacha')}</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="compact-control" />
          </div>
          <div>
            <label className="compact-label">{tr('Flight', 'Reys')}</label>
            <select value={flightId} onChange={(e) => setFlightId(e.target.value)} className="compact-control min-w-[170px]">
              <option value="">{tr('All flights', 'Barcha reyslar')}</option>
              {flights.map((flight) => <option key={flight.id} value={flight.id}>{flight.flightNumber}</option>)}
            </select>
          </div>
          <div>
            <label className="compact-label">{tr('Currency', 'Valyuta')}</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="compact-control w-28">
              <option value="">{tr('Base', 'Bazaviy')}</option>
              <option value="UZS">UZS</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>
      </div>

      {flightId && flightInventory && <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-bold">{tr('Flight ticket balance', 'Reys bilet balansi')}</h3><p className="text-xs text-muted">{flightReport?.flight?.flightNumber} · {flightReport?.flight?.tripType === 'ROUND_TRIP' ? 'RT' : 'OW'} · {flightInventory.reportType}</p></div>{canReconcile && <button type="button" onClick={runReconciliation} disabled={reconciling} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-surface-2 disabled:opacity-50"><RefreshCw size={15} className={reconciling ? 'animate-spin' : ''} />{reconciling ? tr('Checking...', 'Tekshirilmoqda...') : tr('Reconcile account', 'Hisobni qayta tekshirish')}</button>}</div>
        {flightReport?.reconciliation?.required && <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-500"><strong>{tr('Manual reconciliation required', 'Qo‘lda tekshirish talab qilinadi')}.</strong> {(flightReport.reconciliation.issues || []).map((issue: any) => issue.code).join(', ')}</div>}
        {flightReport?.reconciliation?.checkedAt && <div className="rounded-lg border border-border bg-surface-2 p-3 text-xs text-muted">{tr('Last reconciliation', 'Oxirgi tekshiruv')}: {new Date(flightReport.reconciliation.checkedAt).toLocaleString()} · {tr('Acquired segments', 'Olingan segmentlar')}: {flightReport.reconciliation.comparisons?.acquiredSegments || 0} · {tr('Available segments', 'Mavjud segmentlar')}: {flightReport.reconciliation.comparisons?.currentAvailableSegments || 0} · {tr('Discrepancies', 'Farqlar')}: {(flightReport.reconciliation.discrepancies || []).length}</div>}
        <div className="grid gap-3 md:grid-cols-3">
          {[
            [tr('Total received', 'Jami olingan bilet'), flightInventory.received],
            [tr('Sold / allocated', 'Jami sotilgan / ajratilgan bilet'), flightInventory.soldOrAllocated],
            [tr('Remaining', 'Qolgan bilet'), flightInventory.remaining],
          ].map(([label, metric]: any) => <div key={label} className="rounded-lg border border-border bg-surface-2 p-4"><div className="text-sm text-muted">{label}</div><div className="mt-1 text-2xl font-bold">{Number(metric?.count || 0)} ta</div>{(metric?.amounts || []).map((amount: any) => <div key={amount.currency} className="mt-1 flex justify-between text-sm"><span>{amount.count} ta</span><strong>{Number(amount.total || 0).toLocaleString()} {amount.currency}</strong></div>)}</div>)}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          {[
            ['RT', flightInventory.rtOw?.availableRoundTripCount], ['OUTBOUND', flightInventory.rtOw?.availableOutboundLegCount], ['RETURN', flightInventory.rtOw?.availableReturnLegCount],
            [tr('Pending allocation', 'Kutilayotgan ajratma'), flightInventory.pendingAllocationCount], [tr('Tour reserved', 'Turga band'), flightInventory.reservedForTourCount],
            [tr('Direct sales', 'To‘g‘ridan sotuv'), flightInventory.directSoldTicketCount], [tr('Partial', 'Qisman'), flightInventory.rtOw?.partiallyUsedTicketCount],
          ].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-border bg-surface-2 p-3 text-center"><div className="text-xl font-bold">{Number(value || 0)}</div><div className="text-xs text-muted">{label}</div></div>)}
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {[
            [tr('Accepted revenue', 'Tasdiqlangan tushum'), flightInventory.acceptedAllocationRevenueByCurrency],
            [tr('Allocated cost', 'Ajratilgan tannarx'), flightInventory.allocatedCostByCurrency],
            [tr('Gross profit', 'Yalpi foyda'), flightInventory.allocationGrossProfitByCurrency],
            [tr('Outstanding debt', 'Qoldiq qarz'), flightInventory.outstandingDebtByCurrency],
          ].map(([label, rows]: any) => <div key={label} className="rounded-lg border border-border bg-surface-2 p-3"><div className="text-xs text-muted">{label}</div>{(rows || []).length ? rows.map((row: any) => <div key={row.currency} className="mt-1 font-bold">{Number(row.total || 0).toLocaleString()} {row.currency}</div>) : <div className="mt-1 font-bold">0</div>}</div>)}
        </div>
        {(flightInventory.allocations || []).length > 0 && <div className="overflow-x-auto"><table className="excel-table"><thead><tr><th>{tr('Sender → Receiver', 'Yuboruvchi → Qabul qiluvchi')}</th><th>RT / OW</th><th>{tr('Status', 'Holat')}</th><th className="text-right">{tr('Quantity / segments', 'Bilet / segment')}</th><th className="text-right">{tr('Total', 'Jami')}</th><th>{tr('Paid / debt', 'To‘langan / qarz')}</th></tr></thead><tbody>{flightInventory.allocations.map((row: any) => <tr key={row.id}><td className="font-semibold">{row.fromFirm?.name || '—'} → {row.toFirm?.name || '—'}</td><td>{row.productType === 'ONE_WAY' ? `OW · ${row.direction}` : 'RT'}</td><td>{row.status}</td><td className="text-right">{row.quantity} / {row.segmentCount}</td><td className="text-right">{Number(row.totalAmount || 0).toLocaleString()} {row.currency}</td><td>{(row.paidAmounts || []).map((amount: any) => <div key={`p-${amount.currency}`} className="text-xs text-green-500">{tr('Paid', 'To‘landi')}: {Number(amount.total || 0).toLocaleString()} {amount.currency}</div>)}{(row.outstandingDebt || []).map((amount: any) => Number(amount.total || 0) > 0 && <div key={`d-${amount.currency}`} className="text-xs text-red-500">{tr('Debt', 'Qarz')}: {Number(amount.total).toLocaleString()} {amount.currency}</div>)}</td></tr>)}</tbody></table></div>}
        {(flightInventory.recipients || []).length > 0 && <div className="overflow-x-auto"><table className="excel-table"><thead><tr><th>{tr('Recipient', 'Kimga')}</th><th>{tr('Type', 'Turi')}</th><th className="text-right">{tr('Tickets', 'Bilet')}</th><th className="text-right">{tr('Amount', 'Summa')}</th><th>{tr('Status', 'Holat')}</th></tr></thead><tbody>{flightInventory.recipients.map((row: any, index: number) => <tr key={`${row.allocationId || row.ticketId || row.name}-${index}`}><td className="font-semibold">{row.name}</td><td>{row.type === 'FIRM' ? tr('Firm', 'Firma') : tr('Customer', 'Mijoz')}</td><td className="text-right">{row.quantity} ta</td><td className="text-right">{Number(row.totalAmount || 0).toLocaleString()} {row.currency}</td><td>{row.status}</td></tr>)}</tbody></table></div>}
        {(flightReport?.transactions || []).length > 0 && <details className="rounded-lg border border-border bg-surface-2 p-3"><summary className="cursor-pointer font-semibold">{tr('Related transactions', 'Bog‘liq tranzaksiyalar')} ({flightReport.transactions.length})</summary><div className="mt-3 overflow-x-auto"><table className="excel-table"><thead><tr><th>{tr('Date', 'Sana')}</th><th>{tr('Source', 'Manba')}</th><th>{tr('Type', 'Turi')}</th><th className="text-right">{tr('Amount', 'Summa')}</th><th>{tr('Status', 'Holat')}</th></tr></thead><tbody>{flightReport.transactions.map((row: any) => <tr key={row.id}><td>{new Date(row.createdAt).toLocaleString()}</td><td>{row.sourceMode || 'MANUAL'}</td><td>{row.type}</td><td className="text-right">{Number(row.originalAmount || 0).toLocaleString()} {row.currency}</td><td>{row.status}</td></tr>)}</tbody></table></div></details>}
      </div>}

      <div className="flex gap-2 overflow-x-auto rounded-lg border border-border bg-surface p-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold ${active ? 'bg-primary text-ink' : 'text-muted hover:bg-surface-2 hover:text-foreground'}`}>
              <Icon size={16} />
              {tr(tab.labelEn, tab.labelUz)}
            </button>
          );
        })}
      </div>

      {loading ? <SkeletonGrid /> : !report ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center text-muted">{tr('Tanlangan davr uchun ma\'lumot mavjud emas', 'Tanlangan davr uchun ma\'lumot mavjud emas')}</div>
      ) : (
        <>
          {activeTab === 'health' && renderHealth()}
          {activeTab === 'profitability' && renderProfitability()}
          {activeTab === 'cash-flow' && renderCashFlow()}
          {activeTab === 'expense-estimate' && renderExpenseEstimate()}
          {activeTab === 'debt' && renderDebt()}
          {activeTab === 'agents' && renderAgents()}
          {activeTab === 'flight-profitability' && renderFlightProfitability()}
        </>
      )}

      {report?.notes?.length ? (
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><Building2 size={16} />{tr('Accounting notes', 'Buxgalteriya izohlari')}</div>
          <ul className="space-y-1 text-xs text-muted">
            {report.notes.map((note: string) => <li key={note}>{note}</li>)}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function CurrentDebtTable({ title, rows, kind }: { title: string; rows: any[]; kind: 'receivable' | 'payable' }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface p-4">
      <h3 className="mb-3 text-sm font-bold text-foreground">{title}</h3>
      <table className="excel-table">
        <thead>
          <tr>
            <th>Firma</th>
            <th>{kind === 'receivable' ? 'Jami sotuv / eski qoldiq' : 'Jami olingan / eski qoldiq'}</th>
            <th>To‘langan</th>
            <th>Valyuta</th>
            <th>{kind === 'receivable' ? 'Hozirgi qarzi' : 'Hozirgi qarzimiz'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={5} className="text-center text-muted">Qarzdor firma yo‘q</td></tr>
          ) : rows.map((row) => <tr key={`${row.firmId}-${row.currency}`}>
            <td className="font-semibold">{row.firmName}</td>
            <td className="font-mono">{Number(row.charged || 0).toLocaleString()}</td>
            <td className="font-mono">{Number(row.paid || 0).toLocaleString()}</td>
            <td>{row.currency}</td>
            <td className="font-mono font-bold text-red-500">{Number(row.currentDebt || 0).toLocaleString()} {row.currency}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  );
}

function AgentFlightPurchases({ rows }: { rows: any[] }) {
  return (
    <div className="overflow-x-auto">
      <h4 className="mb-2 font-bold">Biz olgan reys va biletlar</h4>
      <table className="excel-table">
        <thead><tr><th>Reys</th><th>Yo‘nalish</th><th className="text-right">Bilet soni</th><th>Qanchadan</th><th>Jami</th></tr></thead>
        <tbody>{rows.length ? rows.map((row) => <tr key={`${row.sourceType}-${row.id}`}>
          <td>{row.flightNumber || '-'}</td><td>{row.route || '-'}</td><td className="text-right">{row.quantity}</td>
          <td>{row.priceRows?.map((price: any) => `${price.quantity} × ${Number(price.unitPrice).toLocaleString()} ${row.currency}`).join(' · ') || '-'}</td>
          <td className="font-mono">{Number(row.totalAmount || 0).toLocaleString()} {row.currency}</td>
        </tr>) : <tr><td colSpan={5} className="text-center text-muted">Bu firmadan reys yoki bilet olinmagan</td></tr>}</tbody>
      </table>
    </div>
  );
}

function AgentServices({ purchases, sales }: { purchases: any[]; sales: any[] }) {
  const rows = [
    ...purchases.map((row) => ({ ...row, flowLabel: 'Biz olganmiz' })),
    ...sales.map((row) => ({ ...row, flowLabel: 'Biz sotganmiz' })),
  ];
  return (
    <div className="overflow-x-auto">
      <h4 className="mb-2 font-bold">Xizmatlar</h4>
      <table className="excel-table">
        <thead><tr><th>Yo‘nalish</th><th>Xizmat</th><th>Reys</th><th className="text-right">Soni</th><th>Narxi</th><th>Jami</th></tr></thead>
        <tbody>{rows.length ? rows.map((row) => <tr key={`${row.flowLabel}-${row.sourceType}-${row.id}`}>
          <td>{row.flowLabel}</td><td>{row.serviceName}</td><td>{row.flightNumber || '-'}</td><td className="text-right">{row.quantity}</td>
          <td className="font-mono">{Number(row.unitPrice || 0).toLocaleString()} {row.currency}</td><td className="font-mono">{Number(row.totalAmount || 0).toLocaleString()} {row.currency}</td>
        </tr>) : <tr><td colSpan={6} className="text-center text-muted">Xizmat xaridi yoki sotuvi yo‘q</td></tr>}</tbody>
      </table>
    </div>
  );
}

function AgentPayments({ received, made }: { received: any[]; made: any[] }) {
  const rows = [
    ...received.map((row) => ({ ...row, flowLabel: 'Bizga to‘lagan' })),
    ...made.map((row) => ({ ...row, flowLabel: 'Biz to‘lagan' })),
  ].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return (
    <div className="overflow-x-auto">
      <h4 className="mb-2 font-bold">Kassa va tranzaksiya to‘lovlari</h4>
      <table className="excel-table">
        <thead><tr><th>Yo‘nalish</th><th>Sana</th><th>Reys</th><th>Usul</th><th>Summa</th></tr></thead>
        <tbody>{rows.length ? rows.map((row) => <tr key={`${row.flowLabel}-${row.id}`}>
          <td>{row.flowLabel}</td><td>{row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '-'}</td><td>{row.flightNumber || '-'}</td>
          <td>{row.paymentMethod || String(row.sourceMode || '').replace('MANUAL_', '') || '-'}</td><td className="font-mono font-semibold">{Number(row.amount || 0).toLocaleString()} {row.currency}</td>
        </tr>) : <tr><td colSpan={5} className="text-center text-muted">Nomlangan to‘lov yo‘q</td></tr>}</tbody>
      </table>
    </div>
  );
}

function ExpenseDetailPanel({ detail, onClose }: { detail: any; onClose: () => void }) {
  const [filters, setFilters] = useState({ from: '', to: '', kassa: '', card: '', bank: '', currency: '', counterparty: '', employee: '', flight: '', status: '', createdBy: '' });
  const sourceRows = detail?.rows || [];
  const rows = sourceRows.filter((row: any) => {
    const createdBy = row.createdBy?.id || row.createdBy?.email || row.createdBy?.fullName || '';
    return (!filters.from || row.date >= filters.from)
      && (!filters.to || row.date <= filters.to)
      && (!filters.kassa || row.kassaDesk?.id === filters.kassa)
      && (!filters.card || row.paymentCard?.id === filters.card)
      && (!filters.bank || row.sourceAccount?.id === filters.bank || row.destinationAccount?.id === filters.bank)
      && (!filters.currency || row.originalCurrency === filters.currency)
      && (!filters.counterparty || String(row.counterparty || '').toLowerCase().includes(filters.counterparty.toLowerCase()))
      && (!filters.employee || String(row.employeeId || '').toLowerCase().includes(filters.employee.toLowerCase()))
      && (!filters.flight || row.flight?.id === filters.flight)
      && (!filters.status || row.status === filters.status)
      && (!filters.createdBy || String(createdBy).toLowerCase().includes(filters.createdBy.toLowerCase()));
  });
  const unique = (key: (row: any) => string | undefined, label: (row: any) => string | undefined) => Array.from((sourceRows as any[]).reduce((map: Map<string, string>, row: any) => {
    const id = key(row);
    const name = label(row);
    if (id && name) map.set(id, name);
    return map;
  }, new Map<string, string>()), ([id, name]) => ({ id, name }));
  const detailTotal = rows.reduce((sum: number, row: any) => sum + Number(row.uzsEquivalent || 0), 0);
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-bold text-foreground">{detail?.category?.name || 'Xarajat tafsilotlari'}</h3>
          <p className="text-sm text-muted">Kategoriya jami: {fmt(detail?.category?.amount)} · Tafsilot jami: {fmt(detailTotal)} · {rows.length} operatsiya</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-2 text-sm font-semibold hover:bg-surface-2">Yopish</button>
      </div>
      <div className="mb-4 grid gap-2 md:grid-cols-4 xl:grid-cols-6">
        <input type="date" className="compact-control" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        <input type="date" className="compact-control" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        <select className="compact-control" value={filters.kassa} onChange={(e) => setFilters({ ...filters, kassa: e.target.value })}><option value="">Kassa</option>{unique((row) => row.kassaDesk?.id, (row) => row.kassaDesk?.name).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
        <select className="compact-control" value={filters.card} onChange={(e) => setFilters({ ...filters, card: e.target.value })}><option value="">Karta</option>{unique((row) => row.paymentCard?.id, (row) => row.paymentCard?.cardName || row.paymentCard?.maskedNumber).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
        <select className="compact-control" value={filters.bank} onChange={(e) => setFilters({ ...filters, bank: e.target.value })}><option value="">Bank</option>{unique((row) => row.sourceAccount?.id, (row) => row.sourceAccount?.name).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
        <select className="compact-control" value={filters.currency} onChange={(e) => setFilters({ ...filters, currency: e.target.value })}><option value="">Valyuta</option>{Array.from(new Set(sourceRows.map((row: any) => row.originalCurrency).filter(Boolean))).map((currency: any) => <option key={currency} value={currency}>{currency}</option>)}</select>
        <input className="compact-control" value={filters.counterparty} onChange={(e) => setFilters({ ...filters, counterparty: e.target.value })} placeholder="Kimga / kontragent" />
        <input className="compact-control" value={filters.employee} onChange={(e) => setFilters({ ...filters, employee: e.target.value })} placeholder="Xodim" />
        <select className="compact-control" value={filters.flight} onChange={(e) => setFilters({ ...filters, flight: e.target.value })}><option value="">Reys</option>{unique((row) => row.flight?.id, (row) => row.flight?.flightNumber).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
        <input className="compact-control" value={filters.createdBy} onChange={(e) => setFilters({ ...filters, createdBy: e.target.value })} placeholder="Kim kiritdi" />
        <select className="compact-control" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">Status</option>{Array.from(new Set(sourceRows.map((row: any) => row.status).filter(Boolean))).map((status: any) => <option key={status} value={status}>{status}</option>)}</select>
        <button type="button" className="rounded-md border border-border px-3 py-2 text-sm font-semibold" onClick={() => setFilters({ from: '', to: '', kassa: '', card: '', bank: '', currency: '', counterparty: '', employee: '', flight: '', status: '', createdBy: '' })}>Tozalash</button>
      </div>
      <div className="overflow-x-auto">
        <table className="excel-table">
          <thead>
            <tr>
              <th>Sana</th><th>Vaqt</th><th>Xarajat kategoriyasi</th><th>Subkategoriya</th><th>Chiqim yo‘nalishi</th><th>Summa</th><th>Original valyuta</th><th>UZS ekvivalenti</th><th>Kurs snapshot</th><th>Qaysi kassadan</th><th>Qaysi kartadan</th><th>Qaysi bank hisobidan</th><th>To‘lov usuli</th><th>Kimga</th><th>Kontragent</th><th>Xodim</th><th>Reys</th><th>Cost center</th><th>To‘lov izohi</th><th>Hujjat №</th><th>Kim kiritdi</th><th>Status</th><th>Audit</th><th>Amal</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row: any) => (
              <tr key={row.id}>
                <td>{row.date}</td>
                <td>{row.time ? new Date(row.time).toLocaleTimeString() : '-'}</td>
                <td>{row.expenseCategory?.name || 'Tasniflanmagan'}</td>
                <td>{row.subcategory?.name || '-'}</td>
                <td>{row.expenseDirection || '-'}</td>
                <td className="font-mono">{Number(row.amount || 0).toLocaleString()}</td>
                <td>{row.originalCurrency}</td>
                <td className="font-mono">{fmt(row.uzsEquivalent)}</td>
                <td className="font-mono">{Number(row.exchangeRateSnapshot || 0).toLocaleString()}</td>
                <td>{row.kassaDesk?.name || '-'}</td>
                <td>{row.paymentCard?.cardName || row.paymentCard?.maskedNumber || '-'}</td>
                <td>{row.sourceAccount?.type?.includes('BANK') ? row.sourceAccount.name : '-'}</td>
                <td>{row.paymentMethod || '-'}</td>
                <td>{row.counterparty || '-'}</td>
                <td>{row.counterparty || '-'}</td>
                <td>{row.employeeId || '-'}</td>
                <td>{row.flight?.flightNumber || '-'}</td>
                <td>{row.costCenter?.name || '-'}</td>
                <td>{row.note || '-'}</td>
                <td>{row.documentNumber || '-'}</td>
                <td>{row.createdBy?.fullName || row.createdBy?.email || '-'}</td>
                <td>{row.status}</td>
                <td>{row.audit?.operationType || row.audit?.sourceMode || '-'}</td>
                <td><a className="font-semibold text-primary hover:underline" href={`/transactions?id=${row.id}`}>Tafsilotlar</a></td>
              </tr>
            )) : <tr><td colSpan={24} className="text-center text-muted">Bu kategoriya uchun operatsiya topilmadi</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
