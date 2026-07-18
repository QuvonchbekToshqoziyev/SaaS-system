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

export default function KpiCard({ title, value, subtitle, trend, icon, accent = 'gold', href }: Props) {
  const trendUp = trend != null && trend >= 0;
  const inner = (
    <div
      data-accent={accent}
      className={`kpi-card ${href ? 'transition' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted">{title}</p>
          <p className="data-value mt-3 text-2xl font-semibold tracking-tight text-foreground md:text-[1.7rem]">{value}</p>
          {subtitle && <p className="mt-1.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {icon && (
          <div className="kpi-card__icon flex h-11 w-11 shrink-0 items-center justify-center rounded-lg">
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
