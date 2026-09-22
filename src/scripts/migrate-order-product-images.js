const pool = require('../config/db');

async function main() {
  try {
    const [columns] = await pool.query("SHOW COLUMNS FROM `order` LIKE 'product_images'");
    if (!columns.length) {
      await pool.query("ALTER TABLE `order` ADD COLUMN product_images JSON DEFAULT NULL COMMENT '订单商品图片快照数组' AFTER user_id");
      console.log('Added order.product_images');
    }
    const [result] = await pool.query(`
      UPDATE \`order\` o
      LEFT JOIN (
        SELECT order_id, JSON_ARRAYAGG(product_image) AS images
        FROM order_item
        WHERE product_image IS NOT NULL AND product_image <> ''
        GROUP BY order_id
      ) i ON i.order_id = o.id
      SET o.product_images = COALESCE(i.images, JSON_ARRAY())
      WHERE o.product_images IS NULL
    `);
    await pool.query('SELECT product_images FROM `order` LIMIT 1');
    console.log('Order image migration verified. Updated rows:', result.affectedRows);
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error('Order image migration failed:', error.message);
  process.exitCode = 1;
});