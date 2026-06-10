function success(res, data = null, message = 'success') {
  res.json({ code: 0, message, data });
}

function fail(res, message = 'error', code = 500) {
  res.status(code).json({ code, message, data: null });
}

module.exports = { success, fail };
