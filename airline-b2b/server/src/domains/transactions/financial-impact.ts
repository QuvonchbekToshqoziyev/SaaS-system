export const FINANCIAL_OPERATION_TYPES = [
  'BANK_INCOME', 'BANK_EXPENSE', 'BANK_TO_BANK_TRANSFER', 'DEBTOR_PAYMENT_RECEIVED',
  'CREDITOR_PAYMENT_MADE', 'THREE_PARTY_SETTLEMENT', 'MUTUAL_OFFSET', 'COMPENSATION',
  'DEBT_ASSIGNMENT', 'ADVANCE_RECEIVED', 'ADVANCE_PAID', 'OVERPAYMENT_REALLOCATION',
  'BANK_FEE', 'CURRENCY_EXCHANGE', 'ACCOUNTING_ADJUSTMENT', 'OTHER_NON_CASH',
  'CASH_PAYMENT', 'BANK_PAYMENT', 'CARD_PAYMENT',
  'SERVICE_OFFSET', 'TICKET_OFFSET', 'TOUR_OFFSET', 'PRODUCT_OFFSET',
  'ADVANCE_OFFSET', 'OVERPAYMENT_OFFSET', 'MANUAL_ACCOUNTING_ADJUSTMENT',
] as const;

export type FinancialOperationType = typeof FINANCIAL_OPERATION_TYPES[number];

type ImpactInput = {
  operationType: FinancialOperationType;
  economicPurpose?: string;
  expenseAccountCode?: string;
  debitAccountCode?: string;
  creditAccountCode?: string;
  sourceAccountCode?: string;
  destinationAccountCode?: string;
};

export function resolveFinancialImpact(input: ImpactInput) {
  const source = input.sourceAccountCode || 'BANK_ACCOUNT';
  const destination = input.destinationAccountCode || 'BANK_ACCOUNT';
  const purpose = String(input.economicPurpose || '').toUpperCase();
  const expense = input.expenseAccountCode || 'OPERATING_EXPENSE';
  switch (input.operationType) {
    case 'BANK_INCOME':
    case 'DEBTOR_PAYMENT_RECEIVED':
      return { debitAccount: destination, creditAccount: purpose === 'RECEIVABLE_PAYMENT' || input.operationType === 'DEBTOR_PAYMENT_RECEIVED' ? 'ACCOUNTS_RECEIVABLE' : purpose === 'ADVANCE_RECEIVED' ? 'CUSTOMER_ADVANCES' : purpose === 'FOUNDER_FUNDS' ? 'FOUNDER_CAPITAL' : 'SALES_REVENUE', cashFlowGroup: 'OPERATING', pnlEffect: purpose === 'NEW_SALE' ? 'REVENUE' : 'NONE' };
    case 'BANK_EXPENSE':
    case 'CREDITOR_PAYMENT_MADE':
      return { debitAccount: purpose === 'PAYABLE_PAYMENT' || input.operationType === 'CREDITOR_PAYMENT_MADE' ? 'ACCOUNTS_PAYABLE' : expense, creditAccount: source, cashFlowGroup: 'OPERATING', pnlEffect: purpose === 'PAYABLE_PAYMENT' ? 'NONE' : 'EXPENSE' };
    case 'BANK_TO_BANK_TRANSFER':
    case 'CURRENCY_EXCHANGE':
      return { debitAccount: destination, creditAccount: source, cashFlowGroup: 'INTERNAL_TRANSFER', pnlEffect: 'NONE' };
    case 'THREE_PARTY_SETTLEMENT':
    case 'MUTUAL_OFFSET':
    case 'COMPENSATION':
    case 'SERVICE_OFFSET':
    case 'TICKET_OFFSET':
    case 'TOUR_OFFSET':
    case 'PRODUCT_OFFSET':
    case 'ADVANCE_OFFSET':
    case 'OVERPAYMENT_OFFSET':
      return { debitAccount: 'ACCOUNTS_PAYABLE', creditAccount: 'ACCOUNTS_RECEIVABLE', cashFlowGroup: 'NON_CASH', pnlEffect: 'NONE' };
    case 'ADVANCE_RECEIVED':
      return { debitAccount: destination, creditAccount: 'CUSTOMER_ADVANCES', cashFlowGroup: 'OPERATING', pnlEffect: 'NONE' };
    case 'ADVANCE_PAID':
      return { debitAccount: 'SUPPLIER_ADVANCES', creditAccount: source, cashFlowGroup: 'OPERATING', pnlEffect: 'NONE' };
    case 'BANK_FEE':
      return { debitAccount: 'BANK_FEE_EXPENSE', creditAccount: source, cashFlowGroup: 'OPERATING', pnlEffect: 'EXPENSE' };
    case 'DEBT_ASSIGNMENT':
    case 'OVERPAYMENT_REALLOCATION':
      return { debitAccount: input.debitAccountCode || 'ACCOUNTS_RECEIVABLE', creditAccount: input.creditAccountCode || 'ACCOUNTS_RECEIVABLE', cashFlowGroup: 'NON_CASH', pnlEffect: 'NONE' };
    case 'ACCOUNTING_ADJUSTMENT':
    case 'MANUAL_ACCOUNTING_ADJUSTMENT':
    case 'OTHER_NON_CASH':
      return { debitAccount: input.debitAccountCode || 'ACCOUNTING_ADJUSTMENT', creditAccount: input.creditAccountCode || 'ACCOUNTING_ADJUSTMENT', cashFlowGroup: 'NON_CASH', pnlEffect: 'CONFIGURED' };
    case 'CASH_PAYMENT':
    case 'BANK_PAYMENT':
    case 'CARD_PAYMENT':
      return purpose === 'PAYABLE_PAYMENT'
        ? { debitAccount: 'ACCOUNTS_PAYABLE', creditAccount: source, cashFlowGroup: 'OPERATING', pnlEffect: 'NONE' }
        : { debitAccount: destination, creditAccount: 'ACCOUNTS_RECEIVABLE', cashFlowGroup: 'OPERATING', pnlEffect: 'NONE' };
  }
}

export function isNonCashOperation(operationType: FinancialOperationType) {
  return ['THREE_PARTY_SETTLEMENT', 'MUTUAL_OFFSET', 'COMPENSATION', 'SERVICE_OFFSET', 'TICKET_OFFSET', 'TOUR_OFFSET', 'PRODUCT_OFFSET', 'ADVANCE_OFFSET', 'OVERPAYMENT_OFFSET', 'DEBT_ASSIGNMENT', 'OVERPAYMENT_REALLOCATION', 'ACCOUNTING_ADJUSTMENT', 'MANUAL_ACCOUNTING_ADJUSTMENT', 'OTHER_NON_CASH'].includes(operationType);
}

export function maximumSettlementAmount(receivableOutstanding: number, payableOutstanding: number) {
  return Math.min(receivableOutstanding, payableOutstanding);
}
