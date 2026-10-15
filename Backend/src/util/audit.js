export async function audit(client, { userId, action, entityType, entityId, details }) {
  await client.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [userId || null, action, entityType, entityId || null, JSON.stringify(details || {})]
  );
}
