const authService = require('../services/auth.service');
const { fail } = require('../utils/response');

function getToken(req) {
  const authorization = req.headers.authorization || '';

  if (authorization) {
    const [scheme, token] = authorization.split(' ');

    if (/^Bearer$/i.test(scheme) && token) {
      return token;
    }

    return authorization;
  }

  return req.headers.token ||
    req.headers['access-token'] ||
    req.headers['x-access-token'] ||
    req.query.token ||
    req.body?.token;
}

function auth(req, res, next) {
  const token = getToken(req);
  const user = authService.verifyToken(token);

  if (!user) {
    return fail(res, 'Unauthorized', 401);
  }

  req.user = user;
  next();
}

function optionalAuth(req, res, next) {
  const token = getToken(req);

  if (token) {
    req.user = authService.verifyToken(token) || null;
  }

  next();
}

function adminAuth(req, res, next) {
  auth(req, res, () => {
    if (req.user.role !== 'admin') {
      return fail(res, 'Forbidden', 403);
    }

    next();
  });
}

module.exports = {
  auth,
  optionalAuth,
  adminAuth
};
