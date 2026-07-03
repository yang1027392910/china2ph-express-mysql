const pool = require('../config/db');

async function main() {
  const sqlList = [
    `CREATE TABLE IF NOT EXISTS category (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL,
      alice VARCHAR(100) DEFAULT '',
      icon VARCHAR(255),
      parent_id BIGINT DEFAULT 0,
      sort INT DEFAULT 0,
      status TINYINT DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS product (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      category_id BIGINT NOT NULL,
      title VARCHAR(255) NOT NULL,
      sku VARCHAR(100),
      cover VARCHAR(255),
      description TEXT,
      china_cost DECIMAL(10,2) DEFAULT 0,
      ph_price DECIMAL(10,2) DEFAULT 0,
      profit DECIMAL(10,2) DEFAULT 0,
      profit_margin DECIMAL(6,2) DEFAULT 0,
      moq INT DEFAULT 1,
      weight DECIMAL(10,2) DEFAULT 0,
      size VARCHAR(100),
      shipping_method VARCHAR(100),
      tiktok_score INT DEFAULT 0,
      trend VARCHAR(100),
      stock INT DEFAULT 0,
      sales INT DEFAULT 0,
      status TINYINT DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS product_image (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      product_id BIGINT NOT NULL,
      image_url VARCHAR(255) NOT NULL,
      sort INT DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS home_hot_product (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      product_id BIGINT NOT NULL,
      title VARCHAR(100),
      sort INT DEFAULT 0,
      status TINYINT DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS hot_product (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      hot_type VARCHAR(20) DEFAULT 'today',
      product_id BIGINT NOT NULL,
      sort INT DEFAULT 0,
      status TINYINT DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_hot_product_hot_type_product_id (hot_type, product_id)
    )`,
    `CREATE TABLE IF NOT EXISTS banner (
      id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
      title VARCHAR(100) NOT NULL COMMENT '标题',
      subtitle VARCHAR(255) DEFAULT NULL COMMENT '副标题',
      image VARCHAR(255) NOT NULL COMMENT 'Banner图片',
      scene VARCHAR(30) DEFAULT 'home' COMMENT '展示位置：home首页 purchase_advisor采购顾问',
      action_type VARCHAR(30) NOT NULL COMMENT '跳转类型',
      action_value VARCHAR(255) DEFAULT NULL COMMENT '跳转值',
      sort INT DEFAULT 0 COMMENT '排序',
      status TINYINT DEFAULT 1 COMMENT '状态：0禁用 1启用',
      start_time DATETIME DEFAULT NULL COMMENT '开始时间',
      end_time DATETIME DEFAULT NULL COMMENT '结束时间',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Banner表'`,
    `CREATE TABLE IF NOT EXISTS logistics_supplier (
      id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
      name VARCHAR(100) NOT NULL COMMENT '物流名称',
      logo VARCHAR(255) DEFAULT '' COMMENT '供应商logo',
      shipping_method VARCHAR(50) NOT NULL COMMENT '运输方式（海运/空运/DDP）',
      delivery_time VARCHAR(50) DEFAULT NULL COMMENT '运输时效，例如 7-15天',
      unit_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '单价',
      pricing_method VARCHAR(50) DEFAULT NULL COMMENT '计算方式（按kg/按CBM/按箱）',
      sort INT DEFAULT 0 COMMENT '排序',
      status TINYINT(1) DEFAULT 1 COMMENT '状态：0禁用 1启用',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物流供应商展示表'`,
    `CREATE TABLE IF NOT EXISTS supplier (
      id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '供应商ID',
      name VARCHAR(100) NOT NULL COMMENT '供应商名称',
      logo VARCHAR(255) NULL COMMENT '供应商logo/封面图',
      images TEXT NULL COMMENT '供应商图片，JSON数组',
      city VARCHAR(100) NULL COMMENT '城市',
      country VARCHAR(50) DEFAULT 'China' COMMENT '国家',
      main_products VARCHAR(255) NULL COMMENT '主营产品',
      moq VARCHAR(100) NULL COMMENT '最低起订量',
      description TEXT NULL COMMENT '简介',
      tags VARCHAR(255) NULL COMMENT '标签，JSON数组，如 Verified Supplier/OEM/Export Experience',
      export_markets VARCHAR(255) NULL COMMENT '出口市场，如 Philippines, Malaysia',
      year_established VARCHAR(20) NULL COMMENT '成立年份',
      contact_name VARCHAR(100) NULL COMMENT '联系人',
      contact_whatsapp VARCHAR(100) NULL COMMENT 'WhatsApp',
      contact_wechat VARCHAR(100) NULL COMMENT '微信',
      contact_phone VARCHAR(100) NULL COMMENT '电话',
      contact_email VARCHAR(100) NULL COMMENT '邮箱',
      show_contact TINYINT(1) DEFAULT 0 COMMENT '是否开放联系方式',
      status TINYINT(1) DEFAULT 1 COMMENT '状态：1启用 0禁用',
      sort INT DEFAULT 0 COMMENT '排序',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='供应商表'`,
    `CREATE TABLE IF NOT EXISTS favorite (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT NOT NULL,
      product_id BIGINT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '收藏时间',
      UNIQUE KEY uk_favorite_user_product (user_id, product_id),
      INDEX idx_favorite_user_created_at (user_id, created_at),
      INDEX idx_favorite_product_id (product_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户收藏表'`,
    `CREATE TABLE IF NOT EXISTS procurement_contact (
      id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
      contact_type VARCHAR(20) NOT NULL COMMENT '联系方式类型：messenger/whatsapp/telegram/phone/email',
      contact_value VARCHAR(100) NOT NULL COMMENT '联系方式',
      description VARCHAR(255) DEFAULT NULL COMMENT '描述',
      sort INT DEFAULT 0 COMMENT '排序',
      status TINYINT DEFAULT 1 COMMENT '状态：0禁用 1启用',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='采购客服联系方式表'`,
    `CREATE TABLE IF NOT EXISTS profit_calculation (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      product_id BIGINT,
      product_cost DECIMAL(10,2) NOT NULL,
      quantity INT NOT NULL,
      weight_per_item DECIMAL(10,2),
      shipping_method VARCHAR(50),
      shipping_cost DECIMAL(10,2),
      other_fee DECIMAL(10,2),
      total_cost DECIMAL(10,2),
      selling_price DECIMAL(10,2),
      estimated_profit DECIMAL(10,2),
      profit_margin DECIMAL(6,2),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS \`user\` (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      email VARCHAR(100) NOT NULL,
      nickname VARCHAR(100) DEFAULT '',
      avatar VARCHAR(255) DEFAULT '',
      status TINYINT DEFAULT 1,
      register_ip VARCHAR(50),
      last_login_ip VARCHAR(50),
      login_count INT DEFAULT 0,
      invite_code VARCHAR(20) NULL COMMENT '邀请码',
      inviter_id BIGINT NULL COMMENT '邀请人ID',
      invite_count INT DEFAULT 0 COMMENT '有效邀请人数',
      can_lottery TINYINT(1) DEFAULT 0 COMMENT '是否可抽奖',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      last_login_time DATETIME,
      UNIQUE KEY uk_user_email (email),
      UNIQUE KEY uk_user_invite_code (invite_code),
      INDEX idx_user_inviter_id (inviter_id),
      INDEX idx_user_status (status),
      INDEX idx_user_created_at (created_at)
    )`,
    `CREATE TABLE IF NOT EXISTS email_code_log (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      email VARCHAR(100) NOT NULL,
      code VARCHAR(10) NOT NULL,
      scene VARCHAR(20) DEFAULT 'login',
      status TINYINT DEFAULT 0 COMMENT '0未使用 1已使用 2已过期',
      send_status TINYINT DEFAULT 1 COMMENT '1成功 0失败',
      expire_time DATETIME,
      ip VARCHAR(50),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_email_scene_status (email, scene, status),
      INDEX idx_expire_time (expire_time)
    )`
  ];

  for (const sql of sqlList) {
    await pool.query(sql);
  }

  await pool.query('DELETE FROM home_hot_product');
  await pool.query('DELETE FROM hot_product');
  await pool.query('DELETE FROM product_image');
  await pool.query('DELETE FROM product');
  await pool.query('DELETE FROM category');

  const categories = [
    [1, 'Women Wear', 'women-wear', 'women-wear', 0, 1],
    [2, 'Men Wear', 'men-wear', 'men-wear', 0, 2],
    [3, 'Shoes', 'shoes', 'shoes', 0, 3],
    [4, 'Bags', 'bags', 'bags', 0, 4],
    [5, 'Beauty', 'beauty', 'beauty', 0, 5],
    [6, 'Jewelry', 'jewelry', 'jewelry', 0, 6],
    [7, 'Kids & Baby', 'kids-baby', 'kids-baby', 0, 7],
    [8, 'Home & Living', 'home-living', 'home-living', 0, 8],
    [9, 'Toys', 'toys', 'toys', 0, 9],
    [10, 'Stationery', 'stationery', 'stationery', 0, 10],
    [11, 'Electronics', 'electronics', 'electronics', 0, 11],
    [12, 'Sports', 'sports', 'sports', 0, 12],
    [13, 'Automotive', 'automotive', 'automotive', 0, 13],
    [14, 'Pet Supplies', 'pet-supplies', 'pet-supplies', 0, 14],
    [15, 'Food', 'food', 'food', 0, 15],
    [16, 'Others', 'others', 'others', 0, 16]
  ];

  await pool.query(
    'INSERT INTO category (id, name, alice, icon, parent_id, sort) VALUES ?',
    [categories]
  );

  const products = [
    [1001, 3, 'Girl Shoes Pink Sneakers', '2506120001', 'https://picsum.photos/seed/shoes1/400/400', 'Comfortable pink sneakers for daily wear.', 8.5, 199, 100, 50.23, 50, 0.85, '40*30*24 cm', 'Sea Freight / Air Freight', 95, 'Trending (Rising)', 24, 12],
    [1002, 3, 'White Casual Sneakers', '2506120002', 'https://picsum.photos/seed/shoes2/400/400', 'White casual shoes for women.', 10.5, 220, 120, 54.10, 50, 0.75, '38*28*20 cm', 'Sea Freight', 88, 'Stable', 30, 15],
    [1003, 4, 'Fashion Handbag', '2506120003', 'https://picsum.photos/seed/bag1/400/400', 'Simple fashion handbag.', 6.8, 159, 70, 44.02, 30, 0.5, '30*20*10 cm', 'Air Freight', 86, 'Hot', 15, 8],
    [1004, 5, 'Lipstick #01', '2506120004', 'https://picsum.photos/seed/lipstick1/400/400', 'Long lasting lipstick.', 2.3, 49, 25, 51.02, 100, 0.05, '8*2*2 cm', 'Air Freight', 90, 'Trending', 100, 20],
    [1005, 9, 'Small Car Toy', '2506120005', 'https://picsum.photos/seed/toy1/400/400', 'Small toy car for kids.', 3.2, 69, 30, 43.48, 100, 0.2, '12*6*5 cm', 'Sea Freight', 76, 'Stable', 60, 5],
    [1006, 10, 'Notebook A5', '2506120006', 'https://picsum.photos/seed/book1/400/400', 'A5 notebook for students.', 1.2, 29, 12, 41.37, 200, 0.15, '21*14 cm', 'Sea Freight', 82, 'Stable', 80, 18]
  ];

  await pool.query(
    `INSERT INTO product 
    (id, category_id, title, sku, cover, description, china_cost, ph_price, profit, profit_margin, moq, weight, size, shipping_method, tiktok_score, trend, stock, sales)
    VALUES ?`,
    [products]
  );

  const images = products.flatMap(p => [
    [p[0], p[4], 1],
    [p[0], `https://picsum.photos/seed/${p[0]}-2/400/400`, 2],
    [p[0], `https://picsum.photos/seed/${p[0]}-3/400/400`, 3]
  ]);
  await pool.query(
    'INSERT INTO product_image (product_id, image_url, sort) VALUES ?',
    [images]
  );

  await pool.query(
    'INSERT INTO home_hot_product (product_id, title, sort, status) VALUES ?',
    [[[1001, 'Hot Shoes', 1, 1], [1003, 'Hot Bag', 2, 1], [1004, 'Hot Beauty', 3, 1], [1005, 'Hot Toy', 4, 1]]]
  );

  await pool.query(
    `INSERT INTO hot_product
      (hot_type, product_id, sort, status)
    VALUES ?`,
    [[
      ['today', 1001, 1, 1],
      ['today', 1003, 2, 1],
      ['week', 1004, 1, 1],
      ['new_alert', 1005, 1, 1]
    ]]
  );

  console.log('Database initialized successfully.');
  await pool.end();
}

main().catch(async error => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
