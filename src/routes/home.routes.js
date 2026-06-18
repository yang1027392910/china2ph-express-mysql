const express = require('express');
const router = express.Router();
const homeController = require('../controllers/home.controller');
const { optionalAuth } = require('../middlewares/auth.middleware');

router.get('/index', optionalAuth, homeController.index);
router.get('/hot', optionalAuth, homeController.hot);

module.exports = router;
