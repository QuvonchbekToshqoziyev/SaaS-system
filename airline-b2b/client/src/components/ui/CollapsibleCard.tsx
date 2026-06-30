import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { ChevronDown } from 'lucide-react';

type CollapsibleCardProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  defaultOpen?: boolean;
  storageKey?: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  headerRight?: React.ReactNode;
  collapsible?: boolean;
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
  collapsible = false,
}: CollapsibleCardProps) {
  const { tr } = useLanguage();
  const [open, setOpen] = useState(defaultOpen);
  const didHydrateFromStorage = useRef(false);
  const hasChildren = useMemo(() => React.Children.count(children) > 0, [children]);

  const bodyPaddingClassName = contentClassName ?? 'p-6 md:p-8';

  useEffect(() => {
    if (!collapsible) return;
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
  }, [collapsible, storageKey]);

  useEffect(() => {
    if (!collapsible) return;
    if (!storageKey) return;
    if (!didHydrateFromStorage.current) return;
    try {
      localStorage.setItem(storageKey, open ? '1' : '0');
    } catch {
      // ignore
    }
  }, [collapsible, open, storageKey]);

  const isOpen = collapsible ? open : true;

  return (
    <div className={`bg-surface shadow-sm border border-border rounded-lg transition-all duration-300 hover:shadow-[0_4px_24px_-8px_rgba(0,0,0,0.05)] ${className || ''}`}>
      <div
        className={`px-6 py-5 md:px-8 md:py-6 flex items-start justify-between gap-4 transition-colors ${
          isOpen && hasChildren ? 'border-b border-border' : ''
        }`}
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-wide uppercase text-foreground">{title}</div>
          {description ? <div className="mt-1 text-xs font-medium text-muted">{description}</div> : null}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {headerRight}
          {collapsible && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface-2 text-muted transition hover:text-foreground active:scale-95"
              aria-expanded={open}
              aria-label={open ? tr('Hide', 'Yopish') : tr('Show', "Ko'rsatish")}
              title={open ? tr('Hide', 'Yopish') : tr('Show', "Ko'rsatish")}
            >
              <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {hasChildren ? (
        <div
          className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
            isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
          aria-hidden={!isOpen}
        >
          <div className="min-h-0 bg-surface-2/30">
            <div className={bodyPaddingClassName}>{children}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
