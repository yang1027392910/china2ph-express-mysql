const pool = require('../config/db');
const { success, fail } = require('../utils/response');

function parseMultipartForm(req) {
  if (!Buffer.isBuffer(req.body)) return null;

  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) return null;

  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const fields = {};
  let cursor = req.body.indexOf(boundary);

  while (cursor !== -1) {
    let partStart = cursor + boundary.length;

    if (req.body[partStart] === 45 && req.body[partStart + 1] === 45) break;
    if (req.body[partStart] === 13 && req.body[partStart + 1] === 10) {
      partStart += 2;
    }

    const nextBoundary = req.body.indexOf(boundary, partStart);
    if (nextBoundary === -1) break;

    let part = req.body.slice(partStart, nextBoundary);
    if (
      part.length >= 2 &&
      part[part.length - 2] === 13 &&
      part[part.length - 1] === 10
    ) {
      part = part.slice(0, -2);
    }

    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd !== -1) {
      const headersText = part.slice(0, headerEnd).toString('utf8');
      const content = part.slice(headerEnd + 4);
      const disposition =
        headersText.match(/content-disposition:\s*([^\r\n]+)/i)?.[1] || '';
      const fieldName = disposition.match(/name="([^"]+)"/i)?.[1];
      const filename = disposition.match(/filename="([^"]*)"/i)?.[1];
      if (fieldName && !filename) {
        fields[fieldName] = content.toString('utf8');
      }
    }

    cursor = nextBoundary;
  }

  return { fields };
}

function normalizeRequiredText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeOptionalText(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value).trim() || null;
}

function getVerificationSelectSql() {
  return `SELECT
    id,
    user_id AS userId,
    full_name AS fullName,
    phone,
    email,
    address,
    city,
    status,
    remark,
    reviewed_at AS reviewedAt,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM user_verification`;
}

exports.detail = async (req, res) => {
  try {
    const currentUserId = Number(req.user?.id || 0);
    const requestedUserId = Number(req.query.userId || currentUserId);

    if (!requestedUserId) {
      return fail(res, 'User id is required', 400);
    }

    if (requestedUserId !== currentUserId) {
      return fail(res, 'Forbidden', 403);
    }

    const [[verification]] = await pool.query(
      `${getVerificationSelectSql()} WHERE user_id = ? LIMIT 1`,
      [requestedUserId]
    );

    if (!verification) {
      return fail(res, 'User verification not found', 404);
    }

    success(res, verification);
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to get user verification detail');
  }
};

exports.submit = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const userId = Number(req.user?.id || 0);
    const multipartForm = parseMultipartForm(req);
    const body = multipartForm?.fields || req.body || {};
    const fullName = normalizeRequiredText(body.fullName ?? body.full_name);
    const phone = normalizeRequiredText(body.phone);
    const email = normalizeOptionalText(body.email);
    const address = normalizeRequiredText(body.address);
    const city = normalizeRequiredText(body.city);
    const remark = normalizeOptionalText(body.remark);

    if (!userId) {
      return fail(res, 'Unauthorized', 401);
    }

    if (!fullName) return fail(res, 'Full name is required', 400);
    if (!phone) return fail(res, 'Phone is required', 400);
    if (!address) return fail(res, 'Address is required', 400);
    if (!city) return fail(res, 'City is required', 400);
    for (const [name, value, max] of [
      ['full_name', fullName, 100], ['phone', phone, 50], ['email', email, 100],
      ['address', address, 255], ['city', city, 100], ['remark', remark, 255]
    ]) {
      if (value && [...value].length > max) return fail(res, name + ' is too long', 400);
    }

    await connection.beginTransaction();

    await connection.query(
      `INSERT INTO user_verification
        (
          user_id,
          full_name,
          phone,
          email,
          address,
          city,
          shop_name,
          business_type,
          status,
          remark,
          reviewed_at
        )
      VALUES
        (?, ?, ?, ?, ?, ?, '', '', 0, ?, NULL)
      ON DUPLICATE KEY UPDATE
        full_name = VALUES(full_name),
        phone = VALUES(phone),
        email = VALUES(email),
        address = VALUES(address),
        city = VALUES(city),
        status = 0,
        remark = VALUES(remark),
        reviewed_at = NULL`,
      [
        userId,
        fullName,
        phone,
        email,
        address,
        city,
        remark
      ]
    );

    await connection.query(
      `UPDATE \`user\`
      SET verification_status = 0,
        updated_at = NOW()
      WHERE id = ?`,
      [userId]
    );

    const [[verification]] = await connection.query(
      `${getVerificationSelectSql()} WHERE user_id = ?`,
      [userId]
    );

    await connection.commit();
    success(res, verification, 'submitted');
  } catch (error) {
    await connection.rollback();
    console.error(error);
    fail(
      res,
      error.statusCode ? error.message : 'Failed to submit user verification',
      error.statusCode || 500
    );
  } finally {
    connection.release();
  }
};
