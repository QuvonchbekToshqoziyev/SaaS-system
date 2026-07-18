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
	getAgentLedgerReport,
	getFinancialHealthReport,
	getFlightProfitabilityReport,
	getPayablesAnalyticsReport,
	getProfitabilityAnalyticsReport,
	getReceivablesAnalyticsReport,
	reconcileFlightInventory,
} from '../controllers/reports.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import { getProductMetrics, recordDataTransfer } from '../controllers/product-metrics.controller';

const router = Router();
router.use(authMiddleware);
router.get('/flight', getFlightReport);
router.post('/flight/reconcile', reconcileFlightInventory);
router.get('/firm', getFirmReport);
router.get('/payments', getPaymentsReport);
router.get('/transactions', getTransactionsReport);
router.get('/interactions', roleMiddleware(['SUPERADMIN']), getInteractionsReport);
router.get('/monthly', getMonthlyReport);
router.get('/calendar', getCalendarReport);
router.get('/dashboard', getDashboardReport);
router.get('/analytics', getFinancialAnalytics);
router.get('/agents', getAgentLedgerReport);
router.get('/financial-health', getFinancialHealthReport);
router.get('/profitability', getProfitabilityAnalyticsReport);
router.get('/cash-flow', getCashFlowAnalyticsReport);
router.get('/receivables', getReceivablesAnalyticsReport);
router.get('/payables', getPayablesAnalyticsReport);
router.get('/flight-profitability', getFlightProfitabilityReport);
router.get('/product-metrics', roleMiddleware(['SUPERADMIN']), getProductMetrics);
router.post('/data-transfer-event', recordDataTransfer);
export default router;
