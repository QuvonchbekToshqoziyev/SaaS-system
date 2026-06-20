/** Legacy ALLOCATION rows are treated the same as PAYABLE for debt math. */
import { TransactionType } from '@prisma/client';

export const PAYABLE_DEBT_TYPES: TransactionType[] = ['PAYABLE', 'ALLOCATION'];

export function isPayableDebtType(type: unknown): boolean {
  const normalized = String(type || '').toUpperCase();
  return normalized === 'PAYABLE' || normalized === 'ALLOCATION';
}

export const payableDebtTypeFilter = { in: PAYABLE_DEBT_TYPES };

export const PAYABLE_AND_PAYMENT_TYPES: TransactionType[] = [...PAYABLE_DEBT_TYPES, 'PAYMENT'];

export const payableAndPaymentTypeFilter = { in: PAYABLE_AND_PAYMENT_TYPES };
