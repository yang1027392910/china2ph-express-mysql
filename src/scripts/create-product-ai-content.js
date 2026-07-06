const pool = require('../config/db');

const sql = `CREATE TABLE IF NOT EXISTS product_ai_content (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  product_id BIGINT NOT NULL,

  description_html LONGTEXT,
  faq_html LONGTEXT,
  seo_title VARCHAR(255),
  meta_description VARCHAR(500),
  seo_keywords TEXT,
  url_slug VARCHAR(255),

  ai_generate_log_id BIGINT,
  status TINYINT DEFAULT 1,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uk_product_id (product_id)
)`;

async function main() {
  await pool.query(sql);
  const [rows] = await pool.query("SHOW TABLES LIKE 'product_ai_content'");
  console.log(JSON.stringify(rows));
  await pool.end();
}

main().catch(async error => {
  console.error(error);
  try {
    await pool.end();
  } catch (endError) {
    console.error(endError);
  }
  process.exit(1);
});
