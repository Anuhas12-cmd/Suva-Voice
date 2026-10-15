# Suva Voice admin website

Desktop site for Suva Voice administrators and staff. React and Vite. The visual language matches the customer app: teal, white cards, and the same status names.

## Run

```powershell
cd D:\CA\Web
npm install
npm run dev
```

Open http://127.0.0.1:5173. `VITE_API_URL` in `.env` points at the API.

Sign in with `admin@suvavoice.lk` / `Admin@12345`. A family account is rejected here.

## What staff can do

The sidebar opens customers, elderly profiles, call history, schedules, reminders, alerts, care orders, deliveries, payments, emergency contacts, providers, subscriptions, notifications, reports, support, and settings.

From Call History, start a demo call and enter the keypad response. The dashboard listens for live updates, so a new emergency changes the unread-alert count without a manual reload.

Doctor appointments and transport requests are managed on the Care Orders page. Reports filter by date and status. Subscription prices shown in the product are illustrative demo prices.
