const pool = require('../config/db');
const { success, fail } = require('../utils/response');

exports.detail = async (req, res) => {
  try {
    const userId = Number(req.user?.id || 0);

    if (!userId) {
      return fail(res, 'Unauthorized', 401);
    }

    const [[user]] = await pool.query(
      `SELECT
        id,
        email,
        nickname,
        avatar,
        status,
        verification_status AS verificationStatus,
        register_ip AS registerIp,
        last_login_ip AS lastLoginIp,
        login_count AS loginCount,
        last_login_time AS lastLoginTime,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM \`user\`
      WHERE id = ?
      LIMIT 1`,
      [userId]
    );

    if (!user) {
      return fail(res, 'User not found', 404);
    }

    success(res, {
      ...user,
      verificationStatus: Number(user.verificationStatus ?? -1),
      role: 'h5'
    });
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to get user detail');
  }
};
