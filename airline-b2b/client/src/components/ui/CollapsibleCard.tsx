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
  id?: string;
  tone?: 'default' | 'finance' | 'success' | 'danger';
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
  id,
  tone = 'default',
}: CollapsibleCardProps) {
  const { tr } = useLanguage();
  const [open, setOpen] = useState(defaultOpen);
  const didHydrateFromStorage = useRef(false);
  const hasChildren = useMemo(() => React.Children.count(children) > 0, [children]);

  const bodyPaddingClassName = contentClassName ?? 'p-5 md:p-6';

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
    <section id={id} data-tone={tone === 'default' ? undefined : tone} className={`section-card scroll-mt-24 transition-[border-color,box-shadow,background-color] duration-300 ${className || ''}`}>
      <div
        className={`section-card__header flex flex-col items-start justify-between gap-4 px-5 py-4 transition-colors sm:flex-row md:px-6 md:py-5 ${
          isOpen && hasChildren ? 'border-b border-border' : ''
        }`}
      >
        <div className="min-w-0">
          <div className="section-card__title text-foreground">{title}</div>
          {description ? <div className="mt-1.5 max-w-3xl text-sm font-medium leading-5 text-muted">{description}</div> : null}
        </div>

        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap sm:gap-3">
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
          <div className="section-card__body min-h-0">
            <div className={bodyPaddingClassName}>{children}</div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
