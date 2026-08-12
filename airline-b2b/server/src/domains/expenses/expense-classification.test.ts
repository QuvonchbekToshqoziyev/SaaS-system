import { describe, expect, it } from 'vitest';
import { expenseInputError, isProfitAndLossExpense } from './expense-classification';

describe('expense classification', () => {
  it('does not classify every cash outflow as a P&L expense', () => {
    expect(isProfitAndLossExpense('EXPENSE')).toBe(true);
    expect(isProfitAndLossExpense('ASSET')).toBe(false);
    expect(isProfitAndLossExpense('LIABILITY_SETTLEMENT')).toBe(false);
    expect(isProfitAndLossExpense('EQUITY')).toBe(false);
    expect(isProfitAndLossExpense(null)).toBe(false);
  });

  it('requires both category and employee for salary payments', () => {
    expect(expenseInputError({ direction: 'EMPLOYEE_PAYMENT' })).toBe('Ish haqi kategoriyasi tanlanishi kerak');
    expect(expenseInputError({ direction: 'EMPLOYEE_PAYMENT', categoryId: 'salary' })).toBe('Xodimni tanlang');
    expect(expenseInputError({ direction: 'EMPLOYEE_PAYMENT', categoryId: 'salary', employeeId: 'employee' })).toBeNull();
  });
});
