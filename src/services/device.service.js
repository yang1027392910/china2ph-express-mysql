function getRequestUserAgent(req) {
  return String(req.headers['user-agent'] || '').trim();
}

function detectDevice(userAgent) {
  const ua = String(userAgent || '').toLowerCase();

  if (!ua) return 'Unknown';

  if (
    ua.includes('mobile') ||
    ua.includes('android') ||
    ua.includes('iphone') ||
    ua.includes('ipad') ||
    ua.includes('ipod') ||
    ua.includes('windows phone')
  ) {
    return 'H5';
  }

  return 'PC';
}

module.exports = {
  detectDevice,
  getRequestUserAgent
};
