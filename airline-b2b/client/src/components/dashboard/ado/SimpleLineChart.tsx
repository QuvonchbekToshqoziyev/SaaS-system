'use client';

type Point = { label: string; income: number; expense: number };

type Props = {
  title: string;
  subtitle?: string;
  data: Point[];
};

export default function SimpleLineChart({ title, subtitle, data }: Props) {
  const w = 400;
  const h = 160;
  const pad = { t: 12, r: 12, b: 28, l: 40 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;

  const maxVal = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
  const points = data.length ? data : [{ label: '-', income: 0, expense: 0 }];

  const xAt = (i: number) => pad.l + (i / Math.max(1, points.length - 1)) * innerW;
  const yAt = (v: number) => pad.t + innerH - (v / maxVal) * innerH;

  const linePath = (key: 'income' | 'expense') =>
    points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(p[key])}`)
      .join(' ');

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        <div className="flex gap-4 text-[11px] font-medium">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="h-0.5 w-4 rounded bg-emerald-400" /> Kirim
          </span>
          <span className="flex items-center gap-1.5 text-red-400">
            <span className="h-0.5 w-4 rounded bg-red-400" /> Chiqim
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" aria-hidden>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = pad.t + innerH * (1 - t);
          return (
            <line key={t} x1={pad.l} x2={w - pad.r} y1={y} y2={y} stroke="currentColor" className="text-border" strokeWidth="1" />
          );
        })}
        <path d={linePath('expense')} fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d={linePath('income')} fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <text key={p.label} x={xAt(i)} y={h - 6} textAnchor="middle" className="fill-muted text-[9px]">
            {p.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
