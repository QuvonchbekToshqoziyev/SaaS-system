export function positiveNumber(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${field} musbat son bo‘lishi kerak`);
  return number;
}

export function movingWeightedAverage(oldQuantity: number, oldUnitCost: number, incomingQuantity: number, incomingUnitCost: number): number {
  const totalQuantity = oldQuantity + incomingQuantity;
  if (totalQuantity <= 0) return 0;
  return ((oldQuantity * oldUnitCost) + (incomingQuantity * incomingUnitCost)) / totalQuantity;
}

export function saleTotals(quantity: number, unitPrice: number, discount: number, unitCost: number) {
  const grossRevenue = quantity * unitPrice;
  const netRevenue = grossRevenue - discount;
  const cogs = quantity * unitCost;
  if (netRevenue < 0) throw new Error('Chegirma yalpi summadan oshmasligi kerak');
  return { grossRevenue, netRevenue, cogs, grossProfit: netRevenue - cogs };
}

export function batchRemaining(received: number, issued: number) {
  return received - issued;
}

