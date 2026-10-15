import fs from 'fs';

const INSERT_ORDER = [
  'users',
  'customers',
  'elderly_profiles',
  'emergency_contacts',
  'call_schedules',
  'call_records',
  'call_responses',
  'alerts',
  'reminders',
  'service_providers',
  'subscription_plans',
  'care_orders',
  'care_order_items',
  'delivery_events',
  'doctor_appointments',
  'transport_requests',
  'subscriptions',
  'payments',
  'notifications',
  'alert_escalations',
  'support_requests',
  'audit_logs',
  'system_settings'
];

const CAST = {
  bool: 'boolean',
  int2: 'smallint',
  int4: 'integer',
  int8: 'bigint',
  float4: 'real',
  float8: 'double precision',
  numeric: 'numeric',
  text: 'text',
  varchar: 'character varying',
  bpchar: 'character',
  uuid: 'uuid',
  jsonb: 'jsonb',
  json: 'json',
  timestamptz: 'timestamp with time zone',
  timestamp: 'timestamp without time zone',
  date: 'date',
  time: 'time without time zone',
  timetz: 'time with time zone',
  _int2: 'smallint[]',
  _int4: 'integer[]',
  _text: 'text[]',
  _varchar: 'character varying[]'
};

function ident(name) {
  return `"${String(name).replaceAll('"', '""')}"`;
}

function literal(value, udt) {
  if (value === null || value === undefined) return 'NULL';
  const cast = CAST[udt];
  if (!cast) throw new Error(`Cannot store SQL type ${udt}`);
  return `'${String(value).replaceAll("'", "''")}'::${cast}`;
}

export async function writeDataSql(query, filePath) {
  const lines = [
    '-- Suva Voice data.',
    '-- The API applies this file when Database/data does not exist yet.',
    'BEGIN;',
    `TRUNCATE TABLE
      alert_escalations, notifications, audit_logs, support_requests, payments,
      delivery_events, care_order_items, doctor_appointments, transport_requests, care_orders,
      subscriptions, subscription_plans, service_providers, reminders, call_responses, alerts,
      call_records, call_schedules, emergency_contacts, elderly_profiles, customers, users, system_settings
      RESTART IDENTITY CASCADE;`
  ];
  const counts = {};

  for (const table of INSERT_ORDER) {
    const columns = await query(
      `SELECT column_name, udt_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [table]
    );
    if (!columns.rows.length) throw new Error(`Missing table ${table}`);
    const names = columns.rows.map((column) => column.column_name);
    const types = Object.fromEntries(columns.rows.map((column) => [column.column_name, column.udt_name]));
    const selected = names.map((name) => `${ident(name)}::text AS ${ident(name)}`).join(', ');
    const data = await query(`SELECT ${selected} FROM ${ident(table)}`, []);
    counts[table] = data.rows.length;
    for (const row of data.rows) {
      const values = names.map((name) => literal(row[name], types[name])).join(', ');
      lines.push(
        `INSERT INTO ${ident(table)} (${names.map(ident).join(', ')}) VALUES (${values});`
      );
    }
  }

  const sequence = await query(`SELECT last_value::text AS last_value, is_called::text AS is_called FROM care_order_seq`);
  const last = sequence.rows[0];
  lines.push(`SELECT setval('care_order_seq', ${Number(last.last_value)}, ${last.is_called === 'true' || last.is_called === 't'});`);
  lines.push('COMMIT;');
  lines.push('');
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  return counts;
}
