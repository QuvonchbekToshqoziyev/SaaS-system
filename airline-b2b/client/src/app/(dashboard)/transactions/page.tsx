/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import CollapsibleCard from '@/components/ui/CollapsibleCard';

type FirmOption = {
  id: string;
  name: string;
};

type FlightOption = {
  id?: string;
  flight_id?: string;
  flightNumber?: string;
};

type TransactionsPrefs = {
  view?: 'list' | 'boxes';
  filterType?: string;
  filterFirmId?: string;
  filterFlightId?: string;
  filterCurrency?: string;
  dateFrom?: string;
  dateTo?: string;
};

const TRANSACTIONS_PREFS_KEY = 'jetstream-transactions-prefs';

function normalizeTxTypeParam(value: string): string {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'sale' || v === 'payable' || v === 'payment' || v === 'adjustment') return v;
  return '';
}

function normalizeDateParam(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || '';
}

export default function TransactionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { tr, language } = useLanguage();

  const role = String(user?.role || '').toUpperCase();
  const canFilterFirm = role === 'ADMIN' || role === 'SUPERADMIN';

  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [transactionsView, setTransactionsView] = useState<'list' | 'boxes'>('list');
  const [filterType, setFilterType] = useState<string>('');
  const [filterFirmId, setFilterFirmId] = useState<string>('');
  const [filterFlightId, setFilterFlightId] = useState<string>('');
  const [filterCurrency, setFilterCurrency] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const [prefsReady, setPrefsReady] = useState(false);
  const lastAppliedQuerySignatureRef = useRef<string>('');

  const [firmOptions, setFirmOptions] = useState<FirmOption[]>([]);
  const [flightOptions, setFlightOptions] = useState<FlightOption[]>([]);
  
  // Pagination
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [reloadKey, setReloadKey] = useState(0);

  // Record Payment
  const [payFirmId, setPayFirmId] = useState<string>('');
  const [payFlightId, setPayFlightId] = useState<string>('');
  const [payAmount, setPayAmount] = useState<string>('');
  const [payCurrency, setPayCurrency] = useState<'USD' | 'UZS' | 'OTHER'>('UZS');
  const [payOtherCurrency, setPayOtherCurrency] = useState<string>('');
  const [payExchangeRate, setPayExchangeRate] = useState<string>('');
  const [payMethod, setPayMethod] = useState<'cash' | 'card'>('cash');
  const [payCashDate, setPayCashDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [payCardProvider, setPayCardProvider] = useState<string>('');
  const [payCardReference, setPayCardReference] = useState<string>('');
  const [payReference, setPayReference] = useState<string>('');
  const [recordingPayment, setRecordingPayment] = useState(false);

  const payCurrencyCode = useMemo(() => {
    const c = payCurrency === 'OTHER' ? payOtherCurrency : payCurrency;
    return String(c || '').trim().toUpperCase();
  }, [payCurrency, payOtherCurrency]);

  const payAmountNum = useMemo(() => {
    const n = Number(payAmount);
    return Number.isFinite(n) ? n : NaN;
  }, [payAmount]);

  const payExchangeRateNum = useMemo(() => {
    const raw = String(payExchangeRate || '').trim();
    if (!raw) return NaN;
    const n = Number(raw);
    return Number.isFinite(n) ? n : NaN;
  }, [payExchangeRate]);

  const [savedRate, setSavedRate] = useState<number | null>(null);
  const [savedRateSource, setSavedRateSource] = useState<string | null>(null);
  const [savedRateLoading, setSavedRateLoading] = useState(false);

  const rateLookupDate = useMemo(() => {
    if (String(payMethod || '').trim().toLowerCase() === 'cash') return payCashDate;
    return format(new Date(), 'yyyy-MM-dd');
  }, [payCashDate, payMethod]);

  useEffect(() => {
    if (!prefsReady) return;

    const signature = searchParams.toString();
    if (signature === lastAppliedQuerySignatureRef.current) return;
    lastAppliedQuerySignatureRef.current = signature;

    const flightId = (searchParams.get('flightId') || searchParams.get('flight_id') || '').trim();
    const firmId = (searchParams.get('firmId') || searchParams.get('firm_id') || '').trim();
    const type = normalizeTxTypeParam(searchParams.get('type') || '');
    const currency = String(searchParams.get('currency') || '').trim();
    const view = String(searchParams.get('view') || '').trim().toLowerCase();
    const qDateFrom = normalizeDateParam(searchParams.get('dateFrom') || '');
    const qDateTo = normalizeDateParam(searchParams.get('dateTo') || '');

    let resetPage = false;

    if (view === 'list' || view === 'boxes') {
      setTransactionsView(view);
    }

    if (type) {
      setFilterType(type);
      resetPage = true;
    }

    if (currency) {
      setFilterCurrency(currency.toUpperCase());
      resetPage = true;
    }

    if (flightId) {
      setFilterFlightId(flightId);
      resetPage = true;
    }

    if (canFilterFirm && firmId) {
      setFilterFirmId(firmId);
      resetPage = true;
    }

    if (qDateFrom) {
      setDateFrom(qDateFrom);
      resetPage = true;
    }
    if (qDateTo) {
      setDateTo(qDateTo);
      resetPage = true;
    }

    if (resetPage) setPage(1);
  }, [canFilterFirm, prefsReady, searchParams]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TRANSACTIONS_PREFS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as TransactionsPrefs;

      if (parsed.view === 'list' || parsed.view === 'boxes') setTransactionsView(parsed.view);
      if (typeof parsed.filterType === 'string') setFilterType(parsed.filterType);
      if (typeof parsed.filterFlightId === 'string') setFilterFlightId(parsed.filterFlightId);
      if (typeof parsed.filterCurrency === 'string') setFilterCurrency(parsed.filterCurrency);
      if (typeof parsed.dateFrom === 'string') setDateFrom(parsed.dateFrom);
      if (typeof parsed.dateTo === 'string') setDateTo(parsed.dateTo);

      if (canFilterFirm && typeof parsed.filterFirmId === 'string') setFilterFirmId(parsed.filterFirmId);
    } catch {
      // ignore
    } finally {
      setPrefsReady(true);
    }
  }, [canFilterFirm]);

  useEffect(() => {
    if (!prefsReady) return;
    try {
      const prefs: TransactionsPrefs = {
        view: transactionsView,
        filterType,
        filterFirmId: canFilterFirm ? filterFirmId : '',
        filterFlightId,
        filterCurrency,
        dateFrom,
        dateTo,
      };
      localStorage.setItem(TRANSACTIONS_PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // ignore
    }
  }, [canFilterFirm, dateFrom, dateTo, filterCurrency, filterFirmId, filterFlightId, filterType, prefsReady, transactionsView]);

  useEffect(() => {
    const shouldFetchSavedRate =
      prefsReady &&
      payCurrencyCode !== 'UZS' &&
      !String(payExchangeRate || '').trim() &&
      /^[A-Z]{3}$/.test(payCurrencyCode) &&
      /^\d{4}-\d{2}-\d{2}$/.test(rateLookupDate);

    if (!shouldFetchSavedRate) {
      setSavedRate(null);
      setSavedRateSource(null);
      setSavedRateLoading(false);
      return;
    }

    let ignore = false;

    const run = async () => {
      try {
        setSavedRateLoading(true);
        const query = new URLSearchParams();
        query.set('date', rateLookupDate);
        query.set('baseCurrency', 'UZS');
        query.set('targetCurrency', payCurrencyCode);
        const res = await api.get(`/currency-rates?${query.toString()}`);
        const rates = Array.isArray(res.data) ? res.data : [];
        const first = rates[0];
        const rateValue = first?.rate;
        const num = Number(rateValue);

        if (ignore) return;

        if (Number.isFinite(num) && num > 0) {
          setSavedRate(num);
          setSavedRateSource(typeof first?.source === 'string' ? String(first.source) : null);
        } else {
          setSavedRate(null);
          setSavedRateSource(null);
        }
      } catch {
        if (!ignore) {
          setSavedRate(null);
          setSavedRateSource(null);
        }
      } finally {
        if (!ignore) setSavedRateLoading(false);
      }
    };

    run();
    return () => {
      ignore = true;
    };
  }, [payCurrencyCode, payExchangeRate, prefsReady, rateLookupDate]);

  useEffect(() => {
    if (!payFlightId && filterFlightId) {
      setPayFlightId(filterFlightId);
    }
  }, [filterFlightId, payFlightId]);

  useEffect(() => {
    if (canFilterFirm && !payFirmId && filterFirmId) {
      setPayFirmId(filterFirmId);
    }
  }, [canFilterFirm, filterFirmId, payFirmId]);

  const submitPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (recordingPayment) return;

    const method = String(payMethod || '').trim().toLowerCase();
    const currency = (payCurrency === 'OTHER' ? payOtherCurrency : payCurrency).trim().toUpperCase();
    const amount = payAmount.trim();
    const flightId = payFlightId;

    if (canFilterFirm && !payFirmId) {
      toast.error(tr('Select a firm for this payment', "Ushbu to'lov uchun firmangizni tanlang"));
      return;
    }
    if (!flightId) {
      toast.error(tr('Select a flight for this payment', "Ushbu to'lov uchun reysni tanlang"));
      return;
    }
    if (!amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      toast.error(tr('Enter a valid amount', "To'g'ri summani kiriting"));
      return;
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      toast.error(tr('Currency must be a 3-letter code (e.g. USD)', 'Valyuta 3 harfli kod bo\'lishi kerak (masalan, USD)'));
      return;
    }

    if (currency !== 'UZS') {
      const rateRaw = payExchangeRate.trim();
      const rateNum = rateRaw ? Number(rateRaw) : NaN;
      if (payCurrency === 'OTHER') {
        if (!rateRaw || !Number.isFinite(rateNum) || rateNum <= 0) {
          toast.error(tr('Enter a valid exchange rate (required for non-UZS currencies)', 'To\'g\'ri kursni kiriting (UZS bo\'lmagan valyutalar uchun majburiy)'));
          return;
        }
      }
      if (rateRaw && (!Number.isFinite(rateNum) || rateNum <= 0)) {
        toast.error(tr('Enter a valid exchange rate', 'To\'g\'ri kursni kiriting'));
        return;
      }
    }
    if (method !== 'cash' && method !== 'card') {
      toast.error(tr('Select a payment method', "To'lov usulini tanlang"));
      return;
    }

    const metadata: any = {};
    if (payReference.trim()) metadata.reference = payReference.trim();

    if (method === 'cash') {
      if (!payCashDate) {
        toast.error(tr('Cash payments require a date', "Naqd to'lov uchun sana kerak"));
        return;
      }
      metadata.date = payCashDate;
    }

    if (method === 'card') {
      if (!payCardProvider.trim()) {
        toast.error(tr('Card payments require a provider', "Karta to'lovi uchun provayder kerak"));
        return;
      }
      if (!payCardReference.trim()) {
        toast.error(tr('Card payments require a transaction reference', "Karta to'lovi uchun tranzaksiya raqami kerak"));
        return;
      }
      metadata.payment_provider = payCardProvider.trim();
      metadata.transaction_reference = payCardReference.trim();
    }

    try {
      setRecordingPayment(true);

      const body: any = {
        flightId,
        amount,
        currency,
        method,
        metadata,
      };
      if (canFilterFirm) body.firmId = payFirmId;

      if (currency !== 'UZS' && payExchangeRate.trim()) {
        body.exchangeRate = payExchangeRate.trim();
      }

      await api.post('/payments', body);
      toast.success(tr('Payment recorded', "To'lov qayd etildi"));

      setPayAmount('');
      setPayCardProvider('');
      setPayCardReference('');
      setPayReference('');
      setPayExchangeRate('');

      setPage(1);
      setReloadKey((k) => k + 1);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || tr('Failed to record payment', "To'lovni qayd etib bo'lmadi"));
    } finally {
      setRecordingPayment(false);
    }
  };

  useEffect(() => {
    if (!prefsReady) return;
    const fetchTransactions = async () => {
      try {
        setLoading(true);
        const query = new URLSearchParams();
        if (filterType) query.append('type', filterType.toUpperCase());
        if (canFilterFirm && filterFirmId) query.append('firmId', filterFirmId);
        if (filterFlightId) query.append('flightId', filterFlightId);
        if (filterCurrency.trim()) query.append('currency', filterCurrency.trim().toUpperCase());
        if (dateFrom) query.append('dateFrom', dateFrom);
        if (dateTo) query.append('dateTo', dateTo);
        query.append('page', String(page));
        query.append('limit', String(limit));
        
        const res = await api.get(`/transactions?${query.toString()}`);
        
        if (res.data.data) {
          // New Paginated Format
          setTransactions(res.data.data);
          setTotal(res.data.meta.total);
          setTotalPages(res.data.meta.totalPages);
        } else {
          // Fallback array format if backend not yet restarted
          setTransactions(res.data);
          setTotal(res.data.length);
          setTotalPages(Math.ceil(res.data.length / limit) || 1);
        }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (err: any) {
        toast.error(tr('Failed to load transactions', 'Tranzaksiyalarni yuklab bo\'lmadi'));
      } finally {
        setLoading(false);
      }
    };
    fetchTransactions();
  }, [prefsReady, filterType, filterFirmId, filterFlightId, filterCurrency, dateFrom, dateTo, page, limit, canFilterFirm, reloadKey, tr]);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [flightsRes, firmsRes] = await Promise.all([
          api.get('/flights'),
          canFilterFirm ? api.get('/firms') : Promise.resolve({ data: [] }),
        ]);

        const flights = Array.isArray(flightsRes.data) ? flightsRes.data : [];
        setFlightOptions(flights);

        const firms = Array.isArray(firmsRes.data) ? firmsRes.data : [];
        setFirmOptions(firms);
      } catch {
        // Non-fatal; filters can still be used via manual inputs.
      }
    };

    loadOptions();
  }, [canFilterFirm]);

  const getTransactionTypeLabel = (type?: string) => {
    const normalized = String(type || '').trim().toUpperCase();
    if (normalized === 'SALE') return tr('SALE', 'SOTUV');
    if (normalized === 'PAYABLE') return tr('PAYABLE', 'QARZDORLIK');
    if (normalized === 'PAYMENT') return tr('PAYMENT', "TO'LOV");
    if (normalized === 'ADJUSTMENT') return tr('ADJUSTMENT', 'KORREKSIYA');
    return normalized || String(type || '');
  };

  const getPaymentMethodLabel = (method?: string) => {
    const normalized = String(method || '').trim().toLowerCase();
    if (normalized === 'cash') return tr('Cash', 'Naqd');
    if (normalized === 'card') return tr('Card', 'Karta');
    return method ? String(method) : '-';
  };

  const getTransactionTypeHelp = (type?: string) => {
    const normalized = String(type || '').trim().toUpperCase();
    if (normalized === 'SALE') return tr('Ticket sale (revenue)', 'Chipta sotuv (daromad)');
    if (normalized === 'PAYABLE') return tr('Debt created (firm owes)', 'Qarz yaratildi (firma qarzdor)');
    if (normalized === 'PAYMENT') return tr('Payment received/recorded', "To'lov qabul qilindi/qayd etildi");
    if (normalized === 'ADJUSTMENT') return tr('Manual correction entry', 'Qo\'lda kiritilgan tuzatish');
    return normalized || String(type || '');
  };

  const hasActiveFilters = Boolean(
    filterType ||
    (canFilterFirm && filterFirmId) ||
    filterFlightId ||
    filterCurrency.trim() ||
    dateFrom ||
    dateTo,
  );

  const clearFilters = () => {
    setFilterType('');
    setFilterFirmId('');
    setFilterFlightId('');
    setFilterCurrency('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const resolvedRate = (() => {
    if (payCurrencyCode === 'UZS') return { rate: 1, source: 'base' as const };
    if (Number.isFinite(payExchangeRateNum) && payExchangeRateNum > 0) return { rate: payExchangeRateNum, source: 'manual' as const };
    if (typeof savedRate === 'number' && Number.isFinite(savedRate) && savedRate > 0) return { rate: savedRate, source: 'saved' as const };
    return { rate: null as number | null, source: 'missing' as const };
  })();

  const previewBaseAmount = (() => {
    if (!Number.isFinite(payAmountNum) || payAmountNum <= 0) return null;
    if (!resolvedRate.rate || !Number.isFinite(resolvedRate.rate) || resolvedRate.rate <= 0) return null;
    return payAmountNum * resolvedRate.rate;
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">{tr('Transactions', 'Tranzaksiyalar')}</h2>
      </div>

      <CollapsibleCard
        title={tr('Record payment', "To'lovni qayd etish")}
        description={
          <>
            {tr('Creates a', 'Bu')}{' '}
            <span className="font-semibold">PAYMENT</span>{' '}
            {tr('transaction.', 'tranzaksiyasini yaratadi.')}{' '}
            {tr('Supported currencies:', 'Qo‘llab-quvvatlanadigan valyutalar:')}{' '}
            <span className="font-semibold">UZS</span> / <span className="font-semibold">USD</span>{' '}
            {tr('(non-UZS currencies require an exchange rate).', '(UZS bo\'lmagan valyutalar uchun kurs kerak).')}
          </>
        }
        defaultOpen={false}
        storageKey="jetstream-transactions-record-payment-open"
        className="shadow sm:rounded-lg"
      >
        <form onSubmit={submitPayment} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
          {canFilterFirm && (
            <div>
              <label htmlFor="payFirm" className="block text-sm font-medium text-muted">{tr('Firm', 'Firma')}</label>
              <select
                id="payFirm"
                value={payFirmId}
                onChange={(e) => setPayFirmId(e.target.value)}
                className="mt-1 block w-full rounded-md bg-surface border border-border py-2 pl-3 pr-10 text-foreground outline-none focus:border-blue-500 transition sm:text-sm"
                required
              >
                <option value="">{tr('Select', 'Tanlang')}</option>
                {firmOptions.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="payFlight" className="block text-sm font-medium text-muted">{tr('Flight', 'Reys')}</label>
            <select
              id="payFlight"
              value={payFlightId}
              onChange={(e) => setPayFlightId(e.target.value)}
              className="mt-1 block w-full rounded-md bg-surface border border-border py-2 pl-3 pr-10 text-foreground outline-none focus:border-blue-500 transition sm:text-sm"
              required
            >
              <option value="">{tr('Select', 'Tanlang')}</option>
              {flightOptions.map((f) => {
                const fid = f.id ?? f.flight_id;
                if (!fid) return null;
                return (
                  <option key={fid} value={fid}>
                    {f.flightNumber || fid}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label htmlFor="payAmount" className="block text-sm font-medium text-muted">{tr('Amount', 'Summa')}</label>
            <input
              id="payAmount"
              type="number"
              step="0.01"
              min="0"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder="0.00"
              className="mt-1 block w-full rounded-md bg-surface border border-border py-2 px-3 text-foreground placeholder:text-muted outline-none focus:border-blue-500 transition sm:text-sm"
              required
            />
          </div>

          <div>
            <label htmlFor="payCurrency" className="block text-sm font-medium text-muted">{tr('Currency', 'Valyuta')}</label>
            <select
              id="payCurrency"
              value={payCurrency}
              onChange={(e) => {
                setPayCurrency(e.target.value as any);
                setPayExchangeRate('');
              }}
              className="mt-1 block w-full rounded-md bg-surface border border-border py-2 pl-3 pr-10 text-foreground outline-none focus:border-blue-500 transition sm:text-sm"
              required
            >
              <option value="UZS">UZS</option>
              <option value="USD">USD</option>
              <option value="OTHER">{tr('Other', 'Boshqa')}</option>
            </select>
          </div>

          {payCurrency === 'OTHER' && (
            <div>
              <label htmlFor="payOtherCurrency" className="block text-sm font-medium text-muted">{tr('Other currency', 'Boshqa valyuta')}</label>
              <input
                id="payOtherCurrency"
                value={payOtherCurrency}
                onChange={(e) => setPayOtherCurrency(e.target.value)}
                placeholder={tr('e.g. EUR', 'masalan, EUR')}
                className="mt-1 block w-full rounded-md bg-surface border border-border py-2 px-3 text-foreground placeholder:text-muted outline-none focus:border-blue-500 transition sm:text-sm"
                required
              />
            </div>
          )}

          {(payCurrency !== 'UZS') && (
            <div>
              <label htmlFor="payExchangeRate" className="block text-sm font-medium text-muted">
                {(payCurrency === 'OTHER' ? (payOtherCurrency || 'XXX') : payCurrency).toUpperCase()}→UZS {tr('rate', 'kursi')}
              </label>
              <input
                id="payExchangeRate"
                type="number"
                step="0.000001"
                min="0"
                value={payExchangeRate}
                onChange={(e) => setPayExchangeRate(e.target.value)}
                placeholder={payCurrency === 'OTHER'
                  ? tr('Required', 'Majburiy')
                  : tr('Optional if rate is already saved for that day', 'Agar kurs shu kunga saqlangan bo\'lsa ixtiyoriy')}
                className="mt-1 block w-full rounded-md bg-surface border border-border py-2 px-3 text-foreground placeholder:text-muted outline-none focus:border-blue-500 transition sm:text-sm"
                required={payCurrency === 'OTHER'}
              />
              <p className="mt-1 text-xs text-muted">
                {tr('Enter how many', 'To\'lov sanasi uchun')}{' '}
                <span className="font-semibold">UZS</span>{' '}
                {tr('equals', 'nechta ekanligini kiriting:')}{' '}
                <span className="font-semibold">1 {(payCurrency === 'OTHER' ? (payOtherCurrency || 'XXX') : payCurrency).toUpperCase()}</span>.
              </p>
            </div>
          )}

          <div>
            <label htmlFor="payMethod" className="block text-sm font-medium text-muted">{tr('Method', 'Usul')}</label>
            <select
              id="payMethod"
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as any)}
              className="mt-1 block w-full rounded-md bg-surface border border-border py-2 pl-3 pr-10 text-foreground outline-none focus:border-blue-500 transition sm:text-sm"
              required
            >
              <option value="cash">{tr('Cash', 'Naqd')}</option>
              <option value="card">{tr('Card', 'Karta')}</option>
            </select>
          </div>

          <div>
            <label htmlFor="payReference" className="block text-sm font-medium text-muted">{tr('Reference (optional)', 'Izoh (ixtiyoriy)')}</label>
            <input
              id="payReference"
              value={payReference}
              onChange={(e) => setPayReference(e.target.value)}
              placeholder={tr('Receipt / note', 'Kvitansiya / izoh')}
              className="mt-1 block w-full rounded-md bg-surface border border-border py-2 px-3 text-foreground placeholder:text-muted outline-none focus:border-blue-500 transition sm:text-sm"
            />
          </div>

          {payMethod === 'cash' && (
            <div>
              <label htmlFor="payCashDate" className="block text-sm font-medium text-muted">{tr('Cash date', 'Naqd sana')}</label>
              <input
                id="payCashDate"
                type="date"
                value={payCashDate}
                onChange={(e) => setPayCashDate(e.target.value)}
                className="mt-1 block w-full rounded-md bg-surface border border-border py-2 px-3 text-foreground outline-none focus:border-blue-500 transition sm:text-sm"
                required
              />
            </div>
          )}

          {payMethod === 'card' && (
            <>
              <div>
                <label htmlFor="payCardProvider" className="block text-sm font-medium text-muted">{tr('Card provider', 'Karta provayderi')}</label>
                <input
                  id="payCardProvider"
                  value={payCardProvider}
                  onChange={(e) => setPayCardProvider(e.target.value)}
                  placeholder={tr('e.g. Visa / Stripe', 'masalan, Visa / Stripe')}
                  className="mt-1 block w-full rounded-md bg-surface border border-border py-2 px-3 text-foreground placeholder:text-muted outline-none focus:border-blue-500 transition sm:text-sm"
                  required
                />
              </div>

              <div>
                <label htmlFor="payCardReference" className="block text-sm font-medium text-muted">{tr('Transaction reference', 'Tranzaksiya raqami')}</label>
                <input
                  id="payCardReference"
                  value={payCardReference}
                  onChange={(e) => setPayCardReference(e.target.value)}
                  placeholder={tr('Bank / gateway reference', 'Bank / to\'lov tizimi raqami')}
                  className="mt-1 block w-full rounded-md bg-surface border border-border py-2 px-3 text-foreground placeholder:text-muted outline-none focus:border-blue-500 transition sm:text-sm"
                  required
                />
              </div>
            </>
          )}

          <div className="sm:col-span-2 lg:col-span-6">
            <div className="mb-3 text-xs text-muted">
              {payCurrencyCode === 'UZS' ? (
                <span>
                  {tr('Preview:', 'Ko\'rinish:')} {tr('Base amount equals original amount (UZS).', 'Bazaviy summa asl summaga teng (UZS).')}
                </span>
              ) : previewBaseAmount != null ? (
                <span>
                  {tr('Preview:', 'Ko\'rinish:')} {payAmountNum.toFixed(2)} {payCurrencyCode} × {resolvedRate.rate?.toFixed(6)} = {previewBaseAmount.toFixed(2)} UZS
                  {resolvedRate.source === 'manual'
                    ? ` (${tr('manual rate', 'qo\'lda kurs')})`
                    : resolvedRate.source === 'saved'
                      ? ` (${tr('saved rate', 'saqlangan kurs')}${savedRateSource ? `: ${savedRateSource}` : ''})`
                      : ''}
                  {savedRateLoading && resolvedRate.source !== 'manual' ? ` · ${tr('looking up saved rate…', 'saqlangan kurs qidirilmoqda…')}` : ''}
                </span>
              ) : (
                <span>
                  {savedRateLoading
                    ? tr('Looking up saved exchange rate…', 'Saqlangan kurs qidirilmoqda…')
                    : tr(
                        `No saved exchange rate found for ${rateLookupDate} — enter the rate manually.`,
                        `${rateLookupDate} uchun saqlangan kurs topilmadi — kursni qo'lda kiriting.`
                      )}
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={recordingPayment}
              className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {recordingPayment ? tr('Recording...', 'Qayd etilmoqda...') : tr('Record payment', "To'lovni qayd etish")}
            </button>
          </div>
        </form>
      </CollapsibleCard>

      <CollapsibleCard
        title={tr('Filters', 'Filtrlar')}
        defaultOpen={false}
        storageKey="jetstream-transactions-filters-open"
        className="shadow sm:rounded-lg"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          <div>
            <label htmlFor="dateFrom" className="block text-sm font-medium text-muted">{tr('Date from', 'Sana (dan)')}</label>
            <input
              id="dateFrom"
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="mt-1 block w-full rounded-md bg-surface border border-border py-2 px-3 text-foreground outline-none focus:border-blue-500 transition sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="dateTo" className="block text-sm font-medium text-muted">{tr('Date to', 'Sana (gacha)')}</label>
            <input
              id="dateTo"
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="mt-1 block w-full rounded-md bg-surface border border-border py-2 px-3 text-foreground outline-none focus:border-blue-500 transition sm:text-sm"
            />
          </div>

          {canFilterFirm && (
            <div>
              <label htmlFor="firm" className="block text-sm font-medium text-muted">{tr('Firm', 'Firma')}</label>
              <select
                id="firm"
                value={filterFirmId}
                onChange={(e) => { setFilterFirmId(e.target.value); setPage(1); }}
                className="mt-1 block w-full rounded-md bg-surface border border-border py-2 pl-3 pr-10 text-foreground outline-none focus:border-blue-500 transition sm:text-sm"
              >
                <option value="">{tr('All', 'Barchasi')}</option>
                {firmOptions.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="flight" className="block text-sm font-medium text-muted">{tr('Flight', 'Reys')}</label>
            <select
              id="flight"
              value={filterFlightId}
              onChange={(e) => { setFilterFlightId(e.target.value); setPage(1); }}
              className="mt-1 block w-full rounded-md bg-surface border border-border py-2 pl-3 pr-10 text-foreground outline-none focus:border-blue-500 transition sm:text-sm"
            >
              <option value="">{tr('All', 'Barchasi')}</option>
              {flightOptions.map((f) => {
                const fid = f.id ?? f.flight_id;
                if (!fid) return null;
                return (
                  <option key={fid} value={fid}>
                    {f.flightNumber || fid}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label htmlFor="type" className="block text-sm font-medium text-muted">{tr('Type', 'Turi')}</label>
            <select
              id="type"
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
              className="mt-1 block w-full rounded-md bg-surface border border-border py-2 pl-3 pr-10 text-foreground outline-none focus:border-blue-500 transition sm:text-sm"
            >
              <option value="">{tr('All', 'Barchasi')}</option>
              <option value="sale">{tr('Sale', 'Sotuv')}</option>
              <option value="payable">{tr('Payable (Debt)', 'Qarz (qarzdorlik)')}</option>
              <option value="payment">{tr('Payment', "To'lov")}</option>
              <option value="adjustment">{tr('Adjustment', 'Korreksiya')}</option>
            </select>
          </div>

          <div>
            <label htmlFor="currency" className="block text-sm font-medium text-muted">{tr('Currency', 'Valyuta')}</label>
            <input
              id="currency"
              value={filterCurrency}
              onChange={(e) => { setFilterCurrency(e.target.value); setPage(1); }}
              placeholder={tr('e.g. USD', 'masalan, USD')}
              className="mt-1 block w-full rounded-md bg-surface border border-border py-2 px-3 text-foreground placeholder:text-muted outline-none focus:border-blue-500 transition sm:text-sm"
            />
          </div>
        </div>
      </CollapsibleCard>

      <div className="bg-surface-2 border border-border shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-3 border-b border-border flex items-center justify-end">
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setTransactionsView('list')}
              aria-pressed={transactionsView === 'list'}
              className={`px-3 py-2 text-sm font-medium transition ${transactionsView === 'list'
                ? 'bg-surface-2 text-foreground'
                : 'bg-surface text-muted hover:bg-surface-2'
              }`}
            >
              {tr('List', "Ro'yxat")}
            </button>
            <button
              type="button"
              onClick={() => setTransactionsView('boxes')}
              aria-pressed={transactionsView === 'boxes'}
              className={`px-3 py-2 text-sm font-medium transition ${transactionsView === 'boxes'
                ? 'bg-surface-2 text-foreground'
                : 'bg-surface text-muted hover:bg-surface-2'
              }`}
            >
              {tr('Boxes', 'Bloklar')}
            </button>
          </div>
        </div>

        {transactionsView === 'list' ? (
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-surface">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">{tr('Date', 'Sana')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">{tr('Type', 'Turi')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">{tr('Firm / Flight', 'Firma / Reys')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">{tr('Amount', 'Summa')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">{tr('Base Amount (UZS)', 'Bazaviy summa (UZS)')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">{tr('Payment Method', "To'lov usuli")}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">{tr('Reference', 'Izoh')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={7} className="px-6 py-4 text-center">{tr('Loading...', 'Yuklanmoqda...')}</td></tr>
              ) : transactions.map((t: any) => (
                <tr
                  key={t.id}
                  onClick={() => router.push(`/transactions/detail?id=${t.id}`)}
                  className="hover:bg-surface transition cursor-pointer"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                    {format(new Date(t.createdAt || t.created_at), 'PPP pp')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold border ${
                      (t.type || '').toLowerCase() === 'sale' ? 'bg-green-900/30 text-green-300 border-green-700/50' :
                      (t.type || '').toLowerCase() === 'payable' ? 'bg-red-900/30 text-red-300 border-red-700/50' :
                      (t.type || '').toLowerCase() === 'payment' ? 'bg-indigo-900/30 text-indigo-300 border-indigo-700/50' :
                      'bg-surface text-muted border-border'
                    }`}
                    title={getTransactionTypeHelp(t.type)}>
                      {getTransactionTypeLabel(t.type)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted flex flex-col gap-1">
                    <span>{tr('Firm', 'Firma')}: {t.firm?.name || t.firmId || t.firm_id}</span>
                    <span>{tr('Flight', 'Reys')}: {t.flight?.flightNumber || t.flightId || t.flight_id}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground font-semibold">
                    {Number(t.originalAmount || t.original_amount).toFixed(2)} {t.currency}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                    {Number(t.baseAmount || t.base_amount).toFixed(2)} UZS
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                    {getPaymentMethodLabel(t.paymentMethod || t.payment_method)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                    {(() => {
                      const meta = t.metadata && typeof t.metadata === 'object' ? t.metadata : null;
                      const ref = meta ? (meta.transaction_reference || meta.reference || meta.note) : null;
                      return ref ? String(ref) : '-';
                    })()}
                  </td>
                </tr>
              ))}
              {!loading && transactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-sm text-muted">
                    <div className="space-y-2">
                      <div>{tr('No transactions found.', 'Tranzaksiyalar topilmadi.')}</div>
                      {hasActiveFilters ? (
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="px-3 py-2 bg-surface hover:bg-surface-2 text-foreground rounded-lg transition border border-border text-sm font-medium"
                        >
                          {tr('Clear filters', 'Filtrlarni tozalash')}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <div className="p-4">
            {loading ? (
              <div className="py-6 text-center text-sm text-muted">{tr('Loading...', 'Yuklanmoqda...')}</div>
            ) : transactions.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted space-y-2">
                <div>{tr('No transactions found.', 'Tranzaksiyalar topilmadi.')}</div>
                {hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="px-3 py-2 bg-surface hover:bg-surface-2 text-foreground rounded-lg transition border border-border text-sm font-medium"
                  >
                    {tr('Clear filters', 'Filtrlarni tozalash')}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {transactions.map((t: any) => {
                  const type = String(t.type || '').toLowerCase();
                  const typeClass = type === 'sale'
                    ? 'bg-green-900/30 text-green-300 border-green-700/50'
                    : type === 'payable'
                      ? 'bg-red-900/30 text-red-300 border-red-700/50'
                      : type === 'payment'
                        ? 'bg-indigo-900/30 text-indigo-300 border-indigo-700/50'
                        : 'bg-surface text-muted border-border';
                  const meta = t.metadata && typeof t.metadata === 'object' ? t.metadata : null;
                  const ref = meta ? (meta.transaction_reference || meta.reference || meta.note) : null;

                  return (
                    <div
                      key={t.id}
                      onClick={() => router.push(`/transactions/detail?id=${t.id}`)}
                      className="bg-surface border border-border rounded-lg p-4 hover:bg-surface-2 transition cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm text-muted">
                          {format(new Date(t.createdAt || t.created_at), 'PPP pp')}
                        </div>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-bold border ${typeClass}`}
                          title={getTransactionTypeHelp(t.type)}
                        >
                          {getTransactionTypeLabel(t.type)}
                        </span>
                      </div>

                      <div className="mt-3 text-sm text-foreground space-y-1">
                        <div>{tr('Firm', 'Firma')}: {t.firm?.name || t.firmId || t.firm_id}</div>
                        <div>{tr('Flight', 'Reys')}: {t.flight?.flightNumber || t.flightId || t.flight_id}</div>
                      </div>

                      <div className="mt-3 text-sm text-foreground space-y-1">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted">{tr('Amount', 'Summa')}</span>
                          <span className="font-semibold text-foreground">
                            {Number(t.originalAmount || t.original_amount).toFixed(2)} {t.currency}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted">{tr('Base', 'Baza')}</span>
                          <span>{Number(t.baseAmount || t.base_amount).toFixed(2)} UZS</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted">{tr('Method', 'Usul')}</span>
                          <span>{getPaymentMethodLabel(t.paymentMethod || t.payment_method)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted">{tr('Reference', 'Izoh')}</span>
                          <span className="text-right truncate max-w-[14rem]">{ref ? String(ref) : '-'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        
        {/* Pagination Controls */}
        <div className="bg-surface-2 px-4 py-3 border-t border-border sm:px-6 flex items-center justify-between">
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              {(() => {
                const start = loading ? 0 : Math.min((page - 1) * limit + 1, total);
                const end = Math.min(page * limit, total);
                if (language === 'uz') {
                  return (
                    <p className="text-sm text-muted">
                      <span className="font-medium text-foreground">{total}</span>
                      {' '}{tr('results', 'ta natijadan')}{' '}
                      <span className="font-medium text-foreground">{start}</span>
                      {' '}{tr('to', 'dan')}{' '}
                      <span className="font-medium text-foreground">{end}</span>
                      {' '}{tr('showing', 'gacha ko\'rsatilmoqda')}
                    </p>
                  );
                }

                return (
                  <p className="text-sm text-muted">
                    {tr('Showing', 'Showing')}{' '}
                    <span className="font-medium text-foreground">{start}</span>
                    {' '}to{' '}
                    <span className="font-medium text-foreground">{end}</span>
                    {' '}of{' '}
                    <span className="font-medium text-foreground">{total}</span>
                    {' '}results
                  </p>
                );
              })()}
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-border bg-surface text-sm font-medium text-muted hover:bg-surface-2 disabled:opacity-50"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="relative inline-flex items-center px-4 py-2 border border-border bg-surface text-sm font-medium text-foreground">
                  {tr('Page', 'Sahifa')} {page} {tr('of', ' / ')} {totalPages}
                </div>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || totalPages === 0}
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-border bg-surface text-sm font-medium text-muted hover:bg-surface-2 disabled:opacity-50"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </nav>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
