/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import CollapsibleCard from '@/components/ui/CollapsibleCard';
import { useSearchParams } from 'next/navigation';

type FlightOption = {
  id: string;
  flightNumber: string;
  departure: string;
  arrival: string;
};

type FirmOption = {
  id: string;
  name: string;
};

function toISODateOrNull(dateValue: string): string | null {
  if (!dateValue) return null;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

type ReportsScopePrefs = {
  selectedFlightId?: string;
  selectedFirmId?: string;
  dateFrom?: string;
  dateTo?: string;
};

const REPORTS_SCOPE_PREFS_KEY = 'jetstream-reports-scope';

function normalizeDateParam(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || '';
}

export default function ReportsPage() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { tr } = useLanguage();

  const role = String(user?.role || '').toLowerCase();
  const isFirm = role === 'firm';
  const isAdmin = role === 'admin' || role === 'superadmin';
  const canAccess = isAdmin || isFirm;
  const isSuperadmin = role === 'superadmin';

  const [flights, setFlights] = useState<FlightOption[]>([]);
  const [firms, setFirms] = useState<FirmOption[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [selectedFlightId, setSelectedFlightId] = useState<string>('');
  const [selectedFirmId, setSelectedFirmId] = useState<string>('');

  const [flightReport, setFlightReport] = useState<any>(null);
  const [firmReport, setFirmReport] = useState<any>(null);
  const [paymentsReport, setPaymentsReport] = useState<any>(null);
  const [transactionsReport, setTransactionsReport] = useState<any>(null);
  const [interactionsReport, setInteractionsReport] = useState<any>(null);

  const [loadingFlightReport, setLoadingFlightReport] = useState(false);
  const [loadingFirmReport, setLoadingFirmReport] = useState(false);
  const [loadingPaymentsReport, setLoadingPaymentsReport] = useState(false);
  const [loadingTransactionsReport, setLoadingTransactionsReport] = useState(false);
  const [loadingInteractionsReport, setLoadingInteractionsReport] = useState(false);

  const [prefsReady, setPrefsReady] = useState(false);
  const [lastAppliedQuery, setLastAppliedQuery] = useState('');

  const dateParams = useMemo(() => {
    const fromISO = toISODateOrNull(dateFrom);
    const toISO = toISODateOrNull(dateTo);
    return {
      dateFrom: fromISO || undefined,
      dateTo: toISO || undefined,
    };
  }, [dateFrom, dateTo]);

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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(REPORTS_SCOPE_PREFS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ReportsScopePrefs;

      if (typeof parsed.selectedFlightId === 'string') setSelectedFlightId(parsed.selectedFlightId);
      if (isAdmin && typeof parsed.selectedFirmId === 'string') setSelectedFirmId(parsed.selectedFirmId);
      if (typeof parsed.dateFrom === 'string') setDateFrom(parsed.dateFrom);
      if (typeof parsed.dateTo === 'string') setDateTo(parsed.dateTo);
    } catch {
      // ignore
    } finally {
      setPrefsReady(true);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!prefsReady) return;
    const signature = searchParams.toString();
    if (signature === lastAppliedQuery) return;
    setLastAppliedQuery(signature);

    const flightId = (searchParams.get('flightId') || searchParams.get('flight_id') || '').trim();
    const firmId = (searchParams.get('firmId') || searchParams.get('firm_id') || '').trim();
    const qDateFrom = normalizeDateParam(searchParams.get('dateFrom') || '');
    const qDateTo = normalizeDateParam(searchParams.get('dateTo') || '');

    if (flightId) setSelectedFlightId(flightId);
    if (isAdmin && firmId) setSelectedFirmId(firmId);
    if (qDateFrom) setDateFrom(qDateFrom);
    if (qDateTo) setDateTo(qDateTo);
  }, [isAdmin, lastAppliedQuery, prefsReady, searchParams]);

  useEffect(() => {
    if (!prefsReady) return;
    try {
      const prefs: ReportsScopePrefs = {
        selectedFlightId,
        selectedFirmId: isAdmin ? selectedFirmId : '',
        dateFrom,
        dateTo,
      };
      localStorage.setItem(REPORTS_SCOPE_PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // ignore
    }
  }, [dateFrom, dateTo, isAdmin, prefsReady, selectedFirmId, selectedFlightId]);

  useEffect(() => {
    if (!prefsReady) return;
    if (flights.length === 0) return;
    if (selectedFlightId && flights.some((f) => f.id === selectedFlightId)) return;
    setSelectedFlightId(flights[0].id);
  }, [flights, prefsReady, selectedFlightId]);

  useEffect(() => {
    if (!prefsReady) return;
    if (!isAdmin) return;
    if (firms.length === 0) return;
    if (selectedFirmId && firms.some((f) => f.id === selectedFirmId)) return;
    setSelectedFirmId(firms[0].id);
  }, [firms, isAdmin, prefsReady, selectedFirmId]);

  useEffect(() => {
    const fetchMeta = async () => {
      if (!canAccess) {
        setLoadingMeta(false);
        return;
      }

      if (!prefsReady) {
        return;
      }

      try {
        setLoadingMeta(true);
        const [flightsRes, firmsRes] = await Promise.all([
          api.get('/flights'),
          isAdmin ? api.get('/firms') : Promise.resolve({ data: [] }),
        ]);

        const flightOptions: FlightOption[] = (flightsRes.data || [])
          .filter((f: any) => f && (f.id || f.flight_id))
          .map((f: any) => ({
            id: String(f.id || f.flight_id),
            flightNumber: String(f.flightNumber || f.flight_number || f.id || f.flight_id),
            departure: String(f.departure),
            arrival: String(f.arrival),
          }));

        const firmOptions: FirmOption[] = isAdmin
          ? (firmsRes.data || [])
              .filter((x: any) => x && x.id)
              .map((x: any) => ({ id: String(x.id), name: String(x.name || x.id) }))
          : [];

        setFlights(flightOptions);
        setFirms(firmOptions);

        if (!selectedFlightId && flightOptions.length > 0) setSelectedFlightId(flightOptions[0].id);
        if (isAdmin && !selectedFirmId && firmOptions.length > 0) setSelectedFirmId(firmOptions[0].id);
      } catch (error: any) {
        toast.error(error?.response?.data?.error || tr('Failed to load report options', 'Hisobot parametrlarini yuklab bo\'lmadi'));
      } finally {
        setLoadingMeta(false);
      }
    };

    fetchMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess, isAdmin, prefsReady]);

  const loadFlightReport = async () => {
    if (!selectedFlightId) {
      toast.error(tr('Select a flight', 'Reysni tanlang'));
      return;
    }
    try {
      setLoadingFlightReport(true);
      const res = await api.get(`/reports/flight?flightId=${encodeURIComponent(selectedFlightId)}`);
      setFlightReport(res.data);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || tr('Failed to load flight report', 'Reys hisoboti yuklab bo\'lmadi'));
    } finally {
      setLoadingFlightReport(false);
    }
  };

  const loadFirmReport = async () => {
    try {
      setLoadingFirmReport(true);
      const query = new URLSearchParams();
      if (isAdmin) {
        if (!selectedFirmId) {
          toast.error(tr('Select a firm', 'Firmani tanlang'));
          return;
        }
        query.set('firmId', selectedFirmId);
      }
      if (dateParams.dateFrom) query.set('dateFrom', dateParams.dateFrom);
      if (dateParams.dateTo) query.set('dateTo', dateParams.dateTo);

      const res = await api.get(`/reports/firm?${query.toString()}`);
      setFirmReport(res.data);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || tr('Failed to load firm report', 'Firma hisoboti yuklab bo\'lmadi'));
    } finally {
      setLoadingFirmReport(false);
    }
  };

  const loadPaymentsReport = async () => {
    try {
      setLoadingPaymentsReport(true);
      const query = new URLSearchParams();
      if (isAdmin && selectedFirmId) query.set('firmId', selectedFirmId);
      if (selectedFlightId) query.set('flightId', selectedFlightId);
      if (dateParams.dateFrom) query.set('dateFrom', dateParams.dateFrom);
      if (dateParams.dateTo) query.set('dateTo', dateParams.dateTo);

      const res = await api.get(`/reports/payments?${query.toString()}`);
      setPaymentsReport(res.data);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || tr('Failed to load payments report', 'To\'lovlar hisoboti yuklab bo\'lmadi'));
    } finally {
      setLoadingPaymentsReport(false);
    }
  };

  const loadTransactionsReport = async () => {
    try {
      setLoadingTransactionsReport(true);
      const query = new URLSearchParams();
      if (isAdmin && selectedFirmId) query.set('firmId', selectedFirmId);
      if (selectedFlightId) query.set('flightId', selectedFlightId);
      if (dateParams.dateFrom) query.set('dateFrom', dateParams.dateFrom);
      if (dateParams.dateTo) query.set('dateTo', dateParams.dateTo);

      const res = await api.get(`/reports/transactions?${query.toString()}`);
      setTransactionsReport(res.data);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || tr('Failed to load transactions report', 'Tranzaksiyalar hisoboti yuklab bo\'lmadi'));
    } finally {
      setLoadingTransactionsReport(false);
    }
  };

  const loadInteractionsReport = async () => {
    if (!isSuperadmin) {
      toast.error(tr('Superadmin only', 'Faqat superadmin'));
      return;
    }
    try {
      setLoadingInteractionsReport(true);
      const query = new URLSearchParams();
      if (dateParams.dateFrom) query.set('dateFrom', dateParams.dateFrom);
      if (dateParams.dateTo) query.set('dateTo', dateParams.dateTo);

      const res = await api.get(`/reports/interactions?${query.toString()}`);
      setInteractionsReport(res.data);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || tr('Failed to load interactions report', 'O\'zaro aloqalar hisoboti yuklab bo\'lmadi'));
    } finally {
      setLoadingInteractionsReport(false);
    }
  };

  if (!canAccess) {
    return (
      <div className="text-foreground">
        <h2 className="text-3xl font-bold text-foreground">{tr('Reports', 'Hisobotlar')}</h2>
        <p className="mt-2 text-muted">{tr('You do not have access to reports.', 'Hisobotlarga kirish huquqingiz yo\'q.')}</p>
      </div>
    );
  }

  const flightOptionsDisabled = loadingMeta || flights.length === 0;
  const firmOptionsDisabled = loadingMeta || firms.length === 0;

  return (
    <div className="space-y-8 text-foreground">
      <div>
        <h2 className="text-3xl font-bold">{tr('Reports', 'Hisobotlar')}</h2>
        <p className="mt-1 text-sm text-muted">
          {isFirm
            ? tr('Your firm-scoped performance and finance reports.', 'Firmangiz bo\'yicha natija va moliyaviy hisobotlar.')
            : tr('Flight, firm, payments, transactions — plus superadmin interaction overview.', 'Reys, firma, to\'lovlar, tranzaksiyalar — va superadmin uchun o\'zaro aloqalar ko\'rinishi.')}
        </p>
      </div>

      <CollapsibleCard
        title={tr('Scope', 'Qamrov')}
        defaultOpen
        storageKey="jetstream-reports-scope-open"
        className="rounded-xl"
        contentClassName="p-6 space-y-4"
      >
        <div className={`grid grid-cols-1 ${isAdmin ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4`}>
          <div>
            <label className="block text-sm font-medium text-muted mb-1">{tr('Flight', 'Reys')}</label>
            <select
              value={selectedFlightId}
              onChange={(e) => setSelectedFlightId(e.target.value)}
              disabled={flightOptionsDisabled}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-foreground outline-none focus:border-blue-500 transition disabled:opacity-50"
            >
              {flights.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.flightNumber}
                </option>
              ))}
            </select>
          </div>

          {isAdmin && (
            <div>
              <label className="block text-sm font-medium text-muted mb-1">{tr('Firm', 'Firma')}</label>
              <select
                value={selectedFirmId}
                onChange={(e) => setSelectedFirmId(e.target.value)}
                disabled={firmOptionsDisabled}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-foreground outline-none focus:border-blue-500 transition disabled:opacity-50"
              >
                {firms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-muted mb-1">{tr('Date from', 'Sana (dan)')}</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-foreground outline-none focus:border-blue-500 transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted mb-1">{tr('Date to', 'Sana (gacha)')}</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-foreground outline-none focus:border-blue-500 transition"
            />
          </div>
        </div>

        {loadingMeta && (
          <p className="text-sm text-muted">{tr('Loading report options...', 'Hisobot parametrlari yuklanmoqda...')}</p>
        )}
      </CollapsibleCard>

      {/* Flight report */}
      <CollapsibleCard
        title={isFirm ? tr('Flight report (your firm)', 'Reys hisoboti (firmangiz)') : tr('Flight report', 'Reys hisoboti')}
        defaultOpen={false}
        storageKey="jetstream-reports-flight-report-open"
        className="rounded-xl"
        contentClassName="p-6 space-y-4"
        headerRight={
          <button
            type="button"
            onClick={loadFlightReport}
            disabled={loadingFlightReport || !selectedFlightId}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition disabled:opacity-50"
          >
            {loadingFlightReport ? tr('Loading…', 'Yuklanmoqda…') : tr('Load', 'Yuklash')}
          </button>
        }
      >
        {flightReport && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="bg-surface border border-border rounded-lg p-4">
                <p className="text-xs text-muted">{tr('Debt (Payable, UZS)', 'Qarz (PAYABLE, UZS)')}</p>
                <p className="text-2xl font-bold text-yellow-600">{Number(flightReport.debt || 0).toFixed(2)}</p>
              </div>
              <div className="bg-surface border border-border rounded-lg p-4">
                <p className="text-xs text-muted">{tr('Revenue (Sales, UZS)', 'Tushum (SOTUV, UZS)')}</p>
                <p className="text-2xl font-bold text-green-600">{Number(flightReport.revenue || 0).toFixed(2)}</p>
              </div>
              <div className="bg-surface border border-border rounded-lg p-4">
                <p className="text-xs text-muted">{tr('Payments (UZS)', "To'lovlar (UZS)")}</p>
                <p className="text-2xl font-bold text-blue-600">{Number(flightReport.paid || 0).toFixed(2)}</p>
              </div>
              <div className="bg-surface border border-border rounded-lg p-4">
                <p className="text-xs text-muted">{tr('Outstanding (UZS)', 'Qoldiq (UZS)')}</p>
                <p className="text-2xl font-bold">{Number(flightReport.outstanding || 0).toFixed(2)}</p>
              </div>
              <div className="bg-surface border border-border rounded-lg p-4">
                <p className="text-xs text-muted">{tr('Profit (UZS)', 'Foyda (UZS)')}</p>
                <p className="text-2xl font-bold text-indigo-600">{Number(flightReport.profit || 0).toFixed(2)}</p>
              </div>
            </div>

            {flightReport.tickets && (
              <div className="text-sm text-muted">
                {tr('Tickets', 'Biletlar')}: {tr('total', 'jami')} {flightReport.tickets.total}, {tr('available', 'mavjud')} {flightReport.tickets.available}, {tr('assigned', 'biriktirilgan')} {flightReport.tickets.assigned}, {tr('sold', 'sotilgan')} {flightReport.tickets.sold}
              </div>
            )}

            {isAdmin ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Firm', 'Firma')}</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Tickets', 'Biletlar')}</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Sold', 'Sotilgan')}</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Debt', 'Qarz')}</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Revenue', 'Tushum')}</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Paid', "To'langan")}</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Outstanding', 'Qoldiq')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(flightReport.firms || []).map((row: any) => (
                      <tr key={row.firmId}>
                        <td className="px-4 py-2 text-sm text-foreground">{row.firmName || row.firmId}</td>
                        <td className="px-4 py-2 text-sm text-foreground">{row.ticketsAssigned || 0}</td>
                        <td className="px-4 py-2 text-sm text-foreground">{row.ticketsSold || 0}</td>
                        <td className="px-4 py-2 text-sm text-foreground">{Number(row.debt || 0).toFixed(2)}</td>
                        <td className="px-4 py-2 text-sm text-foreground">{Number(row.revenue || 0).toFixed(2)}</td>
                        <td className="px-4 py-2 text-sm text-foreground">{Number(row.paid || 0).toFixed(2)}</td>
                        <td className="px-4 py-2 text-sm text-foreground">{Number(row.outstanding || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                    {(flightReport.firms || []).length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-4 text-center text-sm text-muted">
                          {tr('No firm activity for this flight yet.', "Bu reys bo'yicha hali firma faoliyati yo'q.")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-muted">
                {tr('Your firm breakdown', 'Firmangiz bo\'yicha')}: {(flightReport.firms || []).length > 0 ? (
                  <span>
                    {tr('tickets', 'biletlar')} {(flightReport.firms?.[0]?.ticketsAssigned ?? 0)} / {tr('sold', 'sotilgan')} {(flightReport.firms?.[0]?.ticketsSold ?? 0)}
                  </span>
                ) : (
                  <span className="text-muted">{tr('No activity for this flight yet.', "Bu reys bo'yicha hali faoliyat yo'q.")}</span>
                )}
              </div>
            )}
          </div>
        )}
      </CollapsibleCard>

      {/* Firm report */}
      <CollapsibleCard
        title={isFirm ? tr('My firm report', 'Firmam hisoboti') : tr('Firm report', 'Firma hisoboti')}
        defaultOpen={false}
        storageKey="jetstream-reports-firm-report-open"
        className="rounded-xl"
        contentClassName="p-6 space-y-4"
        headerRight={
          <button
            type="button"
            onClick={loadFirmReport}
            disabled={loadingFirmReport || (isAdmin && !selectedFirmId)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition disabled:opacity-50"
          >
            {loadingFirmReport ? tr('Loading…', 'Yuklanmoqda…') : tr('Load', 'Yuklash')}
          </button>
        }
      >
        {firmReport && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="bg-surface border border-border rounded-lg p-4">
                <p className="text-xs text-muted">{tr('Debt (UZS)', 'Qarz (UZS)')}</p>
                <p className="text-2xl font-bold text-yellow-600">{Number(firmReport.totals?.debt || 0).toFixed(2)}</p>
              </div>
              <div className="bg-surface border border-border rounded-lg p-4">
                <p className="text-xs text-muted">{tr('Revenue (UZS)', 'Tushum (UZS)')}</p>
                <p className="text-2xl font-bold text-green-600">{Number(firmReport.totals?.revenue || 0).toFixed(2)}</p>
              </div>
              <div className="bg-surface border border-border rounded-lg p-4">
                <p className="text-xs text-muted">{tr('Paid (UZS)', "To'langan (UZS)")}</p>
                <p className="text-2xl font-bold text-blue-600">{Number(firmReport.totals?.paid || 0).toFixed(2)}</p>
              </div>
              <div className="bg-surface border border-border rounded-lg p-4">
                <p className="text-xs text-muted">{tr('Outstanding (UZS)', 'Qoldiq (UZS)')}</p>
                <p className="text-2xl font-bold">{Number(firmReport.totals?.outstanding || 0).toFixed(2)}</p>
              </div>
              <div className="bg-surface border border-border rounded-lg p-4">
                <p className="text-xs text-muted">{tr('Profit (UZS)', 'Foyda (UZS)')}</p>
                <p className="text-2xl font-bold text-indigo-600">{Number(firmReport.totals?.profit || 0).toFixed(2)}</p>
              </div>
            </div>

            <div className="text-sm text-muted">
              {tr('Tickets', 'Biletlar')}: {tr('assigned', 'biriktirilgan')} {firmReport.tickets?.assigned || 0}, {tr('sold', 'sotilgan')} {firmReport.tickets?.sold || 0}, {tr('unsold', 'sotilmagan')} {firmReport.tickets?.unsold || 0}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-surface border border-border rounded-lg p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">{tr('Transactions by type', 'Tranzaksiyalar (turi bo\'yicha)')}</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-surface-2">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Type', 'Turi')}</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Count', 'Soni')}</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Total (UZS)', 'Jami (UZS)')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(firmReport.transactionsByType || []).map((r: any) => (
                        <tr key={r.type}>
                          <td className="px-3 py-2 text-sm text-foreground">{getTransactionTypeLabel(r.type)}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{r.count}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{Number(r.totalBaseAmount || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                      {(firmReport.transactionsByType || []).length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-3 py-3 text-center text-sm text-muted">{tr('No data', "Ma'lumot yo'q")}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-surface border border-border rounded-lg p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">{tr('Payments by method', "To'lovlar (usul bo\'yicha)")}</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-surface-2">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Method', 'Usul')}</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Count', 'Soni')}</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Total (UZS)', 'Jami (UZS)')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(firmReport.paymentsByMethod || []).map((r: any) => (
                        <tr key={r.method}>
                          <td className="px-3 py-2 text-sm text-foreground">{getPaymentMethodLabel(r.method)}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{r.count}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{Number(r.totalBaseAmount || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                      {(firmReport.paymentsByMethod || []).length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-3 py-3 text-center text-sm text-muted">{tr('No data', "Ma'lumot yo'q")}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="bg-surface border border-border rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">{tr('By flight', 'Reys bo\'yicha')}</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface-2">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Flight', 'Reys')}</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Debt', 'Qarz')}</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Revenue', 'Tushum')}</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Paid', "To'langan")}</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Outstanding', 'Qoldiq')}</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Tickets', 'Biletlar')}</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Sold', 'Sotilgan')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(firmReport.byFlight || []).map((r: any) => (
                      <tr key={r.flightId}>
                        <td className="px-3 py-2 text-sm text-foreground">{r.flightNumber || r.flightId}</td>
                        <td className="px-3 py-2 text-sm text-foreground">{Number(r.debt || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-sm text-foreground">{Number(r.revenue || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-sm text-foreground">{Number(r.paid || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-sm text-foreground">{Number(r.outstanding || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-sm text-foreground">{r.ticketsAssigned || 0}</td>
                        <td className="px-3 py-2 text-sm text-foreground">{r.ticketsSold || 0}</td>
                      </tr>
                    ))}
                    {(firmReport.byFlight || []).length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-3 text-center text-sm text-muted">{tr('No data', "Ma'lumot yo'q")}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </CollapsibleCard>

      {/* Payments report */}
      <CollapsibleCard
        title={isFirm ? tr('My payments report', "To'lovlarim hisoboti") : tr('Payments report', "To'lovlar hisoboti")}
        defaultOpen={false}
        storageKey="jetstream-reports-payments-report-open"
        className="rounded-xl"
        contentClassName="p-6 space-y-4"
        headerRight={
          <button
            type="button"
            onClick={loadPaymentsReport}
            disabled={loadingPaymentsReport}
            className="px-4 py-2 bg-surface hover:bg-surface-2 text-foreground rounded-lg transition disabled:opacity-50"
          >
            {loadingPaymentsReport ? tr('Loading…', 'Yuklanmoqda…') : tr('Load', 'Yuklash')}
          </button>
        }
      >
        {paymentsReport && (
          <div className="space-y-4">
            <div className="text-sm text-muted">
              {tr('Total payments', "Jami to'lovlar")}: {paymentsReport.totals?.count || 0} — {Number(paymentsReport.totals?.totalBaseAmount || 0).toFixed(2)} UZS
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-surface border border-border rounded-lg p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">{tr('By method', 'Usul bo\'yicha')}</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-surface-2">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Method', 'Usul')}</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Count', 'Soni')}</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Total (UZS)', 'Jami (UZS)')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(paymentsReport.byMethod || []).map((r: any) => (
                        <tr key={r.method}>
                          <td className="px-3 py-2 text-sm text-foreground">{getPaymentMethodLabel(r.method)}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{r.count}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{Number(r.totalBaseAmount || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                      {(paymentsReport.byMethod || []).length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-3 py-3 text-center text-sm text-muted">{tr('No data', "Ma'lumot yo'q")}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-surface border border-border rounded-lg p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">{tr('By currency', 'Valyuta bo\'yicha')}</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-surface-2">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Currency', 'Valyuta')}</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Count', 'Soni')}</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Total (UZS)', 'Jami (UZS)')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(paymentsReport.byCurrency || []).map((r: any) => (
                        <tr key={r.currency}>
                          <td className="px-3 py-2 text-sm text-foreground">{r.currency}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{r.count}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{Number(r.totalBaseAmount || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                      {(paymentsReport.byCurrency || []).length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-3 py-3 text-center text-sm text-muted">{tr('No data', "Ma'lumot yo'q")}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </CollapsibleCard>

      {/* Transactions report */}
      <CollapsibleCard
        title={isFirm ? tr('My transactions report', 'Tranzaksiyalarim hisoboti') : tr('Transactions report', 'Tranzaksiyalar hisoboti')}
        defaultOpen={false}
        storageKey="jetstream-reports-transactions-report-open"
        className="rounded-xl"
        contentClassName="p-6 space-y-4"
        headerRight={
          <button
            type="button"
            onClick={loadTransactionsReport}
            disabled={loadingTransactionsReport}
            className="px-4 py-2 bg-surface hover:bg-surface-2 text-foreground rounded-lg transition disabled:opacity-50"
          >
            {loadingTransactionsReport ? tr('Loading…', 'Yuklanmoqda…') : tr('Load', 'Yuklash')}
          </button>
        }
      >
        {transactionsReport && (
          <div className="space-y-4">
            <div className="text-sm text-muted">
              {tr('Total transactions', 'Jami tranzaksiyalar')}: {transactionsReport.totals?.count || 0} — {Number(transactionsReport.totals?.totalBaseAmount || 0).toFixed(2)} UZS
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-surface border border-border rounded-lg p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">{tr('By type', 'Turi bo\'yicha')}</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-surface-2">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Type', 'Turi')}</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Count', 'Soni')}</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Total (UZS)', 'Jami (UZS)')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(transactionsReport.byType || []).map((r: any) => (
                        <tr key={r.type}>
                          <td className="px-3 py-2 text-sm text-foreground">{getTransactionTypeLabel(r.type)}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{r.count}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{Number(r.totalBaseAmount || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                      {(transactionsReport.byType || []).length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-3 py-3 text-center text-sm text-muted">{tr('No data', "Ma'lumot yo'q")}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-surface border border-border rounded-lg p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">{tr('By currency', 'Valyuta bo\'yicha')}</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-surface-2">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Currency', 'Valyuta')}</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Count', 'Soni')}</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Total (UZS)', 'Jami (UZS)')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(transactionsReport.byCurrency || []).map((r: any) => (
                        <tr key={r.currency}>
                          <td className="px-3 py-2 text-sm text-foreground">{r.currency}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{r.count}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{Number(r.totalBaseAmount || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                      {(transactionsReport.byCurrency || []).length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-3 py-3 text-center text-sm text-muted">{tr('No data', "Ma'lumot yo'q")}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </CollapsibleCard>

      {/* Superadmin interactions */}
      {isSuperadmin && (
        <CollapsibleCard
          title={tr('Admin ↔ Firm interactions (superadmin)', 'Admin ↔ Firma aloqalari (superadmin)')}
          defaultOpen={false}
          storageKey="jetstream-reports-interactions-open"
          className="rounded-xl"
          contentClassName="p-6 space-y-4"
          headerRight={
            <button
              type="button"
              onClick={loadInteractionsReport}
              disabled={loadingInteractionsReport}
              className="px-4 py-2 bg-surface hover:bg-surface-2 text-foreground rounded-lg transition disabled:opacity-50"
            >
              {loadingInteractionsReport ? tr('Loading…', 'Yuklanmoqda…') : tr('Load', 'Yuklash')}
            </button>
          }
        >
          {interactionsReport && (
            <div className="space-y-4">
              <div className="text-sm text-muted">
                {tr('Invites', 'Takliflar')}: {interactionsReport.totals?.invitesSent || 0} — {tr('Allocations', 'Ajratmalar')} {Number(interactionsReport.totals?.allocationsBaseAmount || 0).toFixed(2)} UZS — {tr('Payments', "To'lovlar")} {Number(interactionsReport.totals?.paymentsBaseAmount || 0).toFixed(2)} UZS
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Admin', 'Admin')}</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Firm', 'Firma')}</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Invites', 'Takliflar')}</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Allocations (UZS)', 'Ajratmalar (UZS)')}</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Payments (UZS)', "To'lovlar (UZS)")}</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted uppercase">{tr('Sales (UZS)', 'Sotuv (UZS)')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(interactionsReport.pairs || []).map((p: any) => (
                      <tr key={`${p.adminId}-${p.firmId}`}>
                        <td className="px-3 py-2 text-sm text-foreground">{p.adminEmail}</td>
                        <td className="px-3 py-2 text-sm text-foreground">{p.firmName || p.firmId}</td>
                        <td className="px-3 py-2 text-sm text-foreground">{p.invitesSent}</td>
                        <td className="px-3 py-2 text-sm text-foreground">{Number(p.allocationsBaseAmount || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-sm text-foreground">{Number(p.paymentsBaseAmount || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-sm text-foreground">{Number(p.salesBaseAmount || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                    {(interactionsReport.pairs || []).length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-3 text-center text-sm text-muted">{tr('No interactions in this period', 'Ushbu davrda aloqa qayd etilmadi')}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-muted">
                {tr('Note: allocations/payments/sales are counted only when the acting user was an admin/superadmin.', 'Eslatma: ajratmalar/to\'lovlar/sotuvlar faqat amalni bajargan foydalanuvchi admin/superadmin bo\'lganda hisoblanadi.')}
              </p>
            </div>
          )}
        </CollapsibleCard>
      )}
    </div>
  );
}
