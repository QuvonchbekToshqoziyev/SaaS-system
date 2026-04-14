import { Router } from 'express';
import {
  getTickets,
  createTickets,
  allocateTicket,
  confirmAllocation,
  deallocateTicket,
  sellTicket,
  cancelSale,
  createSaleCancellationRequest,
  listSaleCancellationRequests,
  approveSaleCancellationRequest,
} from '../controllers/tickets.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();
router.use(authMiddleware);
router.get('/', getTickets);
router.post('/', roleMiddleware(['SUPERADMIN', 'ADMIN']), createTickets);
router.post('/allocate', roleMiddleware(['SUPERADMIN', 'ADMIN']), allocateTicket);
router.post('/confirm', roleMiddleware(['FIRM']), confirmAllocation);
router.post('/deallocate', roleMiddleware(['SUPERADMIN', 'ADMIN']), deallocateTicket);
router.post('/sell', sellTicket); // Firms can sell their assigned tickets
router.post('/cancel-sale', roleMiddleware(['SUPERADMIN', 'ADMIN']), cancelSale);
router.get('/cancel-sale-requests', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), listSaleCancellationRequests);
router.post('/cancel-sale-requests', roleMiddleware(['FIRM']), createSaleCancellationRequest);
router.post('/cancel-sale-requests/approve', roleMiddleware(['SUPERADMIN', 'ADMIN']), approveSaleCancellationRequest);
export default router;
