const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');
const { auth } = require('../middlewares/auth.middleware');

function noCache(req, res, next) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'Surrogate-Control': 'no-store'
  });
  next();
}

router.post('/create', noCache, auth, orderController.create);
router.get('/list', noCache, auth, orderController.list);
router.get('/detail', noCache, auth, orderController.detail);
router.get('/detail/:id', noCache, auth, orderController.detail);

module.exports = router;