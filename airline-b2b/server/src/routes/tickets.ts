import { Router } from 'express';
import { getTickets, createTickets, allocateTicket, sellTicket } from '../controllers/tickets.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();
router.use(authMiddleware);
router.get('/', getTickets);
router.post('/', roleMiddleware(['SUPERADMIN', 'ADMIN']), createTickets);
router.post('/allocate', roleMiddleware(['SUPERADMIN', 'ADMIN']), allocateTicket);
router.post('/sell', sellTicket); // Firms can sell their assigned tickets
export default router;
