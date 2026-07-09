import { Router } from 'express';
import { createAirline, listAirlineFirmConnections, listAirlines, upsertAirlineFirmConnection } from '../controllers/airlines.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();

router.use(authMiddleware);
router.get('/', listAirlines);
router.post('/', roleMiddleware(['SUPERADMIN']), createAirline);
router.get('/connections', roleMiddleware(['SUPERADMIN', 'ADMIN']), listAirlineFirmConnections);
router.post('/connections', roleMiddleware(['SUPERADMIN']), upsertAirlineFirmConnection);

export default router;
