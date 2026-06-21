const express = require('express');
const router = express.Router();
const userVerificationController = require('../controllers/h5UserVerification.controller');
const { auth } = require('../middlewares/auth.middleware');

router.get('/detail', auth, userVerificationController.detail);

module.exports = router;
