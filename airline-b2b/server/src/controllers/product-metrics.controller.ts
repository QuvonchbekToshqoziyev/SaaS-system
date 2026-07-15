import { Request, Response } from 'express';
import { buildProductMetrics } from '../domains/monitoring/product-metrics';
import { writeAuditLog } from '../utils/audit';

export async function getProductMetrics(_req: Request, res: Response) {
  try {
    return res.json(await buildProductMetrics());
  } catch (error) {
    console.error('Failed to build product metrics:', error);
    return res.status(500).json({ error: 'Monitoring ma’lumotlarini yuklab bo‘lmadi' });
  }
}

export async function recordDataTransfer(req: Request, res: Response) {
  const action = String(req.body?.action || '').toUpperCase();
  const format = String(req.body?.format || '').toUpperCase();
  const source = String(req.body?.source || '').trim().slice(0, 100);
  if (!['IMPORT', 'EXPORT'].includes(action) || !['CSV', 'XLSX'].includes(format) || !source) {
    return res.status(400).json({ error: 'Invalid data transfer event' });
  }
  await writeAuditLog(req, {
    action,
    entityType: 'dataTransfer',
    entityLabel: source,
    summary: `${action} ${format}: ${source}`,
    metadata: { format, source },
  });
  return res.status(204).send();
}
