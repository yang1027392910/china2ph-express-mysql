const express = require('express');
const router = express.Router();
const productController = require('../controllers/product.controller');
const { optionalAuth } = require('../middlewares/auth.middleware');

function noCache(req, res, next) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'Surrogate-Control': 'no-store'
  });
  next();
}

router.get('/list', noCache, optionalAuth, productController.h5ProductList);
router.get('/search', noCache, productController.h5ProductSearch);
router.get('/detail/:id', noCache, optionalAuth, productController.h5ProductDetail);

module.exports = router;
