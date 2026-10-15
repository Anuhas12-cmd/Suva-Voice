export function money(value) {
  return `Rs. ${Number(value || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function when(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  return date.toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' });
}

export function label(value) {
  if (!value) return '—';
  const known = {
    all_good: 'All Good',
    assistance_required: 'Assistance Required',
    missed_checkin: 'Missed Check-in',
    out_for_delivery: 'Out for Delivery',
    no_answer: 'No Answer',
    waiting_dtmf: 'Waiting for response',
    no_response: 'No Response',
    in_app: 'In app',
    en: 'English',
    si: 'Sinhala',
    ta: 'Tamil'
  };
  return known[value] || String(value).replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function errorsFrom(error) {
  const fields = {};
  for (const item of error?.details || []) {
    if (item.path && !fields[item.path]) fields[item.path] = item.message;
  }
  return fields;
}

export function tone(value) {
  if (['all_good', 'okay', 'successful', 'completed', 'active', 'delivered', 'read', 'resolved'].includes(value)) return 'good';
  if (['emergency', 'failed', 'cancelled', 'missed', 'no_answer'].includes(value)) return 'bad';
  if (['assistance', 'assistance_required', 'pending', 'requested', 'missed_checkin', 'new', 'reviewing'].includes(value)) return 'warn';
  return 'info';
}
