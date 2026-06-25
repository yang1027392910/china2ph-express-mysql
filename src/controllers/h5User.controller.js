const pool = require('../config/db');
const { success, fail } = require('../utils/response');
const { ensureInviteSchema, ensureUserInviteCode } = require('../utils/invite');

exports.detail = async (req, res) => {
  try {
    const userId = Number(req.user?.id || 0);

    if (!userId) {
      return fail(res, 'Unauthorized', 401);
    }

    await ensureInviteSchema(pool);

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
        invite_code AS inviteCode,
        inviter_id AS inviterId,
        invite_count AS inviteCount,
        can_lottery AS canLottery,
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

    // 兼容历史用户：首次进入个人详情时自动补齐自己的邀请码。
    const inviteCode = user.inviteCode || await ensureUserInviteCode(pool, userId);

    success(res, {
      ...user,
      verificationStatus: Number(user.verificationStatus ?? -1),
      inviteCode,
      inviterId: user.inviterId === null || user.inviterId === undefined ? null : Number(user.inviterId),
      inviteCount: Number(user.inviteCount || 0),
      canLottery: Number(user.canLottery || 0),
      role: 'h5'
    });
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to get user detail');
  }
};
