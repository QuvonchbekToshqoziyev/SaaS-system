'use client';

import Link from 'next/link';
import { PlaneTakeoff, ArrowRightLeft, BarChart3, FileUp, Sparkles, Wallet } from 'lucide-react';

type Props = {
  tr: (en: string, uz: string) => string;
  isAdmin: boolean;
};

export default function QuickActionBar({ tr, isAdmin }: Props) {
  const actions = [
    {
      href: '/kassa',
      icon: Wallet,
      label: tr('Kassa', 'Kassa'),
    },
    {
      href: isAdmin ? '/transactions?type=payment' : '/transactions?openPayment=1',
      icon: ArrowRightLeft,
      label: tr('Transactions', 'Tranzaksiyalar'),
    },
    { href: '/flights', icon: PlaneTakeoff, label: tr('Flights', 'Reyslar') },
    { href: '/reports', icon: BarChart3, label: tr('Reports', 'Hisobotlar') },
    ...(isAdmin ? [{ href: '/firms', icon: FileUp, label: tr('Firms', 'Firmalar') }] : []),
    { href: '/reports', icon: Sparkles, label: tr('Analytics', 'Tahlil') },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-surface/95 px-4 py-2 backdrop-blur-xl md:left-[260px]">
      <div className="mx-auto flex max-w-[1600px] items-center justify-center gap-2 overflow-x-auto scroller-hide">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.href + a.label}
              href={a.href}
              className="flex shrink-0 items-center gap-2 rounded-xl border border-[#C9A84C]/30 bg-[#C9A84C]/10 px-4 py-2.5 text-xs font-semibold text-[#D4AF37] transition hover:bg-[#C9A84C]/20 hover:text-foreground"
            >
              <Icon size={14} />
              {a.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
