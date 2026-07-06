const pool = require('../config/db');

const sql = `CREATE TABLE IF NOT EXISTS ai_generate_log (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  product_id BIGINT NOT NULL,
  type VARCHAR(30) NOT NULL COMMENT 'description seo faq translate',
  prompt LONGTEXT NOT NULL,
  response LONGTEXT,
  model VARCHAR(50),
  tokens INT DEFAULT 0,
  status TINYINT DEFAULT 1 COMMENT '1成功 0失败',
  error_message VARCHAR(500),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`;

async function main() {
  await pool.query(sql);
  const [rows] = await pool.query("SHOW TABLES LIKE 'ai_generate_log'");
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
