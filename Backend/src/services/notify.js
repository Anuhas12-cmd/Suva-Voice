import { config } from '../config.js';
import { logger } from '../logger.js';

const inAppProvider = {
  name: 'in_app',
  async send() {
    return { status: 'sent', provider: 'in_app' };
  }
};

const demoProvider = {
  name: 'demo',
  async send({ channel, title }) {
    logger.info(`Demo ${channel} stored: ${title}`);
    return { status: 'sent', provider: 'demo' };
  }
};

function httpProvider(name, url, apiKey) {
  return {
    name,
    async send({ recipientAddress, title, body }) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify({ to: recipientAddress, title, body }),
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) throw new Error(`${name} provider returned ${response.status}`);
      return { status: 'sent', provider: name };
    }
  };
}

export function providerFor(channel) {
  if (channel === 'in_app') return inAppProvider;
  if (channel === 'sms' && config.smsProvider !== 'demo' && config.smsApiUrl) {
    return httpProvider(config.smsProvider, config.smsApiUrl, config.smsApiKey);
  }
  if (channel === 'email' && config.emailProvider !== 'demo' && config.emailApiUrl) {
    return httpProvider(config.emailProvider, config.emailApiUrl, config.emailApiKey);
  }
  return demoProvider;
}

export async function send(client, message) {
  const provider = providerFor(message.channel);
  let result;
  try {
    result = await provider.send(message);
  } catch (error) {
    logger.warn(`Notification failed (${message.channel}): ${error.message}`);
    result = { status: 'failed', provider: provider.name, error: error.message };
  }
  const { rows } = await client.query(
    `INSERT INTO notifications (
       user_id, audience, channel, recipient_address, title, body, type,
       related_type, related_id, status, provider, error
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      message.userId || null,
      message.audience,
      message.channel,
      message.recipientAddress || null,
      message.title,
      message.body,
      message.type,
      message.relatedType || null,
      message.relatedId || null,
      result.status,
      result.provider,
      result.error || null
    ]
  );
  return rows[0];
}

export async function notifyAdmins(client, message) {
  const { rows } = await client.query(
    `SELECT id FROM users WHERE role IN ('admin', 'staff') AND status = 'active'`
  );
  const saved = [];
  for (const row of rows) {
    saved.push(await send(client, {
      ...message,
      userId: row.id,
      audience: 'admin',
      channel: 'in_app'
    }));
  }
  return saved;
}
