import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import { createFirm, deleteFirm, getFirmById, listFirms, updateFirm } from '../controllers/firms.controller';

const router = Router();

router.use(authMiddleware);

router.get('/', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), listFirms);
router.post('/', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), createFirm);
router.patch('/:id', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), updateFirm);
router.delete('/:id', roleMiddleware(['SUPERADMIN']), deleteFirm);
router.get('/:id', getFirmById);

export default router;
