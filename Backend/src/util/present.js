import { displayPhone } from './phone.js';

function camelKey(key) {
  return key.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
}

export function camelize(value) {
  if (Array.isArray(value)) return value.map(camelize);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[camelKey(key)] = camelize(item);
    }
    return out;
  }
  return value;
}

export function present(row) {
  if (!row) return null;
  const data = camelize(row);
  if (data.phone) data.phoneDisplay = displayPhone(data.phone);
  for (const key of ['preferredCheckinTime', 'timeOfDay', 'preferredTime', 'travelTime']) {
    if (typeof data[key] === 'string') data[key] = data[key].slice(0, 5);
  }
  return data;
}

export function presentAll(rows) {
  return rows.map(present);
}

export function pageParams(req) {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  return { limit, offset };
}

export function accessClause(user, params, column) {
  if (user.role === 'admin' || user.role === 'staff') return 'TRUE';
  if (!user.customerId) return 'FALSE';
  params.push(user.customerId);
  return `${column} = $${params.length}`;
}

export function addDateRange(where, params, column, from, to) {
  if (from) {
    params.push(from);
    where.push(`${column}::date >= $${params.length}::date`);
  }
  if (to) {
    params.push(to);
    where.push(`${column}::date <= $${params.length}::date`);
  }
}

export function searchTerm(value) {
  return String(value || '').trim().replace(/[%_]/g, '').slice(0, 80);
}
