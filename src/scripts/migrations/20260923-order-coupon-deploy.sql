-- Select the target database before running this file.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `order` (
      id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '订单ID',
      order_no VARCHAR(50) NOT NULL COMMENT '订单编号',
      product_images JSON DEFAULT NULL COMMENT '订单商品图片快照数组',
      user_id BIGINT NOT NULL COMMENT '用户ID',
      total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '商品总金额',
      discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '优惠金额',
      shipping_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '运费',
      pay_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '应付金额',
      delivery_type TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 Self Pickup，2 Delivery',
      status TINYINT NOT NULL DEFAULT 0 COMMENT '0 Pending，1 Confirmed，2 Processing，3 Completed，4 Cancelled',
      remark VARCHAR(500) DEFAULT '' COMMENT '备注',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      UNIQUE KEY uk_order_no (order_no),
      INDEX idx_order_user_created_at (user_id, created_at),
      INDEX idx_order_status_created_at (status, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单主表';

CREATE TABLE IF NOT EXISTS order_item (
      id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '订单商品ID',
      order_id BIGINT NOT NULL COMMENT '订单ID',
      product_id BIGINT NOT NULL COMMENT '商品ID',
      product_name VARCHAR(255) NOT NULL COMMENT '商品快照名称',
      product_image VARCHAR(255) DEFAULT '' COMMENT '商品快照图片',
      price DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '商品单价',
      quantity INT NOT NULL DEFAULT 1 COMMENT '购买数量',
      subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '小计金额',
      INDEX idx_order_item_order_id (order_id),
      INDEX idx_order_item_product_id (product_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单商品表';

SET @images_exists = (SELECT COUNT(*) FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'order' AND column_name = 'product_images');
SET @images_ddl = IF(@images_exists = 0,
'ALTER TABLE `order` ADD COLUMN product_images JSON DEFAULT NULL AFTER user_id', 'SELECT 1');
PREPARE images_statement FROM @images_ddl;
EXECUTE images_statement;
DEALLOCATE PREPARE images_statement;

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

﻿CREATE TABLE IF NOT EXISTS coupon_config (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  type TINYINT NOT NULL COMMENT '1=Registration 2=Verification',
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  valid_days INT NOT NULL DEFAULT 30,
  enabled TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_coupon_config_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO coupon_config (type, amount, valid_days, enabled)
VALUES (1, 20.00, 30, 1), (2, 40.00, 30, 1)
ON DUPLICATE KEY UPDATE type = VALUES(type);
CREATE TABLE IF NOT EXISTS user_coupon (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  type TINYINT NOT NULL COMMENT '1=Registration 2=Verification 3=System',
  amount DECIMAL(10,2) NOT NULL,
  status TINYINT NOT NULL DEFAULT 0 COMMENT '0=Locked 1=Available 2=Used 3=Expired 4=Disabled',
  source TINYINT NOT NULL DEFAULT 1 COMMENT '1=System 2=Admin',
  order_id BIGINT NULL,
  activated_at DATETIME NULL,
  expired_at DATETIME NULL,
  used_at DATETIME NULL,
  remark VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_user_status (user_id, status),
  INDEX idx_type (type),
  INDEX idx_order_id (order_id),
  INDEX idx_expired_at (expired_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
SET @coupon_column_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'order' AND column_name = 'user_coupon_id');
SET @coupon_ddl = IF(@coupon_column_exists = 0,
  'ALTER TABLE `order` ADD COLUMN user_coupon_id BIGINT NULL COMMENT ''Applied user coupon ID''', 'SELECT 1');
PREPARE coupon_statement FROM @coupon_ddl;
EXECUTE coupon_statement;
DEALLOCATE PREPARE coupon_statement;
