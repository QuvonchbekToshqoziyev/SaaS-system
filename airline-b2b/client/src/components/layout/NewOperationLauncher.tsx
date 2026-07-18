"use client";

import { ArrowDownToLine, BanknoteArrowUp, CircleDollarSign, PackageCheck, Plus, ReceiptText, TicketCheck, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

type Operation = { label: string; description: string; href: string; storageKey?: string; icon: React.ComponentType<{ size?: number }>; firmRoles?: string[] };

export default function NewOperationLauncher({ role, firmRole }: { role: string; firmRole: string }) {
  const router = useRouter();
  const { tr } = useLanguage();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [open]);

  const operations: Operation[] = [
    { label: tr('Customer paid', 'Mijoz pul to‘ladi'), description: tr('Record a cash or card payment.', 'Naqd yoki karta to‘lovini qayd eting.'), href: '/kassa#add-payment', storageKey: 'kassa-payment-card', icon: CircleDollarSign, firmRoles: ['FIRM_ADMIN', 'MANAGER', 'KASSIR'] },
    { label: tr('Tour sold', 'Tur sotildi'), description: tr('Choose the tour and buyer firm.', 'Tur va xaridor firmani tanlang.'), href: '/tours#tour-sales', icon: PackageCheck, firmRoles: ['FIRM_ADMIN', 'MANAGER'] },
    { label: tr('Cash received', 'Kassaga pul kirdi'), description: tr('Record cash income and its source.', 'Kirim va pul manbasini kiriting.'), href: '/kassa#cash-movement', storageKey: 'kassa-cash-movement-card', icon: ArrowDownToLine, firmRoles: ['FIRM_ADMIN', 'MANAGER', 'KASSIR'] },
    { label: tr('Firm debt created', 'Firmaga qarz yozildi'), description: tr('Choose the firm and record its debt.', 'Firmani tanlab qarzdorlikni kiriting.'), href: '/firms#firm-list', icon: ReceiptText, firmRoles: ['FIRM_ADMIN'] },
    { label: tr('Ticket sold', 'Bilet sotildi'), description: tr('Choose a flight, then the assigned ticket.', 'Reysni, keyin ajratilgan biletni tanlang.'), href: '/flights#flight-list', icon: TicketCheck, firmRoles: ['FIRM_ADMIN', 'MANAGER'] },
    { label: tr('Close today’s cash desk', 'Bugungi hisobni yopaman'), description: tr('Count physical cash and close the day.', 'Naqd pulni sanab kunni yoping.'), href: '/kassa#close-kassa', storageKey: 'kassa-close-card', icon: BanknoteArrowUp, firmRoles: ['FIRM_ADMIN', 'MANAGER', 'KASSIR'] },
  ];
  const visible = role === 'firm' ? operations.filter((item) => item.firmRoles?.includes(firmRole)) : operations;
  const choose = (operation: Operation) => {
    if (operation.storageKey) localStorage.setItem(operation.storageKey, '1');
    setOpen(false);
    router.push(operation.href);
  };

  return <>
    <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-bold text-ink shadow-sm hover:bg-primary/90"><Plus size={18} /><span className="hidden sm:inline">{tr('New operation', 'Yangi operatsiya')}</span></button>
    {open && <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="new-operation-title">
      <button type="button" className="absolute inset-0" aria-label={tr('Close', 'Yopish')} onClick={() => setOpen(false)} />
      <section className="relative z-10 w-full max-w-3xl rounded-t-2xl border border-border bg-surface p-5 shadow-2xl sm:rounded-2xl sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4"><div><h2 id="new-operation-title" className="text-xl font-bold text-foreground">{tr('What happened?', 'Nima bo‘ldi?')}</h2><p className="mt-1 text-sm text-muted">{tr('Choose the business event. We will open the correct form.', 'Biznes holatini tanlang. Kerakli forma ochiladi.')}</p></div><button type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-md border border-border bg-surface-2 text-muted" aria-label={tr('Close', 'Yopish')}><X size={18} /></button></div>
        <div className="grid gap-3 sm:grid-cols-2">{visible.map((operation) => <button key={operation.href} type="button" onClick={() => choose(operation)} className="flex min-h-24 items-start gap-4 rounded-xl border border-border bg-surface-2 p-4 text-left transition hover:border-primary hover:bg-primary/5"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><operation.icon size={22} /></span><span><span className="block font-bold text-foreground">{operation.label}</span><span className="mt-1 block text-sm leading-5 text-muted">{operation.description}</span></span></button>)}</div>
      </section>
    </div>}
  </>;
}
