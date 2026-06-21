const express = require('express');
const router = express.Router();
const userVerificationController = require('../controllers/h5UserVerification.controller');
const userController = require('../controllers/h5User.controller');
const { auth } = require('../middlewares/auth.middleware');

const verificationBodyParser = express.raw({
  limit: '20mb',
  type: ['multipart/form-data']
});

router.get('/detail', auth, userController.detail);

router.post(
  '/verification/submit',
  auth,
  verificationBodyParser,
  userVerificationController.submit
);

module.exports = router;
