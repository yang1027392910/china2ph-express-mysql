const https = require('https');

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 1200;
const locationCache = new Map();

function normalizeIp(value) {
  if (!value) return '';

  const ip = String(value)
    .split(',')[0]
    .trim()
    .replace(/^::ffff:/, '');

  return ip === '::1' ? '127.0.0.1' : ip;
}

function isPrivateIp(ip) {
  if (!ip) return true;
  if (ip === '127.0.0.1' || ip === 'localhost') return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;

  const parts = ip.split('.').map(part => Number(part));
  if (parts.length === 4 && parts.every(part => Number.isInteger(part))) {
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
  }

  return false;
}

function requestJson(url) {
  return new Promise((resolve) => {
    const req = https.get(url, (res) => {
      let body = '';

      res.setEncoding('utf8');
      res.on('data', chunk => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          resolve(null);
        }
      });
    });

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
  });
}

async function lookupIpLocation(ipValue) {
  const ip = normalizeIp(ipValue);

  if (!ip) return '';
  if (isPrivateIp(ip)) return 'Local Network';

  const cached = locationCache.get(ip);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const data = await requestJson(`https://ipwho.is/${encodeURIComponent(ip)}`);
  const value = data?.success === true
    ? [data.country, data.region].filter(Boolean).join(', ')
    : '';

  locationCache.set(ip, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS
  });

  return value;
}

async function attachIpLocation(users) {
  const uniqueIps = Array.from(new Set(
    users
      .map(user => normalizeIp(user.lastLoginIp || user.registerIp))
      .filter(Boolean)
  ));
  const locationMap = new Map();

  await Promise.all(uniqueIps.map(async (ip) => {
    locationMap.set(ip, await lookupIpLocation(ip));
  }));

  return users.map(user => {
    const ip = normalizeIp(user.lastLoginIp || user.registerIp);

    return {
      ...user,
      ipLocation: locationMap.get(ip) || ''
    };
  });
}

module.exports = {
  attachIpLocation,
  lookupIpLocation,
  normalizeIp
};
