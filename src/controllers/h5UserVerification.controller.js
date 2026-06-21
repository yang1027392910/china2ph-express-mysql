const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const pool = require('../config/db');
const { success, fail } = require('../utils/response');

const uploadDir = path.join(__dirname, '..', '..', 'uploads');
const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
]);

function parseMultipartForm(req) {
  if (!Buffer.isBuffer(req.body)) return null;

  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) return null;

  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const fields = {};
  const files = [];
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
      const mimeType =
        headersText.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || '';

      if (fieldName && filename) {
        if (['store_photos', 'storePhotos'].includes(fieldName)) {
          files.push({
            buffer: content,
            mimeType,
            originalName: path.basename(filename)
          });
        }
      } else if (fieldName) {
        fields[fieldName] = content.toString('utf8');
      }
    }

    cursor = nextBoundary;
  }

  return { fields, files };
}

function getExtension(mimeType, originalName) {
  const extension = path.extname(originalName).toLowerCase();
  if (extension) return extension;

  return {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp'
  }[mimeType] || '';
}

async function saveStorePhotos(files) {
  if (!files.length) return [];

  for (const file of files) {
    if (!allowedMimeTypes.has(file.mimeType)) {
      const error = new Error('Only JPG, PNG, GIF and WebP images are allowed');
      error.statusCode = 400;
      throw error;
    }
  }

  await fs.mkdir(uploadDir, { recursive: true });

  const paths = [];
  for (const file of files) {
    const fileName = `${Date.now()}-${crypto.randomUUID()}${getExtension(
      file.mimeType,
      file.originalName
    )}`;
    await fs.writeFile(path.join(uploadDir, fileName), file.buffer);
    paths.push(`/uploads/${fileName}`);
  }

  return paths;
}

function normalizeRequiredText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeOptionalText(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value).trim() || null;
}

function normalizeStorePhotos(value) {
  if (value === undefined || value === null || value === '') return null;

  if (Array.isArray(value)) {
    return JSON.stringify(value.map(item => String(item)));
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) return null;
      return JSON.stringify(parsed.map(item => String(item)));
    } catch (error) {
      return null;
    }
  }

  return null;
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
    shop_name AS shopName,
    business_type AS businessType,
    store_description AS storeDescription,
    store_photos AS storePhotos,
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
  const savedPhotoPaths = [];

  try {
    const userId = Number(req.user?.id || 0);
    const multipartForm = parseMultipartForm(req);
    const body = multipartForm?.fields || req.body || {};
    const fullName = normalizeRequiredText(body.fullName ?? body.full_name);
    const phone = normalizeRequiredText(body.phone);
    const email = normalizeOptionalText(body.email);
    const address = normalizeRequiredText(body.address);
    const city = normalizeRequiredText(body.city);
    const shopName = normalizeRequiredText(body.shopName ?? body.shop_name);
    const businessType = normalizeRequiredText(
      body.businessType ?? body.business_type
    );
    const storeDescription = normalizeOptionalText(
      body.storeDescription ?? body.store_description
    );
    let storePhotos = normalizeStorePhotos(body.storePhotos ?? body.store_photos);

    if (!userId) {
      return fail(res, 'Unauthorized', 401);
    }

    if (!fullName) return fail(res, 'Full name is required', 400);
    if (!phone) return fail(res, 'Phone is required', 400);
    if (!address) return fail(res, 'Address is required', 400);
    if (!city) return fail(res, 'City is required', 400);
    if (!shopName) return fail(res, 'Shop name is required', 400);
    if (!businessType) return fail(res, 'Business type is required', 400);

    if (
      (body.storePhotos !== undefined || body.store_photos !== undefined) &&
      storePhotos === null
    ) {
      return fail(res, 'Store photos must be an array', 400);
    }

    if (multipartForm?.files.length) {
      const uploadedPaths = await saveStorePhotos(multipartForm.files);
      savedPhotoPaths.push(...uploadedPaths);
      storePhotos = JSON.stringify(uploadedPaths);
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
          store_description,
          store_photos,
          status,
          remark,
          reviewed_at
        )
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL)
      ON DUPLICATE KEY UPDATE
        full_name = VALUES(full_name),
        phone = VALUES(phone),
        email = VALUES(email),
        address = VALUES(address),
        city = VALUES(city),
        shop_name = VALUES(shop_name),
        business_type = VALUES(business_type),
        store_description = VALUES(store_description),
        store_photos = VALUES(store_photos),
        status = 0,
        remark = NULL,
        reviewed_at = NULL`,
      [
        userId,
        fullName,
        phone,
        email,
        address,
        city,
        shopName,
        businessType,
        storeDescription,
        storePhotos
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
    await Promise.all(
      savedPhotoPaths.map(photoPath =>
        fs.unlink(path.join(uploadDir, path.basename(photoPath))).catch(() => {})
      )
    );
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
