"use client";

import { FileDown, Sheet } from 'lucide-react';
import toast from 'react-hot-toast';
import { downloadCsv, downloadXlsx, type ExportSheet } from '@/lib/data-export';
import { api } from '@/lib/api';

export default function ExportActions({ filename, sheet }: { filename: string; sheet: ExportSheet }) {
  const button = 'inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground hover:bg-surface-2';
  const track = (format: 'CSV' | 'XLSX') => {
    void api.post('/reports/data-transfer-event', { action: 'EXPORT', format, source: filename }).catch(() => undefined);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className={button} onClick={() => { downloadCsv(filename, sheet.columns, sheet.rows); track('CSV'); }}>
        <FileDown size={15} /> CSV
      </button>
      <button type="button" className={button} onClick={async () => {
        try {
          await downloadXlsx(filename, [sheet]);
          track('XLSX');
        } catch {
          toast.error('Excel faylini yaratib bo‘lmadi');
        }
      }}>
        <Sheet size={15} /> Excel
      </button>
    </div>
  );
}
