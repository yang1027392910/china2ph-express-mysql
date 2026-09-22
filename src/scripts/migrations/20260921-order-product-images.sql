-- Run once on an existing database before deploying the updated controller.
ALTER TABLE `order`
  ADD COLUMN product_images JSON DEFAULT NULL COMMENT '订单商品图片快照数组' AFTER user_id;

-- Backfill images from existing order item snapshots.
UPDATE `order` o
LEFT JOIN (
  SELECT order_id, JSON_ARRAYAGG(product_image) AS images
  FROM order_item
  WHERE product_image IS NOT NULL AND product_image <> ''
  GROUP BY order_id
) i ON i.order_id = o.id
SET o.product_images = COALESCE(i.images, JSON_ARRAY())
WHERE o.product_images IS NULL;