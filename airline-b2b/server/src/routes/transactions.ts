import { Router } from 'express';
import { createDirectedTransaction, getTransactions, getTransactionById } from '../controllers/transactions.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);
router.get('/', getTransactions);
router.post('/', createDirectedTransaction);
router.get('/:id', getTransactionById);

export default router;
