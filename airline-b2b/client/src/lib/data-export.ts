export type ExportValue = string | number | boolean | Date | null | undefined;
export type ExportRow = Record<string, ExportValue>;

export type ExportSheet = {
  name: string;
  columns: Array<{ header: string; key: string; width?: number }>;
  rows: ExportRow[];
};

function safeText(value: ExportValue): string | number | boolean | Date {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value: ExportValue): string {
  const text = String(safeText(value));
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildCsv(columns: ExportSheet['columns'], rows: ExportRow[]) {
  const lines = [
    columns.map((column) => csvCell(column.header)).join(','),
    ...rows.map((row) => columns.map((column) => csvCell(row[column.key])).join(',')),
  ];
  return `\uFEFF${lines.join('\r\n')}`;
}

export function downloadCsv(filename: string, columns: ExportSheet['columns'], rows: ExportRow[]) {
  downloadBlob(new Blob([buildCsv(columns, rows)], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`);
}

export async function downloadXlsx(filename: string, sheets: ExportSheet[]) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ADO Systems';
  workbook.created = new Date();

  for (const item of sheets) {
    const sheet = workbook.addWorksheet(item.name.slice(0, 31));
    sheet.columns = item.columns.map((column) => ({ ...column, width: column.width || 20 }));
    item.rows.forEach((row) => sheet.addRow(Object.fromEntries(
      item.columns.map((column) => [column.key, safeText(row[column.key])]),
    )));
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(item.columns.length).letter}1` };
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF166534' } };
    header.alignment = { vertical: 'middle' };
    header.height = 24;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${filename}.xlsx`,
  );
}

export const uzbekTemplates: ExportSheet[] = [
  {
    name: 'Firmalar',
    columns: [
      { header: 'Firma nomi *', key: 'name', width: 28 },
      { header: 'Mas’ul shaxs', key: 'contact', width: 24 },
      { header: 'Telefon', key: 'phone', width: 18 },
      { header: 'Valyuta *', key: 'currency', width: 12 },
      { header: 'Boshlang‘ich qarz', key: 'openingDebt', width: 18 },
      { header: 'Izoh', key: 'note', width: 30 },
    ],
    rows: [{ name: 'Namuna Travel', contact: 'Ali Valiyev', phone: '+998901234567', currency: 'UZS', openingDebt: 0, note: 'Namuna qatorni o‘chirishingiz mumkin' }],
  },
  {
    name: 'Hodimlar',
    columns: [
      { header: 'To‘liq ism *', key: 'name', width: 28 },
      { header: 'Rol *', key: 'role', width: 18 },
      { header: 'Maosh', key: 'salary', width: 16 },
      { header: 'Valyuta', key: 'currency', width: 12 },
      { header: 'Telefon', key: 'phone', width: 18 },
      { header: 'Status', key: 'status', width: 14 },
    ],
    rows: [{ name: 'Vali Aliyev', role: 'MANAGER', salary: 0, currency: 'UZS', phone: '+998901234567', status: 'ACTIVE' }],
  },
  {
    name: 'Tranzaksiyalar',
    columns: [
      { header: 'Sana *', key: 'date', width: 14 },
      { header: 'Turi *', key: 'type', width: 18 },
      { header: 'Firma *', key: 'firm', width: 28 },
      { header: 'Summa *', key: 'amount', width: 16 },
      { header: 'Valyuta *', key: 'currency', width: 12 },
      { header: 'Kirim/Chiqim *', key: 'direction', width: 16 },
      { header: 'To‘lov usuli', key: 'method', width: 18 },
      { header: 'Izoh', key: 'note', width: 32 },
    ],
    rows: [{ date: '2026-07-13', type: 'PAYMENT', firm: 'Namuna Travel', amount: 1000000, currency: 'UZS', direction: 'KIRIM', method: 'CASH', note: 'Namuna' }],
  },
  {
    name: 'Tur paketlar',
    columns: [
      { header: 'Tur nomi *', key: 'name', width: 28 },
      { header: 'Yo‘nalish *', key: 'destination', width: 24 },
      { header: 'Boshlanish sanasi', key: 'startDate', width: 18 },
      { header: 'Tugash sanasi', key: 'endDate', width: 18 },
      { header: 'Soni *', key: 'quantity', width: 12 },
      { header: 'Narxi *', key: 'price', width: 16 },
      { header: 'Valyuta *', key: 'currency', width: 12 },
      { header: 'Izoh', key: 'note', width: 30 },
    ],
    rows: [{ name: 'Istanbul 7 kun', destination: 'Istanbul', startDate: '2026-08-01', endDate: '2026-08-08', quantity: 10, price: 500, currency: 'USD', note: 'Namuna' }],
  },
];
