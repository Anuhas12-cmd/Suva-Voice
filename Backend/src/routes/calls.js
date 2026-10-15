import { Router } from 'express';
import { config } from '../config.js';
import { query } from '../db.js';
import { asyncHandler, validate } from '../http.js';
import { requireAuth } from '../middleware/auth.js';
import { timingSafeString } from '../util/security.js';
import { accessClause, addDateRange, pageParams, present, presentAll } from '../util/present.js';
import { nextRunAt } from '../util/time.js';
import { getElderlyForUser } from '../services/profiles.js';
import { advanceStatus, getCall, processDtmf, processFailure, processUnansweredEmergency, startTestCall } from '../services/calls.js';
import { languageFromText, resolveAudio } from '../services/audioLibrary.js';
import { openCallOnComputer } from '../services/openCall.js';
import { runScheduleById } from '../services/scheduler.js';
import { dtmfSchema, schedulePatchSchema, scheduleSchema, simulateSchema, voiceEventSchema } from '../validators.js';

const router = Router();

function voiceSecret(req, res, next) {
  if (!timingSafeString(req.headers['x-voice-secret'] || '', config.voiceWebhookSecret)) {
    return res.status(401).json({ error: { message: 'Voice secret is not valid' } });
  }
  return next();
}

router.post('/voice/events', voiceSecret, validate(voiceEventSchema), asyncHandler(async (req, res) => {
  const { callId, event, digit } = req.body;
  try {
    if (['ringing', 'connected', 'playing', 'waiting_dtmf'].includes(event)) {
      await advanceStatus(callId, event);
    } else if (event === 'dtmf') {
      await processDtmf(callId, digit || '', { source: 'voice' });
    } else if (event === 'no_answer' || event === 'failed' || event === 'no_response') {
      await processFailure(callId, event, { source: 'voice' });
    }
  } catch (error) {
    if (error.status === 409 || error.status === 404) {
      return res.json({ data: { ignored: true } });
    }
    throw error;
  }
  res.json({ data: { accepted: true } });
}));

router.use(requireAuth);

router.get('/call-schedules', asyncHandler(async (req, res) => {
  const params = [];
  const where = [accessClause(req.user, params, 'e.customer_id')];
  if (req.query.elderlyId) {
    params.push(req.query.elderlyId);
    where.push(`s.elderly_id = $${params.length}`);
  }
  const { rows } = await query(
    `SELECT s.*, e.full_name AS elderly_name, e.phone AS elderly_phone, e.customer_id
     FROM call_schedules s
     JOIN elderly_profiles e ON e.id = s.elderly_id
     WHERE ${where.join(' AND ')}
     ORDER BY s.next_run_at`,
    params
  );
  res.json({ data: presentAll(rows) });
}));

router.post('/call-schedules', validate(scheduleSchema), asyncHandler(async (req, res) => {
  await getElderlyForUser(req.user, req.body.elderlyId);
  const { rows } = await query(
    `INSERT INTO call_schedules (
       elderly_id, time_of_day, days_of_week, enabled, retry_attempts, retry_delay_seconds, next_run_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      req.body.elderlyId,
      req.body.timeOfDay,
      req.body.daysOfWeek,
      req.body.enabled,
      req.body.retryAttempts,
      req.body.retryDelaySeconds,
      nextRunAt(req.body.timeOfDay, req.body.daysOfWeek)
    ]
  );
  res.status(201).json({ data: present(rows[0]) });
}));

router.patch('/call-schedules/:id', validate(schedulePatchSchema), asyncHandler(async (req, res) => {
  const existing = await query(
    `SELECT s.*, e.customer_id FROM call_schedules s
     JOIN elderly_profiles e ON e.id = s.elderly_id WHERE s.id = $1`,
    [req.params.id]
  );
  if (!existing.rows[0]) return res.status(404).json({ error: { message: 'Schedule not found' } });
  await getElderlyForUser(req.user, existing.rows[0].elderly_id);
  const time = req.body.timeOfDay || String(existing.rows[0].time_of_day).slice(0, 5);
  const days = req.body.daysOfWeek || existing.rows[0].days_of_week;
  const { rows } = await query(
    `UPDATE call_schedules SET
       time_of_day = $2,
       days_of_week = $3,
       enabled = COALESCE($4, enabled),
       retry_attempts = COALESCE($5, retry_attempts),
       retry_delay_seconds = COALESCE($6, retry_delay_seconds),
       next_run_at = $7,
       updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      req.params.id,
      time,
      days,
      req.body.enabled ?? null,
      req.body.retryAttempts ?? null,
      req.body.retryDelaySeconds ?? null,
      nextRunAt(time, days)
    ]
  );
  res.json({ data: present(rows[0]) });
}));

router.post('/call-schedules/:id/run-now', asyncHandler(async (req, res) => {
  const existing = await query('SELECT elderly_id FROM call_schedules WHERE id = $1', [req.params.id]);
  if (!existing.rows[0]) return res.status(404).json({ error: { message: 'Schedule not found' } });
  await getElderlyForUser(req.user, existing.rows[0].elderly_id);
  const call = await runScheduleById(req.params.id);
  res.status(201).json({ data: present(call) });
}));

router.get('/calls', asyncHandler(async (req, res) => {
  const params = [];
  const where = [accessClause(req.user, params, 'cr.customer_id')];
  if (req.query.elderlyId) {
    params.push(req.query.elderlyId);
    where.push(`cr.elderly_id = $${params.length}`);
  }
  if (req.query.status) {
    params.push(req.query.status);
    where.push(`cr.status = $${params.length}`);
  }
  if (req.query.result) {
    params.push(req.query.result);
    where.push(`cr.result_code = $${params.length}`);
  }
  addDateRange(where, params, 'cr.started_at', req.query.from, req.query.to);
  const { limit, offset } = pageParams(req);
  const { rows } = await query(
    `SELECT cr.*, a.type AS alert_type, a.status AS alert_status
     FROM call_records cr
     LEFT JOIN alerts a ON a.call_id = cr.id
     WHERE ${where.join(' AND ')}
     ORDER BY cr.started_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  res.json({ data: presentAll(rows) });
}));

function sendPrompt(req, res, promptId) {
  return (async () => {
    const call = await getCall(req.params.id);
    if (!call) return res.status(404).json({ error: { message: 'Call not found' } });
    await getElderlyForUser(req.user, call.elderly_id);
    const language = languageFromText(call.prompt_text);
    if (!language) {
      return res.status(404).json({ error: { message: 'This call has no recognised language, so no audio was played' } });
    }
    try {
      const audio = resolveAudio(promptId, language);
      res.setHeader('Content-Type', audio.contentType);
      res.setHeader('Cache-Control', 'no-store');
      return res.sendFile(audio.file);
    } catch (error) {
      return res.status(error.status || 404).json({ error: { message: error.message } });
    }
  })();
}

router.get('/calls/:id/greeting.wav', asyncHandler(async (req, res) => sendPrompt(req, res, 'welcome')));

router.get('/calls/:id/prompts/:promptId', asyncHandler(async (req, res) => sendPrompt(req, res, req.params.promptId)));

router.get('/calls/:id', asyncHandler(async (req, res) => {
  const call = await getCall(req.params.id);
  if (!call) return res.status(404).json({ error: { message: 'Call not found' } });
  await getElderlyForUser(req.user, call.elderly_id);
  const [responses, alert] = await Promise.all([
    query('SELECT * FROM call_responses WHERE call_id = $1 ORDER BY recorded_at', [req.params.id]),
    query('SELECT * FROM alerts WHERE call_id = $1 ORDER BY created_at DESC LIMIT 1', [req.params.id])
  ]);
  res.json({
    data: {
      ...present(call),
      responses: presentAll(responses.rows),
      alert: present(alert.rows[0])
    }
  });
}));

router.post('/calls/test', asyncHandler(async (req, res) => {
  if (!req.body?.elderlyId) {
    return res.status(400).json({ error: { message: 'Choose a loved one to call' } });
  }
  const call = await startTestCall({ elderlyId: req.body.elderlyId, user: req.user });
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const openedOnComputer = openCallOnComputer(call.id, token);
  res.status(201).json({ data: { ...present(call), openedOnComputer } });
}));

router.post('/calls/:id/dtmf', validate(dtmfSchema), asyncHandler(async (req, res) => {
  const result = await processDtmf(req.params.id, req.body.digit, {
    user: req.user,
    source: 'app',
    holdMs: req.body.holdMs
  });
  res.json({
    data: {
      call: present(result.call),
      invalid: result.invalid,
      alert: present(result.alert)
    }
  });
}));

router.post('/calls/:id/unanswered-emergency', asyncHandler(async (req, res) => {
  const result = await processUnansweredEmergency(req.params.id, { user: req.user });
  res.json({
    data: {
      call: present(result.call),
      alert: present(result.alert)
    }
  });
}));

router.post('/calls/:id/simulate', validate(simulateSchema), asyncHandler(async (req, res) => {
  const result = await processFailure(req.params.id, req.body.outcome, { user: req.user });
  res.json({
    data: {
      call: present(result.call),
      retry: present(result.retry),
      alert: present(result.alert)
    }
  });
}));

router.get('/call-responses', asyncHandler(async (req, res) => {
  const params = [];
  const where = [accessClause(req.user, params, 'cr.customer_id')];
  if (req.query.callId) {
    params.push(req.query.callId);
    where.push(`r.call_id = $${params.length}`);
  }
  const { rows } = await query(
    `SELECT r.*, cr.callee_name, cr.customer_id
     FROM call_responses r
     JOIN call_records cr ON cr.id = r.call_id
     WHERE ${where.join(' AND ')}
     ORDER BY r.recorded_at DESC
     LIMIT 100`,
    params
  );
  res.json({ data: presentAll(rows) });
}));

export default router;
