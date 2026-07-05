let emailCodeLogUserAgentSchemaReady;

async function ensureEmailCodeLogUserAgentSchema(pool) {
  if (!emailCodeLogUserAgentSchemaReady) {
    emailCodeLogUserAgentSchemaReady = (async () => {
      const [columns] = await pool.query("SHOW COLUMNS FROM email_code_log LIKE 'user_agent'");

      if (!columns.length) {
        await pool.query('ALTER TABLE email_code_log ADD COLUMN user_agent VARCHAR(500) DEFAULT NULL AFTER ip');
      }
    })();
  }

  return emailCodeLogUserAgentSchemaReady;
}

module.exports = {
  ensureEmailCodeLogUserAgentSchema
};
