function withoutTransaction(sql) {
  // These repository SQL files have one outer transaction, removed so the complete
  // import and password change succeed or roll back together on one connection.
  return sql.replace(/^BEGIN;\s*$/gm, '').replace(/^COMMIT;\s*$/gm, '');
}

export async function initializeHostedDatabase(client, { schema, snapshot, migration, passwordHash }) {
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock(198611, 1)');
    const found = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' LIMIT 1");
    if (found.rows.length) throw new Error('Refusing import: this hosted database already contains tables. No saved records were replaced.');
    await client.query(schema);
    await client.query(withoutTransaction(snapshot));
    await client.query(withoutTransaction(migration));
    // The public repository documents its original demo passwords. Replace every
    // imported account password before any hosted sign-in becomes possible.
    await client.query(`UPDATE users SET password_hash = $1, token_version = token_version + 1,
      otp_hash = NULL, otp_expires_at = NULL, reset_token_hash = NULL, reset_expires_at = NULL`, [passwordHash]);
    await client.query('UPDATE system_settings SET scheduler_enabled = false');
    const result = await client.query('SELECT count(*)::int AS total FROM users');
    await client.query('COMMIT');
    return result.rows[0].total;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* Preserve the import failure. */ }
    throw error;
  }
}
