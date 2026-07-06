const pool = require('../config/db');

function parseResponse(response) {
  if (!response) return null;

  const content = JSON.parse(response);
  const seoKeywords = Array.isArray(content.seoKeywords)
    ? content.seoKeywords.join(',')
    : String(content.seoKeywords || '');

  return {
    descriptionHtml: content.descriptionHtml || '',
    faqHtml: content.faqHtml || '',
    seoTitle: content.seoTitle || '',
    metaDescription: content.metaDescription || '',
    seoKeywords,
    urlSlug: content.urlSlug || ''
  };
}

async function ensureTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS product_ai_content (
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
    )`
  );
}

async function main() {
  await ensureTable();

  const [logs] = await pool.query(
    `SELECT l.id, l.product_id AS productId, l.response
    FROM ai_generate_log l
    INNER JOIN (
      SELECT product_id, MAX(id) AS id
      FROM ai_generate_log
      WHERE status = 1
        AND response IS NOT NULL
      GROUP BY product_id
    ) latest ON latest.id = l.id
    ORDER BY l.id ASC`
  );

  let count = 0;

  for (const log of logs) {
    const content = parseResponse(log.response);
    if (!content) continue;

    await pool.query(
      `INSERT INTO product_ai_content
        (product_id, description_html, faq_html, seo_title, meta_description,
          seo_keywords, url_slug, ai_generate_log_id, status)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE
        description_html = VALUES(description_html),
        faq_html = VALUES(faq_html),
        seo_title = VALUES(seo_title),
        meta_description = VALUES(meta_description),
        seo_keywords = VALUES(seo_keywords),
        url_slug = VALUES(url_slug),
        ai_generate_log_id = VALUES(ai_generate_log_id),
        status = VALUES(status),
        updated_at = CURRENT_TIMESTAMP`,
      [
        log.productId,
        content.descriptionHtml,
        content.faqHtml,
        content.seoTitle,
        content.metaDescription,
        content.seoKeywords,
        content.urlSlug,
        log.id
      ]
    );

    count += 1;
  }

  console.log(JSON.stringify({ backfilled: count }));
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
