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

function normalizeNullableTextValue(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function normalizeNumberValue(value, defaultValue = 0) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return Number(value);
}

function buildBannerWhere(query, onlyVisible = false) {
  const where = [];
  const params = [];
  const keyword = query.keyword;
  const actionType = query.actionType ?? query.action_type;
  const scene = query.scene;
  const status = query.status;

  if (onlyVisible) {
    where.push('b.status = 1');
    where.push('(b.start_time IS NULL OR b.start_time <= NOW())');
    where.push('(b.end_time IS NULL OR b.end_time >= NOW())');
  } else if (status !== undefined && status !== '') {
    where.push('b.status = ?');
    params.push(Number(status));
  }

  if (keyword) {
    where.push('(b.title LIKE ? OR b.subtitle LIKE ? OR b.action_value LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  if (actionType) {
    where.push('b.action_type = ?');
    params.push(String(actionType));
  }

  if (scene) {
    where.push('b.scene = ?');
    params.push(String(scene));
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params
  };
}

function getBannerSelectSql() {
  return `SELECT
    b.id,
    b.title,
    b.subtitle,
    b.image,
    b.scene,
    b.action_type AS actionType,
    b.action_value AS actionValue,
    b.action_type AS jumpType,
    b.action_value AS jumpValue,
    b.sort,
    b.status,
    b.start_time AS startTime,
    b.end_time AS endTime,
    b.created_at AS createdAt,
    b.updated_at AS updatedAt
  FROM banner b`;
}

async function queryBannerList(req, res, onlyVisible, errorMessage) {
  try {
    const { page, pageSize, offset } = getPagination(req.query);
    const { whereSql, params } = buildBannerWhere(req.query, onlyVisible);

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM banner b ${whereSql}`,
      params
    );

    const [list] = await pool.query(
      `${getBannerSelectSql()}
      ${whereSql}
      ORDER BY b.sort ASC, b.id DESC
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
  await queryBannerList(req, res, false, 'Failed to get admin banner list');
};

exports.h5List = async (req, res) => {
  await queryBannerList(req, res, true, 'Failed to get h5 banner list');
};

exports.adminCreate = async (req, res) => {
  try {
    const body = req.body || {};
    const title = normalizeTextValue(body.title).trim();
    const image = normalizeTextValue(body.image).trim();
    const actionType = normalizeTextValue(
      pickBodyValue(body, 'actionType', 'action_type')
    ).trim();

    if (!title) {
      return fail(res, 'Banner title is required', 400);
    }

    if (!image) {
      return fail(res, 'Banner image is required', 400);
    }

    if (!actionType) {
      return fail(res, 'Banner action type is required', 400);
    }

    const banner = {
      title,
      subtitle: normalizeNullableTextValue(body.subtitle),
      image,
      scene: normalizeTextValue(body.scene, 'home').trim() || 'home',
      action_type: actionType,
      action_value: normalizeNullableTextValue(
        body.actionValue ?? body.jumpValue ?? body.action_value
      ),
      sort: normalizeNumberValue(body.sort),
      status: normalizeNumberValue(body.status, 1),
      start_time: normalizeNullableTextValue(pickBodyValue(body, 'startTime', 'start_time')),
      end_time: normalizeNullableTextValue(pickBodyValue(body, 'endTime', 'end_time'))
    };

    const [result] = await pool.query(
      `INSERT INTO banner
        (title, subtitle, image, scene, action_type, action_value, sort, status, start_time, end_time)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        banner.title,
        banner.subtitle,
        banner.image,
        banner.scene,
        banner.action_type,
        banner.action_value,
        banner.sort,
        banner.status,
        banner.start_time,
        banner.end_time
      ]
    );

    const [[created]] = await pool.query(
      `${getBannerSelectSql()} WHERE b.id = ?`,
      [result.insertId]
    );

    success(res, created, 'created');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to create admin banner');
  }
};

exports.adminUpdate = async (req, res) => {
  try {
    const body = req.body || {};
    const id = Number(body.id ?? req.params.id);

    if (!id) {
      return fail(res, 'Banner id is required', 400);
    }

    const fields = [];
    const params = [];

    if (body.title !== undefined) {
      const title = normalizeTextValue(body.title).trim();
      if (!title) return fail(res, 'Banner title is required', 400);
      fields.push('title = ?');
      params.push(title);
    }

    if (body.subtitle !== undefined) {
      fields.push('subtitle = ?');
      params.push(normalizeNullableTextValue(body.subtitle));
    }

    if (body.image !== undefined) {
      const image = normalizeTextValue(body.image).trim();
      if (!image) return fail(res, 'Banner image is required', 400);
      fields.push('image = ?');
      params.push(image);
    }

    if (body.scene !== undefined) {
      fields.push('scene = ?');
      params.push(normalizeTextValue(body.scene, 'home').trim() || 'home');
    }

    const actionType = body.actionType ?? body.jumpType ?? body.action_type;
    if (actionType !== undefined) {
      const normalizedActionType = normalizeTextValue(actionType).trim();
      if (!normalizedActionType) return fail(res, 'Banner action type is required', 400);
      fields.push('action_type = ?');
      params.push(normalizedActionType);
    }

    const actionValue = body.actionValue ?? body.jumpValue ?? body.action_value;
    if (actionValue !== undefined) {
      fields.push('action_value = ?');
      params.push(normalizeNullableTextValue(actionValue));
    }

    if (body.sort !== undefined) {
      fields.push('sort = ?');
      params.push(normalizeNumberValue(body.sort));
    }

    if (body.status !== undefined) {
      fields.push('status = ?');
      params.push(normalizeNumberValue(body.status, 1));
    }

    const startTime = pickBodyValue(body, 'startTime', 'start_time');
    if (startTime !== undefined) {
      fields.push('start_time = ?');
      params.push(normalizeNullableTextValue(startTime));
    }

    const endTime = pickBodyValue(body, 'endTime', 'end_time');
    if (endTime !== undefined) {
      fields.push('end_time = ?');
      params.push(normalizeNullableTextValue(endTime));
    }

    if (!fields.length) {
      return fail(res, 'No banner fields to update', 400);
    }

    params.push(id);

    const [result] = await pool.query(
      `UPDATE banner
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = ?`,
      params
    );

    if (!result.affectedRows) {
      return fail(res, 'Banner not found', 404);
    }

    const [[updated]] = await pool.query(
      `${getBannerSelectSql()} WHERE b.id = ?`,
      [id]
    );

    success(res, updated, 'updated');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to update admin banner');
  }
};

exports.adminDelete = async (req, res) => {
  try {
    const id = Number(req.body?.id ?? req.query.id ?? req.params.id);

    if (!id) {
      return fail(res, 'Banner id is required', 400);
    }

    const [result] = await pool.query(
      'DELETE FROM banner WHERE id = ?',
      [id]
    );

    if (!result.affectedRows) {
      return fail(res, 'Banner not found', 404);
    }

    success(res, { id }, 'deleted');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to delete admin banner');
  }
};
