const couponService = require('../services/coupon.service');
const { cents, decimal } = require('../utils/money');
const pool = require('../config/db');
const { success, fail } = require('../utils/response');

const ORDER_STATUS = new Set([0, 1, 2, 3, 4]);
const DELIVERY_TYPES = new Set([1, 2]);

function getUserId(req) {
  return Number(req.user?.id);
}

function pickValue(source, camelKey, snakeKey, defaultValue = undefined) {
  return source?.[camelKey] ?? source?.[snakeKey] ?? defaultValue;
}

function normalizePositiveInt(value) {
  const number = Number(value);
  return /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(number) ? number : 0;
}

function getPagination(query) {
  const page = Math.max(Number(query.page || 1), 1);
  const pageSize = Math.max(Number(query.pageSize || 10), 1);
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

function mapOrder(row, items = undefined) {
  const productImages = typeof row.productImages === 'string'
    ? JSON.parse(row.productImages)
    : row.productImages;
  const order = {
    id: Number(row.id),
    orderNo: row.orderNo,
    userId: Number(row.userId),
    userCouponId: row.userCouponId ?? null,
    productImages: Array.isArray(productImages) ? productImages : [],
    totalAmount: Number(row.totalAmount),
    discountAmount: Number(row.discountAmount),
    shippingFee: Number(row.shippingFee),
    payAmount: Number(row.payAmount),
    deliveryType: Number(row.deliveryType),
    paymentStatus: Number(row.paymentStatus ?? 0),
    paymentMethod: Number(row.paymentMethod ?? 0),
    paymentReference: row.paymentReference ?? null,
    status: Number(row.status),
    remark: row.remark,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };

  if (items) {
    order.items = items.map(mapOrderItem);
  }

  return order;
}

function mapOrderItem(row) {
  return {
    id: Number(row.id),
    orderId: Number(row.orderId),
    productId: Number(row.productId),
    saleType: Number(row.saleType),
    productName: row.productName,
    productImage: row.productImage,
    price: Number(row.price),
    quantity: Number(row.quantity),
    subtotal: Number(row.subtotal)
  };
}

function buildOrderNo(userId) {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const suffix = `${userId}${Math.floor(Math.random() * 10000)}`.padStart(6, '0').slice(-6);
  return `PO${timestamp}${suffix}`;
}

function normalizeRequestItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map(item => ({
      productId: normalizePositiveInt(pickValue(item, 'productId', 'product_id')),
      quantity: normalizePositiveInt(item.quantity ?? 1)
    }))
    .filter(item => item.productId && item.quantity);
}

async function getProductsForItems(connection, items) {
  const productIds = [...new Set(items.map(item => item.productId))];
  const placeholders = productIds.map(() => '?').join(', ');
  const [products] = await connection.query(
    `SELECT id, title, cover, ph_price AS phPrice
    FROM productlist
    WHERE id IN (${placeholders}) AND status = 1`,
    productIds
  );
  const productMap = new Map(products.map(product => [Number(product.id), product]));

  return items.map(item => {
    const product = productMap.get(item.productId);
    if (!product) return null;

    const price = decimal(cents(product.phPrice));
    const quantity = item.quantity;

    return {
      productId: item.productId,
      productName: product.title,
      productImage: product.cover,
      price,
      quantity,
      subtotal: decimal(cents(price) * BigInt(quantity))
    };
  }).filter(Boolean);
}

async function getCheckedCartItems(connection, userId, cartIds) {
  const [rows] = await connection.query(
    `SELECT
      c.id AS cartId,
      c.product_id AS productId,
      c.quantity,
      p.title AS productName,
      p.cover AS productImage,
      p.ph_price AS price
    FROM cart c
    INNER JOIN productlist p ON p.id = c.product_id
    WHERE c.user_id = ? AND ${cartIds ? `c.id IN (${cartIds.map(() => '?').join(',')})` : 'c.checked = 1'} AND p.status = 1
    ORDER BY c.updated_at DESC, c.id DESC FOR UPDATE`,
    [userId, ...(cartIds || [])]
  );

  return rows.map(row => {
    const price = decimal(cents(row.price));
    const quantity = normalizePositiveInt(row.quantity);

    return {
      cartId: row.cartId,
      productId: Number(row.productId),
      productName: row.productName,
      productImage: row.productImage,
      price,
      quantity,
      subtotal: decimal(cents(price) * BigInt(quantity))
    };
  }).filter(item => item.quantity);
}

async function queryOrderDetail(connection, orderId, userId = null) {
  const orderParams = userId ? [orderId, userId] : [orderId];
  const [[order]] = await connection.query(
    `SELECT
      id,
      order_no AS orderNo,
      user_id AS userId,
      user_coupon_id AS userCouponId,
      product_images AS productImages,
      total_amount AS totalAmount,
      discount_amount AS discountAmount,
      shipping_fee AS shippingFee,
      pay_amount AS payAmount,
      delivery_type AS deliveryType,
      payment_status AS paymentStatus,
      payment_method AS paymentMethod,
      payment_reference AS paymentReference,
      status,
      remark,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM \`order\`
    WHERE id = ?${userId ? ' AND user_id = ?' : ''}
    LIMIT 1`,
    orderParams
  );

  if (!order) return null;

  const [items] = await connection.query(
    `SELECT
      id,
      order_id AS orderId,
      product_id AS productId,
      COALESCE((SELECT p.sale_type FROM productlist p WHERE p.id = order_item.product_id), 1) AS saleType,
      product_name AS productName,
      product_image AS productImage,
      price,
      quantity,
      subtotal
    FROM order_item
    WHERE order_id = ?
    ORDER BY id ASC`,
    [orderId]
  );

  return mapOrder(order, items);
}

exports.create = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const userId = getUserId(req);
    const body = req.body || {};

    if (!userId) {
      connection.release();
      return fail(res, 'User id is required', 400);
    }

    const deliveryType = Number(pickValue(body, 'deliveryType', 'delivery_type', 1));
    if (!DELIVERY_TYPES.has(deliveryType)) {
      connection.release();
      return fail(res, 'Delivery type is invalid', 400);
    }

    const rawCouponId = pickValue(body, 'userCouponId', 'user_coupon_id', null);
    const userCouponId = rawCouponId === null ? null : normalizePositiveInt(rawCouponId);
    if (rawCouponId !== null && !userCouponId) throw couponService.invalid('Invalid userCouponId');
    if (req.user.role !== 'h5') throw couponService.invalid('Forbidden', 403);
    let cartIds = null;
    if (body.cartIds !== undefined) {
      if (!Array.isArray(body.cartIds) || !body.cartIds.length || body.cartIds.some(id => !normalizePositiveInt(id))) throw couponService.invalid('Invalid cartIds');
      cartIds = [...new Set(body.cartIds.map(Number))];
      if (body.items !== undefined) throw couponService.invalid('Use either cartIds or items');
    }
    await connection.beginTransaction();

    const requestItems = normalizeRequestItems(body.items);
    if (body.items !== undefined && (!Array.isArray(body.items) || !requestItems.length || requestItems.length !== body.items.length)) throw couponService.invalid('Order items are invalid');
    const orderItems = requestItems.length
      ? await getProductsForItems(connection, requestItems)
      : await getCheckedCartItems(connection, userId, cartIds);
    if (cartIds && orderItems.length !== cartIds.length) throw couponService.invalid('Cart items are unavailable');

    if (!orderItems.length || (requestItems.length && orderItems.length !== requestItems.length)) {
      await connection.rollback();
      connection.release();
      return fail(res, 'Order items are invalid', 400);
    }

    const totalAmount = decimal(orderItems.reduce((sum, item) => sum + cents(item.subtotal), 0n));
    const coupon = userCouponId ? await couponService.lockForOrder(connection, userId, userCouponId) : null;
    const discountAmount = coupon ? couponService.discount(totalAmount, coupon.amount) : '0.00';
    // No shipping tariff exists yet; preserve the server default, never client input.
    const shippingFee = '0.00';
    const payAmount = decimal(cents(totalAmount) - cents(discountAmount) + cents(shippingFee));
    const remark = String(body.remark || '');
    const orderNo = buildOrderNo(userId);
    const productImages = orderItems.map(item => item.productImage).filter(Boolean);

    const [result] = await connection.query(
      `INSERT INTO \`order\`
        (order_no, user_id, user_coupon_id, product_images, total_amount, discount_amount, shipping_fee, pay_amount, delivery_type, status, remark, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NOW(), NOW())`,
      [orderNo, userId, userCouponId, JSON.stringify(productImages), totalAmount, discountAmount, shippingFee, payAmount, deliveryType, remark]
    );

    const orderId = result.insertId;
    await connection.query(
      `INSERT INTO order_item
        (order_id, product_id, product_name, product_image, price, quantity, subtotal)
      VALUES ?`,
      [orderItems.map(item => [
        orderId,
        item.productId,
        item.productName,
        item.productImage,
        item.price,
        item.quantity,
        item.subtotal
      ])]
    );

    if (coupon) await couponService.consume(connection, userCouponId, orderId);
    if (!requestItems.length) {
      const purchasedCartIds = orderItems.map(item => item.cartId);
      await connection.query(`DELETE FROM cart WHERE user_id = ? AND id IN (${purchasedCartIds.map(() => '?').join(',')})`, [userId, ...purchasedCartIds]);
    }

    const order = await queryOrderDetail(connection, orderId, userId);
    await connection.commit();
    connection.release();

    success(res, order, 'created');
  } catch (error) {
    await connection.rollback();
    connection.release();
    if (!error.statusCode) console.error(error);
    fail(res, error.statusCode ? error.message : 'Failed to create order', error.statusCode || 500);
  }
};

exports.list = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return fail(res, 'User id is required', 400);
    }

    const { page, pageSize, offset } = getPagination(req.query);
    const status = req.query.status;
    const where = ['user_id = ?'];
    const params = [userId];

    if (status !== undefined && status !== '') {
      where.push('status = ?');
      params.push(Number(status));
    }

    const whereSql = where.join(' AND ');
    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM \`order\` WHERE ${whereSql}`,
      params
    );
    const [rows] = await pool.query(
      `SELECT
        id,
        order_no AS orderNo,
        user_id AS userId,
      user_coupon_id AS userCouponId,
        product_images AS productImages,
        total_amount AS totalAmount,
        discount_amount AS discountAmount,
        shipping_fee AS shippingFee,
        pay_amount AS payAmount,
        delivery_type AS deliveryType,
        payment_status AS paymentStatus,
        payment_method AS paymentMethod,
        payment_reference AS paymentReference,
        status,
        remark,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM \`order\`
      WHERE ${whereSql}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    success(res, {
      total: countRow.total,
      page,
      pageSize,
      list: rows.map(row => mapOrder(row))
    });
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to get order list');
  }
};

exports.detail = async (req, res) => {
  try {
    const userId = getUserId(req);
    const orderId = normalizePositiveInt(req.query.id || req.params.id);

    if (!userId) {
      return fail(res, 'User id is required', 400);
    }

    if (!orderId) {
      return fail(res, 'Order id is required', 400);
    }

    const order = await queryOrderDetail(pool, orderId, userId);

    if (!order) {
      return fail(res, 'Order not found', 404);
    }

    success(res, order);
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to get order detail');
  }
};

exports.adminList = async (req, res) => {
  try {
    const { page, pageSize, offset } = getPagination(req.query);
    const status = req.query.status;
    const userId = req.query.userId ?? req.query.user_id;
    const keyword = String(req.query.keyword || '').trim();
    const where = [];
    const params = [];

    if (status !== undefined && status !== '') {
      where.push('o.status = ?');
      params.push(Number(status));
    }

    if (userId) {
      where.push('o.user_id = ?');
      params.push(Number(userId));
    }

    if (keyword) {
      where.push('(o.order_no LIKE ? OR u.email LIKE ? OR u.nickname LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total
      FROM \`order\` o
      LEFT JOIN \`user\` u ON u.id = o.user_id
      ${whereSql}`,
      params
    );
    const [rows] = await pool.query(
      `SELECT
        o.id,
        o.order_no AS orderNo,
        o.user_id AS userId,
        o.user_coupon_id AS userCouponId,
        o.product_images AS productImages,
        u.email AS userEmail,
        u.nickname AS userNickname,
        o.total_amount AS totalAmount,
        o.discount_amount AS discountAmount,
        o.shipping_fee AS shippingFee,
        o.pay_amount AS payAmount,
        o.delivery_type AS deliveryType,
        o.payment_status AS paymentStatus,
        o.payment_method AS paymentMethod,
        o.payment_reference AS paymentReference,
        o.status,
        o.remark,
        o.created_at AS createdAt,
        o.updated_at AS updatedAt
      FROM \`order\` o
      LEFT JOIN \`user\` u ON u.id = o.user_id
      ${whereSql}
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    success(res, {
      total: countRow.total,
      page,
      pageSize,
      list: rows.map(row => ({
        ...mapOrder(row),
        userEmail: row.userEmail,
        userName: row.userNickname || '',
        userNickname: row.userNickname
      }))
    });
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to get admin order list');
  }
};

exports.adminDetail = async (req, res) => {
  try {
    const orderId = normalizePositiveInt(req.query.id || req.params.id);

    if (!orderId) {
      return fail(res, 'Order id is required', 400);
    }

    const order = await queryOrderDetail(pool, orderId);

    if (!order) {
      return fail(res, 'Order not found', 404);
    }

    success(res, order);
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to get admin order detail');
  }
};

exports.adminUpdate = async (req, res) => {
  try {
    const body = req.body || {};
    const orderId = normalizePositiveInt(body.id || req.params.id);
    const updates = [];
    const params = [];

    if (!orderId) {
      return fail(res, 'Order id is required', 400);
    }

    if (body.status !== undefined) {
      const status = Number(body.status);
      if (!ORDER_STATUS.has(status)) {
        return fail(res, 'Order status is invalid', 400);
      }
      updates.push('status = ?');
      params.push(status);
    }

    if (body.remark !== undefined) {
      updates.push('remark = ?');
      params.push(String(body.remark || ''));
    }

    const deliveryType = pickValue(body, 'deliveryType', 'delivery_type');
    if (deliveryType !== undefined) {
      const normalizedDeliveryType = Number(deliveryType);
      if (!DELIVERY_TYPES.has(normalizedDeliveryType)) {
        return fail(res, 'Delivery type is invalid', 400);
      }
      updates.push('delivery_type = ?');
      params.push(normalizedDeliveryType);
    }

    if (!updates.length) {
      return fail(res, 'No fields to update', 400);
    }

    const [result] = await pool.query(
      `UPDATE \`order\`
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = ?`,
      [...params, orderId]
    );

    if (!result.affectedRows) {
      return fail(res, 'Order not found', 404);
    }

    const order = await queryOrderDetail(pool, orderId);
    success(res, order, 'updated');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to update admin order');
  }
};

exports.adminItemUpdate = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const body = req.body || {};
    const itemId = normalizePositiveInt(body.id || body.itemId || body.item_id || req.params.id);
    const quantity = normalizePositiveInt(body.quantity);

    if (!itemId) {
      connection.release();
      return fail(res, 'Order item id is required', 400);
    }

    if (!quantity) {
      connection.release();
      return fail(res, 'Quantity must be a positive integer', 400);
    }

    await connection.beginTransaction();

    const [[item]] = await connection.query(
      `SELECT id, order_id AS orderId, price FROM order_item WHERE id = ? LIMIT 1`,
      [itemId]
    );

    if (!item) {
      await connection.rollback();
      connection.release();
      return fail(res, 'Order item not found', 404);
    }

    const [[orderRow]] = await connection.query(
      'SELECT discount_amount AS discountAmount, shipping_fee AS shippingFee, user_coupon_id AS userCouponId FROM `order` WHERE id = ? FOR UPDATE', [item.orderId]
    );
    const subtotal = decimal(cents(item.price) * BigInt(quantity));
    await connection.query(
      'UPDATE order_item SET quantity = ?, subtotal = ? WHERE id = ?',
      [quantity, subtotal, itemId]
    );

    const [amountRows] = await connection.query(
      'SELECT subtotal FROM order_item WHERE order_id = ? FOR UPDATE', [item.orderId]
    );
    const totalAmount = decimal(amountRows.reduce((sum, row) => sum + cents(row.subtotal), 0n));
    let discountAmount = couponService.discount(totalAmount, orderRow.discountAmount);
    if (orderRow.userCouponId) {
      const [[coupon]] = await connection.query('SELECT amount FROM user_coupon WHERE id = ?', [orderRow.userCouponId]);
      if (!coupon) throw couponService.invalid('Order coupon not found');
      discountAmount = couponService.discount(totalAmount, coupon.amount);
    }
    const payAmount = decimal(cents(totalAmount) - cents(discountAmount) + cents(orderRow.shippingFee));
    await connection.query(
      'UPDATE `order` SET total_amount = ?, discount_amount = ?, pay_amount = ?, updated_at = NOW() WHERE id = ?',
      [totalAmount, discountAmount, payAmount, item.orderId]
    );

    const order = await queryOrderDetail(connection, item.orderId);
    await connection.commit();
    connection.release();

    success(res, order, 'updated');
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error(error);
    fail(res, 'Failed to update admin order item');
  }
};