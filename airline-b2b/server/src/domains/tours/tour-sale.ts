import { Prisma } from '@prisma/client';

const money = (value: unknown, label: string) => {
  try {
    const result = new Prisma.Decimal(String(value ?? ''));
    if (!result.isFinite()) throw new Error();
    return result;
  } catch {
    throw new Error(`${label} noto‘g‘ri formatda.`);
  }
};

export function validateTourSaleNote(value: unknown) {
  const note = String(value || '').trim();
  if (note.length < 3) throw new Error('Tur sotuviga izoh yozish majburiy.');
  if (note.length > 1000) throw new Error('Tur sotuv izohi 1000 belgidan oshmasligi kerak.');
  return note;
}

export function canApproveFullTourDiscount(user: { role?: unknown; firmRole?: unknown }) {
  const role = String(user.role || '').trim().toUpperCase();
  if (role === 'SUPERADMIN' || role === 'ADMIN') return true;
  const firmRole = String(user.firmRole || '').trim().toUpperCase();
  return role === 'FIRM' && ['FIRM_ADMIN', 'MANAGER'].includes(firmRole);
}

export function calculateTourSaleFinancials(input: {
  quantity: number;
  unitPrice: unknown;
  discountAmount?: unknown;
  exchangeRate: unknown;
  unitCost: unknown;
}) {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error('Sotuv miqdori musbat butun son bo‘lishi kerak.');
  const unitPrice = money(input.unitPrice, 'Bir dona narxi');
  const discountAmount = money(input.discountAmount ?? 0, 'Chegirma summasi');
  const exchangeRate = money(input.exchangeRate, 'Valyuta kursi');
  const unitCost = money(input.unitCost, 'Tur tannarxi');
  if (!unitPrice.gt(0)) throw new Error('Sotuv narxi musbat bo‘lishi kerak.');
  if (!exchangeRate.gt(0)) throw new Error('Valyuta kursi musbat bo‘lishi kerak.');
  const grossAmount = unitPrice.mul(input.quantity).toDecimalPlaces(4);
  if (discountAmount.gt(grossAmount)) throw new Error(`Chegirma summasi sotuvning jami qiymatidan oshmasligi kerak. Maksimal chegirma: ${grossAmount.toFixed(4)}.`);
  const netAmount = grossAmount.sub(discountAmount).toDecimalPlaces(4);
  const discountPercent = grossAmount.gt(0) ? discountAmount.div(grossAmount).mul(100).toDecimalPlaces(4) : new Prisma.Decimal(0);
  const costOfGoodsSold = unitCost.mul(input.quantity).toDecimalPlaces(4);
  return {
    unitPrice: unitPrice.toDecimalPlaces(4), grossAmount, discountAmount: discountAmount.toDecimalPlaces(4), netAmount,
    discountPercent, exchangeRate: exchangeRate.toDecimalPlaces(8),
    grossAmountBaseCurrency: grossAmount.mul(exchangeRate).toDecimalPlaces(4),
    discountAmountBaseCurrency: discountAmount.mul(exchangeRate).toDecimalPlaces(4),
    netAmountBaseCurrency: netAmount.mul(exchangeRate).toDecimalPlaces(4),
    unitCostSnapshot: unitCost.toDecimalPlaces(4), costOfGoodsSold,
    grossProfit: netAmount.sub(costOfGoodsSold).toDecimalPlaces(4),
    fullDiscount: grossAmount.gt(0) && netAmount.eq(0),
  };
}
