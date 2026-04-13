/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

type FirmOption = {
  id: string;
  name: string;
};

type FlightOption = {
  id?: string;
  flight_id?: string;
  flightNumber?: string;
};

export default function TransactionsPage() {
  const router = useRouter();
  const { user } = useAuth();

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
  const [payCurrency, setPayCurrency] = useState<'USD' | 'UZS' | 'OTHER'>('USD');
  const [payOtherCurrency, setPayOtherCurrency] = useState<string>('');
  const [payExchangeRate, setPayExchangeRate] = useState<string>('');
  const [payMethod, setPayMethod] = useState<'cash' | 'card'>('cash');
  const [payCashDate, setPayCashDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [payCardProvider, setPayCardProvider] = useState<string>('');
  const [payCardReference, setPayCardReference] = useState<string>('');
  const [payReference, setPayReference] = useState<string>('');
  const [recordingPayment, setRecordingPayment] = useState(false);

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
      toast.error('Select a firm for this payment');
      return;
    }
    if (!flightId) {
      toast.error('Select a flight for this payment');
      return;
    }
    if (!amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      toast.error('Currency must be a 3-letter code (e.g. USD)');
      return;
    }

    if (currency !== 'USD') {
      const rateRaw = payExchangeRate.trim();
      const rateNum = rateRaw ? Number(rateRaw) : NaN;
      if (payCurrency === 'OTHER') {
        if (!rateRaw || !Number.isFinite(rateNum) || rateNum <= 0) {
          toast.error('Enter a valid exchange rate (required for non-USD currencies)');
          return;
        }
      }
      if (rateRaw && (!Number.isFinite(rateNum) || rateNum <= 0)) {
        toast.error('Enter a valid exchange rate');
        return;
      }
    }
    if (method !== 'cash' && method !== 'card') {
      toast.error('Select a payment method');
      return;
    }

    const metadata: any = {};
    if (payReference.trim()) metadata.reference = payReference.trim();

    if (method === 'cash') {
      if (!payCashDate) {
        toast.error('Cash payments require a date');
        return;
      }
      metadata.date = payCashDate;
    }

    if (method === 'card') {
      if (!payCardProvider.trim()) {
        toast.error('Card payments require a provider');
        return;
      }
      if (!payCardReference.trim()) {
        toast.error('Card payments require a transaction reference');
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

      if (currency !== 'USD' && payExchangeRate.trim()) {
        body.exchangeRate = payExchangeRate.trim();
      }

      await api.post('/payments', body);
      toast.success('Payment recorded');

      setPayAmount('');
      setPayCardProvider('');
      setPayCardReference('');
      setPayReference('');
      setPayExchangeRate('');

      setPage(1);
      setReloadKey((k) => k + 1);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to record payment');
    } finally {
      setRecordingPayment(false);
    }
  };

  useEffect(() => {
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
        toast.error('Failed to load transactions');
      } finally {
        setLoading(false);
      }
    };
    fetchTransactions();
  }, [filterType, filterFirmId, filterFlightId, filterCurrency, dateFrom, dateTo, page, limit, canFilterFirm, reloadKey]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Transactions</h2>
      </div>

      <div className="bg-surface-2 border border-border shadow sm:rounded-lg p-4 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Record payment</h3>
          <p className="mt-1 text-sm text-muted">
            Creates a <span className="font-semibold">PAYMENT</span> transaction.
            {' '}Supported currencies: <span className="font-semibold">USD</span> / <span className="font-semibold">UZS</span>
            {' '}(other currencies require a manual rate).
          </p>
        </div>

        <form onSubmit={submitPayment} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
          {canFilterFirm && (
            <div>
              <label htmlFor="payFirm" className="block text-sm font-medium text-muted">Firm</label>
              <select
                id="payFirm"
                value={payFirmId}
                onChange={(e) => setPayFirmId(e.target.value)}
                className="mt-1 block w-full rounded-md bg-surface border border-border py-2 pl-3 pr-10 text-foreground outline-none focus:border-fuchsia-500 transition sm:text-sm"
                required
              >
                <option value="">Select</option>
                {firmOptions.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="payFlight" className="block text-sm font-medium text-muted">Flight</label>
            <select
              id="payFlight"
              value={payFlightId}
              onChange={(e) => setPayFlightId(e.target.value)}
              className="mt-1 block w-full rounded-md bg-surface border border-border py-2 pl-3 pr-10 text-foreground outline-none focus:border-fuchsia-500 transition sm:text-sm"
              required
            >
              <option value="">Select</option>
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
            <label htmlFor="payAmount" className="block text-sm font-medium text-muted">Amount</label>
            <input
              id="payAmount"
              type="number"
              step="0.01"
              min="0"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder="0.00"
              className="mt-1 block w-full rounded-md bg-surface border border-border py-2 px-3 text-foreground placeholder:text-muted outline-none focus:border-fuchsia-500 transition sm:text-sm"
              required
            />
          </div>

          <div>
            <label htmlFor="payCurrency" className="block text-sm font-medium text-muted">Currency</label>
            <select
              id="payCurrency"
              value={payCurrency}
              onChange={(e) => {
                setPayCurrency(e.target.value as any);
                setPayExchangeRate('');
              }}
              className="mt-1 block w-full rounded-md bg-surface border border-border py-2 pl-3 pr-10 text-foreground outline-none focus:border-fuchsia-500 transition sm:text-sm"
              required
            >
              <option value="USD">USD</option>
              <option value="UZS">UZS</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          {payCurrency === 'OTHER' && (
            <div>
              <label htmlFor="payOtherCurrency" className="block text-sm font-medium text-muted">Other currency</label>
              <input
                id="payOtherCurrency"
                value={payOtherCurrency}
                onChange={(e) => setPayOtherCurrency(e.target.value)}
                placeholder="e.g. EUR"
                className="mt-1 block w-full rounded-md bg-surface border border-border py-2 px-3 text-foreground placeholder:text-muted outline-none focus:border-fuchsia-500 transition sm:text-sm"
                required
              />
            </div>
          )}

          {(payCurrency !== 'USD') && (
            <div>
              <label htmlFor="payExchangeRate" className="block text-sm font-medium text-muted">
                USD→{(payCurrency === 'OTHER' ? (payOtherCurrency || 'XXX') : payCurrency).toUpperCase()} rate
              </label>
              <input
                id="payExchangeRate"
                type="number"
                step="0.000001"
                min="0"
                value={payExchangeRate}
                onChange={(e) => setPayExchangeRate(e.target.value)}
                placeholder={payCurrency === 'UZS' ? 'Optional if rate is already saved for that day' : 'Required'}
                className="mt-1 block w-full rounded-md bg-surface border border-border py-2 px-3 text-foreground placeholder:text-muted outline-none focus:border-fuchsia-500 transition sm:text-sm"
                required={payCurrency === 'OTHER'}
              />
              <p className="mt-1 text-xs text-muted">
                Enter how much <span className="font-semibold">{(payCurrency === 'OTHER' ? (payOtherCurrency || 'XXX') : payCurrency).toUpperCase()}</span>
                {' '}equals <span className="font-semibold">1 USD</span> for the payment date.
              </p>
            </div>
          )}

          <div>
            <label htmlFor="payMethod" className="block text-sm font-medium text-muted">Method</label>
            <select
              id="payMethod"
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as any)}
              className="mt-1 block w-full rounded-md bg-surface border border-border py-2 pl-3 pr-10 text-foreground outline-none focus:border-fuchsia-500 transition sm:text-sm"
              required
            >
              <option value="cash">Cash</option>
              <option value="card">Card</option>
            </select>
          </div>

          <div>
            <label htmlFor="payReference" className="block text-sm font-medium text-muted">Reference (optional)</label>
            <input
              id="payReference"
              value={payReference}
              onChange={(e) => setPayReference(e.target.value)}
              placeholder="Receipt / note"
              className="mt-1 block w-full rounded-md bg-surface border border-border py-2 px-3 text-foreground placeholder:text-muted outline-none focus:border-fuchsia-500 transition sm:text-sm"
            />
          </div>

          {payMethod === 'cash' && (
            <div>
              <label htmlFor="payCashDate" className="block text-sm font-medium text-muted">Cash date</label>
              <input
                id="payCashDate"
                type="date"
                value={payCashDate}
                onChange={(e) => setPayCashDate(e.target.value)}
                className="mt-1 block w-full rounded-md bg-surface border border-border py-2 px-3 text-foreground outline-none focus:border-fuchsia-500 transition sm:text-sm"
                required
              />
            </div>
          )}

          {payMethod === 'card' && (
            <>
              <div>
                <label htmlFor="payCardProvider" className="block text-sm font-medium text-muted">Card provider</label>
                <input
                  id="payCardProvider"
                  value={payCardProvider}
                  onChange={(e) => setPayCardProvider(e.target.value)}
                  placeholder="e.g. Visa / Stripe"
                  className="mt-1 block w-full rounded-md bg-surface border border-border py-2 px-3 text-foreground placeholder:text-muted outline-none focus:border-fuchsia-500 transition sm:text-sm"
                  required
                />
              </div>

              <div>
                <label htmlFor="payCardReference" className="block text-sm font-medium text-muted">Transaction reference</label>
                <input
                  id="payCardReference"
                  value={payCardReference}
                  onChange={(e) => setPayCardReference(e.target.value)}
                  placeholder="Bank / gateway reference"
                  className="mt-1 block w-full rounded-md bg-surface border border-border py-2 px-3 text-foreground placeholder:text-muted outline-none focus:border-fuchsia-500 transition sm:text-sm"
                  required
                />
              </div>
            </>
          )}

          <div className="sm:col-span-2 lg:col-span-6">
            <button
              type="submit"
              disabled={recordingPayment}
              className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {recordingPayment ? 'Recording...' : 'Record payment'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-surface-2 border border-border shadow sm:rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          <div>
            <label htmlFor="dateFrom" className="block text-sm font-medium text-muted">Date from</label>
            <input
              id="dateFrom"
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="mt-1 block w-full rounded-md bg-surface border border-border py-2 px-3 text-foreground outline-none focus:border-fuchsia-500 transition sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="dateTo" className="block text-sm font-medium text-muted">Date to</label>
            <input
              id="dateTo"
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="mt-1 block w-full rounded-md bg-surface border border-border py-2 px-3 text-foreground outline-none focus:border-fuchsia-500 transition sm:text-sm"
            />
          </div>

          {canFilterFirm && (
            <div>
              <label htmlFor="firm" className="block text-sm font-medium text-muted">Firm</label>
              <select
                id="firm"
                value={filterFirmId}
                onChange={(e) => { setFilterFirmId(e.target.value); setPage(1); }}
                className="mt-1 block w-full rounded-md bg-surface border border-border py-2 pl-3 pr-10 text-foreground outline-none focus:border-fuchsia-500 transition sm:text-sm"
              >
                <option value="">All</option>
                {firmOptions.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="flight" className="block text-sm font-medium text-muted">Flight</label>
            <select
              id="flight"
              value={filterFlightId}
              onChange={(e) => { setFilterFlightId(e.target.value); setPage(1); }}
              className="mt-1 block w-full rounded-md bg-surface border border-border py-2 pl-3 pr-10 text-foreground outline-none focus:border-fuchsia-500 transition sm:text-sm"
            >
              <option value="">All</option>
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
            <label htmlFor="type" className="block text-sm font-medium text-muted">Type</label>
            <select
              id="type"
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
              className="mt-1 block w-full rounded-md bg-surface border border-border py-2 pl-3 pr-10 text-foreground outline-none focus:border-fuchsia-500 transition sm:text-sm"
            >
              <option value="">All</option>
              <option value="sale">Sale</option>
              <option value="payable">Payable (Debt)</option>
              <option value="payment">Payment</option>
              <option value="adjustment">Adjustment</option>
            </select>
          </div>

          <div>
            <label htmlFor="currency" className="block text-sm font-medium text-muted">Currency</label>
            <input
              id="currency"
              value={filterCurrency}
              onChange={(e) => { setFilterCurrency(e.target.value); setPage(1); }}
              placeholder="e.g. USD"
              className="mt-1 block w-full rounded-md bg-surface border border-border py-2 px-3 text-foreground placeholder:text-muted outline-none focus:border-fuchsia-500 transition sm:text-sm"
            />
          </div>
        </div>
      </div>

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
              List
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
              Boxes
            </button>
          </div>
        </div>

        {transactionsView === 'list' ? (
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-surface">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Firm / Flight</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Base Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Payment Method</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={7} className="px-6 py-4 text-center">Loading...</td></tr>
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
                    }`}>
                      {t.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted flex flex-col gap-1">
                    <span>Firm: {t.firm?.name || t.firmId || t.firm_id}</span>
                    <span>Flight: {t.flight?.flightNumber || t.flightId || t.flight_id}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground font-semibold">
                    {Number(t.originalAmount || t.original_amount).toFixed(2)} {t.currency}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                    {Number(t.baseAmount || t.base_amount).toFixed(2)} USD
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted capitalize">
                    {t.paymentMethod || t.payment_method || '-'}
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
                    No transactions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <div className="p-4">
            {loading ? (
              <div className="py-6 text-center text-sm text-muted">Loading...</div>
            ) : transactions.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted">No transactions found.</div>
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
                        <span className={`px-2 py-1 rounded-full text-xs font-bold border ${typeClass}`}>
                          {t.type}
                        </span>
                      </div>

                      <div className="mt-3 text-sm text-foreground space-y-1">
                        <div>Firm: {t.firm?.name || t.firmId || t.firm_id}</div>
                        <div>Flight: {t.flight?.flightNumber || t.flightId || t.flight_id}</div>
                      </div>

                      <div className="mt-3 text-sm text-foreground space-y-1">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted">Amount</span>
                          <span className="font-semibold text-foreground">
                            {Number(t.originalAmount || t.original_amount).toFixed(2)} {t.currency}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted">Base</span>
                          <span>{Number(t.baseAmount || t.base_amount).toFixed(2)} USD</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted">Method</span>
                          <span className="capitalize">{t.paymentMethod || t.payment_method || '-'}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted">Reference</span>
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
              <p className="text-sm text-muted">
                Showing{' '}
                <span className="font-medium text-foreground">{loading ? 0 : Math.min((page - 1) * limit + 1, total)}</span>
                {' '}to{' '}
                <span className="font-medium text-foreground">{Math.min(page * limit, total)}</span>
                {' '}of{' '}
                <span className="font-medium text-foreground">{total}</span>
                {' '}results
              </p>
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
                  Page {page} of {totalPages}
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
