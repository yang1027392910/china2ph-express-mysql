const express = require('express');
const router = express.Router();
const productController = require('../controllers/product.controller');
const permissionController = require('../controllers/productContactPermission.controller');
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

router.get('/list', noCache, adminAuth, productController.adminProductList);
router.post('/ai-generate', noCache, adminAuth, productController.adminProductAiGenerate);
router.post('/list/created', noCache, adminAuth, productController.adminProductCreate);
router.post('/list/update', noCache, adminAuth, productController.adminProductUpdate);
router.post('/list/delete', noCache, adminAuth, productController.adminProductDelete);
router.post('/list/dele', noCache, adminAuth, productController.adminProductDelete);
router.put('/list/:id', noCache, adminAuth, productController.adminProductUpdate);
router.delete('/list/:id', noCache, adminAuth, productController.adminProductDelete);
router.get('/:id/contact-permission', noCache, adminAuth, permissionController.adminList);
router.post('/:id/contact-permission', noCache, adminAuth, permissionController.adminAdd);
router.delete('/:id/contact-permission/:userId', noCache, adminAuth, permissionController.adminDelete);

module.exports = router;
