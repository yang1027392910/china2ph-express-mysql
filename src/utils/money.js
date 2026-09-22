// Keep MySQL DECIMAL values as strings and calculate with integer cents.
function cents(value) {
  const text = String(value);
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(text)) {
    throw Object.assign(new Error('Invalid DECIMAL(10,2) amount'), { statusCode: 400 });
  }
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
function decimal(value) {
  if (value < 0n || value > 9999999999n) {
    throw Object.assign(new Error('Amount exceeds DECIMAL(10,2) range'), { statusCode: 400 });
  }
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
}
module.exports = { cents, decimal };
