const pool = require('../config/db');
const { success, fail } = require('../utils/response');
const { ensureInviteSchema } = require('../utils/invite');

function getPagination(query) {
  const page = Math.max(Number(query.page || 1), 1);
  const pageSize = Math.max(Number(query.pageSize || 10), 1);
  const offset = (page - 1) * pageSize;

  return { page, pageSize, offset };
}

function buildWhere(query) {
  const where = [];
  const params = [];
  const keyword = String(query.keyword || '').trim();
  const status = query.status;

  if (keyword) {
    where.push(`(
      uv.full_name LIKE ?
      OR uv.phone LIKE ?
      OR uv.email LIKE ?
      OR uv.shop_name LIKE ?
    )`);
    const keywordValue = `%${keyword}%`;
    params.push(keywordValue, keywordValue, keywordValue, keywordValue);
  }

  if (status !== undefined && status !== '') {
    where.push('uv.status = ?');
    params.push(Number(status));
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params
  };
}

function getSelectSql() {
  return `SELECT
    uv.id,
    uv.user_id AS userId,
    uv.full_name AS fullName,
    uv.phone,
    uv.email,
    uv.address,
    uv.city,
    uv.shop_name AS shopName,
    uv.business_type AS businessType,
    uv.store_description AS storeDescription,
    uv.store_photos AS storePhotos,
    uv.status,
    uv.remark,
    uv.reviewed_at AS reviewedAt,
    uv.created_at AS createdAt,
    uv.updated_at AS updatedAt,
    COALESCE(u.email, uv.email) AS user_name,
    COALESCE(u.email, uv.email) AS userName,
    u.nickname AS userNickname
  FROM user_verification uv
  LEFT JOIN \`user\` u ON u.id = uv.user_id`;
}

exports.adminList = async (req, res) => {
  try {
    const { page, pageSize, offset } = getPagination(req.query);
    const { whereSql, params } = buildWhere(req.query);

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total
      FROM user_verification uv
      ${whereSql}`,
      params
    );

    const [list] = await pool.query(
      `${getSelectSql()}
      ${whereSql}
      ORDER BY uv.created_at DESC, uv.id DESC
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
    fail(res, 'Failed to get user verification list');
  }
};

async function reviewVerification(req, res, status, successMessage) {
  const connection = await pool.getConnection();

  try {
    const id = Number(req.params.id);
    const remark = req.body?.remark === undefined
      ? null
      : String(req.body.remark).trim() || null;

    if (!Number.isInteger(id) || id <= 0) {
      return fail(res, 'User verification id is required', 400);
    }

    await ensureInviteSchema(pool);
    await connection.beginTransaction();

    const [[verification]] = await connection.query(
      `SELECT id,
        user_id AS userId,
        invite_counted AS inviteCounted
      FROM user_verification
      WHERE id = ?
      LIMIT 1
      FOR UPDATE`,
      [id]
    );

    if (!verification) {
      await connection.rollback();
      return fail(res, 'User verification not found', 404);
    }

    const [[reviewedUser]] = await connection.query(
      `SELECT id,
        verification_status AS verificationStatus,
        inviter_id AS inviterId
      FROM \`user\`
      WHERE id = ?
      LIMIT 1
      FOR UPDATE`,
      [verification.userId]
    );

    await connection.query(
      `UPDATE user_verification
      SET status = ?,
        remark = ?,
        reviewed_at = NOW()
      WHERE id = ?`,
      [status, remark, id]
    );

    await connection.query(
      `UPDATE \`user\`
      SET verification_status = ?,
        updated_at = NOW()
      WHERE id = ?`,
      [status, verification.userId]
    );

    if (
      status === 1 &&
      reviewedUser &&
      Number(reviewedUser.verificationStatus) !== 1 &&
      Number(verification.inviteCounted || 0) !== 1 &&
      reviewedUser.inviterId
    ) {
      // 只有被邀请用户首次从非通过变成通过时，才给邀请人增加一次有效邀请。
      await connection.query(
        `UPDATE \`user\`
        SET invite_count = invite_count + 1,
          can_lottery = IF(invite_count + 1 >= 3, 1, can_lottery),
          updated_at = NOW()
        WHERE id = ?`,
        [reviewedUser.inviterId]
      );

      await connection.query(
        `UPDATE user_verification
        SET invite_counted = 1
        WHERE id = ?`,
        [id]
      );
    }

    const [[reviewedVerification]] = await connection.query(
      `${getSelectSql()} WHERE uv.id = ?`,
      [id]
    );

    await connection.commit();
    success(res, reviewedVerification, successMessage);
  } catch (error) {
    await connection.rollback();
    console.error(error);
    fail(res, 'Failed to review user verification');
  } finally {
    connection.release();
  }
}

exports.adminApprove = async (req, res) => {
  await reviewVerification(req, res, 1, 'approved');
};

exports.adminReject = async (req, res) => {
  await reviewVerification(req, res, 2, 'rejected');
};
