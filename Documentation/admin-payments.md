# Admin payment records

The mobile customer app and web admin panel already share the same payment API and database. A mobile order payment (`POST /api/payments`) or subscription purchase (`POST /api/subscriptions`) saves a payment record. The web panel reads those records with `GET /api/payments`; the existing authenticated `suva:update` socket event refreshes its ledger after a payment or subscription change.

## Admin tools

Open **Payments** in the web sidebar.

- Search by customer name, transaction reference or service. Search is case-insensitive; multiple words can match across these fields.
- Combine search with Successful, Pending or Failed status.
- View the record's amount, currency, reference, customer, service, method, timestamps and linked IDs. Open its related customer or care order from the details dialog.
- Download a text receipt for a successful payment. Pending and failed records have details but cannot issue a paid receipt.
- Export the currently matching rows as a UTF-8 CSV file. Names and service descriptions are quoted and spreadsheet formula prefixes are escaped. Exports include ledger fields only, never card details.
- Refresh manually after a connection or loading error. Existing records remain visible with an error notice when a refresh fails; downloads are disabled until the next successful refresh.

Totals are calculated from the loaded records and remain consistent when the list is filtered. Successful totals exclude pending and failed payments; the monthly total uses the paid timestamp where available.

## Scope

The existing API returns the latest 200 payments. The page explicitly states that totals, search and exports cover those recent records. Server-side search and pagination would be needed for a larger historical ledger.

Admins and staff use the existing web access controls and API permissions. Customer API calls remain restricted to that customer's records. This change does not add payment-state changes, refunds or new backend endpoints. The free Essential Check-in plan has a one-time price migration described in `Database/README.md`.

Free-plan activations appear as successful zero-amount records, with the method **No payment required**. They do not add collected revenue. Receipt exports identify them as subscription confirmations. Subscriptions displays the plan price as **Free**.

The payment provider remains simulated. Clean customer-facing wording does not enable bank processing. Card details are not sent by the mobile app and are not present in the admin ledger.

## Run

Start the existing backend and customer app using the repository setup instructions. In `Web`, run `npm ci` and `npm run dev`, then visit `http://127.0.0.1:5173/payments`. The login form has the local seeded administrator account prefilled.

The web app defaults to `http://127.0.0.1:4000` for both HTTP and socket connections. `VITE_API_URL` can override that address. The mobile and admin clients must point to the same backend to share records.

If an older admin tab was left open during a server/code change, refresh the page to load the current version. A rejected or expired login now clears that session and returns to sign-in with an explanation. A late rejected request cannot clear a newer login. Temporary server failures preserve the session and show a retry message.

The **Subscriptions** page loads plans and customers together, shows loading/errors and a Refresh action, and distinguishes an empty subscriber list from a failed request. Existing records remain visible with a notice if a refresh fails. Each subscription includes a link to the customer's detail page.

## Verification — 16 October 2026

- `Web`: `npm test` passes eleven tests covering search/status combinations, totals and paid-date boundaries, export field selection, CSV escaping, paid receipts and free confirmations, refusal to issue receipts for pending/failed payments, and current-versus-stale session invalidation.
- `Web`: `npm run build` passes.
- Eight browser checks pass against the isolated local PGlite preview: an existing mobile payment appears in the admin ledger; new order and subscription payments appear without a manual refresh; active filters are preserved; details and related-order links work; paid receipts and filtered CSV files download; pending/failed records have no paid receipt; loading errors block exports and recover on retry; and details remain usable at 390px.
- Browser screenshots were inspected at desktop and narrow widths. No browser runtime errors were observed. The mobile checks used the browser preview, not an Android device.
- Independent read-only review found no actionable defects in the scoped admin change and reran the seven unit tests successfully.
- Session/subscription recovery: reproduced the blank subscriber table with an expired saved login before fixing it. Seven additional browser checks pass for payment details, subscribed customers and their detail links, expired saved sessions, runtime 401 responses, subscription/plan service failures, refresh recovery and a genuinely empty subscriber list.
- Independent review of the session/subscription recovery found no actionable defects and reran all ten unit tests successfully.

Implementation: `Web/src/pages/Payments.jsx` owns the page and detail dialog; `Web/src/payments.js` owns filtering, totals and export formatting. Other office screens remain in `Web/src/pages/Office.jsx`.
