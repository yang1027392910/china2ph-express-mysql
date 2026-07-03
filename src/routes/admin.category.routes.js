const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/category.controller');
const { adminAuth } = require('../middlewares/auth.middleware');

router.get('/list', adminAuth, categoryController.adminList);
router.post('/list/created', adminAuth, categoryController.adminCreate);
router.post('/list/update', adminAuth, categoryController.adminUpdate);
router.put('/list/:id', adminAuth, categoryController.adminUpdate);
router.post('/list/dele', adminAuth, categoryController.adminDelete);
router.delete('/list/dele/:id', adminAuth, categoryController.adminDelete);

module.exports = router;
