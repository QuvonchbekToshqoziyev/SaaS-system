import { Router } from 'express';
import { login, changePassword, listUsers } from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
const router = Router();
router.post('/login', login);
router.post('/change-password', authMiddleware, changePassword);
router.get('/users', authMiddleware, roleMiddleware(['SUPERADMIN', 'ADMIN']), listUsers);
export default router;
