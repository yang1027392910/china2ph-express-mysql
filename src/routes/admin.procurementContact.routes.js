const express = require('express');
const router = express.Router();
const procurementContactController = require('../controllers/procurementContact.controller');
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

router.get('/list', noCache, adminAuth, procurementContactController.adminList);
router.post('/create', noCache, adminAuth, procurementContactController.adminCreate);
router.put('/update', noCache, adminAuth, procurementContactController.adminUpdate);
router.delete('/delete/:id', noCache, adminAuth, procurementContactController.adminDelete);

module.exports = router;
