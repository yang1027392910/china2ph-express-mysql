const express = require('express');
const router = express.Router();
const emailCodeLogController = require('../controllers/emailCodeLog.controller');
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

router.get('/list', noCache, adminAuth, emailCodeLogController.adminList);
router.get('/detail/:id', noCache, adminAuth, emailCodeLogController.adminDetail);
router.post('/list/dele', noCache, adminAuth, emailCodeLogController.adminDelete);
router.delete('/list/dele/:id', noCache, adminAuth, emailCodeLogController.adminDelete);

module.exports = router;
