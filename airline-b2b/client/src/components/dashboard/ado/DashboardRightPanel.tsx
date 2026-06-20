'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, MessageCircle, Headphones } from 'lucide-react';
type Todo = { key: string; label: string; count: number; amount?: number; href?: string };
type Notification = { id: string; title: string; message?: string; time: string; urgent?: boolean; href?: string };
type DueItem = { id: string; title: string; detail?: string; amount?: number; href?: string };

type Props = {
  tr: (en: string, uz: string) => string;
  todos: Todo[];
  notifications: Notification[];
  dueItems: DueItem[];
};

export default function DashboardRightPanel({ tr, todos, notifications, dueItems }: Props) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
        <div className="mb-3 flex items-center gap-2">
          <Bell size={16} className="text-[#D4AF37]" />
          <h3 className="text-sm font-bold text-foreground">{tr('Notifications', 'Bildirishnomalar')}</h3>
        </div>
        <ul className="space-y-3">
          {notifications.length === 0 && (
            <li className="text-xs text-muted">{tr('No new alerts', "Yangi bildirishnomalar yo'q")}</li>
          )}
          {notifications.map((n) => {
            const content = (
              <>
                <p className="font-medium text-foreground">{n.title}</p>
                {n.message && <p className="mt-0.5 text-muted">{n.message}</p>}
                <p className="mt-0.5 text-[10px] text-muted">{n.time}</p>
              </>
            );
            return (
              <li key={n.id}>
                {n.href ? (
                  <button
                    type="button"
                    onClick={() => router.push(n.href!)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition hover:bg-surface-2 ${n.urgent ? 'border-red-500/30 bg-red-500/10' : 'border-border bg-surface-2/80'}`}
                  >
                    {content}
                  </button>
                ) : (
                  <div className={`rounded-lg border px-3 py-2 text-xs ${n.urgent ? 'border-red-500/30 bg-red-500/10' : 'border-border bg-surface-2/80'}`}>
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4 shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
        <h3 className="text-sm font-bold text-foreground">{tr('My tasks', 'Vazifalarim')}</h3>
        <ul className="mt-3 space-y-2">
          {todos.length === 0 && (
            <li className="text-xs text-muted">{tr('All caught up', 'Hammasi bajarilgan')}</li>
          )}
          {todos.slice(0, 5).map((t) => (
            <li key={t.key}>
              {t.href ? (
                <button
                  type="button"
                  onClick={() => router.push(t.href!)}
                  className="flex w-full items-start gap-2 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-left transition hover:border-[#C9A84C]/30"
                >
                  <span className="mt-0.5 h-4 w-4 shrink-0 rounded border border-[#C9A84C]/50" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground">{t.label}</p>
                    <p className="text-[10px] text-muted">
                      {typeof t.amount === 'number' ? `${t.amount.toFixed(0)} UZS` : `${t.count} ${tr('items', 'ta')}`}
                    </p>
                  </div>
                </button>
              ) : (
                <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-2/60 px-3 py-2">
                  <span className="mt-0.5 h-4 w-4 shrink-0 rounded border border-border" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground">{t.label}</p>
                    <p className="text-[10px] text-muted">
                      {typeof t.amount === 'number' ? `${t.amount.toFixed(0)} UZS` : `${t.count} ${tr('items', 'ta')}`}
                    </p>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {dueItems.length > 0 && (
        <div className="rounded-2xl border border-[#C9A84C]/25 bg-[#C9A84C]/5 p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#D4AF37]">{tr('Due soon', "Tez orada to'lash")}</h3>
          <ul className="mt-2 space-y-2">
            {dueItems.slice(0, 4).map((d) => (
              <li key={d.id}>
                {d.href ? (
                  <button
                    type="button"
                    onClick={() => router.push(d.href!)}
                    className="w-full text-left text-xs transition hover:text-[#D4AF37]"
                  >
                    <p className="font-medium text-foreground">{d.title}</p>
                    {d.detail && <p className="text-muted">{d.detail}</p>}
                    {d.amount != null && <p className="font-semibold text-red-400">{d.amount.toFixed(0)} UZS</p>}
                  </button>
                ) : (
                  <div className="text-xs">
                    <p className="font-medium text-foreground">{d.title}</p>
                    {d.detail && <p className="text-muted">{d.detail}</p>}
                    {d.amount != null && <p className="font-semibold text-red-400">{d.amount.toFixed(0)} UZS</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center gap-2 text-[#D4AF37]">
          <Headphones size={16} />
          <span className="text-sm font-bold text-foreground">ADO Support</span>
        </div>
        <p className="mt-2 text-xs text-muted">
          {tr('Need help with flights or payments?', "Reyslar yoki to'lovlar bo'yicha yordam kerakmi?")}
        </p>
        <Link href="/reports" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#D4AF37] hover:underline">
          <MessageCircle size={12} />
          {tr('View activity reports', 'Faollik hisobotlari')}
        </Link>
      </div>
    </div>
  );
}
