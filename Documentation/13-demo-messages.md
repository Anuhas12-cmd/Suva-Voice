# Demo messages

Business code calls `NotificationService`. It does not embed a vendor SDK.

Channels:

- `in_app` is stored and shown in both apps.
- `sms` uses `DemoNotificationProvider` unless `SMS_PROVIDER` is not `demo` and `SMS_API_URL` is set. Then the HTTP adapter POSTs to that URL.
- `email` works the same way with `EMAIL_PROVIDER` and `EMAIL_API_URL`.

In demo mode every SMS and email is a row in `notifications` with channel `sms` or `email` and status `sent`. Open Admin → Notifications and filter to SMS log. A typical body is:

Suva Voice Alert: Your registered elderly contact has requested assistance.

Emergency fan-out:

1. Save the emergency response and alert.
2. In-app and email the family. This cannot be disabled.
3. SMS the priority-1 contact and record the escalation step.
4. In-app every administrator.
5. After the escalation delay, SMS the next contacts if the alert is still new or reviewing.

Assistance notifies contacts who have assistance notification enabled. A missed check-in notifies the family when their missed-check-in setting is on, contacts who opted in, and staff. It does not use the emergency wording.

OTP and password-reset emails are also logged. The demo code is returned only in the API response while `DEMO_MODE=true`.
