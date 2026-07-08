import { Router } from 'express';
import { createEmployee, deleteEmployee, listEmployees, updateEmployee } from '../controllers/employees.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();

router.use(authMiddleware);
router.use(roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']));

router.get('/', listEmployees);
router.post('/', createEmployee);
router.patch('/:id', updateEmployee);
router.delete('/:id', deleteEmployee);

export default router;
