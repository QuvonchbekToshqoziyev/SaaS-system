import { describe, expect, it, vi } from 'vitest';
import { Prisma, TicketLegStatus, TicketProductType } from '@prisma/client';
import {
  createTicketLegInventory,
  countCancellableLegAllocationUnits,
  normalizeTicketDirection,
  normalizeTicketProductType,
  previewLegAllocationCancellation,
  rejectLegAllocation,
  summarizeLegAllocationUnits,
  validateLegCosts,
} from './ticket-leg-inventory';

function inventoryWriter() {
  const ticketRows: Array<Record<string, unknown>> = [];
  const legRows: Array<Record<string, unknown>> = [];
  const tx = {
    ticket: {
      createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        ticketRows.push(...data);
        return { count: data.length };
      }),
    },
    ticketLeg: {
      createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        legRows.push(...data);
        return { count: data.length };
      }),
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, ticketRows, legRows };
}

describe('RT / OW leg costs', () => {
  it('keeps an explicit RT split equal to the parent ticket cost', () => {
    const result = validateLegCosts({
      productType: TicketProductType.ROUND_TRIP,
      totalCost: 480,
      outboundCost: 235,
      returnCost: 245,
    });
    expect(result.outboundCost.toNumber()).toBe(235);
    expect(result.returnCost.toNumber()).toBe(245);
    expect(result.outboundCost.add(result.returnCost).toNumber()).toBe(480);
  });

  it('rejects an RT split that does not reconcile', () => {
    expect(() => validateLegCosts({
      productType: TicketProductType.ROUND_TRIP,
      totalCost: 480,
      outboundCost: 240,
      returnCost: 245,
    })).toThrow('RT jami tannarxiga teng');
  });

  it('uses the full parent cost for an OW outbound segment', () => {
    const result = validateLegCosts({ productType: TicketProductType.ONE_WAY, totalCost: 235 });
    expect(result.outboundCost.toNumber()).toBe(235);
    expect(result.returnCost.toNumber()).toBe(0);
  });

  it('creates two independently tracked legs for every RT parent ticket', async () => {
    const writer = inventoryWriter();
    const result = await createTicketLegInventory(writer.tx, {
      flightId: 'flight', ownerFirmId: 'owner', productType: TicketProductType.ROUND_TRIP,
      quantity: 2, totalCost: 660, outboundCost: 400, returnCost: 260, currency: 'USD',
      outboundOrigin: 'TAS', outboundDestination: 'IST', outboundDeparture: new Date('2026-08-01T08:00:00Z'),
      outboundArrival: new Date('2026-08-01T13:00:00Z'), returnOrigin: 'IST', returnDestination: 'TAS',
      returnDeparture: new Date('2026-08-08T08:00:00Z'), returnArrival: new Date('2026-08-08T13:00:00Z'),
    });
    expect(result).toMatchObject({ count: 2, segmentCount: 4 });
    expect(writer.ticketRows).toHaveLength(2);
    expect(writer.legRows.filter((row) => row.direction === 'OUTBOUND')).toHaveLength(2);
    expect(writer.legRows.filter((row) => row.direction === 'RETURN')).toHaveLength(2);
  });

  it('creates exactly one outbound leg for an OW parent ticket', async () => {
    const writer = inventoryWriter();
    const result = await createTicketLegInventory(writer.tx, {
      flightId: 'flight', ownerFirmId: 'owner', productType: TicketProductType.ONE_WAY,
      quantity: 3, totalCost: 235, currency: 'USD', outboundOrigin: 'TAS', outboundDestination: 'IST',
      outboundDeparture: new Date('2026-08-01T08:00:00Z'),
    });
    expect(result).toMatchObject({ count: 3, segmentCount: 3 });
    expect(writer.legRows).toHaveLength(3);
    expect(writer.legRows.every((row) => row.direction === 'OUTBOUND')).toBe(true);
  });

  it('rejects RT inventory without a complete return route', async () => {
    const writer = inventoryWriter();
    await expect(createTicketLegInventory(writer.tx, {
      flightId: 'flight', ownerFirmId: 'owner', productType: TicketProductType.ROUND_TRIP,
      quantity: 1, totalCost: 660, currency: 'USD', outboundOrigin: 'TAS', outboundDestination: 'IST',
      outboundDeparture: new Date('2026-08-01T08:00:00Z'),
    })).rejects.toThrow('qaytish yo‘nalishi');
  });

  it('normalizes RT/OW aliases and explicit leg directions', () => {
    expect(normalizeTicketProductType('rt')).toBe(TicketProductType.ROUND_TRIP);
    expect(normalizeTicketProductType('ow')).toBe(TicketProductType.ONE_WAY);
    expect(normalizeTicketDirection('return')).toBe('RETURN');
    expect(normalizeTicketDirection('invalid')).toBeUndefined();
  });
});

describe('allocation rejection', () => {
  function rejectionWriter(legItems: Array<Record<string, unknown>>) {
    const ticketLegUpdate = vi.fn(async () => ({}));
    const allocationLegUpdateMany = vi.fn(async () => ({ count: legItems.length }));
    const tx = {
      $queryRaw: vi.fn(async () => []),
      ticketAllocation: {
        findUnique: vi.fn(async () => ({ id: 'allocation', status: 'PENDING', legItems })),
        update: vi.fn(async () => ({ id: 'allocation', status: 'REJECTED' })),
      },
      ticketAllocationLeg: { updateMany: allocationLegUpdateMany },
      ticketLeg: { update: ticketLegUpdate },
      ticket: { findMany: vi.fn(async () => []) },
    } as unknown as Prisma.TransactionClient;
    return { tx, ticketLegUpdate, allocationLegUpdateMany };
  }

  function allocationItem(id: string, status: TicketLegStatus, pendingAllocationId: string | null) {
    return {
      id: `item-${id}`,
      ticketLegId: id,
      previousStatus: TicketLegStatus.AVAILABLE,
      previousOwnerFirmId: 'source-firm',
      acquisitionCostSnapshot: new Prisma.Decimal(175),
      ticketLeg: { id, ticketId: 'parent-ticket', status, pendingAllocationId },
    };
  }

  it('restores only segments still pending for this allocation and retires stale legacy items', async () => {
    const writer = rejectionWriter([
      allocationItem('outbound', TicketLegStatus.PENDING_ALLOCATION, 'allocation'),
      allocationItem('return-owned-elsewhere', TicketLegStatus.ASSIGNED, null),
    ]);

    await expect(rejectLegAllocation(writer.tx, {
      allocationId: 'allocation', reason: 'Qabul qiluvchi firma rad etdi', rejectedByUserId: 'user',
    })).resolves.toMatchObject({ status: 'REJECTED' });

    expect(writer.ticketLegUpdate).toHaveBeenCalledTimes(1);
    expect(writer.ticketLegUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'outbound' } }));
    expect(writer.allocationLegUpdateMany).toHaveBeenCalledWith({
      where: { allocationId: 'allocation', status: 'ACTIVE' },
      data: { status: 'REJECTED' },
    });
  });

  it('does not reject an allocation when none of its segments are still pending', async () => {
    const writer = rejectionWriter([
      allocationItem('return-owned-elsewhere', TicketLegStatus.ASSIGNED, null),
    ]);

    await expect(rejectLegAllocation(writer.tx, {
      allocationId: 'allocation', reason: 'Qabul qiluvchi firma rad etdi',
    })).rejects.toThrow('kutilayotgan segmentlar topilmadi');
    expect(writer.ticketLegUpdate).not.toHaveBeenCalled();
    expect(writer.allocationLegUpdateMany).not.toHaveBeenCalled();
  });
});

describe('legacy allocation cancellation', () => {
  function allocation(returnLeg: Record<string, unknown>) {
    const item = (id: string, direction: 'OUTBOUND' | 'RETURN', ticketLeg: Record<string, unknown>) => ({
      id: `item-${id}`, ticketLegId: id, productType: TicketProductType.ROUND_TRIP, direction,
      previousOwnerFirmId: 'source', previousStatus: TicketLegStatus.AVAILABLE,
      acquisitionCostSnapshot: new Prisma.Decimal(100), allocationPriceSnapshot: new Prisma.Decimal(200),
      productUnitPriceSnapshot: new Prisma.Decimal(400), acquisitionCurrencySnapshot: 'USD',
      allocationCurrencySnapshot: 'USD', status: 'ACTIVE', ticketLeg: {
        id, ticketId: 'ticket', direction, tourPackageId: null, saleItems: [],
        acquisitionCostSnapshot: new Prisma.Decimal(100), currencySnapshot: 'USD', ...ticketLeg,
      },
    });
    return {
      id: 'allocation', flightId: 'flight', fromFirmId: 'source', toFirmId: 'receiver', status: 'ACCEPTED',
      currency: 'USD', productType: TicketProductType.ROUND_TRIP, direction: null,
      legItems: [
        item('outbound', 'OUTBOUND', {
          status: TicketLegStatus.ASSIGNED, currentOwnerFirmId: 'receiver', pendingAllocationId: null,
          acceptedAllocationId: 'allocation',
        }),
        item('return', 'RETURN', returnLeg),
      ],
    };
  }

  it('allows deleting a legacy RT allocation when its other segment is already restored', () => {
    expect(countCancellableLegAllocationUnits(allocation({
      status: TicketLegStatus.AVAILABLE, currentOwnerFirmId: 'source', pendingAllocationId: null, acceptedAllocationId: null,
    }) as any)).toBe(1);
  });

  it('does not delete a legacy RT allocation when its other segment belongs to another allocation', () => {
    expect(countCancellableLegAllocationUnits(allocation({
      status: TicketLegStatus.ASSIGNED, currentOwnerFirmId: 'other-firm', pendingAllocationId: null,
      acceptedAllocationId: 'other-allocation',
    }) as any)).toBe(0);
  });

  it('separates free, sold and tour-reserved units in the cancellation preview', () => {
    const base: any = allocation({ status: TicketLegStatus.ASSIGNED, currentOwnerFirmId: 'receiver', pendingAllocationId: null, acceptedAllocationId: 'allocation' });
    const copyUnit = (ticketId: string, suffix: string) => base.legItems.map((item: any) => ({
      ...item, id: `${item.id}-${suffix}`, ticketLegId: `${item.ticketLegId}-${suffix}`,
      ticketLeg: { ...item.ticketLeg, id: `${item.ticketLeg.id}-${suffix}`, ticketId },
    }));
    const free = copyUnit('free', 'free');
    const sold = copyUnit('sold', 'sold').map((item: any) => ({ ...item, ticketLeg: { ...item.ticketLeg, status: TicketLegStatus.SOLD, saleItems: [{ id: 'sale' }] } }));
    const tour = copyUnit('tour', 'tour').map((item: any) => ({ ...item, ticketLeg: { ...item.ticketLeg, status: TicketLegStatus.RESERVED_FOR_TOUR, tourPackageId: 'tour' } }));
    const summary = summarizeLegAllocationUnits({ ...base, legItems: [...free, ...sold, ...tour] });
    expect(summary).toMatchObject({ originalQuantity: 3, activeQuantity: 3, soldQuantity: 1, reservedForTourQuantity: 1, cancellableQuantity: 1 });
  });

  it('uses the exact mixed unit-price snapshot when partially cancelling', () => {
    const base: any = allocation({ status: TicketLegStatus.ASSIGNED, currentOwnerFirmId: 'receiver', pendingAllocationId: null, acceptedAllocationId: 'allocation' });
    const units = [875, 950, 950].flatMap((price, index) => base.legItems.map((item: any) => ({
      ...item, id: `${item.id}-${index}`, ticketLegId: `${item.ticketLegId}-${index}`, productUnitPriceSnapshot: new Prisma.Decimal(price),
      ticketLeg: { ...item.ticketLeg, id: `${item.ticketLeg.id}-${index}`, ticketId: `ticket-${index}` },
    })));
    expect(previewLegAllocationCancellation({ ...base, legItems: units }, 2).cancelledValue.toNumber()).toBe(1900);
    expect(() => previewLegAllocationCancellation({ ...base, legItems: units }, 4)).toThrow('faqat 3 ta RT bilet');
  });
});
