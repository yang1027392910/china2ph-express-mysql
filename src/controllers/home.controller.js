const pool = require('../config/db');
const { success, fail } = require('../utils/response');

exports.hot = async (req, res) => {
  try {
    const userId = Number(req.user?.id || 0);

    const [rows] = await pool.query(
      `SELECT 
        p.id,
        p.category_id AS categoryId,
        p.title AS name,
        p.cover AS image,
        p.china_cost AS chinaCost,
        p.ph_price AS phPrice,
        p.profit,
        p.profit_margin AS profitMargin,
        p.tiktok_score AS tiktokScore,
        IF(f.product_id IS NULL, 0, 1) AS isFavorite
      FROM home_hot_product h
      INNER JOIN product p ON p.id = h.product_id
      LEFT JOIN favorite f ON f.product_id = p.id AND f.user_id = ?
      WHERE h.status = 1 AND p.status = 1
      ORDER BY h.sort ASC, h.id ASC`,
      [userId]
    );
    success(res, rows);
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to get hot products');
  }
};
