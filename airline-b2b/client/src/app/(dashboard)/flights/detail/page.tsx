"use client";

import { useEffect, useState, Suspense, type FormEvent } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Plane, Tag, DollarSign, Briefcase, Activity, CheckCircle, Clock } from 'lucide-react';

function FlightDetailContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const [data, setData] = useState<any>(null);
  const [firms, setFirms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const [ticketsView, setTicketsView] = useState<'list' | 'boxes'>('list');

  // Modal State
  const [isAllocateModalOpen, setIsAllocateModalOpen] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedFirmId, setSelectedFirmId] = useState<string>('');
  const [allocateQuantity, setAllocateQuantity] = useState<string>('1');
  const [allocateBusy, setAllocateBusy] = useState(false);

  const [sellConfirmTicketId, setSellConfirmTicketId] = useState<string | null>(null);
  const [sellBusy, setSellBusy] = useState(false);

  const [sellPrice, setSellPrice] = useState<string>('');
  const [sellCurrency, setSellCurrency] = useState<'USD' | 'UZS' | 'OTHER'>('USD');
  const [sellOtherCurrency, setSellOtherCurrency] = useState<string>('');
  const [sellPurchaserName, setSellPurchaserName] = useState<string>('');
  const [sellPurchaserIdNumber, setSellPurchaserIdNumber] = useState<string>('');
  const [sellPurchaserPhone, setSellPurchaserPhone] = useState<string>('');
  const [sellPurchaserEmail, setSellPurchaserEmail] = useState<string>('');
  const [sellPurchaserNotes, setSellPurchaserNotes] = useState<string>('');

  const [sellBatchModalOpen, setSellBatchModalOpen] = useState(false);
  const [sellBatchQuantity, setSellBatchQuantity] = useState<string>('1');
  const [sellBatchBusy, setSellBatchBusy] = useState(false);

  const [sellBatchPrice, setSellBatchPrice] = useState<string>('');
  const [sellBatchCurrency, setSellBatchCurrency] = useState<'USD' | 'UZS' | 'OTHER'>('USD');
  const [sellBatchOtherCurrency, setSellBatchOtherCurrency] = useState<string>('');
  const [sellBatchPurchaserName, setSellBatchPurchaserName] = useState<string>('');
  const [sellBatchPurchaserIdNumber, setSellBatchPurchaserIdNumber] = useState<string>('');
  const [sellBatchPurchaserPhone, setSellBatchPurchaserPhone] = useState<string>('');
  const [sellBatchPurchaserEmail, setSellBatchPurchaserEmail] = useState<string>('');
  const [sellBatchPurchaserNotes, setSellBatchPurchaserNotes] = useState<string>('');

  const [confirmAllocationTicketId, setConfirmAllocationTicketId] = useState<string | null>(null);
  const [confirmAllocationBusy, setConfirmAllocationBusy] = useState(false);

  const [confirmBatchModalOpen, setConfirmBatchModalOpen] = useState(false);
  const [confirmBatchQuantity, setConfirmBatchQuantity] = useState<string>('1');
  const [confirmBatchBusy, setConfirmBatchBusy] = useState(false);

  const [deallocateConfirm, setDeallocateConfirm] = useState<null | { ticketId: string; status: string }>(null);
  const [deallocateBusy, setDeallocateBusy] = useState(false);

  const fetchData = async () => {
    try {
      if (!id) return;
      const role = String(user?.role || '').toUpperCase();
      const canAllocate = role === 'SUPERADMIN' || role === 'ADMIN';

      const [reportRes, ticketsRes, firmsRes] = await Promise.all([
        api.get(`/reports/flight?flight_id=${id}`),
        api.get(`/tickets?flight_id=${id}`),
        canAllocate ? api.get('/firms') : Promise.resolve({ data: [] }),
      ]);
      
      const report = Array.isArray(reportRes.data) 
        ? reportRes.data.find((r: any) => r.flight_id === Number(id)) || reportRes.data[0] 
        : reportRes.data;

      setData({ report, tickets: ticketsRes.data });
      
      const firmsList = Array.isArray(firmsRes.data) ? firmsRes.data : [];
      setFirms(firmsList);
      if (firmsList.length > 0) setSelectedFirmId(String(firmsList[0].id));

    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to load flight details');
    } finally {
      if (loading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const openAllocateModal = (ticketId: string) => {
    setSelectedTicketId(ticketId);
    setAllocateQuantity('1');
    setIsAllocateModalOpen(true);
  };

  const openAllocateBatchModal = () => {
    setSelectedTicketId(null);
    setAllocateQuantity('1');
    setIsAllocateModalOpen(true);
  };

  const handleAllocateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (allocateBusy) return;
    if (!selectedFirmId) return;
    
    try {
      setAllocateBusy(true);
      if (selectedTicketId) {
        await api.post(`/tickets/allocate`, { ticketId: selectedTicketId, firmId: selectedFirmId });
        toast.success('Allocation created (pending firm confirmation)');
      } else {
        const qty = Number.parseInt(String(allocateQuantity || '').trim(), 10);
        if (!id) {
          toast.error('Missing flight id');
          return;
        }
        if (!Number.isFinite(qty) || qty <= 0) {
          toast.error('Enter a valid quantity');
          return;
        }
        const res = await api.post(`/tickets/allocate`, { flightId: id, firmId: selectedFirmId, quantity: qty });
        const count = res?.data?.count ?? qty;
        toast.success(`Allocated ${count} ticket(s) (pending confirmation)`);
      }
      setIsAllocateModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to allocate ticket');
    } finally {
      setAllocateBusy(false);
    }
  };

  const handleSell = async (ticketId: string, body: any) => {
    try {
      await api.post(`/tickets/sell`, { ticketId, ...body });
      toast.success('Ticket marked as sold');
      fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to sell ticket');
    }
  };

  const openSellConfirm = (ticket: any) => {
    const currencyCode = String(ticket?.currency || 'USD').trim().toUpperCase();
    const price = ticket?.price != null ? String(ticket.price) : '';

    setSellConfirmTicketId(String(ticket?.id || ''));
    setSellPrice(price);
    if (currencyCode === 'USD' || currencyCode === 'UZS') {
      setSellCurrency(currencyCode as any);
      setSellOtherCurrency('');
    } else {
      setSellCurrency('OTHER');
      setSellOtherCurrency(currencyCode);
    }

    setSellPurchaserName('');
    setSellPurchaserIdNumber('');
    setSellPurchaserPhone('');
    setSellPurchaserEmail('');
    setSellPurchaserNotes('');
  };

  const closeSellConfirm = () => {
    if (sellBusy) return;
    setSellConfirmTicketId(null);
  };

  const confirmSell = async () => {
    if (!sellConfirmTicketId || sellBusy) return;

    const currencyCode = (sellCurrency === 'OTHER' ? sellOtherCurrency : sellCurrency).trim().toUpperCase();
    const priceRaw = sellPrice.trim();
    const priceNum = Number(priceRaw);
    if (!priceRaw || !Number.isFinite(priceNum) || priceNum <= 0) {
      toast.error('Enter a valid sale price');
      return;
    }
    if (!/^[A-Z]{3}$/.test(currencyCode)) {
      toast.error('Sale currency must be a 3-letter code (e.g. USD)');
      return;
    }

    const purchaserName = sellPurchaserName.trim();
    const purchaserIdNumber = sellPurchaserIdNumber.trim();
    if (!purchaserName || !purchaserIdNumber) {
      toast.error('Purchaser name and ID are required');
      return;
    }

    const purchaser: any = {
      name: purchaserName,
      idNumber: purchaserIdNumber,
    };
    if (sellPurchaserPhone.trim()) purchaser.phone = sellPurchaserPhone.trim();
    if (sellPurchaserEmail.trim()) purchaser.email = sellPurchaserEmail.trim();
    if (sellPurchaserNotes.trim()) purchaser.notes = sellPurchaserNotes.trim();

    setSellBusy(true);
    try {
      await handleSell(sellConfirmTicketId, {
        salePrice: priceRaw,
        saleCurrency: currencyCode,
        purchaser,
      });
      setSellConfirmTicketId(null);
    } finally {
      setSellBusy(false);
    }
  };

  const openSellBatchModal = () => {
    setSellBatchQuantity('1');
    const firstAssigned = (Array.isArray(data?.tickets) ? data.tickets : []).find((t: any) => t?.status === 'ASSIGNED');
    const currencyCode = String(firstAssigned?.currency || 'USD').trim().toUpperCase();
    const price = firstAssigned?.price != null ? String(firstAssigned.price) : '';

    setSellBatchPrice(price);
    if (currencyCode === 'USD' || currencyCode === 'UZS') {
      setSellBatchCurrency(currencyCode as any);
      setSellBatchOtherCurrency('');
    } else {
      setSellBatchCurrency('OTHER');
      setSellBatchOtherCurrency(currencyCode);
    }
    setSellBatchPurchaserName('');
    setSellBatchPurchaserIdNumber('');
    setSellBatchPurchaserPhone('');
    setSellBatchPurchaserEmail('');
    setSellBatchPurchaserNotes('');
    setSellBatchModalOpen(true);
  };

  const closeSellBatchModal = () => {
    if (sellBatchBusy) return;
    setSellBatchModalOpen(false);
  };

  const confirmSellBatch = async () => {
    if (sellBatchBusy) return;
    const qty = Number.parseInt(String(sellBatchQuantity || '').trim(), 10);
    if (!id) {
      toast.error('Missing flight id');
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error('Enter a valid quantity');
      return;
    }

    const currencyCode = (sellBatchCurrency === 'OTHER' ? sellBatchOtherCurrency : sellBatchCurrency).trim().toUpperCase();
    const priceRaw = sellBatchPrice.trim();
    const priceNum = Number(priceRaw);
    if (!priceRaw || !Number.isFinite(priceNum) || priceNum <= 0) {
      toast.error('Enter a valid sale price');
      return;
    }
    if (!/^[A-Z]{3}$/.test(currencyCode)) {
      toast.error('Sale currency must be a 3-letter code (e.g. USD)');
      return;
    }

    const purchaserName = sellBatchPurchaserName.trim();
    const purchaserIdNumber = sellBatchPurchaserIdNumber.trim();
    if (!purchaserName || !purchaserIdNumber) {
      toast.error('Purchaser name and ID are required');
      return;
    }

    const purchaser: any = {
      name: purchaserName,
      idNumber: purchaserIdNumber,
    };
    if (sellBatchPurchaserPhone.trim()) purchaser.phone = sellBatchPurchaserPhone.trim();
    if (sellBatchPurchaserEmail.trim()) purchaser.email = sellBatchPurchaserEmail.trim();
    if (sellBatchPurchaserNotes.trim()) purchaser.notes = sellBatchPurchaserNotes.trim();

    setSellBatchBusy(true);
    try {
      const res = await api.post('/tickets/sell', {
        flightId: id,
        quantity: qty,
        salePrice: priceRaw,
        saleCurrency: currencyCode,
        purchaser,
      });
      const count = res?.data?.count ?? qty;
      toast.success(`Marked ${count} ticket(s) as sold`);
      setSellBatchModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to sell tickets');
    } finally {
      setSellBatchBusy(false);
    }
  };

  const openConfirmAllocation = (ticketId: string) => {
    setConfirmAllocationTicketId(ticketId);
  };

  const closeConfirmAllocation = () => {
    if (confirmAllocationBusy) return;
    setConfirmAllocationTicketId(null);
  };

  const confirmAllocation = async () => {
    if (!confirmAllocationTicketId || confirmAllocationBusy) return;
    setConfirmAllocationBusy(true);
    try {
      await api.post('/tickets/confirm', { ticketId: confirmAllocationTicketId });
      toast.success('Allocation confirmed');
      setConfirmAllocationTicketId(null);
      fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to confirm allocation');
    } finally {
      setConfirmAllocationBusy(false);
    }
  };

  const openConfirmBatchModal = () => {
    setConfirmBatchQuantity('1');
    setConfirmBatchModalOpen(true);
  };

  const closeConfirmBatchModal = () => {
    if (confirmBatchBusy) return;
    setConfirmBatchModalOpen(false);
  };

  const confirmBatchAllocation = async () => {
    if (confirmBatchBusy) return;
    const qty = Number.parseInt(String(confirmBatchQuantity || '').trim(), 10);
    if (!id) {
      toast.error('Missing flight id');
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error('Enter a valid quantity');
      return;
    }

    setConfirmBatchBusy(true);
    try {
      const res = await api.post('/tickets/confirm', { flightId: id, quantity: qty });
      const count = res?.data?.count ?? qty;
      toast.success(`Confirmed ${count} ticket(s)`);
      setConfirmBatchModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to confirm allocations');
    } finally {
      setConfirmBatchBusy(false);
    }
  };

  const openDeallocateConfirm = (ticketId: string, status: string) => {
    setDeallocateConfirm({ ticketId, status });
  };

  const closeDeallocateConfirm = () => {
    if (deallocateBusy) return;
    setDeallocateConfirm(null);
  };

  const confirmDeallocate = async () => {
    if (!deallocateConfirm || deallocateBusy) return;
    setDeallocateBusy(true);
    try {
      await api.post('/tickets/deallocate', { ticketId: deallocateConfirm.ticketId });
      toast.success(
        deallocateConfirm.status === 'ASSIGNED'
          ? 'Ticket deallocated (debt reversed)'
          : 'Allocation cancelled',
      );
      setDeallocateConfirm(null);
      fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to deallocate ticket');
    } finally {
      setDeallocateBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center text-muted py-12">
        <Plane className="mx-auto h-12 w-12 animate-pulse text-fuchsia-500" />
        <p className="mt-2">Loading flight details...</p>
      </div>
    );
  }

  const summary = data?.report || {};
  const tickets = data?.tickets || [];
  const flightStatusLabel = String(summary?.flight?.status || 'SCHEDULED');
  const flightCancelled = flightStatusLabel.trim().toUpperCase() === 'CANCELLED';

  const role = String(user?.role || '').toUpperCase();
  const canAllocate = ['SUPERADMIN', 'ADMIN'].includes(role);
  const canBatchSell = role === 'FIRM';
  const canConfirmAllocations = role === 'FIRM';

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <h2 className="text-3xl font-bold">Flight #{id} Details</h2>
        <span
          className={
            flightCancelled
              ? 'px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-900/50 text-red-300 border border-red-700'
              : 'px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-900/50 text-green-300 border border-green-700'
          }
        >
          {flightStatusLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
        <div className="bg-surface-2 border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 text-yellow-600 mb-2">
            <Clock size={16} />
            <span className="text-sm font-medium">Total Debt (Payable)</span>
          </div>
          <div className="text-3xl font-bold">${Number(summary.total_allocated || 0).toFixed(2)}</div>
        </div>

        <div className="bg-surface-2 border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 text-green-600 mb-2">
            <Activity size={16} />
            <span className="text-sm font-medium">Total Revenue (Sales)</span>
          </div>
          <div className="text-3xl font-bold">${Number(summary.total_sales || 0).toFixed(2)}</div>
        </div>

        <div className="bg-surface-2 border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 text-fuchsia-600 mb-2">
            <CheckCircle size={16} />
            <span className="text-sm font-medium">Total Payments</span>
          </div>
          <div className="text-3xl font-bold">${Number(summary.total_payments || 0).toFixed(2)}</div>
        </div>

        <div className="bg-surface-2 border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 text-muted mb-2">
            <DollarSign size={16} />
            <span className="text-sm font-medium">Outstanding Debt</span>
          </div>
          <div className="text-3xl font-bold">
            ${Number((summary.total_allocated || 0) - (summary.total_payments || 0)).toFixed(2)}
          </div>
        </div>

        {user?.role?.toUpperCase() !== 'FIRM' && (
          <div className="bg-surface-2 border border-border rounded-lg p-5 lg:col-span-auto">
            <div className="flex items-center gap-2 text-indigo-600 mb-2">
              <span className="text-sm font-medium">Profit (Revenue - Debt)</span>
            </div>
            <div className="text-3xl font-bold text-indigo-600">
              ${Number((summary.total_sales || 0) - (summary.total_allocated || 0)).toFixed(2)}
            </div>
          </div>
        )}
      </div>

      <div className="bg-surface-2 border border-border rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
          <h3 className="text-lg font-bold">Tickets Inventory</h3>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <div className="inline-flex rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setTicketsView('list')}
                aria-pressed={ticketsView === 'list'}
                className={`px-3 py-1 text-sm font-medium transition ${ticketsView === 'list'
                  ? 'bg-surface-2 text-foreground'
                  : 'bg-surface text-muted hover:bg-surface-2'
                }`}
              >
                List
              </button>
              <button
                type="button"
                onClick={() => setTicketsView('boxes')}
                aria-pressed={ticketsView === 'boxes'}
                className={`px-3 py-1 text-sm font-medium transition ${ticketsView === 'boxes'
                  ? 'bg-surface-2 text-foreground'
                  : 'bg-surface text-muted hover:bg-surface-2'
                }`}
              >
                Boxes
              </button>
            </div>
            {canAllocate && (
              <button
                type="button"
                onClick={openAllocateBatchModal}
                disabled={flightCancelled}
                className="px-3 py-1 bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/40 rounded transition border border-yellow-600/50 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Allocate tickets
              </button>
            )}
            {canConfirmAllocations && (
              <button
                type="button"
                onClick={openConfirmBatchModal}
                disabled={flightCancelled}
                className="px-3 py-1 bg-yellow-600/10 text-yellow-300 hover:bg-yellow-600/20 rounded transition border border-yellow-600/30 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm tickets
              </button>
            )}
            {canBatchSell && (
              <button
                type="button"
                onClick={openSellBatchModal}
                disabled={flightCancelled}
                className="px-3 py-1 bg-fuchsia-600/20 text-fuchsia-400 hover:bg-fuchsia-600/40 rounded transition border border-fuchsia-600/50 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Sell tickets
              </button>
            )}
          </div>
        </div>
        {ticketsView === 'list' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface text-sm text-muted">
                  <th className="p-4 font-semibold">Ticket ID</th>
                  <th className="p-4 font-semibold">Status</th>
                  <th className="p-4 font-semibold">Price / Currency</th>
                  <th className="p-4 font-semibold">Assigned Firm</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm">
                {tickets.map((ticket: any) => (
                  <tr key={ticket.id} className="hover:bg-surface transition">
                    <td className="p-4 text-foreground font-medium">
                      <div className="flex items-center gap-2">
                        <Tag size={14} className="text-muted" />
                        {ticket.id.slice(0, 8)}...
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold inline-block border ${
                        ticket.status === 'AVAILABLE' ? 'bg-green-900/30 text-green-400 border-green-700/50' :
                        ticket.status === 'PENDING' ? 'bg-yellow-900/30 text-yellow-400 border-yellow-700/50' :
                        ticket.status === 'ASSIGNED' ? 'bg-fuchsia-900/30 text-fuchsia-300 border-fuchsia-700/50' :
                        'bg-surface text-muted border-border'
                      }`}>
                        {ticket.status}
                      </span>
                    </td>
                    <td className="p-4 text-foreground font-medium">
                      {Number(ticket.price).toFixed(2)} {ticket.currency}
                    </td>
                    <td className="p-4 text-muted">
                      <div className="flex items-center gap-2">
                        {ticket.assignedFirmId && <Briefcase size={14} className="text-muted" />}
                        {ticket.assignedFirm?.name || ticket.assignedFirmId || '—'}
                      </div>
                    </td>
                    <td className="p-4 text-right space-x-3">
                      {canAllocate && ticket.status === 'AVAILABLE' && (
                        <button
                          onClick={() => openAllocateModal(ticket.id)}
                          disabled={flightCancelled}
                          className="px-3 py-1 bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/40 rounded transition border border-yellow-600/50 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Allocate
                        </button>
                      )}
                      {canConfirmAllocations && ticket.status === 'PENDING' && (
                        <button
                          onClick={() => openConfirmAllocation(ticket.id)}
                          disabled={flightCancelled}
                          className="px-3 py-1 bg-yellow-600/20 text-yellow-300 hover:bg-yellow-600/40 rounded transition border border-yellow-600/50 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Confirm
                        </button>
                      )}
                      {ticket.status === 'ASSIGNED' && (
                        <button
                          onClick={() => openSellConfirm(ticket)} 
                          disabled={flightCancelled}
                          className="px-3 py-1 bg-fuchsia-600/20 text-fuchsia-400 hover:bg-fuchsia-600/40 rounded transition border border-fuchsia-600/50 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Mark Sold
                        </button>
                      )}
                      {canAllocate && (ticket.status === 'PENDING' || ticket.status === 'ASSIGNED') && (
                        <button
                          onClick={() => openDeallocateConfirm(ticket.id, ticket.status)}
                          className="px-3 py-1 bg-red-600/10 text-red-300 hover:bg-red-600/20 rounded transition border border-red-600/30 font-medium"
                        >
                          Deallocate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {tickets.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted">
                      <Plane className="mx-auto h-8 w-8 mb-2 opacity-50" />
                      No tickets found for this flight.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6">
            {tickets.length === 0 ? (
              <div className="text-center text-muted py-8">
                <Plane className="mx-auto h-8 w-8 mb-2 opacity-50" />
                No tickets found for this flight.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {tickets.map((ticket: any) => (
                  <div key={ticket.id} className="bg-surface border border-border rounded-lg p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-foreground font-medium">
                        <div className="flex items-center gap-2">
                          <Tag size={14} className="text-muted" />
                          {ticket.id.slice(0, 8)}...
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold inline-block border ${
                        ticket.status === 'AVAILABLE' ? 'bg-green-900/30 text-green-400 border-green-700/50' :
                        ticket.status === 'PENDING' ? 'bg-yellow-900/30 text-yellow-400 border-yellow-700/50' :
                        ticket.status === 'ASSIGNED' ? 'bg-fuchsia-900/30 text-fuchsia-300 border-fuchsia-700/50' :
                        'bg-surface text-muted border-border'
                      }`}>
                        {ticket.status}
                      </span>
                    </div>

                    <div className="mt-3 text-sm text-foreground space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted">Price</span>
                        <span className="font-medium">{Number(ticket.price).toFixed(2)} {ticket.currency}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted">Firm</span>
                        <span className="text-foreground flex items-center gap-2">
                          {ticket.assignedFirmId && <Briefcase size={14} className="text-muted" />}
                          {ticket.assignedFirm?.name || ticket.assignedFirmId || '—'}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-end gap-2 flex-wrap">
                      {canAllocate && ticket.status === 'AVAILABLE' && (
                        <button
                          onClick={() => openAllocateModal(ticket.id)}
                          disabled={flightCancelled}
                          className="px-3 py-1 bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/40 rounded transition border border-yellow-600/50 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Allocate
                        </button>
                      )}
                      {canConfirmAllocations && ticket.status === 'PENDING' && (
                        <button
                          onClick={() => openConfirmAllocation(ticket.id)}
                          disabled={flightCancelled}
                          className="px-3 py-1 bg-yellow-600/20 text-yellow-300 hover:bg-yellow-600/40 rounded transition border border-yellow-600/50 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Confirm
                        </button>
                      )}
                      {ticket.status === 'ASSIGNED' && (
                        <button
                          onClick={() => openSellConfirm(ticket)}
                          disabled={flightCancelled}
                          className="px-3 py-1 bg-fuchsia-600/20 text-fuchsia-400 hover:bg-fuchsia-600/40 rounded transition border border-fuchsia-600/50 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Mark Sold
                        </button>
                      )}
                      {canAllocate && (ticket.status === 'PENDING' || ticket.status === 'ASSIGNED') && (
                        <button
                          onClick={() => openDeallocateConfirm(ticket.id, ticket.status)}
                          className="px-3 py-1 bg-red-600/10 text-red-300 hover:bg-red-600/20 rounded transition border border-red-600/30 font-medium"
                        >
                          Deallocate
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Allocate Modal */}
      {isAllocateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-xl font-bold text-foreground mb-4">
              {selectedTicketId ? 'Allocate ticket' : 'Allocate tickets'}
            </h3>
            
            <form onSubmit={handleAllocateSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-2">Select Firm</label>
                {firms.length > 0 ? (
                  <select
                    className="w-full bg-surface-2 border border-border rounded-lg px-4 py-3 text-foreground outline-none focus:border-fuchsia-500 transition"
                    value={selectedFirmId}
                    onChange={(e) => setSelectedFirmId(e.target.value)}
                    required
                  >
                    <option value="" disabled>-- Select a Firm --</option>
                    {firms.map((f: any) => (
                      <option key={f.id} value={f.id}>
                        {String(f.name || f.id) + ` (ID: ${String(f.id).slice(0, 8)}...)`}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    className="w-full bg-surface-2 border border-border rounded-lg px-4 py-3 text-foreground placeholder:text-muted outline-none focus:border-fuchsia-500 transition"
                    placeholder="Enter Firm UUID"
                    value={selectedFirmId}
                    onChange={(e) => setSelectedFirmId(e.target.value)}
                  />
                )}
              </div>

              {!selectedTicketId && (
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">Quantity</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    required
                    className="w-full bg-surface-2 border border-border rounded-lg px-4 py-3 text-foreground outline-none focus:border-fuchsia-500 transition"
                    placeholder="1"
                    value={allocateQuantity}
                    onChange={(e) => setAllocateQuantity(e.target.value)}
                    disabled={allocateBusy}
                  />
                  <p className="mt-1 text-xs text-muted">
                    Creates a pending allocation (firm must confirm).
                  </p>
                </div>
              )}
              
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAllocateModalOpen(false)}
                  disabled={allocateBusy}
                  className="px-4 py-2 bg-surface-2 hover:bg-surface text-foreground rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={allocateBusy}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {allocateBusy ? 'Allocating…' : 'Allocate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {sellConfirmTicketId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-sm p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-foreground mb-2">Sell ticket</h3>
            <p className="text-sm text-muted">
              This will mark the ticket as <span className="text-foreground font-semibold">SOLD</span> and create a <span className="text-foreground font-semibold">SALE</span> transaction.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-muted mb-1">Sale price (per ticket)</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                  disabled={sellBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-fuchsia-500 transition"
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">Sale currency</label>
                <select
                  value={sellCurrency}
                  onChange={(e) => setSellCurrency(e.target.value as any)}
                  disabled={sellBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-fuchsia-500 transition"
                >
                  <option value="USD">USD</option>
                  <option value="UZS">UZS</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              {sellCurrency === 'OTHER' && (
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">Other currency (3-letter)</label>
                  <input
                    value={sellOtherCurrency}
                    onChange={(e) => setSellOtherCurrency(e.target.value)}
                    disabled={sellBusy}
                    className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-fuchsia-500 transition"
                    placeholder="e.g. EUR"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-muted mb-1">Purchaser full name</label>
                <input
                  value={sellPurchaserName}
                  onChange={(e) => setSellPurchaserName(e.target.value)}
                  disabled={sellBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-fuchsia-500 transition"
                  placeholder="e.g. John Doe"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">Purchaser ID / Passport</label>
                <input
                  value={sellPurchaserIdNumber}
                  onChange={(e) => setSellPurchaserIdNumber(e.target.value)}
                  disabled={sellBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-fuchsia-500 transition"
                  placeholder="ID number"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">Phone (optional)</label>
                <input
                  value={sellPurchaserPhone}
                  onChange={(e) => setSellPurchaserPhone(e.target.value)}
                  disabled={sellBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-fuchsia-500 transition"
                  placeholder="+998…"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">Email (optional)</label>
                <input
                  value={sellPurchaserEmail}
                  onChange={(e) => setSellPurchaserEmail(e.target.value)}
                  disabled={sellBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-fuchsia-500 transition"
                  placeholder="email@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">Notes (optional)</label>
                <textarea
                  value={sellPurchaserNotes}
                  onChange={(e) => setSellPurchaserNotes(e.target.value)}
                  disabled={sellBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-fuchsia-500 transition"
                  rows={2}
                  placeholder="Any extra info"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeSellConfirm}
                disabled={sellBusy}
                className="px-4 py-2 bg-surface-2 hover:bg-surface text-foreground rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSell}
                disabled={sellBusy}
                className="px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sellBusy ? 'Selling…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmAllocationTicketId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-xl font-bold text-foreground mb-2">Confirm allocation</h3>
            <p className="text-sm text-muted">
              Confirm this allocation? This will set the ticket to <span className="text-foreground font-semibold">ASSIGNED</span>
              {' '}and create a <span className="text-foreground font-semibold">PAYABLE</span> (debt) transaction.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeConfirmAllocation}
                disabled={confirmAllocationBusy}
                className="px-4 py-2 bg-surface-2 hover:bg-surface text-foreground rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmAllocation}
                disabled={confirmAllocationBusy}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {confirmAllocationBusy ? 'Confirming…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmBatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-xl font-bold text-foreground mb-2">Confirm tickets</h3>
            <p className="text-sm text-muted">
              Confirm <span className="text-foreground font-semibold">N</span> pending allocations for this flight.
              This will create PAYABLE transactions.
            </p>

            <div className="mt-4">
              <label className="block text-sm font-medium text-muted mb-2">Quantity</label>
              <input
                type="number"
                min={1}
                step={1}
                required
                className="w-full bg-surface-2 border border-border rounded-lg px-4 py-3 text-foreground outline-none focus:border-fuchsia-500 transition"
                value={confirmBatchQuantity}
                onChange={(e) => setConfirmBatchQuantity(e.target.value)}
                disabled={confirmBatchBusy}
              />
              <p className="mt-1 text-xs text-muted">
                Uses the earliest pending tickets for this flight.
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeConfirmBatchModal}
                disabled={confirmBatchBusy}
                className="px-4 py-2 bg-surface-2 hover:bg-surface text-foreground rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmBatchAllocation}
                disabled={confirmBatchBusy}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {confirmBatchBusy ? 'Confirming…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deallocateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-xl font-bold text-foreground mb-2">Confirm deallocation</h3>
            <p className="text-sm text-muted">
              Deallocate this ticket? {deallocateConfirm.status === 'ASSIGNED'
                ? (
                    <span>
                      This will reverse the PAYABLE (debt) transaction.
                    </span>
                  )
                : (
                    <span>
                      This will cancel the pending allocation.
                    </span>
                  )}
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDeallocateConfirm}
                disabled={deallocateBusy}
                className="px-4 py-2 bg-surface-2 hover:bg-surface text-foreground rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeallocate}
                disabled={deallocateBusy}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deallocateBusy ? 'Deallocating…' : 'Deallocate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {sellBatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-sm p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-foreground mb-2">Confirm batch sale</h3>
            <p className="text-sm text-muted">
              Mark <span className="text-foreground font-semibold">N</span> of your assigned tickets as{' '}
              <span className="text-foreground font-semibold">SOLD</span>. This will create SALE transactions.
            </p>

            <div className="mt-4">
              <label className="block text-sm font-medium text-muted mb-2">Quantity</label>
              <input
                type="number"
                min={1}
                step={1}
                required
                className="w-full bg-surface-2 border border-border rounded-lg px-4 py-3 text-foreground outline-none focus:border-fuchsia-500 transition"
                value={sellBatchQuantity}
                onChange={(e) => setSellBatchQuantity(e.target.value)}
                disabled={sellBatchBusy}
              />
              <p className="mt-1 text-xs text-muted">
                Uses the earliest assigned (unsold) tickets for this flight.
              </p>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-muted mb-1">Sale price (per ticket)</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={sellBatchPrice}
                  onChange={(e) => setSellBatchPrice(e.target.value)}
                  disabled={sellBatchBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-fuchsia-500 transition"
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">Sale currency</label>
                <select
                  value={sellBatchCurrency}
                  onChange={(e) => setSellBatchCurrency(e.target.value as any)}
                  disabled={sellBatchBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-fuchsia-500 transition"
                >
                  <option value="USD">USD</option>
                  <option value="UZS">UZS</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              {sellBatchCurrency === 'OTHER' && (
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">Other currency (3-letter)</label>
                  <input
                    value={sellBatchOtherCurrency}
                    onChange={(e) => setSellBatchOtherCurrency(e.target.value)}
                    disabled={sellBatchBusy}
                    className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-fuchsia-500 transition"
                    placeholder="e.g. EUR"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-muted mb-1">Purchaser full name</label>
                <input
                  value={sellBatchPurchaserName}
                  onChange={(e) => setSellBatchPurchaserName(e.target.value)}
                  disabled={sellBatchBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-fuchsia-500 transition"
                  placeholder="e.g. John Doe"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">Purchaser ID / Passport</label>
                <input
                  value={sellBatchPurchaserIdNumber}
                  onChange={(e) => setSellBatchPurchaserIdNumber(e.target.value)}
                  disabled={sellBatchBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-fuchsia-500 transition"
                  placeholder="ID number"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">Phone (optional)</label>
                <input
                  value={sellBatchPurchaserPhone}
                  onChange={(e) => setSellBatchPurchaserPhone(e.target.value)}
                  disabled={sellBatchBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-fuchsia-500 transition"
                  placeholder="+998…"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">Email (optional)</label>
                <input
                  value={sellBatchPurchaserEmail}
                  onChange={(e) => setSellBatchPurchaserEmail(e.target.value)}
                  disabled={sellBatchBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-fuchsia-500 transition"
                  placeholder="email@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">Notes (optional)</label>
                <textarea
                  value={sellBatchPurchaserNotes}
                  onChange={(e) => setSellBatchPurchaserNotes(e.target.value)}
                  disabled={sellBatchBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-fuchsia-500 transition"
                  rows={2}
                  placeholder="Any extra info"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeSellBatchModal}
                disabled={sellBatchBusy}
                className="px-4 py-2 bg-surface-2 hover:bg-surface text-foreground rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSellBatch}
                disabled={sellBatchBusy}
                className="px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sellBatchBusy ? 'Selling…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FlightDetailsPage() {
  return (
    <Suspense fallback={
      <div className="text-center text-muted py-12">
        <Plane className="mx-auto h-12 w-12 animate-pulse text-fuchsia-500" />
      </div>
    }>
      <FlightDetailContent />
    </Suspense>
  )
}
