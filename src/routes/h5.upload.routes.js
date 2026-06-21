const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/upload.controller');
const { auth } = require('../middlewares/auth.middleware');

const imageBodyParser = express.raw({
  limit: '5mb',
  type: ['multipart/form-data']
});

router.post('/upload', auth, imageBodyParser, uploadController.uploadImage);

module.exports = router;
