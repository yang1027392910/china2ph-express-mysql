const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { success, fail } = require('../utils/response');

const uploadDir = path.join(__dirname, '..', '..', 'uploads');
const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml'
]);

function getExtension(mimeType, originalName = '') {
  const ext = path.extname(originalName).toLowerCase();
  if (ext) return ext;

  const map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg'
  };

  return map[mimeType] || '';
}

function parseMultipartFile(req) {
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);

  if (!boundaryMatch) return null;

  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
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
    if (part.length >= 2 && part[part.length - 2] === 13 && part[part.length - 1] === 10) {
      part = part.slice(0, -2);
    }

    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd !== -1) {
      const headersText = part.slice(0, headerEnd).toString('utf8');
      const content = part.slice(headerEnd + 4);
      const disposition = headersText.match(/content-disposition:\s*([^\r\n]+)/i)?.[1] || '';
      const filename = disposition.match(/filename="([^"]*)"/i)?.[1];
      const fieldName = disposition.match(/name="([^"]+)"/i)?.[1];
      const mimeType = headersText.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim();

      if (filename && ['file', 'image', 'avatar'].includes(fieldName)) {
        return {
          buffer: content,
          mimeType,
          originalName: path.basename(filename)
        };
      }
    }

    cursor = nextBoundary;
  }

  return null;
}

exports.uploadImage = async (req, res) => {
  try {
    const file = parseMultipartFile(req);

    if (!file) {
      return fail(res, 'Image file is required', 400);
    }

    if (!allowedMimeTypes.has(file.mimeType)) {
      return fail(res, 'Only image files are allowed', 400);
    }

    await fs.mkdir(uploadDir, { recursive: true });

    const extension = getExtension(file.mimeType, file.originalName);
    const fileName = `${Date.now()}-${crypto.randomUUID()}${extension}`;
    const filePath = path.join(uploadDir, fileName);

    await fs.writeFile(filePath, file.buffer);

    success(res, {
      url: `/uploads/${fileName}`,
      fileName,
      originalName: file.originalName,
      size: file.buffer.length,
      mimeType: file.mimeType
    }, 'uploaded');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to upload image');
  }
};
