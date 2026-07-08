import { Router } from 'express';
import { processPayment } from '../controllers/payments.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import { deleteRecord, updateRecord } from '../controllers/maintenance.controller';

const router = Router();
router.use(authMiddleware);
router.post('/', roleMiddleware(['SUPERADMIN', 'ADMIN']), processPayment);
router.patch('/:id', roleMiddleware(['SUPERADMIN']), (req, res) => {
  req.params.model = 'payment';
  return updateRecord(req, res);
});
router.delete('/:id', roleMiddleware(['SUPERADMIN']), (req, res) => {
  req.params.model = 'payment';
  return deleteRecord(req, res);
});
export default router;
