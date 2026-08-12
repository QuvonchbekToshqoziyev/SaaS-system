export function isProfitAndLossExpense(accountingTreatment: unknown) {
  return String(accountingTreatment || '').toUpperCase() === 'EXPENSE';
}

export function expenseInputError(input: { direction: unknown; categoryId?: unknown; employeeId?: unknown }) {
  const direction = String(input.direction || '').toUpperCase();
  if (['COMPANY_EXPENSE', 'EMPLOYEE_PAYMENT'].includes(direction) && !String(input.categoryId || '').trim()) {
    return direction === 'EMPLOYEE_PAYMENT' ? 'Ish haqi kategoriyasi tanlanishi kerak' : 'Korxona xarajati uchun xarajat kategoriyasi majburiy';
  }
  if (direction === 'EMPLOYEE_PAYMENT' && !String(input.employeeId || '').trim()) return 'Xodimni tanlang';
  return null;
}
