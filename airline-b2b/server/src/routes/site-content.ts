import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import { getLoginPageContent, updateLoginPageContent } from '../controllers/site-content.controller';

const router = Router();

router.get('/login-page', getLoginPageContent);
router.put('/login-page', authMiddleware, roleMiddleware(['SUPERADMIN']), updateLoginPageContent);

export default router;
