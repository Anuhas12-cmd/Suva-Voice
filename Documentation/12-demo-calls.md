# Demo telephony

No carrier, SIP trunk, or handset is required.

1. Sign in as Nimal on http://127.0.0.1:8081 or as the administrator on http://127.0.0.1:5173.
2. Open Live check-in or Call History.
3. Choose Sunil Jayasekara, Kamala Silva, or Robert Perera.
4. Press **Start test call**.
5. The card moves through Calling, Connected, and Playing. The prompt is:

   Good morning, afternoon, or evening. This is Suva Voice. Please press 1 if you are okay. Press 2 if you need assistance. Press 3 for emergency.

6. When the status is waiting for a response:

   - Press 1 saves Okay, completes the check-in, and can clear an open missed-check-in alert.
   - Press 2 saves Assistance Required, creates an assistance alert, and notifies flagged contacts.
   - Press 3 saves Emergency, creates an emergency alert, notifies priority 1, notifies staff, and continues escalation if the alert stays open.
   - Simulate no answer schedules a retry, then a missed check-in after the last attempt.
   - Simulate failed call records a failed call and does not open an emergency.
   - Simulate no response completes the call as no response and opens a missed check-in.

The admin dashboard unread count changes when the alert is created, without reloading the page.

`POST /api/call-schedules/:id/run-now` places the scheduled call immediately and still uses this path.
