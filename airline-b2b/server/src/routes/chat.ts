import { Router } from 'express';
import {
  createConversation,
  deleteMessage,
  editMessage,
  getFirmChatSettings,
  listChatUsers,
  listConversations,
  listMessages,
  markConversationRead,
  sendMessage,
  setFirmChatPermission,
} from '../controllers/chat.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();

router.use(authMiddleware);
router.use(roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']));

router.get('/conversations', listConversations);
router.post('/conversations', createConversation);
router.get('/users', listChatUsers);
router.get('/firm-settings', roleMiddleware(['SUPERADMIN']), getFirmChatSettings);
router.put('/firm-settings', roleMiddleware(['SUPERADMIN']), setFirmChatPermission);
router.get('/conversations/:conversationId/messages', listMessages);
router.post('/conversations/:conversationId/messages', sendMessage);
router.post('/conversations/:conversationId/read', markConversationRead);
router.patch('/messages/:messageId', editMessage);
router.delete('/messages/:messageId', deleteMessage);

export default router;
