const pool = require('../config/db');
const { success, fail } = require('../utils/response');
const {
  ensureInviteSchema,
  generateInviteCode
} = require('../utils/invite');

function getPagination(query) {
  const page = Math.max(Number(query.page || 1), 1);
  const pageSize = Math.max(Number(query.pageSize || 10), 1);
  const offset = (page - 1) * pageSize;

  return { page, pageSize, offset };
}

function buildUserWhere(query) {
  const where = [];
  const params = [];
  const keyword = query.keyword;
  const status = query.status;

  if (keyword) {
    where.push('(u.email LIKE ? OR u.nickname LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  if (status !== undefined && status !== '') {
    where.push('u.status = ?');
    params.push(Number(status));
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params
  };
}

function getUserSelectSql() {
  return `SELECT
    u.id,
    u.email,
    u.nickname,
    u.avatar,
    u.status,
    u.register_ip AS registerIp,
    u.last_login_ip AS lastLoginIp,
    u.login_count AS loginCount,
    u.invite_code AS inviteCode,
    u.inviter_id AS inviterId,
    u.invite_count AS inviteCount,
    u.can_lottery AS canLottery,
    u.created_at AS createdAt,
    u.updated_at AS updatedAt,
    u.last_login_time AS lastLoginTime
  FROM \`user\` u`;
}

function pickBodyValue(body, camelKey, snakeKey) {
  return body[camelKey] ?? body[snakeKey];
}

exports.adminList = async (req, res) => {
  try {
    await ensureInviteSchema(pool);
    const { page, pageSize, offset } = getPagination(req.query);
    const { whereSql, params } = buildUserWhere(req.query);

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM \`user\` u ${whereSql}`,
      params
    );

    const [list] = await pool.query(
      `${getUserSelectSql()}
      ${whereSql}
      ORDER BY u.created_at DESC, u.id DESC
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
    fail(res, 'Failed to get admin user list');
  }
};

exports.adminDetail = async (req, res) => {
  try {
    await ensureInviteSchema(pool);
    const id = Number(req.params.id || req.query.id);

    if (!id) {
      return fail(res, 'User id is required', 400);
    }

    const [[user]] = await pool.query(
      `${getUserSelectSql()} WHERE u.id = ?`,
      [id]
    );

    if (!user) {
      return fail(res, 'User not found', 404);
    }

    success(res, user);
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to get admin user detail');
  }
};

exports.adminCreate = async (req, res) => {
  try {
    const body = req.body || {};
    const email = String(body.email || '').trim();
    const nickname = String(body.nickname || '').trim();
    const avatar = body.avatar === undefined || body.avatar === null ? '' : String(body.avatar);
    const status = body.status === undefined || body.status === '' ? 1 : Number(body.status);
    const canLottery = body.canLottery ?? body.can_lottery;
    const registerIp = pickBodyValue(body, 'registerIp', 'register_ip') ||
      req.headers['x-forwarded-for'] ||
      req.socket?.remoteAddress ||
      '';

    if (!email) {
      return fail(res, 'User email is required', 400);
    }

    const [[exists]] = await pool.query(
      'SELECT id FROM `user` WHERE email = ? LIMIT 1',
      [email]
    );

    if (exists) {
      return fail(res, 'User email already exists', 400);
    }

    await ensureInviteSchema(pool);
    const inviteCode = await generateInviteCode(pool);

    const [result] = await pool.query(
      `INSERT INTO \`user\`
        (email, nickname, avatar, status, register_ip, login_count, invite_code, can_lottery, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, 0, ?, ?, NOW(), NOW())`,
      [
        email,
        nickname,
        avatar,
        status,
        String(registerIp),
        inviteCode,
        canLottery === undefined || canLottery === '' ? 0 : Number(canLottery)
      ]
    );

    const id = result.insertId;
    const [[user]] = await pool.query(
      `${getUserSelectSql()} WHERE u.id = ?`,
      [id]
    );

    success(res, user, 'created');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to create admin user');
  }
};

exports.adminUpdate = async (req, res) => {
  try {
    await ensureInviteSchema(pool);
    const body = req.body || {};
    const id = Number(body.id ?? req.params.id);

    if (!id) {
      return fail(res, 'User id is required', 400);
    }

    const fields = [];
    const params = [];
    const updateMap = [
      ['email', 'email'],
      ['nickname', 'nickname'],
      ['avatar', 'avatar'],
      ['status', 'status'],
      ['canLottery', 'can_lottery']
    ];

    for (const [camelKey, column] of updateMap) {
      const value = pickBodyValue(body, camelKey, column);

      if (value !== undefined) {
        fields.push(`${column} = ?`);
        params.push(['status', 'can_lottery'].includes(column) ? Number(value) : String(value));
      }
    }

    if (!fields.length) {
      return fail(res, 'No user fields to update', 400);
    }

    params.push(id);

    const [result] = await pool.query(
      `UPDATE \`user\` SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`,
      params
    );

    if (!result.affectedRows) {
      return fail(res, 'User not found', 404);
    }

    const [[user]] = await pool.query(
      `${getUserSelectSql()} WHERE u.id = ?`,
      [id]
    );

    success(res, user, 'updated');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to update admin user');
  }
};

exports.adminUpdateStatus = async (req, res) => {
  try {
    const id = Number(req.body?.id ?? req.params.id);
    const status = req.body?.status;

    if (!id) {
      return fail(res, 'User id is required', 400);
    }

    if (status === undefined || status === '') {
      return fail(res, 'User status is required', 400);
    }

    const [result] = await pool.query(
      'UPDATE `user` SET status = ?, updated_at = NOW() WHERE id = ?',
      [Number(status), id]
    );

    if (!result.affectedRows) {
      return fail(res, 'User not found', 404);
    }

    success(res, { id, status: Number(status) }, 'updated');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to update admin user status');
  }
};

exports.adminDelete = async (req, res) => {
  try {
    const id = Number(req.body?.id ?? req.query.id ?? req.params.id);

    if (!id) {
      return fail(res, 'User id is required', 400);
    }

    const [result] = await pool.query(
      'DELETE FROM `user` WHERE id = ?',
      [id]
    );

    if (!result.affectedRows) {
      return fail(res, 'User not found', 404);
    }

    success(res, { id }, 'deleted');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to delete admin user');
  }
};
