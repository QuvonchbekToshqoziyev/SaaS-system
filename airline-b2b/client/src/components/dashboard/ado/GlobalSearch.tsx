'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';

type SearchResult = {
  query: string;
  firms: Array<{ id: string; name: string; href: string }>;
  flights: Array<{ id: string; flightNumber: string; route: string; href: string }>;
  transactions: Array<{ id: string; type: string; firmName: string | null; flightNumber: string | null; baseAmount: number; href: string }>;
};

type Props = {
  tr: (en: string, uz: string) => string;
};

export default function GlobalSearch({ tr }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<SearchResult>('/search', { params: { q: q.trim() } });
      setResults(res.data);
      setOpen(true);
    } catch {
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 300);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const navigate = (href: string) => {
    setOpen(false);
    setQuery('');
    router.push(href);
  };

  const hasResults = results && (
    results.firms.length > 0 || results.flights.length > 0 || results.transactions.length > 0
  );

  return (
    <div ref={containerRef} className="relative max-w-md flex-1">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => query.length >= 2 && setOpen(true)}
        placeholder={tr('Search... (Ctrl + /)', 'Qidiruv... (Ctrl + /)')}
        className="w-full rounded-xl border border-border bg-surface-2 py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted focus:border-[#C9A84C]/50 focus:outline-none focus:ring-1 focus:ring-[#C9A84C]/30"
      />
      {open && query.length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[360px] overflow-y-auto rounded-xl border border-border bg-surface shadow-2xl">
          {loading && (
            <p className="px-4 py-3 text-xs text-muted">{tr('Searching...', 'Qidirilmoqda...')}</p>
          )}
          {!loading && !hasResults && (
            <p className="px-4 py-3 text-xs text-muted">{tr('No results', 'Natija topilmadi')}</p>
          )}
          {!loading && hasResults && (
            <div className="py-2">
              {results!.firms.length > 0 && (
                <section>
                  <p className="px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-muted">{tr('Firms', 'Firmalar')}</p>
                  {results!.firms.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => navigate(f.href)}
                      className="block w-full px-4 py-2 text-left text-sm hover:bg-surface-2"
                    >
                      {f.name}
                    </button>
                  ))}
                </section>
              )}
              {results!.flights.length > 0 && (
                <section>
                  <p className="px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-muted">{tr('Flights', 'Reyslar')}</p>
                  {results!.flights.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => navigate(f.href)}
                      className="block w-full px-4 py-2 text-left text-sm hover:bg-surface-2"
                    >
                      {f.flightNumber} · {f.route}
                    </button>
                  ))}
                </section>
              )}
              {results!.transactions.length > 0 && (
                <section>
                  <p className="px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-muted">{tr('Transactions', 'Tranzaksiyalar')}</p>
                  {results!.transactions.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => navigate(t.href)}
                      className="block w-full px-4 py-2 text-left text-sm hover:bg-surface-2"
                    >
                      {t.type} — {t.firmName || t.id.slice(0, 8)}
                      {t.flightNumber ? ` · ${t.flightNumber}` : ''}
                    </button>
                  ))}
                </section>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
