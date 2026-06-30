import { Router } from 'express';
import {
  createTourPackage,
  listTourCounterpartyFirms,
  listTourPackageSales,
  listTourPackages,
  sellTourPackage,
} from '../controllers/tour-packages.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);
router.get('/firms', listTourCounterpartyFirms);
router.get('/', listTourPackages);
router.post('/', createTourPackage);
router.get('/sales', listTourPackageSales);
router.post('/:id/sell', sellTourPackage);

export default router;
