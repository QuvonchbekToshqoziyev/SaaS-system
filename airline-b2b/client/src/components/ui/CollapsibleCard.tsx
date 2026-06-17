import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

type CollapsibleCardProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  defaultOpen?: boolean;
  storageKey?: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  headerRight?: React.ReactNode;
};

export default function CollapsibleCard({
  title,
  description,
  defaultOpen = true,
  storageKey,
  children,
  className,
  contentClassName,
  headerRight,
}: CollapsibleCardProps) {
  const { tr } = useLanguage();
  const [open, setOpen] = useState(defaultOpen);
  const didHydrateFromStorage = useRef(false);
  const hasChildren = useMemo(() => React.Children.count(children) > 0, [children]);

  const bodyPaddingClassName = contentClassName ?? 'p-6 md:p-8';

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === '1' || raw === 'true') setOpen(true);
      if (raw === '0' || raw === 'false') setOpen(false);
    } catch {
      // ignore
    } finally {
      didHydrateFromStorage.current = true;
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    if (!didHydrateFromStorage.current) return;
    try {
      localStorage.setItem(storageKey, open ? '1' : '0');
    } catch {
      // ignore
    }
  }, [open, storageKey]);

  return (
    <div className={`bg-surface shadow-sm border border-border rounded-[1.25rem] transition-all duration-300 hover:shadow-[0_4px_24px_-8px_rgba(0,0,0,0.05)] ${className || ''}`}>
      <div
        className={`px-6 py-5 md:px-8 md:py-6 flex items-start justify-between gap-4 transition-colors ${
          open && hasChildren ? 'border-b border-border' : ''
        }`}
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-wide uppercase text-foreground">{title}</div>
          {description ? <div className="mt-1 text-xs font-medium text-muted">{description}</div> : null}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {headerRight}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="px-3.5 py-1.5 bg-surface-2 text-foreground hover:bg-black/5 dark:hover:bg-white/5 rounded-md transition-all duration-200 border border-border text-[11px] uppercase tracking-widest font-semibold whitespace-nowrap active:scale-95"
            aria-expanded={open}
          >
            {open ? tr('Hide', 'Yopish') : tr('Show', "Ko'rsatish")}
          </button>
        </div>
      </div>

      {hasChildren ? (
        <div
          className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
            open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
          aria-hidden={!open}
        >
          <div className="min-h-0 bg-surface-2/30">
            <div className={bodyPaddingClassName}>{children}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
