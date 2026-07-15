import { describe, expect, it } from 'vitest';
import { buildTicketInventorySummary } from './inventory-summary';

describe('buildTicketInventorySummary', () => {
  it('does not count tickets allocated to another firm as the sender remaining stock', () => {
    const summary = buildTicketInventorySummary({
      sourceFirmId: 'owner',
      originOwnerFirmId: 'owner',
      tickets: [
        { id: 'own', status: 'ASSIGNED', assignedFirmId: 'owner', basePrice: 100, originPrice: 100, currency: 'USD' },
        { id: 'away', status: 'ASSIGNED', assignedFirmId: 'agency', basePrice: 130, originPrice: 100, currency: 'USD' },
      ],
      allocations: [{
        id: 'allocation', fromFirmId: 'owner', toFirmId: 'agency', toFirm: { id: 'agency', name: 'Agent' },
        status: 'ACCEPTED', currency: 'USD', totalAmount: 130, priceRows: [{ quantity: 1 }],
      }],
    });

    expect(summary.received).toEqual({ count: 2, amounts: [{ currency: 'USD', count: 2, total: 200 }] });
    expect(summary.soldOrAllocated.count).toBe(1);
    expect(summary.remaining).toMatchObject({ count: 1, availableCount: 1 });
    expect(summary.recipients[0]).toMatchObject({ name: 'Agent', quantity: 1, totalAmount: 130 });
  });

  const rtInventory = (count: number, mutate?: (index: number, direction: 'OUTBOUND' | 'RETURN') => Partial<any>) =>
    Array.from({ length: count }, (_, index) => ({
      id: `ticket-${index}`,
      status: 'ASSIGNED',
      ticketType: 'ROUND_TRIP',
      assignedFirmId: 'owner',
      originalOwnerFirmId: 'owner',
      basePrice: 660,
      originPrice: 660,
      currency: 'USD',
      legs: (['OUTBOUND', 'RETURN'] as const).map((direction) => ({
        id: `leg-${index}-${direction}`,
        ticketId: `ticket-${index}`,
        direction,
        status: 'AVAILABLE',
        currentOwnerFirmId: 'owner',
        acquisitionCostSnapshot: direction === 'OUTBOUND' ? 400 : 260,
        originalCostSnapshot: direction === 'OUTBOUND' ? 400 : 260,
        currencySnapshot: 'USD',
        ...mutate?.(index, direction),
      })),
    }));

  it('reports 250 untouched RT tickets as 250 parents and 500 available legs', () => {
    const summary: any = buildTicketInventorySummary({
      sourceFirmId: 'owner',
      originOwnerFirmId: 'owner',
      tickets: rtInventory(250),
      allocations: [],
    });

    expect(summary.received).toEqual({ count: 250, amounts: [{ currency: 'USD', count: 250, total: 165000 }] });
    expect(summary.remainingAvailableTicketCount).toBe(250);
    expect(summary.rtOw).toMatchObject({
      totalParentTickets: 250,
      totalSegments: 500,
      availableRoundTripCount: 250,
      availableOutboundLegCount: 250,
      availableReturnLegCount: 250,
      remainingSellableLegCount: 500,
    });
  });

  it('keeps pending RT segments out of available and accepted totals', () => {
    const tickets = rtInventory(250, (index) => index < 30 ? ({
      status: 'PENDING_ALLOCATION',
      currentOwnerFirmId: 'owner',
    }) : {});
    const summary: any = buildTicketInventorySummary({
      sourceFirmId: 'owner',
      originOwnerFirmId: 'owner',
      tickets,
      allocations: [{
        id: 'pending', fromFirmId: 'owner', toFirmId: 'agent', status: 'PENDING', productType: 'ROUND_TRIP',
        parentTicketCount: 30, segmentCount: 60, currency: 'USD', totalAmount: 28500,
        priceRows: [{ quantity: 30, unitPrice: 950 }],
      }],
    });

    expect(summary.pendingAllocationCount).toBe(30);
    expect(summary.acceptedAllocatedTicketCount).toBe(0);
    expect(summary.rtOw.availableRoundTripCount).toBe(220);
    expect(summary.rtOw.pendingLegCount).toBe(60);
  });

  it('uses accepted allocation revenue and per-leg acquisition cost without mixing them', () => {
    const tickets = rtInventory(250, (index) => index < 30 ? ({ currentOwnerFirmId: 'agent', status: 'ASSIGNED' }) : {});
    const legItems = tickets.slice(0, 30).flatMap((ticket) => ticket.legs.map((leg) => ({
      ticketLegId: leg.id,
      direction: leg.direction,
      status: 'ACTIVE',
      acquisitionCostSnapshot: leg.originalCostSnapshot,
      allocationPriceSnapshot: leg.direction === 'OUTBOUND' ? 575 : 375,
      currencySnapshot: 'USD',
    })));
    const summary: any = buildTicketInventorySummary({
      sourceFirmId: 'owner',
      originOwnerFirmId: 'owner',
      tickets,
      allocations: [{
        id: 'accepted', fromFirmId: 'owner', toFirmId: 'agent', status: 'ACCEPTED', productType: 'ROUND_TRIP',
        parentTicketCount: 30, segmentCount: 60, currency: 'USD', totalAmount: 28425,
        priceRows: [{ quantity: 1, unitPrice: 875 }, { quantity: 29, unitPrice: 950 }], legItems,
      }],
    });

    expect(summary.acceptedAllocatedTicketCount).toBe(30);
    expect(summary.acceptedAllocationRevenueByCurrency[0].total).toBe(28425);
    expect(summary.allocatedCostByCurrency[0].total).toBe(19800);
    expect(summary.allocationGrossProfitByCurrency[0].total).toBe(8625);
    expect(summary.remainingInventoryCostByCurrency[0].total).toBe(145200);
    expect(summary.rtOw.availableRoundTripCount).toBe(220);
  });

  it('returns rejected or cancelled allocation legs to available stock', () => {
    const summary: any = buildTicketInventorySummary({
      sourceFirmId: 'owner',
      originOwnerFirmId: 'owner',
      tickets: rtInventory(250),
      allocations: [{
        id: 'cancelled', fromFirmId: 'owner', toFirmId: 'agent', status: 'CANCELLED', productType: 'ROUND_TRIP',
        parentTicketCount: 30, segmentCount: 60, currency: 'USD', totalAmount: 28500,
      }],
    });
    expect(summary.acceptedAllocatedTicketCount).toBe(0);
    expect(summary.pendingAllocationCount).toBe(0);
    expect(summary.rtOw.availableRoundTripCount).toBe(250);
  });

  it('keeps OW outbound and return stock independent', () => {
    const tickets = rtInventory(250, (index, direction) => {
      if (index < 10 && direction === 'OUTBOUND') return { status: 'SOLD' };
      if (index >= 10 && index < 15) return { status: 'SOLD' };
      return {};
    });
    const sales = [
      { id: 'ow', sellerFirmId: 'owner', status: 'CONFIRMED', productType: 'ONE_WAY', direction: 'OUTBOUND', quantity: 10, segmentCount: 10, unitPrice: 500, totalAmount: 5000, currency: 'USD' },
      { id: 'rt', sellerFirmId: 'owner', status: 'CONFIRMED', productType: 'ROUND_TRIP', quantity: 5, segmentCount: 10, unitPrice: 900, totalAmount: 4500, currency: 'USD' },
    ];
    const summary: any = buildTicketInventorySummary({ sourceFirmId: 'owner', originOwnerFirmId: 'owner', tickets, allocations: [], sales });

    expect(summary.rtOw).toMatchObject({
      availableRoundTripCount: 235,
      availableOutboundLegCount: 235,
      availableReturnLegCount: 245,
      returnOnlyAvailableCount: 10,
      partiallyUsedTicketCount: 10,
      remainingSellableLegCount: 480,
      soldLegCount: 20,
    });
    expect(summary.salesBreakdown).toMatchObject({ roundTripCount: 5, outboundOneWayCount: 10, returnOneWayCount: 0 });
  });

  it('does not expose owner totals in an agent perspective report', () => {
    const tickets = rtInventory(250, (index) => index < 8 ? ({ currentOwnerFirmId: 'agent', status: 'ASSIGNED', acquisitionCostSnapshot: 235 }) : {});
    const legItems = tickets.slice(0, 8).flatMap((ticket) => ticket.legs.map((leg) => ({
      ticketLegId: leg.id, direction: leg.direction, status: 'ACTIVE', acquisitionCostSnapshot: leg.originalCostSnapshot,
      allocationPriceSnapshot: 235, currencySnapshot: 'USD',
    })));
    const summary: any = buildTicketInventorySummary({
      sourceFirmId: 'agent', originOwnerFirmId: 'owner', tickets,
      allocations: [{ id: 'incoming', fromFirmId: 'owner', toFirmId: 'agent', status: 'ACCEPTED', productType: 'ROUND_TRIP', parentTicketCount: 8, segmentCount: 16, currency: 'USD', totalAmount: 3760, legItems }],
    });
    expect(summary.reportType).toBe('AGENT');
    expect(summary.totalAcquiredTicketCount).toBe(8);
    expect(summary.totalAcquiredCostByCurrency[0].total).toBe(3760);
    expect(summary.rtOw.totalParentTickets).toBe(8);
  });

  it('does not promote an authenticated firm to owner when legacy owner metadata is missing', () => {
    const tickets = rtInventory(1, () => ({ currentOwnerFirmId: 'agent', status: 'ASSIGNED' }));
    const legItems = tickets[0].legs.map((leg) => ({
      ticketLegId: leg.id, direction: leg.direction, status: 'ACTIVE', acquisitionCostSnapshot: 235,
      allocationPriceSnapshot: 235, currencySnapshot: 'USD',
    }));
    const summary: any = buildTicketInventorySummary({
      sourceFirmId: 'agent', originOwnerFirmId: null, tickets,
      allocations: [{ id: 'incoming', fromFirmId: 'legacy-owner', toFirmId: 'agent', status: 'ACCEPTED', productType: 'ROUND_TRIP', parentTicketCount: 1, segmentCount: 2, currency: 'USD', totalAmount: 470, legItems }],
    });
    expect(summary.reportType).toBe('AGENT');
    expect(summary.totalAcquiredTicketCount).toBe(1);
    expect(summary.totalAcquiredCostByCurrency).toEqual([{ currency: 'USD', count: 1, total: 470 }]);
  });

  it('excludes reversed payments and keeps currencies separate', () => {
    const summary: any = buildTicketInventorySummary({
      sourceFirmId: 'owner', originOwnerFirmId: 'owner', tickets: rtInventory(1),
      allocations: [{ id: 'accepted', fromFirmId: 'owner', toFirmId: 'agent', status: 'ACCEPTED', productType: 'ROUND_TRIP', parentTicketCount: 1, segmentCount: 2, currency: 'USD', totalAmount: 950 }],
      transactions: [
        { id: 'usd', type: 'PAYMENT', receiverFirmId: 'owner', payerFirmId: 'agent', originalAmount: 100, currency: 'USD', status: 'CONFIRMED' },
        { id: 'uzs', type: 'PAYMENT', receiverFirmId: 'owner', payerFirmId: 'agent', originalAmount: 1000000, currency: 'UZS', status: 'CONFIRMED' },
        { id: 'reversed', type: 'PAYMENT', receiverFirmId: 'owner', payerFirmId: 'agent', originalAmount: 50, currency: 'USD', status: 'CONFIRMED' },
        { id: 'reversal', type: 'REFUND', receiverFirmId: 'agent', payerFirmId: 'owner', originalAmount: -50, currency: 'USD', status: 'CONFIRMED', reversedTransactionId: 'reversed' },
      ],
    });
    expect(summary.paymentsByCurrency).toEqual([
      { currency: 'USD', count: 0, total: 100 },
      { currency: 'UZS', count: 0, total: 1000000 },
    ]);
  });
});
