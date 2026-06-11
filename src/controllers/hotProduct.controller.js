const pool = require('../config/db');
const { success, fail } = require('../utils/response');

const HOT_TYPES = ['today', 'week', 'month', 'new_alert'];
const HOT_TYPE_BY_TYPE = {
  1: 'today',
  2: 'week',
  3: 'month',
  4: 'new_alert'
};
const DUPLICATE_HOT_PRODUCT_MESSAGE = '该商品已在当前热门列表中。';
const HOT_PRODUCT_UNIQUE_INDEX = 'uk_hot_product_hot_type_product_id';

function pickBodyValue(body, camelKey, snakeKey, defaultValue = null) {
  return body[camelKey] ?? body[snakeKey] ?? defaultValue;
}

function normalizeNumberValue(value, defaultValue = 0) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return Number(value);
}

function getPagination(req) {
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = Math.max(Number(req.query.pageSize || 10), 1);

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize
  };
}

async function getColumns(tableName) {
  const [rows] = await pool.query(`SHOW COLUMNS FROM ${tableName}`);
  return rows.map(row => row.Field);
}

async function getColumnRows(tableName) {
  const [rows] = await pool.query(`SHOW COLUMNS FROM ${tableName}`);
  return rows;
}

async function hasIndex(tableName, indexName) {
  const [rows] = await pool.query(
    `SHOW INDEX FROM ${tableName} WHERE Key_name = ?`,
    [indexName]
  );

  return rows.length > 0;
}

async function removeDuplicateHotProducts() {
  await pool.query(
    `DELETE h1 FROM hot_product h1
    INNER JOIN hot_product h2
      ON h1.hot_type = h2.hot_type
      AND h1.product_id = h2.product_id
      AND h1.id > h2.id`
  );
}

async function getProductSource() {
  let table = 'productlist';
  let columnRows;

  try {
    columnRows = await getColumnRows(table);
  } catch (error) {
    if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
    table = 'product';
    columnRows = await getColumnRows(table);
  }

  const columns = columnRows.map(row => row.Field);

  return {
    table,
    chinaCostSelect: columns.includes('china_cost') ? 'p.china_cost' : 'p.china_price',
    moqSelect: columns.includes('moq') ? 'p.moq' : 'p.minimum_order_quantity',
    tiktokScoreSelect: columns.includes('tiktok_score') ? 'p.tiktok_score' : 'NULL',
    weightSelect: columns.includes('weight') ? 'p.weight' : 'NULL'
  };
}

async function ensureHotProductSchema() {
  const columnRows = await getColumnRows('hot_product');
  const columns = columnRows.map(row => row.Field);
  const idColumn = columnRows.find(row => row.Field === 'id');

  if (idColumn && !/auto_increment/i.test(idColumn.Extra || '')) {
    const [[countRow]] = await pool.query('SELECT COUNT(*) AS total FROM hot_product');

    if (countRow.total === 0) {
      if (idColumn.Key !== 'PRI') {
        await pool.query('ALTER TABLE hot_product MODIFY COLUMN id BIGINT NOT NULL');
        await pool.query('ALTER TABLE hot_product ADD PRIMARY KEY (id)');
      }

      await pool.query('ALTER TABLE hot_product MODIFY COLUMN id BIGINT NOT NULL AUTO_INCREMENT');
    }
  }

  if (!columns.includes('hot_type')) {
    await pool.query("ALTER TABLE hot_product ADD COLUMN hot_type VARCHAR(20) DEFAULT 'today' AFTER id");
  }

  if (!columns.includes('product_id')) {
    await pool.query('ALTER TABLE hot_product ADD COLUMN product_id BIGINT NOT NULL AFTER hot_type');
  }

  if (!columns.includes('sort')) {
    await pool.query('ALTER TABLE hot_product ADD COLUMN sort INT DEFAULT 0 AFTER product_id');
  }

  if (!columns.includes('status')) {
    await pool.query('ALTER TABLE hot_product ADD COLUMN status TINYINT DEFAULT 1 AFTER sort');
  } else {
    await pool.query('ALTER TABLE hot_product MODIFY COLUMN status TINYINT DEFAULT 1');
  }

  if (!columns.includes('created_at')) {
    await pool.query('ALTER TABLE hot_product ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP AFTER status');
  }

  if (!columns.includes('updated_at')) {
    await pool.query('ALTER TABLE hot_product ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at');
  }

  if (columns.includes('period_type')) {
    await pool.query("UPDATE hot_product SET hot_type = period_type WHERE period_type IN ('today', 'week', 'month', 'new_alert')");
  }

  if (columns.includes('rank_no')) {
    await pool.query('UPDATE hot_product SET sort = rank_no WHERE (sort IS NULL OR sort = 0) AND rank_no IS NOT NULL');
  }

  if (!await hasIndex('hot_product', HOT_PRODUCT_UNIQUE_INDEX)) {
    await removeDuplicateHotProducts();
    await pool.query(
      `ALTER TABLE hot_product
      ADD UNIQUE KEY ${HOT_PRODUCT_UNIQUE_INDEX} (hot_type, product_id)`
    );
  }
}

async function assertProductExists(productId, productSource) {
  const [[product]] = await pool.query(
    `SELECT id FROM ${productSource.table} WHERE id = ? LIMIT 1`,
    [productId]
  );

  return Boolean(product);
}

async function assertHotProductExists(hotType, productId) {
  const [[hotProduct]] = await pool.query(
    `SELECT id FROM hot_product
    WHERE hot_type = ? AND product_id = ?
    LIMIT 1`,
    [hotType, productId]
  );

  return Boolean(hotProduct);
}

function validateHotType(hotType) {
  return HOT_TYPES.includes(hotType);
}

function resolveHotTypeQuery(req) {
  const hotType = req.query.hotType ?? req.query.hot_type;

  if (hotType) {
    return HOT_TYPE_BY_TYPE[Number(hotType)] || String(hotType);
  }

  const type = req.query.type;

  if (type !== undefined && type !== '') {
    return HOT_TYPE_BY_TYPE[Number(type)] || String(type);
  }

  return '';
}

function getHotProductListFilters(req, onlyEnabled = false) {
  const { page, pageSize, offset } = getPagination(req);
  const hotType = resolveHotTypeQuery(req);
  const { keyword } = req.query;
  const status = req.query.status;

  const where = [];
  const params = [];

  if (hotType) {
    where.push('h.hot_type = ?');
    params.push(String(hotType));
  }

  if (onlyEnabled && (status === undefined || status === '')) {
    where.push('h.status = 1');
  } else if (status !== undefined && status !== '') {
    where.push('h.status = ?');
    params.push(Number(status));
  }

  if (keyword) {
    where.push('p.title LIKE ?');
    params.push(`%${keyword}%`);
  }

  return {
    page,
    pageSize,
    offset,
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params
  };
}

async function queryHotProductList(req, res, onlyEnabled, errorMessage) {
  try {
    await ensureHotProductSchema();
    const productSource = await getProductSource();
    const userId = Number(req.user?.id || 0);

    const { page, pageSize, offset, whereSql, params } = getHotProductListFilters(req, onlyEnabled);

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total
      FROM hot_product h
      INNER JOIN ${productSource.table} p ON p.id = h.product_id
      LEFT JOIN category c ON c.id = p.category_id
      ${whereSql}`,
      params
    );

    const [list] = await pool.query(
      `SELECT
        h.id,
        h.id AS hotProductId,
        h.hot_type AS hotType,
        h.sort,
        h.status,
        p.id AS productId,
        p.title,
        p.cover,
        p.category_id AS categoryId,
        c.name AS categoryName,
        ${productSource.chinaCostSelect} AS chinaCost,
        p.ph_price AS phPrice,
        p.profit,
        ${productSource.tiktokScoreSelect} AS tiktokScore,
        ${productSource.moqSelect} AS moq,
        ${productSource.weightSelect} AS weight,
        IF(f.product_id IS NULL, 0, 1) AS isFavorite,
        h.created_at AS createdAt,
        h.updated_at AS updatedAt
      FROM hot_product h
      INNER JOIN ${productSource.table} p ON p.id = h.product_id
      LEFT JOIN category c ON c.id = p.category_id
      LEFT JOIN favorite f ON f.product_id = p.id AND f.user_id = ?
      ${whereSql}
      ORDER BY h.sort ASC, h.id DESC
      LIMIT ? OFFSET ?`,
      [userId, ...params, pageSize, offset]
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

exports.adminList = async (req, res) => {
  await queryHotProductList(req, res, false, 'Failed to get admin hot product list');
};

exports.h5List = async (req, res) => {
  await queryHotProductList(req, res, true, 'Failed to get h5 hot product list');
};

exports.adminCreate = async (req, res) => {
  try {
    await ensureHotProductSchema();
    const productSource = await getProductSource();

    const body = req.body || {};
    const hotType = String(pickBodyValue(body, 'hotType', 'hot_type', '')).trim();
    const productId = normalizeNumberValue(pickBodyValue(body, 'productId', 'product_id'));
    const sort = normalizeNumberValue(body.sort);
    const status = normalizeNumberValue(body.status, 1);

    if (!validateHotType(hotType)) {
      return fail(res, 'Invalid hot type', 400);
    }

    if (!productId) {
      return fail(res, 'Product id is required', 400);
    }

    if (!await assertProductExists(productId, productSource)) {
      return fail(res, 'Product not found', 404);
    }

    if (await assertHotProductExists(hotType, productId)) {
      return fail(res, DUPLICATE_HOT_PRODUCT_MESSAGE, 400);
    }

    const [result] = await pool.query(
      `INSERT INTO hot_product
        (hot_type, product_id, sort, status, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, NOW(), NOW())`,
      [hotType, productId, sort, status]
    );

    success(res, {
      id: result.insertId,
      hotProductId: result.insertId,
      hotType,
      productId,
      sort,
      status
    }, 'created');
  } catch (error) {
    console.error(error);
    if (error.code === 'ER_DUP_ENTRY') {
      return fail(res, DUPLICATE_HOT_PRODUCT_MESSAGE, 400);
    }

    fail(res, 'Failed to create admin hot product');
  }
};

exports.adminUpdate = async (req, res) => {
  try {
    await ensureHotProductSchema();
    const productSource = await getProductSource();

    const body = req.body || {};
    const id = normalizeNumberValue(body.id ?? req.params.id);
    const hotType = String(pickBodyValue(body, 'hotType', 'hot_type', '')).trim();
    const productIdInput = pickBodyValue(body, 'productId', 'product_id');
    const sortInput = body.sort;
    const statusInput = body.status;

    if (!id) {
      return fail(res, 'Hot product id is required', 400);
    }

    const updates = [];
    const params = [];

    if (hotType) {
      if (!validateHotType(hotType)) {
        return fail(res, 'Invalid hot type', 400);
      }

      updates.push('hot_type = ?');
      params.push(hotType);
    }

    if (productIdInput !== undefined && productIdInput !== null && productIdInput !== '') {
      const productId = normalizeNumberValue(productIdInput);

      if (!productId) {
        return fail(res, 'Product id is required', 400);
      }

      if (!await assertProductExists(productId, productSource)) {
        return fail(res, 'Product not found', 404);
      }

      updates.push('product_id = ?');
      params.push(productId);
    }

    if (sortInput !== undefined && sortInput !== null && sortInput !== '') {
      updates.push('sort = ?');
      params.push(normalizeNumberValue(sortInput));
    }

    if (statusInput !== undefined && statusInput !== null && statusInput !== '') {
      updates.push('status = ?');
      params.push(normalizeNumberValue(statusInput));
    }

    if (!updates.length) {
      return fail(res, 'No fields to update', 400);
    }

    params.push(id);

    const [result] = await pool.query(
      `UPDATE hot_product
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = ?`,
      params
    );

    if (!result.affectedRows) {
      return fail(res, 'Hot product not found', 404);
    }

    success(res, { id }, 'updated');
  } catch (error) {
    console.error(error);
    if (error.code === 'ER_DUP_ENTRY') {
      return fail(res, DUPLICATE_HOT_PRODUCT_MESSAGE, 400);
    }

    fail(res, 'Failed to update admin hot product');
  }
};

exports.adminDelete = async (req, res) => {
  try {
    await ensureHotProductSchema();

    const id = normalizeNumberValue(req.body?.id ?? req.query.id ?? req.params.id);

    if (!id) {
      return fail(res, 'Hot product id is required', 400);
    }

    const [result] = await pool.query(
      'DELETE FROM hot_product WHERE id = ?',
      [id]
    );

    if (!result.affectedRows) {
      return fail(res, 'Hot product not found', 404);
    }

    success(res, { id }, 'deleted');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to delete admin hot product');
  }
};
