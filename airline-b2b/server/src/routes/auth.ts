import { Router } from 'express';
import {
  login,
  changePassword,
  createAdmin,
  deleteAdmin,
  deleteUser,
  listAdmins,
  listUsers,
  setUserFirmAccess,
  updateAdmin,
  updateUser,
} from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
const router = Router();
router.post('/login', login);
router.post('/change-password', authMiddleware, changePassword);
router.get('/users', authMiddleware, roleMiddleware(['SUPERADMIN', 'ADMIN']), listUsers);
router.patch('/users/:id', authMiddleware, roleMiddleware(['SUPERADMIN']), updateUser);
router.delete('/users/:id', authMiddleware, roleMiddleware(['SUPERADMIN']), deleteUser);
router.get('/admins', authMiddleware, roleMiddleware(['SUPERADMIN']), listAdmins);
router.post('/admins', authMiddleware, roleMiddleware(['SUPERADMIN']), createAdmin);
router.patch('/admins/:id', authMiddleware, roleMiddleware(['SUPERADMIN']), updateAdmin);
router.delete('/admins/:id', authMiddleware, roleMiddleware(['SUPERADMIN']), deleteAdmin);
router.patch('/users/:id/firm-access', authMiddleware, roleMiddleware(['SUPERADMIN']), setUserFirmAccess);
export default router;
