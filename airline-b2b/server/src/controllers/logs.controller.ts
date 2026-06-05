import { Request, Response } from 'express';
import { errorRegistry } from '../observability/error-registry';

function normalizeStatus(value: unknown): 'OPEN' | 'RESOLVED' | 'ALL' {
  const v = String(value || '').trim().toUpperCase();
  if (v === 'RESOLVED') return 'RESOLVED';
  if (v === 'ALL') return 'ALL';
  return 'OPEN';
}

export const listErrorLogs = async (req: Request, res: Response) => {
  const status = normalizeStatus((req.query as any)?.status);
  return res.json({
    counts: errorRegistry.counts(),
    status,
    errors: errorRegistry.list(status),
  });
};

export const resolveErrorLog = async (req: Request, res: Response) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id is required' });

  const noteRaw = (req.body as any)?.note;
  const note = typeof noteRaw === 'string' ? noteRaw.trim() : '';

  const actor = (req as any).user as { userId?: string; role?: string } | undefined;

  const updated = errorRegistry.resolve(id, {
    note: note || undefined,
    resolvedByUserId: actor?.userId,
    resolvedByRole: actor?.role,
  });

  if (!updated) return res.status(404).json({ error: 'Not found' });
  return res.json(updated);
};
