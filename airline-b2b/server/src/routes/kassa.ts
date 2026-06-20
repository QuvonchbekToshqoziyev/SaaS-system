import { Router } from 'express';
import { closeKassa, getKassaDay, getKassaHistory, openKassa } from '../controllers/kassa.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();
router.use(authMiddleware);
router.use(roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']));

router.get('/', getKassaDay);
router.get('/history', getKassaHistory);
router.post('/open', roleMiddleware(['SUPERADMIN', 'ADMIN']), openKassa);
router.post('/close', roleMiddleware(['SUPERADMIN', 'ADMIN']), closeKassa);

export default router;
