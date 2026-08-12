import { Prisma } from '@prisma/client';

export const DEFAULT_EXPENSE_CATEGORIES = [
  ['SALARY', 'Ish haqi', 'EMPLOYEE_EXPENSE'],
  ['BONUSES', 'Mukofot va bonuslar', 'EMPLOYEE_EXPENSE'],
  ['RENT', 'Ijara', 'OPERATING_EXPENSE'],
  ['UTILITIES', 'Kommunal xizmatlar', 'OPERATING_EXPENSE'],
  ['INTERNET_COMMUNICATION', 'Internet va aloqa', 'OPERATING_EXPENSE'],
  ['MARKETING', 'Marketing va reklama', 'OPERATING_EXPENSE'],
  ['CORPORATE_MEALS', 'Korporativ tushlik', 'OPERATING_EXPENSE'],
  ['TRANSPORT', 'Transport', 'OPERATING_EXPENSE'],
  ['FUEL', 'Yoqilg‘i', 'OPERATING_EXPENSE'],
  ['BUSINESS_TRAVEL', 'Xizmat safari', 'OPERATING_EXPENSE'],
  ['OFFICE_EXPENSE', 'Ofis xarajatlari', 'OPERATING_EXPENSE'],
  ['OFFICE_SUPPLIES', 'Kanselyariya', 'OPERATING_EXPENSE'],
  ['SOFTWARE_SUBSCRIPTION', 'Dasturiy ta’minot va obunalar', 'OPERATING_EXPENSE'],
  ['BANK_FEES', 'Bank komissiyasi', 'FINANCE_COST'],
  ['PROFESSIONAL_SERVICES', 'Konsalting va professional xizmatlar', 'OPERATING_EXPENSE'],
  ['REPAIR_MAINTENANCE', 'Ta’mirlash va texnik xizmat', 'OPERATING_EXPENSE'],
  ['INSURANCE', 'Sug‘urta', 'OPERATING_EXPENSE'],
  ['TAXES_FEES', 'Soliq va yig‘imlar', 'TAX_PAYMENT'],
  ['REPRESENTATION', 'Vakillik xarajatlari', 'OPERATING_EXPENSE'],
  ['OTHER_OPERATING', 'Boshqa operatsion xarajat', 'OTHER_EXPENSE'],
] as const;

export async function seedDefaultExpenseCategories(
  tx: Prisma.TransactionClient,
  firmId: string,
  createdByUserId?: string,
) {
  await tx.expenseCategory.createMany({
    data: DEFAULT_EXPENSE_CATEGORIES.map(([code, name, categoryType], sortOrder) => ({
      firmId,
      code,
      name,
      categoryType,
      accountingTreatment: 'EXPENSE',
      financialStatementGroup: categoryType === 'FINANCE_COST' ? 'FINANCE_COSTS' : 'OPERATING_EXPENSES',
      cashFlowGroup: 'OPERATING',
      taxDeductible: true,
      requiresEmployee: code === 'SALARY' || code === 'BONUSES',
      requiresCounterparty: ['RENT', 'UTILITIES', 'PROFESSIONAL_SERVICES', 'REPAIR_MAINTENANCE'].includes(code),
      sortOrder,
      isSystemDefault: true,
      createdByUserId,
    })),
    skipDuplicates: true,
  });
}
