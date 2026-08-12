import { Router } from 'express';
import { createAccountTransaction, createDirectedTransaction, createManualCashTransaction, deleteOwnDailyCashTransaction, deleteTransaction, getTransactions, getTransactionById, importHistoricalKassaTransactions, updateOwnDailyCashTransaction } from '../controllers/transactions.controller';
import { createFinancialTransaction, previewFinancialTransaction, reverseFinancialTransaction } from '../controllers/financial-transactions.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();
router.use(authMiddleware);
router.get('/', getTransactions);
router.post('/', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), createDirectedTransaction);
router.post('/cash', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), createManualCashTransaction);
router.post('/account', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), createAccountTransaction);
router.post('/finance/preview', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), previewFinancialTransaction);
router.post('/finance', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), createFinancialTransaction);
router.post('/:id/reversal', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), reverseFinancialTransaction);
router.post('/import/historical-kassa', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), importHistoricalKassaTransactions);
router.patch('/:id/daily-cash', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), updateOwnDailyCashTransaction);
router.delete('/:id/daily-cash', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), deleteOwnDailyCashTransaction);
router.delete('/:id', roleMiddleware(['SUPERADMIN', 'FIRM']), deleteTransaction);
router.get('/:id', getTransactionById);

export default router;
