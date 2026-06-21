const permissionDao = require('../dao/productContactPermission.dao');

async function getProductPermissions(productId) {
  return permissionDao.listByProductId(productId);
}

async function addProductPermission(productId, userId) {
  const result = await permissionDao.add(productId, userId);

  return {
    productId,
    userId,
    created: result.affectedRows > 0
  };
}

async function removeProductPermission(productId, userId) {
  const result = await permissionDao.remove(productId, userId);

  return {
    productId,
    userId,
    deleted: result.affectedRows > 0
  };
}

async function getAuthorizedProductIdSet(userId, productIds) {
  const authorizedProductIds = await permissionDao.findAuthorizedProductIds(
    userId,
    productIds
  );

  return new Set(authorizedProductIds);
}

module.exports = {
  addProductPermission,
  getAuthorizedProductIdSet,
  getProductPermissions,
  removeProductPermission
};
