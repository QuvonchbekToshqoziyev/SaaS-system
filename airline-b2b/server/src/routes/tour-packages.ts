import { Router } from 'express';
import {
  createTourPackage,
  listTourCounterpartyFirms,
  listTourPackageSales,
  listTourPackages,
  sellTourPackage,
  listTourServices,
  listTourFlights,
  updateTourPackage,
  cancelTourPackage,
} from '../controllers/tour-packages.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();

router.use(authMiddleware);
router.get('/firms', listTourCounterpartyFirms);
router.get('/services', roleMiddleware(['FIRM']), listTourServices);
router.get('/flights', roleMiddleware(['FIRM']), listTourFlights);
router.get('/', listTourPackages);
router.post('/', roleMiddleware(['FIRM']), createTourPackage);
router.get('/sales', listTourPackageSales);
router.put('/:id', updateTourPackage);
router.post('/:id/cancel', cancelTourPackage);
router.post('/:id/sell', sellTourPackage);

export default router;
