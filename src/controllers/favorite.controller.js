const pool = require('../config/db');
const { success, fail } = require('../utils/response');

function getPagination(query) {
  const page = Math.max(Number(query.page || 1), 1);
  const pageSize = Math.max(Number(query.pageSize || 10), 1);
  const offset = (page - 1) * pageSize;

  return { page, pageSize, offset };
}

function getUserId(req) {
  return Number(req.user?.id);
}

function getProductId(req) {
  return Number(req.body?.productId ?? req.body?.product_id ?? req.query.productId ?? req.query.product_id);
}

exports.click = async (req, res) => {
  try {
    const userId = getUserId(req);
    const productId = getProductId(req);

    if (!userId) {
      return fail(res, 'User id is required', 400);
    }

    if (!productId) {
      return fail(res, 'Product id is required', 400);
    }

    const [[product]] = await pool.query(
      'SELECT id FROM productlist WHERE id = ? AND status = 1 LIMIT 1',
      [productId]
    );

    if (!product) {
      return fail(res, 'Product not found', 404);
    }

    await pool.query(
      `INSERT INTO favorite (user_id, product_id, created_at)
      VALUES (?, ?, NOW())
      ON DUPLICATE KEY UPDATE product_id = VALUES(product_id)`,
      [userId, productId]
    );

    const [[favorite]] = await pool.query(
      `SELECT
        user_id AS userId,
        product_id AS productId,
        created_at AS favoriteTime
      FROM favorite
      WHERE user_id = ? AND product_id = ?`,
      [userId, productId]
    );

    success(res, {
      ...favorite,
      favorited: true
    }, 'favorited');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to favorite product');
  }
};

exports.list = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return fail(res, 'User id is required', 400);
    }

    const { page, pageSize, offset } = getPagination(req.query);

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total
      FROM favorite f
      INNER JOIN productlist p ON p.id = f.product_id
      WHERE f.user_id = ? AND p.status = 1`,
      [userId]
    );

    const [list] = await pool.query(
      `SELECT
        p.id,
        p.category_id AS categoryId,
        p.title,
        p.subtitle,
        p.cover,
        p.images,
        p.description,
        p.china_price AS chinaPrice,
        p.shipping_fee AS shippingFee,
        p.ph_price AS phPrice,
        p.profit,
        p.minimum_order_quantity AS minimumOrderQuantity,
        p.stock,
        p.sales,
        p.status,
        p.created_at AS createdAt,
        f.created_at AS favoriteTime
      FROM favorite f
      INNER JOIN productlist p ON p.id = f.product_id
      WHERE f.user_id = ? AND p.status = 1
      ORDER BY f.created_at DESC
      LIMIT ? OFFSET ?`,
      [userId, pageSize, offset]
    );

    success(res, {
      total: countRow.total,
      page,
      pageSize,
      list
    });
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to get favorite list');
  }
};
