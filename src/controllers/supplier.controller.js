const pool = require('../config/db');
const { success, fail } = require('../utils/response');

const SUPPLIER_TABLE_SQL = `CREATE TABLE IF NOT EXISTS supplier (
  id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '供应商ID',
  name VARCHAR(100) NOT NULL COMMENT '供应商名称',
  logo VARCHAR(255) NULL COMMENT '供应商logo/封面图',
  images TEXT NULL COMMENT '供应商图片，JSON数组',
  city VARCHAR(100) NULL COMMENT '城市',
  country VARCHAR(50) DEFAULT 'China' COMMENT '国家',
  main_products VARCHAR(255) NULL COMMENT '主营产品',
  moq VARCHAR(100) NULL COMMENT '最低起订量',
  description TEXT NULL COMMENT '简介',
  tags VARCHAR(255) NULL COMMENT '标签，JSON数组，如 Verified Supplier/OEM/Export Experience',
  export_markets VARCHAR(255) NULL COMMENT '出口市场，如 Philippines, Malaysia',
  year_established VARCHAR(20) NULL COMMENT '成立年份',
  contact_name VARCHAR(100) NULL COMMENT '联系人',
  contact_whatsapp VARCHAR(100) NULL COMMENT 'WhatsApp',
  contact_wechat VARCHAR(100) NULL COMMENT '微信',
  contact_phone VARCHAR(100) NULL COMMENT '电话',
  contact_email VARCHAR(100) NULL COMMENT '邮箱',
  show_contact TINYINT(1) DEFAULT 0 COMMENT '是否开放联系方式',
  status TINYINT(1) DEFAULT 1 COMMENT '状态：1启用 0禁用',
  sort INT DEFAULT 0 COMMENT '排序',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='供应商表'`;

let supplierTableReady = false;

async function ensureSupplierTable() {
  if (supplierTableReady) return;
  await pool.query(SUPPLIER_TABLE_SQL);
  supplierTableReady = true;
}

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

function normalizeNullableTextValue(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function normalizeJsonArrayValue(value) {
  if (value === undefined || value === null || value === '') return null;

  if (Array.isArray(value)) {
    return JSON.stringify(value.filter(item => item !== undefined && item !== null && item !== ''));
  }

  const text = String(value).trim();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return JSON.stringify(parsed.filter(item => item !== undefined && item !== null && item !== ''));
    }
  } catch (error) {
    return JSON.stringify(text.split(',').map(item => item.trim()).filter(Boolean));
  }

  return JSON.stringify([text]);
}

function normalizeNumberValue(value, defaultValue = 0) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return Number(value);
}

function parseJsonArrayValue(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return String(value).split(',').map(item => item.trim()).filter(Boolean);
  }
}

function formatSupplierRow(row) {
  if (!row) return row;

  const formatted = {
    ...row,
    images: parseJsonArrayValue(row.images)
  };

  if (Object.prototype.hasOwnProperty.call(row, 'tags')) {
    formatted.tags = parseJsonArrayValue(row.tags);
  }

  return formatted;
}

function buildSupplierWhere(query, onlyEnabled = false) {
  const where = [];
  const params = [];
  const keyword = query.keyword;
  const city = query.city;
  const status = query.status;

  if (onlyEnabled) {
    where.push('s.status = 1');
  } else if (status !== undefined && status !== '') {
    where.push('s.status = ?');
    params.push(Number(status));
  }

  if (keyword) {
    where.push('(s.name LIKE ? OR s.city LIKE ? OR s.main_products LIKE ? OR s.description LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  if (city) {
    where.push('s.city = ?');
    params.push(String(city));
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params
  };
}

function getSupplierSelectSql() {
  return `SELECT
    s.id,
    s.name,
    s.logo,
    s.images,
    s.city,
    s.country,
    s.main_products AS mainProducts,
    s.moq,
    s.description,
    s.tags,
    s.export_markets AS exportMarkets,
    s.year_established AS yearEstablished,
    s.contact_name AS contactName,
    s.contact_whatsapp AS contactWhatsapp,
    s.contact_wechat AS contactWechat,
    s.contact_phone AS contactPhone,
    s.contact_email AS contactEmail,
    s.show_contact AS showContact,
    s.status,
    s.sort,
    s.created_at AS createdAt,
    s.updated_at AS updatedAt
  FROM supplier s`;
}

function getH5SupplierSelectSql() {
  return `SELECT
    s.id,
    s.name,
    s.logo,
    s.images,
    s.city,
    s.main_products AS mainProducts,
    s.moq,
    s.description,
    CASE WHEN s.show_contact = 1 THEN s.contact_whatsapp ELSE NULL END AS contactWhatsapp,
    s.show_contact AS showContact,
    s.status,
    s.sort
  FROM supplier s`;
}

async function querySupplierList(req, res, onlyEnabled, errorMessage) {
  try {
    await ensureSupplierTable();

    const { page, pageSize, offset } = getPagination(req.query);
    const { whereSql, params } = buildSupplierWhere(req.query, onlyEnabled);
    const selectSql = onlyEnabled ? getH5SupplierSelectSql() : getSupplierSelectSql();

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM supplier s ${whereSql}`,
      params
    );

    const [rows] = await pool.query(
      `${selectSql}
      ${whereSql}
      ORDER BY s.sort ASC, s.id DESC
      LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    const list = rows.map(formatSupplierRow);

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
  await querySupplierList(req, res, false, 'Failed to get admin supplier list');
};

exports.h5List = async (req, res) => {
  await querySupplierList(req, res, true, 'Failed to get h5 supplier list');
};

exports.adminCreate = async (req, res) => {
  try {
    await ensureSupplierTable();

    const body = req.body || {};
    const name = normalizeTextValue(body.name).trim();

    if (!name) {
      return fail(res, 'Supplier name is required', 400);
    }

    const supplier = {
      name,
      logo: normalizeNullableTextValue(body.logo),
      images: normalizeJsonArrayValue(body.images),
      city: normalizeNullableTextValue(body.city),
      country: normalizeTextValue(body.country, 'China'),
      main_products: normalizeNullableTextValue(pickBodyValue(body, 'mainProducts', 'main_products')),
      moq: normalizeNullableTextValue(body.moq),
      description: normalizeNullableTextValue(body.description),
      tags: normalizeJsonArrayValue(body.tags),
      export_markets: normalizeNullableTextValue(pickBodyValue(body, 'exportMarkets', 'export_markets')),
      year_established: normalizeNullableTextValue(pickBodyValue(body, 'yearEstablished', 'year_established')),
      contact_name: normalizeNullableTextValue(pickBodyValue(body, 'contactName', 'contact_name')),
      contact_whatsapp: normalizeNullableTextValue(pickBodyValue(body, 'contactWhatsapp', 'contact_whatsapp')),
      contact_wechat: normalizeNullableTextValue(pickBodyValue(body, 'contactWechat', 'contact_wechat')),
      contact_phone: normalizeNullableTextValue(pickBodyValue(body, 'contactPhone', 'contact_phone')),
      contact_email: normalizeNullableTextValue(pickBodyValue(body, 'contactEmail', 'contact_email')),
      show_contact: normalizeNumberValue(pickBodyValue(body, 'showContact', 'show_contact')),
      status: normalizeNumberValue(body.status, 1),
      sort: normalizeNumberValue(body.sort)
    };

    const [result] = await pool.query(
      `INSERT INTO supplier
        (name, logo, images, city, country, main_products, moq, description, tags,
          export_markets, year_established, contact_name, contact_whatsapp, contact_wechat,
          contact_phone, contact_email, show_contact, status, sort)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        supplier.name,
        supplier.logo,
        supplier.images,
        supplier.city,
        supplier.country,
        supplier.main_products,
        supplier.moq,
        supplier.description,
        supplier.tags,
        supplier.export_markets,
        supplier.year_established,
        supplier.contact_name,
        supplier.contact_whatsapp,
        supplier.contact_wechat,
        supplier.contact_phone,
        supplier.contact_email,
        supplier.show_contact,
        supplier.status,
        supplier.sort
      ]
    );

    const [[created]] = await pool.query(
      `${getSupplierSelectSql()} WHERE s.id = ?`,
      [result.insertId]
    );

    success(res, formatSupplierRow(created), 'created');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to create admin supplier');
  }
};

exports.adminUpdate = async (req, res) => {
  try {
    await ensureSupplierTable();

    const body = req.body || {};
    const id = normalizeNumberValue(body.id ?? req.params.id);

    if (!id) {
      return fail(res, 'Supplier id is required', 400);
    }

    const fieldMap = [
      {
        camelKey: 'name',
        column: 'name',
        normalize: value => normalizeTextValue(value).trim(),
        validate: value => Boolean(value),
        error: 'Supplier name is required'
      },
      { camelKey: 'logo', column: 'logo', normalize: normalizeNullableTextValue },
      { camelKey: 'images', column: 'images', normalize: normalizeJsonArrayValue },
      { camelKey: 'city', column: 'city', normalize: normalizeNullableTextValue },
      { camelKey: 'country', column: 'country', normalize: normalizeTextValue },
      {
        camelKey: 'mainProducts',
        snakeKey: 'main_products',
        column: 'main_products',
        normalize: normalizeNullableTextValue
      },
      { camelKey: 'moq', column: 'moq', normalize: normalizeNullableTextValue },
      { camelKey: 'description', column: 'description', normalize: normalizeNullableTextValue },
      { camelKey: 'tags', column: 'tags', normalize: normalizeJsonArrayValue },
      {
        camelKey: 'exportMarkets',
        snakeKey: 'export_markets',
        column: 'export_markets',
        normalize: normalizeNullableTextValue
      },
      {
        camelKey: 'yearEstablished',
        snakeKey: 'year_established',
        column: 'year_established',
        normalize: normalizeNullableTextValue
      },
      {
        camelKey: 'contactName',
        snakeKey: 'contact_name',
        column: 'contact_name',
        normalize: normalizeNullableTextValue
      },
      {
        camelKey: 'contactWhatsapp',
        snakeKey: 'contact_whatsapp',
        column: 'contact_whatsapp',
        normalize: normalizeNullableTextValue
      },
      {
        camelKey: 'contactWechat',
        snakeKey: 'contact_wechat',
        column: 'contact_wechat',
        normalize: normalizeNullableTextValue
      },
      {
        camelKey: 'contactPhone',
        snakeKey: 'contact_phone',
        column: 'contact_phone',
        normalize: normalizeNullableTextValue
      },
      {
        camelKey: 'contactEmail',
        snakeKey: 'contact_email',
        column: 'contact_email',
        normalize: normalizeNullableTextValue
      },
      {
        camelKey: 'showContact',
        snakeKey: 'show_contact',
        column: 'show_contact',
        normalize: normalizeNumberValue
      },
      { camelKey: 'status', column: 'status', normalize: normalizeNumberValue },
      { camelKey: 'sort', column: 'sort', normalize: normalizeNumberValue }
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
      `UPDATE supplier
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = ?`,
      params
    );

    if (!result.affectedRows) {
      return fail(res, 'Supplier not found', 404);
    }

    const [[updated]] = await pool.query(
      `${getSupplierSelectSql()} WHERE s.id = ?`,
      [id]
    );

    success(res, formatSupplierRow(updated), 'updated');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to update admin supplier');
  }
};

exports.adminDelete = async (req, res) => {
  try {
    await ensureSupplierTable();

    const id = normalizeNumberValue(req.body?.id ?? req.query.id ?? req.params.id);

    if (!id) {
      return fail(res, 'Supplier id is required', 400);
    }

    const [result] = await pool.query(
      'DELETE FROM supplier WHERE id = ?',
      [id]
    );

    if (!result.affectedRows) {
      return fail(res, 'Supplier not found', 404);
    }

    success(res, { id }, 'deleted');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to delete admin supplier');
  }
};
