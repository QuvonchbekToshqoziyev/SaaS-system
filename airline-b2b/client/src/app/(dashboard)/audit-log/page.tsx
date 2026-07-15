"use client";

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, History, Search, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

type AuditRow = {
  id: string;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  ipAddress?: string | null;
  createdAt: string;
};

type AuditResponse = {
  data: AuditRow[];
  filters?: { actions?: string[]; entityTypes?: string[] };
  meta: { total: number; page: number; limit: number; totalPages: number };
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function jsonPreview(value: unknown) {
  if (value === null || value === undefined) return '-';
  return JSON.stringify(value, null, 2);
}

function actionClass(action: string) {
  const normalized = action.toUpperCase();
  if (normalized === 'DELETE') return 'bg-red-500/10 text-red-600 border-red-500/20';
  if (normalized === 'CREATE' || normalized === 'OPEN') return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
  if (normalized === 'CLOSE') return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
  return 'bg-primary/10 text-primary border-primary/20';
}

const actionLabels: Record<string, string> = { CREATE: 'Yaratildi', UPDATE: 'O‘zgartirildi', DELETE: 'O‘chirildi', SOFT_DELETE: 'Arxivlandi', OPEN: 'Ochildi', CLOSE: 'Yopildi' };
const entityLabels: Record<string, string> = { transaction: 'Pul operatsiyasi', kassaDay: 'Kassa kuni', firm: 'Firma', flight: 'Reys', ticket: 'Bilet', paymentCard: 'To‘lov kartasi', employee: 'Hodim', tourPackage: 'Tur paket', serviceOffering: 'Xizmat', financialAccount: 'Moliyaviy hisob' };

function businessSummary(row: AuditRow) {
  const action = actionLabels[row.action.toUpperCase()] || row.action;
  const entity = entityLabels[row.entityType] || row.entityType;
  const reason = row.metadata && typeof row.metadata === 'object' ? String((row.metadata as Record<string, unknown>).reason || (row.metadata as Record<string, unknown>).correctionReason || '') : '';
  return `${entity}: ${action}${row.entityLabel ? ` — ${row.entityLabel}` : ''}${reason ? ` · Sabab: ${reason}` : ''}`;
}

export default function AuditLogPage() {
  const { user } = useAuth();
  const { tr } = useLanguage();
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sinceYesterday, setSinceYesterday] = useState(false);
  const isSuperAdmin = String(user?.role || '').toUpperCase() === 'SUPERADMIN';

  const query = useMemo(() => ({
    page,
    limit: 30,
    search: search.trim() || undefined,
    action: action || undefined,
    entityType: entityType || undefined,
    since: sinceYesterday ? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() : undefined,
  }), [action, entityType, page, search, sinceYesterday]);

  const { data, isLoading } = useQuery<AuditResponse>({
    queryKey: ['audit-log', query],
    queryFn: async () => (await api.get('/audit-log', { params: query })).data,
    enabled: isSuperAdmin,
  });

  if (!isSuperAdmin) {
    return (
      <div>
        <h2 className="text-2xl font-bold text-foreground">{tr('Audit Log', 'Audit Log')}</h2>
        <p className="mt-2 text-muted">{tr('Only superadmin can view audit logs.', 'Audit logni faqat superadmin ko‘ra oladi.')}</p>
      </div>
    );
  }

  const rows = data?.data || [];
  const actions = data?.filters?.actions || [];
  const entityTypes = data?.filters?.entityTypes || [];
  const meta = data?.meta || { total: 0, page, limit: 30, totalPages: 1 };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">{tr('Audit Log', 'Audit Log')}</h2>
          <p className="mt-1 text-sm text-muted">
            {tr('See who changed or deleted data across the beta release surfaces.', 'Kim nimani o‘zgartirdi yoki o‘chirdi - hammasi shu yerda ko‘rinadi.')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => { setSinceYesterday((value) => !value); setPage(1); }} className={`rounded-md border px-3 py-2 text-sm font-semibold ${sinceYesterday ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-surface-2 text-muted'}`}>{tr('Changes since yesterday', 'Kechadan beri o‘zgarishlar')}</button>
        <div className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm font-semibold text-muted">
          <ShieldCheck size={17} />
          {meta.total} {tr('records', 'yozuv')}
        </div>
        </div>
      </div>

      <div className="glass-panel p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_200px_auto]">
          <label className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2">
            <Search size={16} className="text-muted" />
            <input
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              placeholder={tr('Search actor, action, entity, summary', 'Actor, action, entity yoki summary qidirish')}
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
            />
          </label>
          <select value={action} onChange={(event) => { setAction(event.target.value); setPage(1); }} className="compact-control">
            <option value="">{tr('All actions', 'Barcha amallar')}</option>
            {actions.map((item) => <option key={item} value={item}>{actionLabels[item.toUpperCase()] || item}</option>)}
          </select>
          <select value={entityType} onChange={(event) => { setEntityType(event.target.value); setPage(1); }} className="compact-control">
            <option value="">{tr('All entities', 'Barcha ma’lumotlar')}</option>
            {entityTypes.map((item) => <option key={item} value={item}>{entityLabels[item] || item}</option>)}
          </select>
          <div className="inline-flex items-center gap-2 text-sm text-muted">
            <History size={18} />
            {isLoading ? tr('Loading...', 'Yuklanmoqda...') : `${rows.length}/${meta.total}`}
          </div>
        </div>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto scroller-minimal">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">{tr('Time', 'Vaqt')}</th>
                <th className="px-4 py-3">{tr('User', 'User')}</th>
                <th className="px-4 py-3">{tr('Action', 'Action')}</th>
                <th className="px-4 py-3">{tr('Entity', 'Entity')}</th>
                <th className="px-4 py-3">{tr('Summary', 'Summary')}</th>
                <th className="px-4 py-3">{tr('IP', 'IP')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const expanded = expandedId === row.id;
                return (
                  <tr key={row.id} className="align-top hover:bg-surface-2/60">
                    <td className="px-4 py-3 text-muted whitespace-nowrap">{formatDate(row.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-foreground">{row.actorEmail || '-'}</div>
                      <div className="text-xs text-muted">{row.actorRole || '-'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-bold ${actionClass(row.action)}`}>{actionLabels[row.action.toUpperCase()] || row.action}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-foreground">{entityLabels[row.entityType] || row.entityType}</div>
                      <div className="max-w-[220px] truncate text-xs text-muted">{row.entityLabel || row.entityId || '-'}</div>
                    </td>
                    <td className="px-4 py-3 min-w-[320px]">
                      <button type="button" onClick={() => setExpandedId(expanded ? null : row.id)} className="text-left font-medium text-foreground hover:text-primary">
                        {businessSummary(row)}
                      </button>
                      {expanded && (
                        <div className="mt-3 grid gap-3 lg:grid-cols-3">
                          <div>
                            <div className="mb-1 text-xs font-bold uppercase text-muted">{tr('Before', 'Oldin')}</div>
                            <pre className="max-h-72 overflow-auto rounded-md border border-border bg-background p-3 text-xs text-muted scroller-minimal">{jsonPreview(row.before)}</pre>
                          </div>
                          <div>
                            <div className="mb-1 text-xs font-bold uppercase text-muted">{tr('After', 'Keyin')}</div>
                            <pre className="max-h-72 overflow-auto rounded-md border border-border bg-background p-3 text-xs text-muted scroller-minimal">{jsonPreview(row.after)}</pre>
                          </div>
                          <div>
                            <div className="mb-1 text-xs font-bold uppercase text-muted">{tr('Metadata', 'Metadata')}</div>
                            <pre className="max-h-72 overflow-auto rounded-md border border-border bg-background p-3 text-xs text-muted scroller-minimal">{jsonPreview(row.metadata)}</pre>
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">{row.ipAddress || '-'}</td>
                  </tr>
                );
              })}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted">{tr('No audit records found.', 'Audit yozuv topilmadi.')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-40"
          >
            <ChevronLeft size={16} />
            {tr('Previous', 'Oldingi')}
          </button>
          <span className="text-sm text-muted">{meta.page} / {meta.totalPages}</span>
          <button
            type="button"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((value) => value + 1)}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-40"
          >
            {tr('Next', 'Keyingi')}
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
