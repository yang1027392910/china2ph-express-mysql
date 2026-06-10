const express = require('express');
const router = express.Router();
const hotProductController = require('../controllers/hotProduct.controller');
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

router.get('/list', noCache, adminAuth, hotProductController.adminList);
router.post('/list/created', noCache, adminAuth, hotProductController.adminCreate);
router.post('/list/update', noCache, adminAuth, hotProductController.adminUpdate);
router.put('/list/:id', noCache, adminAuth, hotProductController.adminUpdate);
router.post('/list/delete', noCache, adminAuth, hotProductController.adminDelete);
router.delete('/list/:id', noCache, adminAuth, hotProductController.adminDelete);

module.exports = router;
