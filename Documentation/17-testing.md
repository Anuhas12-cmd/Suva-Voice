# Testing

Automated, from `D:\CA\Backend` while the API and local voice server are running:

```powershell
node scripts/unit.js
node scripts/acceptance.js
```

Unit checks phone normalisation and the IVR sentence. Acceptance checks:

- rejected login
- admin, staff, and family login
- customer blocked from the customer list and from another family's profile
- staff blocked from creating an administrator
- registration, OTP, logout, forgot password, and reset
- dashboard counts
- create and edit a loved one, two emergency contacts, and the schedule
- DTMF 1, an invalid digit followed by 1, DTMF 2 with a demo SMS, and DTMF 3 with a live socket update
- no answer, retry, missed check-in that is not an emergency, and a failed call
- reminder create, edit, and delete
- grocery order, staff status change, demo payment, plan upgrade, plan deactivation
- reports, support, and the admin dashboard

Browser checks completed against the running system:

- Admin sign-in, dashboard cards, chart, and sidebar pages for customers, profiles, orders, payments, subscriptions, reports, alerts, notifications, support, and settings
- Demo call from Call History through to Result: Emergency
- A second call from the open dashboard: unread alerts moved from 5 to 6 when Press 2 was recorded, without reloading
- Customer splash and onboarding, family login, home statuses, order list, delivery stages, payment response, and Press 1 resulting in Okay

Acceptance reseeds at the start and leaves an extra loved one named Acceptance Test Elder. `node scripts/seed.js` restores Sunil Jayasekara, Kamala Silva, and Robert Perera.
