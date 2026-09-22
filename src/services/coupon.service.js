const { cents, decimal } = require('../utils/money');
function invalid(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}
// These mutations require the caller's active transaction connection.
async function grantRegistrationRewards(connection, userId) {
  const [[user]] = await connection.query('SELECT id FROM `user` WHERE id = ? FOR UPDATE', [userId]);
  if (!user) throw invalid('User not found', 404);
  const [configs] = await connection.query('SELECT type, amount, valid_days FROM coupon_config WHERE enabled = 1 ORDER BY type FOR SHARE');
  for (const config of configs) {
    // Parent lock serializes issuance even when no child rows exist yet.
    const [existing] = await connection.query(
      'SELECT id FROM user_coupon WHERE user_id = ? AND type = ? AND source = 1 FOR UPDATE', [userId, config.type]
    );
    if (existing.length) continue;
    const active = Number(config.type) === 1;
    await connection.query(
      `INSERT INTO user_coupon (user_id, type, amount, status, source, activated_at, expired_at)
       VALUES (?, ?, ?, ?, 1, IF(?, NOW(), NULL), IF(?, DATE_ADD(NOW(), INTERVAL ? DAY), NULL))`,
      [userId, config.type, config.amount, active ? 1 : 0, active, active, config.valid_days]
    );
  }
}
async function activateVerificationReward(connection, userId) {
  await connection.query('SELECT id FROM `user` WHERE id = ? FOR UPDATE', [userId]);
  await connection.query(
    `UPDATE user_coupon c JOIN coupon_config cfg ON cfg.type = 2
     SET c.status = 1, c.activated_at = NOW(), c.expired_at = DATE_ADD(NOW(), INTERVAL cfg.valid_days DAY)
     WHERE c.user_id = ? AND c.type = 2 AND c.source = 1 AND c.status = 0`, [userId]
  );
}
// Reconcile default rewards for users created before the coupon module existed.
async function ensureDefaultRewards(connection, userId) {
  const [[user]] = await connection.query(
    'SELECT id, verification_status FROM `user` WHERE id = ? FOR UPDATE', [userId]
  );
  if (!user) throw invalid('User not found', 404);
  await grantRegistrationRewards(connection, userId);
  if (Number(user.verification_status) === 1) {
    await activateVerificationReward(connection, userId);
  }
}
async function lockForOrder(connection, userId, couponId) {
  const [[coupon]] = await connection.query('SELECT * FROM user_coupon WHERE id = ? FOR UPDATE', [couponId]);
  // Refresh clock after any row-lock wait.
  const [[clock]] = await connection.query('SELECT NOW() AS now');
  if (!coupon || String(coupon.user_id) !== String(userId) || Number(coupon.status) !== 1 ||
      !coupon.expired_at || coupon.expired_at <= clock.now || coupon.order_id !== null) {
    throw invalid('Coupon is unavailable');
  }
  return coupon;
}
async function consume(connection, couponId, orderId) {
  const [result] = await connection.query(
    `UPDATE user_coupon SET status = 2, order_id = ?, used_at = NOW()
     WHERE id = ? AND status = 1 AND order_id IS NULL AND expired_at > NOW()`, [orderId, couponId]
  );
  if (result.affectedRows !== 1) throw invalid('Coupon is unavailable');
}
function discount(total, amount) {
  const a = cents(total), b = cents(amount);
  return decimal(a < b ? a : b);
}
module.exports = { ensureDefaultRewards, invalid, grantRegistrationRewards, activateVerificationReward, lockForOrder, consume, discount };
