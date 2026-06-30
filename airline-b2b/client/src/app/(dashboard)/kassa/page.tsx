/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { Lock, Unlock, Wallet, CreditCard, AlertCircle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import CollapsibleCard from '@/components/ui/CollapsibleCard';
import { api } from '@/lib/api';

type FirmOption = { id: string; name: string };
type FlightOption = { id?: string; flight_id?: string; flightNumber?: string };

type KassaSummary = {
  businessDate: string;
  status: 'NOT_OPEN' | 'OPEN' | 'CLOSED';
  kassa: any;
  totals: {
    cashTotal: number;
    cardTotal: number;
    paymentCount: number;
    saleTotal: number;
    payableTotal: number;
    transactionCount: number;
    expectedCash: number | null;
  };
  transactions: any[];
  duePayments: Array<{
    firmId: string;
    firmName: string | null;
    flightId: string | null;
    flightNumber: string | null;
    debt: number;
    paid: number;
    outstanding: number;
  }>;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

export default function KassaPage() {
  const { user } = useAuth();
  const { tr } = useLanguage();
  const router = useRouter();

  const role = String(user?.role || '').toLowerCase();
  const isFirm = role === 'firm';
  const isAdmin = role === 'admin' || role === 'superadmin';
  const canAccess = isFirm || isAdmin;
  const canManageKassa = isAdmin;
  const canRecordPayment = isAdmin;
  const canFilterFirm = canManageKassa;

  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [summary, setSummary] = useState<KassaSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const [openingBalance, setOpeningBalance] = useState('0');
  const [closingBalance, setClosingBalance] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [openingKassa, setOpeningKassa] = useState(false);
  const [closingKassa, setClosingKassa] = useState(false);

  const [firmOptions, setFirmOptions] = useState<FirmOption[]>([]);
  const [flightOptions, setFlightOptions] = useState<FlightOption[]>([]);

  const [payFirmId, setPayFirmId] = useState('');
  const [payFlightId, setPayFlightId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payCurrency, setPayCurrency] = useState<'USD' | 'UZS' | 'OTHER'>('UZS');
  const [payOtherCurrency, setPayOtherCurrency] = useState('');
  const [payExchangeRate, setPayExchangeRate] = useState('');
  const [payMethod, setPayMethod] = useState<'cash' | 'card'>('cash');
  const [payCardProvider, setPayCardProvider] = useState('');
  const [payCardReference, setPayCardReference] = useState('');
  const [payReference, setPayReference] = useState('');
  const [recordingPayment, setRecordingPayment] = useState(false);

  const isEditable = summary?.status === 'OPEN';
  const isClosed = summary?.status === 'CLOSED';
  const isNotOpen = summary?.status === 'NOT_OPEN';

  const payCurrencyCode = useMemo(() => {
    const c = payCurrency === 'OTHER' ? payOtherCurrency : payCurrency;
    return String(c || '').trim().toUpperCase();
  }, [payCurrency, payOtherCurrency]);

  useEffect(() => {
    if (!user) {
      router.push('/login');
    }
  }, [user, router]);

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get(`/kassa?date=${selectedDate}`);
      setSummary(res.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || tr('Failed to load kassa', 'Kassani yuklab bo\'lmadi'));
    } finally {
      setLoading(false);
    }
  }, [selectedDate, tr]);

  useEffect(() => {
    if (!canAccess) return;
    loadSummary();
  }, [loadSummary, reloadKey, canAccess]);

  useEffect(() => {
    if (!canAccess) return;
    const loadOptions = async () => {
      try {
        const [flightsRes, firmsRes] = await Promise.all([
          api.get('/flights'),
          canFilterFirm ? api.get('/firms') : Promise.resolve({ data: [] }),
        ]);
        setFlightOptions(Array.isArray(flightsRes.data) ? flightsRes.data : []);
        setFirmOptions(Array.isArray(firmsRes.data) ? firmsRes.data : []);
      } catch {
        // non-fatal
      }
    };
    loadOptions();
  }, [canFilterFirm, canAccess]);

  if (!user) {
    return null;
  }

  if (!canAccess) {
    return (
      <div className="text-foreground">
        <h2 className="text-3xl font-bold text-foreground">{tr('Kassa', 'Kassa')}</h2>
        <p className="mt-2 text-muted">{tr('You do not have access to kassa.', 'Kassaga kirish huquqingiz yo\'q.')}</p>
      </div>
    );
  }

  const handleOpenKassa = async (e: FormEvent) => {
    e.preventDefault();
    if (openingKassa) return;
    try {
      setOpeningKassa(true);
      await api.post('/kassa/open', {
        businessDate: selectedDate,
        openingBalance: openingBalance.trim() || '0',
      });
      toast.success(tr('Kassa opened', 'Kassa ochildi'));
      setReloadKey((k) => k + 1);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || tr('Failed to open kassa', 'Kassani ochib bo\'lmadi'));
    } finally {
      setOpeningKassa(false);
    }
  };

  const handleCloseKassa = async (e: FormEvent) => {
    e.preventDefault();
    if (closingKassa) return;
    try {
      setClosingKassa(true);
      await api.post('/kassa/close', {
        businessDate: selectedDate,
        closingBalance: closingBalance.trim() || undefined,
        notes: closeNotes.trim() || undefined,
      });
      toast.success(tr('Kassa closed', 'Kassa yopildi'));
      setClosingBalance('');
      setCloseNotes('');
      setReloadKey((k) => k + 1);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || tr('Failed to close kassa', 'Kassani yopib bo\'lmadi'));
    } finally {
      setClosingKassa(false);
    }
  };

  const prefillPayment = (firmId: string, flightId?: string | null, amount?: number) => {
    if (!isEditable) return;
    if (canFilterFirm) setPayFirmId(firmId);
    setPayFlightId(flightId || '');
    if (amount != null && amount > 0) setPayAmount(String(Math.round(amount)));
  };

  const submitPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (recordingPayment || !isEditable || !canRecordPayment) return;

    const method = payMethod;
    const currency = payCurrencyCode;
    const amount = payAmount.trim();
    const flightId = payFlightId.trim();

    if (canFilterFirm && !payFirmId) {
      toast.error(tr('Select a firm', 'Firmani tanlang'));
      return;
    }
    if (!amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      toast.error(tr('Enter a valid amount', 'To\'g\'ri summani kiriting'));
      return;
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      toast.error(tr('Invalid currency code', 'Noto\'g\'ri valyuta kodi'));
      return;
    }

    const metadata: Record<string, string> = {};
    if (payReference.trim()) metadata.reference = payReference.trim();
    metadata.date = selectedDate;

    if (method === 'card') {
      if (!payCardProvider.trim() || !payCardReference.trim()) {
        toast.error(tr('Card payments require provider and reference', 'Karta to\'lovi uchun provayder va raqam kerak'));
        return;
      }
      metadata.payment_provider = payCardProvider.trim();
      metadata.transaction_reference = payCardReference.trim();
    }

    try {
      setRecordingPayment(true);
      const body: any = { amount, currency, method, metadata };
      if (canFilterFirm) body.firmId = payFirmId;
      if (flightId) body.flightId = flightId;
      if (currency !== 'UZS' && payExchangeRate.trim()) body.exchangeRate = payExchangeRate.trim();

      await api.post('/payments', body);
      toast.success(tr('Payment recorded', 'To\'lov qayd etildi'));
      setPayAmount('');
      setPayCardProvider('');
      setPayCardReference('');
      setPayReference('');
      setPayExchangeRate('');
      setReloadKey((k) => k + 1);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || tr('Failed to record payment', 'To\'lovni qayd etib bo\'lmadi'));
    } finally {
      setRecordingPayment(false);
    }
  };

  const statusBadge = () => {
    if (isClosed) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-red-500/10 text-red-600 border border-red-500/20">
          <Lock size={14} />
          {tr('Closed', 'Yopiq')}
        </span>
      );
    }
    if (isEditable) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
          <Unlock size={14} />
          {tr('Open', 'Ochiq')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/10 text-amber-600 border border-amber-500/20">
        <AlertCircle size={14} />
        {tr('Not open', 'Ochilmagan')}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted">
            {tr('Daily cash register — open a day, record payments, then close when done.', 'Kunlik kassa — kunni oching, to\'lovlarni qayd eting, tugagach yoping.')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-surface text-sm font-medium"
          />
          {statusBadge()}
        </div>
      </div>

      {isNotOpen && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-sm text-amber-800 dark:text-amber-200">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <p>
            {canManageKassa
              ? tr(
                  'Kassa is not open for this day. Open it below before recording payments.',
                  'Bu kun uchun kassa ochilmagan. To\'lovlarni qayd etishdan oldin quyida oching.'
                )
              : tr(
                  'Kassa is not open for this day. Payments can be recorded once an admin opens kassa.',
                  'Bu kun uchun kassa ochilmagan. Admin kassani ochgach, to\'lovlarni qayd etish mumkin.'
                )}
          </p>
        </div>
      )}

      {isClosed && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/5 border border-red-500/20 text-sm text-red-700">
          <Lock size={18} className="shrink-0 mt-0.5" />
          <p>
            {tr(
              'This kassa day is closed. No new transactions or payments can be added or modified.',
              'Bu kassa kuni yopilgan. Yangi tranzaksiya yoki to\'lov qo\'shish yoki o\'zgartirish mumkin emas.'
            )}
          </p>
        </div>
      )}

      {canManageKassa && isNotOpen && (
        <CollapsibleCard
          title={tr('Open kassa', 'Kassani ochish')}
          description={tr('Start the cash register for this day before recording payments.', 'To\'lovlarni qayd etishdan oldin ushbu kun uchun kassani oching.')}
          storageKey="kassa-open-card"
        >
          <form onSubmit={handleOpenKassa} className="compact-toolbar max-w-2xl">
            <div>
              <label className="compact-label">
                {tr('Opening cash balance (UZS)', 'Boshlang\'ich naqd balans (UZS)')}
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                className="compact-control"
              />
            </div>
            <button
              type="submit"
              disabled={openingKassa}
              className="px-5 py-2.5 bg-primary text-white rounded-lg font-semibold text-sm uppercase tracking-wide hover:bg-primary/90 disabled:opacity-50"
            >
              {openingKassa ? tr('Opening…', 'Ochilyapti…') : tr('Open kassa', 'Kassani ochish')}
            </button>
          </form>
        </CollapsibleCard>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: tr('Cash (UZS)', 'Naqd (UZS)'), value: summary?.totals.cashTotal ?? 0, icon: Wallet },
          { label: tr('Card (UZS)', 'Karta (UZS)'), value: summary?.totals.cardTotal ?? 0, icon: CreditCard },
          { label: tr('Payments', 'To\'lovlar'), value: summary?.totals.paymentCount ?? 0, icon: CheckCircle2, isCount: true },
          { label: tr('Transactions', 'Tranzaksiyalar'), value: summary?.totals.transactionCount ?? 0, icon: AlertCircle, isCount: true },
        ].map(({ label, value, icon: Icon, isCount }) => (
          <div key={label} className="bg-surface border border-border rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 text-muted text-xs font-semibold uppercase tracking-wider mb-2">
              <Icon size={14} />
              {label}
            </div>
            <div className="text-2xl font-bold text-foreground">
              {loading ? '—' : isCount ? value : `${formatMoney(value)}`}
            </div>
          </div>
        ))}
      </div>

      {canRecordPayment && (
        <CollapsibleCard
          title={tr('Add payment', 'To\'lov qo\'shish')}
          description={
            isEditable
              ? tr('Record a firm deposit for this kassa day.', 'Ushbu kassa kuni uchun firma depozitini qayd eting.')
              : tr('Payments can only be recorded while kassa is open.', 'To\'lovlar faqat kassa ochiq bo\'lganda qayd etiladi.')
          }
          defaultOpen={true}
          storageKey="kassa-payment-card"
        >
          <form onSubmit={submitPayment} className={`compact-toolbar ${!isEditable ? 'opacity-50 pointer-events-none' : ''}`}>
          {canFilterFirm && (
            <div>
              <label className="compact-label">{tr('Firm', 'Firma')}</label>
              <select value={payFirmId} onChange={(e) => setPayFirmId(e.target.value)} className="compact-control">
                <option value="">{tr('Select firm', 'Firmani tanlang')}</option>
                {firmOptions.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="compact-label">{tr('Flight (optional)', 'Reys (ixtiyoriy)')}</label>
            <select value={payFlightId} onChange={(e) => setPayFlightId(e.target.value)} className="compact-control">
              <option value="">{tr('Firm deposit', 'Firma depoziti')}</option>
              {flightOptions.map((f) => {
                const id = f.id || f.flight_id || '';
                return <option key={id} value={id}>{f.flightNumber || id}</option>;
              })}
            </select>
          </div>
          <div>
            <label className="compact-label">{tr('Amount', 'Summa')}</label>
            <input type="number" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="compact-control" />
          </div>
          <div>
            <label className="compact-label">{tr('Currency', 'Valyuta')}</label>
            <select value={payCurrency} onChange={(e) => setPayCurrency(e.target.value as 'USD' | 'UZS' | 'OTHER')} className="compact-control">
              <option value="UZS">UZS</option>
              <option value="USD">USD</option>
              <option value="OTHER">{tr('Other', 'Boshqa')}</option>
            </select>
          </div>
          {payCurrency === 'OTHER' && (
            <div>
              <label className="compact-label">{tr('Currency code', 'Valyuta kodi')}</label>
              <input value={payOtherCurrency} onChange={(e) => setPayOtherCurrency(e.target.value.toUpperCase())} maxLength={3} className="compact-control uppercase" />
            </div>
          )}
          {payCurrencyCode !== 'UZS' && (
            <div>
              <label className="compact-label">{tr('Exchange rate', 'Kurs')}</label>
              <input value={payExchangeRate} onChange={(e) => setPayExchangeRate(e.target.value)} className="compact-control" />
            </div>
          )}
          <div>
            <label className="compact-label">{tr('Method', 'Usul')}</label>
            <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as 'cash' | 'card')} className="compact-control">
              <option value="cash">{tr('Cash', 'Naqd')}</option>
              <option value="card">{tr('Card', 'Karta')}</option>
            </select>
          </div>
          {payMethod === 'card' && (
            <>
              <div>
                <label className="compact-label">{tr('Provider', 'Provayder')}</label>
                <input value={payCardProvider} onChange={(e) => setPayCardProvider(e.target.value)} className="compact-control" />
              </div>
              <div>
                <label className="compact-label">{tr('Reference', 'Raqam')}</label>
                <input value={payCardReference} onChange={(e) => setPayCardReference(e.target.value)} className="compact-control" />
              </div>
            </>
          )}
          <div className="flex items-end">
            <button type="submit" disabled={recordingPayment || !isEditable} className="px-5 py-2.5 bg-primary text-white rounded-lg font-semibold text-sm uppercase tracking-wide hover:bg-primary/90 disabled:opacity-50">
              {recordingPayment ? tr('Recording…', 'Qayd etilmoqda…') : tr('Record payment', 'To\'lov qayd etish')}
            </button>
          </div>
          </form>
        </CollapsibleCard>
      )}

      <CollapsibleCard
        title={tr('Due payments', 'Muddatli to\'lovlar')}
        description={tr('Outstanding balances that can be paid through kassa.', 'Kassa orqali to\'lanishi mumkin bo\'lgan qarzdorliklar.')}
        storageKey="kassa-due-card"
        defaultOpen={true}
      >
        {loading ? (
          <p className="text-sm text-muted">{tr('Loading…', 'Yuklanmoqda…')}</p>
        ) : !summary?.duePayments.length ? (
          <p className="text-sm text-muted">{tr('No outstanding balances.', 'Qarzdorlik yo\'q.')}</p>
        ) : (
          <div className="overflow-x-auto scroller-minimal">
            <table className="excel-table">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted">
                  {canFilterFirm && <th>{tr('Firm', 'Firma')}</th>}
                  <th>{tr('Flight', 'Reys')}</th>
                  <th className="text-right">{tr('Outstanding (UZS)', 'Qarz (UZS)')}</th>
                  <th>{tr('Action', 'Amal')}</th>
                </tr>
              </thead>
              <tbody>
                {summary.duePayments.map((item) => (
                  <tr key={`${item.firmId}-${item.flightId || 'firm'}`} className="border-b border-border/50">
                    {canFilterFirm && <td>{item.firmName || item.firmId}</td>}
                    <td>{item.flightNumber || item.flightId || tr('Firm balance', 'Firma balansi')}</td>
                    <td className="text-right font-mono">{formatMoney(item.outstanding)}</td>
                    <td>
                      <button
                        type="button"
                        disabled={!isEditable}
                        onClick={() => prefillPayment(item.firmId, item.flightId, item.outstanding)}
                        className="text-xs font-semibold uppercase tracking-wide text-primary hover:underline disabled:opacity-40 disabled:no-underline"
                      >
                        {tr('Pay', 'To\'lash')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleCard>

      <CollapsibleCard
        title={tr('Day transactions', 'Kun tranzaksiyalari')}
        description={tr('All transactions recorded for this kassa day.', 'Ushbu kassa kuni uchun qayd etilgan barcha tranzaksiyalar.')}
        storageKey="kassa-tx-card"
        defaultOpen={true}
      >
        {loading ? (
          <p className="text-sm text-muted">{tr('Loading…', 'Yuklanmoqda…')}</p>
        ) : !summary?.transactions.length ? (
          <p className="text-sm text-muted">{tr('No transactions for this day.', 'Bu kun uchun tranzaksiya yo\'q.')}</p>
        ) : (
          <div className="overflow-x-auto scroller-minimal">
            <table className="excel-table">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted">
                  <th>{tr('Type', 'Turi')}</th>
                  {canFilterFirm && <th>{tr('Firm', 'Firma')}</th>}
                  <th>{tr('Flight', 'Reys')}</th>
                  <th>{tr('Method', 'Usul')}</th>
                  <th className="text-right">{tr('Amount', 'Summa')}</th>
                  <th className="text-right">{tr('Base (UZS)', 'Asosiy (UZS)')}</th>
                </tr>
              </thead>
              <tbody>
                {summary.transactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-border/50">
                    <td className="font-medium">{tx.type}</td>
                    {canFilterFirm && <td>{tx.firm?.name || tx.firmId}</td>}
                    <td>{tx.flight?.flightNumber || tx.flightId}</td>
                    <td className="uppercase text-xs">{tx.paymentMethod || '—'}</td>
                    <td className="text-right font-mono">{tx.originalAmount} {tx.currency}</td>
                    <td className="text-right font-mono">{formatMoney(Number(tx.baseAmount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleCard>

      {canManageKassa && isEditable && (
        <CollapsibleCard
          title={tr('Close kassa', 'Kassani yopish')}
          description={tr('Final step for the day: count physical cash and close only when all payments are recorded.', 'Kun yakunidagi oxirgi qadam: barcha to\'lovlar kiritilgach, naqd pulni sanab kassani yoping.')}
          storageKey="kassa-close-card"
        >
          <form onSubmit={handleCloseKassa} className="compact-toolbar max-w-3xl">
            <div>
              <label className="compact-label">
                {tr('Physical cash count (UZS)', 'Haqiqiy naqd pul (UZS)')}
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={closingBalance}
                onChange={(e) => setClosingBalance(e.target.value)}
                placeholder={summary?.totals.expectedCash != null ? String(Math.round(summary.totals.expectedCash)) : ''}
                className="compact-control"
              />
              {summary?.totals.expectedCash != null && (
                <p className="mt-1 text-xs text-muted">
                  {tr('Expected', 'Kutilgan')}: {formatMoney(summary.totals.expectedCash)} UZS
                </p>
              )}
            </div>
            <div>
              <label className="compact-label">
                {tr('Notes', 'Izohlar')}
              </label>
              <input
                type="text"
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                className="compact-control"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={closingKassa}
                className="px-5 py-2.5 bg-red-600 text-white rounded-lg font-semibold text-sm uppercase tracking-wide hover:bg-red-700 disabled:opacity-50"
              >
                {closingKassa ? tr('Closing…', 'Yopilyapti…') : tr('Close kassa', 'Kassani yopish')}
              </button>
            </div>
          </form>
        </CollapsibleCard>
      )}
    </div>
  );
}
