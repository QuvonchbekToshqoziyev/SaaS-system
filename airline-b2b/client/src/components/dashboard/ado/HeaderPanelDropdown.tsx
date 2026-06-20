'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

export type PanelItem = {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  urgent?: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  items: PanelItem[];
  emptyLabel: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  children: ReactNode;
};

export default function HeaderPanelDropdown({
  open,
  onClose,
  title,
  items,
  emptyLabel,
  viewAllHref,
  viewAllLabel,
  children,
}: Props) {
  const router = useRouter();

  return (
    <div className="relative">
      {children}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
          <div className="absolute right-0 top-full z-50 mt-2 w-[320px] rounded-xl border border-border bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-sm font-bold text-foreground">{title}</h3>
              <button type="button" onClick={onClose} className="text-muted hover:text-foreground">✕</button>
            </div>
            <ul className="max-h-[320px] overflow-y-auto py-2">
              {items.length === 0 && (
                <li className="px-4 py-3 text-xs text-muted">{emptyLabel}</li>
              )}
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      router.push(item.href);
                    }}
                    className={`block w-full px-4 py-2.5 text-left transition hover:bg-surface-2 ${item.urgent ? 'border-l-2 border-red-500' : ''}`}
                  >
                    <p className="text-xs font-semibold text-foreground">{item.title}</p>
                    {item.subtitle && <p className="mt-0.5 text-[10px] text-muted">{item.subtitle}</p>}
                  </button>
                </li>
              ))}
            </ul>
            {viewAllHref && viewAllLabel && items.length > 0 && (
              <div className="border-t border-border px-4 py-2">
                <Link
                  href={viewAllHref}
                  onClick={onClose}
                  className="text-xs font-semibold text-[#D4AF37] hover:underline"
                >
                  {viewAllLabel}
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
