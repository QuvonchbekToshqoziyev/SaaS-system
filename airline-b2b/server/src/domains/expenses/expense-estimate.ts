export function expenseVariance(actualExpense: number, budgetAmount: number) {
  return {
    variance: actualExpense - budgetAmount,
    budgetUsagePercent: budgetAmount > 0 ? actualExpense / budgetAmount * 100 : null,
  };
}
