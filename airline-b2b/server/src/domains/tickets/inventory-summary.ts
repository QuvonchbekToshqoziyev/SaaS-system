type MoneyValue = string | number | { toString(): string } | null | undefined;

type InventoryLeg = {
  id: string;
  ticketId?: string;
  direction: string;
  status: string;
  currentOwnerFirmId?: string | null;
  acquisitionCostSnapshot: MoneyValue;
  originalCostSnapshot?: MoneyValue;
  allocationPriceSnapshot?: MoneyValue;
  currencySnapshot: string;
};

type InventoryTicket = {
  id: string;
  status: string;
  ticketType?: string;
  assignedFirmId?: string | null;
  originalOwnerFirmId?: string | null;
  basePrice: MoneyValue;
  originPrice?: MoneyValue;
  currency: string;
  soldPrice?: MoneyValue;
  soldCurrency?: string | null;
  purchaserInfo?: unknown;
  legs?: InventoryLeg[];
};

type InventoryAllocationLeg = {
  ticketLegId: string;
  status?: string;
  direction: string;
  acquisitionCostSnapshot: MoneyValue;
  allocationPriceSnapshot: MoneyValue;
  currencySnapshot: string;
  acquisitionCurrencySnapshot?: string;
  allocationCurrencySnapshot?: string;
};

type InventoryAllocation = {
  id: string;
  fromFirmId: string;
  toFirmId: string;
  fromFirm?: { id: string; name: string } | null;
  toFirm?: { id: string; name: string } | null;
  status: string;
  productType?: string;
  direction?: string | null;
  parentTicketCount?: number;
  segmentCount?: number;
  currency: string;
  totalAmount: MoneyValue;
  priceRows?: Array<{ quantity: number; unitPrice?: MoneyValue; totalAmount?: MoneyValue }>;
  tickets?: Array<{ id: string }>;
  legItems?: InventoryAllocationLeg[];
  createdAt?: string | Date;
  acceptedAt?: string | Date | null;
};

type InventorySale = {
  id: string;
  sellerFirmId: string;
  status: string;
  productType: string;
  direction?: string | null;
  quantity: number;
  segmentCount: number;
  unitPrice: MoneyValue;
  totalAmount: MoneyValue;
  currency: string;
  purchaserInfo?: unknown;
  createdAt?: string | Date;
  items?: Array<{
    ticketLegId: string;
    status?: string;
    acquisitionCostSnapshot: MoneyValue;
    salePriceSnapshot: MoneyValue;
    currencySnapshot: string;
    acquisitionCurrencySnapshot?: string;
    saleCurrencySnapshot?: string;
  }>;
};

type InventoryTransaction = {
  id: string;
  type: string;
  firmId?: string | null;
  payerFirmId?: string | null;
  receiverFirmId?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  originalAmount: MoneyValue;
  currency: string;
  sourceMode?: string | null;
  status?: string | null;
  reversedTransactionId?: string | null;
  deletedAt?: string | Date | null;
  metadata?: unknown;
};

export type AmountRow = { currency: string; count: number; total: number };

const number = (value: MoneyValue) => {
  const parsed = Number(value == null ? 0 : String(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

const upper = (value: unknown) => String(value || '').trim().toUpperCase();
const activeStatus = (value: unknown) => !['REJECTED', 'CANCELLED', 'EXPIRED'].includes(upper(value));
const sellableLeg = (leg: InventoryLeg) => ['AVAILABLE', 'ASSIGNED'].includes(upper(leg.status));

const allocationQuantity = (allocation: InventoryAllocation) => {
  const explicit = Math.max(0, Math.floor(Number(allocation.parentTicketCount || 0)));
  if (explicit) return explicit;
  const rows = allocation.priceRows || [];
  const quantity = rows.reduce((sum, row) => sum + Math.max(0, Math.floor(Number(row.quantity || 0))), 0);
  return quantity || allocation.tickets?.length || 0;
};

export function amountRows(rows: Array<{ currency?: string | null; count?: number; total: number }>): AmountRow[] {
  const totals = new Map<string, AmountRow>();
  for (const row of rows) {
    const currency = upper(row.currency) || 'UZS';
    const current = totals.get(currency) || { currency, count: 0, total: 0 };
    current.count += Number(row.count || 0);
    current.total += Number(row.total || 0);
    totals.set(currency, current);
  }
  return Array.from(totals.values())
    .map((row) => ({ ...row, total: Number(row.total.toFixed(4)) }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

function subtractAmounts(revenue: AmountRow[], costs: AmountRow[]): AmountRow[] {
  return amountRows([
    ...revenue.map((row) => ({ currency: row.currency, total: row.total })),
    ...costs.map((row) => ({ currency: row.currency, total: -row.total })),
  ]);
}

function debtAmounts(revenue: AmountRow[], payments: AmountRow[]) {
  const currencies = new Set([...revenue.map((row) => row.currency), ...payments.map((row) => row.currency)]);
  const debt: AmountRow[] = [];
  const overpayment: AmountRow[] = [];
  for (const currency of currencies) {
    const charged = revenue.find((row) => row.currency === currency)?.total || 0;
    const paid = payments.find((row) => row.currency === currency)?.total || 0;
    debt.push({ currency, count: 0, total: Math.max(charged - paid, 0) });
    overpayment.push({ currency, count: 0, total: Math.max(paid - charged, 0) });
  }
  return { debt: amountRows(debt), overpayment: amountRows(overpayment) };
}

function purchaserName(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Mijoz';
  const name = String((value as Record<string, unknown>).name || '').trim();
  return name || 'Mijoz';
}

function transactionAllocationId(transaction: InventoryTransaction): string {
  if (upper(transaction.subjectType) === 'TICKET_ALLOCATION') return String(transaction.subjectId || '');
  const metadata = transaction.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return '';
  return String((metadata as Record<string, unknown>).allocationId || '');
}

function confirmedPayments(transactions: InventoryTransaction[]) {
  const reversedIds = new Set(transactions.map((row) => String(row.reversedTransactionId || '')).filter(Boolean));
  return transactions.filter((row) =>
    upper(row.type) === 'PAYMENT'
    && upper(row.status || 'CONFIRMED') === 'CONFIRMED'
    && !row.deletedAt
    && !row.reversedTransactionId
    && !reversedIds.has(row.id)
    && number(row.originalAmount) > 0
  );
}

function legacySummary(input: {
  tickets: InventoryTicket[];
  allocations: InventoryAllocation[];
  sourceFirmId?: string | null;
  originOwnerFirmId?: string | null;
}) {
  const sourceFirmId = String(input.sourceFirmId || '').trim();
  const originOwnerFirmId = String(input.originOwnerFirmId || '').trim();
  const sourceOwnsOrigin = sourceFirmId
    ? Boolean(originOwnerFirmId) && sourceFirmId === originOwnerFirmId
    : !originOwnerFirmId;
  const activeAllocations = input.allocations.filter((row) => ['PENDING', 'ACCEPTED'].includes(upper(row.status)));
  const incoming = activeAllocations.filter((row) => row.toFirmId === sourceFirmId && upper(row.status) === 'ACCEPTED');
  const outgoing = activeAllocations.filter((row) => !sourceFirmId || row.fromFirmId === sourceFirmId);
  const receivedRows = sourceOwnsOrigin
    ? input.tickets.map((ticket) => ({ currency: ticket.currency, count: 1, total: number(ticket.originPrice) || number(ticket.basePrice) }))
    : incoming.map((allocation) => ({ currency: allocation.currency, count: allocationQuantity(allocation), total: number(allocation.totalAmount) }));
  const currentTickets = input.tickets.filter((ticket) => {
    const status = upper(ticket.status);
    if (!['AVAILABLE', 'ASSIGNED', 'RESERVED_FOR_TOUR'].includes(status)) return false;
    if (ticket.assignedFirmId === sourceFirmId) return true;
    return sourceOwnsOrigin && !ticket.assignedFirmId && status === 'AVAILABLE';
  });
  const directlySoldTickets = input.tickets.filter((ticket) => upper(ticket.status) === 'SOLD' && (!sourceFirmId || ticket.assignedFirmId === sourceFirmId));
  const soldOrAllocatedRows = [
    ...outgoing.map((allocation) => ({ currency: allocation.currency, count: allocationQuantity(allocation), total: number(allocation.totalAmount) })),
    ...directlySoldTickets.map((ticket) => ({ currency: ticket.soldCurrency || ticket.currency, count: 1, total: number(ticket.soldPrice) })),
  ];
  const remainingRows = currentTickets.map((ticket) => ({ currency: ticket.currency, count: 1, total: number(ticket.basePrice) }));
  return {
    reportType: sourceOwnsOrigin ? 'OWNER' : 'AGENT',
    received: { count: receivedRows.reduce((sum, row) => sum + row.count, 0), amounts: amountRows(receivedRows) },
    soldOrAllocated: { count: soldOrAllocatedRows.reduce((sum, row) => sum + row.count, 0), amounts: amountRows(soldOrAllocatedRows) },
    remaining: {
      count: currentTickets.length,
      availableCount: currentTickets.filter((ticket) => upper(ticket.status) !== 'RESERVED_FOR_TOUR').length,
      reservedForTourCount: currentTickets.filter((ticket) => upper(ticket.status) === 'RESERVED_FOR_TOUR').length,
      amounts: amountRows(remainingRows),
    },
    recipients: [
      ...outgoing.map((allocation) => ({ type: 'FIRM' as const, allocationId: allocation.id, name: allocation.toFirm?.name || allocation.toFirmId, quantity: allocationQuantity(allocation), totalAmount: number(allocation.totalAmount), currency: upper(allocation.currency) || 'UZS', status: allocation.status })),
      ...directlySoldTickets.map((ticket) => ({ type: 'CUSTOMER' as const, ticketId: ticket.id, name: purchaserName(ticket.purchaserInfo), quantity: 1, totalAmount: number(ticket.soldPrice), currency: upper(ticket.soldCurrency || ticket.currency) || 'UZS', status: 'SOLD' })),
    ],
  };
}

export function buildTicketInventorySummary(input: {
  tickets: InventoryTicket[];
  allocations: InventoryAllocation[];
  sales?: InventorySale[];
  transactions?: InventoryTransaction[];
  sourceFirmId?: string | null;
  originOwnerFirmId?: string | null;
  migrationIssueCount?: number;
}) {
  const hasLegInventory = input.tickets.some((ticket) => (ticket.legs || []).length > 0);
  if (!hasLegInventory) return legacySummary(input);

  const sourceFirmId = String(input.sourceFirmId || '').trim();
  const originOwnerFirmId = String(input.originOwnerFirmId || '').trim();
  const sourceOwnsOrigin = sourceFirmId
    ? Boolean(originOwnerFirmId) && sourceFirmId === originOwnerFirmId
    : !originOwnerFirmId;
  const allLegs = input.tickets.flatMap((ticket) => (ticket.legs || []).map((leg) => ({ ...leg, ticketId: ticket.id })));
  const ticketById = new Map(input.tickets.map((ticket) => [ticket.id, ticket]));
  const allocations = input.allocations || [];
  const sales = input.sales || [];
  const payments = confirmedPayments(input.transactions || []);
  const incomingAccepted = allocations.filter((row) => row.toFirmId === sourceFirmId && upper(row.status) === 'ACCEPTED');
  const outgoingAccepted = allocations.filter((row) => row.fromFirmId === sourceFirmId && upper(row.status) === 'ACCEPTED');
  const outgoingPending = allocations.filter((row) => row.fromFirmId === sourceFirmId && upper(row.status) === 'PENDING');
  const currentLegs = allLegs.filter((leg) => leg.currentOwnerFirmId === sourceFirmId);
  const currentSellableLegs = currentLegs.filter(sellableLeg);
  const directSales = sales.filter((sale) => sale.sellerFirmId === sourceFirmId && upper(sale.status) === 'CONFIRMED');
  const originTickets = input.tickets.filter((ticket) =>
    ticket.originalOwnerFirmId === sourceFirmId
    || (!ticket.originalOwnerFirmId && sourceOwnsOrigin)
  );

  const receivedRows = sourceOwnsOrigin
    ? originTickets.map((ticket) => ({
        currency: ticket.currency,
        count: 1,
        total: (ticket.legs || []).reduce((sum, leg) => sum + number(leg.originalCostSnapshot ?? leg.acquisitionCostSnapshot), 0)
          || number(ticket.originPrice)
          || number(ticket.basePrice),
      }))
    : incomingAccepted.map((allocation) => ({ currency: allocation.currency, count: allocationQuantity(allocation), total: number(allocation.totalAmount) }));

  const acceptedRevenueRows = outgoingAccepted.map((allocation) => ({ currency: allocation.currency, count: allocationQuantity(allocation), total: number(allocation.totalAmount) }));
  const pendingRows = outgoingPending.map((allocation) => ({ currency: allocation.currency, count: allocationQuantity(allocation), total: number(allocation.totalAmount) }));
  const directSalesRows = directSales.map((sale) => ({ currency: sale.currency, count: sale.quantity, total: number(sale.totalAmount) }));
  const allocatedCostRows = outgoingAccepted.flatMap((allocation) => (allocation.legItems || [])
    .filter((item) => activeStatus(item.status))
    .map((item) => ({ currency: item.acquisitionCurrencySnapshot || item.currencySnapshot, total: number(item.acquisitionCostSnapshot) })));
  const directSalesCostRows = directSales.flatMap((sale) => (sale.items || [])
    .filter((item) => upper(item.status || 'CONFIRMED') === 'CONFIRMED')
    .map((item) => ({ currency: item.acquisitionCurrencySnapshot || item.currencySnapshot, total: number(item.acquisitionCostSnapshot) })));
  const remainingCostRows = currentSellableLegs.map((leg) => ({ currency: leg.currencySnapshot, total: number(leg.acquisitionCostSnapshot) }));

  const receivedAmounts = amountRows(receivedRows);
  const acceptedRevenue = amountRows(acceptedRevenueRows);
  const pendingValue = amountRows(pendingRows);
  const directRevenue = amountRows(directSalesRows);
  const allocatedCost = amountRows(allocatedCostRows);
  const directCost = amountRows(directSalesCostRows);
  const remainingCost = amountRows(remainingCostRows);
  const soldOrAllocatedRows = [...acceptedRevenueRows, ...directSalesRows];

  const receivedPayments = payments.filter((row) => row.receiverFirmId === sourceFirmId || (!row.receiverFirmId && row.firmId === sourceFirmId));
  const madePayments = payments.filter((row) => row.payerFirmId === sourceFirmId);
  const receivedPaymentAmounts = amountRows(receivedPayments.map((row) => ({ currency: row.currency, total: number(row.originalAmount) })));
  const madePaymentAmounts = amountRows(madePayments.map((row) => ({ currency: row.currency, total: number(row.originalAmount) })));
  const receivable = debtAmounts(acceptedRevenue, receivedPaymentAmounts);
  const incomingCost = amountRows(incomingAccepted.map((row) => ({ currency: row.currency, count: allocationQuantity(row), total: number(row.totalAmount) })));
  const payable = debtAmounts(incomingCost, madePaymentAmounts);

  const acquiredLegIds = new Set<string>();
  if (sourceOwnsOrigin) originTickets.flatMap((ticket) => ticket.legs || []).forEach((leg) => acquiredLegIds.add(leg.id));
  else incomingAccepted.flatMap((allocation) => allocation.legItems || []).filter((item) => activeStatus(item.status)).forEach((item) => acquiredLegIds.add(item.ticketLegId));
  const acquiredLegs = allLegs.filter((leg) => acquiredLegIds.has(leg.id));
  const acquiredTicketIds = new Set(acquiredLegs.map((leg) => String(leg.ticketId || '')));
  const visibleLegsByTicket = new Map<string, InventoryLeg[]>();
  for (const leg of acquiredLegs) {
    const ticketId = String(leg.ticketId || '');
    visibleLegsByTicket.set(ticketId, [...(visibleLegsByTicket.get(ticketId) || []), leg]);
  }

  let availableRoundTripCount = 0;
  let outboundOnlyAvailableCount = 0;
  let returnOnlyAvailableCount = 0;
  let partiallyUsedTicketCount = 0;
  let fullyUsedTicketCount = 0;
  for (const ticketId of acquiredTicketIds) {
    const ticket = ticketById.get(ticketId);
    const acquired = visibleLegsByTicket.get(ticketId) || [];
    const outbound = acquired.find((leg) => upper(leg.direction) === 'OUTBOUND');
    const returning = acquired.find((leg) => upper(leg.direction) === 'RETURN');
    const outboundAvailable = Boolean(outbound && outbound.currentOwnerFirmId === sourceFirmId && sellableLeg(outbound));
    const returnAvailable = Boolean(returning && returning.currentOwnerFirmId === sourceFirmId && sellableLeg(returning));
    if (upper(ticket?.ticketType) === 'ROUND_TRIP' && outboundAvailable && returnAvailable) availableRoundTripCount += 1;
    if (outboundAvailable && returning && !returnAvailable) outboundOnlyAvailableCount += 1;
    if (returnAvailable && outbound && !outboundAvailable) returnOnlyAvailableCount += 1;
    const availableCount = acquired.filter((leg) => leg.currentOwnerFirmId === sourceFirmId && sellableLeg(leg)).length;
    if (availableCount > 0 && availableCount < acquired.length) partiallyUsedTicketCount += 1;
    if (acquired.length > 0 && availableCount === 0) fullyUsedTicketCount += 1;
  }

  const parentWithAvailable = new Set(currentSellableLegs.map((leg) => String(leg.ticketId || ''))).size;
  const reservedLegs = currentLegs.filter((leg) => upper(leg.status) === 'RESERVED_FOR_TOUR');
  const soldLegs = currentLegs.filter((leg) => upper(leg.status) === 'SOLD');
  const pendingLegs = currentLegs.filter((leg) => upper(leg.status) === 'PENDING_ALLOCATION');
  const assignedLegs = currentLegs.filter((leg) => upper(leg.status) === 'ASSIGNED');

  const allocationBreakdown = (rows: InventoryAllocation[]) => ({
    roundTripCount: rows.filter((row) => upper(row.productType) === 'ROUND_TRIP').reduce((sum, row) => sum + allocationQuantity(row), 0),
    outboundOneWayCount: rows.filter((row) => upper(row.productType) === 'ONE_WAY' && upper(row.direction) === 'OUTBOUND').reduce((sum, row) => sum + allocationQuantity(row), 0),
    returnOneWayCount: rows.filter((row) => upper(row.productType) === 'ONE_WAY' && upper(row.direction) === 'RETURN').reduce((sum, row) => sum + allocationQuantity(row), 0),
    amounts: amountRows(rows.map((row) => ({ currency: row.currency, count: allocationQuantity(row), total: number(row.totalAmount) }))),
  });
  const salesBreakdown = {
    roundTripCount: directSales.filter((row) => upper(row.productType) === 'ROUND_TRIP').reduce((sum, row) => sum + row.quantity, 0),
    outboundOneWayCount: directSales.filter((row) => upper(row.productType) === 'ONE_WAY' && upper(row.direction) === 'OUTBOUND').reduce((sum, row) => sum + row.quantity, 0),
    returnOneWayCount: directSales.filter((row) => upper(row.productType) === 'ONE_WAY' && upper(row.direction) === 'RETURN').reduce((sum, row) => sum + row.quantity, 0),
    revenue: directRevenue,
    cost: directCost,
    grossProfit: subtractAmounts(directRevenue, directCost),
  };

  const allocationDetails = allocations
    .filter((row) => row.fromFirmId === sourceFirmId || row.toFirmId === sourceFirmId)
    .map((allocation) => {
      const allocationPayments = payments.filter((row) => transactionAllocationId(row) === allocation.id);
      const paymentAmounts = amountRows(allocationPayments.map((row) => ({ currency: row.currency, total: number(row.originalAmount) })));
      const allocationDebt = debtAmounts(amountRows([{ currency: allocation.currency, total: upper(allocation.status) === 'ACCEPTED' ? number(allocation.totalAmount) : 0 }]), paymentAmounts);
      return {
        id: allocation.id,
        fromFirm: allocation.fromFirm,
        toFirm: allocation.toFirm,
        status: allocation.status,
        productType: upper(allocation.productType) || 'ROUND_TRIP',
        direction: allocation.direction || null,
        quantity: allocationQuantity(allocation),
        segmentCount: Number(allocation.segmentCount || allocation.legItems?.length || 0),
        totalAmount: number(allocation.totalAmount),
        currency: upper(allocation.currency) || 'UZS',
        priceRows: (allocation.priceRows || []).map((row) => ({ quantity: row.quantity, unitPrice: number(row.unitPrice), totalAmount: number(row.totalAmount) || row.quantity * number(row.unitPrice) })),
        paidAmounts: paymentAmounts,
        outstandingDebt: allocationDebt.debt,
        overpayment: allocationDebt.overpayment,
        createdAt: allocation.createdAt,
        acceptedAt: allocation.acceptedAt,
      };
    });

  return {
    reportType: sourceOwnsOrigin ? 'OWNER' : 'AGENT',
    received: { count: receivedRows.reduce((sum, row) => sum + Number(row.count || 0), 0), amounts: receivedAmounts },
    soldOrAllocated: { count: soldOrAllocatedRows.reduce((sum, row) => sum + Number(row.count || 0), 0), amounts: amountRows(soldOrAllocatedRows) },
    remaining: {
      count: parentWithAvailable,
      availableCount: parentWithAvailable,
      reservedForTourCount: new Set(reservedLegs.map((leg) => leg.ticketId)).size,
      amounts: remainingCost,
    },
    totalAcquiredTicketCount: receivedRows.reduce((sum, row) => sum + Number(row.count || 0), 0),
    totalAcquiredCostByCurrency: receivedAmounts,
    pendingAllocationCount: outgoingPending.reduce((sum, row) => sum + allocationQuantity(row), 0),
    pendingAllocationValueByCurrency: pendingValue,
    acceptedAllocatedTicketCount: outgoingAccepted.reduce((sum, row) => sum + allocationQuantity(row), 0),
    acceptedAllocationRevenueByCurrency: acceptedRevenue,
    allocatedCostByCurrency: allocatedCost,
    allocationGrossProfitByCurrency: subtractAmounts(acceptedRevenue, allocatedCost),
    directSoldTicketCount: directSales.reduce((sum, row) => sum + row.quantity, 0),
    directSalesRevenueByCurrency: directRevenue,
    reservedForTourCount: new Set(reservedLegs.map((leg) => leg.ticketId)).size,
    remainingAvailableTicketCount: parentWithAvailable,
    remainingInventoryCostByCurrency: remainingCost,
    paymentsByCurrency: sourceOwnsOrigin ? receivedPaymentAmounts : madePaymentAmounts,
    outstandingDebtByCurrency: sourceOwnsOrigin ? receivable.debt : payable.debt,
    overpaymentByCurrency: sourceOwnsOrigin ? receivable.overpayment : payable.overpayment,
    receivableDebtByCurrency: receivable.debt,
    payableDebtByCurrency: payable.debt,
    rtOw: {
      totalParentTickets: acquiredTicketIds.size,
      originalOutboundLegs: acquiredLegs.filter((leg) => upper(leg.direction) === 'OUTBOUND').length,
      originalReturnLegs: acquiredLegs.filter((leg) => upper(leg.direction) === 'RETURN').length,
      totalSegments: acquiredLegs.length,
      availableRoundTripCount,
      availableOutboundLegCount: currentSellableLegs.filter((leg) => upper(leg.direction) === 'OUTBOUND').length,
      availableReturnLegCount: currentSellableLegs.filter((leg) => upper(leg.direction) === 'RETURN').length,
      remainingSellableLegCount: currentSellableLegs.length,
      outboundOnlyAvailableCount,
      returnOnlyAvailableCount,
      partiallyUsedTicketCount,
      fullyUsedTicketCount,
      pendingLegCount: pendingLegs.length,
      assignedLegCount: assignedLegs.length,
      reservedLegCount: reservedLegs.length,
      soldLegCount: soldLegs.length,
      acceptedAllocatedLegCount: outgoingAccepted.flatMap((row) => row.legItems || []).filter((item) => activeStatus(item.status)).length,
    },
    allocationBreakdown: {
      pending: allocationBreakdown(outgoingPending),
      accepted: allocationBreakdown(outgoingAccepted),
    },
    salesBreakdown,
    allocations: allocationDetails,
    recipients: [
      ...allocationDetails.filter((row) => allocations.find((allocation) => allocation.id === row.id)?.fromFirmId === sourceFirmId).map((row) => ({ type: 'FIRM' as const, allocationId: row.id, name: row.toFirm?.name || row.toFirm?.id || '-', quantity: row.quantity, segmentCount: row.segmentCount, productType: row.productType, direction: row.direction, totalAmount: row.totalAmount, currency: row.currency, status: row.status, paidAmounts: row.paidAmounts, outstandingDebt: row.outstandingDebt })),
      ...directSales.map((sale) => ({ type: 'CUSTOMER' as const, saleId: sale.id, name: purchaserName(sale.purchaserInfo), quantity: sale.quantity, segmentCount: sale.segmentCount, productType: upper(sale.productType), direction: sale.direction || null, totalAmount: number(sale.totalAmount), currency: upper(sale.currency) || 'UZS', status: sale.status })),
    ],
    reconciliationRequired: Number(input.migrationIssueCount || 0) > 0,
    migrationIssueCount: Number(input.migrationIssueCount || 0),
  };
}
