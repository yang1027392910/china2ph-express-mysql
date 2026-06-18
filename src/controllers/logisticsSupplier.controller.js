const pool = require('../config/db');
const { success, fail } = require('../utils/response');

function getPagination(query) {
  const page = Math.max(Number(query.page || 1), 1);
  const pageSize = Math.max(Number(query.pageSize || 10), 1);
  const offset = (page - 1) * pageSize;

  return { page, pageSize, offset };
}

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

function buildLogisticsSupplierWhere(query, onlyEnabled = false) {
  const where = [];
  const params = [];
  const keyword = query.keyword;
  const shippingMethod = query.shippingMethod ?? query.shipping_method;
  const status = query.status;

  if (onlyEnabled) {
    where.push('l.status = 1');
  } else if (status !== undefined && status !== '') {
    where.push('l.status = ?');
    params.push(Number(status));
  }

  if (keyword) {
    where.push('(l.name LIKE ? OR l.shipping_method LIKE ? OR l.pricing_method LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  if (shippingMethod) {
    where.push('l.shipping_method = ?');
    params.push(String(shippingMethod));
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params
  };
}

function getLogisticsSupplierSelectSql() {
  return `SELECT
    l.id,
    l.name,
    l.logo,
    l.shipping_method AS shippingMethod,
    l.delivery_time AS deliveryTime,
    l.unit_price AS unitPrice,
    l.pricing_method AS pricingMethod,
    l.sort,
    l.status,
    l.created_at AS createdAt,
    l.updated_at AS updatedAt
  FROM logistics_supplier l`;
}

async function queryLogisticsSupplierList(req, res, onlyEnabled, errorMessage) {
  try {
    const { page, pageSize, offset } = getPagination(req.query);
    const { whereSql, params } = buildLogisticsSupplierWhere(req.query, onlyEnabled);

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM logistics_supplier l ${whereSql}`,
      params
    );

    const [list] = await pool.query(
      `${getLogisticsSupplierSelectSql()}
      ${whereSql}
      ORDER BY l.sort ASC, l.id DESC
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

exports.adminList = async (req, res) => {
  await queryLogisticsSupplierList(req, res, false, 'Failed to get admin logistics supplier list');
};

exports.h5List = async (req, res) => {
  await queryLogisticsSupplierList(req, res, true, 'Failed to get h5 logistics supplier list');
};

exports.adminCreate = async (req, res) => {
  try {
    const body = req.body || {};
    const name = normalizeTextValue(body.name).trim();
    const shippingMethod = normalizeTextValue(
      pickBodyValue(body, 'shippingMethod', 'shipping_method')
    ).trim();

    if (!name) {
      return fail(res, 'Logistics supplier name is required', 400);
    }

    if (!shippingMethod) {
      return fail(res, 'Shipping method is required', 400);
    }

    const supplier = {
      name,
      logo: normalizeTextValue(body.logo),
      shipping_method: shippingMethod,
      delivery_time: normalizeTextValue(
        pickBodyValue(body, 'deliveryTime', 'delivery_time'),
        ''
      ),
      unit_price: normalizeNumberValue(pickBodyValue(body, 'unitPrice', 'unit_price')),
      pricing_method: normalizeTextValue(
        pickBodyValue(body, 'pricingMethod', 'pricing_method'),
        ''
      ),
      sort: normalizeNumberValue(body.sort),
      status: normalizeNumberValue(body.status, 1)
    };

    const [result] = await pool.query(
      `INSERT INTO logistics_supplier
        (name, logo, shipping_method, delivery_time, unit_price, pricing_method, sort, status)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        supplier.name,
        supplier.logo,
        supplier.shipping_method,
        supplier.delivery_time,
        supplier.unit_price,
        supplier.pricing_method,
        supplier.sort,
        supplier.status
      ]
    );

    const [[created]] = await pool.query(
      `${getLogisticsSupplierSelectSql()} WHERE l.id = ?`,
      [result.insertId]
    );

    success(res, created, 'created');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to create admin logistics supplier');
  }
};

exports.adminUpdate = async (req, res) => {
  try {
    const body = req.body || {};
    const id = normalizeNumberValue(body.id ?? req.params.id);

    if (!id) {
      return fail(res, 'Logistics supplier id is required', 400);
    }

    const fieldMap = [
      {
        camelKey: 'name',
        column: 'name',
        normalize: value => normalizeTextValue(value).trim(),
        validate: value => Boolean(value),
        error: 'Logistics supplier name is required'
      },
      { camelKey: 'logo', column: 'logo', normalize: normalizeTextValue },
      {
        camelKey: 'shippingMethod',
        snakeKey: 'shipping_method',
        column: 'shipping_method',
        normalize: value => normalizeTextValue(value).trim(),
        validate: value => Boolean(value),
        error: 'Shipping method is required'
      },
      {
        camelKey: 'deliveryTime',
        snakeKey: 'delivery_time',
        column: 'delivery_time',
        normalize: normalizeTextValue
      },
      {
        camelKey: 'unitPrice',
        snakeKey: 'unit_price',
        column: 'unit_price',
        normalize: normalizeNumberValue
      },
      {
        camelKey: 'pricingMethod',
        snakeKey: 'pricing_method',
        column: 'pricing_method',
        normalize: normalizeTextValue
      },
      { camelKey: 'sort', column: 'sort', normalize: normalizeNumberValue },
      { camelKey: 'status', column: 'status', normalize: normalizeNumberValue }
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
      `UPDATE logistics_supplier
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = ?`,
      params
    );

    if (!result.affectedRows) {
      return fail(res, 'Logistics supplier not found', 404);
    }

    const [[supplier]] = await pool.query(
      `${getLogisticsSupplierSelectSql()} WHERE l.id = ?`,
      [id]
    );

    success(res, supplier, 'updated');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to update admin logistics supplier');
  }
};

exports.adminDelete = async (req, res) => {
  try {
    const id = normalizeNumberValue(req.body?.id ?? req.query.id ?? req.params.id);

    if (!id) {
      return fail(res, 'Logistics supplier id is required', 400);
    }

    const [result] = await pool.query(
      'DELETE FROM logistics_supplier WHERE id = ?',
      [id]
    );

    if (!result.affectedRows) {
      return fail(res, 'Logistics supplier not found', 404);
    }

    success(res, { id }, 'deleted');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to delete admin logistics supplier');
  }
};
