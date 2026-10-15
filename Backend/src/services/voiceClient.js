import { config } from '../config.js';
import { logger } from '../logger.js';

function headers() {
  return {
    'Content-Type': 'application/json',
    'x-voice-secret': config.voiceWebhookSecret
  };
}

export async function originate(call) {
  const response = await fetch(`${config.localServerUrl}/api/voice/originate`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      callId: call.id,
      phone: call.phone,
      elderlyName: call.callee_name,
      prompt: call.prompt_text,
      attempt: call.attempt_number || 1,
      speak: call.speak !== false
    }),
    signal: AbortSignal.timeout(8000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error?.message || 'Voice server rejected the call');
  }
  return body.data;
}

export async function hangup(callId) {
  try {
    await fetch(`${config.localServerUrl}/api/voice/calls/${callId}/hangup`, {
      method: 'POST',
      headers: headers(),
      signal: AbortSignal.timeout(4000)
    });
  } catch (error) {
    logger.warn(`Voice hangup skipped: ${error.message}`);
  }
}
