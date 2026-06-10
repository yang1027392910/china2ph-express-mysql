const pool = require('../config/db');
const { success, fail } = require('../utils/response');

exports.list = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = Math.max(Number(req.query.pageSize || 10), 1);
    const offset = (page - 1) * pageSize;
    const categoryId = req.query.categoryId;
    const keyword = req.query.keyword;
    const sort = req.query.sort || 'default';

    const where = ['p.status = 1'];
    const params = [];

    if (categoryId) {
      where.push('p.category_id = ?');
      params.push(Number(categoryId));
    }

    if (keyword) {
      where.push('(p.title LIKE ? OR p.sku LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    let orderBy = 'p.id DESC';
    if (sort === 'sales') orderBy = 'p.sales DESC';
    if (sort === 'price_asc') orderBy = 'p.ph_price ASC';
    if (sort === 'price_desc') orderBy = 'p.ph_price DESC';
    if (sort === 'newest') orderBy = 'p.created_at DESC';

    const whereSql = where.join(' AND ');

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM product p WHERE ${whereSql}`,
      params
    );

    const [list] = await pool.query(
      `SELECT 
        p.id,
        p.category_id AS categoryId,
        p.title AS name,
        p.sku,
        p.cover AS image,
        p.china_cost AS chinaCost,
        p.ph_price AS phPrice,
        p.profit,
        p.profit_margin AS profitMargin,
        p.stock,
        p.sales
      FROM product p
      WHERE ${whereSql}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    success(res, {
      total: countRow.total,
      page,
      pageSize,
      list
    });
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to get product list');
  }
};

exports.detail = async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [[product]] = await pool.query(
      `SELECT 
        p.id,
        p.category_id AS categoryId,
        c.name AS categoryName,
        p.title,
        p.sku,
        p.cover,
        p.description,
        p.china_cost AS chinaCost,
        p.ph_price AS phPrice,
        p.profit,
        p.profit_margin AS profitMargin,
        p.moq,
        p.weight,
        p.size,
        p.shipping_method AS shippingMethod,
        p.tiktok_score AS tiktokScore,
        p.trend,
        p.stock,
        p.sales
      FROM product p
      LEFT JOIN category c ON c.id = p.category_id
      WHERE p.id = ? AND p.status = 1`,
      [id]
    );

    if (!product) return fail(res, 'Product not found', 404);

    const [images] = await pool.query(
      'SELECT image_url AS url, sort FROM product_image WHERE product_id = ? ORDER BY sort ASC, id ASC',
      [id]
    );

    success(res, { ...product, images });
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to get product detail');
  }
};

function getProductListFilters(req, onlyEnabled = false) {
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = Math.max(Number(req.query.pageSize || 10), 1);
  const offset = (page - 1) * pageSize;
  const categoryId = req.query.categoryId ?? req.query.category_id;
  const keyword = req.query.keyword;
  const status = req.query.status;

  const where = [];
  const params = [];

  if (onlyEnabled) {
    where.push('p.status = 1');
  } else if (status !== undefined && status !== '') {
    where.push('p.status = ?');
    params.push(Number(status));
  }

  if (categoryId) {
    where.push('p.category_id = ?');
    params.push(Number(categoryId));
  }

  if (keyword) {
    where.push('(p.title LIKE ? OR p.subtitle LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  return {
    page,
    pageSize,
    offset,
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params
  };
}

async function queryProductList(req, res, onlyEnabled, errorMessage) {
  try {
    const { page, pageSize, offset, whereSql, params } = getProductListFilters(req, onlyEnabled);

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM productlist p ${whereSql}`,
      params
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
        p.created_at AS createdAt
      FROM productlist p
      ${whereSql}
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    success(res, {
      total: countRow.total,
      page,
      pageSize,
      list
    });
  } catch (error) {
    console.error(error);
    fail(res, errorMessage);
  }
}

exports.adminProductList = async (req, res) => {
  await queryProductList(req, res, false, 'Failed to get admin product list');
};

exports.h5ProductList = async (req, res) => {
  await queryProductList(req, res, true, 'Failed to get h5 product list');
};

function pickBodyValue(body, camelKey, snakeKey, defaultValue = null) {
  return body[camelKey] ?? body[snakeKey] ?? defaultValue;
}

function normalizeTextValue(value, defaultValue = '') {
  if (value === undefined || value === null) return defaultValue;
  return String(value);
}

function normalizeNumberValue(value, defaultValue = 0) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return Number(value);
}

function normalizeImagesValue(value) {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return JSON.stringify(value);
  return String(value);
}

exports.adminProductCreate = async (req, res) => {
  try {
    const body = req.body || {};
    const title = normalizeTextValue(body.title).trim();

    if (!title) {
      return fail(res, 'Product title is required', 400);
    }

    const [idRows] = await pool.query(
      'SELECT COALESCE(MAX(id), 0) + 1 AS nextId FROM productlist'
    );

    const id = normalizeNumberValue(body.id, idRows[0].nextId);
    const product = {
      id,
      category_id: normalizeNumberValue(pickBodyValue(body, 'categoryId', 'category_id')),
      title,
      subtitle: normalizeTextValue(body.subtitle),
      cover: normalizeTextValue(body.cover),
      images: normalizeImagesValue(body.images),
      description: normalizeTextValue(body.description),
      china_price: normalizeNumberValue(pickBodyValue(body, 'chinaPrice', 'china_price')),
      shipping_fee: normalizeNumberValue(pickBodyValue(body, 'shippingFee', 'shipping_fee')),
      ph_price: normalizeNumberValue(pickBodyValue(body, 'phPrice', 'ph_price')),
      profit: normalizeNumberValue(body.profit),
      minimum_order_quantity: normalizeNumberValue(
        pickBodyValue(body, 'minimumOrderQuantity', 'minimum_order_quantity'),
        1
      ),
      stock: normalizeNumberValue(body.stock),
      sales: normalizeNumberValue(body.sales),
      status: normalizeNumberValue(body.status, 1)
    };

    await pool.query(
      `INSERT INTO productlist
        (id, category_id, title, subtitle, cover, images, description, china_price, shipping_fee, ph_price, profit, minimum_order_quantity, stock, sales, status, created_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        product.id,
        product.category_id,
        product.title,
        product.subtitle,
        product.cover,
        product.images,
        product.description,
        product.china_price,
        product.shipping_fee,
        product.ph_price,
        product.profit,
        product.minimum_order_quantity,
        product.stock,
        product.sales,
        product.status
      ]
    );

    success(res, {
      id: product.id,
      categoryId: product.category_id,
      title: product.title,
      subtitle: product.subtitle,
      cover: product.cover,
      images: product.images,
      description: product.description,
      chinaPrice: product.china_price,
      shippingFee: product.shipping_fee,
      phPrice: product.ph_price,
      profit: product.profit,
      minimumOrderQuantity: product.minimum_order_quantity,
      stock: product.stock,
      sales: product.sales,
      status: product.status
    }, 'created');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to create admin product');
  }
};
