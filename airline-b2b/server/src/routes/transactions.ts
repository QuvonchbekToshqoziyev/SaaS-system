import { Router } from 'express';
import { createDirectedTransaction, createManualCashTransaction, getTransactions, getTransactionById } from '../controllers/transactions.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import { deleteRecord, updateRecord } from '../controllers/maintenance.controller';

const router = Router();
router.use(authMiddleware);
router.get('/', getTransactions);
router.post('/', roleMiddleware(['SUPERADMIN', 'ADMIN']), createDirectedTransaction);
router.post('/cash', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), createManualCashTransaction);
router.patch('/:id', roleMiddleware(['SUPERADMIN']), (req, res) => {
  req.params.model = 'transaction';
  return updateRecord(req, res);
});
router.delete('/:id', roleMiddleware(['SUPERADMIN']), (req, res) => {
  req.params.model = 'transaction';
  return deleteRecord(req, res);
});
router.get('/:id', getTransactionById);

export default router;
