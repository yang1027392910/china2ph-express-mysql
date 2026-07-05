const pool = require('../config/db');

let productSearchSource;

async function getProductSearchSource() {
  if (productSearchSource) {
    return productSearchSource;
  }

  const [[productListTable]] = await pool.query("SHOW TABLES LIKE 'productlist'");
  const table = productListTable ? 'productlist' : 'product';
  const [columns] = await pool.query(`SHOW COLUMNS FROM ${table}`);
  const columnSet = new Set(columns.map(column => column.Field));

  productSearchSource = {
    table,
    chinaCostSelect: columnSet.has('china_cost') ? 'p.china_cost' : 'p.china_price',
    profitMarginSelect: columnSet.has('profit_margin') ? 'p.profit_margin' : 'NULL',
    moqSelect: columnSet.has('moq') ? 'p.moq' : 'p.minimum_order_quantity'
  };

  return productSearchSource;
}

function buildSearchSql(source) {
  const fromSql = `
    FROM ${source.table} p
    LEFT JOIN category c ON p.category_id = c.id
    WHERE
      p.status = 1
      AND c.status = 1
      AND (
        p.title LIKE CONCAT('%', ?, '%')
        OR p.description LIKE CONCAT('%', ?, '%')
        OR c.name LIKE CONCAT('%', ?, '%')
      )
  `;

  return {
    listSql: `
      SELECT
        p.id,
        p.title,
        p.cover,
        p.description,
        ${source.chinaCostSelect} AS china_cost,
        p.ph_price,
        p.profit,
        ${source.profitMarginSelect} AS profit_margin,
        ${source.moqSelect} AS moq,
        p.sales,
        p.category_id,
        c.name AS category_name
      ${fromSql}
      ORDER BY
        p.sales DESC,
        p.id DESC
      LIMIT ?, ?
    `,
    countSql: `
      SELECT COUNT(*) AS total
      ${fromSql}
    `
  };
}

async function searchH5Products({ keyword, page = 1, pageSize = 20 }) {
  const normalizedKeyword = String(keyword || '').trim();
  const normalizedPage = Math.max(Number(page || 1), 1);
  const normalizedPageSize = Math.max(Number(pageSize || 20), 1);
  const offset = (normalizedPage - 1) * normalizedPageSize;
  const searchParams = [normalizedKeyword, normalizedKeyword, normalizedKeyword];
  const source = await getProductSearchSource();
  const { listSql, countSql } = buildSearchSql(source);

  const [[countRow]] = await pool.query(countSql, searchParams);
  const [list] = await pool.query(listSql, [...searchParams, offset, normalizedPageSize]);

  return {
    list,
    total: countRow.total,
    page: normalizedPage,
    pageSize: normalizedPageSize
  };
}

module.exports = {
  buildSearchSql,
  getProductSearchSource,
  searchH5Products
};
