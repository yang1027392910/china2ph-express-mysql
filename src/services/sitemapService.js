const db = require('../config/db');

const SITE_URL = 'https://china2ph.com';
const SITEMAP_URL_LIMIT = 50000;
const fixedSitemapUrls = [
  { pathname: '/', changefreq: 'daily', priority: '1.0' },
  { pathname: '/hot-products', changefreq: 'daily', priority: '0.9' },
  { pathname: '/suppliers', changefreq: 'weekly', priority: '0.8' },
  { pathname: '/logistics-suppliers', changefreq: 'weekly', priority: '0.8' },
  { pathname: '/procurement-support', changefreq: 'monthly', priority: '0.7' },
  { pathname: '/about-policies', changefreq: 'monthly', priority: '0.6' }
];
let productSitemapSource;

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 10)
    : date.toISOString().slice(0, 10);
}

async function getProductSitemapSource() {
  if (productSitemapSource) {
    return productSitemapSource;
  }

  const [[productListTable]] = await db.query("SHOW TABLES LIKE 'productlist'");
  let table = productListTable ? 'productlist' : null;

  if (!table) {
    const [[productTable]] = await db.query("SHOW TABLES LIKE 'product'");
    table = productTable ? 'product' : null;
  }

  if (!table) {
    throw new Error('Product table not found');
  }

  const [columns] = await db.query(`SHOW COLUMNS FROM ${table}`);
  const columnSet = new Set(columns.map(column => column.Field));
  const dateColumns = ['updated_at', 'created_at'].filter(column => columnSet.has(column));
  const dateColumnSelect = dateColumns.length ? `, ${dateColumns.join(', ')}` : '';
  const statusWhereSql = columnSet.has('status') ? 'WHERE status = 1' : '';

  productSitemapSource = {
    table,
    dateColumnSelect,
    statusWhereSql
  };

  return productSitemapSource;
}

function buildSitemapUrlXml({ loc, lastmod, changefreq = 'weekly', priority = '0.8' }) {
  return `
  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${formatDate(lastmod)}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

async function getActiveProducts() {
  const source = await getProductSitemapSource();
  const [products] = await db.query(`
    SELECT id${source.dateColumnSelect}
    FROM ${source.table}
    ${source.statusWhereSql}
    ORDER BY id ASC
  `);

  return products;
}

async function generateSitemapXml() {
  const products = await getActiveProducts();

  if (fixedSitemapUrls.length + products.length > SITEMAP_URL_LIMIT) {
    console.warn('Sitemap URL count exceeds 50000. Add sitemap index splitting before submitting.');
  }

  const fixedXml = fixedSitemapUrls.map(page => buildSitemapUrlXml({
    loc: `${SITE_URL}${page.pathname}`,
    changefreq: page.changefreq,
    priority: page.priority
  })).join('');

  const productXml = products.map(product => buildSitemapUrlXml({
    loc: `${SITE_URL}/product-card?id=${product.id}`,
    lastmod: product.updated_at || product.created_at
  })).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${fixedXml}${productXml}
</urlset>`;
}

module.exports = {
  SITE_URL,
  generateSitemapXml
};
