BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

UPDATE subscription_plans
SET price_lkr = 0,
    description = 'Daily wellness call and missed-call alerts.',
    demo_pricing = false,
    updated_at = now()
WHERE code = 'essential'
  AND NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name = '001-free-essential-plan');

INSERT INTO schema_migrations (name) VALUES ('001-free-essential-plan')
ON CONFLICT (name) DO NOTHING;

COMMIT;
