const express = require('express');
const router = express.Router();
const userVerificationController = require('../controllers/userVerification.controller');
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

router.get('/list', noCache, adminAuth, userVerificationController.adminList);
router.post('/:id/approve', noCache, adminAuth, userVerificationController.adminApprove);
router.post('/:id/reject', noCache, adminAuth, userVerificationController.adminReject);

module.exports = router;
