import { Router } from 'express';
import { globalSearch } from '../controllers/search.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);
router.get('/', globalSearch);

export default router;
