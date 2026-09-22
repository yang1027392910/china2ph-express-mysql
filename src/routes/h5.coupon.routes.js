const router = require('express').Router();
const controller = require('../controllers/coupon.controller');
const { auth } = require('../middlewares/auth.middleware');
const { fail } = require('../utils/response');
router.use(auth);
router.use((req, res, next) => {
  if (req.user.role !== 'h5') return fail(res, 'Forbidden', 403);
  if (req.query.userId !== undefined || req.query.user_id !== undefined || req.body?.userId !== undefined || req.body?.user_id !== undefined) return fail(res, 'userId must come from authentication', 400);
  res.set('Cache-Control', 'no-store');
  next();
});
router.get('/rewards', controller.rewards);
router.get('/list', controller.list);
router.get('/available', controller.available);
module.exports = router;
