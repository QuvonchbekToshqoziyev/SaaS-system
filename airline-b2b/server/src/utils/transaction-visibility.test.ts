import { describe, expect, it, vi } from 'vitest';
import { softDeleteTransaction, visibleTransactionWhere } from './transaction-visibility';

describe('financial transaction visibility', () => {
  it('excludes deleted and inventory-only allocation/service rows from every ledger query', () => {
    expect(visibleTransactionWhere({ firmId: 'firm-1' })).toEqual({
      AND: [
        { deletedAt: null },
        { status: { not: 'DELETED' } },
        { NOT: [
          { type: 'PAYABLE', OR: [
            { subjectType: { in: ['TICKET_ALLOCATION', 'TICKET_ALLOCATION_ADJUSTMENT'] } },
            { ticketId: { not: null }, subjectType: null },
          ] },
          { subjectType: 'SERVICE', direction: 'SERVICE_PURCHASE' },
        ] },
        { firmId: 'firm-1' },
      ],
    });
  });

  it('soft-deletes a transaction without removing its row or linked history', async () => {
    const deletedAt = new Date('2026-07-17T04:00:00.000Z');
    const update = vi.fn().mockResolvedValue({ id: 'transaction-1', status: 'DELETED', deletedAt });

    await softDeleteTransaction({ transaction: { update } } as any, 'transaction-1', deletedAt);

    expect(update).toHaveBeenCalledWith({
      where: { id: 'transaction-1' },
      data: { status: 'DELETED', deletedAt },
    });
  });
});
