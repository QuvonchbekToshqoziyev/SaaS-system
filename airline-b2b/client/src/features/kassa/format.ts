export function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

export function formatCurrencyMap(values?: Record<string, number>) {
  const entries = Object.entries(values || {}).filter(([, value]) => Number.isFinite(Number(value)) && Math.abs(Number(value)) > 0.0001).sort(([a], [b]) => a.localeCompare(b));
  return entries.length ? entries.map(([currency, value]) => `${formatMoney(Number(value))} ${currency}`).join(' · ') : '0';
}

export function formatCardLabel(card: { ownerName: string; cardNumber: string; currency: string; balanceByCurrency?: Record<string, number> }) {
  return `${card.ownerName} — ${card.cardNumber} (${card.currency}) · ${formatCurrencyMap(card.balanceByCurrency)}`;
}

export function totalsByCurrency(summary: { totals: { byCurrency?: Record<string, Record<string, number | undefined>> } } | null, field: string) {
  return Object.fromEntries(Object.entries(summary?.totals?.byCurrency || {}).map(([currency, totals]) => [currency, Number(totals?.[field] || 0)]));
}
