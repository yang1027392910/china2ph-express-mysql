const authService = require('../services/auth.service');
const { success, fail } = require('../utils/response');

function buildLoginData(user) {
  const token = authService.generateToken(user);

  return {
    accessToken: token,
    token,
    user
  };
}

exports.h5Login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const h5Username = process.env.H5_USERNAME || 'h5';
    const h5Password = process.env.H5_PASSWORD || '123456';

    if (username !== h5Username || !authService.verifyPassword(password, h5Password)) {
      return fail(res, 'Invalid username or password', 401);
    }

    success(res, buildLoginData({
      id: 1,
      username: h5Username,
      role: 'h5'
    }));
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to login');
  }
};

exports.adminLogin = async (req, res) => {
  try {
    const { username, password } = req.body;
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || '123456';

    if (username !== adminUsername || !authService.verifyPassword(password, adminPassword)) {
      return fail(res, 'Invalid username or password', 401);
    }

    success(res, buildLoginData({
      id: 1,
      username: adminUsername,
      role: 'admin'
    }));
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to login');
  }
};
