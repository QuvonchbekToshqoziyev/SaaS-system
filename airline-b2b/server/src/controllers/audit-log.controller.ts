import { Request, Response } from 'express';
import { listAuditLogsService } from '../services/audit-log.service';

export const listAuditLogs = async (req: Request, res: Response) => {
  try {
    const result = await listAuditLogsService({
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
      action: req.query.action,
      entityType: req.query.entityType,
      since: req.query.since,
    });
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to list audit logs' });
  }
};
