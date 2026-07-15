import { Router } from 'express';
import { createFlight, deleteFlight, getAllFlights, getFlightById, updateFlight } from '../controllers/flights.controller';
import { authMiddleware as isAuthenticated } from '../middleware/auth';
import { roleMiddleware as hasRole } from '../middleware/role';

const router = Router();

// RBAC: Superadmin can see all, Firm users see their own (logic in controller)
router.get('/', isAuthenticated, getAllFlights);
router.get('/:id', isAuthenticated, getFlightById);

// Firm accounts create flights and manage their own ticket inventory.
router.post('/', isAuthenticated, hasRole(['FIRM']), createFlight);
router.put('/:id', isAuthenticated, hasRole(['SUPERADMIN', 'ADMIN', 'FIRM']), updateFlight);
router.delete('/:id', isAuthenticated, hasRole(['SUPERADMIN', 'ADMIN', 'FIRM']), deleteFlight);

export default router;
