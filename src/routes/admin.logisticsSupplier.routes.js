const express = require('express');
const router = express.Router();
const logisticsSupplierController = require('../controllers/logisticsSupplier.controller');
const { adminAuth } = require('../middlewares/auth.middleware');

function noCache(req, res, next) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'Surrogate-Control': 'no-store'
  });
  next();
}

router.get('/list', noCache, adminAuth, logisticsSupplierController.adminList);
router.post('/list/created', noCache, adminAuth, logisticsSupplierController.adminCreate);
router.post('/list/update', noCache, adminAuth, logisticsSupplierController.adminUpdate);
router.put('/list/:id', noCache, adminAuth, logisticsSupplierController.adminUpdate);
router.post('/list/delete', noCache, adminAuth, logisticsSupplierController.adminDelete);
router.delete('/list/:id', noCache, adminAuth, logisticsSupplierController.adminDelete);

module.exports = router;
