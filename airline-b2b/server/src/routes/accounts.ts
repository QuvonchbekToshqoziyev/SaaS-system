import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import { createAccount, listAccounts } from '../controllers/accounts.controller';

const router = Router();
router.use(authMiddleware, roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']));
router.get('/', listAccounts);
router.post('/', createAccount);
export default router;
