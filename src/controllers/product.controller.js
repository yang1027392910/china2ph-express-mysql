const pool = require('../config/db');
const permissionService = require('../services/productContactPermission.service');
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
  const title = req.query.title;
  const keyword = req.query.keyword;
  const status = req.query.status;
  const hotType = req.query.hotType ?? req.query.hot_type;

  const where = [];
  const params = [];
  const hotProductStatusSql = onlyEnabled ? ' AND h.status = 1' : '';

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

  if (title) {
    where.push('p.title LIKE ?');
    params.push(`%${title}%`);
  }

  if (keyword) {
    where.push('(p.title LIKE ? OR p.subtitle LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  if (hotType) {
    where.push(`EXISTS (
      SELECT 1
      FROM hot_product h
      WHERE h.product_id = p.id
        AND h.hot_type = ?${hotProductStatusSql}
    )`);
    params.push(String(hotType));
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
    const userId = Number(req.user?.id || 0);
    const hotProductStatusSql = onlyEnabled ? ' AND h.status = 1' : '';

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
        p.show_supplier_contact AS showSupplierContact,
        p.supplier_name AS supplierName,
        p.supplier_whatsapp AS supplierWhatsapp,
        p.supplier_wechat AS supplierWechat,
        p.supplier_phone AS supplierPhone,
        (
          SELECT h.hot_type
          FROM hot_product h
          WHERE h.product_id = p.id${hotProductStatusSql}
          ORDER BY h.sort ASC, h.id DESC
          LIMIT 1
        ) AS hotType,
        (
          SELECT GROUP_CONCAT(h.hot_type ORDER BY h.sort ASC, h.id DESC SEPARATOR ',')
          FROM hot_product h
          WHERE h.product_id = p.id${hotProductStatusSql}
        ) AS hotTypes,
        p.created_at AS createdAt,
        IF(f.product_id IS NULL, 0, 1) AS isFavorite
      FROM productlist p
      LEFT JOIN favorite f ON f.product_id = p.id AND f.user_id = ?
      ${whereSql}
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT ? OFFSET ?`,
      [userId, ...params, pageSize, offset]
    );

    let responseList = list;

    if (onlyEnabled) {
      const productIds = list.map(product => Number(product.id));
      const authorizedProductIds = await permissionService.getAuthorizedProductIdSet(
        userId,
        productIds
      );

      responseList = list.map(product => {
        const canViewSupplierContact =
          Number(product.showSupplierContact) === 1 &&
          authorizedProductIds.has(Number(product.id));

        const {
          supplierName,
          supplierWhatsapp,
          supplierWechat,
          supplierPhone,
          ...publicProduct
        } = product;

        return {
          ...publicProduct,
          canViewSupplierContact,
          supplierContact: canViewSupplierContact
            ? {
                name: supplierName,
                whatsapp: supplierWhatsapp,
                wechat: supplierWechat,
                phone: supplierPhone
              }
            : null
        };
      });
    }

    success(res, {
      total: countRow.total,
      page,
      pageSize,
      list: responseList
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

function pickBodyValue(body, camelKey, snakeKey, defaultValue = undefined) {
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

exports.adminProductUpdate = async (req, res) => {
  try {
    const body = req.body || {};
    const id = normalizeNumberValue(body.id ?? req.params.id);

    if (!id) {
      return fail(res, 'Product id is required', 400);
    }

    const fieldMap = [
      {
        camelKey: 'categoryId',
        snakeKey: 'category_id',
        column: 'category_id',
        normalize: normalizeNumberValue
      },
      {
        camelKey: 'title',
        column: 'title',
        normalize: value => normalizeTextValue(value).trim(),
        validate: value => Boolean(value),
        error: 'Product title is required'
      },
      { camelKey: 'subtitle', column: 'subtitle', normalize: normalizeTextValue },
      { camelKey: 'cover', column: 'cover', normalize: normalizeTextValue },
      { camelKey: 'images', column: 'images', normalize: normalizeImagesValue },
      { camelKey: 'description', column: 'description', normalize: normalizeTextValue },
      {
        camelKey: 'chinaPrice',
        snakeKey: 'china_price',
        column: 'china_price',
        normalize: normalizeNumberValue
      },
      {
        camelKey: 'shippingFee',
        snakeKey: 'shipping_fee',
        column: 'shipping_fee',
        normalize: normalizeNumberValue
      },
      {
        camelKey: 'phPrice',
        snakeKey: 'ph_price',
        column: 'ph_price',
        normalize: normalizeNumberValue
      },
      { camelKey: 'profit', column: 'profit', normalize: normalizeNumberValue },
      {
        camelKey: 'minimumOrderQuantity',
        snakeKey: 'minimum_order_quantity',
        column: 'minimum_order_quantity',
        normalize: value => normalizeNumberValue(value, 1)
      },
      { camelKey: 'stock', column: 'stock', normalize: normalizeNumberValue },
      { camelKey: 'sales', column: 'sales', normalize: normalizeNumberValue },
      { camelKey: 'status', column: 'status', normalize: normalizeNumberValue },
      {
        camelKey: 'showSupplierContact',
        snakeKey: 'show_supplier_contact',
        column: 'show_supplier_contact',
        normalize: normalizeNumberValue
      },
      {
        camelKey: 'supplierName',
        snakeKey: 'supplier_name',
        column: 'supplier_name',
        normalize: normalizeTextValue
      },
      {
        camelKey: 'supplierWhatsapp',
        snakeKey: 'supplier_whatsapp',
        column: 'supplier_whatsapp',
        normalize: normalizeTextValue
      },
      {
        camelKey: 'supplierWechat',
        snakeKey: 'supplier_wechat',
        column: 'supplier_wechat',
        normalize: normalizeTextValue
      },
      {
        camelKey: 'supplierPhone',
        snakeKey: 'supplier_phone',
        column: 'supplier_phone',
        normalize: normalizeTextValue
      }
    ];

    const updates = [];
    const params = [];

    for (const field of fieldMap) {
      const value = pickBodyValue(body, field.camelKey, field.snakeKey, undefined);
      if (value === undefined) continue;

      const normalizedValue = field.normalize(value);
      if (field.validate && !field.validate(normalizedValue)) {
        return fail(res, field.error, 400);
      }

      updates.push(`${field.column} = ?`);
      params.push(normalizedValue);
    }

    if (!updates.length) {
      return fail(res, 'No fields to update', 400);
    }

    params.push(id);
    const [result] = await pool.query(
      `UPDATE productlist
      SET ${updates.join(', ')}
      WHERE id = ?`,
      params
    );

    if (!result.affectedRows) {
      return fail(res, 'Product not found', 404);
    }

    const [[product]] = await pool.query(
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
        p.show_supplier_contact AS showSupplierContact,
        p.supplier_name AS supplierName,
        p.supplier_whatsapp AS supplierWhatsapp,
        p.supplier_wechat AS supplierWechat,
        p.supplier_phone AS supplierPhone,
        p.created_at AS createdAt
      FROM productlist p
      WHERE p.id = ?`,
      [id]
    );

    success(res, product, 'updated');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to update admin product');
  }
};
