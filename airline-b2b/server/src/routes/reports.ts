import { Router } from 'express';
import {
	getFlightReport,
	getMonthlyReport,
	getFirmReport,
	getPaymentsReport,
	getTransactionsReport,
	getInteractionsReport,
	getCalendarReport,
	getDashboardReport,
} from '../controllers/reports.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);
router.get('/flight', getFlightReport);
router.get('/firm', getFirmReport);
router.get('/payments', getPaymentsReport);
router.get('/transactions', getTransactionsReport);
router.get('/interactions', getInteractionsReport);
router.get('/monthly', getMonthlyReport);
router.get('/calendar', getCalendarReport);
router.get('/dashboard', getDashboardReport);
export default router;
