import { query } from '../db.js';
import { httpError } from '../http.js';

export async function getSettings(client) {
  const db = client || { query };
  const { rows } = await db.query('SELECT * FROM system_settings WHERE id = 1');
  if (!rows[0]) throw httpError(500, 'System settings are missing');
  return rows[0];
}

export async function updateSettings(patch) {
  const current = await getSettings();
  const next = {
    retry_attempts: patch.retryAttempts ?? current.retry_attempts,
    retry_delay_seconds: patch.retryDelaySeconds ?? current.retry_delay_seconds,
    escalation_delay_seconds: patch.escalationDelaySeconds ?? current.escalation_delay_seconds,
    scheduler_enabled: patch.schedulerEnabled ?? current.scheduler_enabled
  };
  const { rows } = await query(
    `UPDATE system_settings
     SET retry_attempts = $1, retry_delay_seconds = $2, escalation_delay_seconds = $3,
         scheduler_enabled = $4, updated_at = now()
     WHERE id = 1
     RETURNING *`,
    [next.retry_attempts, next.retry_delay_seconds, next.escalation_delay_seconds, next.scheduler_enabled]
  );
  return rows[0];
}
