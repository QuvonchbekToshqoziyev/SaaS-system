import { Prisma } from '@prisma/client';

type TransactionSoftDeleteClient = Pick<Prisma.TransactionClient, 'transaction'>;

/** Inventory setup belongs in allocation/service records, not the financial ledger. */
export const visibleTransactionWhere = (where: Prisma.TransactionWhereInput = {}): Prisma.TransactionWhereInput => ({
  AND: [
    { deletedAt: null },
    { status: { not: 'DELETED' } },
    {
      NOT: [
        {
          type: 'PAYABLE',
          OR: [
            { subjectType: { in: ['TICKET_ALLOCATION', 'TICKET_ALLOCATION_ADJUSTMENT'] } },
            { ticketId: { not: null }, subjectType: null },
          ],
        },
        { subjectType: 'SERVICE', direction: 'SERVICE_PURCHASE' },
      ],
    },
    where,
  ],
});

export const softDeleteTransaction = (
  client: TransactionSoftDeleteClient,
  id: string,
  deletedAt = new Date(),
) => client.transaction.update({
  where: { id },
  data: { status: 'DELETED', deletedAt },
});
