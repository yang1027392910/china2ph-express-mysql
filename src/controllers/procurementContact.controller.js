const pool = require('../config/db');
const { success, fail } = require('../utils/response');

const CONTACT_TYPES = ['messenger', 'whatsapp', 'telegram', 'phone', 'email'];

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

function normalizeNumberValue(value, defaultValue = 0) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return Number(value);
}

function buildProcurementContactWhere(query, onlyEnabled = false) {
  const where = [];
  const params = [];
  const keyword = query.keyword;
  const contactType = query.contactType ?? query.contact_type;
  const status = query.status;

  if (onlyEnabled) {
    where.push('c.status = 1');
  } else if (status !== undefined && status !== '') {
    where.push('c.status = ?');
    params.push(Number(status));
  }

  if (keyword) {
    where.push('(c.contact_type LIKE ? OR c.contact_value LIKE ? OR c.description LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  if (contactType) {
    where.push('c.contact_type = ?');
    params.push(String(contactType));
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params
  };
}

function getProcurementContactSelectSql() {
  return `SELECT
    c.id,
    c.contact_type AS contactType,
    c.contact_value AS contactValue,
    c.description,
    c.sort,
    c.status,
    c.created_at AS createdAt,
    c.updated_at AS updatedAt
  FROM procurement_contact c`;
}

async function queryProcurementContactList(req, res, onlyEnabled, errorMessage) {
  try {
    const { page, pageSize, offset } = getPagination(req.query);
    const { whereSql, params } = buildProcurementContactWhere(req.query, onlyEnabled);

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM procurement_contact c ${whereSql}`,
      params
    );

    const [list] = await pool.query(
      `${getProcurementContactSelectSql()}
      ${whereSql}
      ORDER BY c.sort ASC, c.id DESC
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

function validateContactType(contactType) {
  return CONTACT_TYPES.includes(contactType);
}

exports.adminList = async (req, res) => {
  await queryProcurementContactList(req, res, false, 'Failed to get admin procurement contact list');
};

exports.h5List = async (req, res) => {
  await queryProcurementContactList(req, res, true, 'Failed to get h5 procurement contact list');
};

exports.adminCreate = async (req, res) => {
  try {
    const body = req.body || {};
    const contactType = normalizeTextValue(
      pickBodyValue(body, 'contactType', 'contact_type')
    ).trim();
    const contactValue = normalizeTextValue(
      pickBodyValue(body, 'contactValue', 'contact_value')
    ).trim();

    if (!contactType) {
      return fail(res, 'Contact type is required', 400);
    }

    if (!validateContactType(contactType)) {
      return fail(res, 'Invalid contact type', 400);
    }

    if (!contactValue) {
      return fail(res, 'Contact value is required', 400);
    }

    const contact = {
      contact_type: contactType,
      contact_value: contactValue,
      description: normalizeNullableTextValue(body.description),
      sort: normalizeNumberValue(body.sort),
      status: normalizeNumberValue(body.status, 1)
    };

    const [result] = await pool.query(
      `INSERT INTO procurement_contact
        (contact_type, contact_value, description, sort, status)
      VALUES
        (?, ?, ?, ?, ?)`,
      [
        contact.contact_type,
        contact.contact_value,
        contact.description,
        contact.sort,
        contact.status
      ]
    );

    const [[created]] = await pool.query(
      `${getProcurementContactSelectSql()} WHERE c.id = ?`,
      [result.insertId]
    );

    success(res, created, 'created');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to create admin procurement contact');
  }
};

exports.adminUpdate = async (req, res) => {
  try {
    const body = req.body || {};
    const id = Number(body.id ?? req.params.id);

    if (!id) {
      return fail(res, 'Procurement contact id is required', 400);
    }

    const fields = [];
    const params = [];
    const contactType = pickBodyValue(body, 'contactType', 'contact_type');
    const contactValue = pickBodyValue(body, 'contactValue', 'contact_value');

    if (contactType !== undefined) {
      const normalizedType = normalizeTextValue(contactType).trim();

      if (!validateContactType(normalizedType)) {
        return fail(res, 'Invalid contact type', 400);
      }

      fields.push('contact_type = ?');
      params.push(normalizedType);
    }

    if (contactValue !== undefined) {
      const normalizedValue = normalizeTextValue(contactValue).trim();

      if (!normalizedValue) {
        return fail(res, 'Contact value is required', 400);
      }

      fields.push('contact_value = ?');
      params.push(normalizedValue);
    }

    if (body.description !== undefined) {
      fields.push('description = ?');
      params.push(normalizeNullableTextValue(body.description));
    }

    if (body.sort !== undefined) {
      fields.push('sort = ?');
      params.push(normalizeNumberValue(body.sort));
    }

    if (body.status !== undefined) {
      fields.push('status = ?');
      params.push(normalizeNumberValue(body.status, 1));
    }

    if (!fields.length) {
      return fail(res, 'No procurement contact fields to update', 400);
    }

    params.push(id);

    const [result] = await pool.query(
      `UPDATE procurement_contact
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = ?`,
      params
    );

    if (!result.affectedRows) {
      return fail(res, 'Procurement contact not found', 404);
    }

    const [[updated]] = await pool.query(
      `${getProcurementContactSelectSql()} WHERE c.id = ?`,
      [id]
    );

    success(res, updated, 'updated');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to update admin procurement contact');
  }
};

exports.adminDelete = async (req, res) => {
  try {
    const id = Number(req.params.id ?? req.body?.id ?? req.query.id);

    if (!id) {
      return fail(res, 'Procurement contact id is required', 400);
    }

    const [result] = await pool.query(
      'DELETE FROM procurement_contact WHERE id = ?',
      [id]
    );

    if (!result.affectedRows) {
      return fail(res, 'Procurement contact not found', 404);
    }

    success(res, { id }, 'deleted');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to delete admin procurement contact');
  }
};
