import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import { getFirmById, listFirms } from '../controllers/firms.controller';

const router = Router();

router.use(authMiddleware);

router.get('/', roleMiddleware(['SUPERADMIN', 'ADMIN']), listFirms);
router.get('/:id', getFirmById);

export default router;
