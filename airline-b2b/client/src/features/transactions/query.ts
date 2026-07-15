export type TransactionsPrefs = {
  view?: 'list' | 'boxes';
  filterType?: string;
  filterFirmId?: string;
  filterKassaDeskId?: string;
  filterFlightId?: string;
  filterCurrency?: string;
  dateFrom?: string;
  dateTo?: string;
};

export const TRANSACTIONS_PREFS_KEY = 'jetstream-transactions-prefs';

export function normalizeTxTypeParam(value: string): string {
  const normalized = String(value || '').trim().toLowerCase();
  return ['sale', 'payable', 'payment', 'adjustment'].includes(normalized) ? normalized : '';
}

export function normalizeDateParam(value: string): string {
  return String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || '';
}
