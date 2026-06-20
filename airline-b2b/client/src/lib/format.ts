export function formatMoney(value: number | string | null | undefined, currency = 'UZS'): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return `0 ${currency}`;
  const formatted = new Intl.NumberFormat('uz-UZ', { maximumFractionDigits: 0 }).format(Math.round(n));
  return currency === 'UZS' ? `${formatted} so'm` : `${formatted} ${currency}`;
}

export function formatCompact(value: number): string {
  const n = Math.abs(value);
  if (n >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

export function pctChange(current: number, previous: number): number | null {
  if (!previous || !Number.isFinite(previous)) return null;
  return ((current - previous) / previous) * 100;
}
