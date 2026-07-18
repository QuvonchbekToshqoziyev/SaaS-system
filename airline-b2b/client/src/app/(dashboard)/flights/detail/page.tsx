"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useState, Suspense, type FormEvent } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Plane, Tag, DollarSign, Briefcase, Activity, CheckCircle, Clock } from 'lucide-react';

function FlightDetailContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const [data, setData] = useState<any>(null);
  const [allocations, setAllocations] = useState<any[]>([]);
  const [allocationChangeRequests, setAllocationChangeRequests] = useState<any[]>([]);
  const [firms, setFirms] = useState<any[]>([]);
  const [kassaDesks, setKassaDesks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const { user } = useAuth();
  const { tr } = useLanguage();

  const [ticketsView] = useState<'list'>('list');
  const [ticketSearch, setTicketSearch] = useState('');

  // Modal State
  const [isAllocateModalOpen, setIsAllocateModalOpen] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedFirmId, setSelectedFirmId] = useState<string>('');
  const [allocationSourceFirmId, setAllocationSourceFirmId] = useState<string>('');
  const [allocateQuantity, setAllocateQuantity] = useState<string>('1');
  const [allocatePrice, setAllocatePrice] = useState<string>('');
  const [allocateProductType, setAllocateProductType] = useState<'ROUND_TRIP' | 'ONE_WAY'>('ROUND_TRIP');
  const [allocateDirection, setAllocateDirection] = useState<'OUTBOUND' | 'RETURN'>('OUTBOUND');
  const [allocateCurrency, setAllocateCurrency] = useState<'USD' | 'UZS'>('UZS');
  const [allocatePricingMode, setAllocatePricingMode] = useState<'SAME' | 'MIXED'>('SAME');
  const [allocationRows, setAllocationRows] = useState<Array<{ quantity: string; price: string }>>([{ quantity: '1', price: '' }]);
  const [allocateBusy, setAllocateBusy] = useState(false);

  const [sellConfirmTicketId, setSellConfirmTicketId] = useState<string | null>(null);
  const [sellBusy, setSellBusy] = useState(false);

  const [sellPrice, setSellPrice] = useState<string>('');
  const [sellProductType, setSellProductType] = useState<'ROUND_TRIP' | 'ONE_WAY'>('ROUND_TRIP');
  const [sellDirection, setSellDirection] = useState<'OUTBOUND' | 'RETURN'>('OUTBOUND');
  const [sellCurrency, setSellCurrency] = useState<'USD' | 'UZS' | 'OTHER'>('UZS');
  const [sellOtherCurrency, setSellOtherCurrency] = useState<string>('');
  const [sellExchangeRate, setSellExchangeRate] = useState<string>('');
  const [sellPurchaserName, setSellPurchaserName] = useState<string>('');
  const [sellPurchaserIdNumber, setSellPurchaserIdNumber] = useState<string>('');
  const [sellPurchaserPhone, setSellPurchaserPhone] = useState<string>('');
  const [sellPurchaserEmail, setSellPurchaserEmail] = useState<string>('');
  const [sellPurchaserNotes, setSellPurchaserNotes] = useState<string>('');
  const [sellFirmId, setSellFirmId] = useState<string>('');
  const [sellKassaDeskId, setSellKassaDeskId] = useState<string>('');

  const [sellBatchModalOpen, setSellBatchModalOpen] = useState(false);
  const [sellBatchQuantity, setSellBatchQuantity] = useState<string>('1');
  const [sellBatchBusy, setSellBatchBusy] = useState(false);

  const [sellBatchPrice, setSellBatchPrice] = useState<string>('');
  const [sellBatchProductType, setSellBatchProductType] = useState<'ROUND_TRIP' | 'ONE_WAY'>('ROUND_TRIP');
  const [sellBatchDirection, setSellBatchDirection] = useState<'OUTBOUND' | 'RETURN'>('OUTBOUND');
  const [sellBatchCurrency, setSellBatchCurrency] = useState<'USD' | 'UZS' | 'OTHER'>('UZS');
  const [sellBatchOtherCurrency, setSellBatchOtherCurrency] = useState<string>('');
  const [sellBatchExchangeRate, setSellBatchExchangeRate] = useState<string>('');
  const [sellBatchPurchaserName, setSellBatchPurchaserName] = useState<string>('');
  const [sellBatchPurchaserIdNumber, setSellBatchPurchaserIdNumber] = useState<string>('');
  const [sellBatchPurchaserPhone, setSellBatchPurchaserPhone] = useState<string>('');
  const [sellBatchPurchaserEmail, setSellBatchPurchaserEmail] = useState<string>('');
  const [sellBatchPurchaserNotes, setSellBatchPurchaserNotes] = useState<string>('');
  const [sellBatchFirmId, setSellBatchFirmId] = useState<string>('');
  const [sellBatchKassaDeskId, setSellBatchKassaDeskId] = useState<string>('');

  const [confirmAllocationTicketId, setConfirmAllocationTicketId] = useState<string | null>(null);
  const [confirmAllocationBusy, setConfirmAllocationBusy] = useState(false);
  const [rejectAllocationModal, setRejectAllocationModal] = useState<any>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectAllocationBusy, setRejectAllocationBusy] = useState(false);
  const [editAllocation, setEditAllocation] = useState<any>(null);
  const [editAllocationRows, setEditAllocationRows] = useState<Array<{ quantity: string; price: string }>>([]);
  const [editAllocationNote, setEditAllocationNote] = useState('');
  const [editAllocationReason, setEditAllocationReason] = useState('');
  const [editAllocationBusy, setEditAllocationBusy] = useState(false);
  const [cancelAllocation, setCancelAllocation] = useState<any>(null);
  const [cancelAllocationQuantity, setCancelAllocationQuantity] = useState('1');
  const [cancelAllocationReason, setCancelAllocationReason] = useState('');
  const [cancelAllocationBusy, setCancelAllocationBusy] = useState(false);
  const [changeRequestBusyId, setChangeRequestBusyId] = useState<string | null>(null);

  const [deallocateConfirm, setDeallocateConfirm] = useState<null | { ticketId: string; status: string }>(null);
  const [deallocateBusy, setDeallocateBusy] = useState(false);

  const [pendingSaleCancelRequests, setPendingSaleCancelRequests] = useState<any[]>([]);

  const [saleCancelRequestTicketId, setSaleCancelRequestTicketId] = useState<string | null>(null);
  const [saleCancelRequestReason, setSaleCancelRequestReason] = useState<string>('');
  const [saleCancelRequestBusy, setSaleCancelRequestBusy] = useState(false);

  const [saleCancelApprove, setSaleCancelApprove] = useState<null | { requestId: string; ticketId: string; firmReason: string }>(null);
  const [saleCancelDecisionReason, setSaleCancelDecisionReason] = useState<string>('');
  const [saleCancelApproveBusy, setSaleCancelApproveBusy] = useState(false);

  const fetchData = async () => {
    try {
      if (!id) return;
      setLoadError('');
      const role = String(user?.role || '').toUpperCase();
      const firmRole = user?.firmRole || 'FIRM_ADMIN';
      const canManageFirmWork = role !== 'FIRM' || firmRole === 'FIRM_ADMIN' || firmRole === 'MANAGER';
      const canAllocateTickets = role === 'FIRM' && canManageFirmWork;

      const [reportRes, ticketsRes, allocationsRes, allocationChangeRes, firmsRes, cancelReqRes, desksRes] = await Promise.all([
        api.get(`/reports/flight?flight_id=${id}`),
        api.get(`/tickets?flight_id=${id}`),
        api.get(`/tickets/allocations?flight_id=${id}`),
        api.get(`/tickets/allocation-change-requests?flight_id=${id}`),
        canAllocateTickets ? api.get('/tickets/allocation-targets') : Promise.resolve({ data: [] as any[] }),
        api.get(`/tickets/cancel-sale-requests?flight_id=${id}&status=PENDING`).catch(() => ({ data: [] })),
        api.get('/kassa/desks').catch(() => ({ data: [] })),
      ]);
      
      const report = Array.isArray(reportRes.data) 
        ? reportRes.data.find((r: any) => r.flight_id === Number(id)) || reportRes.data[0] 
        : reportRes.data;

      setData({ report, tickets: ticketsRes.data });
      setAllocations(Array.isArray(allocationsRes.data) ? allocationsRes.data : []);
      setAllocationChangeRequests(Array.isArray(allocationChangeRes.data) ? allocationChangeRes.data : []);

      const pendingRequests = Array.isArray((cancelReqRes as any)?.data) ? (cancelReqRes as any).data : [];
      setPendingSaleCancelRequests(pendingRequests);
      
      const firmsList = (Array.isArray(firmsRes.data) ? firmsRes.data : [])
        .filter((firm: any) => String(firm?.id || '') !== String(user?.firmId || ''))
        .filter((firm: any) => String(firm?.kind || '').toUpperCase() !== 'AIRLINE');
      setFirms(firmsList);
      setKassaDesks(Array.isArray((desksRes as any).data) ? (desksRes as any).data : []);
      if (firmsList.length > 0) setSelectedFirmId(String(firmsList[0].id));

    } catch (err: any) {
      const message = err?.response?.data?.error || tr('Failed to load flight details', 'Reys tafsilotlarini yuklab bo\'lmadi');
      setLoadError(message);
      toast.error(message);
    } finally {
      if (loading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id, user?.id, user?.role, user?.firmId, user?.firmRole]);

  const loadAllocationTargets = async (sourceFirmId: string) => {
    const res = await api.get('/tickets/allocation-targets', { params: { sourceFirmId } });
    const rows = Array.isArray(res.data) ? res.data : [];
    setFirms(rows);
    setSelectedFirmId(rows[0]?.id ? String(rows[0].id) : '');
  };

  const openAllocateModal = async (ticketId: string) => {
    setSelectedTicketId(ticketId);
    setAllocateQuantity('1');
    const ticket = Array.isArray(data?.tickets) ? data.tickets.find((t: any) => String(t.id) === String(ticketId)) : null;
    const productType = ticket?.availableRoundTrip ? 'ROUND_TRIP' : 'ONE_WAY';
    const direction = ticket?.availableOutbound ? 'OUTBOUND' : 'RETURN';
    const selectedLeg = (ticket?.legs || []).find((leg: any) => leg.direction === direction);
    const suggestedPrice = productType === 'ROUND_TRIP' ? ticket?.price : selectedLeg?.acquisitionCostSnapshot;
    setAllocateProductType(productType);
    setAllocateDirection(direction);
    setAllocateCurrency(['USD', 'UZS'].includes(String(ticket?.currency || '').toUpperCase()) ? String(ticket.currency).toUpperCase() as 'USD' | 'UZS' : 'UZS');
    setAllocatePrice(suggestedPrice != null ? String(suggestedPrice) : '');
    setAllocatePricingMode('SAME');
    setAllocationRows([{ quantity: '1', price: suggestedPrice != null ? String(suggestedPrice) : '' }]);
    const sourceFirmId = String(ticket?.assignedFirmId || user?.firmId || '');
    if (!sourceFirmId) return toast.error(tr('Ticket source firm is missing', 'Chipta egasi bo\'lgan firma topilmadi'));
    setAllocationSourceFirmId(sourceFirmId);
    try {
      await loadAllocationTargets(sourceFirmId);
    } catch (err: any) {
      return toast.error(err?.response?.data?.error || tr('Failed to load firms', 'Firmalarni yuklab bo\'lmadi'));
    }
    setIsAllocateModalOpen(true);
  };

  const openAllocateBatchModal = async () => {
    setSelectedTicketId(null);
    setAllocateQuantity('1');
    const firstAvailable = Array.isArray(data?.tickets)
      ? data.tickets.find((t: any) => t.canAllocate !== false && ['AVAILABLE', 'ASSIGNED'].includes(String(t.status).toUpperCase()) && !t.soldPrice)
      : null;
    setAllocatePrice(firstAvailable?.price != null ? String(firstAvailable.price) : '');
    setAllocatePricingMode('SAME');
    setAllocationRows([{ quantity: '1', price: firstAvailable?.price != null ? String(firstAvailable.price) : '' }]);
    const rtAvailable = Number(data?.report?.inventorySummary?.rtOw?.availableRoundTripCount || 0) > 0;
    const outboundAvailable = Number(data?.report?.inventorySummary?.rtOw?.availableOutboundLegCount || 0) > 0;
    setAllocateProductType(rtAvailable ? 'ROUND_TRIP' : 'ONE_WAY');
    setAllocateDirection(outboundAvailable ? 'OUTBOUND' : 'RETURN');
    setAllocateCurrency(['USD', 'UZS'].includes(String(firstAvailable?.currency || '').toUpperCase()) ? String(firstAvailable.currency).toUpperCase() as 'USD' | 'UZS' : 'UZS');
    const sourceFirmId = String(firstAvailable?.assignedFirmId || user?.firmId || '');
    if (!sourceFirmId) return toast.error(tr('No source inventory is available', 'Yuborish uchun chipta zaxirasi topilmadi'));
    setAllocationSourceFirmId(sourceFirmId);
    try {
      await loadAllocationTargets(sourceFirmId);
    } catch (err: any) {
      return toast.error(err?.response?.data?.error || tr('Failed to load firms', 'Firmalarni yuklab bo\'lmadi'));
    }
    setIsAllocateModalOpen(true);
  };

  const updateAllocationRow = (index: number, patch: Partial<{ quantity: string; price: string }>) => {
    setAllocationRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  };

  const addAllocationRow = () => {
    setAllocationRows((rows) => [...rows, { quantity: '1', price: allocatePrice || rows[rows.length - 1]?.price || '' }]);
  };

  const removeAllocationRow = (index: number) => {
    setAllocationRows((rows) => rows.length <= 1 ? rows : rows.filter((_, rowIndex) => rowIndex !== index));
  };

  const handleAllocateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (allocateBusy) return;
    if (!selectedFirmId) return;
    const useMixedPrices = !selectedTicketId && allocatePricingMode === 'MIXED';
    const normalizedRows = useMixedPrices
      ? allocationRows.map((row) => ({
          quantity: Number.parseInt(String(row.quantity || '').trim(), 10),
          price: String(row.price || '').trim(),
          priceNumber: Number(String(row.price || '').trim()),
        }))
      : [];
    const priceNum = Number(allocatePrice);
    if (!useMixedPrices && (!allocatePrice.trim() || !Number.isFinite(priceNum) || priceNum <= 0)) {
      toast.error(tr('Enter allocation price', 'Ajratma narxini kiriting'));
      return;
    }
    if (useMixedPrices) {
      const hasInvalidRow = normalizedRows.some((row) => !Number.isFinite(row.quantity) || row.quantity <= 0 || !row.price || !Number.isFinite(row.priceNumber) || row.priceNumber <= 0);
      if (hasInvalidRow) {
        toast.error(tr('Enter valid quantity and price for every row', 'Har bir qator uchun to\'g\'ri miqdor va narx kiriting'));
        return;
      }
    }
    
    try {
      setAllocateBusy(true);
      if (selectedTicketId) {
        const res = await api.post(`/tickets/allocate`, {
          ticketId: selectedTicketId, firmId: selectedFirmId, sourceFirmId: allocationSourceFirmId,
          allocationPrice: allocatePrice.trim(), productType: allocateProductType,
          direction: allocateProductType === 'ONE_WAY' ? allocateDirection : undefined, currency: allocateCurrency,
        });
        toast.success(res?.data?.status === 'ACCEPTED'
          ? tr('Ticket allocated and confirmed automatically', 'Chipta ajratildi va avtomatik tasdiqlandi')
          : tr('Allocation created (pending firm confirmation)', 'Ajratma yaratildi (firma tasdig‘i kutilmoqda)'));
      } else {
        const qty = useMixedPrices
          ? normalizedRows.reduce((sum, row) => sum + row.quantity, 0)
          : Number.parseInt(String(allocateQuantity || '').trim(), 10);
        if (!id) {
          toast.error('Missing flight id');
          return;
        }
        if (!Number.isFinite(qty) || qty <= 0) {
          toast.error('Enter a valid quantity');
          return;
        }
        const payload = useMixedPrices
          ? {
              flightId: id,
              firmId: selectedFirmId,
              sourceFirmId: allocationSourceFirmId,
              productType: allocateProductType,
              direction: allocateProductType === 'ONE_WAY' ? allocateDirection : undefined,
              currency: allocateCurrency,
              allocationRows: normalizedRows.map((row) => ({ quantity: row.quantity, price: row.price })),
            }
          : {
              flightId: id, firmId: selectedFirmId, sourceFirmId: allocationSourceFirmId, quantity: qty,
              allocationPrice: allocatePrice.trim(), productType: allocateProductType,
              direction: allocateProductType === 'ONE_WAY' ? allocateDirection : undefined, currency: allocateCurrency,
            };
        const res = await api.post(`/tickets/allocate`, payload);
        const count = res?.data?.count ?? (useMixedPrices ? normalizedRows.reduce((sum, row) => sum + row.quantity, 0) : qty);
        toast.success(res?.data?.status === 'ACCEPTED'
          ? tr(`${count} ticket(s) allocated and confirmed automatically`, `${count} ta chipta ajratildi va avtomatik tasdiqlandi`)
          : tr(`${count} ticket(s) allocated (pending confirmation)`, `${count} ta chipta ajratildi (tasdiq kutilmoqda)`));
      }
      setIsAllocateModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to allocate ticket');
    } finally {
      setAllocateBusy(false);
    }
  };

  const sellDeskOptions = useMemo(
    () => kassaDesks.filter((desk) => !sellFirmId || String(desk.firmId) === sellFirmId),
    [kassaDesks, sellFirmId],
  );
  const sellBatchDeskOptions = useMemo(
    () => kassaDesks.filter((desk) => !sellBatchFirmId || String(desk.firmId) === sellBatchFirmId),
    [kassaDesks, sellBatchFirmId],
  );
  const confirmAllocationTicket = useMemo(
    () => allocations.find((allocation: any) => String(allocation?.id || '') === String(confirmAllocationTicketId || '')),
    [allocations, confirmAllocationTicketId],
  );

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
    const currencyCode = String(ticket?.currency || 'UZS').trim().toUpperCase();
    const price = ticket?.price != null ? String(ticket.price) : '';

    setSellConfirmTicketId(String(ticket?.id || ''));
    const productType = ticket?.availableRoundTrip ? 'ROUND_TRIP' : 'ONE_WAY';
    setSellProductType(productType);
    setSellDirection(ticket?.availableOutbound ? 'OUTBOUND' : 'RETURN');
    const ticketFirmId = String(ticket?.assignedFirmId || user?.firmId || '');
    setSellFirmId(ticketFirmId);
    const firstDesk = kassaDesks.find((desk) => String(desk.firmId) === ticketFirmId);
    setSellKassaDeskId(firstDesk ? String(firstDesk.id) : '');
    setSellPrice(price);
    if (currencyCode === 'USD' || currencyCode === 'UZS') {
      setSellCurrency(currencyCode as any);
      setSellOtherCurrency('');
    } else {
      setSellCurrency('OTHER');
      setSellOtherCurrency(currencyCode);
    }
    setSellExchangeRate('');

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
      toast.error('Sale currency must be a 3-letter code (e.g. UZS)');
      return;
    }
    if (currencyCode !== 'UZS' && (!Number.isFinite(Number(sellExchangeRate)) || Number(sellExchangeRate) <= 0)) {
      toast.error(tr('Enter a valid exchange rate', 'To‘g‘ri valyuta kursini kiriting'));
      return;
    }

    const purchaserName = sellPurchaserName.trim();
    const purchaserIdNumber = sellPurchaserIdNumber.trim();
    if (!purchaserName || !purchaserIdNumber) {
      toast.error('Purchaser name and ID are required');
      return;
    }
    if (sellDeskOptions.length > 0 && !sellKassaDeskId) {
      toast.error(tr('Select a kassa desk', 'Kassani tanlang'));
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
        exchangeRate: currencyCode !== 'UZS' ? sellExchangeRate.trim() : undefined,
        purchaser,
        kassaDeskId: sellKassaDeskId || undefined,
        productType: sellProductType,
        direction: sellProductType === 'ONE_WAY' ? sellDirection : undefined,
      });
      setSellConfirmTicketId(null);
    } finally {
      setSellBusy(false);
    }
  };

  const openSellBatchModal = () => {
    setSellBatchQuantity('1');
    const firstAssigned = (Array.isArray(data?.tickets) ? data.tickets : []).find((t: any) => t?.status === 'ASSIGNED');
    const currencyCode = String(firstAssigned?.currency || 'UZS').trim().toUpperCase();
    const price = firstAssigned?.price != null ? String(firstAssigned.price) : '';

    setSellBatchPrice(price);
    const rtAvailable = Number(data?.report?.inventorySummary?.rtOw?.availableRoundTripCount || 0) > 0;
    const outboundAvailable = Number(data?.report?.inventorySummary?.rtOw?.availableOutboundLegCount || 0) > 0;
    setSellBatchProductType(rtAvailable ? 'ROUND_TRIP' : 'ONE_WAY');
    setSellBatchDirection(outboundAvailable ? 'OUTBOUND' : 'RETURN');
    if (currencyCode === 'USD' || currencyCode === 'UZS') {
      setSellBatchCurrency(currencyCode as any);
      setSellBatchOtherCurrency('');
    } else {
      setSellBatchCurrency('OTHER');
      setSellBatchOtherCurrency(currencyCode);
    }
    setSellBatchExchangeRate('');
    setSellBatchPurchaserName('');
    setSellBatchPurchaserIdNumber('');
    setSellBatchPurchaserPhone('');
    setSellBatchPurchaserEmail('');
    setSellBatchPurchaserNotes('');
    const role = String(user?.role || '').toUpperCase();
    const assignedFirmIds = Array.from(new Set<string>(
      (Array.isArray(data?.tickets) ? data.tickets : [])
        .filter((ticket: any) => String(ticket?.status || '').toUpperCase() === 'ASSIGNED')
        .map((ticket: any) => ticket?.assignedFirmId)
        .filter(Boolean)
        .map(String),
    ));
    const sellerFirmId = role === 'FIRM'
      ? String(user?.firmId || '')
      : assignedFirmIds.length === 1
        ? assignedFirmIds[0]
        : '';
    setSellBatchFirmId(sellerFirmId);
    const firstDesk = kassaDesks.find((desk) => String(desk.firmId) === sellerFirmId);
    setSellBatchKassaDeskId(firstDesk ? String(firstDesk.id) : '');
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
      toast.error('Sale currency must be a 3-letter code (e.g. UZS)');
      return;
    }
    if (currencyCode !== 'UZS' && (!Number.isFinite(Number(sellBatchExchangeRate)) || Number(sellBatchExchangeRate) <= 0)) {
      toast.error(tr('Enter a valid exchange rate', 'To‘g‘ri valyuta kursini kiriting'));
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

    const role = String(user?.role || '').toUpperCase();
    const assignedFirmIds = Array.from(new Set<string>(
      (Array.isArray(data?.tickets) ? data.tickets : [])
        .filter((ticket: any) => String(ticket?.status || '').toUpperCase() === 'ASSIGNED')
        .map((ticket: any) => ticket?.assignedFirmId)
        .filter(Boolean)
        .map(String),
    ));
    const sellerFirmId = role === 'FIRM'
      ? String(user?.firmId || '')
      : assignedFirmIds.length === 1
        ? assignedFirmIds[0]
        : '';

    if (!sellerFirmId) {
      toast.error(tr('Sell tickets one by one when multiple firms are assigned.', 'Bir nechta firma biriktirilgan bo‘lsa, chiptalarni bittalab soting.'));
      return;
    }
    if (sellBatchDeskOptions.length > 0 && !sellBatchKassaDeskId) {
      toast.error(tr('Select a kassa desk', 'Kassani tanlang'));
      return;
    }

    setSellBatchBusy(true);
    try {
      const res = await api.post('/tickets/sell', {
        flightId: id,
        firmId: sellerFirmId,
        quantity: qty,
        salePrice: priceRaw,
        saleCurrency: currencyCode,
        exchangeRate: currencyCode !== 'UZS' ? sellBatchExchangeRate.trim() : undefined,
        purchaser,
        kassaDeskId: sellBatchKassaDeskId || undefined,
        productType: sellBatchProductType,
        direction: sellBatchProductType === 'ONE_WAY' ? sellBatchDirection : undefined,
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

  const openConfirmAllocation = (allocationId: string) => {
    setConfirmAllocationTicketId(allocationId);
  };

  const closeConfirmAllocation = () => {
    if (confirmAllocationBusy) return;
    setConfirmAllocationTicketId(null);
  };

  const confirmAllocation = async () => {
    if (!confirmAllocationTicketId || confirmAllocationBusy) return;
    setConfirmAllocationBusy(true);
    try {
      await api.post('/tickets/confirm', { allocationId: confirmAllocationTicketId });
      toast.success(tr('Allocation confirmed', 'Ajratma tasdiqlandi'));
      setConfirmAllocationTicketId(null);
      fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to confirm allocation');
    } finally {
      setConfirmAllocationBusy(false);
    }
  };

  const rejectAllocation = async () => {
    if (!rejectAllocationModal || rejectAllocationBusy) return;
    const reason = rejectionReason.trim();
    if (reason.length < 5) return toast.error(tr('Write the allocation rejection reason', 'Ajratmani rad etish sababini yozing.'));
    setRejectAllocationBusy(true);
    try {
      await api.post('/tickets/reject', { allocationId: rejectAllocationModal.id, rejectionReason: reason });
      toast.success(tr('Allocation returned to the sending firm', 'Ajratma yuborgan firmaga qaytarildi'));
      setRejectAllocationModal(null);
      setRejectionReason('');
      await fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || tr('Failed to reject allocation', 'Ajratmani qaytarib bo\'lmadi'));
    } finally {
      setRejectAllocationBusy(false);
    }
  };

  const openEditAllocation = (allocation: any) => {
    setEditAllocation(allocation);
    setEditAllocationRows((allocation.priceRows || []).map((row: any) => ({ quantity: String(row.quantity), price: String(row.unitPrice) })));
    setEditAllocationNote(allocation.note || '');
    setEditAllocationReason('');
  };

  const submitAllocationEdit = async () => {
    if (!editAllocation || editAllocationBusy) return;
    const reason = editAllocationReason.trim();
    if (reason.length < 5) return toast.error(tr('Write the edit reason', 'Tahrirlash sababini yozing.'));
    const rows = editAllocationRows.map((row) => ({ quantity: Number(row.quantity), price: Number(row.price) }));
    if (!rows.length || rows.some((row) => !Number.isInteger(row.quantity) || row.quantity <= 0 || !Number.isFinite(row.price) || row.price <= 0)) {
      return toast.error(tr('Check quantity and price rows', 'Chipta miqdori va narx qatorlarini tekshiring.'));
    }
    setEditAllocationBusy(true);
    try {
      const response = await api.post(`/tickets/allocations/${editAllocation.id}/change-requests`, {
        type: 'EDIT', allocationRows: rows, currency: editAllocation.currency, note: editAllocationNote, reason,
      });
      toast.success(response.data?.request?.requiresCounterpartyApproval
        ? tr('Edit request sent for approval', 'Tahrir so‘rovi tasdiqlash uchun yuborildi')
        : tr('External-firm allocation updated automatically', 'Tashqi firma ajratmasi avtomatik yangilandi'));
      setEditAllocation(null);
      await fetchData();
    } catch (err: any) { toast.error(err?.response?.data?.error || tr('Failed to edit allocation', 'Ajratmani tahrirlab bo‘lmadi')); }
    finally { setEditAllocationBusy(false); }
  };

  const openCancelAllocation = (allocation: any) => {
    setCancelAllocation(allocation);
    setCancelAllocationQuantity(String(Math.max(1, Number(allocation.cancellableQuantity || 1))));
    setCancelAllocationReason('');
  };

  const submitAllocationCancel = async () => {
    if (!cancelAllocation || cancelAllocationBusy) return;
    const reason = cancelAllocationReason.trim();
    const quantity = Number(cancelAllocationQuantity);
    if (reason.length < 5) return toast.error(tr('Write the cancellation reason', 'Bekor qilish sababini yozing.'));
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > Number(cancelAllocation.cancellableQuantity || 0)) return toast.error(tr('Check cancellable ticket quantity', 'Bekor qilinadigan chipta sonini tekshiring.'));
    setCancelAllocationBusy(true);
    try {
      const response = await api.post(`/tickets/allocations/${cancelAllocation.id}/change-requests`, { type: 'CANCEL', quantity, reason });
      toast.success(response.data?.request?.requiresCounterpartyApproval
        ? tr('Cancellation request sent for approval', 'Bekor qilish so‘rovi tasdiqlash uchun yuborildi')
        : tr('External-firm allocation cancelled automatically', 'Tashqi firma ajratmasi avtomatik bekor qilindi'));
      setCancelAllocation(null);
      await fetchData();
    } catch (err: any) { toast.error(err?.response?.data?.error || tr('Failed to cancel allocation', 'Ajratmani bekor qilib bo‘lmadi')); }
    finally { setCancelAllocationBusy(false); }
  };

  const decideAllocationChange = async (request: any, decision: 'approve' | 'reject') => {
    if (changeRequestBusyId) return;
    let rejectionReason = '';
    if (decision === 'reject') {
      rejectionReason = window.prompt(tr('Rejection reason', 'Rad etish sababi'))?.trim() || '';
      if (rejectionReason.length < 5) return toast.error(tr('Write the rejection reason', 'Rad etish sababini yozing.'));
    }
    setChangeRequestBusyId(request.id);
    try {
      await api.post(`/tickets/allocation-change-requests/${request.id}/${decision}`, decision === 'reject' ? { rejectionReason } : {});
      toast.success(decision === 'approve' ? tr('Change approved', 'O‘zgarish tasdiqlandi') : tr('Change rejected', 'O‘zgarish rad etildi'));
      await fetchData();
    } catch (err: any) { toast.error(err?.response?.data?.error || tr('Failed to review request', 'So‘rovni ko‘rib chiqib bo‘lmadi')); }
    finally { setChangeRequestBusyId(null); }
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

  const openSaleCancelRequestModal = (ticketId: string) => {
    setSaleCancelRequestTicketId(ticketId);
    setSaleCancelRequestReason('');
  };

  const closeSaleCancelRequestModal = () => {
    if (saleCancelRequestBusy) return;
    setSaleCancelRequestTicketId(null);
    setSaleCancelRequestReason('');
  };

  const submitSaleCancelRequest = async () => {
    if (!saleCancelRequestTicketId || saleCancelRequestBusy) return;
    const reason = saleCancelRequestReason.trim();
    if (!reason) {
      toast.error('Reason is required');
      return;
    }
    if (reason.length > 500) {
      toast.error('Reason is too long (max 500 chars)');
      return;
    }

    setSaleCancelRequestBusy(true);
    try {
      await api.post('/tickets/cancel-sale-requests', { ticketId: saleCancelRequestTicketId, reason });
      toast.success('Cancellation request sent to admin');
      setSaleCancelRequestTicketId(null);
      setSaleCancelRequestReason('');
      fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to send cancellation request');
    } finally {
      setSaleCancelRequestBusy(false);
    }
  };

  const openSaleCancelApproveModal = (reqRow: any) => {
    const requestId = String(reqRow?.id || '').trim();
    const ticketId = String(reqRow?.ticketId || '').trim();
    const firmReason = String(reqRow?.reason || '');
    if (!requestId || !ticketId) {
      toast.error('Invalid cancellation request');
      return;
    }
    setSaleCancelApprove({ requestId, ticketId, firmReason });
    setSaleCancelDecisionReason(firmReason);
  };

  const closeSaleCancelApproveModal = () => {
    if (saleCancelApproveBusy) return;
    setSaleCancelApprove(null);
    setSaleCancelDecisionReason('');
  };

  const confirmSaleCancelApprove = async () => {
    if (!saleCancelApprove || saleCancelApproveBusy) return;
    const decisionReason = saleCancelDecisionReason.trim();
    if (!decisionReason) {
      toast.error('Admin reason is required');
      return;
    }
    if (decisionReason.length > 500) {
      toast.error('Admin reason is too long (max 500 chars)');
      return;
    }

    setSaleCancelApproveBusy(true);
    try {
      await api.post('/tickets/cancel-sale-requests/approve', {
        requestId: saleCancelApprove.requestId,
        decisionReason,
      });
      toast.success('Purchase cancelled (ticket returned to firm)');
      setSaleCancelApprove(null);
      setSaleCancelDecisionReason('');
      fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to cancel purchase');
    } finally {
      setSaleCancelApproveBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center text-muted py-12">
        <Plane className="mx-auto h-12 w-12 animate-pulse text-primary" />
        <p className="mt-2">{tr('Loading flight details...', 'Reys tafsilotlari yuklanmoqda...')}</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
        <p className="font-semibold text-red-600">{loadError}</p>
        <button type="button" onClick={fetchData} className="mt-4 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground">
          {tr('Try again', 'Qayta urinish')}
        </button>
      </div>
    );
  }

  const summary = data?.report || {};
  const tickets = data?.tickets || [];
  const allocationOperationTicket = tickets.find((ticket: any) => String(ticket.id) === String(selectedTicketId || ''));
  const saleOperationTicket = tickets.find((ticket: any) => String(ticket.id) === String(sellConfirmTicketId || ''));
  const flightStatusLabel = String(summary?.flight?.status || 'SCHEDULED');
  const flightStatusNormalized = flightStatusLabel.trim().toUpperCase();
  const flightCancelled = flightStatusNormalized === 'CANCELLED';
  const flightStatusUiLabel = (() => {
    if (flightStatusNormalized === 'CANCELLED') return tr('CANCELLED', 'BEKOR QILINGAN');
    if (flightStatusNormalized === 'SCHEDULED') return tr('SCHEDULED', 'REJALASHTIRILGAN');
    return flightStatusLabel;
  })();

  const role = String(user?.role || '').toUpperCase();
  const firmRole = user?.firmRole || 'FIRM_ADMIN';
  const canManageFirmWork = role !== 'FIRM' || firmRole === 'FIRM_ADMIN' || firmRole === 'MANAGER';
  const canAllocate = (role === 'FIRM' && canManageFirmWork) || role === 'ADMIN' || role === 'SUPERADMIN';
  const canDeallocateTickets = ['SUPERADMIN', 'ADMIN'].includes(role);
  const canBatchSell = ['SUPERADMIN', 'ADMIN'].includes(role) || (role === 'FIRM' && canManageFirmWork);
  const canConfirmAllocations = (role === 'FIRM' && canManageFirmWork) || role === 'ADMIN' || role === 'SUPERADMIN';

  const getTicketStatusLabel = (status?: string) => {
    const normalized = String(status || '').trim().toUpperCase();
    if (normalized === 'AVAILABLE') return tr('AVAILABLE', 'MAVJUD');
    if (normalized === 'PENDING') return tr('PENDING', 'KUTILAYOTGAN');
    if (normalized === 'ASSIGNED') return tr('ASSIGNED', 'BIRIKTIRILGAN');
    if (normalized === 'SOLD') return tr('SOLD', 'SOTILGAN');
    return normalized || String(status || '');
  };

  const pendingCancelRequestByTicketId = new Map<string, any>();
  for (const r of Array.isArray(pendingSaleCancelRequests) ? pendingSaleCancelRequests : []) {
    const tid = r?.ticketId ? String(r.ticketId) : '';
    if (!tid) continue;
    if (!pendingCancelRequestByTicketId.has(tid)) pendingCancelRequestByTicketId.set(tid, r);
  }

  const visibleTickets = tickets.filter((ticket: any) => role !== 'FIRM' || String(ticket.status).toUpperCase() !== 'PENDING').filter((ticket: any) => {
    const text = ticketSearch.trim().toLowerCase();
    if (!text) return true;
    return [
      ticket.id,
      ticket.status,
      ticket.price,
      ticket.currency,
      ticket.assignedFirm?.name,
      ticket.assignedFirmId,
    ].filter(Boolean).join(' ').toLowerCase().includes(text);
  });
  const hasAllocatableTickets = tickets.some((ticket: any) => ticket.canAllocate !== false && ['AVAILABLE', 'ASSIGNED'].includes(String(ticket.status).toUpperCase()) && !ticket.soldPrice);
  const inventorySummary = summary.inventorySummary || {};
  const inventoryAmounts = (metric: any) => (metric?.amounts || []).map((row: any) => (
    <div key={row.currency} className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted">{Number(row.count || 0)} ta</span>
      <span className="text-lg font-bold">{Number(row.total || 0).toLocaleString()} {row.currency}</span>
    </div>
  ));
  const mixedAllocationTotalQuantity = allocationRows.reduce((sum, row) => {
    const quantity = Number.parseInt(String(row.quantity || '').trim(), 10);
    return sum + (Number.isFinite(quantity) && quantity > 0 ? quantity : 0);
  }, 0);
  const mixedAllocationTotalAmount = allocationRows.reduce((sum, row) => {
    const quantity = Number.parseInt(String(row.quantity || '').trim(), 10);
    const price = Number(String(row.price || '').trim());
    return sum + (Number.isFinite(quantity) && quantity > 0 && Number.isFinite(price) && price > 0 ? quantity * price : 0);
  }, 0);
  const allocationRowsValid = allocationRows.length > 0 && allocationRows.every((row) => {
    const quantity = Number(row.quantity);
    const price = Number(row.price);
    return Number.isInteger(quantity) && quantity > 0 && Number.isFinite(price) && price > 0;
  });
  const allocationQuantityNumber = allocatePricingMode === 'MIXED' ? mixedAllocationTotalQuantity : Number(allocateQuantity);
  const allocationAvailableQuantity = allocateProductType === 'ROUND_TRIP'
    ? Number(inventorySummary.rtOw?.availableRoundTripCount || 0)
    : allocateDirection === 'RETURN'
      ? Number(inventorySummary.rtOw?.availableReturnLegCount || 0)
      : Number(inventorySummary.rtOw?.availableOutboundLegCount || 0);
  const selectedTicketProductAvailable = !selectedTicketId || (allocateProductType === 'ROUND_TRIP'
    ? Boolean(allocationOperationTicket?.availableRoundTrip)
    : allocateDirection === 'RETURN'
      ? Boolean(allocationOperationTicket?.availableReturn)
      : Boolean(allocationOperationTicket?.availableOutbound));
  const allocationDraftValid = Boolean(
    firms.length > 0
    && selectedFirmId
    && allocationSourceFirmId
    && selectedTicketProductAvailable
    && (selectedTicketId
      ? Number(allocatePrice) > 0
      : Number.isInteger(allocationQuantityNumber)
        && allocationQuantityNumber > 0
        && allocationQuantityNumber <= allocationAvailableQuantity
        && (allocatePricingMode === 'MIXED' ? allocationRowsValid : Number(allocatePrice) > 0))
  );
  const saleCurrencyCode = (sellCurrency === 'OTHER' ? sellOtherCurrency : sellCurrency).trim().toUpperCase();
  const saleProductAvailable = sellProductType === 'ROUND_TRIP'
    ? Boolean(saleOperationTicket?.availableRoundTrip)
    : sellDirection === 'RETURN'
      ? Boolean(saleOperationTicket?.availableReturn)
      : Boolean(saleOperationTicket?.availableOutbound);
  const emailLooksValid = (value: string) => !value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  const singleSaleDraftValid = Boolean(
    sellConfirmTicketId
    && sellFirmId
    && saleProductAvailable
    && Number(sellPrice) > 0
    && /^[A-Z]{3}$/.test(saleCurrencyCode)
    && (saleCurrencyCode === 'UZS' || Number(sellExchangeRate) > 0)
    && sellPurchaserName.trim()
    && sellPurchaserIdNumber.trim()
    && emailLooksValid(sellPurchaserEmail)
    && (sellDeskOptions.length === 0 || sellKassaDeskId)
  );
  const batchSaleCurrencyCode = (sellBatchCurrency === 'OTHER' ? sellBatchOtherCurrency : sellBatchCurrency).trim().toUpperCase();
  const batchAvailableQuantity = sellBatchProductType === 'ROUND_TRIP'
    ? Number(inventorySummary.rtOw?.availableRoundTripCount || 0)
    : sellBatchDirection === 'RETURN'
      ? Number(inventorySummary.rtOw?.availableReturnLegCount || 0)
      : Number(inventorySummary.rtOw?.availableOutboundLegCount || 0);
  const batchSaleDraftValid = Boolean(
    id
    && sellBatchFirmId
    && Number.isInteger(Number(sellBatchQuantity))
    && Number(sellBatchQuantity) > 0
    && Number(sellBatchQuantity) <= batchAvailableQuantity
    && Number(sellBatchPrice) > 0
    && /^[A-Z]{3}$/.test(batchSaleCurrencyCode)
    && (batchSaleCurrencyCode === 'UZS' || Number(sellBatchExchangeRate) > 0)
    && sellBatchPurchaserName.trim()
    && sellBatchPurchaserIdNumber.trim()
    && emailLooksValid(sellBatchPurchaserEmail)
    && (sellBatchDeskOptions.length === 0 || sellBatchKassaDeskId)
  );
  const editAllocationDraftValid = Boolean(
    editAllocation
    && editAllocationReason.trim().length >= 5
    && editAllocationReason.trim().length <= 500
    && editAllocationRows.length > 0
    && editAllocationRows.every((row) => Number.isInteger(Number(row.quantity)) && Number(row.quantity) > 0 && Number(row.price) > 0)
  );
  const cancelAllocationDraftValid = Boolean(
    cancelAllocation
    && cancelAllocationReason.trim().length >= 5
    && cancelAllocationReason.trim().length <= 500
    && Number.isInteger(Number(cancelAllocationQuantity))
    && Number(cancelAllocationQuantity) > 0
    && Number(cancelAllocationQuantity) <= Number(cancelAllocation?.cancellableQuantity || 0)
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <h2 className="text-3xl font-bold">
          {tr('Flight', 'Reys')} #{id} {tr('Details', 'tafsilotlari')}
        </h2>
        <span
          className={
            flightCancelled
              ? 'px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-900/50 text-red-300 border border-red-700'
              : 'px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-900/50 text-green-300 border border-green-700'
          }
        >
          {flightStatusUiLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
        <div className="bg-surface-2 border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 text-primary mb-2">
            <Tag size={16} />
            <span className="text-sm font-medium">
              {tr('Total received tickets', 'Jami olingan bilet soni / summasi')}
            </span>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-bold">{Number(inventorySummary.received?.count || 0)} ta</div>
            {inventoryAmounts(inventorySummary.received)}
          </div>
        </div>

        <div className="bg-surface-2 border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 text-green-600 mb-2">
            <Activity size={16} />
            <span className="text-sm font-medium">{tr('Sold or allocated tickets', 'Jami sotilgan / ajratilgan bilet soni / summasi')}</span>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-bold">{Number(inventorySummary.soldOrAllocated?.count || 0)} ta</div>
            {inventoryAmounts(inventorySummary.soldOrAllocated)}
          </div>
        </div>

        <div className="bg-surface-2 border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 text-yellow-600 mb-2">
            <Tag size={16} />
            <span className="text-sm font-medium">{tr('Remaining tickets', 'Qolgan bilet soni / summasi')}</span>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-bold">{Number(inventorySummary.remaining?.count || 0)} ta</div>
            {inventoryAmounts(inventorySummary.remaining)}
            {Number(inventorySummary.remaining?.reservedForTourCount || 0) > 0 && <div className="text-xs text-muted">{tr('Reserved for tours', 'Tur uchun band')}: {inventorySummary.remaining.reservedForTourCount} ta</div>}
          </div>
        </div>

        <div className="bg-surface-2 border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 text-yellow-600 mb-2">
            <Clock size={16} />
            <span className="text-sm font-medium">
              {tr('Total Debt (Payable)', 'Jami qarz (To‘lanishi kerak)')}
            </span>
          </div>
          <div className="text-3xl font-bold">{Number(summary.total_allocated || 0).toFixed(2)}</div>
        </div>

        <div className="bg-surface-2 border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 text-green-600 mb-2">
            <Activity size={16} />
            <span className="text-sm font-medium">
              {tr('Total Revenue (Sales)', 'Jami daromad (Sotuv)')}
            </span>
          </div>
          <div className="text-3xl font-bold">{Number(summary.total_sales || 0).toFixed(2)}</div>
        </div>

        <div className="bg-surface-2 border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 text-primary mb-2">
            <CheckCircle size={16} />
            <span className="text-sm font-medium">{tr('Total Payments', 'Jami to\'lovlar')}</span>
          </div>
          <div className="text-3xl font-bold">{Number(summary.total_payments || 0).toFixed(2)}</div>
        </div>

        <div className="bg-surface-2 border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 text-muted mb-2">
            <DollarSign size={16} />
            <span className="text-sm font-medium">{tr('Outstanding Debt', 'Qoldiq qarz')}</span>
          </div>
          <div className="text-3xl font-bold">
            {Number((summary.total_allocated || 0) - (summary.total_payments || 0)).toFixed(2)}
          </div>
        </div>

        {user?.role?.toUpperCase() !== 'FIRM' && (
          <div className="bg-surface-2 border border-border rounded-lg p-5 lg:col-span-auto">
            <div className="flex items-center gap-2 text-indigo-600 mb-2">
              <span className="text-sm font-medium">
                {tr('Profit (Revenue - Debt)', 'Foyda (Daromad - Qarz)')}
              </span>
            </div>
            <div className="text-3xl font-bold text-indigo-600">
              {Number((summary.total_sales || 0) - (summary.total_allocated || 0)).toFixed(2)}
            </div>
          </div>
        )}
      </div>

      <section className="rounded-xl border border-border bg-surface-2 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold">RT / OW {tr('inventory control', 'zaxira nazorati')}</h3>
            <p className="text-sm text-muted">{tr('Parent tickets and usable flight segments are shown separately.', 'Asosiy biletlar va ishlatiladigan reys segmentlari alohida ko‘rsatiladi.')}</p>
          </div>
          {inventorySummary.reconciliationRequired && <span className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-sm font-semibold text-red-500">{tr('Reconciliation required', 'Hisobni qayta tekshirish kerak')} · {inventorySummary.migrationIssueCount}</span>}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          {[
            ['RT', inventorySummary.rtOw?.availableRoundTripCount],
            ['OUTBOUND', inventorySummary.rtOw?.availableOutboundLegCount],
            ['RETURN', inventorySummary.rtOw?.availableReturnLegCount],
            [tr('Pending', 'Kutilmoqda'), inventorySummary.pendingAllocationCount],
            [tr('Tour reserved', 'Turga band'), inventorySummary.reservedForTourCount],
            [tr('Direct sold', 'To‘g‘ridan sotildi'), inventorySummary.directSoldTicketCount],
            [tr('Partial tickets', 'Qisman ishlatilgan'), inventorySummary.rtOw?.partiallyUsedTicketCount],
          ].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-border bg-surface p-3 text-center"><div className="text-2xl font-bold">{Number(value || 0)}</div><div className="text-xs text-muted">{label}</div></div>)}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {[
            [tr('Accepted allocation revenue', 'Tasdiqlangan ajratma tushumi'), inventorySummary.acceptedAllocationRevenueByCurrency],
            [tr('Allocated cost', 'Ajratilgan tannarx'), inventorySummary.allocatedCostByCurrency],
            [tr('Gross profit', 'Yalpi foyda'), inventorySummary.allocationGrossProfitByCurrency],
            [tr('Outstanding debt', 'Qoldiq qarz'), inventorySummary.outstandingDebtByCurrency],
          ].map(([label, rows]: any) => <div key={String(label)} className="rounded-lg border border-border p-3"><div className="text-xs font-semibold text-muted">{label}</div>{(rows || []).length ? rows.map((row: any) => <div key={row.currency} className="mt-1 text-lg font-bold">{Number(row.total || 0).toLocaleString()} {row.currency}</div>) : <div className="mt-1 text-lg font-bold">0</div>}</div>)}
        </div>
      </section>

      {(inventorySummary.recipients || []).length > 0 && (
        <section className="rounded-xl border border-border bg-surface-2 p-5">
          <h3 className="text-xl font-bold text-foreground">{tr('Who received the tickets', 'Kimga sotilgan / ajratilgan')}</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="excel-table">
              <thead><tr><th>{tr('Recipient', 'Qabul qiluvchi')}</th><th>{tr('Type', 'Turi')}</th><th className="text-right">{tr('Tickets', 'Bilet')}</th><th className="text-right">{tr('Amount', 'Summa')}</th><th>{tr('Status', 'Holat')}</th></tr></thead>
              <tbody>{inventorySummary.recipients.map((recipient: any, index: number) => (
                <tr key={`${recipient.allocationId || recipient.ticketId || recipient.name}-${index}`}>
                  <td className="font-semibold">{recipient.name}</td>
                  <td>{recipient.type === 'FIRM' ? tr('Firm allocation', 'Firmaga ajratma') : tr('Customer sale', 'Mijozga sotuv')}</td>
                  <td className="text-right">{recipient.quantity} ta</td>
                  <td className="text-right">{Number(recipient.totalAmount || 0).toLocaleString()} {recipient.currency}</td>
                  <td>{recipient.status}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-border bg-surface-2 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="text-xl font-bold text-foreground">{tr('Ticket allocations', 'Chipta ajratmalari')}</h3><p className="text-sm text-muted">{tr('Bulk allocations, single-ticket actions, edits and cancellations in one place.', 'Bulk ajratmalar, bitta chipta amallari, tahrir va bekor qilish bir joyda.')}</p></div>
          {canAllocate && hasAllocatableTickets && <button type="button" onClick={openAllocateBatchModal} disabled={flightCancelled} className="rounded-lg bg-yellow-600 px-4 py-2 font-bold text-white disabled:opacity-50">{tr('Bulk allocate', 'Bulk ajratish')}</button>}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="excel-table">
	            <thead><tr><th>{tr('Sender → Receiver', 'Yuboruvchi → Qabul qiluvchi')}</th><th>RT / OW</th><th>{tr('Status', 'Holat')}</th><th className="text-right">{tr('Tickets', 'Biletlar')}</th><th>{tr('Price rows', 'Narx qatorlari')}</th><th className="text-right">{tr('Total', 'Jami')}</th><th>{tr('Actions', 'Amallar')}</th></tr></thead>
            <tbody>
	              {allocations.length === 0 ? <tr><td colSpan={7} className="text-center text-muted">{tr('No allocations yet', 'Hali ajratmalar yo‘q')}</td></tr> : allocations.map((allocation: any) => {
                const hasPendingChange = allocationChangeRequests.some((request: any) => request.allocationId === allocation.id && request.status === 'PENDING_APPROVAL');
                return <tr key={allocation.id}>
	                  <td><div className="font-semibold">{allocation.fromFirm?.name || '—'} → {allocation.toFirm?.name || '—'}</div><div className="text-xs text-muted">#{String(allocation.id).slice(0, 8)}</div></td>
	                  <td><span className="rounded bg-primary/15 px-2 py-1 text-xs font-bold text-primary">{allocation.productType === 'ONE_WAY' ? `OW · ${allocation.direction}` : 'RT'}</span><div className="mt-1 text-xs text-muted">{allocation.segmentCount || 0} {tr('segments', 'segment')}</div></td>
                  <td><span className={`rounded-full border px-2 py-1 text-xs font-bold ${allocation.status === 'PENDING' ? 'border-yellow-600/50 text-yellow-500' : allocation.status === 'ACCEPTED' ? 'border-green-600/50 text-green-500' : 'border-red-600/50 text-red-500'}`}>{allocation.status}</span>{hasPendingChange && <div className="mt-1 text-xs text-yellow-500">{tr('Change pending', 'O‘zgarish kutilmoqda')}</div>}</td>
                  <td className="text-right"><div className="font-bold">{allocation.allocatedQuantity} ta</div><div className="text-xs text-muted">{tr('Free', 'Erkin')}: {allocation.cancellableQuantity || 0} · {tr('Sold', 'Sotilgan')}: {allocation.soldQuantity || 0}</div></td>
                  <td><div className="flex min-w-56 flex-wrap gap-1">{(allocation.priceRows || []).map((row: any, index: number) => <span key={`${allocation.id}-${index}`} className="rounded border border-border px-2 py-1 text-xs">{row.quantity} × {Number(row.unitPrice).toLocaleString()} {allocation.currency}</span>)}</div></td>
                  <td className="text-right font-bold">{Number(allocation.totalAmount || 0).toLocaleString()} {allocation.currency}</td>
                  <td><div className="flex min-w-52 flex-wrap gap-2">
                    {allocation.status === 'PENDING' && allocation.canReject && <button type="button" onClick={() => { setRejectAllocationModal(allocation); setRejectionReason(''); }} className="rounded border border-red-600/40 px-2 py-1 text-xs font-semibold text-red-500">{tr('Reject', 'Rad etish')}</button>}
                    {allocation.status === 'PENDING' && allocation.canConfirm && canConfirmAllocations && <button type="button" onClick={() => openConfirmAllocation(allocation.id)} className="rounded bg-yellow-600 px-2 py-1 text-xs font-semibold text-white">{tr('Confirm', 'Tasdiqlash')}</button>}
                    {allocation.canEdit && !hasPendingChange && <button type="button" onClick={() => openEditAllocation(allocation)} className="rounded border border-primary/50 px-2 py-1 text-xs font-semibold text-primary">{tr('Edit', 'Tahrirlash')}</button>}
                    {allocation.canCancel && Number(allocation.cancellableQuantity || 0) > 0 && !hasPendingChange && <button type="button" onClick={() => openCancelAllocation(allocation)} className="rounded border border-red-600/40 px-2 py-1 text-xs font-semibold text-red-500">{tr('Cancel', 'Bekor qilish')}</button>}
                  </div></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>

      {allocationChangeRequests.length > 0 && <section className="rounded-xl border border-border bg-surface-2 p-5">
        <h3 className="text-xl font-bold">{tr('Allocation change requests', 'Ajratma bo‘yicha o‘zgarish so‘rovlari')}</h3>
        <div className="mt-4 overflow-x-auto"><table className="excel-table"><thead><tr><th>{tr('Flight / firms', 'Reys / firmalar')}</th><th>{tr('Change', 'O‘zgarish')}</th><th>{tr('Difference', 'Farqi')}</th><th>{tr('Reason', 'Sabab')}</th><th>{tr('Status', 'Holat')}</th><th>{tr('Actions', 'Amallar')}</th></tr></thead><tbody>
          {allocationChangeRequests.map((request: any) => {
            const oldValues = request.oldValuesJson || {};
            const proposed = request.proposedValuesJson || {};
            return <tr key={request.id}>
              <td><div className="font-semibold">{request.allocation?.flight?.flightNumber}</div><div className="text-xs text-muted">{request.allocation?.fromFirm?.name} → {request.allocation?.toFirm?.name}</div></td>
              <td>{request.type === 'EDIT' ? tr('Edit', 'Tahrirlash') : tr('Cancel', 'Bekor qilish')}</td>
              <td>{request.type === 'EDIT' ? <><div>{tr('Quantity', 'Miqdor')}: {oldValues.quantity} → {proposed.quantity}</div><div>{tr('Total', 'Jami')}: {Number(oldValues.totalAmount || 0).toLocaleString()} {oldValues.currency}</div></> : <div>{tr('Cancel quantity', 'Bekor qilinadi')}: {proposed.cancelQuantity} ta</div>}</td>
              <td className="max-w-xs whitespace-normal">{request.reason}{request.rejectionReason && <div className="text-red-500">{request.rejectionReason}</div>}</td>
              <td>{request.autoApproved ? tr('Auto-approved', 'Avtomatik tasdiqlandi') : request.status}</td>
              <td><div className="flex gap-2">{request.canReject && <button type="button" disabled={changeRequestBusyId === request.id} onClick={() => decideAllocationChange(request, 'reject')} className="rounded border border-red-600/40 px-2 py-1 text-xs text-red-500">{tr('Reject', 'Rad etish')}</button>}{request.canApprove && <button type="button" disabled={changeRequestBusyId === request.id} onClick={() => decideAllocationChange(request, 'approve')} className="rounded bg-primary px-2 py-1 text-xs font-bold text-primary-foreground">{tr('Approve', 'Tasdiqlash')}</button>}</div></td>
            </tr>;
          })}
        </tbody></table></div>
      </section>}

      <div className="bg-surface-2 border border-border rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-border grid grid-cols-1 gap-2 lg:grid-cols-[220px_1fr_auto] lg:items-end">
          <h3 className="text-lg font-bold lg:pb-1">{tr('Tickets Inventory', 'Chiptalar zaxirasi')}</h3>
          <div>
            <label htmlFor="ticketSearch" className="compact-label">{tr('Search tickets', 'Chiptalarni qidirish')}</label>
            <input
              id="ticketSearch"
              value={ticketSearch}
              onChange={(e) => setTicketSearch(e.target.value)}
              className="compact-control"
              placeholder={tr('Search ticket, status, firm', 'Chipta, holat, firma qidirish')}
            />
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            {canAllocate && hasAllocatableTickets && (
              <button
                type="button"
                onClick={openAllocateBatchModal}
                disabled={flightCancelled}
                className="px-3 py-1 bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/40 rounded transition border border-yellow-600/50 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {tr('Bulk allocate', 'Bulk ajratish')}
              </button>
            )}
            {canBatchSell && (
              <button
                type="button"
                onClick={openSellBatchModal}
                disabled={flightCancelled}
                className="px-3 py-1 bg-primary/20 text-primary hover:bg-primary/40 rounded transition border border-primary/50 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {tr('Sell tickets', 'Chiptalarni sotish')}
              </button>
            )}
          </div>
        </div>
        {ticketsView === 'list' || ticketsView === 'boxes' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface text-sm text-muted">
                  <th className="p-4 font-semibold">{tr('Ticket ID', 'Chipta ID')}</th>
	                  <th className="p-4 font-semibold">RT / OW {tr('segments', 'segmentlar')}</th>
	                  <th className="p-4 font-semibold">{tr('Status', 'Holat')}</th>
                  <th className="p-4 font-semibold">{tr('Price / Currency', 'Narx / Valyuta')}</th>
                  <th className="p-4 font-semibold">{tr('Assigned Firm', 'Biriktirilgan firma')}</th>
                  <th className="p-4 font-semibold text-right">{tr('Actions', 'Amallar')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm">
                {visibleTickets.map((ticket: any) => (
                  <tr key={ticket.id} className="hover:bg-surface transition">
                    <td className="p-4 text-foreground font-medium">
                      <div className="flex items-center gap-2">
                        <Tag size={14} className="text-muted" />
                        {ticket.id.slice(0, 8)}...
                      </div>
	                    </td>
	                    <td className="p-4">
	                      <div className="flex flex-wrap gap-1">{(ticket.legs || []).map((leg: any) => (
	                        <span key={leg.id} className={`rounded border px-2 py-1 text-xs font-semibold ${['AVAILABLE', 'ASSIGNED'].includes(leg.status) ? 'border-green-600/40 text-green-500' : leg.status === 'SOLD' ? 'border-blue-600/40 text-blue-500' : 'border-border text-muted'}`}>
	                          {leg.direction === 'OUTBOUND' ? 'OUT' : 'RETURN'} · {leg.status} · {Number(leg.acquisitionCostSnapshot || 0).toLocaleString()} {leg.currencySnapshot}
	                        </span>
	                      ))}</div>
	                    </td>
	                    <td className="p-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold inline-block border ${
                        ticket.status === 'AVAILABLE' ? 'bg-green-900/30 text-green-400 border-green-700/50' :
                        ticket.status === 'PENDING' ? 'bg-yellow-900/30 text-yellow-400 border-yellow-700/50' :
                        ticket.status === 'ASSIGNED' ? 'bg-blue-900/30 text-blue-300 border-primary/50' :
                        'bg-surface text-muted border-border'
                      }`}>
                        {getTicketStatusLabel(ticket.status)}
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
                      {ticket.status === 'PENDING' && ticket.allocationSourceFirm && (
                        <div className="mt-1 text-xs text-muted">
                          {tr('From', 'Yuborgan')}: {ticket.allocationSourceFirm.name}
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-right space-x-3">
                      {canAllocate && ticket.canAllocate !== false && ['AVAILABLE', 'ASSIGNED'].includes(String(ticket.status).toUpperCase()) && (
                        <button
                          onClick={() => openAllocateModal(ticket.id)}
                          disabled={flightCancelled}
                          className="px-3 py-1 bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/40 rounded transition border border-yellow-600/50 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {tr('Allocate one', 'Bitta ajratish')}
                        </button>
                      )}
                      {canBatchSell && ticket.status === 'ASSIGNED' && (
                        <button
                          onClick={() => openSellConfirm(ticket)} 
                          disabled={flightCancelled}
                          className="px-3 py-1 bg-primary/20 text-primary hover:bg-primary/40 rounded transition border border-primary/50 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {tr('Mark Sold', 'Sotildi deb belgilash')}
                        </button>
                      )}
                      {canDeallocateTickets && !(ticket.legs || []).length && !ticket.allocationId && (ticket.status === 'PENDING' || ticket.status === 'ASSIGNED') && (
                        <button
                          onClick={() => openDeallocateConfirm(ticket.id, ticket.status)}
                          className="px-3 py-1 bg-red-600/10 text-red-300 hover:bg-red-600/20 rounded transition border border-red-600/30 font-medium"
                        >
                          {tr('Deallocate', 'Ajratishni bekor qilish')}
                        </button>
                      )}
                      {role === 'FIRM' && ticket.status === 'SOLD' && (
                        pendingCancelRequestByTicketId.has(ticket.id)
                          ? (
                              <button
                                disabled
                                className="px-3 py-1 bg-surface-2 text-muted rounded transition border border-border font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {tr('Cancel requested', "Bekor qilish so'ralgan")}
                              </button>
                            )
                          : (
                              <button
                                onClick={() => openSaleCancelRequestModal(ticket.id)}
                                className="px-3 py-1 bg-red-600/10 text-red-300 hover:bg-red-600/20 rounded transition border border-red-600/30 font-medium"
                              >
                                {tr('Request cancel', "Bekor qilishni so'rash")}
                              </button>
                            )
                      )}
                      {canDeallocateTickets && ticket.status === 'SOLD' && pendingCancelRequestByTicketId.has(ticket.id) && (
                        <button
                          onClick={() => openSaleCancelApproveModal(pendingCancelRequestByTicketId.get(ticket.id))}
                          className="px-3 py-1 bg-red-600/10 text-red-300 hover:bg-red-600/20 rounded transition border border-red-600/30 font-medium"
                        >
                          {tr('Cancel purchase', 'Xaridni bekor qilish')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {visibleTickets.length === 0 && (
                  <tr>
	                    <td colSpan={6} className="p-8 text-center text-muted">
                      <Plane className="mx-auto h-8 w-8 mb-2 opacity-50" />
                      {tr('No tickets found for this flight.', 'Bu reys uchun chipta topilmadi.')}
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
                {tr('No tickets found for this flight.', 'Bu reys uchun chipta topilmadi.')}
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
                        ticket.status === 'ASSIGNED' ? 'bg-blue-900/30 text-blue-300 border-primary/50' :
                        'bg-surface text-muted border-border'
                      }`}>
                        {getTicketStatusLabel(ticket.status)}
                      </span>
                    </div>

                    <div className="mt-3 text-sm text-foreground space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted">{tr('Price', 'Narx')}</span>
                        <span className="font-medium">{Number(ticket.price).toFixed(2)} {ticket.currency}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted">{tr('Firm', 'Firma')}</span>
                        <span className="text-foreground flex items-center gap-2">
                          {ticket.assignedFirmId && <Briefcase size={14} className="text-muted" />}
                          {ticket.assignedFirm?.name || ticket.assignedFirmId || '—'}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-end gap-2 flex-wrap">
                      {canAllocate && ticket.canAllocate !== false && ['AVAILABLE', 'ASSIGNED'].includes(String(ticket.status).toUpperCase()) && (
                        <button
                          onClick={() => openAllocateModal(ticket.id)}
                          disabled={flightCancelled}
                          className="px-3 py-1 bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/40 rounded transition border border-yellow-600/50 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {tr('Allocate one', 'Bitta ajratish')}
                        </button>
                      )}
                      {canBatchSell && ticket.status === 'ASSIGNED' && (
                        <button
                          onClick={() => openSellConfirm(ticket)}
                          disabled={flightCancelled}
                          className="px-3 py-1 bg-primary/20 text-primary hover:bg-primary/40 rounded transition border border-primary/50 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {tr('Mark Sold', 'Sotildi deb belgilash')}
                        </button>
                      )}
                      {canDeallocateTickets && !(ticket.legs || []).length && !ticket.allocationId && (ticket.status === 'PENDING' || ticket.status === 'ASSIGNED') && (
                        <button
                          onClick={() => openDeallocateConfirm(ticket.id, ticket.status)}
                          className="px-3 py-1 bg-red-600/10 text-red-300 hover:bg-red-600/20 rounded transition border border-red-600/30 font-medium"
                        >
                          {tr('Deallocate', 'Ajratishni bekor qilish')}
                        </button>
                      )}
                      {role === 'FIRM' && ticket.status === 'SOLD' && (
                        pendingCancelRequestByTicketId.has(ticket.id)
                          ? (
                              <button
                                disabled
                                className="px-3 py-1 bg-surface-2 text-muted rounded transition border border-border font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {tr('Cancel requested', "Bekor qilish so'ralgan")}
                              </button>
                            )
                          : (
                              <button
                                onClick={() => openSaleCancelRequestModal(ticket.id)}
                                className="px-3 py-1 bg-red-600/10 text-red-300 hover:bg-red-600/20 rounded transition border border-red-600/30 font-medium"
                              >
                                {tr('Request cancel', "Bekor qilishni so'rash")}
                              </button>
                            )
                      )}
                      {canDeallocateTickets && ticket.status === 'SOLD' && pendingCancelRequestByTicketId.has(ticket.id) && (
                        <button
                          onClick={() => openSaleCancelApproveModal(pendingCancelRequestByTicketId.get(ticket.id))}
                          className="px-3 py-1 bg-red-600/10 text-red-300 hover:bg-red-600/20 rounded transition border border-red-600/30 font-medium"
                        >
                          {tr('Cancel purchase', 'Xaridni bekor qilish')}
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
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-foreground mb-4">
              {selectedTicketId
                ? tr('Allocate ticket', 'Chiptani ajratish')
                : tr('Allocate tickets', 'Chiptalarni ajratish')}
            </h3>
            
	            <form onSubmit={handleAllocateSubmit} className="space-y-4">
	              <div className="rounded-lg border border-border bg-surface-2 p-4">
	                <div className="grid gap-3 sm:grid-cols-3">
	                  <label><span className="compact-label">{tr('Control mode', 'Boshqaruv turi')}</span><select className="compact-control" value={selectedTicketId ? 'SINGLE' : 'BULK'} disabled><option value="SINGLE">{tr('Single ticket', 'Bitta bilet')}</option><option value="BULK">Bulk</option></select></label>
	                  <label><span className="compact-label">{tr('Ticket product', 'Bilet mahsuloti')}</span><select className="compact-control" value={allocateProductType} onChange={(e) => setAllocateProductType(e.target.value as any)} disabled={allocateBusy}><option value="ROUND_TRIP" disabled={Boolean(selectedTicketId && !allocationOperationTicket?.availableRoundTrip)}>RT — borish–kelish</option><option value="ONE_WAY">OW — segment</option></select></label>
	                  {allocateProductType === 'ONE_WAY' && <label><span className="compact-label">{tr('Direction', 'Yo‘nalish')}</span><select className="compact-control" value={allocateDirection} onChange={(e) => setAllocateDirection(e.target.value as any)} disabled={allocateBusy}><option value="OUTBOUND" disabled={Boolean(selectedTicketId && !allocationOperationTicket?.availableOutbound)}>OUTBOUND</option><option value="RETURN" disabled={Boolean(selectedTicketId && !allocationOperationTicket?.availableReturn)}>RETURN</option></select></label>}
	                </div>
	                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-muted">
	                  <div className="rounded bg-surface p-2"><strong className="block text-base text-foreground">{inventorySummary.rtOw?.availableRoundTripCount || 0}</strong>RT</div>
	                  <div className="rounded bg-surface p-2"><strong className="block text-base text-foreground">{inventorySummary.rtOw?.availableOutboundLegCount || 0}</strong>OUTBOUND</div>
	                  <div className="rounded bg-surface p-2"><strong className="block text-base text-foreground">{inventorySummary.rtOw?.availableReturnLegCount || 0}</strong>RETURN</div>
	                </div>
	              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-2">{tr('Select Firm', 'Firmani tanlang')}</label>
                {firms.length > 0 ? (
                  <select
                    className="w-full bg-surface-2 border border-border rounded-lg px-4 py-3 text-foreground outline-none focus:border-primary transition"
                    value={selectedFirmId}
                    onChange={(e) => setSelectedFirmId(e.target.value)}
                    required
                  >
                    <option value="" disabled>{tr('-- Select a Firm --', '-- Firmani tanlang --')}</option>
                    {firms.map((f: any) => (
                      <option key={f.id} value={f.id}>
                        {String(f.name || f.id) + ` (ID: ${String(f.id).slice(0, 8)}...)` + (f.approvalRequired
                          ? ` — ${tr('approval required', 'tasdiq talab qilinadi')}`
                          : ` — ${tr('automatic confirmation', 'avtomatik tasdiq')}`)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-600">
                    {tr('No active firm is available.', 'Faol firma topilmadi.')}
                  </div>
                )}
              </div>

              {!selectedTicketId && (
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">{tr('Quantity', 'Miqdor')}</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    required={allocatePricingMode === 'SAME'}
                    className="w-full bg-surface-2 border border-border rounded-lg px-4 py-3 text-foreground outline-none focus:border-primary transition"
                    placeholder="1"
                    value={allocatePricingMode === 'MIXED' ? String(mixedAllocationTotalQuantity || '') : allocateQuantity}
                    onChange={(e) => setAllocateQuantity(e.target.value)}
                    disabled={allocateBusy || allocatePricingMode === 'MIXED'}
                  />
                  <p className="mt-1 text-xs text-muted">
                    {tr('Creates a pending allocation (firm must confirm).', 'Kutilayotgan ajratma yaratadi (firma tasdiqlashi kerak).')}
                  </p>
                </div>
              )}

              {!selectedTicketId && (
                <div className="grid grid-cols-2 rounded-md border border-border bg-surface-2 p-1">
                  <button
                    type="button"
                    onClick={() => setAllocatePricingMode('SAME')}
                    disabled={allocateBusy}
                    className={`rounded px-3 py-2 text-sm font-semibold ${allocatePricingMode === 'SAME' ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground'}`}
                  >
                    {tr('Same price', 'Bir xil narxda')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAllocatePricingMode('MIXED');
                      setAllocationRows((rows) => rows.map((row, index) => index === 0 ? { quantity: allocateQuantity || row.quantity, price: allocatePrice || row.price } : row));
                    }}
                    disabled={allocateBusy}
                    className={`rounded px-3 py-2 text-sm font-semibold ${allocatePricingMode === 'MIXED' ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground'}`}
                  >
                    {tr('Different prices', 'Har xil narxda')}
                  </button>
                </div>
              )}

	              {(selectedTicketId || allocatePricingMode === 'SAME') ? (
	                <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
	                  <div>
	                  <label className="block text-sm font-medium text-muted mb-2">{tr('Allocation price (per ticket)', 'Ajratma narxi (har chipta)')}</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    required
                    className="w-full bg-surface-2 border border-border rounded-lg px-4 py-3 text-foreground outline-none focus:border-primary transition"
                    placeholder="0"
                    value={allocatePrice}
                    onChange={(e) => setAllocatePrice(e.target.value)}
	                    disabled={allocateBusy}
	                  />
	                  </div>
	                  <label><span className="block text-sm font-medium text-muted mb-2">{tr('Currency', 'Valyuta')}</span><select className="compact-control py-3" value={allocateCurrency} onChange={(e) => setAllocateCurrency(e.target.value as any)} disabled={allocateBusy}><option value="UZS">UZS</option><option value="USD">USD</option></select></label>
	                </div>
              ) : (
                <div className="rounded-lg border border-border bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm font-medium text-muted">{tr('Price rows', 'Narx qatorlari')}</label>
                    <button
                      type="button"
                      onClick={addAllocationRow}
                      disabled={allocateBusy}
                      className="rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-surface disabled:opacity-50"
                    >
                      + {tr('Row', 'Qator')}
                    </button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {allocationRows.map((row, index) => (
                      <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          required
                          className="bg-surface border border-border rounded-lg px-3 py-2 text-foreground outline-none focus:border-primary transition"
                          placeholder={tr('Qty', 'Soni')}
                          value={row.quantity}
                          onChange={(e) => updateAllocationRow(index, { quantity: e.target.value })}
                          disabled={allocateBusy}
                        />
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0.01"
                          step="0.01"
                          required
                          className="bg-surface border border-border rounded-lg px-3 py-2 text-foreground outline-none focus:border-primary transition"
                          placeholder={tr('Price', 'Narx')}
                          value={row.price}
                          onChange={(e) => updateAllocationRow(index, { price: e.target.value })}
                          disabled={allocateBusy}
                        />
                        <button
                          type="button"
                          onClick={() => removeAllocationRow(index)}
                          disabled={allocateBusy || allocationRows.length <= 1}
                          className="rounded-md border border-red-500/30 px-3 py-2 text-red-600 hover:bg-red-500/10 disabled:opacity-40"
                          title={tr('Remove row', 'Qatorni olib tashlash')}
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm">
                    <span className="text-muted">{tr('Total rows', 'Qatorlar jami')}: {mixedAllocationTotalQuantity}</span>
                    <span className="font-semibold text-foreground">{mixedAllocationTotalAmount.toFixed(2)}</span>
                  </div>
                </div>
              )}
              
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAllocateModalOpen(false)}
                  disabled={allocateBusy}
                  className="px-4 py-2 bg-surface-2 hover:bg-surface text-foreground rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {tr('Cancel', 'Bekor qilish')}
                </button>
                <button
                  type="submit"
                  disabled={allocateBusy || !allocationDraftValid}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {allocateBusy ? tr('Allocating…', 'Ajratilmoqda…') : tr('Allocate', 'Ajratish')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {sellConfirmTicketId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-sm p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-foreground mb-2">{tr('Sell ticket', 'Chiptani sotish')}</h3>
            <p className="text-sm text-muted">
              {tr('This will mark the ticket as', 'Bu chiptani')}{' '}
              <span className="text-foreground font-semibold">SOLD</span>{' '}
              {tr('and create a', 'deb belgilaydi va')}{' '}
              <span className="text-foreground font-semibold">SALE</span>{' '}
              {tr('transaction.', 'tranzaksiyasini yaratadi.')}
            </p>

	            <div className="mt-4 space-y-3">
	              <div className="rounded-lg border border-border bg-surface-2 p-3">
	                <div className="grid gap-3 sm:grid-cols-2">
	                  <label><span className="compact-label">{tr('Ticket product', 'Bilet mahsuloti')}</span><select className="compact-control" value={sellProductType} onChange={(e) => setSellProductType(e.target.value as any)} disabled={sellBusy}><option value="ROUND_TRIP" disabled={!saleOperationTicket?.availableRoundTrip}>RT — borish–kelish</option><option value="ONE_WAY">OW — segment</option></select></label>
	                  {sellProductType === 'ONE_WAY' && <label><span className="compact-label">{tr('Direction', 'Yo‘nalish')}</span><select className="compact-control" value={sellDirection} onChange={(e) => setSellDirection(e.target.value as any)} disabled={sellBusy}><option value="OUTBOUND" disabled={!saleOperationTicket?.availableOutbound}>OUTBOUND</option><option value="RETURN" disabled={!saleOperationTicket?.availableReturn}>RETURN</option></select></label>}
	                </div>
	              </div>
	              <div>
                <label className="block text-sm font-medium text-muted mb-1">{tr('Sale price (per ticket)', 'Sotuv narxi (har chipta uchun)')}</label>
                <input
                  type="number"
                  step="0.01"
                  min={0.01}
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                  disabled={sellBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-primary transition"
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">{tr('Sale currency', 'Sotuv valyutasi')}</label>
                <select
                  value={sellCurrency}
                  onChange={(e) => setSellCurrency(e.target.value as any)}
                  disabled={sellBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-primary transition"
                >
                  <option value="UZS">UZS</option>
                  <option value="USD">USD</option>
                  <option value="OTHER">{tr('Other', 'Boshqa')}</option>
                </select>
              </div>

              {sellCurrency === 'OTHER' && (
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">{tr('Other currency (3-letter)', 'Boshqa valyuta (3 harf)')}</label>
                  <input
                  value={sellOtherCurrency}
                  onChange={(e) => setSellOtherCurrency(e.target.value)}
                  minLength={3}
                  maxLength={3}
                    disabled={sellBusy}
                    className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-primary transition"
                    placeholder="e.g. EUR"
                  />
                </div>
              )}

              {(sellCurrency === 'OTHER' ? sellOtherCurrency : sellCurrency).trim().toUpperCase() !== 'UZS' && (
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">{tr('Rate to UZS', 'UZS kursi')}</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.000001"
                    step="any"
                    value={sellExchangeRate}
                    onChange={(e) => setSellExchangeRate(e.target.value)}
                    disabled={sellBusy}
                    className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-primary transition"
                    placeholder="12600"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-muted mb-1">{tr('Kassa desk', 'Kassa')}</label>
                <select
                  value={sellKassaDeskId}
                  onChange={(e) => setSellKassaDeskId(e.target.value)}
                  disabled={sellBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-primary transition"
                >
                  <option value="">{tr('Select kassa', 'Kassani tanlang')}</option>
                  {sellDeskOptions.map((desk) => (
                    <option key={desk.id} value={desk.id}>
                      {desk.firm?.name ? `${desk.firm.name} · ` : ''}{desk.name}{desk.code ? ` (${desk.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">{tr('Purchaser full name', 'Xaridor to\'liq ismi')}</label>
                <input
                  value={sellPurchaserName}
                  onChange={(e) => setSellPurchaserName(e.target.value)}
                  disabled={sellBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-primary transition"
                  placeholder="e.g. John Doe"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">{tr('Purchaser ID / Passport', 'Xaridor ID / Passport')}</label>
                <input
                  value={sellPurchaserIdNumber}
                  onChange={(e) => setSellPurchaserIdNumber(e.target.value)}
                  disabled={sellBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-primary transition"
                  placeholder="ID number"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">{tr('Phone (optional)', 'Telefon (ixtiyoriy)')}</label>
                <input
                  value={sellPurchaserPhone}
                  onChange={(e) => setSellPurchaserPhone(e.target.value)}
                  disabled={sellBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-primary transition"
                  placeholder="+998…"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">{tr('Email (optional)', 'Email (ixtiyoriy)')}</label>
                <input
                  type="email"
                  value={sellPurchaserEmail}
                  onChange={(e) => setSellPurchaserEmail(e.target.value)}
                  disabled={sellBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-primary transition"
                  placeholder="email@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">{tr('Notes (optional)', 'Izoh (ixtiyoriy)')}</label>
                <textarea
                  value={sellPurchaserNotes}
                  onChange={(e) => setSellPurchaserNotes(e.target.value)}
                  disabled={sellBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-primary transition"
                  rows={2}
                  placeholder={tr('Any extra info', "Qo'shimcha ma'lumot")}
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
                {tr('Cancel', 'Bekor qilish')}
              </button>
              <button
                type="button"
                onClick={confirmSell}
                disabled={sellBusy || !singleSaleDraftValid}
                className="px-4 py-2 bg-primary hover:bg-primary-hover text-ink font-bold uppercase tracking-wider rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sellBusy ? tr('Selling…', 'Sotilmoqda…') : tr('Confirm', 'Tasdiqlash')}
              </button>
            </div>
          </div>
        </div>
      )}

      {editAllocation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-2xl">
            <h3 className="text-xl font-bold">{tr('Edit allocation', 'Ajratmani tahrirlash')}</h3>
            <p className="mt-1 text-sm text-muted">{editAllocation.fromFirm?.name} → {editAllocation.toFirm?.name}</p>
            <div className="mt-4 space-y-3">
              {editAllocationRows.map((row, index) => <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <label><span className="compact-label">{tr('Quantity', 'Miqdor')}</span><input type="number" min="1" className="compact-control" value={row.quantity} onChange={(event) => setEditAllocationRows((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, quantity: event.target.value } : item))} /></label>
                <label><span className="compact-label">{tr('Unit price', 'Bir dona narxi')}</span><input type="number" min="0.01" step="0.01" className="compact-control" value={row.price} onChange={(event) => setEditAllocationRows((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, price: event.target.value } : item))} /></label>
                <button type="button" disabled={editAllocationRows.length === 1} onClick={() => setEditAllocationRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))} className="mt-5 rounded border border-red-600/40 px-3 text-red-500 disabled:opacity-40">×</button>
              </div>)}
              <button type="button" onClick={() => setEditAllocationRows((rows) => [...rows, { quantity: '1', price: rows.at(-1)?.price || '' }])} className="rounded border border-primary/50 px-3 py-2 text-sm font-semibold text-primary">+ {tr('Add price row', 'Narx qatori qo‘shish')}</button>
              <label className="block"><span className="compact-label">{tr('Note', 'Izoh')}</span><textarea className="compact-control" rows={2} value={editAllocationNote} onChange={(event) => setEditAllocationNote(event.target.value)} /></label>
              <label className="block"><span className="compact-label">{tr('Required edit reason', 'Tahrirlash sababi (majburiy)')}</span><textarea className="compact-control" rows={3} maxLength={500} value={editAllocationReason} onChange={(event) => setEditAllocationReason(event.target.value)} /></label>
            </div>
            <div className="mt-6 flex justify-end gap-3"><button type="button" disabled={editAllocationBusy} onClick={() => setEditAllocation(null)} className="rounded bg-surface-2 px-4 py-2">{tr('Cancel', 'Bekor qilish')}</button><button type="button" disabled={editAllocationBusy || !editAllocationDraftValid} onClick={submitAllocationEdit} className="rounded bg-primary px-4 py-2 font-bold text-primary-foreground disabled:opacity-50">{editAllocationBusy ? tr('Saving…', 'Saqlanmoqda…') : tr('Send change', 'O‘zgarishni yuborish')}</button></div>
          </div>
        </div>
      )}

      {cancelAllocation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-2xl">
            <h3 className="text-xl font-bold">{tr('Cancel allocation', 'Ajratmani bekor qilish')}</h3>
            <p className="mt-1 text-sm text-muted">{tr('Only free, unsold and tour-unreserved tickets can be cancelled.', 'Faqat erkin, sotilmagan va turga band qilinmagan chiptalar bekor qilinadi.')}</p>
            <label className="mt-4 block"><span className="compact-label">{tr('Ticket quantity', 'Bilet soni')} (max: {cancelAllocation.cancellableQuantity})</span><input type="number" min="1" max={cancelAllocation.cancellableQuantity} className="compact-control" value={cancelAllocationQuantity} onChange={(event) => setCancelAllocationQuantity(event.target.value)} /></label>
            <label className="mt-4 block"><span className="compact-label">{tr('Required cancellation reason', 'Bekor qilish sababi (majburiy)')}</span><textarea className="compact-control" rows={4} maxLength={500} value={cancelAllocationReason} onChange={(event) => setCancelAllocationReason(event.target.value)} /></label>
            <div className="mt-6 flex justify-end gap-3"><button type="button" disabled={cancelAllocationBusy} onClick={() => setCancelAllocation(null)} className="rounded bg-surface-2 px-4 py-2">{tr('Cancel', 'Bekor qilish')}</button><button type="button" disabled={cancelAllocationBusy || !cancelAllocationDraftValid} onClick={submitAllocationCancel} className="rounded bg-red-600 px-4 py-2 font-bold text-white disabled:opacity-50">{cancelAllocationBusy ? tr('Sending…', 'Yuborilmoqda…') : tr('Cancel tickets', 'Biletlarni bekor qilish')}</button></div>
          </div>
        </div>
      )}

      {confirmAllocationTicketId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-xl font-bold text-foreground mb-2">{tr('Confirm allocation', 'Ajratmani tasdiqlash')}</h3>
            <p className="text-sm text-muted">
              {tr('All tickets in this allocation will be accepted together.', 'Ushbu ajratmadagi barcha chiptalar birgalikda tasdiqlanadi.')}
            </p>

            {confirmAllocationTicket && (
              <div className="mt-4 space-y-3 rounded-lg border border-border bg-surface-2 p-4">
                <div className="flex justify-between gap-3">
                  <span className="text-muted">{tr('Tickets', 'Bilet soni')}</span>
                  <strong>{confirmAllocationTicket.allocatedQuantity} ta</strong>
                </div>
                {(confirmAllocationTicket.priceRows || []).map((row: any, index: number) => (
                  <div key={index} className="flex justify-between gap-3 text-sm">
                    <span className="text-muted">{row.quantity} ta ×</span>
                    <span>{Number(row.unitPrice || 0).toLocaleString()} {confirmAllocationTicket.currency}</span>
                  </div>
                ))}
                <div className="flex justify-between gap-3 border-t border-border pt-3">
                  <span className="font-semibold text-muted">{tr('Total', 'Jami summa')}</span>
                  <strong>{Number(confirmAllocationTicket.totalAmount || 0).toLocaleString()} {confirmAllocationTicket.currency}</strong>
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeConfirmAllocation}
                disabled={confirmAllocationBusy}
                className="px-4 py-2 bg-surface-2 hover:bg-surface text-foreground rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {tr('Cancel', 'Bekor qilish')}
              </button>
              <button
                type="button"
                onClick={confirmAllocation}
                disabled={confirmAllocationBusy}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {confirmAllocationBusy ? tr('Confirming…', 'Tasdiqlanmoqda…') : tr('Confirm', 'Tasdiqlash')}
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectAllocationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-xl font-bold text-foreground mb-2">{tr('Reject allocation', 'Ajratmani rad etish')}</h3>
            <p className="text-sm text-muted">
              {tr(
                'After rejection, these tickets return to the sender inventory. Do you want to continue?',
                'Ajratma rad etilgandan keyin ushbu chiptalar yuboruvchi firma zaxirasiga qaytariladi. Ushbu amalni davom ettirmoqchimisiz?'
              )}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-surface-2 p-3 text-sm">
              <span className="text-muted">{tr('Tickets', 'Bilet soni')}</span><strong className="text-right">{rejectAllocationModal.allocatedQuantity} ta</strong>
              <span className="text-muted">{tr('Total', 'Jami summa')}</span><strong className="text-right">{Number(rejectAllocationModal.totalAmount || 0).toLocaleString()} {rejectAllocationModal.currency}</strong>
            </div>
            <label className="mt-4 block text-sm font-medium text-muted">{tr('Rejection reason', 'Rad etish sababi')}</label>
            <textarea
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value.slice(0, 500))}
              rows={4}
              disabled={rejectAllocationBusy}
              className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-foreground outline-none focus:border-primary"
              placeholder={tr('Write at least 5 characters', 'Kamida 5 ta belgi yozing')}
            />
            <div className="mt-1 text-right text-xs text-muted">{rejectionReason.length}/500</div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { if (!rejectAllocationBusy) { setRejectAllocationModal(null); setRejectionReason(''); } }}
                disabled={rejectAllocationBusy}
                className="px-4 py-2 bg-surface-2 hover:bg-surface text-foreground rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {tr('Cancel', 'Bekor qilish')}
              </button>
              <button
                type="button"
                onClick={rejectAllocation}
                disabled={rejectAllocationBusy || rejectionReason.trim().length < 5}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {rejectAllocationBusy ? tr('Rejecting…', 'Rad etilmoqda…') : tr('Confirm rejection', 'Rad etishni tasdiqlash')}
              </button>
            </div>
          </div>
        </div>
      )}

      {deallocateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-xl font-bold text-foreground mb-2">{tr('Confirm deallocation', 'Ajratishni bekor qilishni tasdiqlash')}</h3>
            <p className="text-sm text-muted">
              {tr('Deallocate this ticket?', 'Ushbu chiptani ajratishni bekor qilasizmi?')}{' '}
              {deallocateConfirm.status === 'ASSIGNED'
                ? (
                    <span>
                      {tr('This returns the ticket to the source inventory without creating an allocation transaction.', 'Bu chiptani ajratma tranzaksiyasi yaratmasdan manba zaxirasiga qaytaradi.')}
                    </span>
                  )
                : (
                    <span>
                      {tr('This will cancel the pending allocation.', 'Bu kutilayotgan ajratmani bekor qiladi.')}
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
                {tr('Cancel', 'Bekor qilish')}
              </button>
              <button
                type="button"
                onClick={confirmDeallocate}
                disabled={deallocateBusy}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deallocateBusy ? tr('Deallocating…', 'Ajratish bekor qilinmoqda…') : tr('Deallocate', 'Ajratishni bekor qilish')}
              </button>
            </div>
          </div>
        </div>
      )}

      {saleCancelRequestTicketId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-xl font-bold text-foreground mb-2">{tr('Request cancellation', "Bekor qilishni so'rash")}</h3>
            <p className="text-sm text-muted">
              {tr(
                'Explain what happened. Admin will review and (if approved) the ticket will be returned to your firm.',
                'Vaziyatni tushuntiring. Admin ko‘rib chiqadi va (tasdiqlansa) chipta firmangizga qaytariladi.'
              )}
            </p>

            <div className="mt-4">
              <label className="block text-sm font-medium text-muted mb-2">{tr('Reason', 'Sabab')}</label>
              <textarea
                value={saleCancelRequestReason}
                onChange={(e) => setSaleCancelRequestReason(e.target.value.slice(0, 500))}
                disabled={saleCancelRequestBusy}
                className="w-full bg-surface-2 border border-border rounded-lg px-4 py-3 text-foreground placeholder:text-muted outline-none focus:border-primary transition disabled:opacity-50"
                rows={3}
                placeholder={tr('e.g. Sold wrong ticket number to customer', 'masalan: mijozga noto‘g‘ri chipta raqami sotildi')}
              />
              <p className="mt-1 text-xs text-muted">{tr('Max 500 characters.', 'Maksimum 500 belgi.')}</p>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeSaleCancelRequestModal}
                disabled={saleCancelRequestBusy}
                className="px-4 py-2 bg-surface-2 hover:bg-surface text-foreground rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {tr('Cancel', 'Bekor qilish')}
              </button>
              <button
                type="button"
                onClick={submitSaleCancelRequest}
                disabled={saleCancelRequestBusy || !saleCancelRequestReason.trim() || saleCancelRequestReason.trim().length > 500}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saleCancelRequestBusy ? tr('Sending…', 'Yuborilmoqda…') : tr('Send request', "So'rov yuborish")}
              </button>
            </div>
          </div>
        </div>
      )}

      {saleCancelApprove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-xl font-bold text-foreground mb-2">{tr('Cancel purchase', 'Xaridni bekor qilish')}</h3>
            <p className="text-sm text-muted">
              {tr(
                'Approve this cancellation request? This will reverse the SALE transaction and set the ticket back to',
                'Ushbu bekor qilish so‘rovini tasdiqlaysizmi? Bu SALE tranzaksiyasini bekor qiladi va chiptani qayta'
              )}{' '}
              <span className="text-foreground font-semibold">ASSIGNED</span>.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <div className="text-xs font-medium text-muted">{tr('Firm reason', 'Firma sababi')}</div>
                <div className="mt-1 bg-surface-2 border border-border rounded-lg px-4 py-3 text-foreground whitespace-pre-wrap">
                  {saleCancelApprove.firmReason || '—'}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-2">{tr('Admin reason', 'Admin sababi')}</label>
                <textarea
                  value={saleCancelDecisionReason}
                  onChange={(e) => setSaleCancelDecisionReason(e.target.value.slice(0, 500))}
                  disabled={saleCancelApproveBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-3 text-foreground placeholder:text-muted outline-none focus:border-primary transition disabled:opacity-50"
                  rows={3}
                  placeholder={tr('Why is this cancellation approved?', 'Nega bu bekor qilish tasdiqlandi?')}
                />
                <p className="mt-1 text-xs text-muted">{tr('Max 500 characters.', 'Maksimum 500 belgi.')}</p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeSaleCancelApproveModal}
                disabled={saleCancelApproveBusy}
                className="px-4 py-2 bg-surface-2 hover:bg-surface text-foreground rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {tr('Cancel', 'Bekor qilish')}
              </button>
              <button
                type="button"
                onClick={confirmSaleCancelApprove}
                disabled={saleCancelApproveBusy || !saleCancelDecisionReason.trim() || saleCancelDecisionReason.trim().length > 500}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saleCancelApproveBusy
                  ? tr('Cancelling…', 'Bekor qilinmoqda…')
                  : tr('Cancel purchase', 'Xaridni bekor qilish')}
              </button>
            </div>
          </div>
        </div>
      )}

      {sellBatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-sm p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-foreground mb-2">{tr('Confirm batch sale', 'Ommaviy sotuvni tasdiqlash')}</h3>
            <p className="text-sm text-muted">
              {tr('Mark', 'Belgilang')}{' '}
              <span className="text-foreground font-semibold">N</span>{' '}
              {tr('of your assigned tickets as', 'ta biriktirilgan chiptani')}{' '}
              <span className="text-foreground font-semibold">SOLD</span>.{' '}
              {tr('This will create SALE transactions.', 'Bu SALE tranzaksiyalarini yaratadi.')}
            </p>

            <div className="mt-4">
              <label className="block text-sm font-medium text-muted mb-2">{tr('Quantity', 'Miqdor')}</label>
              <input
                type="number"
                min={1}
                step={1}
                required
                className="w-full bg-surface-2 border border-border rounded-lg px-4 py-3 text-foreground outline-none focus:border-primary transition"
                value={sellBatchQuantity}
                onChange={(e) => setSellBatchQuantity(e.target.value)}
                disabled={sellBatchBusy}
              />
              <p className="mt-1 text-xs text-muted">
                {tr(
                  'Uses the earliest assigned (unsold) tickets for this flight.',
                  'Ushbu reys uchun eng erta biriktirilgan (sotilmagan) chiptalardan foydalanadi.'
                )}
              </p>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-border bg-surface-2 p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label><span className="compact-label">{tr('Ticket product', 'Bilet mahsuloti')}</span><select className="compact-control" value={sellBatchProductType} onChange={(e) => setSellBatchProductType(e.target.value as any)} disabled={sellBatchBusy}><option value="ROUND_TRIP">RT — borish–kelish</option><option value="ONE_WAY">OW — segment</option></select></label>
                  {sellBatchProductType === 'ONE_WAY' && <label><span className="compact-label">{tr('Direction', 'Yo‘nalish')}</span><select className="compact-control" value={sellBatchDirection} onChange={(e) => setSellBatchDirection(e.target.value as any)} disabled={sellBatchBusy}><option value="OUTBOUND">OUTBOUND</option><option value="RETURN">RETURN</option></select></label>}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">{tr('Sale price (per ticket)', 'Sotuv narxi (har chipta uchun)')}</label>
                <input
                  type="number"
                  step="0.01"
                  min={0.01}
                  value={sellBatchPrice}
                  onChange={(e) => setSellBatchPrice(e.target.value)}
                  disabled={sellBatchBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-primary transition"
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">{tr('Sale currency', 'Sotuv valyutasi')}</label>
                <select
                  value={sellBatchCurrency}
                  onChange={(e) => setSellBatchCurrency(e.target.value as any)}
                  disabled={sellBatchBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-primary transition"
                >
                  <option value="UZS">UZS</option>
                  <option value="USD">USD</option>
                  <option value="OTHER">{tr('Other', 'Boshqa')}</option>
                </select>
              </div>

              {sellBatchCurrency === 'OTHER' && (
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">{tr('Other currency (3-letter)', 'Boshqa valyuta (3 harf)')}</label>
                  <input
                  value={sellBatchOtherCurrency}
                  onChange={(e) => setSellBatchOtherCurrency(e.target.value)}
                  minLength={3}
                  maxLength={3}
                    disabled={sellBatchBusy}
                    className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-primary transition"
                    placeholder="e.g. EUR"
                  />
                </div>
              )}

              {(sellBatchCurrency === 'OTHER' ? sellBatchOtherCurrency : sellBatchCurrency).trim().toUpperCase() !== 'UZS' && (
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">{tr('Rate to UZS', 'UZS kursi')}</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.000001"
                    step="any"
                    value={sellBatchExchangeRate}
                    onChange={(e) => setSellBatchExchangeRate(e.target.value)}
                    disabled={sellBatchBusy}
                    className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-primary transition"
                    placeholder="12600"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-muted mb-1">{tr('Kassa desk', 'Kassa')}</label>
                <select
                  value={sellBatchKassaDeskId}
                  onChange={(e) => setSellBatchKassaDeskId(e.target.value)}
                  disabled={sellBatchBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-primary transition"
                >
                  <option value="">{tr('Select kassa', 'Kassani tanlang')}</option>
                  {sellBatchDeskOptions.map((desk) => (
                    <option key={desk.id} value={desk.id}>
                      {desk.firm?.name ? `${desk.firm.name} · ` : ''}{desk.name}{desk.code ? ` (${desk.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">{tr('Purchaser full name', 'Xaridor to\'liq ismi')}</label>
                <input
                  value={sellBatchPurchaserName}
                  onChange={(e) => setSellBatchPurchaserName(e.target.value)}
                  disabled={sellBatchBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-primary transition"
                  placeholder="e.g. John Doe"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">{tr('Purchaser ID / Passport', 'Xaridor ID / Passport')}</label>
                <input
                  value={sellBatchPurchaserIdNumber}
                  onChange={(e) => setSellBatchPurchaserIdNumber(e.target.value)}
                  disabled={sellBatchBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-primary transition"
                  placeholder="ID number"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">{tr('Phone (optional)', 'Telefon (ixtiyoriy)')}</label>
                <input
                  value={sellBatchPurchaserPhone}
                  onChange={(e) => setSellBatchPurchaserPhone(e.target.value)}
                  disabled={sellBatchBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-primary transition"
                  placeholder="+998…"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">{tr('Email (optional)', 'Email (ixtiyoriy)')}</label>
                <input
                  type="email"
                  value={sellBatchPurchaserEmail}
                  onChange={(e) => setSellBatchPurchaserEmail(e.target.value)}
                  disabled={sellBatchBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-primary transition"
                  placeholder="email@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">{tr('Notes (optional)', 'Izoh (ixtiyoriy)')}</label>
                <textarea
                  value={sellBatchPurchaserNotes}
                  onChange={(e) => setSellBatchPurchaserNotes(e.target.value)}
                  disabled={sellBatchBusy}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted outline-none focus:border-primary transition"
                  rows={2}
                  placeholder={tr('Any extra info', "Qo'shimcha ma'lumot")}
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
                {tr('Cancel', 'Bekor qilish')}
              </button>
              <button
                type="button"
                onClick={confirmSellBatch}
                disabled={sellBatchBusy || !batchSaleDraftValid}
                className="px-4 py-2 bg-primary hover:bg-primary-hover text-ink font-bold uppercase tracking-wider rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sellBatchBusy ? tr('Selling…', 'Sotilmoqda…') : tr('Confirm', 'Tasdiqlash')}
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
        <Plane className="mx-auto h-12 w-12 animate-pulse text-primary" />
      </div>
    }>
      <FlightDetailContent />
    </Suspense>
  )
}
