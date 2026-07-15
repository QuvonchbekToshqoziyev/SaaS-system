export type SelectedTourService = { serviceId: string; quantityPerTour: number; exchangeRate?: number };

export function parseTourServices(value: unknown): SelectedTourService[] {
  if (!Array.isArray(value)) return [];
  const rows = value.map((item) => ({
    serviceId: String(item?.serviceId || '').trim(),
    quantityPerTour: Math.floor(Number(item?.quantityPerTour || 0)),
    exchangeRate: item?.exchangeRate === '' || item?.exchangeRate == null ? undefined : Number(item.exchangeRate),
  }));
  if (rows.some((row) => !row.serviceId || row.quantityPerTour <= 0)) throw new Error('Har bir xizmat va har bir tur uchun musbat miqdor kiritilishi shart.');
  if (new Set(rows.map((row) => row.serviceId)).size !== rows.length) throw new Error('Ushbu xizmat tur paketiga allaqachon qo‘shilgan.');
  return rows;
}

export function conversionMultiplier(source: string, target: string, uzsPerUsd: number): number {
  if (source === target) return 1;
  if (!(uzsPerUsd > 0)) throw new Error(`${source} dan ${target} ga konvertatsiya qilish uchun valyuta kursini kiriting.`);
  if (source === 'USD' && target === 'UZS') return uzsPerUsd;
  if (source === 'UZS' && target === 'USD') return 1 / uzsPerUsd;
  throw new Error('Faqat USD va UZS konvertatsiyasi qo‘llab-quvvatlanadi.');
}

export function calculateTourCosts(ticketCostPerTour: number, serviceCostsPerTour: number[], quantity: number) {
  const serviceCostPerTour = serviceCostsPerTour.reduce((sum, cost) => sum + cost, 0);
  const unitTourCost = ticketCostPerTour + serviceCostPerTour;
  return { ticketCostPerTour, serviceCostPerTour, unitTourCost, totalTourCost: unitTourCost * quantity };
}
