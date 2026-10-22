// A transaction must retain one PostgreSQL connection until commit or rollback.
export async function postgresTransaction(pool, fn, shape = (result) => result) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn({ query: async (text, params) => shape(await client.query(text, params)) });
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* Preserve the original failure. */ }
    throw error;
  } finally {
    client.release();
  }
}
