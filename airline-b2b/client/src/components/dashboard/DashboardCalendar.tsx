"use client";

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

type CalendarFlight = {
  id: string;
  flightNumber: string;
  departure: string;
  arrival: string;
};

type CalendarFirm = {
  id: string;
  name: string;
};

type CalendarFlightRef = {
  id: string;
  flightNumber: string;
  departure: string;
  arrival: string;
};

type CalendarTransaction = {
  id: string;
  type: 'SALE' | 'PAYABLE' | 'PAYMENT' | 'ADJUSTMENT';
  originalAmount: string | number;
  currency: string;
  exchangeRate: string | number;
  baseAmount: string | number;
  paymentMethod: string | null;
  metadata: unknown;
  createdAt: string;
  firm?: CalendarFirm | null;
  flight?: CalendarFlightRef | null;
};

type CalendarRate = {
  id: string;
  baseCurrency: string;
  targetCurrency: string;
  rate: string | number;
  source: string;
  recordedAt: string;
};

type CalendarResponse = {
  month: string;
  dateFrom: string;
  dateTo: string;
  flights: CalendarFlight[];
  transactions: CalendarTransaction[];
  currencyRates: CalendarRate[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getTxDateKey(tx: CalendarTransaction): string {
  if (tx.type === 'PAYMENT') {
    const meta = isRecord(tx.metadata) ? tx.metadata : null;
    const dateValue = meta ? meta.date : null;
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue.trim())) {
      return dateValue.trim();
    }
  }
  return format(new Date(tx.createdAt), 'yyyy-MM-dd');
}

export default function DashboardCalendar({
  title = 'Calendar',
  reloadKey = 0,
  defaultOpen = true,
  storageKey,
}: {
  title?: string;
  reloadKey?: number;
  defaultOpen?: boolean;
  storageKey?: string;
}) {
  const { tr } = useLanguage();
  const [monthDate, setMonthDate] = useState<Date>(() => startOfMonth(new Date()));
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [open, setOpen] = useState<boolean>(() => defaultOpen);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === '1' || raw === 'true') setOpen(true);
      if (raw === '0' || raw === 'false') setOpen(false);
    } catch {
      // ignore
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, open ? '1' : '0');
    } catch {
      // ignore
    }
  }, [open, storageKey]);

  const monthKey = useMemo(() => format(monthDate, 'yyyy-MM'), [monthDate]);

  useEffect(() => {
    if (!open) return;
    const fetchCalendar = async () => {
      try {
        setLoading(true);
        const res = await api.get<CalendarResponse>(`/reports/calendar?month=${encodeURIComponent(monthKey)}`);
        setData(res.data);

        const todayKey = format(new Date(), 'yyyy-MM-dd');
        if (todayKey.startsWith(monthKey)) {
          setSelectedDateKey(todayKey);
        } else {
          setSelectedDateKey(`${monthKey}-01`);
        }
      } catch (err: any) {
        toast.error(err?.response?.data?.error || 'Failed to load calendar');
      } finally {
        setLoading(false);
      }
    };

    fetchCalendar();
  }, [monthKey, reloadKey, open]);

  const grouped = useMemo(() => {
    const flightsByDate = new Map<string, CalendarFlight[]>();
    const transactionsByDate = new Map<string, CalendarTransaction[]>();
    const ratesByDate = new Map<string, CalendarRate[]>();

    for (const f of data?.flights || []) {
      const key = format(new Date(f.departure), 'yyyy-MM-dd');
      const arr = flightsByDate.get(key) || [];
      arr.push(f);
      flightsByDate.set(key, arr);
    }

    for (const t of data?.transactions || []) {
      const key = getTxDateKey(t);
      const arr = transactionsByDate.get(key) || [];
      arr.push(t);
      transactionsByDate.set(key, arr);
    }

    for (const r of data?.currencyRates || []) {
      const key = format(new Date(r.recordedAt), 'yyyy-MM-dd');
      const arr = ratesByDate.get(key) || [];
      arr.push(r);
      ratesByDate.set(key, arr);
    }

    return { flightsByDate, transactionsByDate, ratesByDate };
  }, [data]);

  const gridStart = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(monthDate), { weekStartsOn: 1 });

  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) {
    days.push(d);
  }

  const selectedFlights = grouped.flightsByDate.get(selectedDateKey) || [];
  const selectedTransactions = grouped.transactionsByDate.get(selectedDateKey) || [];
  const selectedPayments = selectedTransactions.filter((t) => t.type === 'PAYMENT');
  const selectedRates = grouped.ratesByDate.get(selectedDateKey) || [];

  return (
    <div className="bg-surface-2 border border-border rounded-lg p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-sm text-muted">
            Flights (by departure), transactions/payments (by recorded date), and exchange rates.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {open ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMonthDate((m) => startOfMonth(addMonths(m, -1)))}
                className="px-3 py-2 bg-surface hover:bg-surface-2 text-foreground rounded-lg transition border border-border"
              >
                Prev
              </button>
              <div className="px-3 py-2 bg-surface text-foreground rounded-lg font-medium border border-border">
                {format(monthDate, 'MMMM yyyy')}
              </div>
              <button
                type="button"
                onClick={() => setMonthDate((m) => startOfMonth(addMonths(m, 1)))}
                className="px-3 py-2 bg-surface hover:bg-surface-2 text-foreground rounded-lg transition border border-border"
              >
                Next
              </button>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="px-3 py-2 bg-surface hover:bg-surface-2 text-foreground rounded-lg transition border border-border"
            aria-expanded={open}
          >
            {open ? tr('Hide', 'Yopish') : tr('Show', "Ko'rsatish")}
          </button>
        </div>
      </div>

      {open ? (
        loading ? (
          <div className="text-muted">Loading…</div>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-2 text-xs text-muted">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <div key={d} className="px-2 py-1">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {days.map((day) => {
                const key = format(day, 'yyyy-MM-dd');
                const inMonth = isSameMonth(day, monthDate);
                const isSelected = key === selectedDateKey;
                const flights = grouped.flightsByDate.get(key) || [];
                const txs = grouped.transactionsByDate.get(key) || [];
                const pays = txs.filter((t) => t.type === 'PAYMENT');
                const rates = grouped.ratesByDate.get(key) || [];

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDateKey(key)}
                    className={
                      `text-left rounded-lg border p-2 min-h-[92px] transition ` +
                      (isSelected
                        ? 'border-primary bg-primary/100/10'
                        : 'border-border bg-surface hover:bg-surface-2') +
                      (inMonth ? '' : ' opacity-50')
                    }
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-foreground">{format(day, 'd')}</div>
                      <div className="text-[10px] text-muted">{key}</div>
                    </div>

                    <div className="mt-2 space-y-1 text-xs text-muted">
                      {flights.length > 0 && <div>Flights: {flights.length}</div>}
                      {txs.length > 0 && <div>Transactions: {txs.length}</div>}
                      {pays.length > 0 && <div>Payments: {pays.length}</div>}
                      {rates.length > 0 && <div>Rates: {rates.length}</div>}
                      {flights.length === 0 && txs.length === 0 && rates.length === 0 && (
                        <div className="text-muted">No activity</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-lg font-semibold text-foreground">{selectedDateKey}</h4>
                <div className="text-sm text-muted">
                  {selectedFlights.length} flights · {selectedTransactions.length} transactions · {selectedRates.length} rates
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="bg-surface border border-border rounded-lg p-3">
                  <div className="text-sm font-semibold text-foreground">Flights</div>
                  <div className="mt-2 space-y-2">
                    {selectedFlights.map((f) => (
                      <div key={f.id} className="text-sm text-foreground">
                        <Link href={`/flights/detail?id=${f.id}`} className="hover:underline">
                          {f.flightNumber}
                        </Link>
                        <div className="text-xs text-muted">{format(new Date(f.departure), 'PPP p')}</div>
                      </div>
                    ))}
                    {selectedFlights.length === 0 && (
                      <div className="text-sm text-muted">No flights</div>
                    )}
                  </div>
                </div>

                <div className="bg-surface border border-border rounded-lg p-3">
                  <div className="text-sm font-semibold text-foreground">Transactions</div>
                  <div className="mt-2 space-y-2">
                    {selectedTransactions.map((t) => (
                      <div key={t.id} className="text-sm text-foreground">
                        <Link href={`/transactions/detail?id=${t.id}`} className="hover:underline">
                          {t.type}
                        </Link>
                        <div className="text-xs text-muted">
                          {format(new Date(t.createdAt), 'PPP p')} · {Number(t.originalAmount).toFixed(2)} {t.currency}
                          {' '}({Number(t.baseAmount).toFixed(2)} UZS)
                          {t.type === 'PAYMENT' && t.paymentMethod ? ` · ${t.paymentMethod}` : ''}
                        </div>
                      </div>
                    ))}
                    {selectedTransactions.length === 0 && (
                      <div className="text-sm text-muted">No transactions</div>
                    )}
                  </div>
                </div>

                <div className="bg-surface border border-border rounded-lg p-3">
                  <div className="text-sm font-semibold text-foreground">Exchange rates</div>
                  <div className="mt-2 space-y-2">
                    {selectedRates.map((r) => (
                      <div key={r.id} className="text-sm text-foreground">
                        <div>
                          {(String(r.baseCurrency || '').toUpperCase() === 'UZS' && r.targetCurrency
                            ? `${r.targetCurrency}→${r.baseCurrency}`
                            : String(r.targetCurrency || '').toUpperCase() === 'UZS' && r.baseCurrency
                              ? `${r.baseCurrency}→${r.targetCurrency}`
                              : `${r.baseCurrency}→${r.targetCurrency}`
                          )}: {Number(r.rate).toFixed(6)}
                        </div>
                        <div className="text-xs text-muted">
                          {format(new Date(r.recordedAt), 'PPP')} · {r.source}
                        </div>
                      </div>
                    ))}
                    {selectedRates.length === 0 && (
                      <div className="text-sm text-muted">No rates</div>
                    )}
                  </div>
                </div>
              </div>

              {selectedPayments.length > 0 && (
                <div className="mt-4 text-xs text-muted">
                  Payments in this day: {selectedPayments.length}
                </div>
              )}
            </div>
          </>
        )
      ) : null}
    </div>
  );
}
