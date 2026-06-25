const INVITE_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const INVITE_CODE_LENGTH = 8;

let schemaReadyPromise = null;

function buildRandomInviteCode() {
  let code = '';

  for (let index = 0; index < INVITE_CODE_LENGTH; index += 1) {
    code += INVITE_CODE_CHARS[Math.floor(Math.random() * INVITE_CODE_CHARS.length)];
  }

  return code;
}

async function hasColumn(db, tableName, columnName) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS total
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );

  return Number(rows[0]?.total || 0) > 0;
}

async function hasTable(db, tableName) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS total
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?`,
    [tableName]
  );

  return Number(rows[0]?.total || 0) > 0;
}

async function hasIndex(db, tableName, indexName) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS total
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND INDEX_NAME = ?`,
    [tableName, indexName]
  );

  return Number(rows[0]?.total || 0) > 0;
}

async function ensureInviteSchema(db) {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      const columns = [
        ['invite_code', "ALTER TABLE `user` ADD COLUMN invite_code VARCHAR(20) NULL COMMENT '邀请码'"],
        ['inviter_id', "ALTER TABLE `user` ADD COLUMN inviter_id BIGINT NULL COMMENT '邀请人ID'"],
        ['invite_count', "ALTER TABLE `user` ADD COLUMN invite_count INT DEFAULT 0 COMMENT '有效邀请人数'"],
        ['can_lottery', "ALTER TABLE `user` ADD COLUMN can_lottery TINYINT(1) DEFAULT 0 COMMENT '是否可抽奖'"]
      ];

      for (const [columnName, sql] of columns) {
        if (!await hasColumn(db, 'user', columnName)) {
          await db.query(sql);
        }
      }

      if (!await hasIndex(db, 'user', 'uk_user_invite_code')) {
        await db.query('ALTER TABLE `user` ADD UNIQUE KEY uk_user_invite_code (invite_code)');
      }

      if (!await hasIndex(db, 'user', 'idx_user_inviter_id')) {
        await db.query('ALTER TABLE `user` ADD INDEX idx_user_inviter_id (inviter_id)');
      }

      if (
        await hasTable(db, 'user_verification') &&
        !await hasColumn(db, 'user_verification', 'invite_counted')
      ) {
        await db.query("ALTER TABLE user_verification ADD COLUMN invite_counted TINYINT(1) DEFAULT 0 COMMENT '是否已计算邀请人数'");
      }
    })().catch(error => {
      schemaReadyPromise = null;
      throw error;
    });
  }

  return schemaReadyPromise;
}

async function generateInviteCode(db) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = buildRandomInviteCode();
    const [[exists]] = await db.query(
      'SELECT id FROM `user` WHERE invite_code = ? LIMIT 1',
      [code]
    );

    if (!exists) return code;
  }

  throw new Error('Failed to generate unique invite code');
}

async function ensureUserInviteCode(db, userId) {
  const [[user]] = await db.query(
    'SELECT invite_code AS inviteCode FROM `user` WHERE id = ? LIMIT 1',
    [userId]
  );

  if (user?.inviteCode) return user.inviteCode;

  // 邀请码必须唯一；如果极小概率撞码，重新生成再写入。
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = await generateInviteCode(db);

    try {
      await db.query(
        `UPDATE \`user\`
        SET invite_code = ?,
          updated_at = NOW()
        WHERE id = ?
          AND (invite_code IS NULL OR invite_code = '')`,
        [code, userId]
      );

      const [[updatedUser]] = await db.query(
        'SELECT invite_code AS inviteCode FROM `user` WHERE id = ? LIMIT 1',
        [userId]
      );

      if (updatedUser?.inviteCode) return updatedUser.inviteCode;
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY') throw error;
    }
  }

  throw new Error('Failed to save unique invite code');
}

async function findInviterByCode(db, inviteCode, currentUserId = 0) {
  const normalizedInviteCode = String(inviteCode || '').trim().toUpperCase();

  if (!normalizedInviteCode) return null;

  const [[inviter]] = await db.query(
    `SELECT id
    FROM \`user\`
    WHERE invite_code = ?
    LIMIT 1`,
    [normalizedInviteCode]
  );

  if (!inviter || Number(inviter.id) === Number(currentUserId)) return null;
  return inviter;
}

module.exports = {
  ensureInviteSchema,
  ensureUserInviteCode,
  findInviterByCode,
  generateInviteCode
};
