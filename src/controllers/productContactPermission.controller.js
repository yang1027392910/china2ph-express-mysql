const permissionService = require('../services/productContactPermission.service');
const { success, fail } = require('../utils/response');

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

exports.adminList = async (req, res) => {
  try {
    const productId = parseId(req.params.id);

    if (!productId) {
      return fail(res, 'Product id is required', 400);
    }

    const list = await permissionService.getProductPermissions(productId);
    success(res, list);
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to get product contact permissions');
  }
};

exports.adminAdd = async (req, res) => {
  try {
    const productId = parseId(req.params.id);
    const userId = parseId(req.body?.userId);

    if (!productId) {
      return fail(res, 'Product id is required', 400);
    }

    if (!userId) {
      return fail(res, 'User id is required', 400);
    }

    const result = await permissionService.addProductPermission(productId, userId);
    success(res, result, result.created ? 'created' : 'already exists');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to add product contact permission');
  }
};

exports.adminDelete = async (req, res) => {
  try {
    const productId = parseId(req.params.id);
    const userId = parseId(req.params.userId);

    if (!productId) {
      return fail(res, 'Product id is required', 400);
    }

    if (!userId) {
      return fail(res, 'User id is required', 400);
    }

    const result = await permissionService.removeProductPermission(productId, userId);

    if (!result.deleted) {
      return fail(res, 'Product contact permission not found', 404);
    }

    success(res, result, 'deleted');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to delete product contact permission');
  }
};
