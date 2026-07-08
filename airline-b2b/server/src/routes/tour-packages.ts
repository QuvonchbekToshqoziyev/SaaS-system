import { Router } from 'express';
import {
  createTourPackage,
  listTourCounterpartyFirms,
  listTourPackageSales,
  listTourPackages,
  sellTourPackage,
} from '../controllers/tour-packages.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import { deleteRecord, updateRecord } from '../controllers/maintenance.controller';

const router = Router();

router.use(authMiddleware);
router.get('/firms', listTourCounterpartyFirms);
router.get('/', listTourPackages);
router.post('/', roleMiddleware(['FIRM']), createTourPackage);
router.get('/sales', listTourPackageSales);
router.patch('/sales/:id', roleMiddleware(['SUPERADMIN']), (req, res) => {
  req.params.model = 'tourPackageSale';
  return updateRecord(req, res);
});
router.delete('/sales/:id', roleMiddleware(['SUPERADMIN']), (req, res) => {
  req.params.model = 'tourPackageSale';
  return deleteRecord(req, res);
});
router.post('/:id/sell', sellTourPackage);
router.patch('/:id', roleMiddleware(['SUPERADMIN']), (req, res) => {
  req.params.model = 'tourPackage';
  return updateRecord(req, res);
});
router.delete('/:id', roleMiddleware(['SUPERADMIN']), (req, res) => {
  req.params.model = 'tourPackage';
  return deleteRecord(req, res);
});

export default router;
