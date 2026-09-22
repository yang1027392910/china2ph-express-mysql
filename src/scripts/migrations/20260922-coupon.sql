CREATE TABLE IF NOT EXISTS coupon_config (
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
