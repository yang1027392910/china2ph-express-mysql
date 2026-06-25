CREATE TABLE user_verification (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL COMMENT '用户ID',
  full_name VARCHAR(100) NOT NULL COMMENT '姓名',
  phone VARCHAR(50) NOT NULL COMMENT '联系电话',
  email VARCHAR(100) DEFAULT NULL COMMENT '邮箱',
  address VARCHAR(255) NOT NULL COMMENT '地址',
  city VARCHAR(100) NOT NULL COMMENT '城市',
  shop_name VARCHAR(100) NOT NULL COMMENT '店铺名称',
  business_type VARCHAR(50) NOT NULL COMMENT '经营类型',
  store_description TEXT COMMENT '主营产品',
  store_photos JSON COMMENT '店铺照片',
  status TINYINT DEFAULT 0 COMMENT '0待审核 1通过 2拒绝',
  invite_counted TINYINT(1) DEFAULT 0 COMMENT '是否已计算邀请人数',
  remark VARCHAR(255) DEFAULT NULL COMMENT '审核备注',
  reviewed_at DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户认证表';

ALTER TABLE `user`
  ADD COLUMN verification_status TINYINT DEFAULT -1 COMMENT '-1未提交 0审核中 1已通过 2已拒绝';
