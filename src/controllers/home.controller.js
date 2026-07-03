const pool = require('../config/db');
const permissionService = require('../services/productContactPermission.service');
const { success, fail } = require('../utils/response');

async function queryHotProducts(userId) {
  const [rows] = await pool.query(
    `SELECT 
      p.id,
      p.category_id AS categoryId,
      p.title AS name,
      p.cover AS image,
      p.china_cost AS chinaCost,
      p.ph_price AS phPrice,
      p.profit,
      p.profit_margin AS profitMargin,
      p.tiktok_score AS tiktokScore,
      IF(f.product_id IS NULL, 0, 1) AS isFavorite
    FROM home_hot_product h
    INNER JOIN product p ON p.id = h.product_id
    LEFT JOIN favorite f ON f.product_id = p.id AND f.user_id = ?
    WHERE h.status = 1 AND p.status = 1
    ORDER BY h.sort ASC, h.id ASC`,
    [userId]
  );

  return rows;
}

async function queryHomeBanners() {
  const [rows] = await pool.query(
    `SELECT
      b.id,
      b.title,
      b.subtitle,
      b.image,
      b.action_type AS actionType,
      b.action_value AS actionValue,
      b.action_type AS jumpType,
      b.action_value AS jumpValue,
      b.sort
    FROM banner b
    WHERE b.status = 1
      AND b.scene = 'home'
      AND (b.start_time IS NULL OR b.start_time <= NOW())
      AND (b.end_time IS NULL OR b.end_time >= NOW())
    ORDER BY b.sort ASC, b.id DESC`
  );

  return rows;
}

async function queryCategoryProducts(userId, limit = 3) {
  const [categories] = await pool.query(
    `SELECT
      id,
      name,
      alice
    FROM category
    WHERE parent_id = 0 AND status = 1
    ORDER BY sort ASC, id ASC`
  );

  const productGroups = await Promise.all(categories.map(async category => {
    const [products] = await pool.query(
      `SELECT
        p.id,
        p.category_id AS categoryId,
        p.title,
        p.subtitle,
        p.cover,
        p.images,
        p.description,
        p.china_price AS chinaPrice,
        p.shipping_fee AS shippingFee,
        p.ph_price AS phPrice,
        p.profit,
        p.minimum_order_quantity AS minimumOrderQuantity,
        p.stock,
        p.sales,
        p.status,
        p.show_supplier_contact AS showSupplierContact,
        p.supplier_name AS supplierName,
        p.supplier_whatsapp AS supplierWhatsapp,
        p.supplier_wechat AS supplierWechat,
        p.supplier_phone AS supplierPhone,
        (
          SELECT h.hot_type
          FROM hot_product h
          WHERE h.product_id = p.id AND h.status = 1
          ORDER BY h.sort ASC, h.id DESC
          LIMIT 1
        ) AS hotType,
        (
          SELECT GROUP_CONCAT(h.hot_type ORDER BY h.sort ASC, h.id DESC SEPARATOR ',')
          FROM hot_product h
          WHERE h.product_id = p.id AND h.status = 1
        ) AS hotTypes,
        p.created_at AS createdAt,
        IF(f.product_id IS NULL, 0, 1) AS isFavorite
      FROM productlist p
      LEFT JOIN favorite f ON f.product_id = p.id AND f.user_id = ?
      WHERE p.status = 1 AND p.category_id = ?
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT ?`,
      [userId, category.id, limit]
    );

    return {
      categoryId: category.id,
      categoryName: category.name,
      alice: category.alice || '',
      products
    };
  }));

  const productIds = productGroups.flatMap(group => group.products.map(product => Number(product.id)));
  const authorizedProductIds = await permissionService.getAuthorizedProductIdSet(userId, productIds);

  return productGroups.map(group => ({
    ...group,
    products: group.products.map(product => {
      const canViewSupplierContact =
        Number(product.showSupplierContact) === 1 &&
        authorizedProductIds.has(Number(product.id));

      const {
        supplierName,
        supplierWhatsapp,
        supplierWechat,
        supplierPhone,
        ...publicProduct
      } = product;

      return {
        ...publicProduct,
        canViewSupplierContact,
        supplierContact: canViewSupplierContact
          ? {
              name: supplierName,
              whatsapp: supplierWhatsapp,
              wechat: supplierWechat,
              phone: supplierPhone
            }
          : null
      };
    })
  }));
}

exports.hot = async (req, res) => {
  try {
    const userId = Number(req.user?.id || 0);
    const rows = await queryHotProducts(userId);

    success(res, rows);
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to get hot products');
  }
};

exports.categoryProducts = async (req, res) => {
  try {
    const userId = Number(req.user?.id || 0);
    const rows = await queryCategoryProducts(userId, 3);

    success(res, rows);
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to get h5 home category products');
  }
};

exports.index = async (req, res) => {
  try {
    const userId = Number(req.user?.id || 0);
    const [banners, hotProducts] = await Promise.all([
      queryHomeBanners(),
      queryHotProducts(userId)
    ]);

    success(res, {
      banners,
      hotProducts
    });
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to get home index');
  }
};
