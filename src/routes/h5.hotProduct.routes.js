const express = require('express');
const router = express.Router();
const hotProductController = require('../controllers/hotProduct.controller');

function noCache(req, res, next) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'Surrogate-Control': 'no-store'
  });
  next();
}

router.get('/list', noCache, hotProductController.h5List);

module.exports = router;
