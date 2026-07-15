import { describe, expect, it, vi } from 'vitest';
import { Prisma, TicketProductType } from '@prisma/client';
import {
  createTicketLegInventory,
  normalizeTicketDirection,
  normalizeTicketProductType,
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
