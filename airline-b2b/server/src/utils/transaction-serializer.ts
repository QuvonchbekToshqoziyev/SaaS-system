import type { Transaction, Firm, Flight, LedgerEntry } from '@prisma/client';

type TxWithRelations = Transaction & {
  firm?: Firm | null;
  flight?: Flight | null;
  ledgerEntries?: LedgerEntry[];
};

export function sumLedgerBaseAmount(entries: LedgerEntry[] | undefined): number {
  if (!entries?.length) return 0;
  return entries.reduce((acc, e) => acc + Number(e.amount || 0), 0);
}

export function serializeTransaction(tx: TxWithRelations) {
  const baseAmount = sumLedgerBaseAmount(tx.ledgerEntries);
  const metadata = (tx.metadata && typeof tx.metadata === 'object') ? tx.metadata as Record<string, unknown> : {};
  const paymentMethod = typeof metadata.payment_method === 'string'
    ? metadata.payment_method
    : typeof metadata.paymentMethod === 'string'
      ? metadata.paymentMethod
      : null;

  return {
    ...tx,
    baseAmount,
    base_amount: baseAmount,
    paymentMethod,
    payment_method: paymentMethod,
  };
}
