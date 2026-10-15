import crypto from 'crypto';

export function hashToken(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function randomOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

export function randomToken() {
  return crypto.randomBytes(24).toString('hex');
}

export function safeEqualHash(storedHash, plain) {
  if (!storedHash || plain === undefined || plain === null) return false;
  const next = Buffer.from(hashToken(plain));
  const prev = Buffer.from(String(storedHash));
  if (next.length !== prev.length) return false;
  return crypto.timingSafeEqual(prev, next);
}

export function timingSafeString(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
