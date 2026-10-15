# Scheduler

The scheduler lives in `Backend/src/services/scheduler.js` and ticks every `SCHEDULER_TICK_MS` (default 10 seconds) when `SCHEDULER_ENABLED=true`.

Each tick:

1. Claims due, enabled schedules and moves `next_run_at` forward so the same schedule is not dialled twice.
2. Starts `retry_pending` rows whose `next_attempt_at` has passed. One pending retry is allowed per call group.
3. Escalates emergencies that are still `new` or `reviewing` after `escalation_delay_seconds`, notifying the next contact.
4. Sends in-app reminders whose time has passed today and that have not already been sent today.

A no-answer waits `retry_delay_seconds` and tries again until `retry_attempts`. The last unanswered attempt becomes `missed` and raises `missed_checkin`. A failed connection is terminal and is not classified as an emergency.

Change the numbers in Admin → Settings, or `PATCH /api/settings/system`. `POST /api/system/scheduler/tick` runs one pass immediately and only while demo mode is on.
