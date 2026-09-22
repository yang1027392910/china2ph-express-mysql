const pool = require('../config/db');
const { success, fail } = require('../utils/response');
const { cents, decimal } = require('../utils/money');
const { invalid, discount, ensureDefaultRewards } = require('../services/coupon.service');
const types = { 1: 'Registration', 2: 'Verification', 3: 'System' };
const statuses = ['Locked', 'Available', 'Used', 'Expired', 'Disabled'];
const effectiveStatus = 'CASE WHEN c.status = 1 AND c.expired_at <= NOW() THEN 3 ELSE c.status END';
const select = `SELECT c.id, c.user_id AS userId, c.type, c.amount,
  ${effectiveStatus} AS status, c.source, c.order_id AS orderId,
  c.activated_at AS activatedAt, c.expired_at AS expiredAt, c.used_at AS usedAt,
  c.remark, c.created_at AS createdAt, c.updated_at AS updatedAt`;
function map(row) {
  return { ...row, typeName: types[row.type], statusName: statuses[row.status], sourceName: Number(row.source) === 1 ? 'System' : 'Admin' };
}
function integer(value, name, max = Number.MAX_SAFE_INTEGER) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) > max) throw invalid(`${name} is invalid`);
  return Number(value);
}
function settings(body, positive) {
  const amount = decimal(cents(body.amount));
  if (positive && cents(amount) === 0n) throw invalid('Amount must be positive');
  const validDays = integer(body.validDays, 'validDays', 365000);
  return { amount, validDays };
}
function handler(fn) {
  return async (req, res) => {
    try { success(res, await fn(req)); }
    catch (error) {
      if (!error.statusCode) console.error(error);
      fail(res, error.statusCode ? error.message : 'Coupon operation failed', error.statusCode || 500);
    }
  };
}
async function transaction(fn) {
  const connection = await pool.getConnection();
  try { await connection.beginTransaction(); const data = await fn(connection); await connection.commit(); return data; }
  catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
exports.config = handler(async () => {
  const [rows] = await pool.query('SELECT id, type, amount, valid_days AS validDays, enabled FROM coupon_config ORDER BY type');
  return rows.map(row => ({ ...row, typeName: types[row.type], enabled: Boolean(row.enabled) }));
});
exports.updateConfig = handler(async req => {
  const id = integer(req.params.id, 'id');
  const body = req.body || {};
  if (body.type !== undefined) throw invalid('Type cannot be modified');
  const { amount, validDays } = settings(body, false);
  if (typeof body.enabled !== 'boolean') throw invalid('enabled must be boolean');
  return transaction(async connection => {
    const [[config]] = await connection.query('SELECT type FROM coupon_config WHERE id = ? FOR UPDATE', [id]);
    if (!config) throw invalid('Config not found', 404);
    await connection.query('UPDATE coupon_config SET amount = ?, valid_days = ?, enabled = ? WHERE id = ?', [amount, validDays, body.enabled, id]);
    // Default rewards follow current pricing until used. Order history is immutable.
    await connection.query(
      'UPDATE user_coupon SET amount = ? WHERE type = ? AND source = 1 AND status <> 2 AND order_id IS NULL',
      [amount, config.type]
    );
    return null;
  });
});
async function list(req, admin) {
  const query = req.query;
  const page = integer(query.page ?? 1, 'page');
  const pageSize = integer(query.pageSize ?? 10, 'pageSize', 100);
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset)) throw invalid('page is too large');
  const where = [], params = [];
  if (!admin) { where.push('c.user_id = ?'); params.push(req.user.id); }
  const filters = admin ? [['type', [1,2,3]], ['status', [0,1,2,3,4]], ['source', [1,2]]] : [['status', [0,1,2,3,4]]];
  for (const [key, values] of filters) {
    if (query[key] === undefined || query[key] === '') continue;
    if (!/^\d$/.test(String(query[key])) || !values.includes(Number(query[key]))) throw invalid(`${key} is invalid`);
    where.push(`${key === 'status' ? effectiveStatus : `c.${key}`} = ?`); params.push(Number(query[key]));
  }
  if (admin) {
    const keyword = String(query.keyword || '').trim();
    if (keyword) {
      where.push('(CAST(c.user_id AS CHAR) = ? OR u.email LIKE ? OR u.nickname LIKE ?)');
      params.push(keyword, `%${keyword}%`, `%${keyword}%`);
    }
    for (const key of ['startDate', 'endDate']) {
      if (!query[key]) continue;
      const value = String(query[key]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) throw invalid(`${key} must be YYYY-MM-DD`);
      where.push(key === 'startDate' ? 'c.created_at >= ?' : 'c.created_at < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(value);
    }
    if (query.startDate && query.endDate && query.startDate > query.endDate) throw invalid('Invalid date range');
  }
  const from = ` FROM user_coupon c${admin ? ' LEFT JOIN `user` u ON u.id = c.user_id' : ''} WHERE ${where.join(' AND ') || '1=1'}`;
  const [[count]] = await pool.query(`SELECT COUNT(*) AS total${from}`, params);
  const [rows] = await pool.query(`${select}${admin ? ', u.email, u.nickname' : ''}${from} ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
  return { total: count.total, page, pageSize, list: rows.map(map) };
}
exports.adminList = handler(req => list(req, true));
exports.list = handler(req => list(req, false));
exports.detail = handler(async req => {
  const [[row]] = await pool.query(`${select}, u.email, u.nickname, u.avatar FROM user_coupon c LEFT JOIN \`user\` u ON u.id = c.user_id WHERE c.id = ?`, [integer(req.params.id, 'id')]);
  if (!row) throw invalid('Coupon not found', 404);
  return map(row);
});
exports.send = handler(async req => {
  const body = req.body || {};
  const userId = integer(body.userId, 'userId');
  const { amount, validDays } = settings(body, true);
  if (body.remark != null && (typeof body.remark !== 'string' || [...body.remark].length > 255)) throw invalid('remark must be at most 255 characters');
  return transaction(async connection => {
    const [[user]] = await connection.query('SELECT id FROM `user` WHERE id = ? FOR UPDATE', [userId]);
    if (!user) throw invalid('User not found', 404);
    const [result] = await connection.query(`INSERT INTO user_coupon (user_id, type, amount, status, source, activated_at, expired_at, remark)
      VALUES (?, 3, ?, 1, 2, NOW(), DATE_ADD(NOW(), INTERVAL ? DAY), ?)`, [userId, amount, validDays, body.remark ?? null]);
    const [[row]] = await connection.query(`${select} FROM user_coupon c WHERE c.id = ?`, [result.insertId]);
    return map(row);
  });
});
exports.disable = handler(async req => transaction(async connection => {
  const id = integer(req.params.id, 'id');
  const [[row]] = await connection.query('SELECT id FROM user_coupon WHERE id = ? FOR UPDATE', [id]);
  if (!row) throw invalid('Coupon not found', 404);
  const [result] = await connection.query(`UPDATE user_coupon SET status = 4 WHERE id = ? AND
    (status = 0 OR (status = 1 AND expired_at > NOW()))`, [id]);
  if (!result.affectedRows) throw invalid('Coupon cannot be disabled');
  return null;
}));
exports.rewards = handler(async req => transaction(async connection => {
  await ensureDefaultRewards(connection, req.user.id);
  const [rows] = await connection.query(`${select} FROM user_coupon c WHERE c.user_id = ? AND c.source = 1 AND c.type IN (1,2)`, [req.user.id]);
  const [[count]] = await connection.query('SELECT COUNT(*) AS total FROM user_coupon WHERE user_id = ? AND status = 1 AND expired_at > NOW() AND order_id IS NULL', [req.user.id]);
  const registration = rows.find(row => Number(row.type) === 1);
  const verification = rows.find(row => Number(row.type) === 2);
  return {
    registration: registration ? map(registration) : null,
    verification: verification ? map(verification) : null,
    availableCount: count.total
  };
}));
exports.available = handler(async req => {
  const total = decimal(cents(req.query.orderAmount));
  const [rows] = await pool.query(`${select} FROM user_coupon c WHERE c.user_id = ? AND c.status = 1 AND c.expired_at > NOW() AND c.order_id IS NULL ORDER BY c.expired_at, c.id`, [req.user.id]);
  return rows.map(row => ({ ...map(row), discountAmount: discount(total, row.amount) }));
});
