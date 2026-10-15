import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env') });

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.API_PORT || 4000),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  demoMode: process.env.DEMO_MODE !== 'false',
  appUrl: process.env.APP_URL || 'http://localhost:8081',
  webUrl: process.env.WEB_URL || 'http://localhost:5173',
  localServerUrl: process.env.LOCAL_SERVER_URL || 'http://127.0.0.1:4100',
  voiceWebhookSecret: required('VOICE_WEBHOOK_SECRET'),
  schedulerEnabled: process.env.SCHEDULER_ENABLED !== 'false',
  schedulerTickMs: Number(process.env.SCHEDULER_TICK_MS || 10000),
  smsProvider: process.env.SMS_PROVIDER || 'demo',
  smsApiKey: process.env.SMS_API_KEY || '',
  smsApiUrl: process.env.SMS_API_URL || '',
  emailProvider: process.env.EMAIL_PROVIDER || 'demo',
  emailApiKey: process.env.EMAIL_API_KEY || '',
  emailApiUrl: process.env.EMAIL_API_URL || '',
  paymentProvider: process.env.PAYMENT_PROVIDER || 'demo',
  asteriskEnabled: process.env.ASTERISK_ENABLED === 'true'
};

if (config.jwtSecret.length < 16) {
  throw new Error('JWT_SECRET must be at least 16 characters');
}
