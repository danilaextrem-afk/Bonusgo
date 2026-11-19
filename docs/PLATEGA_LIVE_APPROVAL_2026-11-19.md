# QRonus / Platega — live-approval and launch checklist

**Version:** 2026-11-19. **Status:** implementation prepared for review; NOT activated in production.

## Commercial terms supplied by Platega representative
- Maximum total of one transaction: **10,000 RUB (1,000,000 kopecks)**.
- Proposed methods: SBP/NSPK, 8.5% fee; crypto, 5% fee. Treat as a proposal, not a signed agreement.
- Current implementation uses SBP method 2 **only**. No crypto checkout, wallet top-ups or physical goods are implemented.
- QRonus TOP x3 = 14,670 RUB; TOP x12 = 48,900 RUB. Both are **blocked** when Platega is selected. PRO x12 = 9,900 RUB and remains within the cap. No automatic splitting of orders.
- Invoice totals are calculated on the server, never trusted from request data.

## Public-review requirements
- Footer shows the temporary literal `verplatega` for merchant verification; remove only after approval.
- Real price/period and user-visible **Оплатить** action in `/app/billing`. Public `/ru/tarify` and `/by/tarify` include registration route and purchase instructions.
- Legal pages already exist at `/ru/politika-konfidencialnosti` and `/ru/usloviya`; footer links to both. **Existing legal drafts require lawyer/owner approval and identification.**
- `/ru/kontakty` and the footer link to support. Set a real working `CONTACT_EMAIL` (no placeholder).
- Registration requires user email and terms/privacy consent. Platega receives the actual signed-in OWNER's email as `metadata.user_email`, plus a stable system ID as `metadata.userId`. Do not invent email addresses.
- Access for Platega reviewers: create a separate least-privileged staging business account with fabricated test data via the ordinary registration flow; provide credentials to the provider **through its private authenticated channel, never in code or public issue/PR**. No admin credentials.

## Provider API format and control
- Documentation (as of 2026-11-19): https://docs.platega.io/
- POST `/transaction/process` has **no client-chosen `id`**. Platega returns `transactionId`, which is stored as `providerRef`; payment redirect must be HTTPS at `pay.platega.io`.
- Server authenticates callbacks using provider headers, then re-reads GET `/transaction/{id}` to confirm the actual payment, amount and RUB currency before activation. No fulfilment from the browser return URL.
- Follow up on full chargebacks, disputes and partial refunds before final production acceptance. Partial refunds require an explicit business policy.

## Fail-closed live switch — all necessary
Environment variables in the hosting secret store (never GitHub, documentation or chat):
- `PLATEGA_MERCHANT_ID`, `PLATEGA_SECRET` from the approved Platega merchant;
- `PLATEGA_LIVE_ENABLED=true` (default false), `PAYMENTS_TEST_MODE=false`, `DEMO_MODE=false`;
- `CONTACT_EMAIL` (real support mailbox); `OWNER_NAME`, `OWNER_TAX_ID`, `OWNER_ADDRESS` (real operator identification).
- `APP_URL` must be the publicly reachable HTTPS site.
- Configure Platega callback URL: `<APP_URL>/api/payments/platega/callback`.
- Verify fiscal receipt process, callback logs, customer support, refund flow and the merchant's approval status in its dashboard.

**Important blockers:** Current launch docs describe Neon (EU) for demo data, which must not be assumed compliant for Russian personal data. Complete lawful data localisation, personal-data notices and policy review *before turning DEMO_MODE off*. Real billing cannot responsibly be activated solely by setting a flag. Owner must check Render/Platega controls through an authenticated connection. No current chat/tool access to these live settings was used.

## Verification
CI: `npm ci && npx drizzle-kit migrate && npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e` with synthetic fixtures; never send requests to production Platega while testing.

## Next
- Obtain Platega approval/allowed method confirmation and stable reviewer credentials via private secure channel.
- Complete legal placeholders, verified support email and Russian data hosting.
- Test one approved low-value live payment, verified webhook and reversal only after operator sign-off; do not perform a transaction without that operational setup.
