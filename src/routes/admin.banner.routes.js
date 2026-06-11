const express = require('express');
const router = express.Router();
const bannerController = require('../controllers/banner.controller');
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

router.get('/list', noCache, adminAuth, bannerController.adminList);
router.post('/list/created', noCache, adminAuth, bannerController.adminCreate);
router.post('/list/dele', noCache, adminAuth, bannerController.adminDelete);
router.delete('/list/dele/:id', noCache, adminAuth, bannerController.adminDelete);

module.exports = router;
