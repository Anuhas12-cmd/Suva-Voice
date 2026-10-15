# Suva Voice database

The table definitions are `schema.sql`. The saved rows are `suva_voice.sql`. Both are ordinary SQL.

Starting the API creates `Database\data` from those files when that folder is missing. Copy `suva_voice.sql` with the project and the other computer rebuilds the same accounts, loved ones, calls, alerts, and orders. The API rewrites `suva_voice.sql` when it shuts down, so close the API before copying the folder if you want the newest rows.

`npm run setup` from `Backend` replaces those saved rows with the original demo accounts.

## Tables

Users, customers, elderly profiles, emergency contacts, call schedules, call records, call responses, alerts, alert escalations, reminders, service providers, care orders, care order items, delivery events, doctor appointments, transport requests, subscription plans, subscriptions, payments, notifications, support requests, audit logs, and one system settings row.

Every main table has a primary key, `created_at`, and `updated_at`. Status values are constrained. Foreign keys point at the owning customer, elderly profile, call, or order. Phone numbers on a call record are a snapshot of the number dialled.

Partial unique indexes keep one live call per person, one pending retry per call group, one alert of each type per call, and one active subscription per customer.

## Relationships

A user with role `customer` has one customer row. A customer has many elderly profiles, orders, payments, and one active subscription. An elderly profile has contacts, schedules, reminders, calls, and alerts. A call has responses and may raise one alert. An alert has escalation steps that point at notifications. A care order has items, delivery events, and optionally one doctor appointment or one transport request.

Times are stored in UTC and the database timezone is `Asia/Colombo`.
