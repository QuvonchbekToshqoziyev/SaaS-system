import { Router } from 'express';
import { createEmployee, deleteEmployee, getEmployeeSalaryHistory, listEmployees, updateEmployee } from '../controllers/employees.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();

router.use(authMiddleware);
router.use(roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']));

router.get('/', listEmployees);
router.get('/:id/salary-history', getEmployeeSalaryHistory);
router.post('/', createEmployee);
router.patch('/:id', updateEmployee);
router.delete('/:id', deleteEmployee);

export default router;
