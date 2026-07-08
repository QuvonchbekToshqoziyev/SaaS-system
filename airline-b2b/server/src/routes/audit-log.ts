import { Router } from 'express';
import { listAuditLogs } from '../controllers/audit-log.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();

router.use(authMiddleware);
router.use(roleMiddleware(['SUPERADMIN']));

router.get('/', listAuditLogs);

export default router;
