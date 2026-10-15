export function money(value) {
  return `Rs. ${Number(value || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function when(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' });
}

export function dayLabel(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-LK', { month: 'short', day: 'numeric' });
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
    in_progress: 'In Progress',
    in_app: 'In app'
  };
  return known[value] || String(value).replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function tone(value) {
  const good = ['all_good', 'okay', 'successful', 'completed', 'active', 'delivered', 'read', 'resolved', 'connected'];
  const bad = ['emergency', 'failed', 'cancelled', 'missed', 'no_answer', 'disabled'];
  const warn = ['assistance', 'assistance_required', 'pending', 'requested', 'missed_checkin', 'new', 'reviewing'];
  if (good.includes(value)) return 'good';
  if (bad.includes(value)) return 'bad';
  if (warn.includes(value)) return 'warn';
  return 'info';
}
