const express = require('express');
const router = express.Router();
const aiController = require('../controllers/ai.controller');

router.post('/translate-image', aiController.translateImage);

module.exports = router;
