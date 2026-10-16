# Mobile payment UI implementation

Reference: approved Suva Voice Figma frames 25:280 through 25:1120 in file tOEHc5DDr2e3o6jYf7CU7t.

## Scope

Implement the sage/cream Inter mobile checkout, plan review/payment, payment outcomes, filtered history and receipts in the existing Expo customer app. Preserve existing care, authentication and account screens. Use Expo Router as required by App/AGENTS.md. Keep API and database contracts unchanged.

## Implementation plan

1. Add Expo Router, safe-area support, Inter and bundled Figma icons; bridge existing screens to routes.
2. Test payment validation, request payloads, duplicate-submit protection, uncertain outcomes and receipt formatting before implementing those helpers.
3. Implement responsive native checkout and payment screens, connect order/plan entry points, and provide accessible controls and loading/error/empty states.
4. Run tests, Expo lint, TypeScript and web/native bundle checks. Exercise the app in a browser, review the changes, then prepare the feature branch for GitHub review.

## Product decisions

- The backend payment provider remains simulated. The app validates any exactly 16-digit card number without a brand or checksum restriction; this checks the input format, not bank authorization. Expiry must be a valid, unexpired MM/YY, security code must be three digits, and cardholder name is required. Card fields stay in component memory and are never sent or persisted. Alternative providers and promo codes are visibly unavailable.
- Card digits display in groups of four. Expiry inserts `/` after the month, including when pasting; backspace can correct the month. Payment screens, plan descriptions and receipt exports use neutral customer-facing wording without demo banners or sample-card buttons. The legacy `demo` provider is displayed as `Online payment`, without inventing a card brand or last four digits.
- Checkout contact and address fields demonstrate the intended app interaction. They are draft-only because the current order API has no checkout-address contract. The UI explains this; it never promises changed delivery instructions or emailed receipts.
- Amounts come from backend orders/plans. No invented delivery charge, discount, card brand or payment reference is shown on records.
- Essential Check-in is free with its existing daily wellness call and missed check-in alerts. Review activates it directly without card entry. The server bypasses the payment gateway and records a zero-amount activation (`provider: free`) for subscription confirmation and admin history. Existing paid receipts keep their original amounts. See `Database/README.md` for the automatic upgrade.
- Confirmed pending or uncertain payments lead to status/history, never automatic retries. Successful order payments are reused. Subscription confirmation checks the active plan before submitting.
- Receipt export contains only confirmed server payment data. A pending or failed record is a payment detail, not a paid receipt.

## Run and review

Use Node 22.13 or newer. Follow the repository README for the existing API setup. In `App`, run `npm ci` and `npm run web`. Sign in with the demo customer account shown on the login form.

- Care order → Review payment → Review → Contact → Delivery/service → Payment → Result → Receipt.
- More → Subscriptions → Review this plan → Activate free plan → Result, or Payment → Result for a paid plan.
- More → Payments → All/Completed/Pending/Failed → Receipt or status.
- For local testing, enter a fictional 16-digit number (for example `1234 5678 9012 3456`), a future expiry, any three-digit security code and a name. The final action records a simulated payment through the existing backend; no card is charged.
- Web downloads a text receipt. Native uses the system share sheet.

New native dependencies require rebuilding the development app. Regenerate native configuration with `npm run prebuild:android` before `npm run android`; review any generated native changes separately. No APK/device execution was verified in this change.

Routes now live in `App/src/app/`. The existing customer screens are adapted through `[page].tsx`; new payment components are in `App/src/payments/`. Avoid `screen` as a dynamic route name because Expo Router reserves it.

## Verification record — 16 October 2026

- `npm test`: 19 domain tests pass, including card formatting and validation, expiry month boundaries, duplicate submissions, prior failed-payment reconciliation, lost responses, account changes, amount ownership, paid receipts and free activation confirmations.
- `npm run lint` and `npm run typecheck`: pass.
- Expo web export and Android Hermes bundle export: pass. This is bundle verification, not a device build.
- Initial browser testing against an isolated PGlite copy: existing login/home, four-step order checkout, field errors, back navigation, billing toggle, single POST on repeated activation, plan purchase, receipt download, history filters, already-paid protection, logout/deep-link protection, pending/failed outcomes, lost-response recovery after reload, and logout/login during a delayed payment preflight.
- Card-input follow-up: seven browser checks pass for clean wording across order/subscription screens, typing/pasting/backspacing, the 16-digit limit and validation errors, expiry insertion and correction, order/subscription completion with arbitrary numbers, receipt download, 320px/440px receipt layout, and absence of card numbers from requests or persistent storage. No browser errors were observed.
- Screenshots inspected at 440px; receipt layout also checked at 320px, 390px and 768px. Scrollable content and fixed actions are separate so lower fields stay reachable.
- Independent code review found three issues; all addressed: account-scoped requests and stale completion guards, identity-based recovery instead of timestamp matching, and subscription refresh on focus.
- Free-plan follow-up: seven browser checks pass for mobile/admin pricing, direct card-free activation, a single subscription request, confirmation download, admin subscriber/record visibility, current-plan recognition, paid checkout and older direct checkout links. Screenshots inspected at 390px and desktop width. App lint/typecheck and web export pass; no new native device run.

## Backend handoff

The current payment API accepts only an order ID or plan ID. Real provider sessions, server idempotency, address/contact persistence, promo validation and emailed receipts still need backend contracts before this can process real payments. Google Pay, Onepay, Koko and Mintpay are visibly unavailable. Existing server prices and payment results remain authoritative.

The icon assets are bundled from the approved Figma file; their Lucide/Feather license is included beside the SVGs. Inter is bundled through the Expo Google Fonts package.
