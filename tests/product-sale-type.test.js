const { test } = require('node:test');
const assert = require('node:assert/strict');
const pool = { query: async () => { throw new Error('Unexpected query'); } };
require.cache[require.resolve('../src/config/db')] = { exports: pool };
const controller = require('../src/controllers/product.controller');
function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
}
test('admin rejects invalid sale types before writing', async () => {
  for (const saleType of [0, 3, -1, null, true, '', [], {}, 'preorder']) {
    for (const handler of [controller.adminProductCreate, controller.adminProductUpdate]) {
      const res = response();
      await handler({ body: { id: 1, title: 'Product', saleType }, params: {} }, res);
      assert.equal(res.statusCode, 400);
    }
  }
});
test('admin create defaults to stock and persists explicit pre-order', async () => {
  for (const value of [undefined, 1, 2, '2']) {
    const calls = [];
    pool.query = async (sql, params) => { calls.push({ sql, params }); return sql.startsWith('SELECT') ? [[{ nextId: 1 }]] : [{ affectedRows: 1 }]; };
    const res = response();
    await controller.adminProductCreate({ body: { title: 'Product', saleType: value } }, res);
    assert.equal(res.body.data.saleType, value === undefined ? 1 : Number(value));
    assert.equal(calls[1].params[1], res.body.data.saleType);
    assert.equal((calls[1].sql.match(/\?/g) || []).length, calls[1].params.length);
  }
});
test('admin update preserves omitted type and supports snake case', async () => {
  for (const body of [{ id: 1, title: 'Updated' }, { id: 1, sale_type: 2 }]) {
    const calls = [];
    pool.query = async (sql, params) => { calls.push({ sql, params }); return sql.includes('UPDATE productlist') ? [{ affectedRows: 1 }] : [[{ id: 1, saleType: 2 }]]; };
    const res = response();
    await controller.adminProductUpdate({ body, params: {} }, res);
    assert.equal(res.body.data.saleType, 2);
    assert.equal(calls[0].sql.includes('sale_type = ?'), body.sale_type !== undefined);
  }
});
