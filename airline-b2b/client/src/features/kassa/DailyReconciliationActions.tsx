"use client";

import { Printer } from 'lucide-react';
import ExportActions from '@/components/ui/ExportActions';

type Props = {
  date: string;
  status: string;
  openingBalance: string;
  closingBalance: string;
  cashIn: string;
  cashOut: string;
  cashBalance: string;
  cardIn: string;
  cardOut: string;
  cardBalance: string;
  openedBy?: string;
  closedBy?: string;
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char] || char));

export default function DailyReconciliationActions(props: Props) {
  const rows = [
    ['Sana', props.date], ['Holat', props.status], ['Boshlang‘ich qoldiq', props.openingBalance],
    ['Naqd kirim', props.cashIn], ['Naqd chiqim', props.cashOut], ['Joriy naqd qoldiq', props.cashBalance],
    ['Karta kirim', props.cardIn], ['Karta chiqim', props.cardOut], ['Karta qoldiq', props.cardBalance],
    ['Yakuniy qoldiq', props.closingBalance], ['Ochgan hodim', props.openedBy || '—'], ['Yopgan hodim', props.closedBy || '—'],
  ].map(([metric, value]) => ({ metric, value }));

  const print = () => {
    const popup = window.open('', '_blank', 'noopener,noreferrer,width=850,height=900');
    if (!popup) return;
    popup.document.write(`<!doctype html><html><head><title>Kassa ${escapeHtml(props.date)}</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{border:1px solid #bbb;padding:10px;text-align:left}th{background:#eee}.foot{margin-top:36px;display:flex;justify-content:space-between}</style></head><body><h1>Kunlik kassa solishtirma hisoboti</h1><p>ADO Systems · ${escapeHtml(props.date)}</p><table><thead><tr><th>Ko‘rsatkich</th><th>Qiymat</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.metric)}</td><td>${escapeHtml(row.value)}</td></tr>`).join('')}</tbody></table><div class="foot"><span>Kassir imzosi: __________________</span><span>Tekshiruvchi: __________________</span></div><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  };

  return <div className="flex flex-wrap gap-2"><ExportActions filename={`ado-kassa-${props.date}`} sheet={{ name: 'Kunlik kassa', columns: [{ header: 'Ko‘rsatkich', key: 'metric', width: 28 }, { header: 'Qiymat', key: 'value', width: 32 }], rows }} /><button type="button" onClick={print} className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground hover:bg-surface-2"><Printer size={15} /> Chop etish</button></div>;
}
