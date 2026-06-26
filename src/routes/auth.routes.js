const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

router.post('/send-email-code', authController.sendEmailCode);

module.exports = router;
