"use client";

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('Dashboard error boundary:', error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <section className="w-full max-w-xl rounded-lg border border-red-400/30 bg-slate-900 p-6 shadow-xl">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-red-500/15 text-red-300">
            <AlertTriangle size={24} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              The page hit an unexpected error. Try again, and share the digest with admin if it repeats.
            </p>
            {error.digest ? (
              <p className="mt-4 rounded-md bg-slate-950 px-3 py-2 font-mono text-xs text-slate-300">
                digest: {error.digest}
              </p>
            ) : null}
            <button
              type="button"
              onClick={reset}
              className="mt-5 inline-flex items-center gap-2 rounded-md bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-400"
            >
              <RefreshCw size={16} />
              Try again
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
