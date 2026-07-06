CREATE TABLE IF NOT EXISTS ai_generate_log (
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
);
