import { Router } from 'express';
import { createExpenseBudget, deactivateExpenseBudget, listExpenseBudgets } from '../controllers/expense-budgets.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();
router.use(authMiddleware, roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']));
router.get('/', listExpenseBudgets);
router.post('/', createExpenseBudget);
router.delete('/:id', deactivateExpenseBudget);
export default router;
