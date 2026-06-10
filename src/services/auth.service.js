const crypto = require('crypto');

const TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || 'china2ph-auth-secret';
const TOKEN_EXPIRES_IN = Number(process.env.AUTH_TOKEN_EXPIRES_IN || 60 * 60 * 24);

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function fromBase64url(input) {
  const value = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(value, 'base64').toString('utf8');
}

function sign(value) {
  return crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(value)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function safeEqual(a, b) {
  const aBuffer = Buffer.from(String(a));
  const bBuffer = Buffer.from(String(b));

  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function verifyPassword(password, passwordHash) {
  if (!password || !passwordHash) return false;

  if (passwordHash.startsWith('sha256:')) {
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    return safeEqual(hash, passwordHash.replace('sha256:', ''));
  }

  return safeEqual(password, passwordHash);
}

function generateToken(payload) {
  const now = Math.floor(Date.now() / 1000);
  const tokenPayload = {
    ...payload,
    iat: now,
    exp: now + TOKEN_EXPIRES_IN
  };
  const encodedPayload = base64url(JSON.stringify(tokenPayload));
  const signature = sign(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

function verifyToken(token) {
  if (!token) return null;

  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;
  if (!safeEqual(signature, sign(encodedPayload))) return null;

  try {
    const payload = JSON.parse(fromBase64url(encodedPayload));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) return null;
    return payload;
  } catch (error) {
    return null;
  }
}

module.exports = {
  verifyPassword,
  generateToken,
  verifyToken
};
