import { Router } from 'express';
import { deleteRecord, updateRecord } from '../controllers/maintenance.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();

router.use(authMiddleware);
router.use(roleMiddleware(['SUPERADMIN']));

router.patch('/records/:model/:id', updateRecord);
router.delete('/records/:model/:id', deleteRecord);

export default router;
