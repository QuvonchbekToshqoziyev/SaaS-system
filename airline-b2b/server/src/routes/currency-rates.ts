import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import { createCurrencyRate, listCurrencyRates } from '../controllers/currency-rates.controller';
import { deleteRecord, updateRecord } from '../controllers/maintenance.controller';

const router = Router();
router.use(authMiddleware);

router.get('/', listCurrencyRates);
router.post('/', roleMiddleware(['SUPERADMIN', 'ADMIN']), createCurrencyRate);
router.patch('/:id', roleMiddleware(['SUPERADMIN']), (req, res) => {
  req.params.model = 'currencyRate';
  return updateRecord(req, res);
});
router.delete('/:id', roleMiddleware(['SUPERADMIN']), (req, res) => {
  req.params.model = 'currencyRate';
  return deleteRecord(req, res);
});

export default router;
