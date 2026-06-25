const authService = require('../services/auth.service');
const pool = require('../config/db');
const { success, fail } = require('../utils/response');
const {
  ensureInviteSchema,
  findInviterByCode,
  generateInviteCode
} = require('../utils/invite');

function buildLoginData(user) {
  const token = authService.generateToken(user);

  return {
    accessToken: token,
    token,
    user
  };
}

function generateEmailCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];

  if (forwardedFor) {
    return String(forwardedFor).split(',')[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || '';
}

function buildH5User(row) {
  return {
    id: row.id,
    email: row.email,
    nickname: row.nickname,
    avatar: row.avatar,
    status: row.status,
    verificationStatus: Number(row.verification_status ?? -1),
    inviteCode: row.invite_code || null,
    inviterId: row.inviter_id === null || row.inviter_id === undefined ? null : Number(row.inviter_id),
    inviteCount: Number(row.invite_count || 0),
    canLottery: Number(row.can_lottery || 0),
    role: 'h5'
  };
}

exports.sendEmailCode = async (req, res) => {
  try {
    const body = req.body || {};
    const email = String(body.email || '').trim();
    const scene = String(body.scene || 'login').trim() || 'login';
    const expireMinutes = Math.max(Number(body.expireMinutes || 5), 1);

    if (!email) {
      return fail(res, 'Email is required', 400);
    }

    if (!isValidEmail(email)) {
      return fail(res, 'Invalid email format', 400);
    }

    await pool.query(
      `UPDATE email_code_log
      SET status = 2
      WHERE email = ? AND scene = ? AND status = 0 AND expire_time <= NOW()`,
      [email, scene]
    );

    const [[recentLog]] = await pool.query(
      `SELECT id
      FROM email_code_log
      WHERE email = ? AND scene = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 60 SECOND)
      ORDER BY id DESC
      LIMIT 1`,
      [email, scene]
    );

    if (recentLog) {
      return fail(res, 'Please request again later', 429);
    }

    const code = generateEmailCode();
    const ip = getClientIp(req);

    const [result] = await pool.query(
      `INSERT INTO email_code_log
        (email, code, scene, status, send_status, expire_time, ip)
      VALUES
        (?, ?, ?, 0, 1, DATE_ADD(NOW(), INTERVAL ? MINUTE), ?)`,
      [email, code, scene, expireMinutes, ip]
    );

    const [[log]] = await pool.query(
      `SELECT
        id,
        email,
        scene,
        status,
        send_status AS sendStatus,
        expire_time AS expireTime,
        created_at AS createdAt
      FROM email_code_log
      WHERE id = ?`,
      [result.insertId]
    );

    success(res, {
      ...log,
      code
    }, 'sent');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to send email code');
  }
};

exports.h5EmailCodeLogin = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const body = req.body || {};
    const email = String(body.email || '').trim();
    const code = String(body.code || '').trim();
    const requestInviteCode = String(body.inviteCode || body.invite_code || '').trim();
    const scene = String(body.scene || 'login').trim() || 'login';
    const ip = getClientIp(req);
    const testEmailCodeEnabled = process.env.ENABLE_TEST_EMAIL_CODE === 'true';
    const testEmailCode = process.env.TEST_EMAIL_CODE || '123456';
    // Temporary production verification fallback. Remove after testing.
    const isTestEmailCode =
      code === '123456' ||
      (testEmailCodeEnabled && code === testEmailCode);

    if (!email) {
      return fail(res, 'Email is required', 400);
    }

    if (!isValidEmail(email)) {
      return fail(res, 'Invalid email format', 400);
    }

    if (!code) {
      return fail(res, 'Email code is required', 400);
    }

    await ensureInviteSchema(pool);
    await connection.beginTransaction();

    await connection.query(
      `UPDATE email_code_log
      SET status = 2
      WHERE email = ? AND scene = ? AND status = 0 AND expire_time <= NOW()`,
      [email, scene]
    );

    let codeLog = null;

    if (!isTestEmailCode) {
      [[codeLog]] = await connection.query(
        `SELECT id
        FROM email_code_log
        WHERE email = ?
          AND code = ?
          AND scene = ?
          AND status = 0
          AND send_status = 1
          AND expire_time > NOW()
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE`,
        [email, code, scene]
      );
    }

    if (!isTestEmailCode && !codeLog) {
      await connection.rollback();
      return fail(res, 'Invalid or expired email code', 400);
    }

    const [[existingUser]] = await connection.query(
      `SELECT
        id,
        email,
        nickname,
        avatar,
        status,
        verification_status,
        invite_code,
        inviter_id,
        invite_count,
        can_lottery
      FROM \`user\`
      WHERE email = ?
      LIMIT 1
      FOR UPDATE`,
      [email]
    );

    if (existingUser && Number(existingUser.status) !== 1) {
      await connection.rollback();
      return fail(res, 'User is disabled', 403);
    }

    const newLogin = !existingUser;
    let userId = existingUser?.id;

    if (!userId) {
      const nickname = email.split('@')[0];
      const ownInviteCode = await generateInviteCode(connection);
      const inviter = await findInviterByCode(connection, requestInviteCode);

      // 只有新注册用户才允许绑定邀请人，老用户登录不会修改 inviter_id。
      const [result] = await connection.query(
        `INSERT INTO \`user\`
          (email, nickname, avatar, status, register_ip, last_login_ip, login_count, last_login_time, invite_code, inviter_id, created_at, updated_at)
        VALUES
          (?, ?, '', 1, ?, ?, 1, NOW(), ?, ?, NOW(), NOW())`,
        [email, nickname, ip, ip, ownInviteCode, inviter?.id || null]
      );

      userId = result.insertId;
    } else {
      await connection.query(
        `UPDATE \`user\`
        SET last_login_ip = ?,
          login_count = login_count + 1,
          last_login_time = NOW(),
          updated_at = NOW()
        WHERE id = ?`,
        [ip, userId]
      );
    }

    if (codeLog) {
      await connection.query(
        'UPDATE email_code_log SET status = 1 WHERE id = ?',
        [codeLog.id]
      );
    }

    const [[user]] = await connection.query(
      `SELECT
        id,
        email,
        nickname,
        avatar,
        status,
        verification_status,
        invite_code,
        inviter_id,
        invite_count,
        can_lottery
      FROM \`user\`
      WHERE id = ?`,
      [userId]
    );

    await connection.commit();

    success(res, {
      ...buildLoginData(buildH5User(user)),
      newLogin,
      isNewUser: newLogin
    });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    fail(res, 'Failed to login with email code');
  } finally {
    connection.release();
  }
};

exports.h5Login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const h5Username = process.env.H5_USERNAME || 'h5';
    const h5Password = process.env.H5_PASSWORD || '123456';

    if (username !== h5Username || !authService.verifyPassword(password, h5Password)) {
      return fail(res, 'Invalid username or password', 401);
    }

    success(res, buildLoginData({
      id: 1,
      username: h5Username,
      role: 'h5'
    }));
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to login');
  }
};

exports.adminLogin = async (req, res) => {
  try {
    const { username, password } = req.body;
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || '123456';

    if (username !== adminUsername || !authService.verifyPassword(password, adminPassword)) {
      return fail(res, 'Invalid username or password', 401);
    }

    success(res, buildLoginData({
      id: 1,
      username: adminUsername,
      role: 'admin'
    }));
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to login');
  }
};
