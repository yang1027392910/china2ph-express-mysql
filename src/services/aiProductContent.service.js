const pool = require('../config/db');

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

const DEFAULT_MODEL = 'gpt-4.1-mini';
const DEFAULT_GENERATE_TYPE = 'description';
const DESCRIPTION_SECTIONS = [
  'Product Overview',
  'Product Information',
  'Key Features',
  'Purchase Notice',
  'Shipping Information',
  'How to Purchase'
];

let aiGenerateLogTableReady = false;
let productAiContentTableReady = false;

function pickValue(source, camelKey, snakeKey, defaultValue = '') {
  return source[camelKey] ?? source[snakeKey] ?? defaultValue;
}

function normalizeText(value, defaultValue = '') {
  if (value === undefined || value === null) return defaultValue;
  return String(value).trim();
}

function normalizeNumber(value, defaultValue = 0) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : defaultValue;
}

function buildProductContentPrompt(product) {
  return `Generate product SEO content. Return JSON only.

Product: ${product.title}
Subtitle: ${product.subtitle}
Category: ${product.categoryName}
China Price: ${product.chinaPrice}
Shipping Fee: ${product.shippingFee}
PH Price: ${product.phPrice}
Profit: ${product.profit}
MOQ: ${product.minimumOrderQuantity}
Stock: ${product.stock}
Sales: ${product.sales}
Market: ${product.targetMarket}
Language: ${product.language}

JSON fields: seoTitle, metaDescription, descriptionHtml, faqHtml, seoKeywords, urlSlug.

descriptionHtml must use this exact section order and tags:
<h3>📦 Product Overview</h3>
<p>Write a short buyer-focused overview.</p>
<hr>
<h3>📋 Product Information</h3>
<ul>
<li><strong>Brand:</strong> write brand or N/A</li>
<li><strong>Material:</strong> write material or N/A</li>
<li><strong>Specification:</strong> write specification or N/A</li>
<li><strong>Origin:</strong> China</li>
</ul>
<hr>
<h3>⭐ Key Features</h3>
<ul><li>Feature 1</li><li>Feature 2</li><li>Feature 3</li><li>Feature 4</li></ul>
<hr>
<h3>💰 Purchase Notice</h3>
<ul>
<li>The displayed China price is for reference only.</li>
<li>Bulk orders usually receive better pricing.</li>
<li>Final quotation depends on quantity and specifications.</li>
<li>Please contact customer service for the latest quotation.</li>
</ul>
<hr>
<h3>🚚 Shipping Information</h3>
<ul>
<li>Sea freight and air freight are available.</li>
<li>Shipping cost depends on destination and order quantity.</li>
</ul>
<hr>
<h3>📞 How to Purchase</h3>
<ol>
<li>Submit your inquiry.</li>
<li>Confirm product specifications.</li>
<li>Receive the latest quotation.</li>
<li>Arrange shipment.</li>
</ol>`;
}

function getProductContentTemplate() {
  const samplePayload = {
    productId: 10,
    title: 'Portable beach chair',
    subtitle: '',
    categoryName: 'Home',
    chinaPrice: 120,
    shippingFee: 20,
    phPrice: 400,
    profit: 250,
    minimumOrderQuantity: 50,
    stock: 10000,
    sales: 100000,
    targetMarket: 'Philippines',
    language: 'English',
    type: DEFAULT_GENERATE_TYPE
  };

  return {
    api: {
      adminGenerateUrl: '/api/admin/product/ai-generate',
      method: 'POST',
      h5TemplateUrl: '/api/h5/product/ai-generate/template'
    },
    requestFields: [
      { field: 'productId', type: 'number', required: false, description: 'Product ID' },
      { field: 'title', type: 'string', required: true, description: 'Product name' },
      { field: 'subtitle', type: 'string', required: false, description: 'Product subtitle' },
      { field: 'categoryName', type: 'string', required: false, description: 'Category name' },
      { field: 'chinaPrice', type: 'number', required: false, description: 'China price' },
      { field: 'shippingFee', type: 'number', required: false, description: 'Shipping fee' },
      { field: 'phPrice', type: 'number', required: false, description: 'Estimated Philippines price' },
      { field: 'profit', type: 'number', required: false, description: 'Estimated profit' },
      {
        field: 'minimumOrderQuantity',
        type: 'number',
        required: false,
        description: 'Minimum order quantity'
      },
      { field: 'stock', type: 'number', required: false, description: 'Available stock' },
      { field: 'sales', type: 'number', required: false, description: 'Sales volume' },
      {
        field: 'targetMarket',
        type: 'string',
        required: false,
        defaultValue: 'Philippines',
        description: 'Target market'
      },
      {
        field: 'language',
        type: 'string',
        required: false,
        defaultValue: 'English',
        description: 'Generated content language'
      },
      {
        field: 'type',
        type: 'string',
        required: false,
        defaultValue: DEFAULT_GENERATE_TYPE,
        description: 'AI log type'
      }
    ],
    responseFields: [
      { field: 'descriptionHtml', type: 'string', description: 'Product Description HTML' },
      { field: 'seoTitle', type: 'string', description: 'SEO title' },
      { field: 'metaDescription', type: 'string', description: 'Meta description' },
      { field: 'faqHtml', type: 'string', description: 'FAQ HTML' },
      { field: 'seoKeywords', type: 'string[]', description: 'SEO keywords' },
      { field: 'urlSlug', type: 'string', description: 'URL slug' },
      { field: 'aiGenerateLogId', type: 'number', description: 'AI generate log ID' }
    ],
    descriptionSections: DESCRIPTION_SECTIONS,
    samplePayload,
    promptTemplate: buildProductContentPrompt(samplePayload)
  };
}

function normalizeProductInput(input) {
  return {
    productId: normalizeNumber(pickValue(input, 'productId', 'product_id')),
    title: normalizeText(input.title),
    subtitle: normalizeText(input.subtitle),
    categoryName: normalizeText(pickValue(input, 'categoryName', 'category_name')),
    chinaPrice: normalizeNumber(pickValue(input, 'chinaPrice', 'china_price')),
    shippingFee: normalizeNumber(pickValue(input, 'shippingFee', 'shipping_fee')),
    phPrice: normalizeNumber(pickValue(input, 'phPrice', 'ph_price')),
    profit: normalizeNumber(input.profit),
    minimumOrderQuantity: normalizeNumber(
      pickValue(input, 'minimumOrderQuantity', 'minimum_order_quantity'),
      1
    ),
    stock: normalizeNumber(input.stock),
    sales: normalizeNumber(input.sales),
    targetMarket: normalizeText(input.targetMarket, 'Philippines') || 'Philippines',
    language: normalizeText(input.language, 'English') || 'English'
  };
}

function extractOutputText(responseJson) {
  if (typeof responseJson.output_text === 'string') {
    return responseJson.output_text;
  }

  const output = Array.isArray(responseJson.output) ? responseJson.output : [];
  const textParts = [];

  for (const item of output) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      if (typeof part.text === 'string') {
        textParts.push(part.text);
      }
    }
  }

  return textParts.join('').trim();
}

function parseJsonOutput(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw error;
  }
}

function parseGeneratedContentResponse(response) {
  if (!response) return null;

  const parsedResponse = typeof response === 'string' ? parseJsonOutput(response) : response;
  return normalizeGeneratedContent(parsedResponse);
}

function normalizeGeneratedContent(content) {
  const descriptionHtml = normalizeText(
    content.descriptionHtml ?? content.productDescriptionHtml ?? content.productDescription
  );
  const faqHtml = normalizeText(content.faqHtml ?? content.faq);

  return {
    descriptionHtml,
    seoTitle: normalizeText(content.seoTitle),
    metaDescription: normalizeText(content.metaDescription),
    faqHtml,
    seoKeywords: Array.isArray(content.seoKeywords)
      ? content.seoKeywords.map(keyword => normalizeText(keyword)).filter(Boolean)
      : normalizeText(content.seoKeywords)
        .split(',')
        .map(keyword => keyword.trim())
        .filter(Boolean),
    urlSlug: normalizeText(content.urlSlug)
  };
}

function serializeSeoKeywords(value) {
  if (Array.isArray(value)) {
    return value.map(keyword => normalizeText(keyword)).filter(Boolean).join(',');
  }

  return normalizeText(value);
}

function normalizeGenerateType(value) {
  const type = normalizeText(value, DEFAULT_GENERATE_TYPE) || DEFAULT_GENERATE_TYPE;
  return type.slice(0, 30);
}

function getUsageTokens(responseJson) {
  const usage = responseJson.usage || {};
  const totalTokens = usage.total_tokens ?? usage.totalTokens ?? usage.total ?? 0;
  const numberValue = Number(totalTokens);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

async function ensureAiGenerateLogTable() {
  if (aiGenerateLogTableReady) return;

  await pool.query(
    `CREATE TABLE IF NOT EXISTS ai_generate_log (
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
    )`
  );

  aiGenerateLogTableReady = true;
}

async function ensureProductAiContentTable() {
  if (productAiContentTableReady) return;

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

  productAiContentTableReady = true;
}

async function writeAiGenerateLog(log) {
  await ensureAiGenerateLogTable();

  const [result] = await pool.query(
    `INSERT INTO ai_generate_log
      (product_id, type, prompt, response, model, tokens, status, error_message)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      log.productId || 0,
      normalizeGenerateType(log.type),
      log.prompt || '',
      log.response || null,
      log.model || null,
      log.tokens || 0,
      log.status,
      log.errorMessage ? String(log.errorMessage).slice(0, 500) : null
    ]
  );

  return result.insertId;
}

async function upsertProductAiContent(productId, content, aiGenerateLogId) {
  const normalizedProductId = normalizeNumber(productId);
  if (!normalizedProductId) return null;

  await ensureProductAiContentTable();

  const [result] = await pool.query(
    `INSERT INTO product_ai_content
      (product_id, description_html, faq_html, seo_title, meta_description, seo_keywords,
        url_slug, ai_generate_log_id, status)
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
      normalizedProductId,
      content.descriptionHtml || null,
      content.faqHtml || null,
      content.seoTitle || null,
      content.metaDescription || null,
      serializeSeoKeywords(content.seoKeywords) || null,
      content.urlSlug || null,
      aiGenerateLogId || null
    ]
  );

  return result.insertId || null;
}

function normalizeProductAiContentRow(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    productId: Number(row.productId),
    descriptionHtml: row.descriptionHtml || '',
    faqHtml: row.faqHtml || '',
    seoTitle: row.seoTitle || '',
    metaDescription: row.metaDescription || '',
    seoKeywords: normalizeText(row.seoKeywords)
      .split(',')
      .map(keyword => keyword.trim())
      .filter(Boolean),
    urlSlug: row.urlSlug || '',
    aiGenerateLogId: row.aiGenerateLogId ? Number(row.aiGenerateLogId) : null,
    status: Number(row.status || 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

async function getProductAiContent(productId) {
  const normalizedProductId = normalizeNumber(productId);

  if (!normalizedProductId) {
    const error = new Error('Product id is required');
    error.statusCode = 400;
    throw error;
  }

  await ensureProductAiContentTable();

  const [rows] = await pool.query(
    `SELECT
      id,
      product_id AS productId,
      description_html AS descriptionHtml,
      faq_html AS faqHtml,
      seo_title AS seoTitle,
      meta_description AS metaDescription,
      seo_keywords AS seoKeywords,
      url_slug AS urlSlug,
      ai_generate_log_id AS aiGenerateLogId,
      status,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM product_ai_content
    WHERE product_id = ?
      AND status = 1
    LIMIT 1`,
    [normalizedProductId]
  );

  return normalizeProductAiContentRow(rows[0]);
}

async function getLatestProductGeneratedContent(productId, type = DEFAULT_GENERATE_TYPE) {
  const normalizedProductId = normalizeNumber(productId);

  if (!normalizedProductId) {
    const error = new Error('Product id is required');
    error.statusCode = 400;
    throw error;
  }

  await ensureAiGenerateLogTable();

  const [rows] = await pool.query(
    `SELECT
      id,
      product_id AS productId,
      type,
      response,
      model,
      tokens,
      status,
      error_message AS errorMessage,
      created_at AS createdAt
    FROM ai_generate_log
    WHERE product_id = ?
      AND type = ?
      AND status = 1
      AND response IS NOT NULL
    ORDER BY id DESC
    LIMIT 1`,
    [normalizedProductId, normalizeGenerateType(type)]
  );

  const log = rows[0];
  if (!log) {
    return null;
  }

  return {
    productId: Number(log.productId),
    aiGenerateLogId: Number(log.id),
    type: log.type,
    model: log.model,
    tokens: Number(log.tokens || 0),
    createdAt: log.createdAt,
    ...parseGeneratedContentResponse(log.response)
  };
}

async function generateProductContent(input) {
  const product = normalizeProductInput(input);
  const type = normalizeGenerateType(input.type);
  const prompt = buildProductContentPrompt(product);
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

  const logBase = {
    productId: product.productId,
    type,
    prompt,
    model
  };

  if (!product.title) {
    const error = new Error('Product title is required');
    error.statusCode = 400;
    await writeAiGenerateLog({
      ...logBase,
      status: 0,
      errorMessage: error.message
    });
    throw error;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error('OPENAI_API_KEY is not configured');
    error.statusCode = 500;
    await writeAiGenerateLog({
      ...logBase,
      status: 0,
      errorMessage: error.message
    });
    throw error;
  }

  const payload = {
    model,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: [
              'You write concise ecommerce SEO content.',
              'Return valid JSON only.'
            ].join(' ')
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: prompt
          }
        ]
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'product_content',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            seoTitle: { type: 'string' },
            metaDescription: { type: 'string' },
            descriptionHtml: { type: 'string' },
            faqHtml: { type: 'string' },
            seoKeywords: {
              type: 'array',
              items: { type: 'string' }
            },
            urlSlug: { type: 'string' }
          },
          required: [
            'seoTitle',
            'metaDescription',
            'descriptionHtml',
            'faqHtml',
            'seoKeywords',
            'urlSlug'
          ]
        }
      }
    },
    max_output_tokens: 1800,
    store: false
  };

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseJson = await response.json().catch(() => ({}));
    const tokens = getUsageTokens(responseJson);

    if (!response.ok) {
      const message = responseJson.error?.message || 'OpenAI request failed';
      const error = new Error(message);
      error.statusCode = response.status;
      await writeAiGenerateLog({
        ...logBase,
        response: JSON.stringify(responseJson),
        tokens,
        status: 0,
        errorMessage: error.message
      });
      error.logged = true;
      throw error;
    }

    const outputText = extractOutputText(responseJson);
    if (!outputText) {
      const error = new Error('OpenAI returned empty content');
      error.statusCode = 502;
      await writeAiGenerateLog({
        ...logBase,
        response: JSON.stringify(responseJson),
        tokens,
        status: 0,
        errorMessage: error.message
      });
      error.logged = true;
      throw error;
    }

    const content = normalizeGeneratedContent(parseJsonOutput(outputText));

    const logId = await writeAiGenerateLog({
      ...logBase,
      response: JSON.stringify(content),
      tokens,
      status: 1
    });

    await upsertProductAiContent(product.productId, content, logId);

    return {
      ...content,
      aiGenerateLogId: logId
    };
  } catch (error) {
    if (!error.statusCode) {
      error.statusCode = 500;
    }

    if (!error.logged) {
      try {
        await writeAiGenerateLog({
          ...logBase,
          status: 0,
          errorMessage: error.message
        });
      } catch (logError) {
        console.error(logError);
      }
    }

    throw error;
  }
}

module.exports = {
  generateProductContent,
  getProductAiContent,
  getLatestProductGeneratedContent,
  getProductContentTemplate
};
