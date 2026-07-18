import { randomUUID } from 'node:crypto';
import { Prisma, TicketLegDirection, TicketLegStatus, TicketProductType } from '@prisma/client';

const SELLABLE_LEG_STATUSES = [TicketLegStatus.AVAILABLE, TicketLegStatus.ASSIGNED];

export function normalizeTicketProductType(value: unknown, fallback: TicketProductType = TicketProductType.ONE_WAY) {
  const normalized = String(value || '').trim().toUpperCase();
  return [TicketProductType.ROUND_TRIP, 'RT'].includes(normalized as TicketProductType)
    ? TicketProductType.ROUND_TRIP
    : [TicketProductType.ONE_WAY, 'OW'].includes(normalized as TicketProductType)
      ? TicketProductType.ONE_WAY
      : fallback;
}

export function normalizeTicketDirection(value: unknown): TicketLegDirection | undefined {
  const direction = String(value || '').trim().toUpperCase();
  return direction === TicketLegDirection.OUTBOUND || direction === TicketLegDirection.RETURN
    ? direction as TicketLegDirection
    : undefined;
}

function decimal(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value).toDecimalPlaces(4);
}

function requireNonNegative(value: Prisma.Decimal.Value, label: string) {
  const result = decimal(value);
  if (result.lt(0)) throw new Error(`${label} must be zero or greater`);
  return result;
}

export function validateLegCosts(input: {
  productType: TicketProductType;
  totalCost: Prisma.Decimal.Value;
  outboundCost?: Prisma.Decimal.Value;
  returnCost?: Prisma.Decimal.Value;
}) {
  const totalCost = requireNonNegative(input.totalCost, 'Ticket cost');
  if (input.productType === TicketProductType.ONE_WAY) {
    return { totalCost, outboundCost: totalCost, returnCost: new Prisma.Decimal(0) };
  }
  const outboundCost = requireNonNegative(input.outboundCost ?? totalCost.div(2), 'Outbound cost');
  const returnCost = requireNonNegative(input.returnCost ?? totalCost.minus(outboundCost), 'Return cost');
  if (!outboundCost.add(returnCost).eq(totalCost)) {
    throw new Error('OUTBOUND tannarxi + RETURN tannarxi RT jami tannarxiga teng bo‘lishi kerak');
  }
  return { totalCost, outboundCost, returnCost };
}

export async function createTicketLegInventory(tx: Prisma.TransactionClient, input: {
  flightId: string;
  ownerFirmId: string;
  productType: TicketProductType;
  quantity: number;
  totalCost: Prisma.Decimal.Value;
  outboundCost?: Prisma.Decimal.Value;
  returnCost?: Prisma.Decimal.Value;
  currency: string;
  outboundOrigin: string;
  outboundDestination: string;
  outboundDeparture: Date;
  outboundArrival?: Date | null;
  returnOrigin?: string | null;
  returnDestination?: string | null;
  returnDeparture?: Date | null;
  returnArrival?: Date | null;
}) {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error('Ticket count must be greater than 0');
  if (!input.ownerFirmId) throw new Error('Ticket owner firm is required');
  if (!input.outboundOrigin || !input.outboundDestination) throw new Error('Outbound route is required');
  if (input.productType === TicketProductType.ROUND_TRIP) {
    if (!input.returnOrigin || !input.returnDestination || !input.returnDeparture || !input.returnArrival) {
      throw new Error('ROUND TRIP uchun qaytish yo‘nalishi va vaqtlari majburiy');
    }
    if (input.returnArrival <= input.returnDeparture) throw new Error('Return arrival must be after return departure');
  }
  const costs = validateLegCosts(input);
  const ticketIds = Array.from({ length: input.quantity }, () => randomUUID());
  await tx.ticket.createMany({
    data: ticketIds.map((id) => ({
      id,
      flightId: input.flightId,
      status: 'ASSIGNED',
      ticketType: input.productType,
      basePrice: costs.totalCost,
      originPrice: costs.totalCost,
      currency: input.currency,
      assignedFirmId: input.ownerFirmId,
      originalOwnerFirmId: input.ownerFirmId,
    })),
  });
  await tx.ticketLeg.createMany({
    data: ticketIds.flatMap((ticketId) => [
      {
        id: randomUUID(), ticketId, flightId: input.flightId, direction: TicketLegDirection.OUTBOUND,
        origin: input.outboundOrigin, destination: input.outboundDestination,
        departureAt: input.outboundDeparture, arrivalAt: input.outboundArrival || null,
        status: TicketLegStatus.AVAILABLE, currentOwnerFirmId: input.ownerFirmId,
        acquisitionCostSnapshot: costs.outboundCost, originalCostSnapshot: costs.outboundCost,
        currencySnapshot: input.currency,
      },
      ...(input.productType === TicketProductType.ROUND_TRIP ? [{
        id: randomUUID(), ticketId, flightId: input.flightId, direction: TicketLegDirection.RETURN,
        origin: String(input.returnOrigin), destination: String(input.returnDestination),
        departureAt: input.returnDeparture!, arrivalAt: input.returnArrival!,
        status: TicketLegStatus.AVAILABLE, currentOwnerFirmId: input.ownerFirmId,
        acquisitionCostSnapshot: costs.returnCost, originalCostSnapshot: costs.returnCost,
        currencySnapshot: input.currency,
      }] : []),
    ]),
  });
  return { ticketIds, count: ticketIds.length, segmentCount: ticketIds.length * (input.productType === TicketProductType.ROUND_TRIP ? 2 : 1), costs };
}

type SelectedUnit = {
  ticketId: string;
  legs: Array<{
    id: string;
    ticketId: string;
    direction: TicketLegDirection;
    status: TicketLegStatus;
    currentOwnerFirmId: string | null;
    acquisitionCostSnapshot: Prisma.Decimal;
    currencySnapshot: string;
  }>;
};

async function selectInventoryUnits(tx: Prisma.TransactionClient, input: {
  flightId: string;
  sourceFirmId: string;
  productType: TicketProductType;
  direction?: TicketLegDirection;
  quantity: number;
  ticketId?: string;
}): Promise<SelectedUnit[]> {
  const ticketFilter = input.ticketId ? Prisma.sql`AND ticket.id = ${input.ticketId}` : Prisma.empty;
  if (input.productType === TicketProductType.ROUND_TRIP) {
    const rows = await tx.$queryRaw<Array<{ ticketId: string }>>(Prisma.sql`
      SELECT ticket.id AS "ticketId"
      FROM "Ticket" ticket
      JOIN "TicketLeg" outbound ON outbound."ticketId" = ticket.id AND outbound.direction = 'OUTBOUND'
      JOIN "TicketLeg" return_leg ON return_leg."ticketId" = ticket.id AND return_leg.direction = 'RETURN'
      WHERE ticket."flightId" = ${input.flightId}
        AND ticket."deletedAt" IS NULL
        AND outbound."currentOwnerFirmId" = ${input.sourceFirmId}
        AND return_leg."currentOwnerFirmId" = ${input.sourceFirmId}
        AND outbound.status IN ('AVAILABLE', 'ASSIGNED')
        AND return_leg.status IN ('AVAILABLE', 'ASSIGNED')
        ${ticketFilter}
      ORDER BY ticket."createdAt" ASC
      FOR UPDATE OF outbound, return_leg SKIP LOCKED
      LIMIT ${input.quantity}
    `);
    if (rows.length < input.quantity) {
      throw new Error(`Tanlangan miqdorda to‘liq borish–kelish biletlari mavjud emas. To‘liq RT mavjud: ${rows.length} ta.`);
    }
    const ticketIds = rows.map((row) => row.ticketId);
    const legs = await tx.ticketLeg.findMany({
      where: { ticketId: { in: ticketIds }, direction: { in: [TicketLegDirection.OUTBOUND, TicketLegDirection.RETURN] } },
      orderBy: [{ ticketId: 'asc' }, { direction: 'asc' }],
    });
    return ticketIds.map((ticketId) => ({ ticketId, legs: legs.filter((leg) => leg.ticketId === ticketId) }));
  }

  if (!input.direction) throw new Error('ONE WAY uchun OUTBOUND yoki RETURN yo‘nalishini tanlang');
  const rows = await tx.$queryRaw<Array<{ id: string; ticketId: string }>>(Prisma.sql`
    SELECT leg.id, leg."ticketId"
    FROM "TicketLeg" leg
    JOIN "Ticket" ticket ON ticket.id = leg."ticketId"
    WHERE leg."flightId" = ${input.flightId}
      AND leg."currentOwnerFirmId" = ${input.sourceFirmId}
      AND leg.direction = ${input.direction}::"TicketLegDirection"
      AND leg.status IN ('AVAILABLE', 'ASSIGNED')
      AND ticket."deletedAt" IS NULL
      ${ticketFilter}
    ORDER BY ticket."createdAt" ASC
    FOR UPDATE OF leg SKIP LOCKED
    LIMIT ${input.quantity}
  `);
  if (rows.length < input.quantity) {
    throw new Error(`Tanlangan miqdorda ${input.direction} segmentlari mavjud emas. Mavjud: ${rows.length} ta.`);
  }
  const legs = await tx.ticketLeg.findMany({ where: { id: { in: rows.map((row) => row.id) } } });
  return rows.map((row) => ({ ticketId: row.ticketId, legs: legs.filter((leg) => leg.id === row.id) }));
}

function splitUnitPrice(unitPrice: Prisma.Decimal, legs: SelectedUnit['legs']) {
  if (legs.length === 1) return [unitPrice.toDecimalPlaces(4)];
  const totalCost = legs.reduce((sum, leg) => sum.add(leg.acquisitionCostSnapshot), new Prisma.Decimal(0));
  let allocated = new Prisma.Decimal(0);
  return legs.map((leg, index) => {
    const share = index === legs.length - 1
      ? unitPrice.minus(allocated)
      : (totalCost.gt(0) ? unitPrice.mul(leg.acquisitionCostSnapshot).div(totalCost) : unitPrice.div(legs.length)).toDecimalPlaces(4);
    allocated = allocated.add(share);
    return share.toDecimalPlaces(4);
  });
}

function unitPrices(rows: Array<{ quantity: number; unitPrice: Prisma.Decimal }>, quantity: number) {
  const values = rows.flatMap((row) => Array.from({ length: row.quantity }, () => row.unitPrice.toDecimalPlaces(4)));
  if (values.length !== quantity) throw new Error('Allocation price row quantity does not match selected quantity');
  return values;
}

export async function syncParentTickets(tx: Prisma.TransactionClient, ticketIds: string[]) {
  if (!ticketIds.length) return;
  const tickets = await tx.ticket.findMany({
    where: { id: { in: Array.from(new Set(ticketIds)) } },
    include: {
      legs: {
        include: {
          saleItems: { where: { status: 'CONFIRMED', sale: { status: 'CONFIRMED' } }, include: { sale: true } },
        },
      },
    },
  });
  for (const ticket of tickets) {
    const legs = ticket.legs;
    if (!legs.length) continue;
    const statuses = legs.map((leg) => leg.status);
    const ownerIds = Array.from(new Set(legs.map((leg) => leg.currentOwnerFirmId).filter((value): value is string => Boolean(value))));
    const pendingIds = Array.from(new Set(legs.map((leg) => leg.pendingAllocationId).filter((value): value is string => Boolean(value))));
    const acceptedIds = Array.from(new Set(legs.map((leg) => leg.acceptedAllocationId).filter((value): value is string => Boolean(value))));
    const tourIds = Array.from(new Set(legs.map((leg) => leg.tourPackageId).filter((value): value is string => Boolean(value))));
    const allSold = statuses.every((status) => status === TicketLegStatus.SOLD);
    const status = statuses.every((value) => value === TicketLegStatus.DELETED) ? 'DELETED'
      : allSold ? 'SOLD'
        : statuses.some((value) => value === TicketLegStatus.RESERVED_FOR_TOUR) ? 'RESERVED_FOR_TOUR'
          : statuses.some((value) => value === TicketLegStatus.PENDING_ALLOCATION) ? 'PENDING'
            : statuses.every((value) => value === TicketLegStatus.CANCELLED) ? 'CANCELLED'
              : 'ASSIGNED';
    const saleItems = legs.flatMap((leg) => leg.saleItems);
    const saleCurrencies = Array.from(new Set(saleItems.map((item) => item.sale.currency)));
    const saleAmount = saleItems.reduce((sum, item) => sum.add(item.salePriceSnapshot), new Prisma.Decimal(0));
    const purchaserInfo = allSold && saleItems.length && saleItems[0].sale.purchaserInfo != null
      ? saleItems[0].sale.purchaserInfo as Prisma.InputJsonValue
      : Prisma.DbNull;
    const sameOwnerCost = ownerIds.length === 1
      ? legs.reduce((sum, leg) => sum.add(leg.acquisitionCostSnapshot), new Prisma.Decimal(0)).toDecimalPlaces(4)
      : undefined;
    const currentAllocationId = pendingIds.length === 1 ? pendingIds[0] : acceptedIds.length === 1 ? acceptedIds[0] : null;
    const currentAllocation = currentAllocationId
      ? await tx.ticketAllocation.findUnique({ where: { id: currentAllocationId }, select: { fromFirmId: true } })
      : null;
    await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        status,
        assignedFirmId: ownerIds.length === 1 ? ownerIds[0] : null,
        allocationId: currentAllocationId,
        allocationSourceFirmId: currentAllocation?.fromFirmId || null,
        tourPackageId: tourIds.length === 1 && legs.every((leg) => leg.tourPackageId === tourIds[0]) ? tourIds[0] : null,
        ...(sameOwnerCost ? { basePrice: sameOwnerCost } : {}),
        soldPrice: allSold ? saleAmount : null,
        soldCurrency: allSold && saleCurrencies.length === 1 ? saleCurrencies[0] : null,
        purchaserInfo,
      },
    });
  }
}

export async function allocateLegInventory(tx: Prisma.TransactionClient, input: {
  flightId: string;
  sourceFirmId: string;
  targetFirmId: string;
  productType: TicketProductType;
  direction?: TicketLegDirection;
  quantity: number;
  ticketId?: string;
  currency: string;
  priceRows: Array<{ quantity: number; unitPrice: Prisma.Decimal }>;
  approvalRequired: boolean;
  createdByUserId?: string;
  note?: string;
}) {
  const units = await selectInventoryUnits(tx, input);
  const prices = unitPrices(input.priceRows, input.quantity);
  const totalAmount = input.priceRows.reduce((sum, row) => sum.add(row.unitPrice.mul(row.quantity)), new Prisma.Decimal(0)).toDecimalPlaces(4);
  const status = input.approvalRequired ? 'PENDING' : 'ACCEPTED';
  const allocation = await tx.ticketAllocation.create({
    data: {
      flightId: input.flightId,
      fromFirmId: input.sourceFirmId,
      toFirmId: input.targetFirmId,
      status,
      currency: input.currency,
      totalAmount,
      productType: input.productType,
      direction: input.productType === TicketProductType.ONE_WAY ? input.direction : null,
      parentTicketCount: input.quantity,
      segmentCount: units.reduce((sum, unit) => sum + unit.legs.length, 0),
      note: input.note,
      createdByUserId: input.createdByUserId,
      ...(!input.approvalRequired ? { acceptedAt: new Date(), acceptedByUserId: null } : {}),
      priceRows: {
        create: input.priceRows.map((row, position) => ({
          quantity: row.quantity,
          unitPrice: row.unitPrice,
          position,
          productType: input.productType,
          direction: input.productType === TicketProductType.ONE_WAY ? input.direction : null,
          currency: input.currency,
          totalAmount: row.unitPrice.mul(row.quantity).toDecimalPlaces(4),
        })),
      },
    },
  });

  const itemRows: Prisma.TicketAllocationLegCreateManyInput[] = [];
  for (const [unitIndex, unit] of units.entries()) {
    const legPrices = splitUnitPrice(prices[unitIndex], unit.legs);
    for (const [legIndex, leg] of unit.legs.entries()) {
      itemRows.push({
        id: randomUUID(), allocationId: allocation.id, ticketLegId: leg.id,
        productType: input.productType, direction: leg.direction,
        previousOwnerFirmId: leg.currentOwnerFirmId, previousStatus: leg.status,
        acquisitionCostSnapshot: leg.acquisitionCostSnapshot,
        allocationPriceSnapshot: legPrices[legIndex], productUnitPriceSnapshot: prices[unitIndex],
        currencySnapshot: input.currency,
        acquisitionCurrencySnapshot: leg.currencySnapshot,
        allocationCurrencySnapshot: input.currency,
        status: 'ACTIVE',
      });
      await tx.ticketLeg.update({
        where: { id: leg.id },
        data: input.approvalRequired ? {
          status: TicketLegStatus.PENDING_ALLOCATION,
          pendingAllocationId: allocation.id,
          allocationPriceSnapshot: legPrices[legIndex],
        } : {
          status: TicketLegStatus.ASSIGNED,
          currentOwnerFirmId: input.targetFirmId,
          pendingAllocationId: null,
          acceptedAllocationId: allocation.id,
          acquisitionCostSnapshot: legPrices[legIndex],
          allocationPriceSnapshot: legPrices[legIndex],
        },
      });
    }
  }
  await tx.ticketAllocationLeg.createMany({ data: itemRows });
  await syncParentTickets(tx, units.map((unit) => unit.ticketId));
  return { allocation, units, totalAmount };
}

export async function acceptLegAllocation(tx: Prisma.TransactionClient, input: { allocationId: string; acceptedByUserId?: string }) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "TicketAllocation" WHERE id = ${input.allocationId} FOR UPDATE`);
  const allocation = await tx.ticketAllocation.findUnique({
    where: { id: input.allocationId },
    include: { legItems: { where: { status: 'ACTIVE' }, include: { ticketLeg: true } }, fromFirm: { select: { kind: true } } },
  });
  if (!allocation) throw new Error('Allocation not found');
  if (allocation.status !== 'PENDING') throw new Error('Ushbu ajratma allaqachon ko‘rib chiqilgan.');
  const legIds = allocation.legItems.map((item) => item.ticketLegId);
  if (!legIds.length) throw new Error('Allocation segmentlari topilmadi');
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "TicketLeg" WHERE id IN (${Prisma.join(legIds)}) FOR UPDATE`);
  for (const item of allocation.legItems) {
    if (item.ticketLeg.status !== TicketLegStatus.PENDING_ALLOCATION || item.ticketLeg.pendingAllocationId !== allocation.id) {
      throw new Error('Allocation segment state is inconsistent');
    }
    await tx.ticketLeg.update({
      where: { id: item.ticketLegId },
      data: {
        status: TicketLegStatus.ASSIGNED,
        currentOwnerFirmId: allocation.toFirmId,
        pendingAllocationId: null,
        acceptedAllocationId: allocation.id,
          acquisitionCostSnapshot: item.allocationPriceSnapshot,
          allocationPriceSnapshot: item.allocationPriceSnapshot,
          currencySnapshot: item.allocationCurrencySnapshot,
      },
    });
  }
  const updated = await tx.ticketAllocation.update({ where: { id: allocation.id }, data: { status: 'ACCEPTED', acceptedAt: new Date(), acceptedByUserId: input.acceptedByUserId || null } });
  await syncParentTickets(tx, allocation.legItems.map((item) => item.ticketLeg.ticketId));
  return { allocation: updated, fromFirmKind: allocation.fromFirm.kind, ticketIds: Array.from(new Set(allocation.legItems.map((item) => item.ticketLeg.ticketId))) };
}

export async function rejectLegAllocation(tx: Prisma.TransactionClient, input: { allocationId: string; reason: string; rejectedByUserId?: string }) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "TicketAllocation" WHERE id = ${input.allocationId} FOR UPDATE`);
  const allocation = await tx.ticketAllocation.findUnique({
    where: { id: input.allocationId },
    include: { legItems: { where: { status: 'ACTIVE' }, include: { ticketLeg: true } } },
  });
  if (!allocation) throw new Error('Allocation not found');
  if (allocation.status !== 'PENDING') throw new Error('Ushbu ajratma allaqachon ko‘rib chiqilgan.');
  const legIds = allocation.legItems.map((item) => item.ticketLegId);
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "TicketLeg" WHERE id IN (${Prisma.join(legIds)}) FOR UPDATE`);
  for (const item of allocation.legItems) {
    if (item.ticketLeg.status !== TicketLegStatus.PENDING_ALLOCATION || item.ticketLeg.pendingAllocationId !== allocation.id) {
      throw new Error('Allocation segment state is inconsistent');
    }
    await tx.ticketLeg.update({
      where: { id: item.ticketLegId },
      data: {
        status: item.previousStatus,
        currentOwnerFirmId: item.previousOwnerFirmId,
        pendingAllocationId: null,
        acceptedAllocationId: null,
        acquisitionCostSnapshot: item.acquisitionCostSnapshot,
        allocationPriceSnapshot: null,
      },
    });
    await tx.ticketAllocationLeg.update({ where: { id: item.id }, data: { status: 'REJECTED' } });
  }
  const updated = await tx.ticketAllocation.update({
    where: { id: allocation.id },
    data: { status: 'REJECTED', rejectionReason: input.reason, rejectedAt: new Date(), rejectedByUserId: input.rejectedByUserId || null },
  });
  await syncParentTickets(tx, allocation.legItems.map((item) => item.ticketLeg.ticketId));
  return updated;
}

type AllocationWithLegItems = {
  id: string;
  flightId: string;
  fromFirmId: string;
  toFirmId: string;
  status: string;
  currency: string;
  productType: TicketProductType;
  direction: TicketLegDirection | null;
  legItems: Array<{
    id: string;
    ticketLegId: string;
    previousOwnerFirmId: string | null;
    previousStatus: TicketLegStatus;
    acquisitionCostSnapshot: Prisma.Decimal;
    allocationPriceSnapshot: Prisma.Decimal;
    productUnitPriceSnapshot: Prisma.Decimal;
    acquisitionCurrencySnapshot: string;
    allocationCurrencySnapshot: string;
    status: string;
    ticketLeg: {
      id: string;
      ticketId: string;
      direction: TicketLegDirection;
      status: TicketLegStatus;
      currentOwnerFirmId: string | null;
      pendingAllocationId: string | null;
      acceptedAllocationId: string | null;
      tourPackageId: string | null;
      acquisitionCostSnapshot: Prisma.Decimal;
      currencySnapshot: string;
      saleItems?: Array<{ id: string }>;
    };
  }>;
};

function groupAllocationUnits(allocation: AllocationWithLegItems) {
  const groups = new Map<string, AllocationWithLegItems['legItems']>();
  for (const item of allocation.legItems.filter((row) => row.status === 'ACTIVE')) {
    const rows = groups.get(item.ticketLeg.ticketId) || [];
    rows.push(item);
    groups.set(item.ticketLeg.ticketId, rows);
  }
  return Array.from(groups.entries()).map(([ticketId, items]) => ({
    ticketId,
    items: items.sort((a, b) => a.ticketLeg.direction.localeCompare(b.ticketLeg.direction)),
  }));
}

function isCancellableAllocationUnit(allocation: AllocationWithLegItems, unit: ReturnType<typeof groupAllocationUnits>[number]) {
  const expectedSegments = allocation.productType === TicketProductType.ROUND_TRIP ? 2 : 1;
  if (unit.items.length !== expectedSegments) return false;
  return unit.items.every((item) => {
    const leg = item.ticketLeg;
    if (leg.tourPackageId || leg.saleItems?.length) return false;
    if (allocation.status === 'PENDING') {
      return leg.status === TicketLegStatus.PENDING_ALLOCATION && leg.pendingAllocationId === allocation.id;
    }
    return (leg.status === TicketLegStatus.AVAILABLE || leg.status === TicketLegStatus.ASSIGNED)
      && leg.currentOwnerFirmId === allocation.toFirmId
      && leg.acceptedAllocationId === allocation.id;
  });
}

export function countCancellableLegAllocationUnits(allocation: AllocationWithLegItems) {
  return groupAllocationUnits(allocation).filter((unit) => isCancellableAllocationUnit(allocation, unit)).length;
}

function rowsFromUnitPrices(prices: Prisma.Decimal[]) {
  const rows: Array<{ quantity: number; unitPrice: Prisma.Decimal }> = [];
  for (const price of prices) {
    const last = rows.at(-1);
    if (last?.unitPrice.eq(price)) last.quantity += 1;
    else rows.push({ quantity: 1, unitPrice: price.toDecimalPlaces(4) });
  }
  return rows;
}

/**
 * Applies an allocation price/note edit or an audited partial/full cancellation.
 * Quantity increases use the normal allocation flow; quantity decreases use CANCEL,
 * so every restored segment remains explicit in allocation history.
 */
export async function changeLegAllocation(tx: Prisma.TransactionClient, input: {
  allocation: AllocationWithLegItems;
  requestId: string;
  type: 'EDIT' | 'CANCEL';
  proposed: any;
  actorUserId?: string;
}) {
  const { allocation } = input;
  const units = groupAllocationUnits(allocation);
  if (!units.length) throw new Error('Ajratma segmentlari topilmadi. Migratsiya tekshiruvini ishga tushiring.');
  if (!['PENDING', 'ACCEPTED'].includes(allocation.status)) throw new Error('Ushbu ajratmani endi o‘zgartirib bo‘lmaydi.');

  let cancelledUnits: typeof units = [];
  let retainedUnits = units;
  let nextCurrency = allocation.currency;
  let nextNote: string | null | undefined = undefined;
  let nextPrices: Prisma.Decimal[];

  if (input.type === 'CANCEL') {
    const cancelQuantity = Math.floor(Number(input.proposed?.cancelQuantity || 0));
    const cancellable = units.filter((unit) => isCancellableAllocationUnit(allocation, unit));
    if (!cancelQuantity || cancelQuantity > cancellable.length) {
      throw new Error(`Ushbu ajratmadan faqat ${cancellable.length} ta ${allocation.productType === TicketProductType.ROUND_TRIP ? 'RT bilet' : 'OW segment'} bekor qilinishi mumkin.`);
    }
    cancelledUnits = cancellable.slice(-cancelQuantity);
    const cancelledIds = new Set(cancelledUnits.map((unit) => unit.ticketId));
    retainedUnits = units.filter((unit) => !cancelledIds.has(unit.ticketId));
    nextPrices = retainedUnits.map((unit) => unit.items[0].productUnitPriceSnapshot);
  } else {
    const rows = Array.isArray(input.proposed?.priceRows) ? input.proposed.priceRows : [];
    nextPrices = rows.flatMap((row: any) => Array.from(
      { length: Math.floor(Number(row.quantity || 0)) },
      () => decimal(row.price ?? row.unitPrice),
    ));
    if (nextPrices.length !== units.length) {
      throw new Error('Ajratma miqdorini tahrirlash o‘rniga kamaytirish uchun “Bekor qilish”, oshirish uchun yangi ajratma yarating.');
    }
    nextCurrency = String(input.proposed?.currency || allocation.currency).trim().toUpperCase();
    if (allocation.status === 'ACCEPTED' && nextCurrency !== allocation.currency) {
      throw new Error('Tasdiqlangan ajratma valyutasini o‘zgartirib bo‘lmaydi.');
    }
    nextNote = typeof input.proposed?.note === 'string' ? input.proposed.note.trim() || null : null;
  }

  for (const unit of cancelledUnits) {
    for (const item of unit.items) {
      await tx.ticketLeg.update({
        where: { id: item.ticketLegId },
        data: {
          status: item.previousStatus,
          currentOwnerFirmId: item.previousOwnerFirmId,
          pendingAllocationId: null,
          acceptedAllocationId: null,
          tourPackageId: null,
          acquisitionCostSnapshot: item.acquisitionCostSnapshot,
          allocationPriceSnapshot: null,
          currencySnapshot: item.acquisitionCurrencySnapshot,
        },
      });
      await tx.ticketAllocationLeg.update({ where: { id: item.id }, data: { status: 'CANCELLED' } });
    }
  }

  if (input.type === 'EDIT') {
    for (const [unitIndex, unit] of units.entries()) {
      const nextPrice = nextPrices[unitIndex];
      const legPrices = splitUnitPrice(nextPrice, unit.items.map((item) => item.ticketLeg));
      for (const [itemIndex, item] of unit.items.entries()) {
        const legPrice = legPrices[itemIndex];
        await tx.ticketAllocationLeg.update({
          where: { id: item.id },
          data: {
            productUnitPriceSnapshot: nextPrice,
            allocationPriceSnapshot: legPrice,
            allocationCurrencySnapshot: nextCurrency,
            currencySnapshot: nextCurrency,
          },
        });
        await tx.ticketLeg.update({
          where: { id: item.ticketLegId },
          data: allocation.status === 'ACCEPTED'
            ? { acquisitionCostSnapshot: legPrice, allocationPriceSnapshot: legPrice, currencySnapshot: nextCurrency }
            : { allocationPriceSnapshot: legPrice },
        });
      }
    }
  }

  const rows = rowsFromUnitPrices(nextPrices);
  await tx.ticketAllocationPriceRow.deleteMany({ where: { allocationId: allocation.id } });
  if (rows.length) {
    await tx.ticketAllocationPriceRow.createMany({
      data: rows.map((row, position) => ({
        allocationId: allocation.id, quantity: row.quantity, unitPrice: row.unitPrice, position,
        productType: allocation.productType, direction: allocation.direction, currency: nextCurrency,
        totalAmount: row.unitPrice.mul(row.quantity).toDecimalPlaces(4),
      })),
    });
  }
  const activeItems = retainedUnits.flatMap((unit) => unit.items);
  const nextStatus = retainedUnits.length ? allocation.status : 'CANCELLED';
  const updated = await tx.ticketAllocation.update({
    where: { id: allocation.id },
    data: {
      status: nextStatus,
      totalAmount: nextPrices.reduce((sum, price) => sum.add(price), new Prisma.Decimal(0)).toDecimalPlaces(4),
      currency: nextCurrency,
      ...(nextNote !== undefined ? { note: nextNote } : {}),
      parentTicketCount: retainedUnits.length,
      segmentCount: activeItems.length,
      version: { increment: 1 },
      ...(nextStatus === 'CANCELLED' ? { cancelledAt: new Date(), cancelledByUserId: input.actorUserId || null } : {}),
    },
  });
  await syncParentTickets(tx, units.map((unit) => unit.ticketId));
  return updated;
}

export async function sellLegInventory(tx: Prisma.TransactionClient, input: {
  flightId: string;
  sellerFirmId: string;
  productType: TicketProductType;
  direction?: TicketLegDirection;
  quantity: number;
  ticketId?: string;
  unitPrice: Prisma.Decimal;
  currency: string;
  purchaserInfo: Prisma.InputJsonValue;
  createdByUserId?: string;
  kassaDeskId?: string;
  exchangeRate: Prisma.Decimal;
}) {
  const units = await selectInventoryUnits(tx, {
    flightId: input.flightId, sourceFirmId: input.sellerFirmId, productType: input.productType,
    direction: input.direction, quantity: input.quantity, ticketId: input.ticketId,
  });
  const totalAmount = input.unitPrice.mul(input.quantity).toDecimalPlaces(4);
  const transaction = await tx.transaction.create({
    data: {
      firmId: input.sellerFirmId,
      flightId: input.flightId,
      createdByUserId: input.createdByUserId,
      kassaDeskId: input.kassaDeskId,
      type: 'SALE',
      originalAmount: totalAmount,
      currency: input.currency,
      exchangeRate: input.exchangeRate.toDecimalPlaces(6),
      baseAmount: totalAmount.mul(input.exchangeRate).toDecimalPlaces(4),
      subjectType: 'TICKET_SALE',
      sourceMode: 'AUTO_TICKET_SALE',
      status: 'CONFIRMED',
      metadata: {
        note: 'Ticket segment sale', purchaser: input.purchaserInfo,
        productType: input.productType, direction: input.direction || null,
        parentTicketCount: input.quantity, segmentCount: units.reduce((sum, unit) => sum + unit.legs.length, 0),
      },
    },
  });
  const sale = await tx.ticketSale.create({
    data: {
      flightId: input.flightId, sellerFirmId: input.sellerFirmId,
      productType: input.productType, direction: input.productType === TicketProductType.ONE_WAY ? input.direction : null,
      quantity: input.quantity, segmentCount: units.reduce((sum, unit) => sum + unit.legs.length, 0),
      unitPrice: input.unitPrice, currency: input.currency, totalAmount,
      purchaserInfo: input.purchaserInfo, transactionId: transaction.id,
      createdByUserId: input.createdByUserId, status: 'CONFIRMED',
    },
  });
  const saleItems: Prisma.TicketSaleItemCreateManyInput[] = [];
  for (const unit of units) {
    const prices = splitUnitPrice(input.unitPrice, unit.legs);
    for (const [index, leg] of unit.legs.entries()) {
      saleItems.push({
        id: randomUUID(), saleId: sale.id, ticketLegId: leg.id,
        acquisitionCostSnapshot: leg.acquisitionCostSnapshot,
        salePriceSnapshot: prices[index], currencySnapshot: input.currency,
        acquisitionCurrencySnapshot: leg.currencySnapshot,
        saleCurrencySnapshot: input.currency,
        status: 'CONFIRMED',
      });
      await tx.ticketLeg.update({ where: { id: leg.id }, data: { status: TicketLegStatus.SOLD } });
    }
  }
  await tx.ticketSaleItem.createMany({ data: saleItems });
  await syncParentTickets(tx, units.map((unit) => unit.ticketId));
  return { sale, transaction, count: input.quantity, segmentCount: saleItems.length };
}

export async function cancelLegSale(tx: Prisma.TransactionClient, input: { saleId: string; cancelledByUserId?: string; reason: string }) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "TicketSale" WHERE id = ${input.saleId} FOR UPDATE`);
  const sale = await tx.ticketSale.findUnique({
    where: { id: input.saleId },
    include: { items: { where: { status: 'CONFIRMED' }, include: { ticketLeg: { include: { ticket: { select: { originalOwnerFirmId: true } } } } } }, transaction: true },
  });
  if (!sale) throw new Error('Sale not found');
  if (sale.status !== 'CONFIRMED') throw new Error('Sale is not active');
  const legIds = sale.items.map((item) => item.ticketLegId);
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "TicketLeg" WHERE id IN (${Prisma.join(legIds)}) FOR UPDATE`);
  for (const item of sale.items) {
    if (item.ticketLeg.status !== TicketLegStatus.SOLD) throw new Error('Sotuv segmentlaridan biri keyingi operatsiyada ishlatilgan; avtomatik bekor qilish bloklandi');
    await tx.ticketLeg.update({
      where: { id: item.ticketLegId },
      data: { status: item.ticketLeg.currentOwnerFirmId === item.ticketLeg.ticket.originalOwnerFirmId ? TicketLegStatus.AVAILABLE : TicketLegStatus.ASSIGNED },
    });
    await tx.ticketSaleItem.update({ where: { id: item.id }, data: { status: 'CANCELLED' } });
  }
  await tx.ticketSale.update({ where: { id: sale.id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledByUserId: input.cancelledByUserId || null } });
  if (sale.transaction) {
    await tx.transaction.create({
      data: {
        firmId: sale.transaction.firmId, flightId: sale.transaction.flightId,
        createdByUserId: input.cancelledByUserId, type: 'SALE',
        originalAmount: sale.transaction.originalAmount.mul(-1), currency: sale.transaction.currency,
        exchangeRate: sale.transaction.exchangeRate, baseAmount: sale.transaction.baseAmount.mul(-1),
        subjectType: 'TICKET_SALE', subjectId: sale.id, sourceMode: 'REVERSAL', status: 'CONFIRMED',
        reversedTransactionId: sale.transaction.id,
        metadata: { note: 'Ticket segment sale cancelled', reason: input.reason, reversedTransactionId: sale.transaction.id, ticketSaleId: sale.id },
      },
    });
  }
  await syncParentTickets(tx, sale.items.map((item) => item.ticketLeg.ticketId));
  return sale;
}

export { SELLABLE_LEG_STATUSES };
