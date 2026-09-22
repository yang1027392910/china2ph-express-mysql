const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cents, decimal } = require('../src/utils/money');
const { discount } = require('../src/services/coupon.service');
test('decimal arithmetic is exact and discount is capped', () => {
  assert.equal(decimal(cents('0.10') + cents('0.20')), '0.30');
  assert.equal(discount('30.00', '50.00'), '30.00');
  assert.equal(discount('0.00', '50.00'), '0.00');
  assert.equal(decimal(cents('99999999.99')), '99999999.99');
  for (const input of [-1, '1.001', '1e2', true, null, '', '100000000']) assert.throws(() => cents(input));
  assert.throws(() => decimal(10000000000n));
});
