const express = require('express');
const router = express.Router();
const homeNavigationController = require('../controllers/homeNavigation.controller');
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

router.get('/list', noCache, adminAuth, homeNavigationController.adminList);
router.post('/list/created', noCache, adminAuth, homeNavigationController.adminCreate);
router.post('/list/update', noCache, adminAuth, homeNavigationController.adminUpdate);
router.put('/list/:id', noCache, adminAuth, homeNavigationController.adminUpdate);
router.post('/list/delete', noCache, adminAuth, homeNavigationController.adminDelete);
router.post('/list/dele', noCache, adminAuth, homeNavigationController.adminDelete);
router.delete('/list/:id', noCache, adminAuth, homeNavigationController.adminDelete);

module.exports = router;
