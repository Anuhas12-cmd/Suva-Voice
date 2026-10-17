-- Suva Voice relational schema
-- Relationships (owned data cascades; financial history is preserved when a provider is removed):
--   users 1-1 customers
--   customers 1-n elderly_profiles
--   elderly_profiles 1-n emergency_contacts, call_schedules, call_records, reminders, alerts
--   call_records 1-n call_responses
--   call_records 1-n alerts (optional)
--   alerts 1-n alert_escalations
--   customers 1-n care_orders, payments, subscriptions, support_requests
--   care_orders 1-n care_order_items, delivery_events
--   care_orders 1-1 doctor_appointments / transport_requests when that service is requested
--   service_providers 1-n orders, appointments, transport (SET NULL if the provider is removed)
--   subscription_plans 1-n subscriptions
-- Phone numbers stored on a call are a snapshot of the number dialed.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE SEQUENCE IF NOT EXISTS care_order_seq START 1400;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('customer', 'admin', 'staff')),
  status text NOT NULL CHECK (status IN ('pending', 'active', 'disabled')),
  email_verified boolean NOT NULL DEFAULT false,
  token_version integer NOT NULL DEFAULT 1,
  otp_hash text,
  otp_expires_at timestamptz,
  otp_attempts integer NOT NULL DEFAULT 0,
  reset_token_hash text,
  reset_expires_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_key UNIQUE (email),
  CONSTRAINT users_phone_key UNIQUE (phone)
);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  address text,
  city text,
  preferred_language text NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en', 'si', 'ta')),
  notify_emergency boolean NOT NULL DEFAULT true,
  notify_missed boolean NOT NULL DEFAULT true,
  notify_checkins boolean NOT NULL DEFAULT true,
  notify_orders boolean NOT NULL DEFAULT true,
  notify_payments boolean NOT NULL DEFAULT true,
  notify_reminders boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS elderly_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  age integer NOT NULL CHECK (age BETWEEN 40 AND 120),
  phone text NOT NULL,
  address text,
  preferred_language text NOT NULL DEFAULT 'si' CHECK (preferred_language IN ('en', 'si', 'ta')),
  preferred_checkin_time time NOT NULL DEFAULT '08:30',
  health_notes text,
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('all_good', 'assistance_required', 'missed_checkin', 'emergency', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  elderly_id uuid NOT NULL REFERENCES elderly_profiles(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text NOT NULL,
  relationship text,
  priority integer NOT NULL DEFAULT 1 CHECK (priority BETWEEN 1 AND 9),
  notify_on_assistance boolean NOT NULL DEFAULT true,
  notify_on_emergency boolean NOT NULL DEFAULT true,
  notify_on_missed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS call_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  elderly_id uuid NOT NULL REFERENCES elderly_profiles(id) ON DELETE CASCADE,
  time_of_day time NOT NULL,
  days_of_week smallint[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6,7]::smallint[],
  enabled boolean NOT NULL DEFAULT true,
  retry_attempts integer NOT NULL DEFAULT 2 CHECK (retry_attempts BETWEEN 1 AND 5),
  retry_delay_seconds integer NOT NULL DEFAULT 30 CHECK (retry_delay_seconds BETWEEN 0 AND 3600),
  last_run_at timestamptz,
  next_run_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT call_schedules_days_chk CHECK (
    cardinality(days_of_week) > 0
    AND days_of_week <@ ARRAY[1,2,3,4,5,6,7]::smallint[]
  )
);

CREATE TABLE IF NOT EXISTS call_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  elderly_id uuid NOT NULL REFERENCES elderly_profiles(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  schedule_id uuid REFERENCES call_schedules(id) ON DELETE SET NULL,
  initiated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  callee_name text NOT NULL,
  phone text NOT NULL,
  mode text NOT NULL DEFAULT 'demo' CHECK (mode IN ('demo', 'asterisk')),
  origin text NOT NULL CHECK (origin IN ('schedule', 'manual')),
  status text NOT NULL CHECK (status IN (
    'dialing', 'ringing', 'connected', 'playing', 'waiting_dtmf', 'retry_pending',
    'completed', 'no_answer', 'failed', 'missed'
  )),
  result_code text CHECK (result_code IN ('okay', 'assistance', 'emergency', 'no_response', 'invalid')),
  attempt_number integer NOT NULL DEFAULT 1 CHECK (attempt_number >= 1),
  max_attempts integer NOT NULL DEFAULT 2 CHECK (max_attempts BETWEEN 1 AND 5),
  next_attempt_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  prompt_text text,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS call_records_one_live_per_elderly
  ON call_records (elderly_id)
  WHERE status IN ('dialing', 'ringing', 'connected', 'playing', 'waiting_dtmf');

CREATE UNIQUE INDEX IF NOT EXISTS call_records_one_retry_per_group
  ON call_records (group_id)
  WHERE status = 'retry_pending';

CREATE TABLE IF NOT EXISTS call_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES call_records(id) ON DELETE CASCADE,
  dtmf_digit text,
  response_code text NOT NULL CHECK (response_code IN ('okay', 'assistance', 'emergency', 'no_response', 'invalid')),
  raw_input text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  elderly_id uuid NOT NULL REFERENCES elderly_profiles(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  call_id uuid REFERENCES call_records(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('missed_checkin', 'assistance', 'emergency')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'contacted', 'resolved')),
  title text NOT NULL,
  message text NOT NULL,
  escalation_step integer NOT NULL DEFAULT 0,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS alerts_one_per_call_type
  ON alerts (call_id, type)
  WHERE call_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS alert_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES emergency_contacts(id) ON DELETE SET NULL,
  step integer NOT NULL,
  channel text NOT NULL,
  recipient_name text,
  recipient_address text,
  notification_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  elderly_id uuid NOT NULL REFERENCES elderly_profiles(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('medication', 'meal', 'rest', 'other')),
  title text NOT NULL,
  notes text,
  time_of_day time NOT NULL,
  days_of_week smallint[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6,7]::smallint[],
  enabled boolean NOT NULL DEFAULT true,
  last_notified_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reminders_days_chk CHECK (
    cardinality(days_of_week) > 0
    AND days_of_week <@ ARRAY[1,2,3,4,5,6,7]::smallint[]
  )
);

CREATE TABLE IF NOT EXISTS service_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  service_type text NOT NULL CHECK (service_type IN ('grocery', 'essential', 'doctor', 'transport', 'general')),
  availability text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS care_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  elderly_id uuid NOT NULL REFERENCES elderly_profiles(id) ON DELETE RESTRICT,
  provider_id uuid REFERENCES service_providers(id) ON DELETE SET NULL,
  order_number text NOT NULL,
  type text NOT NULL CHECK (type IN ('grocery', 'essential', 'doctor', 'transport')),
  status text NOT NULL CHECK (status IN (
    'requested', 'accepted', 'processing', 'out_for_delivery', 'completed', 'cancelled'
  )),
  notes text,
  total_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  currency text NOT NULL DEFAULT 'LKR',
  estimated_arrival timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT care_orders_number_key UNIQUE (order_number)
);

CREATE TABLE IF NOT EXISTS care_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES care_orders(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity numeric(10,2) NOT NULL CHECK (quantity > 0),
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(12,2) NOT NULL CHECK (line_total >= 0)
);

CREATE TABLE IF NOT EXISTS delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES care_orders(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('order_confirmed', 'preparing', 'in_transit', 'delivered', 'cancelled')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS doctor_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  elderly_id uuid NOT NULL REFERENCES elderly_profiles(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  care_order_id uuid UNIQUE REFERENCES care_orders(id) ON DELETE CASCADE,
  preferred_date date,
  preferred_time time,
  doctor_or_hospital text,
  notes text,
  status text NOT NULL CHECK (status IN ('requested', 'scheduled', 'completed', 'cancelled')),
  provider_id uuid REFERENCES service_providers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transport_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  elderly_id uuid NOT NULL REFERENCES elderly_profiles(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  care_order_id uuid UNIQUE REFERENCES care_orders(id) ON DELETE CASCADE,
  pickup_location text NOT NULL,
  destination text NOT NULL,
  travel_date date,
  travel_time time,
  notes text,
  status text NOT NULL CHECK (status IN ('requested', 'assigned', 'in_progress', 'completed', 'cancelled')),
  provider_id uuid REFERENCES service_providers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL,
  description text,
  price_lkr numeric(12,2) NOT NULL CHECK (price_lkr >= 0),
  billing_period text NOT NULL DEFAULT 'monthly' CHECK (billing_period IN ('monthly', 'yearly')),
  services jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  demo_pricing boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscription_plans_code_key UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('active', 'cancelled', 'expired')),
  started_at timestamptz NOT NULL DEFAULT now(),
  renews_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_active
  ON subscriptions (customer_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_id uuid REFERENCES care_orders(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  service_label text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'LKR',
  status text NOT NULL CHECK (status IN ('successful', 'pending', 'failed')),
  transaction_ref text NOT NULL,
  provider text NOT NULL DEFAULT 'demo',
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_ref_key UNIQUE (transaction_ref)
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  audience text NOT NULL CHECK (audience IN ('customer', 'admin', 'contact')),
  channel text NOT NULL CHECK (channel IN ('in_app', 'sms', 'email')),
  recipient_address text,
  title text NOT NULL,
  body text NOT NULL,
  type text NOT NULL,
  related_type text,
  related_id uuid,
  status text NOT NULL CHECK (status IN ('queued', 'sent', 'failed', 'read')),
  provider text,
  error text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE alert_escalations
  DROP CONSTRAINT IF EXISTS alert_escalations_notification_id_fkey;

ALTER TABLE alert_escalations
  ADD CONSTRAINT alert_escalations_notification_id_fkey
  FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  message text NOT NULL,
  staff_response text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS system_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  retry_attempts integer NOT NULL DEFAULT 2 CHECK (retry_attempts BETWEEN 1 AND 5),
  retry_delay_seconds integer NOT NULL DEFAULT 30 CHECK (retry_delay_seconds BETWEEN 0 AND 3600),
  escalation_delay_seconds integer NOT NULL DEFAULT 45 CHECK (escalation_delay_seconds BETWEEN 0 AND 86400),
  scheduler_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO system_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS elderly_customer_idx ON elderly_profiles (customer_id);
CREATE INDEX IF NOT EXISTS contacts_elderly_idx ON emergency_contacts (elderly_id, priority);
CREATE INDEX IF NOT EXISTS schedules_due_idx ON call_schedules (next_run_at) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS calls_elderly_idx ON call_records (elderly_id, started_at DESC);
CREATE INDEX IF NOT EXISTS calls_customer_idx ON call_records (customer_id, started_at DESC);
CREATE INDEX IF NOT EXISTS calls_group_idx ON call_records (group_id);
CREATE INDEX IF NOT EXISTS responses_call_idx ON call_responses (call_id);
CREATE INDEX IF NOT EXISTS alerts_status_idx ON alerts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS alerts_elderly_idx ON alerts (elderly_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reminders_elderly_idx ON reminders (elderly_id);
CREATE INDEX IF NOT EXISTS orders_customer_idx ON care_orders (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx ON care_orders (status);
CREATE INDEX IF NOT EXISTS payments_customer_idx ON payments (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_channel_idx ON notifications (channel, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_logs (created_at DESC);

DO $$
DECLARE
  target text;
BEGIN
  FOR target IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.column_name = 'updated_at'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON %I', target);
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      target
    );
  END LOOP;
END $$;
