import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import { createCurrencyRate, listCurrencyRates } from '../controllers/currency-rates.controller';

const router = Router();
router.use(authMiddleware);

router.get('/', listCurrencyRates);
router.post('/', roleMiddleware(['SUPERADMIN', 'ADMIN']), createCurrencyRate);

export default router;
