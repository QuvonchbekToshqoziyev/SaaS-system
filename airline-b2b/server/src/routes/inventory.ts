import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import {
  applyInventoryDocument,
  createInventoryPartner,
  createInventoryProduct,
  updateInventoryProduct,
  deactivateInventoryProduct,
  createInventoryCategory,
  updateInventoryCategory,
  deactivateInventoryCategory,
  createInventoryUnit,
  updateInventoryUnit,
  deactivateInventoryUnit,
  getInventoryBootstrap,
  getInventoryDashboard,
  getInventoryStock,
  getInventoryReport,
  listInventoryDocuments,
  listInventoryPartners,
  listInventoryProducts,
  listInventoryReservations,
  createInventoryReservation,
  cancelInventoryDocument,
  releaseInventoryReservation,
} from '../controllers/inventory.controller';

const router = Router();
router.use(authMiddleware, roleMiddleware(['SUPERADMIN', 'ADMIN', 'FIRM']));
router.get('/bootstrap', getInventoryBootstrap);
router.get('/dashboard', getInventoryDashboard);
router.get('/products', listInventoryProducts);
router.post('/products', createInventoryProduct);
router.patch('/products/:id', updateInventoryProduct);
router.delete('/products/:id', deactivateInventoryProduct);
router.post('/categories', createInventoryCategory);
router.patch('/categories/:id', updateInventoryCategory);
router.delete('/categories/:id', deactivateInventoryCategory);
router.post('/units', createInventoryUnit);
router.patch('/units/:id', updateInventoryUnit);
router.delete('/units/:id', deactivateInventoryUnit);
router.get('/stock', getInventoryStock);
router.get('/reports', getInventoryReport);
router.get('/documents', listInventoryDocuments);
router.post('/documents/apply', applyInventoryDocument);
router.post('/documents/:id/cancel', cancelInventoryDocument);
router.get('/reservations', listInventoryReservations);
router.post('/reservations', createInventoryReservation);
router.post('/reservations/:id/release', releaseInventoryReservation);
router.get('/:kind', listInventoryPartners);
router.post('/:kind', createInventoryPartner);

export default router;
