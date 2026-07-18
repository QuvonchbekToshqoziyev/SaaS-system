/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { Lock, Unlock, Wallet, CreditCard, AlertCircle, RefreshCw, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import CollapsibleCard from '@/components/ui/CollapsibleCard';
import ActionButtons from '@/components/ui/ActionButtons';
import { api } from '@/lib/api';
import { formatCardLabel, formatCurrencyMap, formatMoney, totalsByCurrency } from '@/features/kassa/format';
import DailyReconciliationActions from '@/features/kassa/DailyReconciliationActions';
import HistoricalKassaImport from '@/features/kassa/HistoricalKassaImport';

type FirmOption = { id: string; name: string; currency?: string | null; kind?: string | null };
type FlightOption = { id?: string; flight_id?: string; flightNumber?: string; route?: string };
type PaymentCard = {
  id: string;
  ownerName: string;
  cardNumber: string;
  currency: string;
  openingBalance?: string | number;
  balance?: number;
  balanceByCurrency?: Record<string, number>;
  dailyByCurrency?: Record<string, { in: number; out: number; net: number }>;
  dailyIn?: number;
  dailyOut?: number;
  dailyNet?: number;
  firmId?: string | null;
  cashDeskId?: string | null;
  createdByUserId?: string | null;
  firm?: { id: string; name: string | null } | null;
  status?: string;
};

type KassaDesk = {
  id: string;
  firmId: string;
  name: string;
  code?: string | null;
  status?: string;
  firm?: { id: string; name: string | null } | null;
  displayName?: string;
  assignedCashierUserId?: string | null;
  assignedCashier?: { id: string; email: string; fullName?: string | null; status?: string } | null;
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
    cardBalanceByCurrency?: Record<string, number>;
    byCurrency?: Record<string, {
      cashTotal?: number;
      cashInTotal?: number;
      cashOutTotal?: number;
      cardTotal?: number;
      cardInTotal?: number;
      cardOutTotal?: number;
      dailyIncomeTotal?: number;
      dailyExpenseTotal?: number;
      paymentCount?: number;
      saleTotal?: number;
      payableTotal?: number;
      transactionCount?: number;
    }>;
    paymentCount: number;
    saleTotal: number;
    payableTotal: number;
    transactionCount: number;
    expectedCash: number | null;
    expectedCashByCurrency?: Record<string, number> | null;
  };
  transactions: any[];
  paymentCards: PaymentCard[];
  permissions?: {
    canOperateKassa?: boolean;
  };
  openingSuggestion?: {
    previousSessionId: string | null;
    previousClosedAt: string | null;
    previousBusinessDate: string | null;
    previousBusinessDates?: Record<'UZS' | 'USD', string | null>;
    openingBalance: string | null;
    openingBalances?: Record<'UZS' | 'USD', string>;
    currency: string;
    firstSession: boolean;
  };
  deskMonitoring?: Array<KassaDesk & { status: string; session?: any; totals?: any; cashBalanceByCurrency?: Record<string, number>; lastOperationAt?: string | null }>;
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

export default function KassaPage() {
  const { user } = useAuth();
  const { tr } = useLanguage();
  const router = useRouter();

  const role = String(user?.role || '').toLowerCase();
  const isFirm = role === 'firm';
  const isSuperAdmin = role === 'superadmin';
  const isAdmin = role === 'admin' || role === 'superadmin';
  const isKassir = isFirm && String(user?.firmRole || '').toUpperCase() === 'KASSIR';
  const canAccess = isFirm || isAdmin;

  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [summaryKassaDeskId, setSummaryKassaDeskId] = useState('');
  const [monitorFirmId, setMonitorFirmId] = useState('');
  const [summary, setSummary] = useState<KassaSummary | null>(null);
  const canManageKassa = Boolean(summary?.permissions?.canOperateKassa) || isSuperAdmin;
  const firmRole = String(user?.firmRole || '').toUpperCase();
  const canAdjustOpeningBalance = isAdmin || (isFirm && ['FIRM_ADMIN', 'MANAGER'].includes(firmRole));
  const canCreateDesk = isAdmin || (isFirm && firmRole === 'FIRM_ADMIN');
  const canManageCards = isAdmin || (isFirm && firmRole === 'FIRM_ADMIN');
  const canDeleteFirmRecords = isSuperAdmin || (isFirm && firmRole === 'FIRM_ADMIN');
  const canFilterFirm = isAdmin;
  const canChooseTransactionFirm = canFilterFirm;
  const canLoadTransactionFirms = canFilterFirm || canManageKassa;
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const [openingBalance, setOpeningBalance] = useState('0');
  const [openingBalanceUsd, setOpeningBalanceUsd] = useState('0');
  const [editingOpeningBalance, setEditingOpeningBalance] = useState(false);
  const [openingAdjustmentReason, setOpeningAdjustmentReason] = useState('');
  const [closingBalance, setClosingBalance] = useState('');
  const [closingBalanceUsd, setClosingBalanceUsd] = useState('');
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
  const [payReceiverFirmId, setPayReceiverFirmId] = useState('');
  const [payFlightId, setPayFlightId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payCurrency, setPayCurrency] = useState<'USD' | 'UZS' | 'OTHER'>('UZS');
  const [payOtherCurrency, setPayOtherCurrency] = useState('');
  const [payExchangeRate, setPayExchangeRate] = useState('');
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
  const [cashCurrency, setCashCurrency] = useState<'USD' | 'UZS' | 'OTHER'>('UZS');
  const [cashOtherCurrency, setCashOtherCurrency] = useState('');
  const [cashExchangeRate, setCashExchangeRate] = useState('');
  const [cashNote, setCashNote] = useState('');
  const [cashFlightId, setCashFlightId] = useState('');
  const [cashKassaDeskId, setCashKassaDeskId] = useState('');
  const [recordingCash, setRecordingCash] = useState(false);
  const [cardOwnerName, setCardOwnerName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardCurrency, setCardCurrency] = useState('UZS');
  const [cardOpeningBalance, setCardOpeningBalance] = useState('0');
  const [creatingCard, setCreatingCard] = useState(false);
  const [editingCardId, setEditingCardId] = useState('');
  const [cardEditDraft, setCardEditDraft] = useState({
    ownerName: '',
    cardNumber: '',
    currency: 'UZS',
    openingBalance: '0',
    status: 'ACTIVE',
  });
  const [savingCard, setSavingCard] = useState(false);
  const [deletingCardId, setDeletingCardId] = useState('');
  const [deskName, setDeskName] = useState('');
  const [deskCode, setDeskCode] = useState('');
  const [deskFirmId, setDeskFirmId] = useState('');
  const [creatingDesk, setCreatingDesk] = useState(false);
  const [confirmAction, setConfirmAction] = useState<KassaConfirmAction | null>(null);
  const hasValidSelectedDate = /^\d{4}-\d{2}-\d{2}$/.test(selectedDate);

  const isEditable = summary?.status === 'OPEN';
  const isClosed = summary?.status === 'CLOSED';
  const isNotOpen = summary?.status === 'NOT_OPEN';
  const canRecordPayment = canManageKassa;
  const actorUserId = String(user?.id || '');
  const canDeleteCard = (card: PaymentCard) => isSuperAdmin
    || String(card.createdByUserId || '') === actorUserId
    || (isFirm && firmRole === 'FIRM_ADMIN' && String(card.firmId || '') === String(user?.firmId || ''));
  const dailyIncomeByCurrency = useMemo(() => totalsByCurrency(summary, 'dailyIncomeTotal'), [summary]);
  const dailyExpenseByCurrency = useMemo(() => totalsByCurrency(summary, 'dailyExpenseTotal'), [summary]);
  const cashInByCurrency = useMemo(() => totalsByCurrency(summary, 'cashInTotal'), [summary]);
  const cashOutByCurrency = useMemo(() => totalsByCurrency(summary, 'cashOutTotal'), [summary]);
  const cardInByCurrency = useMemo(() => totalsByCurrency(summary, 'cardInTotal'), [summary]);
  const cardOutByCurrency = useMemo(() => totalsByCurrency(summary, 'cardOutTotal'), [summary]);
  const cashBalanceByCurrency = useMemo(() => {
    const balances: Record<string, number> = {
      UZS: Number(summary?.kassa?.openingBalance || 0) || 0,
      USD: Number(summary?.kassa?.openingBalanceUsd || 0) || 0,
    };
    for (const tx of summary?.transactions || []) {
      if (String(tx.paymentMethod || '').toLowerCase() !== 'cash') continue;
      const currency = String(tx.currency || 'UZS').toUpperCase();
      const amount = Number(tx.originalAmount || 0) || 0;
      if (!balances[currency]) balances[currency] = 0;
      const paymentIsOut = tx.type === 'PAYMENT' && (
        String(tx.metadata?.cashFlow || '').toUpperCase() === 'OUT'
        || (tx.payerFirmId === tx.firmId && tx.receiverFirmId !== tx.firmId)
      );
      if (tx.direction === 'KASSA_OUT' || paymentIsOut) balances[currency] -= amount;
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
  const selectedPayReceiver = useMemo(() => firmOptions.find((firm) => firm.id === payReceiverFirmId), [firmOptions, payReceiverFirmId]);
  const selectedCashFirm = useMemo(() => firmOptions.find((firm) => firm.id === (canChooseTransactionFirm ? cashFirmId : user?.firmId)), [firmOptions, cashFirmId, canChooseTransactionFirm, user?.firmId]);
  const selectedPayFlight = useMemo(() => flightOptions.find((flight) => String(flight.id || flight.flight_id || '') === payFlightId), [flightOptions, payFlightId]);
  const selectedPayDesk = useMemo(() => deskOptions.find((desk) => desk.id === payKassaDeskId), [deskOptions, payKassaDeskId]);
  const selectedCashDesk = useMemo(() => deskOptions.find((desk) => desk.id === cashKassaDeskId), [deskOptions, cashKassaDeskId]);
  const selectedSummaryDesk = useMemo(() => deskOptions.find((desk) => desk.id === summaryKassaDeskId), [deskOptions, summaryKassaDeskId]);
  const cashCounterpartyOptions = useMemo(
    () => firmOptions.filter((firm) => firm.id !== (canChooseTransactionFirm ? cashFirmId : user?.firmId)),
    [firmOptions, canChooseTransactionFirm, cashFirmId, user?.firmId],
  );
  const payDeskFirmId = isAdmin ? payFirmId : String(user?.firmId || '');
  const cashDeskFirmId = isAdmin ? cashFirmId : String(user?.firmId || '');
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

  const cashCurrencyCode = useMemo(() => {
    const c = cashCurrency === 'OTHER' ? cashOtherCurrency : cashCurrency;
    return String(c || '').trim().toUpperCase();
  }, [cashCurrency, cashOtherCurrency]);

  const setCashCurrencyCode = (currency: string) => {
    const next = String(currency || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(next)) return;
    if (next === 'UZS' || next === 'USD') {
      setCashCurrency(next);
      setCashOtherCurrency('');
    } else {
      setCashCurrency('OTHER');
      setCashOtherCurrency(next);
    }
  };

  const resetOpeningDraft = () => {
    setOpeningBalance(String(summary?.openingSuggestion?.openingBalance ?? '0'));
    setOpeningBalanceUsd(String(summary?.openingSuggestion?.openingBalances?.USD ?? '0'));
    setOpeningAdjustmentReason('');
    setEditingOpeningBalance(false);
  };

  const resetPaymentDraft = () => {
    setPayFirmId(isFirm ? String(user?.firmId || '') : '');
    setPayReceiverFirmId('');
    setPayFlightId('');
    setPayAmount('');
    setPayCurrency('UZS');
    setPayOtherCurrency('');
    setPayExchangeRate('');
    setPayMethod('cash');
    setPayCardId('');
    setPayCardReference('');
    setPayReference('');
    setPayKassaDeskId('');
  };

  const resetCashDraft = () => {
    setCashFlow('IN');
    setCashMethod('cash');
    setCashCardId('');
    setCashFirmId(isFirm ? String(user?.firmId || '') : '');
    setCashCounterpartyFirmId('');
    setCashAmount('');
    setCashCurrency('UZS');
    setCashOtherCurrency('');
    setCashExchangeRate('');
    setCashNote('');
    setCashFlightId('');
    setCashKassaDeskId('');
  };

  const resetCardDraft = () => {
    setCardOwnerName('');
    setCardNumber('');
    setCardCurrency('UZS');
    setCardOpeningBalance('0');
  };

  useEffect(() => {
    if (!user) {
      router.push('/login');
    }
  }, [user, router]);

  const loadSummary = useCallback(async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) return;
    try {
      setLoading(true);
      const query = new URLSearchParams({ date: selectedDate });
      if (summaryKassaDeskId) query.set('kassaDeskId', summaryKassaDeskId);
      if (canFilterFirm && monitorFirmId) query.set('firmId', monitorFirmId);
      const res = await api.get(`/kassa?${query.toString()}`);
      setSummary(res.data);
      setPaymentCards(Array.isArray(res.data?.paymentCards) ? res.data.paymentCards : []);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || tr('Failed to load kassa', 'Kassani yuklab bo\'lmadi'));
    } finally {
      setLoading(false);
    }
  }, [selectedDate, summaryKassaDeskId, canFilterFirm, monitorFirmId, tr]);

  useEffect(() => {
    if (!canAccess) return;
    loadSummary();
  }, [loadSummary, reloadKey, canAccess]);

  useEffect(() => {
    const timer = window.setInterval(() => void loadSummary(), 45_000);
    return () => window.clearInterval(timer);
  }, [loadSummary]);

  useEffect(() => {
    if (summary?.status !== 'NOT_OPEN') return;
    setOpeningBalance(String(summary.openingSuggestion?.openingBalance ?? '0'));
    setOpeningBalanceUsd(String(summary.openingSuggestion?.openingBalances?.USD ?? '0'));
    setEditingOpeningBalance(false);
    setOpeningAdjustmentReason('');
  }, [summary?.status, summary?.openingSuggestion?.openingBalance, summary?.openingSuggestion?.openingBalances?.USD, summaryKassaDeskId, selectedDate]);

  useEffect(() => {
    if (!canAccess) return;
    const loadOptions = async () => {
      try {
        const [flightsRes, firmsRes, desksRes] = await Promise.all([
          api.get('/flights'),
          canLoadTransactionFirms ? api.get('/firms') : Promise.resolve({ data: [] }),
          api.get('/kassa/desks'),
        ]);
        setFlightOptions(Array.isArray(flightsRes.data) ? flightsRes.data : []);
        setFirmOptions(Array.isArray(firmsRes.data) ? firmsRes.data : []);
        setDeskOptions(Array.isArray(desksRes.data) ? desksRes.data : []);
      } catch {
        // non-fatal
      }
    };
    loadOptions();
  }, [canLoadTransactionFirms, canAccess, reloadKey]);

  const monitoringFirmOptions = useMemo(() => {
    const firms = new Map<string, FirmOption>();
    for (const desk of deskOptions) {
      if (desk.status !== 'ACTIVE' || !desk.firm?.id || !desk.firm.name) continue;
      firms.set(desk.firm.id, { id: desk.firm.id, name: desk.firm.name });
    }
    return Array.from(firms.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [deskOptions]);

  const visibleDeskOptions = useMemo(() => monitorFirmId ? deskOptions.filter((desk) => desk.firmId === monitorFirmId) : deskOptions, [deskOptions, monitorFirmId]);

  useEffect(() => {
    if (summaryKassaDeskId || isSuperAdmin) return;
    const firstActiveDesk = visibleDeskOptions.find((desk) => desk.status === 'ACTIVE');
    if (firstActiveDesk) setSummaryKassaDeskId(firstActiveDesk.id);
  }, [isSuperAdmin, summaryKassaDeskId, visibleDeskOptions]);

  useEffect(() => {
    if (!monitorFirmId || monitoringFirmOptions.some((firm) => firm.id === monitorFirmId)) return;
    setMonitorFirmId('');
    setSummaryKassaDeskId('');
  }, [monitorFirmId, monitoringFirmOptions]);

  useEffect(() => {
    if (selectedPayFirm?.currency) {
      setPaymentCurrencyCode(selectedPayFirm.currency);
    }
  }, [selectedPayFirm?.currency]);

  useEffect(() => {
    if (isFirm && user?.firmId) {
      if (!payFirmId) setPayFirmId(String(user.firmId));
      if (!cashFirmId) setCashFirmId(String(user.firmId));
    }
  }, [isFirm, user?.firmId, payFirmId, cashFirmId]);

  useEffect(() => {
    if (selectedCashFirm?.currency) {
      setCashCurrencyCode(selectedCashFirm.currency);
    }
  }, [selectedCashFirm?.currency]);

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
    if (openingKassa || !hasValidSelectedDate || !summaryKassaDeskId) return;
    setConfirmAction({ kind: 'open' });
  };

  const openKassaConfirmed = async () => {
    try {
      setOpeningKassa(true);
      await api.post('/kassa/open', {
        businessDate: selectedDate,
        kassaDeskId: summaryKassaDeskId,
        openingBalance: openingBalance.trim() || '0',
        openingBalanceUsd: openingBalanceUsd.trim() || '0',
        openingAdjustmentReason: openingAdjustmentReason.trim() || undefined,
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
    if (closingKassa || !hasValidSelectedDate || !summaryKassaDeskId) return;
    setConfirmAction({ kind: 'close' });
  };

  const closeKassaConfirmed = async () => {
    try {
      setClosingKassa(true);
      await api.post('/kassa/close', {
        businessDate: selectedDate,
        kassaDeskId: summaryKassaDeskId,
        closingBalance: closingBalance.trim() || undefined,
        closingBalanceUsd: closingBalanceUsd.trim() || undefined,
        notes: closeNotes.trim() || undefined,
      });
      toast.success(tr('Kassa closed', 'Kassa yopildi'));
      setClosingBalance('');
      setClosingBalanceUsd('');
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
    if (reopeningKassa || !canManageKassa || !isClosed || !hasValidSelectedDate || !summaryKassaDeskId) return;
    try {
      setReopeningKassa(true);
      await api.post('/kassa/reopen', {
        businessDate: selectedDate,
        kassaDeskId: summaryKassaDeskId,
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
    const firmId = canChooseTransactionFirm ? cashFirmId.trim() : String(user?.firmId || '');
    const currency = cashCurrencyCode;
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
    if (!/^[A-Z]{3}$/.test(currency)) {
      toast.error(tr('Invalid currency code', 'Noto\'g\'ri valyuta kodi'));
      return;
    }
    const body = {
        flow: cashFlow,
        method: cashMethod,
        paymentCardId: cashMethod === 'card' ? cashCardId : undefined,
        businessDate: selectedDate,
        firmId,
        counterpartyFirmId: cashCounterpartyFirmId || undefined,
        flightId: cashFlightId || undefined,
        kassaDeskId: cashKassaDeskId || undefined,
        amount,
        currency,
        exchangeRate: currency !== 'UZS' ? cashExchangeRate.trim() : undefined,
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
      setCashFlightId('');
      setCashExchangeRate('');
      setReloadKey((k) => k + 1);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || tr('Failed to record cash movement', 'Kassa harakatini qayd etib bo\'lmadi'));
    } finally {
      setRecordingCash(false);
    }
  };

  const canChangeDailyCash = (tx: any) => {
    const txDate = String(tx.metadata?.date || tx.createdAt || '').slice(0, 10);
    return tx.type === 'ADJUSTMENT' && ['KASSA_IN', 'KASSA_OUT'].includes(String(tx.direction || ''))
      && isEditable
      && Boolean(summaryKassaDeskId)
      && String(tx.kassaDeskId || '') === summaryKassaDeskId
      && txDate === selectedDate
      && (String(tx.createdByUserId || '') === actorUserId
        || (isFirm && firmRole === 'FIRM_ADMIN' && String(tx.firmId || '') === String(user?.firmId || '')));
  };

  const editDailyCash = async (tx: any) => {
    const amount = window.prompt(tr('Edit amount', 'Summani tahrirlash'), String(tx.originalAmount || ''));
    if (amount === null) return;
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      toast.error(tr('Amount must be greater than zero', 'Summa noldan katta bo\'lishi kerak'));
      return;
    }
    const note = window.prompt(tr('Edit note', 'Izohni tahrirlash'), String(tx.metadata?.note || ''));
    if (note === null) return;
    const correctionReason = window.prompt(tr('Why is this correction needed?', 'Tuzatish sababi nima?'));
    if (!correctionReason?.trim()) return;
    try {
      await api.patch(`/transactions/${tx.id}/daily-cash`, { amount: Number(amount), note, correctionReason: correctionReason.trim() });
      toast.success(tr('Transaction updated', 'Tranzaksiya tahrirlandi'));
      setReloadKey((key) => key + 1);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || tr('Failed to update transaction', 'Tranzaksiyani tahrirlab bo\'lmadi'));
    }
  };

  const deleteDailyCash = async (tx: any) => {
    const reason = window.prompt(tr('Why should this entry be removed?', 'Yozuvni o‘chirish sababi nima?'));
    if (!reason?.trim()) return;
    if (!window.confirm(tr('Delete this transaction?', 'Ushbu tranzaksiyani o\'chirasizmi?'))) return;
    try {
      await api.delete(`/transactions/${tx.id}/daily-cash`, { data: { reason: reason.trim() } });
      toast.success(tr('Transaction deleted', 'Tranzaksiya o\'chirildi'));
      setReloadKey((key) => key + 1);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || tr('Failed to delete transaction', 'Tranzaksiyani o\'chirib bo\'lmadi'));
    }
  };

  const deleteTransaction = async (tx: any) => {
    const reason = window.prompt(tr('Why should this transaction be deleted?', 'Tranzaksiya nima sababdan o\'chiriladi?'));
    if (!reason?.trim()) return;
    if (!window.confirm(tr('Delete this transaction permanently?', 'Ushbu tranzaksiya butunlay o\'chirilsinmi?'))) return;
    try {
      await api.delete(`/transactions/${tx.id}`, { data: { reason: reason.trim() } });
      toast.success(tr('Transaction deleted', 'Tranzaksiya o\'chirildi'));
      setReloadKey((key) => key + 1);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || tr('Failed to delete transaction', 'Tranzaksiyani o\'chirib bo\'lmadi'));
    }
  };

  const submitPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (recordingPayment || !isEditable || !canRecordPayment) return;

    const method = payMethod;
    const currency = payCurrencyCode;
    const amount = payAmount.trim();
    const flightId = payFlightId.trim();

    if (canChooseTransactionFirm && !payFirmId) {
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
      metadata.payment_provider = selectedPayCard?.ownerName || '';
      if (payCardReference.trim()) metadata.transaction_reference = payCardReference.trim();
    }

    if (!payReceiverFirmId) {
      toast.error(tr('Select the payment recipient', 'To‘lov oluvchi firmani tanlang'));
      return;
    }
    const operatorFirmId = canChooseTransactionFirm ? payFirmId : String(user?.firmId || '');
    const body: any = { amount, currency, method, metadata, payerFirmId: operatorFirmId, receiverFirmId: payReceiverFirmId };
    if (method === 'card') body.paymentCardId = payCardId;
    if (canChooseTransactionFirm) body.firmId = payFirmId;
    if (currency !== 'UZS') body.exchangeRate = payExchangeRate.trim();
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
      setPayExchangeRate('');
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
        openingBalance: cardOpeningBalance.trim() || '0',
        firmId: isFirm ? user?.firmId : undefined,
        cashDeskId: summaryKassaDeskId || undefined,
      });
      toast.success(tr('Card added', 'Karta qo\'shildi'));
      setCardOwnerName('');
      setCardNumber('');
      setCardOpeningBalance('0');
      setCardCurrency('UZS');
      setReloadKey((k) => k + 1);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || tr('Failed to add card', 'Kartani qo\'shib bo\'lmadi'));
    } finally {
      setCreatingCard(false);
    }
  };

  const startEditCard = (card: PaymentCard) => {
    setEditingCardId(card.id);
    setCardEditDraft({
      ownerName: card.ownerName || '',
      cardNumber: card.cardNumber || '',
      currency: card.currency || 'UZS',
      openingBalance: String(card.openingBalance ?? '0'),
      status: String(card.status || 'ACTIVE').toUpperCase(),
    });
  };

  const saveCardEdit = async (cardId: string) => {
    if (savingCard) return;
    if (!cardEditDraft.ownerName.trim()) {
      toast.error(tr('Card owner is required', 'Karta egasi kerak'));
      return;
    }
    try {
      setSavingCard(true);
      await api.patch(`/kassa/cards/${cardId}`, {
        ownerName: cardEditDraft.ownerName.trim(),
        cardNumber: cardEditDraft.cardNumber.trim() || undefined,
        currency: cardEditDraft.currency.trim().toUpperCase(),
        openingBalance: cardEditDraft.openingBalance.trim() || '0',
        status: cardEditDraft.status,
      });
      toast.success(tr('Card updated', 'Karta yangilandi'));
      setEditingCardId('');
      setReloadKey((k) => k + 1);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || tr('Failed to update card', 'Kartani yangilab bo\'lmadi'));
    } finally {
      setSavingCard(false);
    }
  };

  const deleteCard = async (card: PaymentCard) => {
    if (deletingCardId) return;
    const reason = window.prompt(tr('Why should this card be deleted?', 'Karta nima sababdan o\'chiriladi?'));
    if (!reason?.trim()) return;
    const ok = window.confirm(tr('Delete this card? Existing transactions will remain in reports.', 'Ushbu kartani o\'chirasizmi? Mavjud tranzaksiyalar hisobotlarda qoladi.'));
    if (!ok) return;
    try {
      setDeletingCardId(card.id);
      await api.delete(`/kassa/cards/${card.id}`, { data: { reason: reason.trim() } });
      toast.success(tr('Card deleted', 'Karta o\'chirildi'));
      if (editingCardId === card.id) setEditingCardId('');
      setReloadKey((k) => k + 1);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || tr('Failed to delete card', 'Kartani o\'chirib bo\'lmadi'));
    } finally {
      setDeletingCardId('');
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
        <div className="flex flex-wrap items-center gap-3">
          {canFilterFirm && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2">
              <select
                value={monitorFirmId}
                onChange={(e) => { setMonitorFirmId(e.target.value); setSummaryKassaDeskId(''); }}
                className="min-w-[220px] bg-transparent px-1 py-2 text-sm font-semibold outline-none"
                aria-label={tr('Filter by operating firm', 'Kassa ishlatayotgan firma bo‘yicha filter')}
              >
                <option value="">{tr('All operating firms', 'Barcha kassa ishlatayotgan firmalar')}</option>
                {monitoringFirmOptions.map((firm) => <option key={firm.id} value={firm.id}>{firm.name}</option>)}
              </select>
              <span className="whitespace-nowrap rounded bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
                {monitoringFirmOptions.length} {tr('firms', 'firma')} · {deskOptions.length} {tr('kassas', 'kassa')}
              </span>
            </div>
          )}
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-surface text-sm font-medium"
          />
          {!isKassir && (
            <select
              value={summaryKassaDeskId}
              onChange={(e) => setSummaryKassaDeskId(e.target.value)}
              className="px-3 py-2 rounded-lg border border-border bg-surface text-sm font-medium"
            >
              <option value="">{tr('All kassas', 'Barcha kassalar')}</option>
              {visibleDeskOptions.map((desk) => (
                <option key={desk.id} value={desk.id}>{desk.firm?.name && canFilterFirm ? `${desk.firm.name} · ` : ''}{desk.displayName || desk.name}{desk.code ? ` (${desk.code})` : ''}</option>
              ))}
            </select>
          )}
          <button type="button" onClick={() => void loadSummary()} disabled={loading} className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-surface text-muted hover:text-foreground disabled:opacity-50" aria-label={tr('Refresh', 'Yangilash')}>
            <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
          </button>
          {statusBadge()}
        </div>
      </div>

      {canCreateDesk && (
        <CollapsibleCard
          tone="success"
          title={tr('Kassa desks', 'Kassalar')}
          description={tr('Create a kassa without assigning a separate cashier. A firm admin can operate it directly.', 'Alohida kassir biriktirmasdan kassa yarating. Firma admini uni bevosita ishlata oladi.')}
          storageKey="kassa-desk-create-card"
        >
          <form onSubmit={createDesk} className="compact-toolbar">
            {canFilterFirm && (
              <div className="min-w-[220px]">
                <label className="compact-label">{tr('Firm', 'Firma')}</label>
                <select value={deskFirmId} onChange={(e) => setDeskFirmId(e.target.value)} className="compact-control" required>
                  <option value="">{tr('Select a firm', 'Firmani tanlang')}</option>
                  {firmOptions.map((firm) => <option key={firm.id} value={firm.id}>{firm.name}</option>)}
                </select>
              </div>
            )}
            <div className="min-w-[220px] flex-1">
              <label className="compact-label">{tr('Kassa name', 'Kassa nomi')}</label>
              <input value={deskName} onChange={(e) => setDeskName(e.target.value)} className="compact-control" placeholder={tr('Main kassa', 'Asosiy kassa')} required />
            </div>
            <div className="min-w-[140px]">
              <label className="compact-label">{tr('Code (optional)', 'Kod (ixtiyoriy)')}</label>
              <input value={deskCode} onChange={(e) => setDeskCode(e.target.value)} className="compact-control" placeholder="K-01" />
            </div>
            <ActionButtons
              cancelLabel={tr('Cancel', 'Bekor qilish')}
              confirmLabel={tr('Add kassa', 'Kassa qo‘shish')}
              busyLabel={tr('Creating…', 'Yaratilyapti…')}
              busy={creatingDesk}
              canConfirm={Boolean(deskName.trim() && (!canFilterFirm || deskFirmId))}
              onCancel={() => { setDeskFirmId(''); setDeskName(''); setDeskCode(''); }}
            />
          </form>
        </CollapsibleCard>
      )}

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

      {canManageKassa && !user.readOnlyAccess && selectedSummaryDesk && (
        <CollapsibleCard
          tone="finance"
          title={tr('Import historical Kassa data', 'Eski Kassa ma’lumotlarini yuklash')}
          description={tr('Download the Excel template, fill historical cash income and expenses, validate it, then import without duplicates.', 'Excel shablonni yuklab oling, eski naqd kirim-chiqimlarni to‘ldiring, tekshiring va dublikatsiz yuklang.')}
          storageKey="historical-kassa-import"
        >
          <HistoricalKassaImport
            key={selectedSummaryDesk.id}
            desk={selectedSummaryDesk}
            tr={tr}
            onImported={() => setReloadKey((key) => key + 1)}
          />
        </CollapsibleCard>
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

      {canManageKassa && isClosed && Boolean(summaryKassaDeskId) && (
        <CollapsibleCard
          tone="danger"
          title={tr('Reopen kassa', 'Kassani qayta ochish')}
          description={tr('An authorized kassa user can reopen a closed day. This is audit logged.', 'Vakolatli kassa foydalanuvchisi yopilgan kunni qayta ochishi mumkin. Bu auditga yoziladi.')}
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
                required
              />
            </div>
            <ActionButtons
              cancelLabel={tr('Cancel', 'Bekor qilish')}
              confirmLabel={tr('Reopen kassa', 'Kassani qayta ochish')}
              busyLabel={tr('Reopening...', 'Qayta ochilyapti...')}
              busy={reopeningKassa}
              danger
              canConfirm={Boolean(canManageKassa && isClosed && hasValidSelectedDate && summaryKassaDeskId && reopenNotes.trim())}
              onCancel={() => setReopenNotes('')}
            />
          </form>
        </CollapsibleCard>
      )}

      {canManageKassa && isNotOpen && Boolean(summaryKassaDeskId) && (
        <CollapsibleCard
          tone="success"
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
                readOnly={!editingOpeningBalance}
                required
              />
              <label className="compact-label mt-3">
                {tr('Opening cash balance (USD)', 'Boshlang\'ich naqd balans (USD)')}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={openingBalanceUsd}
                onChange={(e) => setOpeningBalanceUsd(e.target.value)}
                className="compact-control"
                readOnly={!editingOpeningBalance}
                required
              />
              {summary?.openingSuggestion?.previousSessionId ? (
                <div className="mt-2 space-y-1 text-xs text-muted">
                  <p>{tr('Calculated automatically from the last closed kassa balance.', 'Oxirgi yopilgan kassa qoldig‘i asosida avtomatik hisoblandi.')}</p>
                  <p>
                    {tr('Previous business day', 'Oldingi ish kuni')}: {summary.openingSuggestion.previousBusinessDate}, {tr('closing balance', 'yakuniy qoldiq')}: {formatCurrencyMap({ UZS: Number(summary.openingSuggestion.openingBalances?.UZS || summary.openingSuggestion.openingBalance || 0), USD: Number(summary.openingSuggestion.openingBalances?.USD || 0) })}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted">{tr('First session: an authorized user may enter the initial balance.', 'Birinchi sessiya: vakolatli foydalanuvchi dastlabki kassa qoldig‘ini kiritishi mumkin.')}</p>
              )}
              {canAdjustOpeningBalance && !editingOpeningBalance && (
                <button type="button" onClick={() => setEditingOpeningBalance(true)} className="mt-2 text-xs font-semibold text-primary hover:underline">
                  {tr('Correct', 'Tuzatish')}
                </button>
              )}
              {editingOpeningBalance && summary?.openingSuggestion?.previousSessionId && (
                <input
                  value={openingAdjustmentReason}
                  onChange={(e) => setOpeningAdjustmentReason(e.target.value)}
                  className="compact-control mt-2"
                  placeholder={tr('Adjustment reason (required)', 'Tuzatish sababi (majburiy)')}
                  required
                />
              )}
            </div>
            <ActionButtons
              cancelLabel={tr('Cancel', 'Bekor qilish')}
              confirmLabel={tr('Open kassa', 'Kassani ochish')}
              busyLabel={tr('Opening…', 'Ochilyapti…')}
              busy={openingKassa}
              canConfirm={Boolean(
                hasValidSelectedDate
                && summaryKassaDeskId
                && Number(openingBalance) >= 0
                && Number(openingBalanceUsd) >= 0
                && (!editingOpeningBalance || !summary?.openingSuggestion?.previousSessionId || openingAdjustmentReason.trim())
              )}
              onCancel={resetOpeningDraft}
            />
          </form>
        </CollapsibleCard>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: tr('Daily income', 'Kunlik jami kirim'), value: formatCurrencyMap(dailyIncomeByCurrency), icon: Unlock, tone: 'success' },
          { label: tr('Daily expense', 'Kunlik jami chiqim'), value: formatCurrencyMap(dailyExpenseByCurrency), icon: Lock, tone: 'danger' },
          { label: tr('Cash balance', 'Kassa qoldig\'i'), value: formatCurrencyMap(cashBalanceByCurrency), icon: Wallet, tone: 'finance' },
          { label: tr('Card balance', 'Kartalarda qoldiq'), value: formatCurrencyMap(summary?.totals.cardBalanceByCurrency), icon: CreditCard, tone: 'finance' },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} data-tone={tone} className="metric-card p-4">
            <div className="flex items-center gap-2 text-muted text-xs font-semibold uppercase tracking-wider mb-2">
              <Icon size={14} />
              {label}
            </div>
            <div className="data-value text-xl font-semibold leading-tight text-foreground">
              {loading ? '—' : value}
            </div>
          </div>
        ))}
      </div>

      <CollapsibleCard
        title={tr('Kassa status', 'Kassalar holati')}
        description={tr('Firm-scoped session, cashier and balance monitoring.', 'Firma doirasidagi sessiya, kassir va qoldiq monitoringi.')}
        storageKey="kassa-monitoring-table"
        defaultOpen={true}
      >
        {!loading && visibleDeskOptions.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{tr('No kassas are assigned to this firm yet.', 'Firmangizga hozircha kassa biriktirilmagan.')}</p>
        ) : (
          <div className="overflow-x-auto scroller-minimal">
            <table className="excel-table">
              <thead><tr>
                <th>{tr('Kassa', 'Kassa')}</th><th>{tr('Cashier', 'Kassir')}</th><th>{tr('Status', 'Holat')}</th><th>{tr('Opened', 'Ochildi')}</th>
                <th>{tr('Opening balance', 'Boshlang‘ich qoldiq')}</th><th>{tr('Daily income', 'Kunlik kirim')}</th><th>{tr('Daily expense', 'Kunlik chiqim')}</th><th>{tr('Current balance', 'Joriy qoldiq')}</th><th>{tr('Last operation', 'Oxirgi operatsiya')}</th><th>{tr('Actions', 'Amallar')}</th>
              </tr></thead>
              <tbody>
                {(summary?.deskMonitoring || []).filter((desk) => !monitorFirmId || desk.firmId === monitorFirmId).map((desk) => (
                  <tr key={desk.id}>
                    <td className="font-semibold">{desk.displayName || desk.name}</td>
                    <td>{desk.assignedCashier?.email || tr('Unassigned', 'Kassir biriktirilmagan')}</td>
                    <td>{desk.status === 'OPEN' ? tr('Open', 'Ochiq') : desk.status === 'CLOSED' ? tr('Closed', 'Yopiq') : tr('No session', 'Sessiya yo‘q')}</td>
                    <td>{desk.session?.openedAt ? new Date(desk.session.openedAt).toLocaleString() : '—'}</td>
                    <td className="font-mono">{desk.session ? formatCurrencyMap({ UZS: Number(desk.session.openingBalance || 0), USD: Number(desk.session.openingBalanceUsd || 0) }) : '—'}</td>
                    <td className="font-mono">{formatCurrencyMap(Object.fromEntries(Object.entries(desk.totals?.byCurrency || {}).map(([currency, row]: [string, any]) => [currency, Number(row.dailyIncomeTotal || 0)])))}</td>
                    <td className="font-mono">{formatCurrencyMap(Object.fromEntries(Object.entries(desk.totals?.byCurrency || {}).map(([currency, row]: [string, any]) => [currency, Number(row.dailyExpenseTotal || 0)])))}</td>
                    <td className="font-mono">{formatCurrencyMap(desk.cashBalanceByCurrency)}</td>
                    <td>{desk.lastOperationAt ? new Date(desk.lastOperationAt).toLocaleString() : '—'}</td>
                    <td><button type="button" onClick={() => setSummaryKassaDeskId(desk.id)} className="text-xs font-semibold text-primary hover:underline">{tr('View', 'Ko‘rish')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleCard>

      <CollapsibleCard
        tone="finance"
        title={tr('Daily kassa balance', 'Kunlik kassa qoldiq ma\'lumotlari')}
        description={tr('Daily total income, expense, cash balance and card balance.', 'Har kungi jami kirim, chiqim, kassa qoldig\'i va kartalardagi qoldiq.')}
        storageKey="kassa-daily-balance-card"
        defaultOpen={true}
        headerRight={<DailyReconciliationActions
          date={selectedDate}
          status={summary?.status || 'NOT_OPEN'}
          openingBalance={formatCurrencyMap({ UZS: Number(summary?.kassa?.openingBalance || 0), USD: Number(summary?.kassa?.openingBalanceUsd || 0) })}
          closingBalance={summary?.kassa?.closingBalance != null ? formatCurrencyMap({ UZS: Number(summary.kassa.actualClosingBalance ?? summary.kassa.closingBalance), USD: Number(summary.kassa.actualClosingBalanceUsd ?? summary.kassa.closingBalanceUsd ?? 0) }) : '—'}
          cashIn={formatCurrencyMap(cashInByCurrency)} cashOut={formatCurrencyMap(cashOutByCurrency)} cashBalance={formatCurrencyMap(cashBalanceByCurrency)}
          cardIn={formatCurrencyMap(cardInByCurrency)} cardOut={formatCurrencyMap(cardOutByCurrency)} cardBalance={formatCurrencyMap(summary?.totals.cardBalanceByCurrency)}
          openedBy={summary?.kassa?.openedBy?.email} closedBy={summary?.kassa?.closedBy?.email}
        />}
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
                <td className="text-right font-mono">{formatCurrencyMap(cashInByCurrency)}</td>
                <td className="text-right font-mono">{formatCurrencyMap(cashOutByCurrency)}</td>
                <td className="text-right font-mono">{formatCurrencyMap(cashBalanceByCurrency)}</td>
                <td className="text-right font-mono">{formatCurrencyMap(cardInByCurrency)}</td>
                <td className="text-right font-mono">{formatCurrencyMap(cardOutByCurrency)}</td>
                <td className="text-right font-mono">{formatCurrencyMap(summary?.totals.cardBalanceByCurrency)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CollapsibleCard>

      <CollapsibleCard
        tone="finance"
        title={tr('Card information', 'Karta ma\'lumotlari')}
        description={tr('Track which card receives money, spends money, and how much remains.', 'Qaysi kartaga qancha tushyapdi, qancha ketyapdi va qancha qoldi — nazorat qiling.')}
        storageKey="kassa-card-info-card"
        defaultOpen={true}
      >
        {canManageCards && (
          <form onSubmit={createCard} className="compact-toolbar mb-4">
            <div>
              <label className="compact-label">{tr('Card owner', 'Karta egasi')}</label>
              <input value={cardOwnerName} onChange={(e) => setCardOwnerName(e.target.value)} className="compact-control" required />
            </div>
            <div>
              <label className="compact-label">{tr('Card number', 'Karta raqami')}</label>
              <input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} className="compact-control" required />
            </div>
            <div>
              <label className="compact-label">{tr('Currency', 'Valyuta')}</label>
              <input value={cardCurrency} onChange={(e) => setCardCurrency(e.target.value.toUpperCase())} className="compact-control" placeholder="UZS" minLength={3} maxLength={3} pattern="[A-Za-z]{3}" required />
            </div>
            <div>
              <label className="compact-label">{tr('Opening balance', 'Boshlang\'ich qoldiq')}</label>
              <input type="number" inputMode="decimal" min="0" step="0.01" value={cardOpeningBalance} onChange={(e) => setCardOpeningBalance(e.target.value)} className="compact-control" required />
            </div>
            <ActionButtons
              cancelLabel={tr('Cancel', 'Bekor qilish')}
              confirmLabel={tr('Add card', 'Karta qo\'shish')}
              busyLabel={tr('Adding...', 'Qo\'shilmoqda...')}
              busy={creatingCard}
              canConfirm={Boolean(cardOwnerName.trim() && cardNumber.trim() && /^[A-Z]{3}$/.test(cardCurrency.trim().toUpperCase()) && Number(cardOpeningBalance) >= 0)}
              onCancel={resetCardDraft}
            />
          </form>
        )}
        <div className="overflow-x-auto scroller-minimal">
          <table className="excel-table">
            <thead>
              <tr>
                <th>{tr('Full name', 'To\'liq ism')}</th>
                <th>{tr('Card number', 'Karta raqami')}</th>
                <th>{tr('Primary currency', 'Asosiy valyuta')}</th>
                <th>{tr('Firm', 'Firma')}</th>
                <th>{tr('Status', 'Holat')}</th>
                <th className="text-right">{tr('Opening balance', 'Boshlang\'ich qoldiq')}</th>
                <th>{tr('Today movement', 'Bugungi harakat')}</th>
                <th>{tr('Real balance', 'Haqiqiy qoldiq')}</th>
                {canManageCards && <th className="text-right">{tr('Actions', 'Amallar')}</th>}
              </tr>
            </thead>
            <tbody>
              {paymentCards.length === 0 ? (
                <tr><td colSpan={canManageCards ? 9 : 8} className="text-center text-muted">{tr('No cards added yet.', 'Hali karta qo\'shilmagan.')}</td></tr>
              ) : paymentCards.map((card) => {
                const isEditing = editingCardId === card.id;
                return (
                  <tr key={card.id}>
                    <td className="font-semibold min-w-[180px]">
                      {isEditing ? (
                        <input value={cardEditDraft.ownerName} onChange={(e) => setCardEditDraft((draft) => ({ ...draft, ownerName: e.target.value }))} className="compact-control" />
                      ) : card.ownerName}
                    </td>
                    <td className="font-mono min-w-[170px]">
                      {isEditing ? (
                        <input value={cardEditDraft.cardNumber} onChange={(e) => setCardEditDraft((draft) => ({ ...draft, cardNumber: e.target.value }))} className="compact-control" />
                      ) : card.cardNumber}
                    </td>
                    <td className="min-w-[110px]">
                      {isEditing ? (
                        <input value={cardEditDraft.currency} onChange={(e) => setCardEditDraft((draft) => ({ ...draft, currency: e.target.value.toUpperCase() }))} className="compact-control" maxLength={3} />
                      ) : card.currency}
                    </td>
                    <td>{card.firm?.name || tr('Platform', 'Platforma')}</td>
                    <td>
                      {isEditing ? (
                        <select value={cardEditDraft.status} onChange={(e) => setCardEditDraft((draft) => ({ ...draft, status: e.target.value }))} className="compact-control">
                          <option value="ACTIVE">ACTIVE</option>
                          <option value="INACTIVE">INACTIVE</option>
                        </select>
                      ) : (
                        <span className={String(card.status || 'ACTIVE').toUpperCase() === 'ACTIVE' ? 'text-emerald-600 font-semibold' : 'text-muted font-semibold'}>
                          {String(card.status || 'ACTIVE').toUpperCase()}
                        </span>
                      )}
                    </td>
                    <td className="text-right font-mono min-w-[130px]">
                      {isEditing ? (
                        <input inputMode="decimal" value={cardEditDraft.openingBalance} onChange={(e) => setCardEditDraft((draft) => ({ ...draft, openingBalance: e.target.value }))} className="compact-control text-right" />
                      ) : `${formatMoney(Number(card.openingBalance || 0))} ${card.currency}`}
                    </td>
                    <td className="font-mono min-w-[180px]">{formatCurrencyMap(Object.fromEntries(Object.entries(card.dailyByCurrency || {}).map(([currency, totals]) => [currency, totals.net])))}</td>
                    <td className="font-mono min-w-[220px] font-semibold text-foreground">{formatCurrencyMap(card.balanceByCurrency)}</td>
                    {canManageCards && (
                      <td className="text-right whitespace-nowrap">
                        {isEditing ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => saveCardEdit(card.id)}
                              disabled={savingCard || !cardEditDraft.ownerName.trim() || !cardEditDraft.cardNumber.trim() || !/^[A-Z]{3}$/.test(cardEditDraft.currency.trim().toUpperCase()) || !Number.isFinite(Number(cardEditDraft.openingBalance)) || Number(cardEditDraft.openingBalance) < 0}
                              className="px-3 py-2 bg-primary text-ink rounded-lg text-xs font-bold uppercase disabled:opacity-50"
                            >
                              {savingCard ? tr('Saving...', 'Saqlanmoqda...') : tr('Confirm', 'Tasdiqlash')}
                            </button>
                            <button type="button" onClick={() => setEditingCardId('')} className="px-3 py-2 bg-surface-2 border border-border rounded-lg text-xs font-semibold uppercase">
                              {tr('Cancel', 'Bekor')}
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-2">
                            <button type="button" onClick={() => startEditCard(card)} className="px-3 py-2 bg-surface-2 border border-border rounded-lg text-xs font-semibold uppercase hover:bg-surface">
                              {tr('Edit', 'Tahrir')}
                            </button>
                            {canDeleteCard(card) && <button type="button" onClick={() => deleteCard(card)} disabled={deletingCardId === card.id} className="px-3 py-2 bg-red-500/10 border border-red-500/30 text-red-600 rounded-lg text-xs font-semibold uppercase hover:bg-red-500/15 disabled:opacity-50">
                              {deletingCardId === card.id ? tr('Deleting', 'O\'chirilmoqda') : tr('Delete', 'O\'chirish')}
                            </button>}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CollapsibleCard>

      {canRecordPayment && (
        <CollapsibleCard
          tone="finance"
          id="add-payment"
          title={tr('Add payment', 'To\'lov qo\'shish')}
          description={
            isEditable
              ? tr('Record a payment from this kassa to an airline or firm.', 'Ushbu kassadan airline yoki firmaga to‘lovni qayd eting.')
              : tr('Payments can only be recorded while kassa is open.', 'To\'lovlar faqat kassa ochiq bo\'lganda qayd etiladi.')
          }
          defaultOpen={true}
          storageKey="kassa-payment-card"
        >
          <form onSubmit={submitPayment} className={`compact-toolbar ${!isEditable ? 'opacity-50' : ''}`}>
          {canChooseTransactionFirm && (
            <div>
              <label className="compact-label">{tr('Firm', 'Firma')}</label>
              <select value={payFirmId} onChange={(e) => { setPayFirmId(e.target.value); setPayReceiverFirmId(''); }} className="compact-control" required>
                <option value="">{tr('Select firm', 'Firmani tanlang')}</option>
                {firmOptions.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}{f.currency ? ` (${f.currency})` : ''}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="compact-label">{tr('Payment recipient', 'Kimga (to‘lov oluvchi)')}</label>
            <select value={payReceiverFirmId} onChange={(e) => setPayReceiverFirmId(e.target.value)} className="compact-control" required>
              <option value="">{tr('Select recipient', 'To‘lov oluvchini tanlang')}</option>
              {firmOptions.filter((firm) => firm.id !== (payFirmId || user?.firmId)).map((firm) => <option key={firm.id} value={firm.id}>{firm.name}</option>)}
            </select>
          </div>
          <div>
            <label className="compact-label">{tr('Flight (optional)', 'Reys (ixtiyoriy)')}</label>
            <select value={payFlightId} onChange={(e) => setPayFlightId(e.target.value)} className="compact-control">
              <option value="">{tr('Payment without flight', 'Reyssiz to‘lov')}</option>
              {flightOptions.map((f) => {
                const id = f.id || f.flight_id || '';
                return <option key={id} value={id}>{f.flightNumber || id}</option>;
              })}
            </select>
          </div>
          <div>
            <label className="compact-label">{tr('Amount', 'Summa')}</label>
            <input type="number" min="0.01" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="compact-control" required />
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
              <input value={payOtherCurrency} onChange={(e) => setPayOtherCurrency(e.target.value.toUpperCase())} minLength={3} maxLength={3} pattern="[A-Za-z]{3}" className="compact-control uppercase" required />
            </div>
          )}
          {payCurrencyCode !== 'UZS' && (
            <div>
              <label className="compact-label">{tr('Rate to UZS', 'UZS kursi')}</label>
              <input type="number" inputMode="decimal" min="0.000001" step="any" value={payExchangeRate} onChange={(e) => setPayExchangeRate(e.target.value)} className="compact-control" placeholder="12600" required />
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
            <select value={payKassaDeskId} onChange={(e) => setPayKassaDeskId(e.target.value)} className="compact-control" required={payDeskOptions.length > 0}>
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
                    <option key={card.id} value={card.id}>{formatCardLabel(card)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="compact-label">{tr('Reference (optional)', 'Raqam (ixtiyoriy)')}</label>
                <input value={payCardReference} onChange={(e) => setPayCardReference(e.target.value)} className="compact-control" />
              </div>
            </>
          )}
          <ActionButtons
            cancelLabel={tr('Cancel', 'Bekor qilish')}
            confirmLabel={tr('Record payment', 'To\'lov qayd etish')}
            busyLabel={tr('Recording…', 'Qayd etilmoqda…')}
            busy={recordingPayment}
            canConfirm={Boolean(
              isEditable
              && canRecordPayment
              && hasValidSelectedDate
              && (!canChooseTransactionFirm || payFirmId)
              && payReceiverFirmId
              && Number(payAmount) > 0
              && /^[A-Z]{3}$/.test(payCurrencyCode)
              && (payCurrencyCode === 'UZS' || Number(payExchangeRate) > 0)
              && (payDeskOptions.length === 0 || payKassaDeskId)
              && (payMethod !== 'card' || (payCardId && (!selectedPayCard?.currency || selectedPayCard.currency === payCurrencyCode)))
            )}
            onCancel={resetPaymentDraft}
          />
          </form>
        </CollapsibleCard>
      )}

      {canRecordPayment && (
        <CollapsibleCard
          tone="success"
          id="cash-movement"
          title={tr('Cash income / expense', 'Kassa kirim / chiqim')}
          description={
            isEditable
              ? tr('Record direct cash coming into or leaving kassa.', 'Kassaga to\'g\'ridan-to\'g\'ri kirgan yoki chiqqan naqd pulni qayd eting.')
              : tr('Cash movements can only be recorded while kassa is open.', 'Kassa harakatlari faqat kassa ochiq bo\'lganda qayd etiladi.')
          }
          defaultOpen={true}
          storageKey="kassa-cash-movement-card"
        >
          <form onSubmit={submitCashMovement} className={`compact-toolbar ${!isEditable ? 'opacity-50' : ''}`}>
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
            <select value={cashKassaDeskId} onChange={(e) => setCashKassaDeskId(e.target.value)} className="compact-control" required={cashDeskOptions.length > 0}>
                <option value="">{tr('Select kassa', 'Kassani tanlang')}</option>
                {cashDeskOptions.map((desk) => (
                  <option key={desk.id} value={desk.id}>{desk.firm?.name ? `${desk.firm.name} · ` : ''}{desk.name}{desk.code ? ` (${desk.code})` : ''}</option>
                ))}
              </select>
            </div>
            {cashMethod === 'card' && (
              <div>
                <label className="compact-label">{tr('Card', 'Karta')}</label>
                <select
                  value={cashCardId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    const card = paymentCards.find((item) => item.id === nextId);
                    setCashCardId(nextId);
                    if (card?.currency) setCashCurrencyCode(card.currency);
                  }}
                  className="compact-control"
                  required
                >
                  <option value="">{tr('Select card', 'Kartani tanlang')}</option>
                  {paymentCards.map((card) => (
                    <option key={card.id} value={card.id}>{formatCardLabel(card)}</option>
                  ))}
                </select>
              </div>
            )}
            {canChooseTransactionFirm && (
              <div>
                <label className="compact-label">{tr('Firm', 'Firma')}</label>
                <select value={cashFirmId} onChange={(e) => setCashFirmId(e.target.value)} className="compact-control" required>
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
              <label className="compact-label">{tr('Flight (optional)', 'Reys (ixtiyoriy)')}</label>
              <select value={cashFlightId} onChange={(e) => setCashFlightId(e.target.value)} className="compact-control">
                <option value="">{tr('Not linked to a flight', 'Reysga bog‘lanmagan')}</option>
                {flightOptions.map((flight) => {
                  const id = flight.id || flight.flight_id || '';
                  return <option key={id} value={id}>{flight.flightNumber || id}{flight.route ? ` · ${flight.route}` : ''}</option>;
                })}
              </select>
            </div>
            <div>
              <label className="compact-label">
                {tr('Amount', 'Summa')} ({cashCurrencyCode || 'UZS'})
              </label>
              <input type="number" inputMode="decimal" min="0.01" step="0.01" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} className="compact-control" required />
            </div>
            <div>
              <label className="compact-label">{tr('Currency', 'Valyuta')}</label>
              <select value={cashCurrency} onChange={(e) => setCashCurrency(e.target.value as 'USD' | 'UZS' | 'OTHER')} className="compact-control">
                <option value="UZS">UZS</option>
                <option value="USD">USD</option>
                <option value="OTHER">{tr('Other', 'Boshqa')}</option>
              </select>
            </div>
            {cashCurrency === 'OTHER' && (
              <div>
                <label className="compact-label">{tr('Currency code', 'Valyuta kodi')}</label>
                <input value={cashOtherCurrency} onChange={(e) => setCashOtherCurrency(e.target.value.toUpperCase())} minLength={3} maxLength={3} pattern="[A-Za-z]{3}" className="compact-control uppercase" required />
              </div>
            )}
            {cashCurrencyCode !== 'UZS' && (
              <div>
                <label className="compact-label">{tr('Rate to UZS', 'UZS kursi')}</label>
                <input type="number" inputMode="decimal" min="0.000001" step="any" value={cashExchangeRate} onChange={(e) => setCashExchangeRate(e.target.value)} className="compact-control" placeholder="12600" required />
              </div>
            )}
            <div>
              <label className="compact-label">{tr('Note', 'Izoh')}</label>
              <input value={cashNote} onChange={(e) => setCashNote(e.target.value)} className="compact-control" />
            </div>
            <ActionButtons
              cancelLabel={tr('Cancel', 'Bekor qilish')}
              confirmLabel={tr('Record', 'Qayd etish')}
              busyLabel={tr('Recording...', 'Qayd etilmoqda...')}
              busy={recordingCash}
              canConfirm={Boolean(
                isEditable
                && canRecordPayment
                && hasValidSelectedDate
                && (!canChooseTransactionFirm || cashFirmId)
                && Number(cashAmount) > 0
                && /^[A-Z]{3}$/.test(cashCurrencyCode)
                && (cashCurrencyCode === 'UZS' || Number(cashExchangeRate) > 0)
                && (cashDeskOptions.length === 0 || cashKassaDeskId)
                && (cashMethod !== 'card' || (cashCardId && (!selectedCashCard?.currency || selectedCashCard.currency === cashCurrencyCode)))
              )}
              onCancel={resetCashDraft}
            />
          </form>
        </CollapsibleCard>
      )}

      <CollapsibleCard
        tone="finance"
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
                  <th>{tr('Created by', 'Kim kiritdi')}</th>
                  <th className="text-right">{tr('Amount', 'Summa')}</th>
                  <th>{tr('Action', 'Amal')}</th>
                </tr>
              </thead>
              <tbody>
                {summary.transactions.map((tx) => {
                  const canChangeDaily = canChangeDailyCash(tx);
                  return (
                  <tr key={tx.id} className="border-b border-border/50">
                    <td className="font-medium">
                      {tx.direction === 'KASSA_IN' ? tr('Income', 'Kirim') : tx.direction === 'KASSA_OUT' ? tr('Expense', 'Chiqim') : tx.type}
                    </td>
                    {canFilterFirm && <td>{tx.firm?.name || tx.firmId}</td>}
                    <td>{tx.flight?.flightNumber || tx.flightId}</td>
                    <td>{tx.kassaDesk?.name || tx.kassaDeskId || '—'}</td>
                    <td className="uppercase text-xs">{tx.paymentMethod || '—'}</td>
                    <td>{tx.createdBy?.fullName || tx.createdBy?.email || '—'}</td>
                    <td className="text-right font-mono">{tx.originalAmount} {tx.currency}</td>
                    <td><div className="flex gap-1">
                      {canChangeDaily && <button type="button" onClick={() => editDailyCash(tx)} className="border border-border px-2 py-1 text-xs">{tr('Edit', 'Tahrir')}</button>}
                      {canChangeDaily && <button type="button" onClick={() => deleteDailyCash(tx)} className="border border-red-500/30 px-2 py-1 text-xs text-red-600">{tr('Delete', "O'chirish")}</button>}
                      {!canChangeDaily && canDeleteFirmRecords && isEditable && <button type="button" onClick={() => deleteTransaction(tx)} className="border border-red-500/30 px-2 py-1 text-xs text-red-600">{tr('Delete', "O'chirish")}</button>}
                      {!isEditable && canDeleteFirmRecords && <span className="text-xs text-muted">{tr('Reopen the kassa day to delete', 'O‘chirish uchun kassa kunini qayta oching')}</span>}
                      {!canChangeDaily && !canDeleteFirmRecords && '—'}
                    </div></td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleCard>

      {canManageKassa && isEditable && Boolean(summaryKassaDeskId) && (
        <CollapsibleCard
          tone="danger"
          id="close-kassa"
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
                required
              />
              {summary?.totals.expectedCash != null && (
                <p className="mt-1 text-xs text-muted">
                  {tr('Expected', 'Kutilgan')}: {formatMoney(summary.totals.expectedCash)} UZS
                </p>
              )}
            </div>
            <div>
              <label className="compact-label">
                {tr('Physical cash count (USD)', 'Haqiqiy naqd pul (USD)')}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={closingBalanceUsd}
                onChange={(e) => setClosingBalanceUsd(e.target.value)}
                placeholder={summary?.totals.expectedCashByCurrency?.USD != null ? String(summary.totals.expectedCashByCurrency.USD) : ''}
                className="compact-control"
                required
              />
              {summary?.totals.expectedCashByCurrency?.USD != null && (
                <p className="mt-1 text-xs text-muted">
                  {tr('Expected', 'Kutilgan')}: {formatMoney(summary.totals.expectedCashByCurrency.USD)} USD
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
            <ActionButtons
              cancelLabel={tr('Cancel', 'Bekor qilish')}
              confirmLabel={tr('Close kassa', 'Kassani yopish')}
              busyLabel={tr('Closing…', 'Yopilyapti…')}
              busy={closingKassa}
              danger
              canConfirm={Boolean(isEditable && hasValidSelectedDate && summaryKassaDeskId && Number(closingBalance) >= 0 && Number(closingBalanceUsd) >= 0)}
              onCancel={() => { setClosingBalance(''); setClosingBalanceUsd(''); setCloseNotes(''); }}
            />
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
                    <div className="mt-1 text-lg font-bold">{formatCurrencyMap(dailyIncomeByCurrency)}</div>
                  </div>
                  <div className="rounded-lg border border-border bg-surface-2 p-3">
                    <div className="text-xs uppercase text-muted">{tr('Daily expense', 'Bugungi jami chiqim')}</div>
                    <div className="mt-1 text-lg font-bold">{formatCurrencyMap(dailyExpenseByCurrency)}</div>
                  </div>
                  <div className="rounded-lg border border-border bg-surface-2 p-3">
                    <div className="text-xs uppercase text-muted">{tr('Physical count', 'Sanab kiritilgan')}</div>
                    <div className="mt-1 text-lg font-bold">{formatCurrencyMap({ UZS: Number(closingBalance || summary?.totals.expectedCashByCurrency?.UZS || 0), USD: Number(closingBalanceUsd || summary?.totals.expectedCashByCurrency?.USD || 0) })}</div>
                  </div>
                </div>
                <div className="overflow-x-auto scroller-minimal">
                  <table className="excel-table">
                    <tbody>
                      {Object.entries(cashBalanceByCurrency)
                        .filter(([, value]) => Math.abs(Number(value || 0)) > 0.0001)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([currency, value]) => (
                          <tr key={currency}>
                            <td>{tr('Cash balance', 'Naqd qoldiq')} {currency}</td>
                            <td className="text-right font-mono">{formatMoney(Number(value || 0))} {currency}</td>
                          </tr>
                        ))}
                      <tr>
                        <td>{tr('Cards total', 'Kartalardagi jami qoldiq')}</td>
                        <td className="text-right font-mono">
                          {formatCurrencyMap(summary?.totals.cardBalanceByCurrency)}
                        </td>
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
                          <td className="text-right font-mono">{formatCurrencyMap(card.balanceByCurrency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-surface-2 p-4 text-sm text-foreground">
                {confirmAction.kind === 'open' && (
                  <p>{tr('Open kassa with opening balance', 'Kassani boshlang\'ich balans bilan ochish')}: <b>{formatCurrencyMap({ UZS: Number(openingBalance || 0), USD: Number(openingBalanceUsd || 0) })}</b></p>
                )}
                {confirmAction.kind === 'payment' && (
                  <div className="space-y-1">
                    <p><b>{confirmAction.label}</b></p>
                    <p>{tr('Firm', 'Firma')}: {selectedPayFirm?.name || user?.email}</p>
                    <p>{tr('Recipient', 'Kimga (to‘lov oluvchi)')}: {selectedPayReceiver?.name || '-'}</p>
                    <p>{tr('Flight', 'Reys')}: {selectedPayFlight?.flightNumber || tr('Without flight', 'Reyssiz')}</p>
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
