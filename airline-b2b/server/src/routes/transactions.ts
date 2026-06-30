import { Router } from 'express';
import { createDirectedTransaction, getTransactions, getTransactionById } from '../controllers/transactions.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();
router.use(authMiddleware);
router.get('/', getTransactions);
router.post('/', roleMiddleware(['SUPERADMIN', 'ADMIN']), createDirectedTransaction);
router.get('/:id', getTransactionById);

export default router;
