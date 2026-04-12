import { Router } from 'express';
import { getFlightReport, getMonthlyReport } from '../controllers/reports.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);
router.get('/flight', getFlightReport);
router.get('/monthly', getMonthlyReport);
export default router;
