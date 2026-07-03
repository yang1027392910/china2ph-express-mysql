const express = require('express');
const router = express.Router();
const homeController = require('../controllers/home.controller');
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

router.get('/category-products', noCache, optionalAuth, homeController.categoryProducts);

module.exports = router;
