const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
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

router.get('/list', noCache, adminAuth, userController.adminList);
router.get('/detail/:id', noCache, adminAuth, userController.adminDetail);
router.post('/list/created', noCache, adminAuth, userController.adminCreate);
router.post('/list/update', noCache, adminAuth, userController.adminUpdate);
router.put('/list/update/:id', noCache, adminAuth, userController.adminUpdate);
router.post('/list/status', noCache, adminAuth, userController.adminUpdateStatus);
router.patch('/list/status/:id', noCache, adminAuth, userController.adminUpdateStatus);
router.post('/list/dele', noCache, adminAuth, userController.adminDelete);
router.delete('/list/dele/:id', noCache, adminAuth, userController.adminDelete);

module.exports = router;
