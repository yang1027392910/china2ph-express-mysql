const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

router.post('/login', authController.h5Login);
router.post('/email-code/send', authController.sendEmailCode);
router.post('/email-code/login', authController.h5EmailCodeLogin);

module.exports = router;
