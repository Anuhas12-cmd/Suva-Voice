# Database design

The table script is `Database\schema.sql`. The saved rows are `Database\suva_voice.sql`. The API creates the database from those files on launch. `Backend\scripts\seed.js` loads the original fictional people only when setup is run or when the SQL data file is missing.

Important constraints:

- Users are `customer`, `admin`, or `staff`, and `pending`, `active`, or `disabled`.
- Elderly status is `all_good`, `assistance_required`, `missed_checkin`, `emergency`, or `unknown`.
- Call status moves from `dialing` through `waiting_dtmf` to `completed`, `no_answer`, `failed`, `missed`, or `retry_pending`.
- Result codes are `okay`, `assistance`, `emergency`, `no_response`, and `invalid`.
- Alerts are `missed_checkin`, `assistance`, or `emergency`, and move `new` → `reviewing` → `contacted` → `resolved`.
- Orders are `requested`, `accepted`, `processing`, `out_for_delivery`, `completed`, or `cancelled`.
- Payments are `successful`, `pending`, or `failed`.

`alert_escalations.notification_id` references `notifications` and is added after that table exists. `system_settings` is a single row. `care_order_seq` starts at 1400 so new orders continue after the seed numbers CO1234–CO1242.

See `Database\README.md` for the relationship summary.
