const express = require('express');
const router = express.Router();
const supplierController = require('../controllers/supplier.controller');
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

router.get('/list', noCache, adminAuth, supplierController.adminList);
router.post('/list/created', noCache, adminAuth, supplierController.adminCreate);
router.post('/list/update', noCache, adminAuth, supplierController.adminUpdate);
router.put('/list/:id', noCache, adminAuth, supplierController.adminUpdate);
router.put('/list/update/:id', noCache, adminAuth, supplierController.adminUpdate);
router.post('/list/delete', noCache, adminAuth, supplierController.adminDelete);
router.post('/list/dele', noCache, adminAuth, supplierController.adminDelete);
router.delete('/list/:id', noCache, adminAuth, supplierController.adminDelete);
router.delete('/list/dele/:id', noCache, adminAuth, supplierController.adminDelete);

module.exports = router;
