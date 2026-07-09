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
	getCashFlowAnalyticsReport,
	getFinancialAnalytics,
	getFinancialHealthReport,
	getFlightProfitabilityReport,
	getPayablesAnalyticsReport,
	getProfitabilityAnalyticsReport,
	getReceivablesAnalyticsReport,
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
router.get('/analytics', getFinancialAnalytics);
router.get('/financial-health', getFinancialHealthReport);
router.get('/profitability', getProfitabilityAnalyticsReport);
router.get('/cash-flow', getCashFlowAnalyticsReport);
router.get('/receivables', getReceivablesAnalyticsReport);
router.get('/payables', getPayablesAnalyticsReport);
router.get('/flight-profitability', getFlightProfitabilityReport);
export default router;
