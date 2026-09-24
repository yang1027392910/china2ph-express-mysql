const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');
const paymentController = require('../controllers/orderPayment.controller');
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

router.get('/list', noCache, adminAuth, orderController.adminList);
router.get('/detail', noCache, adminAuth, orderController.adminDetail);
router.get('/detail/:id', noCache, adminAuth, orderController.adminDetail);
router.put('/update', noCache, adminAuth, orderController.adminUpdate);
router.put('/update/:id', noCache, adminAuth, orderController.adminUpdate);
router.put('/item/update', noCache, adminAuth, orderController.adminItemUpdate);
router.put('/item/update/:id', noCache, adminAuth, orderController.adminItemUpdate);

router.put('/payment/approve', noCache, adminAuth, paymentController.approve);

module.exports = router;