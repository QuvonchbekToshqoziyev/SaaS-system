/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { downloadXlsx } from '@/lib/data-export';
import ActionButtons from '@/components/ui/ActionButtons';

type ImportDesk = {
  id: string;
  firmId: string;
  name: string;
  code?: string | null;
  firm?: { id: string; name: string | null } | null;
};

type ImportRow = {
  rowNumber: number;
  reference: string;
  date: string;
  flow: string;
  amount: string | number;
  currency: string;
  exchangeRate: string | number;
  note: string;
};

type ImportPreview = {
  ok: boolean;
  validCount: number;
  readyCount: number;
  skippedCount: number;
  errors: Array<{ row: number; field: string; message: string }>;
};

const IMPORT_COLUMNS = [
  { header: 'Import ID *', key: 'reference', width: 20 },
  { header: 'Sana *', key: 'date', width: 15 },
  { header: 'Harakat *', key: 'flow', width: 15 },
  { header: 'Summa *', key: 'amount', width: 18 },
  { header: 'Valyuta *', key: 'currency', width: 14 },
  { header: 'Kurs (UZS) *', key: 'exchangeRate', width: 18 },
  { header: 'Izoh', key: 'note', width: 38 },
] as const;

const headerKey = (value: unknown) => String(value || '').trim().toLowerCase();

function cellValue(value: unknown): string | number {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const item = value as { text?: unknown; result?: unknown; richText?: Array<{ text?: string }> };
    if (item.text != null) return String(item.text);
    if (item.result != null) return cellValue(item.result);
    if (Array.isArray(item.richText)) return item.richText.map((part) => part.text || '').join('');
  }
  return '';
}

export default function HistoricalKassaImport({
  desk,
  tr,
  onImported,
}: {
  desk: ImportDesk;
  tr: (en: string, uz: string) => string;
  onImported: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [filename, setFilename] = useState('');
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const firmName = desk.firm?.name || desk.firmId;
  const deskLabel = `${desk.name}${desk.code ? ` (${desk.code})` : ''}`;
  const cancelPreview = () => {
    setRows([]);
    setPreview(null);
    setFilename('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const downloadTemplate = async () => {
    try {
      await downloadXlsx(`ado-eski-kassa-${desk.code || desk.id}`, [
        { name: 'Kassa importi', columns: [...IMPORT_COLUMNS], rows: [] },
        {
          name: 'Namuna',
          columns: [...IMPORT_COLUMNS],
          rows: [{ reference: 'ESKI-0001', date: '2026-01-15', flow: 'KIRIM', amount: 1500000, currency: 'UZS', exchangeRate: 1, note: 'Namuna qator — Kassa importi varag‘iga ko‘chirmang' }],
        },
        {
          name: 'Sozlamalar',
          columns: [{ header: 'Maydon', key: 'field', width: 22 }, { header: 'Qiymat', key: 'value', width: 44 }],
          rows: [
            { field: 'firmId', value: desk.firmId },
            { field: 'kassaDeskId', value: desk.id },
            { field: 'Firma', value: firmName },
            { field: 'Kassa', value: deskLabel },
          ],
        },
        {
          name: 'Yordam',
          columns: [{ header: 'Qoida', key: 'rule', width: 95 }],
          rows: [
            { rule: 'Faqat “Kassa importi” varag‘ini to‘ldiring; sarlavhalarni o‘zgartirmang.' },
            { rule: 'Import ID har bir qator uchun yagona bo‘lsin. Fayl qayta yuklansa, shu ID dublikat yaratilishining oldini oladi.' },
            { rule: 'Sana YYYY-MM-DD, harakat KIRIM yoki CHIQIM, valyuta UZS yoki USD bo‘lsin.' },
            { rule: 'UZS uchun kurs 1. USD uchun operatsiya sanasidagi tarixiy UZS kursini kiriting.' },
            { rule: 'Har bir sana uchun ushbu Kassa kuni saytda OPEN bo‘lishi kerak. Yopiq kunni avval qayta oching.' },
            { rule: 'Bir faylda ko‘pi bilan 500 qator yuklanadi.' },
          ],
        },
      ]);
    } catch {
      toast.error(tr('Failed to create the Excel template', 'Excel shablonini yaratib bo‘lmadi'));
    }
  };

  const parseWorkbook = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) throw new Error('Excel fayli 5 MB dan oshmasin.');
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer() as any);
    const dataSheet = workbook.getWorksheet('Kassa importi');
    const settingsSheet = workbook.getWorksheet('Sozlamalar');
    if (!dataSheet || !settingsSheet) throw new Error('Bu fayl ADO Kassa import shabloni emas.');

    const settings = new Map<string, string>();
    settingsSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      settings.set(String(cellValue(row.getCell(1).value)), String(cellValue(row.getCell(2).value)));
    });
    if (settings.get('firmId') !== desk.firmId || settings.get('kassaDeskId') !== desk.id) {
      throw new Error('Shablon boshqa firma yoki kassa uchun yaratilgan. To‘g‘ri kassani tanlab yangi shablon yuklab oling.');
    }

    const columns = new Map<string, number>();
    dataSheet.getRow(1).eachCell((cell, columnNumber) => columns.set(headerKey(cellValue(cell.value)), columnNumber));
    for (const column of IMPORT_COLUMNS.filter((item) => item.header.endsWith('*'))) {
      if (!columns.has(headerKey(column.header))) throw new Error(`Majburiy ustun topilmadi: ${column.header}`);
    }

    const parsed: ImportRow[] = [];
    dataSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const get = (header: string) => {
        const columnNumber = columns.get(headerKey(header));
        return columnNumber ? cellValue(row.getCell(columnNumber).value) : '';
      };
      const candidate: ImportRow = {
        rowNumber,
        reference: String(get('Import ID *')).trim(),
        date: String(get('Sana *')).trim(),
        flow: String(get('Harakat *')).trim(),
        amount: get('Summa *'),
        currency: String(get('Valyuta *')).trim(),
        exchangeRate: get('Kurs (UZS) *'),
        note: String(get('Izoh')).trim(),
      };
      if (Object.entries(candidate).some(([key, value]) => key !== 'rowNumber' && String(value).trim())) parsed.push(candidate);
    });
    if (!parsed.length) throw new Error('“Kassa importi” varag‘ida ma’lumot qatori yo‘q.');
    return parsed;
  };

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setChecking(true);
    setPreview(null);
    try {
      const parsed = await parseWorkbook(file);
      const response = await api.post('/transactions/import/historical-kassa', {
        dryRun: true,
        firmId: desk.firmId,
        kassaDeskId: desk.id,
        rows: parsed,
      });
      setRows(parsed);
      setFilename(file.name);
      setPreview(response.data);
    } catch (error: any) {
      setRows([]);
      setFilename('');
      toast.error(error?.response?.data?.error || error?.message || tr('Failed to read the template', 'Shablonni o‘qib bo‘lmadi'));
    } finally {
      setChecking(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const confirmImport = async () => {
    if (!preview?.ok || !rows.length || importing) return;
    setImporting(true);
    try {
      const response = await api.post('/transactions/import/historical-kassa', {
        dryRun: false,
        firmId: desk.firmId,
        kassaDeskId: desk.id,
        rows,
      });
      toast.success(tr(
        `${response.data.createdCount} historical entries imported`,
        `${response.data.createdCount} ta eski kassa yozuvi yuklandi`,
      ));
      setRows([]);
      setPreview(null);
      setFilename('');
      onImported();
    } catch (error: any) {
      const data = error?.response?.data;
      if (Array.isArray(data?.errors)) setPreview(data);
      toast.error(data?.error || data?.errors?.[0]?.message || tr('Import failed', 'Ma’lumotlarni yuklab bo‘lmadi'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm">
        <div><b>{tr('Firm', 'Firma')}:</b> {firmName}</div>
        <div><b>{tr('Kassa', 'Kassa')}:</b> {deskLabel}</div>
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold hover:bg-surface-2">
          <Download size={17} /> {tr('Download Excel template', 'Excel shablonni yuklab olish')}
        </button>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-ink hover:bg-primary/90">
          <Upload size={17} /> {checking ? tr('Checking…', 'Tekshirilmoqda…') : tr('Choose completed template', 'To‘ldirilgan shablonni tanlash')}
          <input ref={inputRef} type="file" accept=".xlsx" className="sr-only" disabled={checking || importing} onChange={chooseFile} />
        </label>
      </div>

      {preview && (
        <div className={`rounded-lg border p-4 ${preview.ok ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
          <div className="flex items-center gap-2 font-semibold"><FileSpreadsheet size={18} /> {filename}</div>
          <div className="mt-2 text-sm">
            {tr('Valid', 'Tekshirildi')}: <b>{preview.validCount}</b> · {tr('Ready to import', 'Yuklashga tayyor')}: <b>{preview.readyCount}</b> · {tr('Already imported', 'Oldin yuklangan')}: <b>{preview.skippedCount}</b>
          </div>
          {preview.errors.length > 0 && (
            <ul className="mt-3 max-h-48 space-y-1 overflow-auto text-sm text-red-700 dark:text-red-300">
              {preview.errors.slice(0, 50).map((error, index) => <li key={`${error.row}-${error.field}-${index}`}>{error.row ? `${error.row}-qator: ` : ''}{error.message}</li>)}
            </ul>
          )}
          <ActionButtons
            className="mt-4"
            cancelLabel={tr('Cancel', 'Bekor qilish')}
            confirmLabel={tr('Confirm', 'Tasdiqlash')}
            busyLabel={tr('Importing…', 'Yuklanmoqda…')}
            busy={importing}
            canConfirm={preview.ok && rows.length > 0}
            onCancel={cancelPreview}
            onConfirm={confirmImport}
          />
        </div>
      )}
    </div>
  );
}
