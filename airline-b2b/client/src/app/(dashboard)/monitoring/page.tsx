"use client";

import { useQuery } from '@tanstack/react-query';
import { Activity, CheckCircle2, Clock3, FileSpreadsheet, LifeBuoy, RefreshCw, RotateCcw, Target, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

type Rate = { retained: number; eligible: number; rate: number };
type FeatureUsageRow = {
  featureKey: string;
  featureLabel: string;
  totalActions: number;
  uniqueFirms: number;
  uniqueUsers: number;
  readActions: number;
  writeActions: number;
  previousMonthActions: number;
  lastUsedAt: string | null;
};
type Metrics = {
  generatedAt: string;
  period: { weeklyFrom: string; monthlyFrom: string; to: string };
  goal: { targetPayingFirms: number; activeSubscriptions: number; targetFourDayUsageRate: number; fourDayUsageRate: number; targetMet: boolean; note: string };
  engagement: { weeklyActiveFirms: number; firmsActiveAtLeastFourDays: number; fourDayUsageRate: number; averageHoursToFirstTransaction: number | null; transactionsPerActiveFirm: number };
  operations: { kassaClosingRate: number; completedKassaFirmDays: number; activeFirmDays: number; spreadsheetImports30d: number; spreadsheetExports30d: number; supportQuestions30d: number; supportQuestionsPerActiveFirm: number; correctedOrReversedTransactions30d: number };
  retention: { day30: Rate; day60: Rate; day90: Rate; paidRenewal: Rate & { renewed: number; paymentVerified: boolean } };
  featureUsage?: { month: string; rows: FeatureUsageRow[]; removalCandidates: FeatureUsageRow[]; note: string };
  definitions: Record<string, string>;
};

function MetricCard({ icon: Icon, label, value, detail }: { icon: typeof Activity; label: string; value: string | number; detail?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-muted"><Icon size={17} />{label}</div>
      <div className="mt-3 text-3xl font-black text-foreground">{value}</div>
      {detail && <div className="mt-1 text-xs leading-5 text-muted">{detail}</div>}
    </div>
  );
}

export default function MonitoringPage() {
  const { user } = useAuth();
  const { tr } = useLanguage();
  const isSuperAdmin = String(user?.role || '').toUpperCase() === 'SUPERADMIN';
  const { data, isLoading, isError, refetch, isFetching } = useQuery<Metrics>({
    queryKey: ['product-metrics'],
    queryFn: async () => (await api.get('/reports/product-metrics')).data,
    enabled: isSuperAdmin,
    refetchInterval: 5 * 60_000,
  });

  if (!isSuperAdmin) return <p className="text-muted">{tr('Only superadmin can view product monitoring.', 'Biznes monitoringini faqat superadmin ko‘ra oladi.')}</p>;
  if (isLoading) return <p className="text-muted">{tr('Loading monitoring...', 'Monitoring yuklanmoqda...')}</p>;
  if (isError || !data) return <div className="space-y-3"><p className="text-red-600">{tr('Monitoring could not be loaded.', 'Monitoringni yuklab bo‘lmadi.')}</p><button onClick={() => refetch()} className="compact-control">{tr('Try again', 'Qayta urinish')}</button></div>;

  const retention = [
    { label: '30 kun', value: data.retention.day30 },
    { label: '60 kun', value: data.retention.day60 },
    { label: '90 kun', value: data.retention.day90 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div><h1 className="text-3xl font-bold text-foreground">{tr('Business monitoring', 'Biznes monitoring')}</h1><p className="mt-1 text-sm text-muted">{tr('Usage, operational discipline, retention and renewal metrics.', 'Foydalanish, operatsion intizom, saqlab qolish va obuna ko‘rsatkichlari.')}</p></div>
        <button type="button" onClick={() => refetch()} className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm font-semibold text-foreground"><RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />{tr('Refresh', 'Yangilash')}</button>
      </div>

      <section className={`rounded-xl border p-5 ${data.goal.targetMet ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
        <div className="flex items-start gap-3"><Target className="mt-0.5 shrink-0" /><div><h2 className="font-bold text-foreground">{tr('Early business goal', 'Dastlabki biznes maqsad')}</h2><p className="mt-1 text-sm text-muted">20 ta faol obunali firma, kamida 70% haftasiga 4 kun foydalanishi va obunani uzaytirishi kerak.</p><div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold"><span>{data.goal.activeSubscriptions}/20 {tr('active subscriptions', 'faol obuna')}</span><span>{data.goal.fourDayUsageRate}%/70% {tr('four-day usage', '4 kunlik foydalanish')}</span></div></div></div>
      </section>

      <section><h2 className="mb-3 text-lg font-bold text-foreground">{tr('Engagement', 'Foydalanish')}</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={Users} label={tr('Weekly active firms', 'Haftalik faol firmalar')} value={data.engagement.weeklyActiveFirms} detail={`${data.period.weeklyFrom} — ${data.period.to}`} />
        <MetricCard icon={Activity} label={tr('Active 4+ days', '4+ kun faol')} value={data.engagement.firmsActiveAtLeastFourDays} detail={`${data.engagement.fourDayUsageRate}%`} />
        <MetricCard icon={Clock3} label={tr('Time to first transaction', 'Birinchi tranzaksiyagacha')} value={data.engagement.averageHoursToFirstTransaction === null ? '—' : `${data.engagement.averageHoursToFirstTransaction} soat`} />
        <MetricCard icon={Activity} label={tr('Transactions per active firm', 'Faol firmaga tranzaksiya')} value={data.engagement.transactionsPerActiveFirm} />
        <MetricCard icon={CheckCircle2} label={tr('Daily kassa closing', 'Kunlik kassa yopilishi')} value={`${data.operations.kassaClosingRate}%`} detail={`${data.operations.completedKassaFirmDays}/${data.operations.activeFirmDays} firma-kun`} />
      </div></section>

      <section><h2 className="mb-3 text-lg font-bold text-foreground">{tr('Operations and data quality', 'Operatsiyalar va ma’lumot sifati')}</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={FileSpreadsheet} label={tr('Spreadsheet transfers (30d)', 'Jadval import/eksporti (30 kun)')} value={data.operations.spreadsheetImports30d + data.operations.spreadsheetExports30d} detail={`${data.operations.spreadsheetImports30d} import · ${data.operations.spreadsheetExports30d} eksport`} />
        <MetricCard icon={LifeBuoy} label={tr('Support questions (30d)', 'Support savollari (30 kun)')} value={data.operations.supportQuestions30d} detail={`${data.operations.supportQuestionsPerActiveFirm} / faol firma`} />
        <MetricCard icon={RotateCcw} label={tr('Corrected/reversed (30d)', 'Tuzatilgan/bekor qilingan (30 kun)')} value={data.operations.correctedOrReversedTransactions30d} />
        <MetricCard icon={RefreshCw} label={tr('Recorded renewal rate', 'Qayd etilgan uzaytirish darajasi')} value={`${data.retention.paidRenewal.rate}%`} detail={`${data.retention.paidRenewal.renewed}/${data.retention.paidRenewal.eligible} · ${tr('payment not separately verified', 'to‘lov alohida tasdiqlanmagan')}`} />
      </div></section>

      <section className="rounded-xl border border-border bg-surface p-5"><h2 className="text-lg font-bold text-foreground">{tr('Rolling firm retention', 'Firmalarni saqlab qolish')}</h2><div className="mt-4 grid gap-3 sm:grid-cols-3">{retention.map((item) => <div key={item.label} className="rounded-lg bg-surface-2 p-4"><div className="text-sm font-semibold text-muted">{item.label}</div><div className="mt-2 text-3xl font-black text-foreground">{item.value.rate}%</div><div className="mt-1 text-xs text-muted">{item.value.retained}/{item.value.eligible} firma qaytdi</div></div>)}</div></section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">{tr('Monthly feature usage', 'Oylik feature ishlatilishi')}</h2>
            <p className="text-xs text-muted">{data.featureUsage?.month || data.period.monthlyFrom}</p>
          </div>
          <div className="text-sm font-semibold text-muted">{data.featureUsage?.removalCandidates?.length || 0} {tr('low-usage candidates', 'kam ishlatilgan nomzod')}</div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr>
                <th className="whitespace-nowrap px-3 py-2">{tr('Feature', 'Feature')}</th>
                <th className="whitespace-nowrap px-3 py-2">{tr('Actions', 'Amallar')}</th>
                <th className="whitespace-nowrap px-3 py-2">{tr('Firms', 'Firmalar')}</th>
                <th className="whitespace-nowrap px-3 py-2">{tr('Users', 'Userlar')}</th>
                <th className="whitespace-nowrap px-3 py-2">{tr('Business actions', 'Biznes amallari')}</th>
                <th className="whitespace-nowrap px-3 py-2">{tr('Previous month', 'Oldingi oy')}</th>
                <th className="whitespace-nowrap px-3 py-2">{tr('Last used', 'Oxirgi ishlatilgan')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(data.featureUsage?.rows || []).map((row) => (
                <tr key={row.featureKey} className={row.uniqueFirms <= 1 && row.totalActions <= 3 ? 'bg-amber-500/10' : undefined}>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-foreground">{row.featureLabel}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-foreground">{row.totalActions}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted">{row.uniqueFirms}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted">{row.uniqueUsers}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted">{row.totalActions}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted">{row.previousMonthActions}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted">{row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleDateString('uz-UZ') : '—'}</td>
                </tr>
              ))}
              {!(data.featureUsage?.rows || []).length && <tr><td className="px-3 py-4 text-muted" colSpan={7}>{tr('No feature usage has been recorded yet.', 'Hali feature ishlatilishi yozilmagan.')}</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted">{data.featureUsage?.note}</p>
      </section>

      <p className="text-xs leading-5 text-muted">{tr('Definitions: an active firm entered at least one transaction. Retention compares adjacent rolling periods. Active subscription is currently used as the paying-firm proxy.', 'Ta’riflar: faol firma kamida bitta tranzaksiya kiritgan. Retention yonma-yon davrlarni solishtiradi. Hozircha faol obuna pullik firma o‘rnida hisoblanadi.')}</p>
    </div>
  );
}
