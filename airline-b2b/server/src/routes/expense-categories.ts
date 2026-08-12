import { Router } from 'express';
import { createExpenseCategory, deleteExpenseCategory, listExpenseCategories, updateExpenseCategory } from '../controllers/expense-categories.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();
router.use(authMiddleware, roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']));
router.get('/', listExpenseCategories);
router.post('/', createExpenseCategory);
router.patch('/:id', updateExpenseCategory);
router.delete('/:id', deleteExpenseCategory);
export default router;
