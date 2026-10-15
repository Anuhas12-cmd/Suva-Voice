import { config } from './config.js';

export function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (origin === config.appUrl || origin === config.webUrl) return true;
  if (config.demoMode && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return true;
  return false;
}
