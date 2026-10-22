import crypto from 'crypto';
import { query, withTransaction } from '../db.js';
import { httpError } from '../http.js';
import { audit } from '../util/audit.js';
import { buildPrompt } from '../util/time.js';
import { wellnessDigit } from './audioLibrary.js';
import { emitUpdate } from '../realtime.js';
import { getElderlyForUser } from './profiles.js';
import { getSettings } from './settings.js';
import { raiseAlert, refreshElderlyStatus } from './alerts.js';
import { send } from './notify.js';
import { hangup, originate } from './voiceClient.js';

const LIVE = ['dialing', 'ringing', 'connected', 'playing', 'waiting_dtmf'];
const STALE_LIVE_INTERVAL = '3 minutes';

async function closeUnfinishedCalls({ elderlyId, onlyStale, reason }) {
  const staleSql = onlyStale ? `AND started_at < now() - interval '${STALE_LIVE_INTERVAL}'` : '';
  const params = [reason, LIVE];
  const elderlySql = elderlyId ? `AND elderly_id = $3` : '';
  if (elderlyId) params.push(elderlyId);
  const { rows } = await query(
    `UPDATE call_records
     SET status = 'failed',
         failure_reason = $1,
         ended_at = COALESCE(ended_at, now()),
         duration_seconds = COALESCE(duration_seconds, 0),
         updated_at = now()
     WHERE status = ANY($2::text[])
       ${elderlySql}
       ${staleSql}
     RETURNING id`,
    params
  );
  await Promise.all(rows.map((row) => hangup(row.id)));
  return rows;
}

export async function releaseStaleLiveCalls() {
  return closeUnfinishedCalls({
    onlyStale: true,
    reason: 'The check-in was left unfinished'
  });
}

const CALL_SQL = `
  SELECT cr.*, c.user_id AS customer_user_id
  FROM call_records cr
  JOIN customers c ON c.id = cr.customer_id
`;

export async function getCall(id, client) {
  const db = client || { query };
  const { rows } = await db.query(`${CALL_SQL} WHERE cr.id = $1`, [id]);
  return rows[0] || null;
}

async function lockCall(client, id) {
  const { rows } = await client.query(`${CALL_SQL} WHERE cr.id = $1 FOR UPDATE OF cr`, [id]);
  if (!rows[0]) throw httpError(404, 'Call not found');
  return rows[0];
}

function emitCall(call, extra = {}) {
  emitUpdate({
    topic: extra.topic || 'call',
    callId: call.id,
    elderlyId: call.elderly_id,
    status: call.status,
    resultCode: call.result_code,
    alertId: extra.alertId || null
  }, [call.customer_user_id]);
}

export async function connectVoice(call) {
  try {
    const voice = await originate(call);
    await query(
      `UPDATE call_records SET mode = $2, updated_at = now()
       WHERE id = $1 AND status = ANY($3::text[])`,
      [call.id, voice.mode || 'demo', LIVE]
    );
    const full = await getCall(call.id);
    emitCall(full);
    return full;
  } catch (error) {
    await query(
      `UPDATE call_records
       SET status = 'failed', failure_reason = $2, ended_at = now(), updated_at = now()
       WHERE id = $1`,
      [call.id, error.message]
    );
    const full = await getCall(call.id);
    if (full) emitCall(full);
    throw httpError(502, 'The voice server could not start the call');
  }
}

export async function createOutboundCall({ elderly, user, schedule, origin }) {
  await closeUnfinishedCalls({
    elderlyId: elderly.id,
    onlyStale: origin !== 'manual',
    reason: 'The earlier check-in was left unfinished'
  });
  const settings = await getSettings();
  const language = ['en', 'si', 'ta'].includes(elderly.preferred_language) ? elderly.preferred_language : 'en';
  const prompt = buildPrompt(new Date(), language);
  let inserted;
  try {
    inserted = await query(
      `INSERT INTO call_records (
         group_id, elderly_id, customer_id, schedule_id, initiated_by, callee_name, phone,
         mode, origin, status, attempt_number, max_attempts, prompt_text
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'demo',$8,'dialing',1,$9,$10)
       RETURNING *`,
      [
        crypto.randomUUID(),
        elderly.id,
        elderly.customer_id,
        schedule?.id || null,
        origin === 'manual' ? user?.id || null : null,
        elderly.full_name,
        elderly.phone,
        origin,
        schedule?.retry_attempts || settings.retry_attempts,
        prompt
      ]
    );
  } catch (error) {
    if (error.code === '23505') throw httpError(409, 'A call is already in progress for this person');
    throw error;
  }
  const call = inserted.rows[0];
  call.speak = origin !== 'manual';
  return connectVoice(call);
}

export async function startTestCall({ elderlyId, user }) {
  const elderly = await getElderlyForUser(user, elderlyId);
  const { rows } = await query(
    `SELECT * FROM call_schedules WHERE elderly_id = $1 AND enabled = true ORDER BY next_run_at LIMIT 1`,
    [elderlyId]
  );
  const call = await createOutboundCall({
    elderly,
    user,
    schedule: rows[0],
    origin: 'manual'
  });
  await audit({ query }, {
    userId: user.id,
    action: 'test_call_started',
    entityType: 'call',
    entityId: call.id,
    details: { elderlyId }
  });
  return call;
}

export async function advanceStatus(callId, status) {
  if (!LIVE.includes(status)) return null;
  const current = await getCall(callId);
  if (!current || !LIVE.includes(current.status)) return current;
  if (LIVE.indexOf(status) < LIVE.indexOf(current.status)) return current;
  await query(
    `UPDATE call_records
     SET status = $2,
         answered_at = CASE WHEN $2 IN ('connected', 'playing', 'waiting_dtmf') THEN COALESCE(answered_at, now()) ELSE answered_at END,
         updated_at = now()
     WHERE id = $1 AND status = ANY($3::text[])`,
    // Check the allowed predecessor states atomically at UPDATE time. Remote
    // database latency can let several webhook reads observe the same old state.
    [callId, status, LIVE.slice(0, LIVE.indexOf(status) + 1)]
  );
  const full = await getCall(callId);
  if (full) emitCall(full);
  return full;
}

async function finish(client, call, status, resultCode, failureReason = null) {
  const answered = call.answered_at ? new Date(call.answered_at).getTime() : null;
  const duration = answered ? Math.max(1, Math.round((Date.now() - answered) / 1000)) : 0;
  const { rows } = await client.query(
    `UPDATE call_records
     SET status = $2, result_code = $3, failure_reason = $4, ended_at = now(),
         duration_seconds = $5, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [call.id, status, resultCode, failureReason, duration]
  );
  return { ...rows[0], customer_user_id: call.customer_user_id };
}

export async function processDtmf(callId, digit, { user, source, holdMs } = {}) {
  const result = await withTransaction(async (client) => {
    const call = await lockCall(client, callId);
    if (user) await getElderlyForUser(user, call.elderly_id, client);
    if (!LIVE.includes(call.status)) throw httpError(409, 'This call is no longer waiting for a response');
    const interpreted = wellnessDigit(digit, holdMs);
    const code = interpreted.code;
    const heardSource = interpreted.source || source || 'app';
    if (!code) {
      await client.query(
        `INSERT INTO call_responses (call_id, dtmf_digit, response_code, raw_input)
         VALUES ($1,$2,'invalid',$3)`,
        [callId, digit, digit]
      );
      await audit(client, {
        userId: user?.id || null,
        action: 'dtmf_invalid',
        entityType: 'call',
        entityId: callId,
        details: { digit, source: source || 'app' }
      });
      return { call, invalid: true, customerUserId: call.customer_user_id };
    }
    await client.query(
      `INSERT INTO call_responses (call_id, dtmf_digit, response_code, raw_input)
       VALUES ($1,$2,$3,$4)`,
      [callId, digit, code, digit]
    );
    const updated = await finish(client, call, 'completed', code);
    let alert = null;
    if (code === 'okay') {
      await client.query(
        `UPDATE alerts
         SET status = 'resolved', resolved_at = now(), updated_at = now()
         WHERE elderly_id = $1 AND type = 'missed_checkin' AND status <> 'resolved'`,
        [call.elderly_id]
      );
      await refreshElderlyStatus(client, call.elderly_id);
      const flags = await client.query(
        `SELECT notify_checkins, user_id FROM customers WHERE id = $1`,
        [call.customer_id]
      );
      if (flags.rows[0]?.notify_checkins) {
        await send(client, {
          userId: flags.rows[0].user_id,
          audience: 'customer',
          channel: 'in_app',
          title: 'Check-in complete',
          body: `${call.callee_name} is okay. Today's wellness check-in is complete.`,
          type: 'checkin',
          relatedType: 'call',
          relatedId: call.id
        });
      }
    } else if (code === 'assistance') {
      const raised = await raiseAlert(client, {
        elderlyId: call.elderly_id,
        customerId: call.customer_id,
        callId: call.id,
        type: 'assistance',
        title: 'Assistance requested',
        message: `${call.callee_name} has requested assistance during the wellness call.`
      });
      alert = raised.alert;
    } else if (code === 'emergency') {
      const raised = await raiseAlert(client, {
        elderlyId: call.elderly_id,
        customerId: call.customer_id,
        callId: call.id,
        type: 'emergency',
        title: 'Emergency',
        message: `Emergency response received from ${call.callee_name}.`
      });
      alert = raised.alert;
    }
    await audit(client, {
      userId: user?.id || null,
      action: 'dtmf_received',
      entityType: 'call',
      entityId: call.id,
        details: { digit, code, source: heardSource }
    });
    return { call: updated, invalid: false, alert, customerUserId: call.customer_user_id };
  });

  emitCall(result.call, {
    topic: result.alert ? 'alert' : 'call',
    alertId: result.alert?.id
  });
  if (!result.invalid) await hangup(callId);
  return result;
}

export async function processUnansweredEmergency(callId, { user } = {}) {
  const result = await withTransaction(async (client) => {
    const call = await lockCall(client, callId);
    if (user) await getElderlyForUser(user, call.elderly_id, client);
    if (!LIVE.includes(call.status)) throw httpError(409, 'This call is no longer active');
    await client.query(
      `INSERT INTO call_responses (call_id, dtmf_digit, response_code, raw_input)
       VALUES ($1, NULL, 'emergency', 'repeated_no_response')`,
      [call.id]
    );
    const updated = await finish(client, call, 'completed', 'emergency');
    const raised = await raiseAlert(client, {
      elderlyId: call.elderly_id,
      customerId: call.customer_id,
      callId: call.id,
      type: 'emergency',
      title: 'Emergency',
      message: `${call.callee_name} did not press a key after the wellness prompt was repeated. An emergency alert has been recorded.`
    });
    await audit(client, {
      userId: user?.id || null,
      action: 'dtmf_received',
      entityType: 'call',
      entityId: call.id,
      details: { code: 'emergency', source: 'REPEATED_NO_RESPONSE' }
    });
    return { call: updated, alert: raised.alert };
  });

  emitCall(result.call, {
    topic: 'alert',
    alertId: result.alert?.id
  });
  await hangup(callId);
  return result;
}

export async function processFailure(callId, kind, { user } = {}) {
  const result = await withTransaction(async (client) => {
    const call = await lockCall(client, callId);
    if (user) await getElderlyForUser(user, call.elderly_id, client);
    if (!LIVE.includes(call.status)) throw httpError(409, 'This call is no longer active');

    if (kind === 'failed') {
      const updated = await finish(client, call, 'failed', null, 'The call could not be connected');
      await send(client, {
        userId: call.customer_user_id,
        audience: 'customer',
        channel: 'in_app',
        title: 'Call failed',
        body: `The wellness call to ${call.callee_name} could not be connected.`,
        type: 'call_failed',
        relatedType: 'call',
        relatedId: call.id
      });
      return { call: updated, retry: null, alert: null };
    }

    if (kind === 'no_response') {
      await client.query(
        `INSERT INTO call_responses (call_id, dtmf_digit, response_code, raw_input)
         VALUES ($1, NULL, 'no_response', NULL)`,
        [call.id]
      );
      const updated = await finish(client, call, 'completed', 'no_response');
      const raised = await raiseAlert(client, {
        elderlyId: call.elderly_id,
        customerId: call.customer_id,
        callId: call.id,
        type: 'missed_checkin',
        title: 'No keypad response',
        message: `${call.callee_name} answered, but no keypad response was received. This is not an emergency.`
      });
      return { call: updated, retry: null, alert: raised.alert };
    }

    if (call.attempt_number < call.max_attempts) {
      const updated = await finish(client, call, 'no_answer', null);
      const delayRow = call.schedule_id
        ? await client.query('SELECT retry_delay_seconds FROM call_schedules WHERE id = $1', [call.schedule_id])
        : await client.query('SELECT retry_delay_seconds FROM system_settings WHERE id = 1');
      const delay = Number(delayRow.rows[0]?.retry_delay_seconds ?? 30);
      const retry = await client.query(
        `INSERT INTO call_records (
           group_id, elderly_id, customer_id, schedule_id, callee_name, phone, mode, origin, status,
           attempt_number, max_attempts, next_attempt_at, prompt_text
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'retry_pending',$9,$10,$11,$12)
         RETURNING *`,
        [
          call.group_id,
          call.elderly_id,
          call.customer_id,
          call.schedule_id,
          call.callee_name,
          call.phone,
          call.mode,
          call.origin,
          call.attempt_number + 1,
          call.max_attempts,
          new Date(Date.now() + delay * 1000),
          call.prompt_text
        ]
      );
      return { call: updated, retry: retry.rows[0], alert: null };
    }

    const updated = await finish(client, call, 'missed', null);
    const raised = await raiseAlert(client, {
      elderlyId: call.elderly_id,
      customerId: call.customer_id,
      callId: call.id,
      type: 'missed_checkin',
      title: 'Missed check-in',
      message: `We could not reach ${call.callee_name} for the scheduled wellness check-in. This is not an emergency.`
    });
    return { call: updated, retry: null, alert: raised.alert };
  });

  emitCall(result.call, {
    topic: result.alert ? 'alert' : 'call',
    alertId: result.alert?.id
  });
  await hangup(callId);
  return result;
}
