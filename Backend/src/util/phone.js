export function normalizePhone(input) {
  const raw = String(input || '').replace(/[^\d+]/g, '');
  if (raw.startsWith('+94')) return `0${raw.slice(3)}`;
  if (raw.startsWith('94') && raw.length === 11) return `0${raw.slice(2)}`;
  return raw;
}

export function displayPhone(phone) {
  const digits = normalizePhone(phone);
  if (/^0\d{9}$/.test(digits)) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  return phone || '';
}
