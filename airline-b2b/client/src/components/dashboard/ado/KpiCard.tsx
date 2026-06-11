'use client';

import Link from 'next/link';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';

type Props = {
  title: string;
  value: string;
  subtitle?: string;
  trend?: number | null;
  icon?: ReactNode;
  accent?: 'gold' | 'green' | 'red' | 'blue';
  href?: string;
};

const accentMap = {
  gold: 'from-[#C9A84C]/20 to-transparent border-[#C9A84C]/30',
  green: 'from-emerald-500/15 to-transparent border-emerald-500/25',
  red: 'from-red-500/15 to-transparent border-red-500/25',
  blue: 'from-sky-500/15 to-transparent border-sky-500/25',
};

export default function KpiCard({ title, value, subtitle, trend, icon, accent = 'gold', href }: Props) {
  const trendUp = trend != null && trend >= 0;
  const inner = (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${accentMap[accent]} bg-surface p-5 shadow-[0_4px_24px_rgba(0,0,0,0.25)] ${href ? 'transition hover:border-[#C9A84C]/50 hover:shadow-[0_8px_32px_rgba(201,168,76,0.12)]' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{title}</p>
          <p className="mt-2 font-serif text-2xl font-bold tracking-tight text-foreground md:text-[1.65rem]">{value}</p>
          {subtitle && <p className="mt-1.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {icon && (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#C9A84C]/25 bg-[#C9A84C]/10 text-[#D4AF37]">
            {icon}
          </div>
        )}
      </div>
      {trend != null && (
        <div className={`mt-4 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${trendUp ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
          {trendUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          <span>{trendUp ? '+' : ''}{trend.toFixed(1)}%</span>
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}
