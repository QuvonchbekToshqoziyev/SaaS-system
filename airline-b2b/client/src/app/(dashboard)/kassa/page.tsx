/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { Lock, Unlock, Wallet, CreditCard, AlertCircle, CheckCircle2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import CollapsibleCard from '@/components/ui/CollapsibleCard';
import { api } from '@/lib/api';

type FirmOption = { id: string; name: string; currency?: string | null; kind?: string | null };
type FlightOption = { id?: string; flight_id?: string; flightNumber?: string };
type PaymentCard = {
  id: string;
  ownerName: string;
  cardNumber: string;
  currency: 'UZS' | 'USD';
  balance?: number;
  dailyIn?: number;
  dailyOut?: number;
  dailyNet?: number;
};

type KassaDesk = {
  id: string;
  firmId: string;
  name: string;
  code?: string | null;
  status?: string;
  firm?: { id: string; name: string | null } | null;
};

type KassaSummary = {
  businessDate: string;
  status: 'NOT_OPEN' | 'OPEN' | 'CLOSED';
  kassa: any;
  kassaDesks?: KassaDesk[];
  totals: {
    cashTotal: number;
    cashInTotal?: number;
    cashOutTotal?: number;
    cardTotal: number;
    cardInTotal?: number;
    cardOutTotal?: number;
    dailyIncomeTotal?: number;
    dailyExpenseTotal?: number;
    cardBalanceTotal?: number;
    paymentCount: number;
    saleTotal: number;
    payableTotal: number;
    transactionCount: number;
    expectedCash: number | null;
  };
  transactions: any[];
  paymentCards: PaymentCard[];
  permissions?: {
    canOperateKassa?: boolean;
  };
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

type KassaConfirmAction =
  | { kind: 'open' }
  | { kind: 'close' }
  | { kind: 'payment'; body: any; label: string }
  | { kind: 'cash'; body: any; label: string };

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

export default function KassaPage() {
  const { user } = useAuth();
  const { tr } = useLanguage();
  const router = useRouter();

  const role = String(user?.role || '').toLowerCase();
  const isFirm = role === 'firm';
  const isSuperAdmin = role === 'superadmin';
  const isAdmin = role === 'admin' || role === 'superadmin';
  const canAccess = isFirm || isAdmin;

  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [summaryKassaDeskId, setSummaryKassaDeskId] = useState('');
  const [summary, setSummary] = useState<KassaSummary | null>(null);
  const canManageKassa = Boolean(summary?.permissions?.canOperateKassa) || isSuperAdmin;
  const canFilterFirm = isAdmin;
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const [openingBalance, setOpeningBalance] = useState('0');
  const [closingBalance, setClosingBalance] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [openingKassa, setOpeningKassa] = useState(false);
  const [closingKassa, setClosingKassa] = useState(false);
  const [reopeningKassa, setReopeningKassa] = useState(false);
  const [reopenNotes, setReopenNotes] = useState('');

  const [firmOptions, setFirmOptions] = useState<FirmOption[]>([]);
  const [deskOptions, setDeskOptions] = useState<KassaDesk[]>([]);
  const [flightOptions, setFlightOptions] = useState<FlightOption[]>([]);
  const [paymentCards, setPaymentCards] = useState<PaymentCard[]>([]);

  const [payFirmId, setPayFirmId] = useState('');
  const [payFlightId, setPayFlightId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payCurrency, setPayCurrency] = useState<'USD' | 'UZS' | 'OTHER'>('UZS');
  const [payOtherCurrency, setPayOtherCurrency] = useState('');
  const [payMethod, setPayMethod] = useState<'cash' | 'card'>('cash');
  const [payCardId, setPayCardId] = useState('');
  const [payCardReference, setPayCardReference] = useState('');
  const [payReference, setPayReference] = useState('');
  const [payKassaDeskId, setPayKassaDeskId] = useState('');
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [cashFlow, setCashFlow] = useState<'IN' | 'OUT'>('IN');
  const [cashMethod, setCashMethod] = useState<'cash' | 'card'>('cash');
  const [cashCardId, setCashCardId] = useState('');
  const [cashFirmId, setCashFirmId] = useState('');
  const [cashCounterpartyFirmId, setCashCounterpartyFirmId] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [cashNote, setCashNote] = useState('');
  const [cashKassaDeskId, setCashKassaDeskId] = useState('');
  const [recordingCash, setRecordingCash] = useState(false);
  const [cardOwnerName, setCardOwnerName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardCurrency, setCardCurrency] = useState<'UZS' | 'USD'>('UZS');
  const [creatingCard, setCreatingCard] = useState(false);
  const [deskName, setDeskName] = useState('');
  const [deskCode, setDeskCode] = useState('');
  const [deskFirmId, setDeskFirmId] = useState('');
  const [creatingDesk, setCreatingDesk] = useState(false);
  const [confirmAction, setConfirmAction] = useState<KassaConfirmAction | null>(null);

  const isEditable = summary?.status === 'OPEN';
  const isClosed = summary?.status === 'CLOSED';
  const isNotOpen = summary?.status === 'NOT_OPEN';
  const canRecordPayment = canManageKassa;
  const cashBalanceByCurrency = useMemo(() => {
    const balances: Record<string, number> = { UZS: Number(summary?.kassa?.openingBalance || 0) || 0, USD: 0 };
    for (const tx of summary?.transactions || []) {
      if (String(tx.paymentMethod || '').toLowerCase() !== 'cash') continue;
      const currency = String(tx.currency || 'UZS').toUpperCase();
      const amount = Number(tx.originalAmount || 0) || 0;
      if (!balances[currency]) balances[currency] = 0;
      if (tx.direction === 'KASSA_OUT') balances[currency] -= amount;
      else if (tx.direction === 'KASSA_IN' || tx.type === 'PAYMENT' || tx.type === 'SALE') balances[currency] += amount;
    }
    return balances;
  }, [summary]);

  const payCurrencyCode = useMemo(() => {
    const c = payCurrency === 'OTHER' ? payOtherCurrency : payCurrency;
    return String(c || '').trim().toUpperCase();
  }, [payCurrency, payOtherCurrency]);
  const selectedPayCard = useMemo(() => paymentCards.find((card) => card.id === payCardId), [paymentCards, payCardId]);
  const selectedCashCard = useMemo(() => paymentCards.find((card) => card.id === cashCardId), [paymentCards, cashCardId]);
  const selectedPayFirm = useMemo(() => firmOptions.find((firm) => firm.id === payFirmId), [firmOptions, payFirmId]);
  const selectedCashFirm = useMemo(() => firmOptions.find((firm) => firm.id === (canFilterFirm ? cashFirmId : user?.firmId)), [firmOptions, cashFirmId, canFilterFirm, user?.firmId]);
  const selectedPayFlight = useMemo(() => flightOptions.find((flight) => String(flight.id || flight.flight_id || '') === payFlightId), [flightOptions, payFlightId]);
  const selectedPayDesk = useMemo(() => deskOptions.find((desk) => desk.id === payKassaDeskId), [deskOptions, payKassaDeskId]);
  const selectedCashDesk = useMemo(() => deskOptions.find((desk) => desk.id === cashKassaDeskId), [deskOptions, cashKassaDeskId]);
  const cashCounterpartyOptions = useMemo(
    () => firmOptions.filter((firm) => firm.id !== (canFilterFirm ? cashFirmId : user?.firmId)),
    [firmOptions, canFilterFirm, cashFirmId, user?.firmId],
  );
  const payDeskFirmId = canFilterFirm ? payFirmId : String(user?.firmId || '');
  const cashDeskFirmId = canFilterFirm ? cashFirmId : String(user?.firmId || '');
  const payDeskOptions = useMemo(
    () => deskOptions.filter((desk) => !payDeskFirmId || desk.firmId === payDeskFirmId),
    [deskOptions, payDeskFirmId],
  );
  const cashDeskOptions = useMemo(
    () => deskOptions.filter((desk) => !cashDeskFirmId || desk.firmId === cashDeskFirmId),
    [deskOptions, cashDeskFirmId],
  );

  const setPaymentCurrencyCode = (currency: string) => {
    const next = String(currency || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(next)) return;
    if (next === 'UZS' || next === 'USD') {
      setPayCurrency(next);
      setPayOtherCurrency('');
    } else {
      setPayCurrency('OTHER');
      setPayOtherCurrency(next);
    }
  };

  useEffect(() => {
    if (!user) {
      router.push('/login');
    }
  }, [user, router]);

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true);
      const query = new URLSearchParams({ date: selectedDate });
      if (summaryKassaDeskId) query.set('kassaDeskId', summaryKassaDeskId);
      const res = await api.get(`/kassa?${query.toString()}`);
      setSummary(res.data);
      setDeskOptions(Array.isArray(res.data?.kassaDesks) ? res.data.kassaDesks : []);
      setPaymentCards(Array.isArray(res.data?.paymentCards) ? res.data.paymentCards : []);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || tr('Failed to load kassa', 'Kassani yuklab bo\'lmadi'));
    } finally {
      setLoading(false);
    }
  }, [selectedDate, summaryKassaDeskId, tr]);

  useEffect(() => {
    if (!canAccess) return;
    loadSummary();
  }, [loadSummary, reloadKey, canAccess]);

  useEffect(() => {
    if (!canAccess) return;
    const loadOptions = async () => {
      try {
        const [flightsRes, firmsRes, desksRes, cardsRes] = await Promise.all([
          api.get('/flights'),
          canFilterFirm ? api.get('/firms') : Promise.resolve({ data: [] }),
          api.get('/kassa/desks'),
          api.get('/kassa/cards'),
        ]);
        setFlightOptions(Array.isArray(flightsRes.data) ? flightsRes.data : []);
        setFirmOptions(Array.isArray(firmsRes.data) ? firmsRes.data : []);
        setDeskOptions(Array.isArray(desksRes.data) ? desksRes.data : []);
        setPaymentCards(Array.isArray(cardsRes.data) ? cardsRes.data : []);
      } catch {
        // non-fatal
      }
    };
    loadOptions();
  }, [canFilterFirm, canAccess]);

  useEffect(() => {
    if (selectedPayFirm?.currency) {
      setPaymentCurrencyCode(selectedPayFirm.currency);
    }
  }, [selectedPayFirm?.currency]);

  useEffect(() => {
    if (payKassaDeskId && payDeskFirmId && !payDeskOptions.some((desk) => desk.id === payKassaDeskId)) {
      setPayKassaDeskId('');
    }
  }, [payDeskFirmId, payDeskOptions, payKassaDeskId]);

  useEffect(() => {
    if (cashKassaDeskId && cashDeskFirmId && !cashDeskOptions.some((desk) => desk.id === cashKassaDeskId)) {
      setCashKassaDeskId('');
    }
  }, [cashDeskFirmId, cashDeskOptions, cashKassaDeskId]);

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
    setConfirmAction({ kind: 'open' });
  };

  const openKassaConfirmed = async () => {
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
    setConfirmAction({ kind: 'close' });
  };

  const closeKassaConfirmed = async () => {
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

  const handleReopenKassa = async (e: FormEvent) => {
    e.preventDefault();
    if (reopeningKassa || !isSuperAdmin || !isClosed) return;
    try {
      setReopeningKassa(true);
      await api.post('/kassa/reopen', {
        businessDate: selectedDate,
        notes: reopenNotes.trim() || undefined,
      });
      toast.success(tr('Kassa reopened', 'Kassa qayta ochildi'));
      setReopenNotes('');
      setReloadKey((k) => k + 1);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || tr('Failed to reopen kassa', 'Kassani qayta ochib bo\'lmadi'));
    } finally {
      setReopeningKassa(false);
    }
  };

  const submitCashMovement = async (e: FormEvent) => {
    e.preventDefault();
    if (recordingCash || !isEditable || !canRecordPayment) return;
    const amount = cashAmount.trim();
    const firmId = canFilterFirm ? cashFirmId.trim() : String(user?.firmId || '');
    if (!firmId) {
      toast.error(tr('Select a firm', 'Firmani tanlang'));
      return;
    }
    if (cashDeskOptions.length > 0 && !cashKassaDeskId) {
      toast.error(tr('Select a kassa desk', 'Kassani tanlang'));
      return;
    }
    if (!amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      toast.error(tr('Enter a valid amount', 'To\'g\'ri summani kiriting'));
      return;
    }
    if (cashMethod === 'card' && !cashCardId) {
      toast.error(tr('Select a card', 'Kartani tanlang'));
      return;
    }
    const body = {
        flow: cashFlow,
        method: cashMethod,
        paymentCardId: cashMethod === 'card' ? cashCardId : undefined,
        businessDate: selectedDate,
        firmId,
        counterpartyFirmId: cashCounterpartyFirmId || undefined,
        kassaDeskId: cashKassaDeskId || undefined,
        amount,
        currency: cashMethod === 'card' ? selectedCashCard?.currency || 'UZS' : selectedCashFirm?.currency || 'UZS',
        note: cashNote.trim() || undefined,
      };
    setConfirmAction({
      kind: 'cash',
      body,
      label: `${cashFlow === 'IN' ? tr('Income', 'Kirim') : tr('Expense', 'Chiqim')} · ${amount} ${body.currency}`,
    });
  };

  const cashMovementConfirmed = async (body: any) => {
    try {
      setRecordingCash(true);
      await api.post('/transactions/cash', body);
      toast.success(cashFlow === 'IN' ? tr('Income recorded', 'Kirim qayd etildi') : tr('Expense recorded', 'Chiqim qayd etildi'));
      setCashAmount('');
      setCashNote('');
      setCashCounterpartyFirmId('');
      setReloadKey((k) => k + 1);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || tr('Failed to record cash movement', 'Kassa harakatini qayd etib bo\'lmadi'));
    } finally {
      setRecordingCash(false);
    }
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
    if (payDeskOptions.length > 0 && !payKassaDeskId) {
      toast.error(tr('Select a kassa desk', 'Kassani tanlang'));
      return;
    }

    const metadata: Record<string, string> = {};
    if (payReference.trim()) metadata.reference = payReference.trim();
    metadata.date = selectedDate;

    if (method === 'card') {
      if (!payCardId) {
        toast.error(tr('Select a card', 'Kartani tanlang'));
        return;
      }
      if (selectedPayCard?.currency && selectedPayCard.currency !== currency) {
        toast.error(tr('Selected card currency must match payment currency', 'Tanlangan karta valyutasi to\'lov valyutasiga mos bo\'lishi kerak'));
        return;
      }
      metadata.payment_provider = selectedPayCard?.ownerName || '';
      if (payCardReference.trim()) metadata.transaction_reference = payCardReference.trim();
    }

    const body: any = { amount, currency, method, metadata };
    if (method === 'card') body.paymentCardId = payCardId;
    if (canFilterFirm) body.firmId = payFirmId;
    if (flightId) body.flightId = flightId;
    if (payKassaDeskId) body.kassaDeskId = payKassaDeskId;
    setConfirmAction({
      kind: 'payment',
      body,
      label: `${amount} ${currency} · ${method === 'card' ? tr('Card', 'Karta') : tr('Cash', 'Naqd')}`,
    });
  };

  const paymentConfirmed = async (body: any) => {
    try {
      setRecordingPayment(true);
      await api.post('/payments', body);
      toast.success(tr('Payment recorded', 'To\'lov qayd etildi'));
      setPayAmount('');
      setPayCardId('');
      setPayCardReference('');
      setPayReference('');
      setReloadKey((k) => k + 1);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || tr('Failed to record payment', 'To\'lovni qayd etib bo\'lmadi'));
    } finally {
      setRecordingPayment(false);
    }
  };

  const confirmKassaAction = async () => {
    if (!confirmAction) return;
    const action = confirmAction;
    setConfirmAction(null);
    if (action.kind === 'open') return openKassaConfirmed();
    if (action.kind === 'close') return closeKassaConfirmed();
    if (action.kind === 'payment') return paymentConfirmed(action.body);
    return cashMovementConfirmed(action.body);
  };

  const createCard = async (e: FormEvent) => {
    e.preventDefault();
    if (creatingCard) return;
    if (!cardOwnerName.trim() || !cardNumber.trim()) {
      toast.error(tr('Card owner and number are required', 'Karta egasi va raqami kerak'));
      return;
    }
    try {
      setCreatingCard(true);
      await api.post('/kassa/cards', {
        ownerName: cardOwnerName.trim(),
        cardNumber: cardNumber.trim(),
        currency: cardCurrency,
      });
      toast.success(tr('Card added', 'Karta qo\'shildi'));
      setCardOwnerName('');
      setCardNumber('');
      setCardCurrency('UZS');
      setReloadKey((k) => k + 1);
      const cardsRes = await api.get('/kassa/cards');
      setPaymentCards(Array.isArray(cardsRes.data) ? cardsRes.data : []);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || tr('Failed to add card', 'Kartani qo\'shib bo\'lmadi'));
    } finally {
      setCreatingCard(false);
    }
  };

  const createDesk = async (e: FormEvent) => {
    e.preventDefault();
    if (creatingDesk) return;
    if (!deskName.trim()) {
      toast.error(tr('Desk name is required', 'Kassa nomi kerak'));
      return;
    }
    if (canFilterFirm && !deskFirmId) {
      toast.error(tr('Select a firm', 'Firmani tanlang'));
      return;
    }
    try {
      setCreatingDesk(true);
      await api.post('/kassa/desks', {
        name: deskName.trim(),
        code: deskCode.trim() || undefined,
        firmId: canFilterFirm ? deskFirmId : undefined,
      });
      toast.success(tr('Kassa desk added', 'Kassa qo\'shildi'));
      setDeskName('');
      setDeskCode('');
      setReloadKey((k) => k + 1);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || tr('Failed to add kassa desk', 'Kassani qo\'shib bo\'lmadi'));
    } finally {
      setCreatingDesk(false);
    }
  };

  const handlePayMethodChange = (next: 'cash' | 'card') => {
    setPayMethod(next);
    if (next === 'card' && selectedPayCard?.currency) {
      setPaymentCurrencyCode(selectedPayCard.currency);
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
          <select
            value={summaryKassaDeskId}
            onChange={(e) => setSummaryKassaDeskId(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-surface text-sm font-medium"
          >
            <option value="">{tr('All kassas', 'Barcha kassalar')}</option>
            {deskOptions.map((desk) => (
              <option key={desk.id} value={desk.id}>{desk.firm?.name ? `${desk.firm.name} · ` : ''}{desk.name}{desk.code ? ` (${desk.code})` : ''}</option>
            ))}
          </select>
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
                  'Kassa is not open for this day. Payments can be recorded once a kassir or superadmin opens kassa.',
                  'Bu kun uchun kassa ochilmagan. Kassir yoki superadmin kassani ochgach, to\'lovlarni qayd etish mumkin.'
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

      {isSuperAdmin && isClosed && (
        <CollapsibleCard
          title={tr('Reopen kassa', 'Kassani qayta ochish')}
          description={tr('Superadmin can reopen a closed kassa day for corrections. This is audit logged.', 'Superadmin yopilgan kassa kunini tuzatishlar uchun qayta ochishi mumkin. Bu auditga yoziladi.')}
          storageKey="kassa-reopen-card"
        >
          <form onSubmit={handleReopenKassa} className="compact-toolbar max-w-3xl">
            <div className="flex-1 min-w-[220px]">
              <label className="compact-label">{tr('Reason', 'Sabab')}</label>
              <input
                value={reopenNotes}
                onChange={(e) => setReopenNotes(e.target.value)}
                className="compact-control"
                placeholder={tr('Correction reason', 'Tuzatish sababi')}
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={reopeningKassa}
                className="px-5 py-2.5 bg-amber-600 text-white rounded-lg font-semibold text-sm uppercase tracking-wide hover:bg-amber-700 disabled:opacity-50"
              >
                {reopeningKassa ? tr('Reopening...', 'Qayta ochilyapti...') : tr('Reopen kassa', 'Kassani qayta ochish')}
              </button>
            </div>
          </form>
        </CollapsibleCard>
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
              className="px-5 py-2.5 bg-primary text-ink rounded-lg font-semibold text-sm uppercase tracking-wide hover:bg-primary/90 disabled:opacity-50"
            >
              {openingKassa ? tr('Opening…', 'Ochilyapti…') : tr('Open kassa', 'Kassani ochish')}
            </button>
          </form>
        </CollapsibleCard>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: tr('Daily income (UZS)', 'Kunlik jami kirim (UZS)'), value: summary?.totals.dailyIncomeTotal ?? 0, icon: Unlock },
          { label: tr('Daily expense (UZS)', 'Kunlik jami chiqim (UZS)'), value: summary?.totals.dailyExpenseTotal ?? 0, icon: Lock },
          { label: tr('Cash balance (UZS)', 'Kassa qoldig\'i (UZS)'), value: summary?.totals.expectedCash ?? 0, icon: Wallet },
          { label: tr('Card balance (UZS)', 'Kartalarda qoldiq (UZS)'), value: summary?.totals.cardBalanceTotal ?? 0, icon: CreditCard },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-surface border border-border rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 text-muted text-xs font-semibold uppercase tracking-wider mb-2">
              <Icon size={14} />
              {label}
            </div>
            <div className="text-2xl font-bold text-foreground">
              {loading ? '—' : `${formatMoney(value)}`}
            </div>
          </div>
        ))}
      </div>

      <CollapsibleCard
        title={tr('Daily kassa balance', 'Kunlik kassa qoldiq ma\'lumotlari')}
        description={tr('Daily total income, expense, cash balance and card balance.', 'Har kungi jami kirim, chiqim, kassa qoldig\'i va kartalardagi qoldiq.')}
        storageKey="kassa-daily-balance-card"
        defaultOpen={true}
      >
        <div className="overflow-x-auto scroller-minimal">
          <table className="excel-table">
            <thead>
              <tr>
                <th>{tr('Date', 'Sana')}</th>
                <th className="text-right">{tr('Cash in', 'Naqd kirim')}</th>
                <th className="text-right">{tr('Cash out', 'Naqd chiqim')}</th>
                <th className="text-right">{tr('Cash balance', 'Kassa qoldig\'i')}</th>
                <th className="text-right">{tr('Card in', 'Karta kirim')}</th>
                <th className="text-right">{tr('Card out', 'Karta chiqim')}</th>
                <th className="text-right">{tr('Card balance', 'Karta qoldiq')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{selectedDate}</td>
                <td className="text-right font-mono">{formatMoney(summary?.totals.cashInTotal ?? 0)}</td>
                <td className="text-right font-mono">{formatMoney(summary?.totals.cashOutTotal ?? 0)}</td>
                <td className="text-right font-mono">{formatMoney(summary?.totals.expectedCash ?? 0)}</td>
                <td className="text-right font-mono">{formatMoney(summary?.totals.cardInTotal ?? 0)}</td>
                <td className="text-right font-mono">{formatMoney(summary?.totals.cardOutTotal ?? 0)}</td>
                <td className="text-right font-mono">{formatMoney(summary?.totals.cardBalanceTotal ?? 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CollapsibleCard>

      <CollapsibleCard
        title={tr('Card information', 'Karta ma\'lumotlari')}
        description={tr('Track which card receives money, spends money, and how much remains.', 'Qaysi kartaga qancha tushyapdi, qancha ketyapdi va qancha qoldi — nazorat qiling.')}
        storageKey="kassa-card-info-card"
        defaultOpen={true}
      >
        {canManageKassa && (
          <form onSubmit={createCard} className="compact-toolbar mb-4">
            <div>
              <label className="compact-label">{tr('Card owner', 'Karta egasi')}</label>
              <input value={cardOwnerName} onChange={(e) => setCardOwnerName(e.target.value)} className="compact-control" />
            </div>
            <div>
              <label className="compact-label">{tr('Card number', 'Karta raqami')}</label>
              <input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} className="compact-control" />
            </div>
            <div>
              <label className="compact-label">{tr('Currency', 'Valyuta')}</label>
              <select value={cardCurrency} onChange={(e) => setCardCurrency(e.target.value as 'UZS' | 'USD')} className="compact-control">
                <option value="UZS">UZS</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div className="flex items-end">
              <button type="submit" disabled={creatingCard} className="px-5 py-2.5 bg-primary text-ink rounded-lg font-semibold text-sm uppercase tracking-wide hover:bg-primary/90 disabled:opacity-50">
                {creatingCard ? tr('Adding...', 'Qo\'shilmoqda...') : tr('Add card', 'Karta qo\'shish')}
              </button>
            </div>
          </form>
        )}
        <div className="overflow-x-auto scroller-minimal">
          <table className="excel-table">
            <thead>
              <tr>
                <th>{tr('Owner', 'Egasi')}</th>
                <th>{tr('Card number', 'Karta raqami')}</th>
                <th>{tr('Currency', 'Valyuta')}</th>
                <th className="text-right">{tr('Today in', 'Bugun kirim')}</th>
                <th className="text-right">{tr('Today out', 'Bugun chiqim')}</th>
                <th className="text-right">{tr('Balance', 'Qoldiq')}</th>
              </tr>
            </thead>
            <tbody>
              {paymentCards.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-muted">{tr('No cards added yet.', 'Hali karta qo\'shilmagan.')}</td></tr>
              ) : paymentCards.map((card) => (
                <tr key={card.id}>
                  <td className="font-semibold">{card.ownerName}</td>
                  <td className="font-mono">{card.cardNumber}</td>
                  <td>{card.currency}</td>
                  <td className="text-right font-mono">{formatMoney(card.dailyIn || 0)}</td>
                  <td className="text-right font-mono">{formatMoney(card.dailyOut || 0)}</td>
                  <td className="text-right font-mono">{formatMoney(card.balance || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleCard>

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
                  <option key={f.id} value={f.id}>{f.name}{f.currency ? ` (${f.currency})` : ''}</option>
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
          <div>
            <label className="compact-label">{tr('Method', 'Usul')}</label>
            <select value={payMethod} onChange={(e) => handlePayMethodChange(e.target.value as 'cash' | 'card')} className="compact-control">
              <option value="cash">{tr('Cash', 'Naqd')}</option>
              <option value="card">{tr('Card', 'Karta')}</option>
            </select>
          </div>
          <div>
            <label className="compact-label">{tr('Kassa desk', 'Kassa')}</label>
            <select value={payKassaDeskId} onChange={(e) => setPayKassaDeskId(e.target.value)} className="compact-control">
              <option value="">{tr('Select kassa', 'Kassani tanlang')}</option>
              {payDeskOptions.map((desk) => (
                <option key={desk.id} value={desk.id}>{desk.firm?.name ? `${desk.firm.name} · ` : ''}{desk.name}{desk.code ? ` (${desk.code})` : ''}</option>
              ))}
            </select>
          </div>
          {payMethod === 'card' && (
            <>
              <div>
                <label className="compact-label">{tr('Card', 'Karta')}</label>
                <select
                  value={payCardId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    const card = paymentCards.find((item) => item.id === nextId);
                    setPayCardId(nextId);
                    if (card?.currency) setPaymentCurrencyCode(card.currency);
                  }}
                  className="compact-control"
                  required
                >
                  <option value="">{tr('Select card', 'Kartani tanlang')}</option>
                  {paymentCards.map((card) => (
                    <option key={card.id} value={card.id}>{card.ownerName} — {card.cardNumber} ({card.currency})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="compact-label">{tr('Reference (optional)', 'Raqam (ixtiyoriy)')}</label>
                <input value={payCardReference} onChange={(e) => setPayCardReference(e.target.value)} className="compact-control" />
              </div>
            </>
          )}
          <div className="flex items-end">
            <button type="submit" disabled={recordingPayment || !isEditable} className="px-5 py-2.5 bg-primary text-ink rounded-lg font-semibold text-sm uppercase tracking-wide hover:bg-primary/90 disabled:opacity-50">
              {recordingPayment ? tr('Recording…', 'Qayd etilmoqda…') : tr('Record payment', 'To\'lov qayd etish')}
            </button>
          </div>
          </form>
        </CollapsibleCard>
      )}

      {canRecordPayment && (
        <CollapsibleCard
          title={tr('Cash income / expense', 'Kassa kirim / chiqim')}
          description={
            isEditable
              ? tr('Record direct cash coming into or leaving kassa.', 'Kassaga to\'g\'ridan-to\'g\'ri kirgan yoki chiqqan naqd pulni qayd eting.')
              : tr('Cash movements can only be recorded while kassa is open.', 'Kassa harakatlari faqat kassa ochiq bo\'lganda qayd etiladi.')
          }
          defaultOpen={true}
          storageKey="kassa-cash-movement-card"
        >
          <form onSubmit={submitCashMovement} className={`compact-toolbar ${!isEditable ? 'opacity-50 pointer-events-none' : ''}`}>
            <div>
              <label className="compact-label">{tr('Type', 'Turi')}</label>
              <select value={cashFlow} onChange={(e) => setCashFlow(e.target.value as 'IN' | 'OUT')} className="compact-control">
                <option value="IN">{tr('Income', 'Kirim')}</option>
                <option value="OUT">{tr('Expense', 'Chiqim')}</option>
              </select>
            </div>
            <div>
              <label className="compact-label">{tr('Method', 'Usul')}</label>
              <select value={cashMethod} onChange={(e) => setCashMethod(e.target.value as 'cash' | 'card')} className="compact-control">
                <option value="cash">{tr('Cash', 'Naqd')}</option>
                <option value="card">{tr('Card', 'Karta')}</option>
              </select>
            </div>
            <div>
              <label className="compact-label">{tr('Kassa desk', 'Kassa')}</label>
            <select value={cashKassaDeskId} onChange={(e) => setCashKassaDeskId(e.target.value)} className="compact-control">
                <option value="">{tr('Select kassa', 'Kassani tanlang')}</option>
                {cashDeskOptions.map((desk) => (
                  <option key={desk.id} value={desk.id}>{desk.firm?.name ? `${desk.firm.name} · ` : ''}{desk.name}{desk.code ? ` (${desk.code})` : ''}</option>
                ))}
              </select>
            </div>
            {cashMethod === 'card' && (
              <div>
                <label className="compact-label">{tr('Card', 'Karta')}</label>
                <select value={cashCardId} onChange={(e) => setCashCardId(e.target.value)} className="compact-control" required>
                  <option value="">{tr('Select card', 'Kartani tanlang')}</option>
                  {paymentCards.map((card) => (
                    <option key={card.id} value={card.id}>{card.ownerName} — {card.cardNumber} ({card.currency})</option>
                  ))}
                </select>
              </div>
            )}
            {canFilterFirm && (
              <div>
                <label className="compact-label">{tr('Firm', 'Firma')}</label>
                <select value={cashFirmId} onChange={(e) => setCashFirmId(e.target.value)} className="compact-control">
                  <option value="">{tr('Select firm', 'Firmani tanlang')}</option>
                  {firmOptions.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="compact-label">
                {cashFlow === 'IN' ? tr('From', 'Kimdan') : tr('To', 'Kimga')}
              </label>
              <select value={cashCounterpartyFirmId} onChange={(e) => setCashCounterpartyFirmId(e.target.value)} className="compact-control">
                <option value="">{cashFlow === 'IN' ? tr('Customer / contractor optional', 'Mijoz / pudratchi ixtiyoriy') : tr('Airline / firm optional', 'Aviakompaniya / firma ixtiyoriy')}</option>
                {cashCounterpartyOptions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}{f.kind === 'AIRLINE' ? ` · ${tr('Airline', 'Aviakompaniya')}` : f.kind === 'CONTRACTOR' ? ` · ${tr('Contractor', 'Pudratchi')}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="compact-label">
                {tr('Amount', 'Summa')} ({cashMethod === 'card' ? selectedCashCard?.currency || 'UZS' : selectedCashFirm?.currency || 'UZS'})
              </label>
              <input inputMode="decimal" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} className="compact-control" />
            </div>
            <div>
              <label className="compact-label">{tr('Note', 'Izoh')}</label>
              <input value={cashNote} onChange={(e) => setCashNote(e.target.value)} className="compact-control" />
            </div>
            <div className="flex items-end">
              <button type="submit" disabled={recordingCash || !isEditable} className="px-5 py-2.5 bg-primary text-ink rounded-lg font-semibold text-sm uppercase tracking-wide hover:bg-primary/90 disabled:opacity-50">
                {recordingCash ? tr('Recording...', 'Qayd etilmoqda...') : tr('Record', 'Qayd etish')}
              </button>
            </div>
          </form>
        </CollapsibleCard>
      )}

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
                  <th>{tr('Kassa', 'Kassa')}</th>
                  <th>{tr('Method', 'Usul')}</th>
                  <th className="text-right">{tr('Amount', 'Summa')}</th>
                </tr>
              </thead>
              <tbody>
                {summary.transactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-border/50">
                    <td className="font-medium">
                      {tx.direction === 'KASSA_IN' ? tr('Income', 'Kirim') : tx.direction === 'KASSA_OUT' ? tr('Expense', 'Chiqim') : tx.type}
                    </td>
                    {canFilterFirm && <td>{tx.firm?.name || tx.firmId}</td>}
                    <td>{tx.flight?.flightNumber || tx.flightId}</td>
                    <td>{tx.kassaDesk?.name || tx.kassaDeskId || '—'}</td>
                    <td className="uppercase text-xs">{tx.paymentMethod || '—'}</td>
                    <td className="text-right font-mono">{tx.originalAmount} {tx.currency}</td>
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

      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-surface p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-foreground">
                  {confirmAction.kind === 'close'
                    ? tr('Confirm kassa close', 'Kassani yopishni tasdiqlang')
                    : confirmAction.kind === 'open'
                      ? tr('Confirm kassa open', 'Kassani ochishni tasdiqlang')
                      : tr('Confirm action', 'Amalni tasdiqlang')}
                </h3>
                <p className="mt-1 text-sm text-muted">
                  {confirmAction.kind === 'close'
                    ? tr('Check today\'s income, expense, cash and card balances before closing.', 'Yopishdan oldin bugungi kirim, chiqim, naqd va karta qoldiqlarini tekshiring.')
                    : tr('Please review the details before saving this kassa action.', 'Kassa amalini saqlashdan oldin ma\'lumotlarni tekshiring.')}
                </p>
              </div>
              <button type="button" onClick={() => setConfirmAction(null)} className="text-muted hover:text-foreground" aria-label={tr('Close', 'Yopish')}>
                <X size={20} />
              </button>
            </div>

            {confirmAction.kind === 'close' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-border bg-surface-2 p-3">
                    <div className="text-xs uppercase text-muted">{tr('Daily income', 'Bugungi jami kirim')}</div>
                    <div className="mt-1 text-lg font-bold">{formatMoney(summary?.totals.dailyIncomeTotal || 0)} UZS</div>
                  </div>
                  <div className="rounded-lg border border-border bg-surface-2 p-3">
                    <div className="text-xs uppercase text-muted">{tr('Daily expense', 'Bugungi jami chiqim')}</div>
                    <div className="mt-1 text-lg font-bold">{formatMoney(summary?.totals.dailyExpenseTotal || 0)} UZS</div>
                  </div>
                  <div className="rounded-lg border border-border bg-surface-2 p-3">
                    <div className="text-xs uppercase text-muted">{tr('Physical count', 'Sanab kiritilgan')}</div>
                    <div className="mt-1 text-lg font-bold">{formatMoney(Number(closingBalance || summary?.totals.expectedCash || 0))} UZS</div>
                  </div>
                </div>
                <div className="overflow-x-auto scroller-minimal">
                  <table className="excel-table">
                    <tbody>
                      <tr>
                        <td>{tr('Cash balance UZS', 'Naqd qoldiq UZS')}</td>
                        <td className="text-right font-mono">{formatMoney(cashBalanceByCurrency.UZS || 0)} UZS</td>
                      </tr>
                      <tr>
                        <td>{tr('Cash balance USD', 'Naqd qoldiq USD')}</td>
                        <td className="text-right font-mono">{formatMoney(cashBalanceByCurrency.USD || 0)} USD</td>
                      </tr>
                      <tr>
                        <td>{tr('Cards total', 'Kartalardagi jami qoldiq')}</td>
                        <td className="text-right font-mono">{formatMoney(summary?.totals.cardBalanceTotal || 0)} UZS</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="max-h-56 overflow-auto rounded-lg border border-border">
                  <table className="excel-table">
                    <thead>
                      <tr>
                        <th>{tr('Card', 'Karta')}</th>
                        <th>{tr('Currency', 'Valyuta')}</th>
                        <th className="text-right">{tr('Balance', 'Qoldiq')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentCards.length === 0 ? (
                        <tr><td colSpan={3} className="text-center text-muted">{tr('No cards added.', 'Kartalar qo\'shilmagan.')}</td></tr>
                      ) : paymentCards.map((card) => (
                        <tr key={card.id}>
                          <td>{card.ownerName} · {card.cardNumber}</td>
                          <td>{card.currency}</td>
                          <td className="text-right font-mono">{formatMoney(card.balance || 0)} {card.currency}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-surface-2 p-4 text-sm text-foreground">
                {confirmAction.kind === 'open' && (
                  <p>{tr('Open kassa with opening balance', 'Kassani boshlang\'ich balans bilan ochish')}: <b>{formatMoney(Number(openingBalance || 0))} UZS</b></p>
                )}
                {confirmAction.kind === 'payment' && (
                  <div className="space-y-1">
                    <p><b>{confirmAction.label}</b></p>
                    <p>{tr('Firm', 'Firma')}: {selectedPayFirm?.name || user?.email}</p>
                    <p>{tr('Flight', 'Reys')}: {selectedPayFlight?.flightNumber || tr('Firm deposit', 'Firma depoziti')}</p>
                    <p>{tr('Kassa', 'Kassa')}: {selectedPayDesk?.name || '-'}</p>
                  </div>
                )}
                {confirmAction.kind === 'cash' && (
                  <div className="space-y-1">
                    <p><b>{confirmAction.label}</b></p>
                    <p>{tr('Firm', 'Firma')}: {selectedCashFirm?.name || user?.email}</p>
                    <p>{tr('Kassa', 'Kassa')}: {selectedCashDesk?.name || '-'}</p>
                    <p>{tr('Method', 'Usul')}: {cashMethod === 'card' ? tr('Card', 'Karta') : tr('Cash', 'Naqd')}</p>
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setConfirmAction(null)} className="rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm font-semibold text-foreground hover:bg-surface">
                {tr('Back', 'Orqaga')}
              </button>
              <button
                type="button"
                onClick={confirmKassaAction}
                disabled={openingKassa || closingKassa || recordingPayment || recordingCash}
                className={`rounded-lg px-4 py-2 text-sm font-bold uppercase tracking-wide disabled:opacity-50 ${
                  confirmAction.kind === 'close'
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-primary text-ink hover:bg-primary/90'
                }`}
              >
                {confirmAction.kind === 'close' ? tr('Confirm close', 'Yopishni tasdiqlash') : tr('Confirm action', 'Amalni tasdiqlash')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
