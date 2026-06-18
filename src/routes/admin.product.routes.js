const express = require('express');
const router = express.Router();
const productController = require('../controllers/product.controller');
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
router.post('/list/created', noCache, adminAuth, productController.adminProductCreate);
router.post('/list/update', noCache, adminAuth, productController.adminProductUpdate);
router.put('/list/:id', noCache, adminAuth, productController.adminProductUpdate);

module.exports = router;
