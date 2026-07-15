import { Router } from 'express';
import {
  getTickets,
  createTickets,
  deallocateTicket,
  createSaleCancellationRequest,
  listSaleCancellationRequests,
  approveSaleCancellationRequest,
  listAllocationTargets,
  listTicketAllocations,
  createAllocationChangeRequest,
  listAllocationChangeRequests,
  approveAllocationChangeRequest,
  rejectAllocationChangeRequest,
} from '../controllers/tickets.controller';
import {
  allocateTicketLegs,
  cancelTicketLegSale,
  confirmTicketLegAllocation,
  rejectTicketLegAllocation,
  sellTicketLegs,
} from '../controllers/ticket-legs.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();
router.use(authMiddleware);
router.get('/', getTickets);
router.get('/allocation-targets', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), listAllocationTargets);
router.get('/allocations', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), listTicketAllocations);
router.get('/allocation-change-requests', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), listAllocationChangeRequests);
router.post('/allocations/:id/change-requests', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), createAllocationChangeRequest);
router.post('/allocation-change-requests/:id/approve', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), approveAllocationChangeRequest);
router.post('/allocation-change-requests/:id/reject', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), rejectAllocationChangeRequest);
router.post('/', roleMiddleware(['FIRM']), createTickets);
router.post('/allocate', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), allocateTicketLegs);
router.post('/confirm', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), confirmTicketLegAllocation);
router.post('/reject', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), rejectTicketLegAllocation);
router.post('/deallocate', roleMiddleware(['SUPERADMIN', 'ADMIN']), deallocateTicket);
router.post('/sell', sellTicketLegs);
router.post('/cancel-sale', roleMiddleware(['SUPERADMIN', 'ADMIN']), cancelTicketLegSale);
router.get('/cancel-sale-requests', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), listSaleCancellationRequests);
router.post('/cancel-sale-requests', roleMiddleware(['FIRM']), createSaleCancellationRequest);
router.post('/cancel-sale-requests/approve', roleMiddleware(['SUPERADMIN', 'ADMIN']), approveSaleCancellationRequest);
export default router;
