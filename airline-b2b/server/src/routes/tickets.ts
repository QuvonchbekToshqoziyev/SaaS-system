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
import { deleteRecord, updateRecord } from '../controllers/maintenance.controller';

const router = Router();
router.use(authMiddleware);
router.get('/', getTickets);
router.post('/', roleMiddleware(['FIRM']), createTickets);
router.post('/allocate', roleMiddleware(['FIRM']), allocateTicket);
router.post('/confirm', roleMiddleware(['FIRM']), confirmAllocation);
router.post('/deallocate', roleMiddleware(['SUPERADMIN', 'ADMIN']), deallocateTicket);
router.post('/sell', sellTicket); // Firms can sell their assigned tickets
router.post('/cancel-sale', roleMiddleware(['SUPERADMIN', 'ADMIN']), cancelSale);
router.get('/cancel-sale-requests', roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']), listSaleCancellationRequests);
router.post('/cancel-sale-requests', roleMiddleware(['FIRM']), createSaleCancellationRequest);
router.post('/cancel-sale-requests/approve', roleMiddleware(['SUPERADMIN', 'ADMIN']), approveSaleCancellationRequest);
router.patch('/:id', roleMiddleware(['SUPERADMIN']), (req, res) => {
  req.params.model = 'ticket';
  return updateRecord(req, res);
});
router.delete('/:id', roleMiddleware(['SUPERADMIN']), (req, res) => {
  req.params.model = 'ticket';
  return deleteRecord(req, res);
});
export default router;
