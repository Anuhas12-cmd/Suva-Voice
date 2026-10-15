import dotenv from 'dotenv';
import express from 'express';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { originateAsterisk } from './ami.js';
import { speakCall, stopSpeaking } from './tts.js';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env') });

const port = Number(process.env.PORT || 4100);
const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:4000';
const secret = process.env.VOICE_WEBHOOK_SECRET || '';
const asteriskEnabled = process.env.ASTERISK_ENABLED === 'true';
const demoFallback = process.env.DEMO_FALLBACK !== 'false';
const ttsEnabled = process.env.TTS_ENABLED !== 'false';
const sessions = new Map();

if (!secret) {
  console.error('VOICE_WEBHOOK_SECRET is required');
  process.exit(1);
}

function requireSecret(req, res, next) {
  if (req.headers['x-voice-secret'] !== secret) {
    return res.status(401).json({ error: { message: 'Voice secret is not valid' } });
  }
  return next();
}

async function postEvent(session, event, extra = {}) {
  if (!session || session.done) return;
  session.state = event;
  session.log.push({ at: new Date().toISOString(), event });
  try {
    await fetch(`${backendUrl}/api/voice/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-voice-secret': secret
      },
      body: JSON.stringify({ callId: session.callId, event, ...extra }),
      signal: AbortSignal.timeout(5000)
    });
  } catch (error) {
    console.warn(`Voice event ${event} was not delivered: ${error.message}`);
  }
}

function clearTimers(session) {
  for (const timer of session.timers) clearTimeout(timer);
  session.timers = [];
}

const DTMF_WAIT_MS = 6 * 60 * 1000;

function beginDemo(session) {
  const steps = [
    [400, 'ringing'],
    [900, 'connected'],
    [1400, 'playing'],
    [1900, 'waiting_dtmf']
  ];
  for (const [delay, event] of steps) {
    session.timers.push(setTimeout(() => postEvent(session, event), delay));
  }
  session.timers.push(setTimeout(() => {
    if (session.done) return;
    stopSpeaking();
    postEvent(session, 'no_response');
    session.done = true;
  }, DTMF_WAIT_MS));
  if (ttsEnabled && session.speak !== false) {
    session.timers.push(setTimeout(() => {
      session.log.push({ at: new Date().toISOString(), event: 'tts', text: session.prompt });
      speakCall(session.prompt, session.attempt);
    }, 1400));
  }
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.json({
    data: {
      service: 'suva-voice-local',
      ok: true,
      mode: asteriskEnabled ? 'asterisk' : 'demo',
      sessions: sessions.size
    }
  });
});

app.post('/api/voice/originate', requireSecret, async (req, res) => {
  const { callId, phone, elderlyName, prompt } = req.body || {};
  if (!callId || !phone) {
    return res.status(400).json({ error: { message: 'callId and phone are required' } });
  }
  const session = {
    callId,
    phone,
    elderlyName: elderlyName || 'Loved one',
    prompt: prompt || '',
    attempt: Number(req.body?.attempt) || 1,
    state: 'dialing',
    mode: 'demo',
    done: false,
    speak: req.body.speak !== false,
    timers: [],
    log: [{ at: new Date().toISOString(), event: 'dialing' }]
  };
  sessions.set(callId, session);

  if (asteriskEnabled) {
    try {
      await originateAsterisk({
        host: process.env.ASTERISK_HOST || '127.0.0.1',
        port: process.env.ASTERISK_PORT || 5038,
        username: process.env.ASTERISK_USERNAME,
        password: process.env.ASTERISK_PASSWORD,
        phone,
        callId,
        secret
      });
      session.mode = 'asterisk';
      return res.status(202).json({ data: { accepted: true, mode: 'asterisk' } });
    } catch (error) {
      console.warn(`Asterisk originate failed: ${error.message}`);
      if (!demoFallback) {
        sessions.delete(callId);
        return res.status(502).json({ error: { message: 'Asterisk could not place the call' } });
      }
    }
  }

  beginDemo(session);
  return res.status(202).json({ data: { accepted: true, mode: 'demo' } });
});

app.post('/api/voice/calls/:id/hangup', requireSecret, (req, res) => {
  const session = sessions.get(req.params.id);
  if (session) {
    session.done = true;
    clearTimers(session);
    stopSpeaking();
    session.state = 'finished';
  }
  res.json({ data: { hungUp: true } });
});

app.get('/api/voice/calls/:id', requireSecret, (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: { message: 'Call session not found' } });
  res.json({ data: session });
});

app.listen(port, '127.0.0.1', () => {
  console.log(`Suva Voice local server listening on 127.0.0.1:${port}`);
});
