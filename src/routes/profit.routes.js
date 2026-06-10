const express = require('express');
const router = express.Router();
const profitController = require('../controllers/profit.controller');

router.post('/calculate', profitController.calculate);

module.exports = router;
