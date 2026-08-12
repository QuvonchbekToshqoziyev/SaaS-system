import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import { createAccount, deleteAccount, listAccounts, updateAccount } from '../controllers/accounts.controller';

const router = Router();
router.use(authMiddleware, roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']));
router.get('/', listAccounts);
router.post('/', createAccount);
router.patch('/:id', updateAccount);
router.delete('/:id', deleteAccount);
export default router;
