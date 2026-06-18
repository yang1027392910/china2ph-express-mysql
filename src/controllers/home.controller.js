const pool = require('../config/db');
const { success, fail } = require('../utils/response');

async function queryHotProducts(userId) {
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

  return rows;
}

async function queryHomeBanners() {
  const [rows] = await pool.query(
    `SELECT
      b.id,
      b.title,
      b.subtitle,
      b.image,
      b.action_type AS actionType,
      b.action_value AS actionValue,
      b.action_type AS jumpType,
      b.action_value AS jumpValue,
      b.sort
    FROM banner b
    WHERE b.status = 1
      AND b.scene = 'home'
      AND (b.start_time IS NULL OR b.start_time <= NOW())
      AND (b.end_time IS NULL OR b.end_time >= NOW())
    ORDER BY b.sort ASC, b.id DESC`
  );

  return rows;
}

exports.hot = async (req, res) => {
  try {
    const userId = Number(req.user?.id || 0);
    const rows = await queryHotProducts(userId);

    success(res, rows);
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to get hot products');
  }
};

exports.index = async (req, res) => {
  try {
    const userId = Number(req.user?.id || 0);
    const [banners, hotProducts] = await Promise.all([
      queryHomeBanners(),
      queryHotProducts(userId)
    ]);

    success(res, {
      banners,
      hotProducts
    });
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to get home index');
  }
};
