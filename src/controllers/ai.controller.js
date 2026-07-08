const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const multer = require('multer');
const imageTranslationService = require('../services/imageTranslation.service');

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const uploadDir = path.join(__dirname, '..', '..', 'uploads');
const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp'
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_SIZE,
    files: 1
  },
  fileFilter(req, file, callback) {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return callback(new Error('Only image files are allowed'));
    }

    callback(null, true);
  }
});

function isImageMimeType(mimeType) {
  return allowedMimeTypes.has(String(mimeType || '').split(';')[0].trim().toLowerCase());
}

function sendFail(res, message, statusCode = 500) {
  res.status(statusCode).json({
    success: false,
    message
  });
}

async function saveEditedImage(buffer) {
  await fs.mkdir(uploadDir, { recursive: true });

  const fileName = `${Date.now()}-${crypto.randomUUID()}-edited.png`;
  const filePath = path.join(uploadDir, fileName);

  await fs.writeFile(filePath, buffer);

  return `/uploads/${fileName}`;
}

function handleUpload(req, res) {
  return new Promise((resolve, reject) => {
    upload.single('image')(req, res, error => {
      if (error) return reject(error);
      resolve();
    });
  });
}

function isMultipartRequest(req) {
  return String(req.headers['content-type'] || '').toLowerCase().includes('multipart/form-data');
}

function normalizeImageUrl(value, req) {
  const imageUrl = String(value || '').trim();
  if (!imageUrl) return '';

  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const url = imageUrl.startsWith('/') ? new URL(imageUrl, baseUrl) : new URL(imageUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.toString();
  } catch (error) {
    return '';
  }
}

async function fetchImageFromUrl(imageUrl) {
  const response = await fetch(imageUrl);

  if (!response.ok) {
    const error = new Error('Failed to download image');
    error.statusCode = 400;
    throw error;
  }

  const contentType = response.headers.get('content-type') || '';
  if (!isImageMimeType(contentType)) {
    const error = new Error('Only image files are allowed');
    error.statusCode = 400;
    throw error;
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_IMAGE_SIZE) {
    const error = new Error('Image size must not exceed 5MB');
    error.statusCode = 413;
    throw error;
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length > MAX_IMAGE_SIZE) {
    const error = new Error('Image size must not exceed 5MB');
    error.statusCode = 413;
    throw error;
  }

  return {
    buffer,
    mimetype: contentType.split(';')[0].trim().toLowerCase(),
    originalname: imageUrl.split('/').pop() || 'image'
  };
}

async function getRequestImage(req, res) {
  if (isMultipartRequest(req)) {
    await handleUpload(req, res);
    return req.file;
  }

  const imageUrl = normalizeImageUrl(req.body?.imageUrl || req.body?.url || req.body?.image, req);
  if (imageUrl) {
    return fetchImageFromUrl(imageUrl);
  }

  return null;
}

exports.translateImage = async (req, res) => {
  try {
    const file = await getRequestImage(req, res);

    if (!file) {
      return sendFail(res, 'Image file, imageUrl, or image path is required', 400);
    }

    const editedImageBuffer = await imageTranslationService.editProductImageText(file);
    const imageUrl = await saveEditedImage(editedImageBuffer);

    res.json({
      image: imageUrl
    });
  } catch (error) {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return sendFail(res, 'Image size must not exceed 5MB', 413);
    }

    if (error.message === 'Only image files are allowed') {
      return sendFail(res, error.message, 400);
    }

    console.error(error);
    sendFail(res, error.message || 'OpenAI request failed', error.statusCode || 500);
  }
};
