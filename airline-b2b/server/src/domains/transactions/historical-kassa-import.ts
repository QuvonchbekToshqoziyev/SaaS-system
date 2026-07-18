import { Prisma } from '@prisma/client';

export const MAX_HISTORICAL_KASSA_IMPORT_ROWS = 500;

export type HistoricalKassaImportRow = {
  rowNumber: number;
  reference: string;
  referenceKey: string;
  date: string;
  flow: 'IN' | 'OUT';
  amount: string;
  currency: 'UZS' | 'USD';
  exchangeRate: string;
  note: string;
};

export type HistoricalKassaImportError = {
  row: number;
  field: string;
  message: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function decimal(value: unknown): Prisma.Decimal | null {
  try {
    const parsed = new Prisma.Decimal(String(value ?? '').trim());
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

function validDateKey(value: unknown): string | null {
  const key = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const parsed = new Date(`${key}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === key ? key : null;
}

export function historicalKassaIdempotencyKey(firmId: string, kassaDeskId: string, referenceKey: string) {
  return `historical-kassa:${firmId}:${kassaDeskId}:${referenceKey}`;
}

export function normalizeHistoricalKassaImportRows(value: unknown): {
  rows: HistoricalKassaImportRow[];
  errors: HistoricalKassaImportError[];
} {
  if (!Array.isArray(value)) {
    return { rows: [], errors: [{ row: 0, field: 'rows', message: 'Excel qatorlari yuborilmadi.' }] };
  }
  if (!value.length) {
    return { rows: [], errors: [{ row: 0, field: 'rows', message: 'Excel faylida ma’lumot qatori yo‘q.' }] };
  }
  if (value.length > MAX_HISTORICAL_KASSA_IMPORT_ROWS) {
    return { rows: [], errors: [{ row: 0, field: 'rows', message: `Bir yuklashda ko‘pi bilan ${MAX_HISTORICAL_KASSA_IMPORT_ROWS} qator mumkin.` }] };
  }

  const rows: HistoricalKassaImportRow[] = [];
  const errors: HistoricalKassaImportError[] = [];
  const references = new Set<string>();

  value.forEach((raw, index) => {
    const errorCountBefore = errors.length;
    const input = record(raw);
    const rowNumberValue = Number(input.rowNumber);
    const rowNumber = Number.isInteger(rowNumberValue) && rowNumberValue > 0 ? rowNumberValue : index + 2;
    const reference = String(input.reference || '').trim();
    const referenceKey = reference.toUpperCase();
    const date = validDateKey(input.date);
    const rawFlow = String(input.flow || '').trim().toUpperCase();
    const flow = rawFlow === 'IN' || rawFlow === 'KIRIM' ? 'IN' : rawFlow === 'OUT' || rawFlow === 'CHIQIM' ? 'OUT' : null;
    const amount = decimal(input.amount);
    const currency = String(input.currency || '').trim().toUpperCase();
    const rawRate = String(input.exchangeRate ?? '').trim();
    const exchangeRate = rawRate ? decimal(rawRate) : currency === 'UZS' ? new Prisma.Decimal(1) : null;
    const note = String(input.note || '').trim();

    if (!reference) errors.push({ row: rowNumber, field: 'reference', message: 'Import ID majburiy.' });
    else if (reference.length > 100) errors.push({ row: rowNumber, field: 'reference', message: 'Import ID 100 belgidan oshmasin.' });
    else if (references.has(referenceKey)) errors.push({ row: rowNumber, field: 'reference', message: `Import ID takrorlangan: ${reference}` });
    else references.add(referenceKey);

    if (!date) errors.push({ row: rowNumber, field: 'date', message: 'Sana YYYY-MM-DD formatida bo‘lishi kerak.' });
    if (!flow) errors.push({ row: rowNumber, field: 'flow', message: 'Harakat KIRIM yoki CHIQIM bo‘lishi kerak.' });
    if (!amount || !amount.gt(0)) errors.push({ row: rowNumber, field: 'amount', message: 'Summa noldan katta bo‘lishi kerak.' });
    if (!['UZS', 'USD'].includes(currency)) errors.push({ row: rowNumber, field: 'currency', message: 'Valyuta UZS yoki USD bo‘lishi kerak.' });
    if (!exchangeRate || !exchangeRate.gt(0)) errors.push({ row: rowNumber, field: 'exchangeRate', message: 'USD uchun tarixiy UZS kursini kiriting.' });
    if (note.length > 500) errors.push({ row: rowNumber, field: 'note', message: 'Izoh 500 belgidan oshmasin.' });

    if (errors.length === errorCountBefore && reference && date && flow && amount && exchangeRate) {
      rows.push({
        rowNumber,
        reference,
        referenceKey,
        date,
        flow,
        amount: amount.toDecimalPlaces(4).toString(),
        currency: currency as 'UZS' | 'USD',
        exchangeRate: exchangeRate.toDecimalPlaces(6).toString(),
        note,
      });
    }
  });

  return { rows, errors };
}
