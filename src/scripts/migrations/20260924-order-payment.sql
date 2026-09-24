-- Run before deploying the payment endpoints. Safe to rerun.

SET @payment_sql = IF(
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'order' AND column_name = 'payment_method'),
  'SELECT 1',
  'ALTER TABLE `order` ADD COLUMN payment_method TINYINT DEFAULT 0'
);
PREPARE payment_stmt FROM @payment_sql;
EXECUTE payment_stmt;
DEALLOCATE PREPARE payment_stmt;

SET @payment_sql = IF(
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'order' AND column_name = 'payment_status'),
  'SELECT 1',
  'ALTER TABLE `order` ADD COLUMN payment_status TINYINT DEFAULT 0'
);
PREPARE payment_stmt FROM @payment_sql;
EXECUTE payment_stmt;
DEALLOCATE PREPARE payment_stmt;

SET @payment_sql = IF(
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'order' AND column_name = 'payment_reference'),
  'SELECT 1',
  'ALTER TABLE `order` ADD COLUMN payment_reference VARCHAR(100)'
);
PREPARE payment_stmt FROM @payment_sql;
EXECUTE payment_stmt;
DEALLOCATE PREPARE payment_stmt;
