const pool = require('../config/db');

const SQL = {
  listByProductId: `SELECT
    pcp.user_id AS userId,
    u.email AS email,
    pcp.created_at AS createdAt
  FROM product_contact_permission pcp
  LEFT JOIN \`user\` u ON u.id = pcp.user_id
  WHERE pcp.product_id = ?
  ORDER BY pcp.created_at DESC`,

  add: `INSERT IGNORE INTO product_contact_permission (product_id, user_id)
  VALUES (?, ?)`,

  remove: `DELETE FROM product_contact_permission
  WHERE product_id = ?
    AND user_id = ?`
};

async function listByProductId(productId) {
  const [rows] = await pool.query(SQL.listByProductId, [productId]);
  return rows;
}

async function add(productId, userId) {
  const [result] = await pool.query(SQL.add, [productId, userId]);
  return result;
}

async function remove(productId, userId) {
  const [result] = await pool.query(SQL.remove, [productId, userId]);
  return result;
}

async function findAuthorizedProductIds(userId, productIds) {
  if (!userId || !productIds.length) {
    return [];
  }

  const placeholders = productIds.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `SELECT product_id AS productId
    FROM product_contact_permission
    WHERE user_id = ?
      AND product_id IN (${placeholders})`,
    [userId, ...productIds]
  );

  return rows.map(row => Number(row.productId));
}

module.exports = {
  SQL,
  add,
  findAuthorizedProductIds,
  listByProductId,
  remove
};
