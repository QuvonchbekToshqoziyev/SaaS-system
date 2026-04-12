import { Router } from 'express';
import { getTransactions, getTransactionById } from '../controllers/transactions.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);
router.get('/', getTransactions);
router.get('/:id', getTransactionById);

export default router;
