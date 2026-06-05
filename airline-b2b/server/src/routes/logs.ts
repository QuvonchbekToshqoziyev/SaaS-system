import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import { listErrorLogs, resolveErrorLog } from '../controllers/logs.controller';

const router = Router();

router.use(authMiddleware);
router.use(roleMiddleware(['SUPERADMIN']));

router.get('/errors', listErrorLogs);
router.post('/errors/:id/resolve', resolveErrorLog);

export default router;
