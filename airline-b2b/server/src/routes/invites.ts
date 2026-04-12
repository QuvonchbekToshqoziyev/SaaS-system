import { Router } from 'express';
import { createInvite, acceptInvite } from '../controllers/invites.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();
router.post('/', authMiddleware, roleMiddleware(['SUPERADMIN', 'ADMIN']), createInvite);
router.post('/accept', acceptInvite);
export default router;
