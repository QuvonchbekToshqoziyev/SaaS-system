import { Router } from 'express';
import { createFlight, deleteFlight, getAllFlights, getFlightById, updateFlight } from '../controllers/flights.controller';
import { authMiddleware as isAuthenticated } from '../middleware/auth';
import { roleMiddleware as hasRole } from '../middleware/role';

const router = Router();

// RBAC: Superadmin can see all, Firm users see their own (logic in controller)
router.get('/', isAuthenticated, getAllFlights);
router.get('/:id', isAuthenticated, getFlightById);

// RBAC: Superadmin keeps controller rights; admins can create flights during beta operations.
router.post('/', isAuthenticated, hasRole(['SUPERADMIN', 'ADMIN']), createFlight);
router.put('/:id', isAuthenticated, hasRole(['SUPERADMIN']), updateFlight);
router.delete('/:id', isAuthenticated, hasRole(['SUPERADMIN']), deleteFlight);

export default router;
