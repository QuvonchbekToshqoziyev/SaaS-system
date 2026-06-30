import { Router } from 'express';
import { processPayment } from '../controllers/payments.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();
router.use(authMiddleware);
router.post('/', roleMiddleware(['SUPERADMIN', 'ADMIN']), processPayment);
export default router;
