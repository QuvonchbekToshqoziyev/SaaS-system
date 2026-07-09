import { Router } from 'express';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '../controllers/notifications.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);
router.get('/', listNotifications);
router.post('/read-all', markAllNotificationsRead);
router.post('/:id/read', markNotificationRead);

export default router;
