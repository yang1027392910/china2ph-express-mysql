ALTER TABLE productlist
  ADD COLUMN show_supplier_contact TINYINT(1) DEFAULT 0 COMMENT '是否开启供应商联系方式',
  ADD COLUMN supplier_name VARCHAR(100) DEFAULT NULL COMMENT '供应商名称',
  ADD COLUMN supplier_whatsapp VARCHAR(50) DEFAULT NULL COMMENT '供应商WhatsApp',
  ADD COLUMN supplier_wechat VARCHAR(50) DEFAULT NULL COMMENT '供应商微信',
  ADD COLUMN supplier_phone VARCHAR(50) DEFAULT NULL COMMENT '供应商电话';

CREATE TABLE product_contact_permission (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  product_id BIGINT NOT NULL COMMENT '商品ID',
  user_id BIGINT NOT NULL COMMENT '用户ID',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_product_user (product_id, user_id),
  INDEX idx_product_id (product_id),
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品供应商联系方式授权表';
