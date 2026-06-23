const pool = require('../config/db');
const { success, fail } = require('../utils/response');

const DEFAULT_ICON = 'solar:clipboard-list-bold-duotone';

function getPagination(query) {
  const page = Math.max(Number(query.page || 1), 1);
  const pageSize = Math.max(Number(query.pageSize || 10), 1);

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize
  };
}

function pickBodyValue(body, camelKey, snakeKey, defaultValue = undefined) {
  return body[camelKey] ?? body[snakeKey] ?? defaultValue;
}

function normalizeText(value, defaultValue = '') {
  if (value === undefined || value === null) return defaultValue;
  return String(value).trim();
}

function normalizeNullableText(value) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function normalizeNumber(value, defaultValue = 0) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return Number(value);
}

function getSelectSql() {
  return `SELECT
    n.id,
    n.title,
    n.\`value\` AS value,
    n.icon,
    n.sort,
    n.jump_type AS jumpType,
    n.jump_value AS jumpValue,
    n.color,
    n.status,
    n.created_at AS createdAt,
    n.updated_at AS updatedAt
  FROM home_navigation n`;
}

function buildWhere(query, onlyEnabled = false) {
  const where = [];
  const params = [];
  const keyword = normalizeText(query.keyword);

  if (onlyEnabled) {
    where.push('n.status = 1');
  } else if (query.status !== undefined && query.status !== '') {
    where.push('n.status = ?');
    params.push(normalizeNumber(query.status));
  }

  if (keyword) {
    where.push('(n.title LIKE ? OR n.`value` LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params
  };
}

async function queryList(req, res, onlyEnabled, errorMessage) {
  try {
    const { page, pageSize, offset } = getPagination(req.query);
    const { whereSql, params } = buildWhere(req.query, onlyEnabled);

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM home_navigation n ${whereSql}`,
      params
    );

    const [list] = await pool.query(
      `${getSelectSql()}
      ${whereSql}
      ORDER BY n.sort ASC, n.id ASC
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
  await queryList(req, res, false, 'Failed to get admin home navigation list');
};

exports.h5List = async (req, res) => {
  await queryList(req, res, true, 'Failed to get h5 home navigation list');
};

exports.adminCreate = async (req, res) => {
  try {
    const body = req.body || {};
    const title = normalizeText(body.title);
    const value = normalizeText(body.value);

    if (!title) {
      return fail(res, 'Title is required', 400);
    }

    if (!value) {
      return fail(res, 'Value is required', 400);
    }

    const navigation = {
      title,
      value,
      icon: normalizeText(body.icon, DEFAULT_ICON) || DEFAULT_ICON,
      sort: normalizeNumber(body.sort),
      jumpType: normalizeNullableText(pickBodyValue(body, 'jumpType', 'jump_type')),
      jumpValue: normalizeNullableText(pickBodyValue(body, 'jumpValue', 'jump_value')),
      color: normalizeNullableText(body.color),
      status: normalizeNumber(body.status, 1)
    };

    const [result] = await pool.query(
      `INSERT INTO home_navigation
        (title, \`value\`, icon, sort, jump_type, jump_value, color, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        navigation.title,
        navigation.value,
        navigation.icon,
        navigation.sort,
        navigation.jumpType,
        navigation.jumpValue,
        navigation.color,
        navigation.status
      ]
    );

    const [[created]] = await pool.query(
      `${getSelectSql()} WHERE n.id = ?`,
      [result.insertId]
    );

    success(res, created, 'created');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to create home navigation');
  }
};

exports.adminUpdate = async (req, res) => {
  try {
    const body = req.body || {};
    const id = Number(body.id ?? req.params.id);

    if (!id) {
      return fail(res, 'Home navigation id is required', 400);
    }

    const fields = [];
    const params = [];

    if (body.title !== undefined) {
      const title = normalizeText(body.title);
      if (!title) return fail(res, 'Title is required', 400);
      fields.push('title = ?');
      params.push(title);
    }

    if (body.value !== undefined) {
      const value = normalizeText(body.value);
      if (!value) return fail(res, 'Value is required', 400);
      fields.push('`value` = ?');
      params.push(value);
    }

    if (body.icon !== undefined) {
      fields.push('icon = ?');
      params.push(normalizeText(body.icon, DEFAULT_ICON) || DEFAULT_ICON);
    }

    if (body.sort !== undefined) {
      fields.push('sort = ?');
      params.push(normalizeNumber(body.sort));
    }

    const jumpType = pickBodyValue(body, 'jumpType', 'jump_type');
    if (jumpType !== undefined) {
      fields.push('jump_type = ?');
      params.push(normalizeNullableText(jumpType));
    }

    const jumpValue = pickBodyValue(body, 'jumpValue', 'jump_value');
    if (jumpValue !== undefined) {
      fields.push('jump_value = ?');
      params.push(normalizeNullableText(jumpValue));
    }

    if (body.color !== undefined) {
      fields.push('color = ?');
      params.push(normalizeNullableText(body.color));
    }

    if (body.status !== undefined) {
      fields.push('status = ?');
      params.push(normalizeNumber(body.status, 1));
    }

    if (!fields.length) {
      return fail(res, 'No home navigation fields to update', 400);
    }

    params.push(id);

    const [result] = await pool.query(
      `UPDATE home_navigation
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = ?`,
      params
    );

    if (!result.affectedRows) {
      return fail(res, 'Home navigation not found', 404);
    }

    const [[updated]] = await pool.query(
      `${getSelectSql()} WHERE n.id = ?`,
      [id]
    );

    success(res, updated, 'updated');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to update home navigation');
  }
};

exports.adminDelete = async (req, res) => {
  try {
    const id = Number(req.params.id ?? req.body?.id ?? req.query.id);

    if (!id) {
      return fail(res, 'Home navigation id is required', 400);
    }

    const [result] = await pool.query(
      'DELETE FROM home_navigation WHERE id = ?',
      [id]
    );

    if (!result.affectedRows) {
      return fail(res, 'Home navigation not found', 404);
    }

    success(res, { id }, 'deleted');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to delete home navigation');
  }
};
