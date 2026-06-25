DELIMITER $$

CREATE PROCEDURE add_user_invite_columns_if_missing()
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user'
      AND COLUMN_NAME = 'invite_code'
  ) THEN
    ALTER TABLE `user` ADD COLUMN invite_code VARCHAR(20) NULL COMMENT '邀请码';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user'
      AND COLUMN_NAME = 'inviter_id'
  ) THEN
    ALTER TABLE `user` ADD COLUMN inviter_id BIGINT NULL COMMENT '邀请人ID';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user'
      AND COLUMN_NAME = 'invite_count'
  ) THEN
    ALTER TABLE `user` ADD COLUMN invite_count INT DEFAULT 0 COMMENT '有效邀请人数';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user'
      AND COLUMN_NAME = 'can_lottery'
  ) THEN
    ALTER TABLE `user` ADD COLUMN can_lottery TINYINT(1) DEFAULT 0 COMMENT '是否可抽奖';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user'
      AND INDEX_NAME = 'uk_user_invite_code'
  ) THEN
    ALTER TABLE `user` ADD UNIQUE KEY uk_user_invite_code (invite_code);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user'
      AND INDEX_NAME = 'idx_user_inviter_id'
  ) THEN
    ALTER TABLE `user` ADD INDEX idx_user_inviter_id (inviter_id);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user_verification'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user_verification'
      AND COLUMN_NAME = 'invite_counted'
  ) THEN
    ALTER TABLE user_verification ADD COLUMN invite_counted TINYINT(1) DEFAULT 0 COMMENT '是否已计算邀请人数';
  END IF;
END$$

DELIMITER ;

CALL add_user_invite_columns_if_missing();

DROP PROCEDURE add_user_invite_columns_if_missing;
