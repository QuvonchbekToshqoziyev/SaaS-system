import { Router } from 'express';
import { closeKassa, createKassaDesk, createPaymentCard, getKassaDay, getKassaHistory, listKassaDesks, listPaymentCards, openKassa, reopenKassa } from '../controllers/kassa.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();
router.use(authMiddleware);
router.use(roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']));

router.get('/', getKassaDay);
router.get('/history', getKassaHistory);
router.get('/desks', listKassaDesks);
router.get('/cards', listPaymentCards);
router.post('/desks', roleMiddleware(['SUPERADMIN', 'ADMIN']), createKassaDesk);
router.post('/cards', roleMiddleware(['SUPERADMIN', 'ADMIN']), createPaymentCard);
router.post('/open', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), openKassa);
router.post('/close', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), closeKassa);
router.post('/reopen', roleMiddleware(['SUPERADMIN']), reopenKassa);

export default router;
