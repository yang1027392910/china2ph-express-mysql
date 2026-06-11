const express = require('express');
const router = express.Router();
const favoriteController = require('../controllers/favorite.controller');
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

router.post('/click', noCache, auth, favoriteController.click);
router.get('/list', noCache, auth, favoriteController.list);

module.exports = router;
