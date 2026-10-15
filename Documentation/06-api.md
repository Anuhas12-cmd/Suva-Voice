# API

Base URL `http://127.0.0.1:4000`. JSON body. Success is `{ "data": ... }`. Errors are `{ "error": { "message", "code", "details" } }`.

Send `Authorization: Bearer <token>` except for health, registration, login, OTP, password reset, and the voice webhook. The webhook sends `x-voice-secret`.

| Area | Methods and paths |
| --- | --- |
| Health | `GET /api/health` |
| Auth | `POST /api/auth/register`, `verify-otp`, `resend-otp`, `login`, `forgot-password`, `reset-password`, `logout`; `GET /api/auth/me`; `PATCH /api/auth/profile`, `/api/auth/password` |
| Users | `GET/POST /api/users` |
| Customers | `GET /api/customers`, `GET /api/customers/me`, `GET /api/customers/:id`, `PATCH /api/customers/:id/status` |
| Elderly | `GET/POST /api/elderly`, `GET/PATCH /api/elderly/:id` |
| Contacts | `GET /api/emergency-contacts`, `POST /api/elderly/:id/emergency-contacts`, `PATCH/DELETE /api/emergency-contacts/:id` |
| Schedules | `GET/POST /api/call-schedules`, `PATCH /api/call-schedules/:id`, `POST /api/call-schedules/:id/run-now` |
| Calls | `GET /api/calls`, `GET /api/calls/:id`, `POST /api/calls/test`, `POST /api/calls/:id/dtmf`, `POST /api/calls/:id/simulate`, `GET /api/call-responses` |
| Voice | `POST /api/voice/events` |
| Reminders | `GET/POST /api/reminders`, `PATCH/DELETE /api/reminders/:id` |
| Orders | `GET/POST /api/care-orders`, `GET/PATCH /api/care-orders/:id`, `GET /api/deliveries` |
| Appointments | `GET /api/doctor-appointments`, `PATCH /api/doctor-appointments/:id` |
| Transport | `GET /api/transport`, `PATCH /api/transport/:id` |
| Providers | `GET/POST /api/service-providers`, `PATCH /api/service-providers/:id` |
| Payments | `GET/POST /api/payments` |
| Plans | `GET/POST /api/subscriptions/plans`, `PATCH /api/subscriptions/plans/:id`, `GET /api/subscriptions/plans/:id/subscribers` |
| Subscriptions | `GET /api/subscriptions`, `GET /api/subscriptions/current`, `POST /api/subscriptions` |
| Alerts | `GET /api/alerts`, `GET /api/alerts/:id`, `PATCH /api/alerts/:id` |
| Notifications | `GET /api/notifications`, `POST /api/notifications/read-all`, `POST /api/notifications/:id/read` |
| Support | `GET /api/support/faq`, `GET/POST /api/support`, `PATCH /api/support/:id` |
| Settings | `GET/PATCH /api/settings/me`, `GET/PATCH /api/settings/system` |
| System | `POST /api/system/scheduler/tick`, `GET /api/system/voice-status` |
| Reports | `GET /api/dashboard`, `GET /api/search`, `GET /api/reports/:type` |

Report types: `calls`, `missed-calls`, `alerts`, `emergencies`, `orders`, `service-requests`, `payments`, `subscriptions`. Filters include `from`, `to`, `status`, and `elderlyId`.

Passwords are never returned. Phone numbers in responses include a display form such as `077 123 4567` in `phoneDisplay`.
