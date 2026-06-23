CREATE TABLE icon_library (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) DEFAULT NULL COMMENT '图标名称',
  icon_value VARCHAR(100) NOT NULL COMMENT '图标值',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_icon_value (icon_value)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='图标库';

INSERT INTO icon_library (name, icon_value) VALUES
  ('清单', 'solar:clipboard-list-bold-duotone'),
  ('资金', 'solar:hand-money-bold-duotone'),
  ('客服', 'solar:headphones-round-sound-bold-duotone'),
  ('认证', 'solar:verified-check-bold-duotone');
