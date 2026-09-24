const pool = require('../config/db');
const { success, fail } = require('../utils/response');

function getUserId(req) {
  return Number(req.user?.id);
}

function pickValue(source, camelKey, snakeKey) {
  return source?.[camelKey] ?? source?.[snakeKey];
}

function getProductId(source) {
  return Number(pickValue(source, 'productId', 'product_id'));
}

function getQuantity(source, defaultValue = 1) {
  return Number(pickValue(source, 'quantity', 'quantity') ?? defaultValue);
}

function getChecked(source) {
  const value = pickValue(source, 'checked', 'checked');

  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return Number(value) ? 1 : 0;
}

async function getEnabledProduct(productId) {
  const [[product]] = await pool.query(
    'SELECT id FROM productlist WHERE id = ? AND status = 1 LIMIT 1',
    [productId]
  );

  return product;
}

exports.add = async (req, res) => {
  try {
    const userId = getUserId(req);
    const productId = getProductId(req.body);
    const quantity = getQuantity(req.body, 1);

    if (!userId) {
      return fail(res, 'User id is required', 400);
    }

    if (!productId) {
      return fail(res, 'Product id is required', 400);
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      return fail(res, 'Quantity must be a positive integer', 400);
    }

    const product = await getEnabledProduct(productId);

    if (!product) {
      return fail(res, 'Product not found', 404);
    }

    await pool.query(
      `INSERT INTO cart (user_id, product_id, quantity, checked, created_at, updated_at)
      VALUES (?, ?, ?, 1, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        quantity = quantity + VALUES(quantity),
        checked = 1,
        updated_at = NOW()`,
      [userId, productId, quantity]
    );

    const [[cart]] = await pool.query(
      `SELECT
        id,
        user_id AS userId,
        product_id AS productId,
        quantity,
        checked,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM cart
      WHERE user_id = ? AND product_id = ?`,
      [userId, productId]
    );

    success(res, cart, 'added');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to add cart item');
  }
};

exports.list = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return fail(res, 'User id is required', 400);
    }

    const [list] = await pool.query(
      `SELECT
        c.id,
        c.user_id AS userId,
        c.product_id AS productId,
        c.quantity,
        c.checked,
        c.created_at AS createdAt,
        c.updated_at AS updatedAt,
        p.category_id AS categoryId,
        cat.name AS categoryName,
        p.sale_type AS saleType,
        p.title,
        p.subtitle,
        p.cover,
        p.images,
        p.china_price AS chinaPrice,
        p.shipping_fee AS shippingFee,
        p.ph_price AS phPrice,
        p.profit,
        p.minimum_order_quantity AS minimumOrderQuantity,
        p.stock,
        p.sales,
        p.status
      FROM cart c
      INNER JOIN productlist p ON p.id = c.product_id
      LEFT JOIN category cat ON cat.id = p.category_id
      WHERE c.user_id = ? AND p.status = 1
      ORDER BY c.updated_at DESC, c.id DESC`,
      [userId]
    );

    success(res, {
      total: list.length,
      list
    });
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to get cart list');
  }
};

exports.update = async (req, res) => {
  try {
    const userId = getUserId(req);
    const productId = getProductId(req.body);
    const quantityValue = pickValue(req.body, 'quantity', 'quantity');
    const checked = getChecked(req.body);
    const sets = [];
    const params = [];

    if (!userId) {
      return fail(res, 'User id is required', 400);
    }

    if (!productId) {
      return fail(res, 'Product id is required', 400);
    }

    if (quantityValue !== undefined && quantityValue !== null && quantityValue !== '') {
      const quantity = Number(quantityValue);

      if (!Number.isInteger(quantity) || quantity < 1) {
        return fail(res, 'Quantity must be a positive integer', 400);
      }

      sets.push('quantity = ?');
      params.push(quantity);
    }

    if (checked !== undefined) {
      sets.push('checked = ?');
      params.push(checked);
    }

    if (!sets.length) {
      return fail(res, 'Quantity or checked is required', 400);
    }

    const [result] = await pool.query(
      `UPDATE cart
      SET ${sets.join(', ')}, updated_at = NOW()
      WHERE user_id = ? AND product_id = ?`,
      [...params, userId, productId]
    );

    if (!result.affectedRows) {
      return fail(res, 'Cart item not found', 404);
    }

    const [[cart]] = await pool.query(
      `SELECT
        id,
        user_id AS userId,
        product_id AS productId,
        quantity,
        checked,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM cart
      WHERE user_id = ? AND product_id = ?`,
      [userId, productId]
    );

    success(res, cart, 'updated');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to update cart item');
  }
};

exports.delete = async (req, res) => {
  try {
    const userId = getUserId(req);
    const productId = getProductId(req.body);

    if (!userId) {
      return fail(res, 'User id is required', 400);
    }

    if (!productId) {
      return fail(res, 'Product id is required', 400);
    }

    const [result] = await pool.query(
      'DELETE FROM cart WHERE user_id = ? AND product_id = ?',
      [userId, productId]
    );

    success(res, {
      deleted: result.affectedRows
    }, 'deleted');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to delete cart item');
  }
};