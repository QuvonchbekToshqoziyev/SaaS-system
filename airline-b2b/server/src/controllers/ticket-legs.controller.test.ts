import { Prisma, TicketProductType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { createAllocationPayable } from './ticket-legs.controller';

describe('allocation payable', () => {
  it('creates one transaction for the full allocation amount', async () => {
    const create = vi.fn(async ({ data }) => ({ id: 'transaction-1', ...data }));
    const tx = { transaction: { create } } as unknown as Prisma.TransactionClient;

    await createAllocationPayable(tx, {
      allocation: {
        id: 'allocation-1',
        flightId: 'flight-1',
        fromFirmId: 'seller-1',
        toFirmId: 'buyer-1',
        totalAmount: new Prisma.Decimal(500),
        currency: 'USD',
        productType: TicketProductType.ROUND_TRIP,
        direction: null,
        parentTicketCount: 5,
        segmentCount: 10,
      },
      sourceKind: 'CONTRACTOR',
      exchangeRate: new Prisma.Decimal(12_500),
      createdByUserId: 'user-1',
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).toMatchObject({
      subjectType: 'TICKET_ALLOCATION',
      subjectId: 'allocation-1',
      originalAmount: new Prisma.Decimal(500),
      sourceMode: 'AUTO_ALLOCATION',
      status: 'CONFIRMED',
    });
  });
});
