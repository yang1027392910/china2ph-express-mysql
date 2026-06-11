const express = require('express');
const router = express.Router();
const procurementContactController = require('../controllers/procurementContact.controller');

function noCache(req, res, next) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'Surrogate-Control': 'no-store'
  });
  next();
}

router.get('/list', noCache, procurementContactController.h5List);

module.exports = router;
