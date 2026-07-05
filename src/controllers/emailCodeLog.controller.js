const pool = require('../config/db');
const { success, fail } = require('../utils/response');
const { attachIpCity, lookupIpCity } = require('../services/ipLocation.service');
const { detectDevice } = require('../services/device.service');
const { ensureEmailCodeLogUserAgentSchema } = require('../services/emailCodeLogSchema.service');

function getPagination(query) {
  const page = Math.max(Number(query.page || 1), 1);
  const pageSize = Math.max(Number(query.pageSize || 10), 1);
  const offset = (page - 1) * pageSize;

  return { page, pageSize, offset };
}

function buildEmailCodeLogWhere(query) {
  const where = [];
  const params = [];
  const keyword = query.keyword;
  const email = query.email;
  const scene = query.scene;
  const status = query.status;
  const sendStatus = query.sendStatus ?? query.send_status;

  if (keyword) {
    where.push('(l.email LIKE ? OR l.code LIKE ? OR l.ip LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  if (email) {
    where.push('l.email LIKE ?');
    params.push(`%${email}%`);
  }

  if (scene) {
    where.push('l.scene = ?');
    params.push(String(scene));
  }

  if (status !== undefined && status !== '') {
    where.push('l.status = ?');
    params.push(Number(status));
  }

  if (sendStatus !== undefined && sendStatus !== '') {
    where.push('l.send_status = ?');
    params.push(Number(sendStatus));
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params
  };
}

function getEmailCodeLogSelectSql() {
  return `SELECT
    l.id,
    l.email,
    l.code,
    l.scene,
    l.status,
    l.send_status AS sendStatus,
    l.expire_time AS expireTime,
    l.ip,
    l.user_agent AS userAgent,
    l.created_at AS createdAt
  FROM email_code_log l`;
}

exports.adminList = async (req, res) => {
  try {
    await ensureEmailCodeLogUserAgentSchema(pool);
    const { page, pageSize, offset } = getPagination(req.query);
    const { whereSql, params } = buildEmailCodeLogWhere(req.query);

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM email_code_log l ${whereSql}`,
      params
    );

    const [rows] = await pool.query(
      `${getEmailCodeLogSelectSql()}
      ${whereSql}
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    const listWithCity = await attachIpCity(rows);
    const list = listWithCity.map(log => ({
      ...log,
      device: detectDevice(log.userAgent)
    }));

    success(res, {
      total: countRow.total,
      page,
      pageSize,
      list
    });
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to get admin email code log list');
  }
};

exports.adminDetail = async (req, res) => {
  try {
    await ensureEmailCodeLogUserAgentSchema(pool);
    const id = Number(req.params.id || req.query.id);

    if (!id) {
      return fail(res, 'Email code log id is required', 400);
    }

    const [[log]] = await pool.query(
      `${getEmailCodeLogSelectSql()} WHERE l.id = ?`,
      [id]
    );

    if (!log) {
      return fail(res, 'Email code log not found', 404);
    }

    success(res, {
      ...log,
      city: await lookupIpCity(log.ip),
      device: detectDevice(log.userAgent)
    });
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to get admin email code log detail');
  }
};

exports.adminDelete = async (req, res) => {
  try {
    const id = Number(req.body?.id ?? req.query.id ?? req.params.id);

    if (!id) {
      return fail(res, 'Email code log id is required', 400);
    }

    const [result] = await pool.query(
      'DELETE FROM email_code_log WHERE id = ?',
      [id]
    );

    if (!result.affectedRows) {
      return fail(res, 'Email code log not found', 404);
    }

    success(res, { id }, 'deleted');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to delete admin email code log');
  }
};
