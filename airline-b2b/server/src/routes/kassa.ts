import { Router } from 'express';
import { closeKassa, createKassaDesk, createKassaTransfer, createPaymentCard, deletePaymentCard, getKassaDay, getKassaHistory, listKassaDesks, listPaymentCards, openKassa, reopenKassa, updateKassaDesk, updatePaymentCard } from '../controllers/kassa.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();
router.use(authMiddleware);
router.use(roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']));

router.get('/', getKassaDay);
router.get('/history', getKassaHistory);
router.get('/desks', listKassaDesks);
router.get('/cards', listPaymentCards);
router.post('/desks', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), createKassaDesk);
router.patch('/desks/:id', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), updateKassaDesk);
router.post('/cards', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), createPaymentCard);
router.patch('/cards/:id', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), updatePaymentCard);
router.delete('/cards/:id', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), deletePaymentCard);
router.post('/transfers', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), createKassaTransfer);
router.post('/open', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), openKassa);
router.post('/close', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), closeKassa);
router.post('/reopen', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), reopenKassa);

export default router;
