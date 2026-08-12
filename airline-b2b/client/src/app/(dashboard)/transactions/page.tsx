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
import ExportActions from '@/components/ui/ExportActions';
import ActionButtons from '@/components/ui/ActionButtons';
import { normalizeDateParam, normalizeTxTypeParam, TRANSACTIONS_PREFS_KEY, type TransactionsPrefs } from '@/features/transactions/query';

type FirmOption = {
  id: string;
  name: string;
  currency?: string | null;
};

type FlightOption = {
  id?: string;
  flight_id?: string;
  flightNumber?: string;
};

type PaymentCardOption = {
  id: string;
  ownerName: string;
  cardNumber: string;
  currency: 'UZS' | 'USD';
};

type KassaDeskOption = {
  id: string;
  firmId: string;
  name: string;
  code?: string | null;
  status?: string;
  firm?: { id: string; name: string | null } | null;
};

const FINANCE_OPERATION_OPTIONS = [
  ['BANK_INCOME', 'Bank kirimi'], ['BANK_EXPENSE', 'Bank chiqimi'], ['BANK_TO_BANK_TRANSFER', 'Banklararo o‘tkazma'],
  ['DEBTOR_PAYMENT_RECEIVED', 'Debitor qarzini to‘ladi'], ['CREDITOR_PAYMENT_MADE', 'Kreditorga to‘lov'],
  ['THREE_PARTY_SETTLEMENT', 'Uch tomonlama hisob-kitob'], ['MUTUAL_OFFSET', 'O‘zaro hisobga olish'],
  ['SERVICE_OFFSET', 'Xizmat bilan qarzni yopish'], ['TICKET_OFFSET', 'Bilet bilan qarzni yopish'], ['TOUR_OFFSET', 'Tur bilan qarzni yopish'],
  ['PRODUCT_OFFSET', 'Tovar bilan qarzni yopish'], ['COMPENSATION', 'Kompensatsiya'], ['ADVANCE_OFFSET', 'Avansdan yopish'],
  ['OVERPAYMENT_OFFSET', 'Ortiqcha to‘lovdan yopish'], ['MANUAL_ACCOUNTING_ADJUSTMENT', 'Buxgalteriya tuzatishi'],
  ['CASH_PAYMENT', 'Pul orqali to‘lov'], ['BANK_PAYMENT', 'Bank orqali to‘lov'], ['CARD_PAYMENT', 'Karta orqali to‘lov'],
  ['DEBT_ASSIGNMENT', 'Qarzni o‘tkazish'], ['ADVANCE_RECEIVED', 'Olingan avans'],
  ['ADVANCE_PAID', 'Berilgan avans'], ['OVERPAYMENT_REALLOCATION', 'Ortiqcha to‘lovni yo‘naltirish'],
  ['BANK_FEE', 'Bank komissiyasi'], ['CURRENCY_EXCHANGE', 'Valyuta ayirboshlash'],
  ['ACCOUNTING_ADJUSTMENT', 'Buxgalteriya tuzatishi'], ['OTHER_NON_CASH', 'Boshqa naqdsiz operatsiya'],
] as const;

const SETTLEMENT_OPERATIONS = ['THREE_PARTY_SETTLEMENT', 'MUTUAL_OFFSET', 'COMPENSATION', 'SERVICE_OFFSET', 'TICKET_OFFSET', 'TOUR_OFFSET', 'PRODUCT_OFFSET', 'ADVANCE_OFFSET', 'OVERPAYMENT_OFFSET', 'MANUAL_ACCOUNTING_ADJUSTMENT'] as const;
const RECEIVABLE_OPERATIONS = ['BANK_INCOME', 'DEBTOR_PAYMENT_RECEIVED', 'CASH_PAYMENT', 'BANK_PAYMENT', 'CARD_PAYMENT', ...SETTLEMENT_OPERATIONS] as const;
const PAYABLE_OPERATIONS = ['BANK_EXPENSE', 'CREDITOR_PAYMENT_MADE', 'CASH_PAYMENT', 'BANK_PAYMENT', 'CARD_PAYMENT', ...SETTLEMENT_OPERATIONS] as const;

const emptyFinanceDraft = {
  operationType: 'BANK_INCOME', sourceAccountId: '', destinationAccountId: '', amount: '', destinationAmount: '',
  economicPurpose: '', expenseCategoryId: '', receivableId: '', payableId: '', counterpartyName: '',
  paymentDate: format(new Date(), 'yyyy-MM-dd'), documentNumber: '', contractNumber: '', note: '', exchangeRate: '',
  debitAccountCode: '', creditAccountCode: '', currency: 'UZS', settlementInstrument: '', settlementSubjectType: '', settlementSubjectId: '', settlementDetails: '',
};

export default function TransactionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { tr, language } = useLanguage();

  const role = String(user?.role || '').toUpperCase();
  const canFilterFirm = role === 'ADMIN' || role === 'SUPERADMIN';
  const canCreateTransaction = canFilterFirm || (role === 'FIRM' && String(user?.firmRole || '').toUpperCase() === 'FIRM_ADMIN');
  const canManageAccounts = canCreateTransaction;
  const canDeleteTransaction = (transaction: any) => role === 'SUPERADMIN'
    || (role === 'FIRM' && String(user?.firmRole || '').toUpperCase() === 'FIRM_ADMIN' && String(transaction.firmId || '') === String(user?.firmId || ''));

  const [transactions, setTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountDraft, setAccountDraft] = useState({ name: '', type: 'BANK_ACCOUNT', currency: 'UZS', openingBalance: '0', bankName: '', accountNumber: '', bankCode: '', swiftCode: '', isPrimary: false });
  const [accountTx, setAccountTx] = useState({ ...emptyFinanceDraft });
  const [expenseCategories, setExpenseCategories] = useState<any[]>([]);
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingAccountTransaction, setSavingAccountTransaction] = useState(false);
  const [loading, setLoading] = useState(true);
  const [transactionsView, setTransactionsView] = useState<'list' | 'boxes'>('list');
  const [quickSearch, setQuickSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterOperationType, setFilterOperationType] = useState<string>('');
  const [filterFirmId, setFilterFirmId] = useState<string>('');
  const [filterKassaDeskId, setFilterKassaDeskId] = useState<string>('');
  const [filterFlightId, setFilterFlightId] = useState<string>('');
  const [filterCurrency, setFilterCurrency] = useState<string>('');
  const [filterSourceMode, setFilterSourceMode] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string>('');
  const [filterPaymentCardId, setFilterPaymentCardId] = useState<string>('');
  const [filterAllocationId, setFilterAllocationId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const [prefsReady, setPrefsReady] = useState(false);
  const lastAppliedQuerySignatureRef = useRef<string>('');

  const [firmOptions, setFirmOptions] = useState<FirmOption[]>([]);
  const [deskOptions, setDeskOptions] = useState<KassaDeskOption[]>([]);
  const [flightOptions, setFlightOptions] = useState<FlightOption[]>([]);
  const [paymentCards, setPaymentCards] = useState<PaymentCardOption[]>([]);
  
  // Pagination
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!user) return;
    const params = canFilterFirm && filterFirmId ? { firmId: filterFirmId } : undefined;
    Promise.all([
      api.get('/accounts', { params }),
      api.get('/expense-categories', { params }),
    ]).then(([accountResponse, categoryResponse]) => {
      setAccounts(Array.isArray(accountResponse.data) ? accountResponse.data : []);
      setExpenseCategories(Array.isArray(categoryResponse.data) ? categoryResponse.data : []);
    }).catch(() => { setAccounts([]); setExpenseCategories([]); });
  }, [user, reloadKey, filterFirmId, canFilterFirm]);

  const createAccount = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setSavingAccount(true);
      await api.post('/accounts', { ...accountDraft, firmId: canFilterFirm ? filterFirmId : undefined, openingBalance: Number(accountDraft.openingBalance || 0) });
      setAccountDraft({ name: '', type: 'BANK_ACCOUNT', currency: 'UZS', openingBalance: '0', bankName: '', accountNumber: '', bankCode: '', swiftCode: '', isPrimary: false });
      setReloadKey((key) => key + 1);
      toast.success(tr('Account created', 'Hisob yaratildi'));
    } catch (error: any) {
      toast.error(error?.response?.data?.error || tr('Failed to create account', 'Hisobni yaratib bo\'lmadi'));
    } finally { setSavingAccount(false); }
  };

  const createAccountTransaction = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setSavingAccountTransaction(true);
      const selectedSource = accounts.find((account) => account.id === accountTx.sourceAccountId);
      const selectedDestination = accounts.find((account) => account.id === accountTx.destinationAccountId);
      await api.post('/transactions/finance', {
        ...accountTx,
        firmId: canFilterFirm ? filterFirmId : undefined,
        amount: Number(accountTx.amount),
        destinationAmount: accountTx.destinationAmount ? Number(accountTx.destinationAmount) : undefined,
        currency: selectedSource?.currency || selectedDestination?.currency || accountTx.currency,
        exchangeRate: accountTx.exchangeRate || undefined,
      });
      setAccountTx({ ...emptyFinanceDraft });
      setReloadKey((key) => key + 1);
      toast.success(tr('Account transaction recorded', 'Hisob tranzaksiyasi qayd etildi'));
    } catch (error: any) {
      toast.error(error?.response?.data?.error || tr('Failed to record transaction', 'Tranzaksiyani qayd etib bo\'lmadi'));
    } finally {
      setSavingAccountTransaction(false);
    }
  };

  // Record Payment
  const [payFirmId, setPayFirmId] = useState<string>('');
  const [payFlightId, setPayFlightId] = useState<string>('');
  const [payAmount, setPayAmount] = useState<string>('');
  const [payCurrency, setPayCurrency] = useState<'USD' | 'UZS' | 'OTHER'>('UZS');
  const [payOtherCurrency, setPayOtherCurrency] = useState<string>('');
  const [payMethod, setPayMethod] = useState<'cash' | 'card' | 'bank'>('cash');
  const [payAllocationId, setPayAllocationId] = useState<string>('');
  const [payCashDate, setPayCashDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [payCardId, setPayCardId] = useState<string>('');
  const [payCardReference, setPayCardReference] = useState<string>('');
  const [payReference, setPayReference] = useState<string>('');
  const [payKassaDeskId, setPayKassaDeskId] = useState<string>('');
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [cashFlow, setCashFlow] = useState<'IN' | 'OUT'>('IN');
  const [cashFirmId, setCashFirmId] = useState<string>('');
  const [cashCounterpartyFirmId, setCashCounterpartyFirmId] = useState<string>('');
  const [cashAmount, setCashAmount] = useState<string>('');
  const [cashDate, setCashDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [cashNote, setCashNote] = useState<string>('');
  const [cashFlightId, setCashFlightId] = useState<string>('');
  const [cashKassaDeskId, setCashKassaDeskId] = useState<string>('');
  const [recordingCash, setRecordingCash] = useState(false);

  const payCurrencyCode = useMemo(() => {
    const c = payCurrency === 'OTHER' ? payOtherCurrency : payCurrency;
    return String(c || '').trim().toUpperCase();
  }, [payCurrency, payOtherCurrency]);

  const payAmountNum = useMemo(() => {
    const n = Number(payAmount);
    return Number.isFinite(n) ? n : NaN;
  }, [payAmount]);

  const selectedPayCard = useMemo(() => paymentCards.find((card) => card.id === payCardId), [paymentCards, payCardId]);
  const selectedPayFirm = useMemo(() => firmOptions.find((firm) => firm.id === payFirmId), [firmOptions, payFirmId]);
  const selectedCashFirm = useMemo(() => firmOptions.find((firm) => firm.id === cashFirmId), [firmOptions, cashFirmId]);

  const resetPaymentDraft = () => {
    setPayFirmId(canFilterFirm ? filterFirmId : '');
    setPayFlightId(filterFlightId);
    setPayAmount('');
    setPayCurrency('UZS');
    setPayOtherCurrency('');
    setPayMethod('cash');
    setPayAllocationId('');
    setPayCashDate(format(new Date(), 'yyyy-MM-dd'));
    setPayCardId('');
    setPayCardReference('');
    setPayReference('');
    setPayKassaDeskId(filterKassaDeskId);
  };

  const resetCashDraft = () => {
    setCashFlow('IN');
    setCashFirmId(canFilterFirm ? filterFirmId : '');
    setCashCounterpartyFirmId('');
    setCashAmount('');
    setCashDate(format(new Date(), 'yyyy-MM-dd'));
    setCashNote('');
    setCashFlightId('');
    setCashKassaDeskId(filterKassaDeskId);
  };

  const canChangeOwnDailyCash = (t: any) => {
    const creatorId = String(t.createdByUserId || '');
    const currentUserId = String((user as any)?.id || (user as any)?.userId || '');
    const metaDate = t.metadata && typeof t.metadata === 'object' ? String(t.metadata.date || '') : '';
    const businessDate = metaDate || String(t.createdAt || '').slice(0, 10);
    return t.type === 'ADJUSTMENT'
      && ['KASSA_IN', 'KASSA_OUT'].includes(String(t.direction || ''))
      && creatorId === currentUserId
      && businessDate === format(new Date(), 'yyyy-MM-dd');
  };

  const editOwnDailyCash = async (t: any) => {
    const amount = window.prompt(tr('Edit amount', 'Summani tahrirlash'), String(t.originalAmount || ''));
    if (amount === null) return;
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      toast.error(tr('Amount must be greater than zero', 'Summa noldan katta bo\'lishi kerak'));
      return;
    }
    const oldNote = t.metadata && typeof t.metadata === 'object' ? String(t.metadata.note || '') : '';
    const note = window.prompt(tr('Edit note', 'Izohni tahrirlash'), oldNote);
    if (note === null) return;
    const correctionReason = window.prompt(tr('Why is this correction needed?', 'Tuzatish sababi nima?'));
    if (!correctionReason?.trim()) return;
    try {
      await api.patch(`/transactions/${t.id}/daily-cash`, { amount: Number(amount), note, correctionReason: correctionReason.trim() });
      toast.success(tr('Transaction updated', 'Tranzaksiya tahrirlandi'));
      setReloadKey((k) => k + 1);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || tr('Failed to update transaction', 'Tranzaksiyani tahrirlab bo\'lmadi'));
    }
  };

  const deleteTransaction = async (transaction: any) => {
    const reason = window.prompt(tr('Why should this transaction be deleted?', 'Tranzaksiya nima sababdan o\'chiriladi?'));
    if (!reason?.trim()) return;
    if (!window.confirm(tr('Delete this transaction permanently?', 'Ushbu tranzaksiya butunlay o\'chirilsinmi?'))) return;
    try {
      await api.delete(`/transactions/${transaction.id}`, { data: { reason: reason.trim() } });
      toast.success(tr('Transaction deleted', 'Tranzaksiya o\'chirildi'));
      setReloadKey((key) => key + 1);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || tr('Failed to delete transaction', 'Tranzaksiyani o\'chirib bo\'lmadi'));
    }
  };

  const reverseFinancialTransaction = async (transaction: any) => {
    const reason = window.prompt(tr('Why is reversal required?', 'Reversal sababi nima?'));
    if (!reason?.trim()) return;
    if (!window.confirm(tr('Post an opposite entry and preserve the original?', 'Teskari yozuv yaratilib, asl tranzaksiya saqlansinmi?'))) return;
    try {
      await api.post(`/transactions/${transaction.id}/reversal`, { reason: reason.trim() });
      toast.success(tr('Reversal posted', 'Reversal yaratildi'));
      setReloadKey((key) => key + 1);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || tr('Failed to reverse transaction', 'Tranzaksiyani reversal qilib bo‘lmadi'));
    }
  };

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
    if (!prefsReady) return;

    const signature = searchParams.toString();
    if (signature === lastAppliedQuerySignatureRef.current) return;
    lastAppliedQuerySignatureRef.current = signature;

    const flightId = (searchParams.get('flightId') || searchParams.get('flight_id') || '').trim();
    const firmId = (searchParams.get('firmId') || searchParams.get('firm_id') || '').trim();
    const type = normalizeTxTypeParam(searchParams.get('type') || '');
    const currency = String(searchParams.get('currency') || '').trim();
    const kassaDeskId = String(searchParams.get('kassaDeskId') || searchParams.get('kassa_desk_id') || '').trim();
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

    if (kassaDeskId) {
      setFilterKassaDeskId(kassaDeskId);
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
      if (typeof parsed.filterKassaDeskId === 'string') setFilterKassaDeskId(parsed.filterKassaDeskId);
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
        filterKassaDeskId,
        filterFlightId,
        filterCurrency,
        dateFrom,
        dateTo,
      };
      localStorage.setItem(TRANSACTIONS_PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // ignore
    }
  }, [canFilterFirm, dateFrom, dateTo, filterCurrency, filterFirmId, filterFlightId, filterKassaDeskId, filterType, prefsReady, transactionsView]);

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

  useEffect(() => {
    if (!payKassaDeskId && filterKassaDeskId) {
      setPayKassaDeskId(filterKassaDeskId);
    }
  }, [filterKassaDeskId, payKassaDeskId]);

  useEffect(() => {
    if (selectedPayFirm?.currency) {
      setPaymentCurrencyCode(selectedPayFirm.currency);
    }
  }, [selectedPayFirm?.currency]);

  useEffect(() => {
    if (canFilterFirm && !cashFirmId && filterFirmId) {
      setCashFirmId(filterFirmId);
    }
  }, [canFilterFirm, cashFirmId, filterFirmId]);

  useEffect(() => {
    if (!cashKassaDeskId && filterKassaDeskId) {
      setCashKassaDeskId(filterKassaDeskId);
    }
  }, [filterKassaDeskId, cashKassaDeskId]);

  const submitPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (recordingPayment) return;

    const method = String(payMethod || '').trim().toLowerCase();
    const currency = (payCurrency === 'OTHER' ? payOtherCurrency : payCurrency).trim().toUpperCase();
    const amount = payAmount.trim();
    const flightId = payFlightId.trim();

    if (canFilterFirm && !payFirmId) {
      toast.error(tr('Select a firm for this payment', "Ushbu to'lov uchun firmangizni tanlang"));
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

    if (!['cash', 'card', 'bank'].includes(method)) {
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

    try {
      setRecordingPayment(true);

      const body: any = {
        amount,
        currency,
        method,
        metadata,
      };
      if (method === 'card') body.paymentCardId = payCardId;
      if (canFilterFirm) body.firmId = payFirmId;
      if (flightId) body.flightId = flightId;
      if (payAllocationId.trim()) body.allocationId = payAllocationId.trim();
      if (payKassaDeskId) body.kassaDeskId = payKassaDeskId;

      await api.post('/payments', body);
      toast.success(tr('Payment recorded', "To'lov qayd etildi"));

      setPayAmount('');
      setPayAllocationId('');
      setPayCardId('');
      setPayCardReference('');
      setPayReference('');

      setPage(1);
      setReloadKey((k) => k + 1);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || tr('Failed to record payment', "To'lovni qayd etib bo'lmadi"));
    } finally {
      setRecordingPayment(false);
    }
  };

  const submitCashMovement = async (e: FormEvent) => {
    e.preventDefault();
    if (recordingCash) return;

    const amount = cashAmount.trim();
    if (canFilterFirm && !cashFirmId) {
      toast.error(tr('Select a firm', 'Firmani tanlang'));
      return;
    }
    if (!amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      toast.error(tr('Enter a valid amount', 'To\'g\'ri summani kiriting'));
      return;
    }
    if (!cashDate) {
      toast.error(tr('Select a date', 'Sanani tanlang'));
      return;
    }

    try {
      setRecordingCash(true);
      await api.post('/transactions/cash', {
        flow: cashFlow,
        businessDate: cashDate,
        firmId: cashFirmId,
        counterpartyFirmId: cashCounterpartyFirmId || undefined,
        amount,
        currency: selectedCashFirm?.currency || 'UZS',
        note: cashNote.trim() || undefined,
        flightId: cashFlightId || undefined,
        kassaDeskId: cashKassaDeskId || undefined,
      });
      toast.success(cashFlow === 'IN' ? tr('Cash income recorded', 'Kirim qayd etildi') : tr('Cash expense recorded', 'Chiqim qayd etildi'));
      setCashAmount('');
      setCashNote('');
      setCashFlightId('');
      setCashCounterpartyFirmId('');
      setPage(1);
      setReloadKey((k) => k + 1);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || tr('Failed to record cash movement', 'Kassa harakatini qayd etib bo\'lmadi'));
    } finally {
      setRecordingCash(false);
    }
  };

  useEffect(() => {
    if (!prefsReady) return;
    const fetchTransactions = async () => {
      try {
        setLoading(true);
        const query = new URLSearchParams();
        if (filterType) query.append('type', filterType.toUpperCase());
        if (filterOperationType) query.append('operationType', filterOperationType);
        if (canFilterFirm && filterFirmId) query.append('firmId', filterFirmId);
        if (filterKassaDeskId) query.append('kassaDeskId', filterKassaDeskId);
        if (filterFlightId) query.append('flightId', filterFlightId);
        if (filterCurrency.trim()) query.append('currency', filterCurrency.trim().toUpperCase());
        if (filterSourceMode) query.append('sourceMode', filterSourceMode);
        if (filterStatus) query.append('status', filterStatus);
        if (filterPaymentMethod) query.append('paymentMethod', filterPaymentMethod);
        if (filterPaymentCardId) query.append('paymentCardId', filterPaymentCardId);
        if (filterAllocationId.trim()) query.append('allocationId', filterAllocationId.trim());
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
  }, [prefsReady, filterType, filterOperationType, filterFirmId, filterKassaDeskId, filterFlightId, filterCurrency, filterSourceMode, filterStatus, filterPaymentMethod, filterPaymentCardId, filterAllocationId, dateFrom, dateTo, page, limit, canFilterFirm, reloadKey, tr]);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [flightsRes, firmsRes, desksRes, cardsRes] = await Promise.all([
          api.get('/flights'),
          canCreateTransaction ? api.get('/firms') : Promise.resolve({ data: [] }),
          api.get('/kassa/desks'),
          api.get('/kassa/cards'),
        ]);

        const flights = Array.isArray(flightsRes.data) ? flightsRes.data : [];
        setFlightOptions(flights);

        const firms = Array.isArray(firmsRes.data) ? firmsRes.data : [];
        setFirmOptions(firms);

        const desks = Array.isArray(desksRes.data) ? desksRes.data : [];
        setDeskOptions(desks);

        const cards = Array.isArray(cardsRes.data) ? cardsRes.data : [];
        setPaymentCards(cards);
      } catch {
        // Non-fatal; filters can still be used via manual inputs.
      }
    };

    loadOptions();
  }, [canCreateTransaction]);

  const getTransactionTypeLabel = (type?: string, direction?: string) => {
    const normalized = String(type || '').trim().toUpperCase();
    const normalizedDirection = String(direction || '').trim().toUpperCase();
    if (normalized === 'ADJUSTMENT' && normalizedDirection === 'KASSA_IN') return tr('Income', 'Kirim');
    if (normalized === 'ADJUSTMENT' && normalizedDirection === 'KASSA_OUT') return tr('Expense', 'Chiqim');
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

  const getTransactionTypeHelp = (type?: string, direction?: string) => {
    const normalized = String(type || '').trim().toUpperCase();
    const normalizedDirection = String(direction || '').trim().toUpperCase();
    if (normalized === 'ADJUSTMENT' && normalizedDirection === 'KASSA_IN') return tr('Cash income', 'Kassa kirim');
    if (normalized === 'ADJUSTMENT' && normalizedDirection === 'KASSA_OUT') return tr('Cash expense', 'Kassa chiqim');
    if (normalized === 'SALE') return tr('Ticket sale (revenue)', 'Chipta sotuv (daromad)');
    if (normalized === 'PAYABLE') return tr('Debt created (firm owes)', 'Qarz yaratildi (firma qarzdor)');
    if (normalized === 'PAYMENT') return tr('Payment received/recorded', "To'lov qabul qilindi/qayd etildi");
    if (normalized === 'ADJUSTMENT') return tr('Manual correction entry', 'Qo\'lda kiritilgan tuzatish');
    return normalized || String(type || '');
  };

  const hasActiveFilters = Boolean(
    filterType ||
    filterOperationType ||
    (canFilterFirm && filterFirmId) ||
    filterKassaDeskId ||
    filterFlightId ||
    filterCurrency.trim() ||
    filterSourceMode || filterStatus || filterPaymentMethod || filterPaymentCardId || filterAllocationId.trim() ||
    dateFrom ||
    dateTo,
  );

  const clearFilters = () => {
    setFilterType('');
    setFilterOperationType('');
    setFilterFirmId('');
    setFilterKassaDeskId('');
    setFilterFlightId('');
    setFilterCurrency('');
    setFilterSourceMode('');
    setFilterStatus('');
    setFilterPaymentMethod('');
    setFilterPaymentCardId('');
    setFilterAllocationId('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const getBalanceDelta = (tx: any) => {
    const type = String(tx?.type || '').trim().toUpperCase();
    const amount = Number(tx?.baseAmount || tx?.base_amount || 0);
    if (!Number.isFinite(amount)) return 0;
    if (tx?.sourceMode === 'FINANCIAL_MODULE' || tx?.sourceMode === 'REVERSAL') {
      if (tx.sourceAccountId && !tx.destinationAccountId) return -amount;
      if (!tx.sourceAccountId && tx.destinationAccountId) return amount;
      return 0;
    }
    if (type === 'PAYMENT') return amount;
    if (type === 'ADJUSTMENT' && tx?.direction === 'KASSA_IN') return amount;
    if (type === 'ADJUSTMENT' && tx?.direction === 'KASSA_OUT') return -amount;
    if (type === 'PAYABLE' || type === 'ALLOCATION') return -amount;
    if (type === 'REFUND' || type === 'ADJUSTMENT') return amount;
    return 0;
  };

  const getNativeBalanceDelta = (tx: any) => {
    const baseDelta = getBalanceDelta(tx);
    const baseAmount = Number(tx?.baseAmount || tx?.base_amount || 0);
    const originalAmount = Number(tx?.originalAmount || tx?.original_amount || 0);
    return baseAmount ? (baseDelta / baseAmount) * originalAmount : 0;
  };

  const searchText = quickSearch.trim().toLowerCase();
  const visibleTransactions = useMemo(() => {
    const rows = transactions.filter((t) => {
      if (!searchText) return true;
      const meta = t.metadata && typeof t.metadata === 'object' ? t.metadata : {};
      const haystack = [
        t.id,
        t.type,
        t.operationType,
        t.currency,
        t.firm?.name,
        t.firmId,
        t.firm_id,
        t.flight?.flightNumber,
        t.flightId,
        t.flight_id,
        t.kassaDesk?.name,
        t.kassaDeskId,
        meta.transaction_reference,
        meta.reference,
        meta.note,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(searchText);
    });

    const chronological = [...rows].sort((a, b) => {
      const ad = new Date(a.createdAt || a.created_at).getTime();
      const bd = new Date(b.createdAt || b.created_at).getTime();
      return ad - bd;
    });

    let running = 0;
    const runningById = new Map<string, number>();
    for (const tx of chronological) {
      running += getBalanceDelta(tx);
      runningById.set(String(tx.id), running);
    }

    return rows.map((tx) => ({ tx, runningBalance: runningById.get(String(tx.id)) || 0 }));
  }, [searchText, transactions]);

  const pageTotals = visibleTransactions.reduce<Record<string, { debit: number; credit: number; balance: number }>>(
    (acc, row) => {
      const currency = String(row.tx.currency || 'UZS').toUpperCase();
      const totals = acc[currency] || { debit: 0, credit: 0, balance: 0 };
      const delta = getNativeBalanceDelta(row.tx);
      if (delta < 0) totals.debit += Math.abs(delta);
      if (delta > 0) totals.credit += delta;
      totals.balance += delta;
      acc[currency] = totals;
      return acc;
    },
    {},
  );
  const formatNativeTotals = (field: 'debit' | 'credit' | 'balance') =>
    ['UZS', 'USD'].map((currency) => `${(pageTotals[currency]?.[field] || 0).toLocaleString()} ${currency}`).join(' · ');

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <h2 className="text-2xl font-bold text-foreground">{tr('Transactions', 'Tranzaksiyalar')}</h2>
        <ExportActions filename="ado-tranzaksiyalar" sheet={{
          name: 'Tranzaksiyalar',
          columns: [{ header: 'Sana', key: 'date' }, { header: 'Turi', key: 'type' }, { header: 'Firma', key: 'firm' }, { header: 'Summa', key: 'amount' }, { header: 'Valyuta', key: 'currency' }, { header: 'Yo‘nalish', key: 'direction' }, { header: 'To‘lov usuli', key: 'method' }, { header: 'Kim kiritdi', key: 'creator' }, { header: 'Izoh', key: 'note' }],
          rows: transactions.map((transaction) => ({ date: String(transaction.createdAt || '').slice(0, 10), type: transaction.type || '', firm: transaction.firm?.name || '', amount: Number(transaction.originalAmount || 0), currency: transaction.currency || '', direction: transaction.direction || '', method: transaction.paymentMethod || '', creator: transaction.createdBy?.fullName || transaction.createdBy?.email || '', note: transaction.metadata?.note || transaction.metadata?.description || '' })),
        }} />
      </div>

      <CollapsibleCard collapsible tone="finance" title={tr('Firm accounts', 'Firma hisoblari')} description={tr('Cash desks, shared cards, bank and owner accounts with separate balances.', 'Kassalar, umumiy kartalar, bank va ta\'sischi hisoblari alohida qoldiq bilan.')} defaultOpen storageKey="firm-financial-accounts">
        {canManageAccounts && <form onSubmit={createAccount} className="operation-form form-grid mb-4">
          <label className="form-field--wide"><span className="compact-label">{tr('Account name', 'Hisob nomi')}</span><input name="accountName" autoComplete="off" className="compact-control" placeholder={tr('For example: Main bank', 'Masalan: Asosiy bank')} value={accountDraft.name} onChange={(e) => setAccountDraft({ ...accountDraft, name: e.target.value })} required /></label>
          <label><span className="compact-label">{tr('Account type', 'Hisob turi')}</span><select name="accountType" className="compact-control" value={accountDraft.type} onChange={(e) => setAccountDraft({ ...accountDraft, type: e.target.value })}><option value="BANK_ACCOUNT">{tr('Bank account', 'Bank hisobi')}</option><option value="FOUNDER_ACCOUNT">{tr('Founder account', 'Ta\'sischi hisobi')}</option><option value="ADVANCE_ACCOUNT">{tr('Advance account', 'Avans hisobi')}</option><option value="CLEARING_ACCOUNT">{tr('Clearing account', 'Kliring hisobi')}</option><option value="OTHER_ACCOUNT">{tr('Other', 'Boshqa')}</option></select></label>
          <label className="form-field--compact"><span className="compact-label">{tr('Currency', 'Valyuta')}</span><select name="accountCurrency" className="compact-control" value={accountDraft.currency} onChange={(e) => setAccountDraft({ ...accountDraft, currency: e.target.value })}><option>UZS</option><option>USD</option></select></label>
          <label className="form-field--compact"><span className="compact-label">{tr('Opening balance', 'Boshlang‘ich qoldiq')}</span><input name="accountOpeningBalance" autoComplete="off" inputMode="decimal" className="compact-control text-right" type="number" step="0.01" value={accountDraft.openingBalance} onChange={(e) => setAccountDraft({ ...accountDraft, openingBalance: e.target.value })} /></label>
          {accountDraft.type === 'BANK_ACCOUNT' && <>
            <label><span className="compact-label">{tr('Bank name', 'Bank nomi')}</span><input className="compact-control" value={accountDraft.bankName} onChange={(e) => setAccountDraft({ ...accountDraft, bankName: e.target.value })} /></label>
            <label><span className="compact-label">{tr('Account number', 'Hisob raqami')}</span><input className="compact-control" value={accountDraft.accountNumber} onChange={(e) => setAccountDraft({ ...accountDraft, accountNumber: e.target.value })} placeholder={tr('Only the last 4 digits are stored', 'Faqat oxirgi 4 raqam saqlanadi')} /></label>
            <label><span className="compact-label">MFO</span><input className="compact-control" value={accountDraft.bankCode} onChange={(e) => setAccountDraft({ ...accountDraft, bankCode: e.target.value })} /></label>
            <label><span className="compact-label">SWIFT</span><input className="compact-control" value={accountDraft.swiftCode} onChange={(e) => setAccountDraft({ ...accountDraft, swiftCode: e.target.value })} /></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={accountDraft.isPrimary} onChange={(e) => setAccountDraft({ ...accountDraft, isPrimary: e.target.checked })} /> <span>{tr('Primary account', 'Asosiy hisob')}</span></label>
          </>}
          <ActionButtons
            cancelLabel={tr('Cancel', 'Bekor qilish')}
            confirmLabel={tr('Create account', 'Hisob yaratish')}
            busyLabel={tr('Creating...', 'Yaratilmoqda...')}
            busy={savingAccount}
            canConfirm={Boolean(accountDraft.name.trim() && /^[A-Z]{3}$/.test(accountDraft.currency.trim().toUpperCase()) && Number.isFinite(Number(accountDraft.openingBalance)))}
            onCancel={() => setAccountDraft({ name: '', type: 'BANK_ACCOUNT', currency: 'UZS', openingBalance: '0', bankName: '', accountNumber: '', bankCode: '', swiftCode: '', isPrimary: false })}
          />
        </form>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{accounts.map((account) => <div key={account.id} data-account-type={account.type} className="account-card p-4"><div className="text-xs font-semibold uppercase tracking-wide text-muted">{account.type}</div><div className="mt-1 font-semibold">{account.bankName ? `${account.bankName} · ` : ''}{account.name}{account.accountNumberMasked ? ` ${account.accountNumberMasked}` : ''}</div><div className="data-value mt-3 text-lg font-semibold">{Number(account.balance || 0).toLocaleString()} {account.currency}</div></div>)}</div>
        {canManageAccounts && <form onSubmit={createAccountTransaction} className="operation-form form-grid mt-4">
          <div className="form-heading"><div><h3 className="form-heading__title">{tr('Record an account movement', 'Hisob harakatini qayd etish')}</h3><p className="form-heading__description">{tr('Use this for owner capital, bank operations and other non-Kassa movements.', 'Ta’sischi mablag‘i, bank operatsiyasi va Kassa bo‘lmagan boshqa harakatlar uchun ishlating.')}</p></div></div>
          <label className="form-field--wide"><span className="compact-label">{tr('Operation type', 'Operatsiya turi')}</span><select className="compact-control" value={accountTx.operationType} onChange={(e) => setAccountTx({ ...emptyFinanceDraft, operationType: e.target.value })}>{FINANCE_OPERATION_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {['BANK_EXPENSE', 'BANK_TO_BANK_TRANSFER', 'CREDITOR_PAYMENT_MADE', 'ADVANCE_PAID', 'BANK_FEE', 'CURRENCY_EXCHANGE'].includes(accountTx.operationType) && <label className="form-field--wide"><span className="compact-label">{tr('From account', 'Qaysi bank hisobidan')}</span><select className="compact-control" value={accountTx.sourceAccountId} onChange={(e) => setAccountTx({ ...accountTx, sourceAccountId: e.target.value })} required><option value="">{tr('Select account', 'Hisobni tanlang')}</option>{accounts.filter((account) => !['CASH', 'CARD', 'CASH_DESK', 'PAYMENT_CARD'].includes(account.type)).map((account) => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}</select></label>}
          {['BANK_INCOME', 'BANK_TO_BANK_TRANSFER', 'DEBTOR_PAYMENT_RECEIVED', 'ADVANCE_RECEIVED', 'CURRENCY_EXCHANGE'].includes(accountTx.operationType) && <label className="form-field--wide"><span className="compact-label">{tr('To account', 'Qaysi bank hisobiga')}</span><select className="compact-control" value={accountTx.destinationAccountId} onChange={(e) => setAccountTx({ ...accountTx, destinationAccountId: e.target.value })} required><option value="">{tr('Select account', 'Hisobni tanlang')}</option>{accounts.filter((account) => !['CASH', 'CARD', 'CASH_DESK', 'PAYMENT_CARD'].includes(account.type)).map((account) => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}</select></label>}
          {accountTx.operationType === 'BANK_INCOME' && <label><span className="compact-label">{tr('Economic purpose', 'Iqtisodiy mazmun')}</span><select className="compact-control" value={accountTx.economicPurpose} onChange={(e) => setAccountTx({ ...accountTx, economicPurpose: e.target.value })}><option value="">{tr('Select', 'Tanlang')}</option><option value="NEW_SALE">{tr('New sale revenue', 'Yangi sotuv daromadi')}</option><option value="ADVANCE_RECEIVED">{tr('Advance received', 'Olingan avans')}</option><option value="LOAN_REPAYMENT">{tr('Loan repayment', 'Qarz qaytarilishi')}</option><option value="FOUNDER_FUNDS">{tr('Founder funds', 'Ta’sischi mablag‘i')}</option><option value="OTHER">{tr('Other', 'Boshqa')}</option></select></label>}
          {['BANK_EXPENSE', 'BANK_FEE'].includes(accountTx.operationType) && <label><span className="compact-label">{tr('Expense category', 'Xarajat kategoriyasi')}</span><select className="compact-control" value={accountTx.expenseCategoryId} onChange={(e) => setAccountTx({ ...accountTx, expenseCategoryId: e.target.value })}><option value="">{tr('Select', 'Tanlang')}</option>{expenseCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>}
          {RECEIVABLE_OPERATIONS.includes(accountTx.operationType as any) && <label className="form-field--wide"><span className="compact-label">{tr('Receivable (optional)', 'Debitorlik qarzi')}</span><select className="compact-control" value={accountTx.receivableId} onChange={(e) => setAccountTx({ ...accountTx, receivableId: e.target.value })}><option value="">{tr('Select', 'Tanlang')}</option>{transactions.filter((row) => row.type === 'SALE' && !['REVERSED', 'CANCELLED'].includes(row.status)).map((row) => <option key={row.id} value={row.id}>{row.payerFirm?.name || row.firm?.name || row.id} · {Number(row.originalAmount).toLocaleString()} {row.currency}</option>)}</select></label>}
          {PAYABLE_OPERATIONS.includes(accountTx.operationType as any) && <label className="form-field--wide"><span className="compact-label">{tr('Payable (optional)', 'Kreditorlik qarzi')}</span><select className="compact-control" value={accountTx.payableId} onChange={(e) => setAccountTx({ ...accountTx, payableId: e.target.value })}><option value="">{tr('Select', 'Tanlang')}</option>{transactions.filter((row) => row.type === 'PAYABLE' && !['REVERSED', 'CANCELLED'].includes(row.status)).map((row) => <option key={row.id} value={row.id}>{row.receiverFirm?.name || row.firm?.name || row.id} · {Number(row.originalAmount).toLocaleString()} {row.currency}</option>)}</select></label>}
          <label className="form-field--wide"><span className="compact-label">{tr('Counterparty', 'Kontragent')}</span><input className="compact-control" value={accountTx.counterpartyName} onChange={(e) => setAccountTx({ ...accountTx, counterpartyName: e.target.value })} /></label>
          <label className="form-field--compact"><span className="compact-label">{tr('Amount', 'Summa')}</span><input name="accountTransactionAmount" autoComplete="off" inputMode="decimal" className="compact-control text-right" type="number" min="0.01" step="0.01" placeholder="0.00" value={accountTx.amount} onChange={(e) => setAccountTx({ ...accountTx, amount: e.target.value })} required /></label>
          {!accountTx.sourceAccountId && !accountTx.destinationAccountId && <label className="form-field--compact"><span className="compact-label">{tr('Currency', 'Valyuta')}</span><select className="compact-control" value={accountTx.currency} onChange={(e) => setAccountTx({ ...accountTx, currency: e.target.value })}><option>UZS</option><option>USD</option><option>EUR</option></select></label>}
          {accountTx.operationType === 'CURRENCY_EXCHANGE' && <label className="form-field--compact"><span className="compact-label">{tr('Amount received', 'Qabul qilingan summa')}</span><input className="compact-control text-right" type="number" min="0.01" step="0.01" value={accountTx.destinationAmount} onChange={(e) => setAccountTx({ ...accountTx, destinationAmount: e.target.value })} required /></label>}
          <label className="form-field--compact"><span className="compact-label">{tr('Payment date', 'To‘lov sanasi')}</span><input className="compact-control" type="date" value={accountTx.paymentDate} onChange={(e) => setAccountTx({ ...accountTx, paymentDate: e.target.value })} required /></label>
          <label><span className="compact-label">{tr('Bank document', 'Bank hujjati')}</span><input className="compact-control" value={accountTx.documentNumber} onChange={(e) => setAccountTx({ ...accountTx, documentNumber: e.target.value })} /></label>
          {SETTLEMENT_OPERATIONS.includes(accountTx.operationType as any) && <>
            <label><span className="compact-label">{tr('What closes the debt?', 'Qarzni nima bilan yopamiz?')}</span><select className="compact-control" value={accountTx.settlementInstrument} onChange={(e) => setAccountTx({ ...accountTx, settlementInstrument: e.target.value })}><option value="MUTUAL">O‘zaro qarzdorlik</option><option value="PUL">Pul</option><option value="TICKET">Bilet</option><option value="TOUR">Tur</option><option value="VISA">Visa</option><option value="HOTEL">Hotel</option><option value="PACKAGE">Paket</option><option value="SERVICE">Boshqa xizmat</option><option value="PRODUCT">Ombor mahsuloti</option><option value="ADVANCE">Avans</option><option value="OTHER">Boshqa</option></select></label>
            <label><span className="compact-label">{tr('Debt object', 'Qaysi qarz yopilyapti')}</span><select className="compact-control" value={accountTx.settlementSubjectType} onChange={(e) => setAccountTx({ ...accountTx, settlementSubjectType: e.target.value })}><option value="">Tanlang</option><option value="RECEIVABLE">Debitorlik</option><option value="PAYABLE">Kreditorlik</option><option value="INVOICE">Invoice</option><option value="FLIGHT">Reys</option><option value="ALLOCATION">Allocation</option><option value="TOUR">Tur</option><option value="SERVICE">Xizmat</option><option value="PURCHASE">Purchase</option><option value="SALE">Sale</option></select></label>
            <label><span className="compact-label">{tr('Subject ID', 'Hujjat ID')}</span><input className="compact-control" value={accountTx.settlementSubjectId} onChange={(e) => setAccountTx({ ...accountTx, settlementSubjectId: e.target.value })} /></label>
            <label><span className="compact-label">{tr('Agreement number', 'Shartnoma raqami')}</span><input className="compact-control" value={accountTx.contractNumber} onChange={(e) => setAccountTx({ ...accountTx, contractNumber: e.target.value })} /></label>
            <label className="form-field--full"><span className="compact-label">{tr('Settlement details', 'Settlement tafsilotlari')}</span><textarea className="compact-control" rows={2} value={accountTx.settlementDetails} onChange={(e) => setAccountTx({ ...accountTx, settlementDetails: e.target.value })} placeholder="Reys, RT/OW, segment, bilet soni, tur/xizmat/ombor mahsuloti miqdori va narxi" /></label>
          </>}
          {(accounts.find((account) => account.id === accountTx.sourceAccountId)?.currency === 'USD' || accounts.find((account) => account.id === accountTx.destinationAccountId)?.currency === 'USD') && <label className="form-field--compact"><span className="compact-label">{tr('Firm rate (optional)', 'Firma kursi (ixtiyoriy)')}</span><input name="accountTransactionExchangeRate" autoComplete="off" className="compact-control text-right" inputMode="decimal" placeholder={tr('For example: 12 700', 'Masalan: 12 700')} value={accountTx.exchangeRate} onChange={(e) => setAccountTx({ ...accountTx, exchangeRate: e.target.value })} /></label>}
          {['ACCOUNTING_ADJUSTMENT', 'OTHER_NON_CASH', 'DEBT_ASSIGNMENT', 'OVERPAYMENT_REALLOCATION'].includes(accountTx.operationType) && <><label><span className="compact-label">{tr('Debit account code', 'Debet schyot kodi')}</span><input className="compact-control" value={accountTx.debitAccountCode} onChange={(e) => setAccountTx({ ...accountTx, debitAccountCode: e.target.value })} /></label><label><span className="compact-label">{tr('Credit account code', 'Kredit schyot kodi')}</span><input className="compact-control" value={accountTx.creditAccountCode} onChange={(e) => setAccountTx({ ...accountTx, creditAccountCode: e.target.value })} /></label></>}
          <label className="form-field--full"><span className="compact-label">{tr('Note (optional)', 'Izoh (ixtiyoriy)')}</span><textarea name="accountTransactionNote" autoComplete="off" className="compact-control" rows={3} placeholder={tr('Describe this account movement…', 'Ushbu hisob harakatini batafsil yozing…')} value={accountTx.note} onChange={(e) => setAccountTx({ ...accountTx, note: e.target.value })} /></label>
          <div className="form-preview"><strong>{FINANCE_OPERATION_OPTIONS.find(([value]) => value === accountTx.operationType)?.[1]}</strong><br />{SETTLEMENT_OPERATIONS.includes(accountTx.operationType as any) ? tr('Bank/Kassa effect: 0 · P&L effect: 0', 'Bank/Kassa ta’siri: 0 · P&L ta’siri: 0') : `${Number(accountTx.amount || 0).toLocaleString()} ${accounts.find((a) => a.id === accountTx.sourceAccountId)?.currency || accounts.find((a) => a.id === accountTx.destinationAccountId)?.currency || accountTx.currency}`}</div>
          <ActionButtons
            cancelLabel={tr('Cancel', 'Bekor qilish')}
            confirmLabel={tr('Record', 'Qayd etish')}
            busyLabel={tr('Recording...', 'Qayd etilmoqda...')}
            busy={savingAccountTransaction}
            canConfirm={Boolean(Number(accountTx.amount) > 0 && accountTx.paymentDate)}
            onCancel={() => setAccountTx({ ...emptyFinanceDraft })}
          />
        </form>}
      </CollapsibleCard>

      {canCreateTransaction && (
        <CollapsibleCard
          tone="finance"
          title={tr('Record payment', "To'lovni qayd etish")}
          description={
            <>
              {tr('Creates a', 'Bu')}{' '}
              <span className="font-semibold">PAYMENT</span>{' '}
              {tr('transaction.', 'tranzaksiyasini yaratadi.')}{' '}
              {tr('The selected firm default currency is used automatically, and payments stay in that currency.', 'Tanlangan firmaning asosiy valyutasi avtomatik ishlatiladi va to\'lov shu valyutada qoladi.')}
            </>
          }
          defaultOpen={false}
          collapsible
          storageKey="jetstream-transactions-record-payment-open"
          className="shadow sm:rounded-lg"
        >
          <form onSubmit={submitPayment} className="operation-form form-grid">
          <div className="form-preview">{tr('From', 'Kimdan')}: {selectedPayFirm?.name || tr('Your firm', 'Sizning firmangiz')} → {tr('To', 'Kimga')}: {tr('Admin / airline', 'Admin / aviakompaniya')}</div>
          {canFilterFirm && (
            <div className="form-field form-field--wide">
              <label htmlFor="payFirm" className="compact-label">{tr('Firm', 'Firma')}</label>
              <select
                id="payFirm"
                value={payFirmId}
                onChange={(e) => setPayFirmId(e.target.value)}
                className="compact-control"
                required
              >
                <option value="">{tr('Select', 'Tanlang')}</option>
                {firmOptions.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}{f.currency ? ` (${f.currency})` : ''}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-field form-field--wide">
            <label htmlFor="payFlight" className="compact-label">{tr('Flight (optional)', 'Reys (ixtiyoriy)')}</label>
            <select
              id="payFlight"
              value={payFlightId}
              onChange={(e) => setPayFlightId(e.target.value)}
              className="compact-control"
            >
              <option value="">{tr('Firm deposit', 'Firma depoziti')}</option>
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

          <div className="form-field form-field--compact">
            <label htmlFor="payAmount" className="compact-label">{tr('Amount', 'Summa')}</label>
            <input
              id="payAmount"
              type="number"
              step="0.01"
              min="0.01"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder="0.00"
              className="compact-control"
              required
            />
          </div>

          <div className="form-field form-field--compact">
            <label htmlFor="payCurrency" className="compact-label">{tr('Currency', 'Valyuta')}</label>
            <select
              id="payCurrency"
              value={payCurrency}
              onChange={(e) => {
                setPayCurrency(e.target.value as any);
              }}
              className="compact-control"
              required
            >
              <option value="UZS">UZS</option>
              <option value="USD">USD</option>
              <option value="OTHER">{tr('Other', 'Boshqa')}</option>
            </select>
          </div>

          {payCurrency === 'OTHER' && (
            <div className="form-field form-field--compact">
              <label htmlFor="payOtherCurrency" className="compact-label">{tr('Other currency', 'Boshqa valyuta')}</label>
              <input
                id="payOtherCurrency"
                value={payOtherCurrency}
                onChange={(e) => setPayOtherCurrency(e.target.value)}
                placeholder={tr('e.g. EUR', 'masalan, EUR')}
                className="compact-control"
                required
              />
            </div>
          )}

          <div className="form-field form-field--compact">
            <label htmlFor="payMethod" className="compact-label">{tr('Method', 'Usul')}</label>
            <select
              id="payMethod"
              value={payMethod}
              onChange={(e) => {
                const next = e.target.value as 'cash' | 'card' | 'bank';
                setPayMethod(next);
                if (next === 'card' && selectedPayCard?.currency) setPaymentCurrencyCode(selectedPayCard.currency);
              }}
              className="compact-control"
              required
            >
              <option value="cash">{tr('Cash', 'Naqd')}</option>
              <option value="card">{tr('Card', 'Karta')}</option>
              <option value="bank">{tr('Bank transfer', 'Bank o‘tkazmasi')}</option>
            </select>
          </div>

          <label className="form-field--full">
            <span className="compact-label">{tr('Reference and payment note (optional)', 'To‘lov raqami va izoh (ixtiyoriy)')}</span>
            <textarea
              id="payReference"
              rows={3}
              value={payReference}
              onChange={(e) => setPayReference(e.target.value)}
              placeholder={tr('Receipt number, payment purpose or other details…', 'Kvitansiya raqami, to‘lov maqsadi yoki boshqa tafsilotlar…')}
              className="compact-control"
            />
          </label>

          <div className="form-field form-field--wide">
            <label htmlFor="payAllocationId" className="compact-label">{tr('Allocation ID (optional)', 'Ajratma ID (ixtiyoriy)')}</label>
            <input id="payAllocationId" value={payAllocationId} onChange={(e) => setPayAllocationId(e.target.value)} placeholder={tr('Links payment to debt', 'To‘lovni qarzga bog‘laydi')} className="compact-control" />
          </div>

          <div className="form-field form-field--wide">
            <label htmlFor="payKassaDesk" className="compact-label">{tr('Kassa desk', 'Kassa')}</label>
            <select
              id="payKassaDesk"
              value={payKassaDeskId}
              onChange={(e) => setPayKassaDeskId(e.target.value)}
              className="compact-control"
            >
              <option value="">{tr('Auto / none', 'Avto / yo‘q')}</option>
              {deskOptions.map((desk) => (
                <option key={desk.id} value={desk.id}>{desk.firm?.name ? `${desk.firm.name} · ` : ''}{desk.name}</option>
              ))}
            </select>
          </div>

          {payMethod === 'cash' && (
            <div className="form-field form-field--compact">
              <label htmlFor="payCashDate" className="compact-label">{tr('Cash date', 'Naqd sana')}</label>
              <input
                id="payCashDate"
                type="date"
                value={payCashDate}
                onChange={(e) => setPayCashDate(e.target.value)}
                className="compact-control"
                required
              />
            </div>
          )}

          {payMethod === 'card' && (
            <>
              <div className="form-field form-field--wide">
                <label htmlFor="payCardId" className="compact-label">{tr('Card', 'Karta')}</label>
                <select
                  id="payCardId"
                  value={payCardId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    const card = paymentCards.find((item) => item.id === nextId);
                    setPayCardId(nextId);
                    if (card?.currency) setPayCurrency(card.currency);
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

              <div className="form-field form-field--wide">
                <label htmlFor="payCardReference" className="compact-label">{tr('Transaction reference (optional)', 'Tranzaksiya raqami (ixtiyoriy)')}</label>
                <input
                  id="payCardReference"
                  value={payCardReference}
                  onChange={(e) => setPayCardReference(e.target.value)}
                  placeholder={tr('Bank / gateway reference', 'Bank / to\'lov tizimi raqami')}
                  className="compact-control"
                />
              </div>
            </>
          )}

          <div className="form-field--full">
            <div className="form-preview mb-3">
              {tr('Preview:', 'Ko\'rinish:')} {Number.isFinite(payAmountNum) && payAmountNum > 0 ? payAmountNum.toFixed(2) : '0.00'} {payCurrencyCode || 'UZS'}
              {' · '}
              {tr('No exchange conversion will be applied.', 'Valyuta kursiga aylantirilmaydi.')}
            </div>

            <ActionButtons
              cancelLabel={tr('Cancel', 'Bekor qilish')}
              confirmLabel={tr('Record payment', "To'lovni qayd etish")}
              busyLabel={tr('Recording...', 'Qayd etilmoqda...')}
              busy={recordingPayment}
              canConfirm={Boolean(
                (!canFilterFirm || payFirmId)
                && payAmountNum > 0
                && /^[A-Z]{3}$/.test(payCurrencyCode)
                && (payMethod !== 'cash' || payCashDate)
                && (payMethod !== 'card' || (payCardId && (!selectedPayCard?.currency || selectedPayCard.currency === payCurrencyCode)))
              )}
              onCancel={resetPaymentDraft}
            />
          </div>
          </form>
        </CollapsibleCard>
      )}

      {canCreateTransaction && (
        <CollapsibleCard
          tone="success"
          title={tr('Cash income / expense', 'Kassa kirim / chiqim')}
          description={tr('Create a manual cash-in or cash-out transaction.', 'Qo\'lda kassa kirim yoki chiqim tranzaksiyasini yarating.')}
          defaultOpen={false}
          collapsible
          storageKey="jetstream-transactions-cash-movement-open"
          className="shadow sm:rounded-lg"
        >
          <form onSubmit={submitCashMovement} className="operation-form form-grid">
            <div className="form-field form-field--compact">
              <label htmlFor="cashFlow" className="compact-label">{tr('Type', 'Turi')}</label>
              <select id="cashFlow" value={cashFlow} onChange={(e) => setCashFlow(e.target.value as 'IN' | 'OUT')} className="compact-control">
                <option value="IN">{tr('Income', 'Kirim')}</option>
                <option value="OUT">{tr('Expense', 'Chiqim')}</option>
              </select>
            </div>
            {canFilterFirm && <div className="form-field form-field--wide">
              <label htmlFor="cashFirm" className="compact-label">{tr('Firm', 'Firma')}</label>
              <select id="cashFirm" value={cashFirmId} onChange={(e) => setCashFirmId(e.target.value)} className="compact-control" required>
                <option value="">{tr('Select', 'Tanlang')}</option>
                {firmOptions.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}{f.currency ? ` (${f.currency})` : ''}</option>
                ))}
              </select>
            </div>}
            <div className="form-field form-field--wide">
              <label htmlFor="cashCounterparty" className="compact-label">{cashFlow === 'IN' ? tr('From whom?', 'Kimdan?') : tr('To whom?', 'Kimga?')}</label>
              <select id="cashCounterparty" value={cashCounterpartyFirmId} onChange={(e) => setCashCounterpartyFirmId(e.target.value)} className="compact-control">
                <option value="">{tr('Other / not specified', 'Boshqa / ko\'rsatilmagan')}</option>
                {firmOptions.filter((f) => f.id !== (cashFirmId || user?.firmId)).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div className="form-field form-field--wide">
              <label htmlFor="cashKassaDesk" className="compact-label">{tr('Kassa desk', 'Kassa')}</label>
              <select
                id="cashKassaDesk"
                value={cashKassaDeskId}
                onChange={(e) => setCashKassaDeskId(e.target.value)}
                className="compact-control"
              >
                <option value="">{tr('Auto / none', 'Avto / yo‘q')}</option>
                {deskOptions.map((desk) => (
                  <option key={desk.id} value={desk.id}>{desk.firm?.name ? `${desk.firm.name} · ` : ''}{desk.name}</option>
                ))}
              </select>
            </div>
            <div className="form-field form-field--wide">
              <label htmlFor="cashFlight" className="compact-label">{tr('Flight (optional)', 'Reys (ixtiyoriy)')}</label>
              <select id="cashFlight" value={cashFlightId} onChange={(e) => setCashFlightId(e.target.value)} className="compact-control">
                <option value="">{tr('No flight', 'Reyssiz')}</option>
                {flightOptions.map((flight) => {
                  const id = flight.id || flight.flight_id;
                  return id ? <option key={id} value={id}>{flight.flightNumber || id}</option> : null;
                })}
              </select>
            </div>
            <div className="form-field form-field--compact">
              <label htmlFor="cashDate" className="compact-label">{tr('Date', 'Sana')}</label>
              <input id="cashDate" type="date" value={cashDate} onChange={(e) => setCashDate(e.target.value)} className="compact-control" required />
            </div>
            <div className="form-field form-field--compact">
              <label htmlFor="cashAmount" className="compact-label">{tr('Amount', 'Summa')} ({selectedCashFirm?.currency || 'UZS'})</label>
              <input id="cashAmount" type="number" inputMode="decimal" min="0.01" step="0.01" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} className="compact-control" required />
            </div>
            <label className="form-field--full"><span className="compact-label">{tr('Note and cash details', 'Izoh va kassa tafsilotlari')}</span><textarea id="cashNote" rows={3} value={cashNote} onChange={(e) => setCashNote(e.target.value)} placeholder={tr('Describe the purpose of this cash movement…', 'Ushbu kassa harakatining maqsadini batafsil yozing…')} className="compact-control" /></label>
            <ActionButtons
              cancelLabel={tr('Cancel', 'Bekor qilish')}
              confirmLabel={tr('Record', 'Qayd etish')}
              busyLabel={tr('Recording...', 'Qayd etilmoqda...')}
              busy={recordingCash}
              canConfirm={Boolean((!canFilterFirm || cashFirmId) && Number(cashAmount) > 0 && cashDate)}
              onCancel={resetCashDraft}
            />
          </form>
        </CollapsibleCard>
      )}

      <div className="border border-border bg-surface">
        <div className="border-b border-border px-3 py-2">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(220px,1fr)_repeat(5,minmax(120px,auto))]">
            <div>
              <label htmlFor="quickSearch" className="compact-label">{tr('Search', 'Qidirish')}</label>
              <input
                id="quickSearch"
                value={quickSearch}
                onChange={(e) => setQuickSearch(e.target.value)}
                placeholder={tr('Search this table', 'Jadvaldan qidirish')}
                className="compact-control"
              />
            </div>
          <div>
            <label htmlFor="dateFrom" className="compact-label">{tr('Date from', 'Sana (dan)')}</label>
            <input
              id="dateFrom"
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="compact-control"
            />
          </div>

          <div>
            <label htmlFor="dateTo" className="compact-label">{tr('Date to', 'Sana (gacha)')}</label>
            <input
              id="dateTo"
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="compact-control"
            />
          </div>

          {canFilterFirm && (
            <div>
              <label htmlFor="firm" className="compact-label">{tr('Firm', 'Firma')}</label>
              <select
                id="firm"
                value={filterFirmId}
                onChange={(e) => { setFilterFirmId(e.target.value); setPage(1); }}
                className="compact-control"
              >
                <option value="">{tr('All', 'Barchasi')}</option>
                {firmOptions.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="kassaDesk" className="compact-label">{tr('Kassa desk', 'Kassa')}</label>
            <select
              id="kassaDesk"
              value={filterKassaDeskId}
              onChange={(e) => { setFilterKassaDeskId(e.target.value); setPage(1); }}
              className="compact-control"
            >
              <option value="">{tr('All', 'Barchasi')}</option>
              {deskOptions.map((desk) => (
                <option key={desk.id} value={desk.id}>
                  {desk.firm?.name ? `${desk.firm.name} · ` : ''}{desk.name}{desk.code ? ` (${desk.code})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="flight" className="compact-label">{tr('Flight', 'Reys')}</label>
            <select
              id="flight"
              value={filterFlightId}
              onChange={(e) => { setFilterFlightId(e.target.value); setPage(1); }}
              className="compact-control"
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
            <label htmlFor="type" className="compact-label">{tr('Type', 'Turi')}</label>
            <select
              id="type"
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
              className="compact-control"
            >
              <option value="">{tr('All', 'Barchasi')}</option>
              <option value="sale">{tr('Sale', 'Sotuv')}</option>
              <option value="payable">{tr('Payable (Debt)', 'Qarz (qarzdorlik)')}</option>
              <option value="payment">{tr('Payment', "To'lov")}</option>
              <option value="adjustment">{tr('Adjustment', 'Korreksiya')}</option>
            </select>
          </div>

          <div>
            <label htmlFor="currency" className="compact-label">{tr('Currency', 'Valyuta')}</label>
            <input
              id="currency"
              value={filterCurrency}
              onChange={(e) => { setFilterCurrency(e.target.value); setPage(1); }}
              placeholder={tr('e.g. USD', 'masalan, USD')}
              className="compact-control"
            />
          </div>
          <div><label className="compact-label">{tr('Operation type', 'Operatsiya turi')}</label><select className="compact-control" value={filterOperationType} onChange={(e) => { setFilterOperationType(e.target.value); setPage(1); }}><option value="">{tr('All', 'Barchasi')}</option>{FINANCE_OPERATION_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div><label className="compact-label">{tr('Source', 'Manba')}</label><select className="compact-control" value={filterSourceMode} onChange={(e) => { setFilterSourceMode(e.target.value); setPage(1); }}><option value="">{tr('All', 'Barchasi')}</option><option value="AUTO_TICKET_SALE">AUTO_TICKET_SALE</option><option value="AUTO_TOUR_SALE">AUTO_TOUR_SALE</option><option value="HISTORICAL_IMPORT">HISTORICAL_IMPORT</option><option value="MANUAL_CASH">MANUAL_CASH</option><option value="MANUAL_CARD">MANUAL_CARD</option><option value="MANUAL_BANK">MANUAL_BANK</option><option value="FINANCIAL_MODULE">FINANCIAL_MODULE</option><option value="REVERSAL">REVERSAL</option></select></div>
          <div><label className="compact-label">{tr('Status', 'Holat')}</label><select className="compact-control" value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}><option value="">{tr('All', 'Barchasi')}</option><option value="CONFIRMED">CONFIRMED</option><option value="APPLIED">APPLIED</option><option value="PENDING">PENDING</option><option value="REVERSED">REVERSED</option></select></div>
          <div><label className="compact-label">{tr('Payment method', 'To‘lov usuli')}</label><select className="compact-control" value={filterPaymentMethod} onChange={(e) => { setFilterPaymentMethod(e.target.value); setPage(1); }}><option value="">{tr('All', 'Barchasi')}</option><option value="cash">{tr('Cash', 'Naqd')}</option><option value="card">{tr('Card', 'Karta')}</option><option value="bank">{tr('Bank', 'Bank')}</option></select></div>
          <div><label className="compact-label">{tr('Payment card', 'To‘lov kartasi')}</label><select className="compact-control" value={filterPaymentCardId} onChange={(e) => { setFilterPaymentCardId(e.target.value); setPage(1); }}><option value="">{tr('All', 'Barchasi')}</option>{paymentCards.map((card) => <option key={card.id} value={card.id}>{card.ownerName} · {card.cardNumber}</option>)}</select></div>
          <div><label className="compact-label">{tr('Allocation ID', 'Ajratma ID')}</label><input className="compact-control" value={filterAllocationId} onChange={(e) => { setFilterAllocationId(e.target.value); setPage(1); }} /></div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={clearFilters}
              className="h-9 w-full border border-border bg-surface-2 px-3 text-sm font-semibold text-foreground hover:bg-surface"
            >
              {tr('Clear', 'Tozalash')}
            </button>
          </div>
          </div>
        </div>
        <div className="grid grid-cols-1 border-b border-border bg-surface-2 text-sm md:grid-cols-3">
          <div className="border-b border-border px-3 py-2 md:border-b-0 md:border-r">
            <span className="text-muted">{tr('Debit', 'Chiqim')}: </span>
            <span className="font-mono font-bold text-red-600">{formatNativeTotals('debit')}</span>
          </div>
          <div className="border-b border-border px-3 py-2 md:border-b-0 md:border-r">
            <span className="text-muted">{tr('Credit', 'Kirim')}: </span>
            <span className="font-mono font-bold text-green-700">{formatNativeTotals('credit')}</span>
          </div>
          <div className="px-3 py-2">
            <span className="text-muted">{tr('Balance', 'Balans')}: </span>
            <span className="font-mono font-bold text-green-700">{formatNativeTotals('balance')}</span>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-border overflow-hidden">
        {transactionsView === 'list' || transactionsView === 'boxes' ? (
          <div className="overflow-x-auto scroller-minimal">
          <table className="excel-table">
            <thead>
              <tr>
                <th>{tr('Date', 'Sana')}</th>
                <th>{tr('Description', 'Tavsif')}</th>
                {canFilterFirm && <th>{tr('Firm', 'Firma')}</th>}
                <th>{tr('Kassa desk', 'Kassa')}</th>
                <th>{tr('Flight', 'Reys')}</th>
                <th>{tr('Payer → Receiver', 'To‘lovchi → Qabul qiluvchi')}</th>
                <th>{tr('Source / status', 'Manba / holat')}</th>
                <th>RT / OW</th>
                <th className="text-right">{tr('Debit', 'Chiqim')}</th>
                <th className="text-right">{tr('Credit', 'Kirim')}</th>
                <th className="text-right">{tr('Balance', 'Balans')}</th>
                <th>{tr('Created by', 'Kim kiritdi')}</th>
                <th>{tr('Reference', 'Izoh')}</th>
                <th>{tr('Action', 'Amal')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={canFilterFirm ? 14 : 13} className="text-center">{tr('Loading...', 'Yuklanmoqda...')}</td></tr>
              ) : visibleTransactions.map(({ tx: t, runningBalance }) => {
                const delta = getBalanceDelta(t);
                const debit = delta < 0 ? Math.abs(delta) : 0;
                const credit = delta > 0 ? delta : 0;
                return (
                  <tr key={t.id}>
                    <td className="text-muted">{format(new Date(t.createdAt || t.created_at), 'yyyy-MM-dd HH:mm')}</td>
                    <td className="font-medium" title={getTransactionTypeHelp(t.type, t.direction)}>
                      {FINANCE_OPERATION_OPTIONS.find(([value]) => value === t.operationType)?.[1] || getTransactionTypeLabel(t.type, t.direction)}
                    </td>
                    {canFilterFirm && <td>{t.firm?.name || t.firmId || t.firm_id}</td>}
                    <td>{t.kassaDesk?.name || t.kassaDeskId || '-'}</td>
                    <td>{t.flight?.flightNumber || t.flightId || t.flight_id || '-'}</td>
                    <td><div className="text-xs"><strong>{t.payerFirm?.name || t.payerFirmId || '—'}</strong> → <strong>{t.receiverFirm?.name || t.receiverFirmId || '—'}</strong></div></td>
                    <td><div className="text-xs font-semibold">{t.sourceMode || 'MANUAL'}</div><div className="text-xs text-muted">{t.status || 'CONFIRMED'}{t.reversedTransactionId ? ' · REVERSAL' : ''}</div></td>
                    <td><div className="text-xs font-semibold">{t.metadata?.productType === 'ONE_WAY' ? `OW · ${t.metadata?.direction || ''}` : t.metadata?.productType === 'ROUND_TRIP' ? 'RT' : '—'}</div>{t.metadata?.segmentCount != null && <div className="text-xs text-muted">{t.metadata?.parentTicketCount || 0} / {t.metadata.segmentCount} {tr('segments', 'segment')}</div>}</td>
                    <td className="text-right font-mono font-semibold text-red-600">{debit ? debit.toFixed(0) : '-'}</td>
                    <td className="text-right font-mono font-semibold text-green-700">{credit ? credit.toFixed(0) : '-'}</td>
                    <td className={`text-right font-mono font-bold ${runningBalance < 0 ? 'text-red-600' : 'text-green-700'}`}>
                      {runningBalance.toFixed(0)}
                    </td>
                    <td>{t.createdBy?.fullName || t.createdBy?.email || '—'}</td>
                    <td className="text-muted">
                      {(() => {
                      const meta = t.metadata && typeof t.metadata === 'object' ? t.metadata : null;
                      const ref = meta ? (meta.transaction_reference || meta.reference || meta.note) : null;
                      return ref ? String(ref) : '-';
                      })()}
                    </td>
                    <td>
                      <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => router.push(`/transactions/detail?id=${t.id}`)}
                        className="border border-border bg-surface-2 px-2 py-1 text-xs font-semibold text-foreground hover:bg-surface"
                      >
                        {tr('View', "Ko'rish")}
                      </button>
                      {canChangeOwnDailyCash(t) &&
                        <button type="button" onClick={() => editOwnDailyCash(t)} className="border border-border bg-surface-2 px-2 py-1 text-xs font-semibold">{tr('Edit', 'Tahrir')}</button>
                      }
                      {t.sourceMode === 'FINANCIAL_MODULE' && t.status === 'APPLIED' && canDeleteTransaction(t) && <button type="button" onClick={() => reverseFinancialTransaction(t)} className="border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-700">Reversal</button>}
                      {t.sourceMode !== 'FINANCIAL_MODULE' && canDeleteTransaction(t) && <button type="button" onClick={() => deleteTransaction(t)} className="border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-600">{tr('Delete', "O'chirish")}</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && visibleTransactions.length === 0 && (
                <tr>
                  <td colSpan={canFilterFirm ? 14 : 13} className="text-center text-muted">
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
          </div>
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
                          title={getTransactionTypeHelp(t.type, t.direction)}
                        >
                          {getTransactionTypeLabel(t.type, t.direction)}
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
                        <div className="flex items-center justify-between gap-3"><span className="text-muted">{tr('Created by', 'Kim kiritdi')}</span><span>{t.createdBy?.fullName || t.createdBy?.email || '—'}</span></div>
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
