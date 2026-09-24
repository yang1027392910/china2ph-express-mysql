-- Run against the application database before deploying the API.
-- Existing products default to In Stock. Safe to rerun; absent tables are skipped.

SET @sale_type_sql = IF(
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'productlist')
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'productlist' AND column_name = 'sale_type'),
  'ALTER TABLE productlist ADD COLUMN sale_type TINYINT NOT NULL DEFAULT 1 COMMENT ''1 = In Stock, 2 = Pre-order''',
  'SELECT 1'
);
PREPARE sale_type_stmt FROM @sale_type_sql;
EXECUTE sale_type_stmt;
DEALLOCATE PREPARE sale_type_stmt;

SET @sale_type_sql = IF(
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'product')
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'product' AND column_name = 'sale_type'),
  'ALTER TABLE product ADD COLUMN sale_type TINYINT NOT NULL DEFAULT 1 COMMENT ''1 = In Stock, 2 = Pre-order''',
  'SELECT 1'
);
PREPARE sale_type_stmt FROM @sale_type_sql;
EXECUTE sale_type_stmt;
DEALLOCATE PREPARE sale_type_stmt;
