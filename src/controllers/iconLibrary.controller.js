const pool = require('../config/db');
const { success, fail } = require('../utils/response');

function getPagination(query) {
  const page = Math.max(Number(query.page || 1), 1);
  const pageSize = Math.max(Number(query.pageSize || 10), 1);

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize
  };
}

function normalizeText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function getSelectSql() {
  return `SELECT
    i.id,
    i.name,
    i.icon_value AS iconValue,
    i.created_at AS createdAt
  FROM icon_library i`;
}

exports.adminList = async (req, res) => {
  try {
    const { page, pageSize, offset } = getPagination(req.query);
    const keyword = normalizeText(req.query.keyword);
    const whereSql = keyword
      ? 'WHERE i.name LIKE ? OR i.icon_value LIKE ?'
      : '';
    const params = keyword
      ? [`%${keyword}%`, `%${keyword}%`]
      : [];

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM icon_library i ${whereSql}`,
      params
    );

    const [list] = await pool.query(
      `${getSelectSql()}
      ${whereSql}
      ORDER BY i.id ASC
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
    fail(res, 'Failed to get icon library list');
  }
};

exports.adminCreate = async (req, res) => {
  try {
    const body = req.body || {};
    const name = normalizeText(body.name) || null;
    const iconValue = normalizeText(body.iconValue ?? body.icon_value);

    if (!iconValue) {
      return fail(res, 'Icon value is required', 400);
    }

    const [result] = await pool.query(
      'INSERT INTO icon_library (name, icon_value) VALUES (?, ?)',
      [name, iconValue]
    );

    const [[created]] = await pool.query(
      `${getSelectSql()} WHERE i.id = ?`,
      [result.insertId]
    );

    success(res, created, 'created');
  } catch (error) {
    console.error(error);

    if (error.code === 'ER_DUP_ENTRY') {
      return fail(res, 'Icon value already exists', 400);
    }

    fail(res, 'Failed to create icon');
  }
};

exports.adminDelete = async (req, res) => {
  try {
    const id = Number(req.params.id ?? req.body?.id ?? req.query.id);

    if (!id) {
      return fail(res, 'Icon id is required', 400);
    }

    const [result] = await pool.query(
      'DELETE FROM icon_library WHERE id = ?',
      [id]
    );

    if (!result.affectedRows) {
      return fail(res, 'Icon not found', 404);
    }

    success(res, { id }, 'deleted');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to delete icon');
  }
};
