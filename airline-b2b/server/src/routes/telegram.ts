import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { createLink, disconnectTelegram, setTelegramEnabled, telegramStatus } from '../controllers/telegram.controller';

const router = Router();
router.use(authMiddleware);
router.get('/status', telegramStatus);
router.post('/link', createLink);
router.patch('/preferences', setTelegramEnabled);
router.delete('/connection', disconnectTelegram);
export default router;
