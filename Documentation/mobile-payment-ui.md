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

- The backend payment provider is a demo. Only the documented demo card is accepted; card fields stay in component memory and are never sent or persisted. Alternative providers and promo codes are visibly unavailable.
- Checkout contact and address fields demonstrate the intended app interaction. They are draft-only because the current order API has no checkout-address contract. The UI explains this; it never promises changed delivery instructions or emailed receipts.
- Amounts come from backend orders/plans. No invented delivery charge, discount, card brand or payment reference is shown on records.
- Confirmed pending or uncertain payments lead to status/history, never automatic retries. Successful order payments are reused. Subscription confirmation checks the active plan before submitting.
- Receipt export contains only confirmed server payment data. A pending or failed record is a payment detail, not a paid receipt.

## Run and review

Use Node 22.13 or newer. Follow the repository README for the existing API setup. In `App`, run `npm ci` and `npm run web`. Sign in with the demo customer account shown on the login form.

- Care order → Review payment → Review → Contact → Delivery/service → Payment → Result → Receipt.
- More → Subscriptions → Review this plan → Payment → Result.
- More → Payments → All/Paid/Pending/Failed → Receipt or status.
- Use **Use demo card** to fill the documented test values. The final action records a demo payment through the existing backend.
- Web downloads a text receipt. Native uses the system share sheet.

New native dependencies require rebuilding the development app. Regenerate native configuration with `npm run prebuild:android` before `npm run android`; review any generated native changes separately. No APK/device execution was verified in this change.

Routes now live in `App/src/app/`. The existing customer screens are adapted through `[page].tsx`; new payment components are in `App/src/payments/`. Avoid `screen` as a dynamic route name because Expo Router reserves it.

## Verification record — 16 October 2026

- `npm test`: 14 domain tests pass, including duplicate submissions, prior failed-payment reconciliation, lost responses, account changes, amount ownership and receipt contents.
- `npm run lint` and `npm run typecheck`: pass.
- Expo web export and Android Hermes bundle export: pass. This is bundle verification, not a device build.
- Browser testing against an isolated PGlite copy: existing login/home, four-step order checkout, field errors, back navigation, demo card and billing toggle, single POST on repeated activation, plan purchase, receipt download, history filters, already-paid protection, logout/deep-link protection, pending/failed outcomes, lost-response recovery after reload, and logout/login during a delayed payment preflight.
- Screenshots inspected at 440px; receipt layout also checked at 320px, 390px and 768px. Scrollable content and fixed actions are separate so lower fields stay reachable.
- Independent code review found three issues; all addressed: account-scoped requests and stale completion guards, identity-based recovery instead of timestamp matching, and subscription refresh on focus.

## Backend handoff

The current payment API accepts only an order ID or plan ID. Real provider sessions, server idempotency, address/contact persistence, promo validation and emailed receipts still need backend contracts before this can process real payments. Google Pay, Onepay, Koko and Mintpay are visibly unavailable. Existing server prices and payment results remain authoritative.

The icon assets are bundled from the approved Figma file; their Lucide/Feather license is included beside the SVGs. Inter is bundled through the Expo Google Fonts package.
