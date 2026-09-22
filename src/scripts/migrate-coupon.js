const fs = require('fs');
const path = require('path');
async function migrateCoupon(connection) {
  const sql = fs.readFileSync(path.join(__dirname, 'migrations/20260922-coupon.sql'), 'utf8');
  for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) {
    await connection.query(statement);
  }
}
module.exports = migrateCoupon;
if (require.main === module) {
  const pool = require('../config/db');
  (async () => {
    const connection = await pool.getConnection();
    try { await migrateCoupon(connection); console.log('Coupon migration completed'); }
    finally { connection.release(); }
  })().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
}
