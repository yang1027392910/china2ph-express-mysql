const express = require('express');
const router = express.Router();
const iconLibraryController = require('../controllers/iconLibrary.controller');
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

router.get('/list', noCache, adminAuth, iconLibraryController.adminList);
router.post('/list/created', noCache, adminAuth, iconLibraryController.adminCreate);
router.post('/list/delete', noCache, adminAuth, iconLibraryController.adminDelete);
router.post('/list/dele', noCache, adminAuth, iconLibraryController.adminDelete);
router.delete('/list/:id', noCache, adminAuth, iconLibraryController.adminDelete);

module.exports = router;
