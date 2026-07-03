DELIMITER $$

CREATE PROCEDURE add_category_alice_column_if_missing()
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'category'
      AND COLUMN_NAME = 'alice'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'category'
        AND COLUMN_NAME = 'alias'
    ) THEN
      ALTER TABLE category CHANGE COLUMN alias alice VARCHAR(100) DEFAULT '';
    ELSE
      ALTER TABLE category ADD COLUMN alice VARCHAR(100) DEFAULT '' AFTER name;
    END IF;
  END IF;
END$$

DELIMITER ;

CALL add_category_alice_column_if_missing();

DROP PROCEDURE add_category_alice_column_if_missing;
