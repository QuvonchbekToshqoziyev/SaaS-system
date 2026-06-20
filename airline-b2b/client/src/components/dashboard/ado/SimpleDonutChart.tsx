'use client';

type Slice = { label: string; value: number; color: string };

type Props = {
  title: string;
  subtitle?: string;
  slices: Slice[];
};

export default function SimpleDonutChart({ title, subtitle, slices }: Props) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;

  const arcs = slices.map((s) => {
    const len = (s.value / total) * c;
    const dash = `${len} ${c - len}`;
    const el = (
      <circle
        key={s.label}
        r={r}
        cx="64"
        cy="64"
        fill="transparent"
        stroke={s.color}
        strokeWidth="18"
        strokeDasharray={dash}
        strokeDashoffset={-offset}
        transform="rotate(-90 64 64)"
      />
    );
    offset += len;
    return el;
  });

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between">
        <svg width="128" height="128" viewBox="0 0 128 128" className="shrink-0">
          <circle r={r} cx="64" cy="64" fill="transparent" stroke="var(--border)" strokeWidth="18" />
          {arcs}
        </svg>
        <ul className="w-full space-y-2 text-xs">
          {slices.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-muted">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="font-semibold text-foreground">{Math.round((s.value / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
