// Opt in: COUPON_MYSQL_TEST=1 node --test tests/coupon.mysql.test.js
// Creates only a random coupon_test_* database, and drops that exact database.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const express = require('express');
const service = require('../src/services/coupon.service');
const migrate = require('../src/scripts/migrate-coupon');

test('Coupon MySQL integration', { skip: process.env.COUPON_MYSQL_TEST !== '1' }, async t => {
  require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
  const config = { host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '123456', dateStrings: true };
  const database = `coupon_test_${crypto.randomBytes(8).toString('hex')}`;
  const admin = await mysql.createConnection(config);
  let pool, server, created = false;
  try {
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`);
    created = true;
    pool = mysql.createPool({ ...config, database, connectionLimit: 10 });
    // Use the existing init schema, without executing its destructive seed logic.
    const init = fs.readFileSync(path.join(__dirname, '../src/scripts/init-db.js'), 'utf8');
    const matches = [...init.matchAll(/`(CREATE TABLE IF NOT EXISTS [\s\S]*?)(?<!\\)`/g)];
    for (const match of matches) {
      const sql = match[1].replace(/\\`/g, '`');
      if (/^CREATE TABLE IF NOT EXISTS (`user`|`order`|order_item|cart|email_code_log)\s*\(/.test(sql)) await pool.query(sql);
    }
    await pool.query('ALTER TABLE `user` ADD verification_status TINYINT DEFAULT -1');
    await pool.query(`CREATE TABLE productlist (id BIGINT PRIMARY KEY, title VARCHAR(255), cover VARCHAR(255), ph_price DECIMAL(10,2), status TINYINT, sale_type TINYINT NOT NULL DEFAULT 1) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE user_verification (id BIGINT PRIMARY KEY AUTO_INCREMENT, user_id BIGINT UNIQUE, full_name VARCHAR(100), phone VARCHAR(50), email VARCHAR(100), address VARCHAR(255), city VARCHAR(100), shop_name VARCHAR(100), business_type VARCHAR(100), store_description TEXT, store_photos JSON, status TINYINT DEFAULT 0, remark VARCHAR(255), reviewed_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, invite_counted TINYINT DEFAULT 0) ENGINE=InnoDB`);
    const migrationConnection = await pool.getConnection();
    try { await migrate(migrationConnection); await migrate(migrationConnection); } finally { migrationConnection.release(); }
    await pool.query("INSERT INTO productlist (id, title, cover, ph_price, status) VALUES (1, 'Test product', '/test.png', 30.00, 1), (2, 'Decimal product', '', 0.10, 1)");
    const dbPath = require.resolve('../src/config/db');
    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
    process.env.ENABLE_TEST_EMAIL_CODE = 'true';
    process.env.TEST_EMAIL_CODE = 'coupon-test-code';
    const app = express();
    app.use(express.json());
    app.use('/api/h5/user', require('../src/routes/h5.userVerification.routes'));
    app.use('/api/h5/coupon', require('../src/routes/h5.coupon.routes'));
    app.use('/api/admin/coupon', require('../src/routes/admin.coupon.routes'));
    app.use('/api/h5/order', require('../src/routes/h5.order.routes'));
    app.use('/api/admin/order', require('../src/routes/admin.order.routes'));
    app.use('/api/h5', require('../src/routes/h5.auth.routes'));
    app.use('/api/admin/user-verification', require('../src/routes/admin.userVerification.routes'));
    app.use('/api/admin/user', require('../src/routes/admin.user.routes'));
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const auth = require('../src/services/auth.service');
    const adminToken = auth.generateToken({ id: 1, role: 'admin' });
    let userId, token, registerId, verifyId, usedId, orderId;
    async function api(url, method = 'GET', body, bearer = token) {
      const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await response.text();
      return { status: response.status, ...(response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : { message: text }) };
    }
    async function transaction(fn) {
      const c = await pool.getConnection();
      try { await c.beginTransaction(); const value = await fn(c); await c.commit(); return value; }
      catch (e) { await c.rollback(); throw e; } finally { c.release(); }
    }
    async function send(amount = '50.00', extra = {}) {
      const response = await api('/api/admin/coupon/send', 'POST', { userId, amount, validDays: 30, ...extra }, adminToken);
      assert.equal(response.code, 0, JSON.stringify(response)); return response.data.id;
    }
    await t.test('actual registration creates both rewards; login and parallel issuance are idempotent', async () => {
      const login = await api('/api/h5/email-code/login', 'POST', { email: 'coupon@example.com', code: 'coupon-test-code' }, null);
      assert.equal(login.code, 0, JSON.stringify(login)); userId = login.data.user.id; token = login.data.token;
      await api('/api/h5/email-code/login', 'POST', { email: 'coupon@example.com', code: 'coupon-test-code' }, null);
      await Promise.all([transaction(c => service.grantRegistrationRewards(c, userId)), transaction(c => service.grantRegistrationRewards(c, userId))]);
      const rewards = await api('/api/h5/coupon/rewards');
      assert.equal(rewards.data.registration.amount, '20.00'); assert.equal(rewards.data.registration.status, 1);
      assert.equal(rewards.data.verification.amount, '40.00'); assert.equal(rewards.data.verification.status, 0);
      assert.equal(rewards.data.verification.expiredAt, null); assert.equal(rewards.data.availableCount, 1);
      registerId = rewards.data.registration.id; verifyId = rewards.data.verification.id;
      const [[count]] = await pool.query('SELECT COUNT(*) AS n FROM user_coupon WHERE user_id = ?', [userId]); assert.equal(count.n, 2);
    });
    await t.test('legacy users get default rewards on first visit without duplicate issuance', async () => {
      for (const verified of [-1, 1]) {
        const [user] = await pool.query('INSERT INTO `user` (email, verification_status) VALUES (?, ?)', ['legacy' + verified + '@example.com', verified]);
        const legacyToken = auth.generateToken({ id: user.insertId, role: 'h5' });
        const results = await Promise.all([
          api('/api/h5/coupon/rewards', 'GET', undefined, legacyToken),
          api('/api/h5/coupon/rewards', 'GET', undefined, legacyToken)
        ]);
        for (const result of results) {
          assert.equal(result.code, 0, JSON.stringify(result));
          assert.equal(result.data.registration.status, 1);
          assert.equal(result.data.verification.status, verified === 1 ? 1 : 0);
          assert.equal(result.data.availableCount, verified === 1 ? 2 : 1);
          assert.equal(result.data.registration.amount, '20.00');
          assert.equal(result.data.verification.amount, '40.00');
        }
        assert.equal(results[0].data.registration.id, results[1].data.registration.id);
        const [[count]] = await pool.query('SELECT COUNT(*) AS n FROM user_coupon WHERE user_id = ?', [user.insertId]);
        assert.equal(count.n, 2);
        await pool.query('UPDATE user_coupon SET status = 4 WHERE user_id = ?', [user.insertId]);
        const again = await api('/api/h5/coupon/rewards', 'GET', undefined, legacyToken);
        assert.equal(again.data.registration.status, 4);
        assert.equal(again.data.verification.status, 4);
        assert.equal(again.data.availableCount, 0);
      }
    });
    await t.test('config changes update unused default rewards; disabled configs skip issuance', async () => {
      const config = await api('/api/admin/coupon/config', 'GET', undefined, adminToken);
      assert.equal(config.data.length, 2);
      const id = config.data[0].id;
      for (const body of [{ amount: -1, validDays: 30, enabled: true }, { amount: 20, validDays: 0, enabled: true }, { type: 3, amount: 20, validDays: 30, enabled: true }]) assert.equal((await api(`/api/admin/coupon/config/${id}`, 'PUT', body, adminToken)).status, 400);
      assert.equal((await api(`/api/admin/coupon/config/${id}`, 'PUT', { amount: 30, validDays: 15, enabled: true }, adminToken)).code, 0);
      assert.equal((await api('/api/h5/coupon/rewards')).data.registration.amount, '30.00');
      const next = await api('/api/h5/email-code/login', 'POST', { email: 'next@example.com', code: 'coupon-test-code' }, null);
      assert.equal((await api('/api/h5/coupon/rewards', 'GET', undefined, next.data.token)).data.registration.amount, '30.00');
      await pool.query('UPDATE coupon_config SET enabled = 0');
      const disabled = await api('/api/h5/email-code/login', 'POST', { email: 'disabled@example.com', code: 'coupon-test-code' }, null);
      assert.equal((await api('/api/h5/coupon/rewards', 'GET', undefined, disabled.data.token)).data.registration, null);
      await pool.query('UPDATE coupon_config SET enabled = 1');
    });
    await t.test('actual admin approval activates verification exactly once', async () => {
      const [result] = await pool.query('INSERT INTO user_verification (user_id) VALUES (?)', [userId]);
      assert.equal((await api(`/api/admin/user-verification/${result.insertId}/approve`, 'POST', {}, adminToken)).code, 0);
      const first = (await api('/api/h5/coupon/rewards')).data.verification;
      assert.equal(first.status, 1); assert.ok(first.expiredAt);
      await pool.query('UPDATE coupon_config SET valid_days = 90 WHERE type = 2');
      assert.equal((await api(`/api/admin/user-verification/${result.insertId}/approve`, 'POST', {}, adminToken)).code, 0);
      assert.equal((await api('/api/h5/coupon/rewards')).data.verification.expiredAt, first.expiredAt);
    });
    await t.test('admin send can repeat; forced type/source; authorization and ownership', async () => {
      usedId = await send('50.00', { type: 1, source: 1, status: 0 });
      const second = await send(); assert.notEqual(usedId, second);
      const detail = await api(`/api/admin/coupon/user/${usedId}`, 'GET', undefined, adminToken);
      assert.equal(detail.data.type, 3); assert.equal(detail.data.source, 2); assert.equal(detail.data.status, 1);
      assert.equal((await api('/api/admin/coupon/config')).status, 403);
      assert.equal((await api('/api/h5/coupon/list', 'GET', undefined, null)).status, 401);
      assert.equal((await api('/api/h5/coupon/list?userId=2')).status, 400);
      const otherToken = auth.generateToken({ id: 99999, role: 'h5' });
      assert.equal((await api('/api/h5/coupon/list', 'GET', undefined, otherToken)).data.total, 0);
      assert.equal((await api('/api/h5/order/create', 'POST', { items: [{ productId: 1 }], userCouponId: usedId }, otherToken)).status, 400);
      assert.equal((await api('/api/admin/coupon/send', 'POST', { userId: 99999, amount: 50, validDays: 30 }, adminToken)).status, 404);
    });
    await t.test('two real concurrent orders use a coupon only once; client prices ignored', async () => {
      const body = { items: [{ productId: 1, quantity: 1, price: 1 }], userCouponId: usedId, discountAmount: 999, totalAmount: 1, payAmount: 1, shippingFee: 999 };
      const results = await Promise.all([api('/api/h5/order/create', 'POST', body), api('/api/h5/order/create', 'POST', body)]);
      assert.equal(results.filter(r => r.code === 0).length, 1);
      const order = results.find(r => r.code === 0).data; orderId = order.id;
      assert.equal(order.totalAmount, 30); assert.equal(order.discountAmount, 30); assert.equal(order.payAmount, 0); assert.equal(order.shippingFee, 0); assert.equal(order.userCouponId, usedId);
      const [[coupon]] = await pool.query('SELECT * FROM user_coupon WHERE id = ?', [usedId]);
      assert.equal(coupon.status, 2); assert.equal(coupon.order_id, order.id); assert.ok(coupon.used_at);
      assert.equal((await api(`/api/admin/coupon/user/${usedId}/disable`, 'PUT', {}, adminToken)).status, 400);
    });
    await t.test('locked, used, expired, disabled and missing coupons rejected; expiry filters agree', async () => {
      for (const status of [0, 2, 3, 4]) {
        const id = await send(); await pool.query('UPDATE user_coupon SET status = ? WHERE id = ?', [status, id]);
        assert.equal((await api('/api/h5/order/create', 'POST', { items: [{ productId: 1 }], userCouponId: id })).status, 400);
      }
      const expired = await send(); await pool.query('UPDATE user_coupon SET expired_at = NOW() WHERE id = ?', [expired]);
      assert.equal((await api('/api/h5/coupon/list?status=3')).data.list.some(row => row.id === expired), true);
      assert.equal((await api('/api/h5/coupon/available?orderAmount=30')).data.some(row => row.id === expired), false);
      assert.equal((await api(`/api/admin/coupon/user/${expired}`, 'GET', undefined, adminToken)).data.status, 3);
      assert.equal((await api(`/api/admin/coupon/user/${expired}/disable`, 'PUT', {}, adminToken)).status, 400);
      assert.equal((await api('/api/h5/order/create', 'POST', { items: [{ productId: 1 }], userCouponId: expired })).status, 400);
      assert.equal((await api('/api/h5/order/create', 'POST', { items: [{ productId: 1 }], userCouponId: 999999 })).status, 400);
      const disable = await send(); assert.equal((await api(`/api/admin/coupon/user/${disable}/disable`, 'PUT', {}, adminToken)).code, 0);
      assert.equal((await api(`/api/admin/coupon/user/${disable}`, 'DELETE', {}, adminToken)).status, 404);
    });
    await t.test('cart selection ownership, capped preview, exact cents, and no-coupon path', async () => {
      const [cart] = await pool.query('INSERT INTO cart (user_id, product_id, quantity, checked) VALUES (?, 2, 3, 1)', [userId]);
      const preview = await api('/api/h5/coupon/available?orderAmount=0.30'); assert.ok(preview.data.every(row => row.discountAmount === '0.30'));
      assert.equal((await api('/api/h5/order/create', 'POST', { cartIds: [cart.insertId, 99999] })).status, 400);
      const response = await api('/api/h5/order/create', 'POST', { cartIds: [cart.insertId], userCouponId: null, discountAmount: 999 });
      assert.equal(response.code, 0); assert.equal(response.data.payAmount, 0.3); assert.equal(response.data.discountAmount, 0);
      const [[count]] = await pool.query('SELECT COUNT(*) AS n FROM cart WHERE id = ?', [cart.insertId]); assert.equal(count.n, 0);
    });
    await t.test('failure after coupon consumption rolls back order, items, coupon and cart', async () => {
      const couponId = await send();
      const [cart] = await pool.query('INSERT INTO cart (user_id, product_id, quantity, checked) VALUES (?, 1, 1, 1)', [userId]);
      const [[before]] = await pool.query('SELECT COUNT(*) AS n FROM `order`');
      await pool.query("CREATE TRIGGER coupon_test_fail_delete BEFORE DELETE ON cart FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Injected rollback test'");
      try { assert.equal((await api('/api/h5/order/create', 'POST', { cartIds: [cart.insertId], userCouponId: couponId })).status, 500); }
      finally { await pool.query('DROP TRIGGER coupon_test_fail_delete'); }
      const [[after]] = await pool.query('SELECT COUNT(*) AS n FROM `order`'); assert.equal(after.n, before.n);
      const [[coupon]] = await pool.query('SELECT * FROM user_coupon WHERE id = ?', [couponId]); assert.equal(coupon.status, 1); assert.equal(coupon.order_id, null); assert.equal(coupon.used_at, null);
      const [[count]] = await pool.query('SELECT COUNT(*) AS n FROM cart WHERE id = ?', [cart.insertId]); assert.equal(count.n, 1);
      const [[orphans]] = await pool.query('SELECT COUNT(*) AS n FROM order_item i LEFT JOIN `order` o ON o.id=i.order_id WHERE o.id IS NULL'); assert.equal(orphans.n, 0);
    });
    await t.test('admin quantity updates preserve capped coupon formula', async () => {
      const detail = await api('/api/h5/order/detail/' + orderId);
      const itemId = detail.data.items[0].id;
      const increased = await api('/api/admin/order/item/update/' + itemId, 'PUT', { quantity: 3 }, adminToken);
      assert.equal(increased.code, 0, JSON.stringify(increased));
      assert.equal(increased.data.totalAmount, 90); assert.equal(increased.data.discountAmount, 50); assert.equal(increased.data.payAmount, 40);
      const decreased = await api('/api/admin/order/item/update/' + itemId, 'PUT', { quantity: 1 }, adminToken);
      assert.equal(decreased.data.discountAmount, 30); assert.equal(decreased.data.payAmount, 0);
    });
    await t.test('admin-created users receive rewards atomically', async () => {
      const response = await api('/api/admin/user/list/created', 'POST', { email: 'admin-created@example.com', nickname: 'Created' }, adminToken);
      assert.equal(response.code, 0, JSON.stringify(response));
      const [rows] = await pool.query('SELECT type, status FROM user_coupon WHERE user_id = ? ORDER BY type', [response.data.id]);
      assert.deepEqual(rows.map(row => [row.type, row.status]), [[1, 1], [2, 0]]);
    });
    await t.test('registration failure rolls back user and partially issued rewards', async () => {
      await pool.query("CREATE TRIGGER coupon_test_fail_reward BEFORE INSERT ON user_coupon FOR EACH ROW BEGIN IF NEW.type = 2 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Injected reward failure'; END IF; END");
      try {
        const response = await api('/api/h5/email-code/login', 'POST', { email: 'rollback@example.com', code: 'coupon-test-code' }, null);
        assert.equal(response.status, 500);
      } finally { await pool.query('DROP TRIGGER coupon_test_fail_reward'); }
      const [[count]] = await pool.query("SELECT COUNT(*) AS n FROM `user` WHERE email = 'rollback@example.com'"); assert.equal(count.n, 0);
      const [[orphans]] = await pool.query('SELECT COUNT(*) AS n FROM user_coupon c LEFT JOIN `user` u ON u.id=c.user_id WHERE u.id IS NULL'); assert.equal(orphans.n, 0);
    });
    await t.test('coupon expired during a lock wait is rejected', async () => {
      const couponId = await send();
      const holder = await pool.getConnection();
      try {
        await holder.beginTransaction();
        await holder.query('SELECT id FROM user_coupon WHERE id = ? FOR UPDATE', [couponId]);
        const pending = api('/api/h5/order/create', 'POST', { items: [{ productId: 1 }], userCouponId: couponId });
        await holder.query('UPDATE user_coupon SET expired_at = NOW() WHERE id = ?', [couponId]);
        await holder.commit();
        assert.equal((await pending).status, 400);
      } finally { await holder.rollback(); holder.release(); }
    });
    await t.test('configured amounts match rewards, preview and consumption while preserving used coupons', async () => {
      const config = (await api('/api/admin/coupon/config', 'GET', undefined, adminToken)).data;
      const registerConfig = config.find(row => row.type === 1);
      const verifyConfig = config.find(row => row.type === 2);
      const [user] = await pool.query('INSERT INTO `user` (email) VALUES (?)', ['sync@example.com']);
      const syncToken = auth.generateToken({ id: user.insertId, role: 'h5' });
      const before = (await api('/api/h5/coupon/rewards', 'GET', undefined, syncToken)).data;
      const issued = await send('55.00', { userId: user.insertId });
      assert.equal((await api('/api/admin/coupon/config/' + registerConfig.id, 'PUT', { amount: '12.00', validDays: 30, enabled: true }, adminToken)).code, 0);
      assert.equal((await api('/api/admin/coupon/config/' + verifyConfig.id, 'PUT', { amount: '400.00', validDays: 30, enabled: true }, adminToken)).code, 0);
      const rewards = (await api('/api/h5/coupon/rewards', 'GET', undefined, syncToken)).data;
      assert.equal(rewards.registration.amount, '12.00');
      assert.equal(rewards.registration.id, before.registration.id);
      assert.equal(rewards.registration.expiredAt, before.registration.expiredAt);
      assert.equal(rewards.verification.amount, '400.00');
      assert.equal(rewards.verification.status, 0);
      const preview = (await api('/api/h5/coupon/available?orderAmount=30', 'GET', undefined, syncToken)).data;
      assert.equal(preview.find(row => row.id === rewards.registration.id).discountAmount, '12.00');
      const order = await api('/api/h5/order/create', 'POST', { items: [{ productId: 1 }], userCouponId: rewards.registration.id }, syncToken);
      assert.equal(order.code, 0); assert.equal(order.data.discountAmount, 12); assert.equal(order.data.payAmount, 18);
      await api('/api/admin/coupon/config/' + registerConfig.id, 'PUT', { amount: '25.00', validDays: 30, enabled: true }, adminToken);
      assert.equal((await api('/api/h5/coupon/rewards', 'GET', undefined, syncToken)).data.registration.amount, '12.00');
      assert.equal((await api('/api/h5/order/detail/' + order.data.id, 'GET', undefined, syncToken)).data.discountAmount, 12);
      assert.equal((await api('/api/admin/coupon/user/' + issued, 'GET', undefined, adminToken)).data.amount, '55.00');
      await pool.query("CREATE TRIGGER coupon_test_fail_sync BEFORE UPDATE ON user_coupon FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Injected config sync failure'");
      try {
        const failed = await api('/api/admin/coupon/config/' + verifyConfig.id, 'PUT', { amount: '500.00', validDays: 30, enabled: true }, adminToken);
        assert.equal(failed.status, 500);
      } finally { await pool.query('DROP TRIGGER coupon_test_fail_sync'); }
      assert.equal((await api('/api/admin/coupon/config', 'GET', undefined, adminToken)).data.find(row => row.type === 2).amount, '400.00');
      assert.equal((await api('/api/h5/coupon/rewards', 'GET', undefined, syncToken)).data.verification.amount, '400.00');
    });
    await t.test('verification submission accepts only basic fields and saves remarks', async () => {
      const [user] = await pool.query('INSERT INTO `user` (email) VALUES (?)', ['simple-verification@example.com']);
      const bearer = auth.generateToken({ id: user.insertId, role: 'h5' });
      const body = { full_name: 'Test Name', phone: '155452233', email: 'test@example.com', address: 'Test address', city: 'ROSARIO', remark: 'User note' };
      const response = await api('/api/h5/user/verification/submit', 'POST', body, bearer);
      assert.equal(response.code, 0, JSON.stringify(response));
      assert.equal(response.data.fullName, body.full_name);
      assert.equal(response.data.remark, 'User note');
      assert.equal(response.data.status, 0);
      assert.equal(response.data.shopName, undefined);
      const [[row]] = await pool.query('SELECT * FROM user_verification WHERE user_id = ?', [user.insertId]);
      assert.equal(row.shop_name, ''); assert.equal(row.business_type, ''); assert.equal(row.remark, 'User note');
      await pool.query("UPDATE user_verification SET shop_name = 'Historical shop' WHERE user_id = ?", [user.insertId]);
      const updated = await api('/api/h5/user/verification/submit', 'POST', { ...body, remark: '', shop_name: 'Ignore incoming shop' }, bearer);
      assert.equal(updated.code, 0); assert.equal(updated.data.id, response.data.id); assert.equal(updated.data.remark, null);
      const [[preserved]] = await pool.query('SELECT shop_name FROM user_verification WHERE user_id = ?', [user.insertId]);
      assert.equal(preserved.shop_name, 'Historical shop');
      assert.equal((await api('/api/h5/user/verification/submit', 'POST', { ...body, full_name: '' }, bearer)).status, 400);
      assert.equal((await api('/api/h5/user/verification/submit', 'POST', { ...body, remark: 'x'.repeat(256) }, bearer)).status, 400);
    });
    await t.test('admin filters, validation, and order detail retain coupon reference', async () => {
      const list = await api(`/api/admin/coupon/user/list?keyword=${userId}&type=3&source=2&pageSize=100`, 'GET', undefined, adminToken);
      assert.equal(list.code, 0); assert.ok(list.data.list.every(row => row.userId === userId && row.type === 3 && row.source === 2));
      for (const query of ['page=0', 'pageSize=101', 'status=9']) assert.equal((await api(`/api/h5/coupon/list?${query}`)).status, 400);
      const detail = await api(`/api/h5/order/detail/${orderId}`); assert.equal(detail.data.userCouponId, usedId);
      const config = await api('/api/admin/coupon/config', 'GET', undefined, adminToken);
      const connection = await pool.getConnection(); try { await migrate(connection); } finally { connection.release(); }
      assert.equal((await api('/api/admin/coupon/config', 'GET', undefined, adminToken)).data[0].amount, config.data[0].amount);
    });
    await t.test('manual payment lifecycle, permissions and concurrent approval', async () => {
      const created = await api('/api/h5/order/create', 'POST', { items: [{ productId: 1, quantity: 1 }] });
      assert.equal(created.code, 0, JSON.stringify(created));
      const id = created.data.id;
      assert.equal(created.data.paymentStatus, 0); assert.equal(created.data.paymentMethod, 0);
      const body = {orderId: id, paymentMethod: 2, referenceNo: '00123456789'};
      const other = auth.generateToken({id: userId + 100000, role: 'h5'});
      assert.equal((await api('/api/h5/order/pay', 'PUT', body, null)).status, 401);
      assert.equal((await api('/api/h5/order/pay', 'PUT', body, other)).status, 404);
      assert.equal((await api('/api/h5/order/pay', 'PUT', body, adminToken)).status, 403);
      assert.equal((await api('/api/admin/order/payment/approve', 'PUT', {orderId: id})).status, 403);
      assert.equal((await api('/api/admin/order/payment/approve', 'PUT', {orderId: id}, adminToken)).status, 409);
      for (const invalid of [{paymentMethod: 0}, {paymentMethod: true}, {referenceNo: ''}, {referenceNo: 'x'.repeat(101)}, {referenceNo: 123}, {orderId: -1}]) {
        assert.equal((await api('/api/h5/order/pay', 'PUT', {...body, ...invalid})).status, 400);
      }
      for (const paymentMethod of [1, 2]) {
        const paid = await api('/api/h5/order/pay', 'PUT', {...body, paymentMethod});
        assert.equal(paid.code, 0, JSON.stringify(paid));
        assert.equal(paid.data.paymentStatus, 1); assert.equal(paid.data.status, created.data.status);
        assert.equal(paid.data.paymentMethod, paymentMethod); assert.equal(paid.data.paymentReference, body.referenceNo);
      }
      const list = await api('/api/admin/order/list?pageSize=100', 'GET', undefined, adminToken);
      const row = list.data.list.find(row => row.id === id);
      assert.equal(row.paymentStatus, 1); assert.equal(row.paymentMethod, 2); assert.equal(row.paymentReference, body.referenceNo);
      const detail = await api('/api/h5/order/detail/' + id);
      assert.equal(detail.data.paymentStatus, 1);
      const approvals = await Promise.all([1, 2].map(() => api('/api/admin/order/payment/approve', 'PUT', {orderId: id}, adminToken)));
      for (const result of approvals) {
        assert.equal(result.code, 0, JSON.stringify(result)); assert.equal(result.data.paymentStatus, 2); assert.equal(result.data.status, 3);
      }
      assert.equal((await api('/api/h5/order/pay', 'PUT', body)).status, 409);
      const completed = await api('/api/admin/order/detail/' + id, 'GET', undefined, adminToken);
      assert.equal(completed.data.paymentStatus, 2); assert.equal(completed.data.status, 3);
      const cancelled = await api('/api/h5/order/create', 'POST', { items: [{ productId: 1, quantity: 1 }] });
      await api('/api/admin/order/update', 'PUT', {id: cancelled.data.id, status: 4}, adminToken);
      assert.equal((await api('/api/h5/order/pay', 'PUT', {...body, orderId: cancelled.data.id})).status, 409);
      assert.equal((await api('/api/admin/order/payment/approve', 'PUT', {orderId: cancelled.data.id}, adminToken)).status, 409);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (pool) await pool.end();
    if (created && /^coupon_test_[0-9a-f]{16}$/.test(database)) await admin.query(`DROP DATABASE \`${database}\``);
    await admin.end();
  }
});
