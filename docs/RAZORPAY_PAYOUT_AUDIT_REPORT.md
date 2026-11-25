# LABSETU – RAZORPAY PAYOUT & SECURITY AUDIT REPORT

**Audit Date:** 2026-11-25  
**Scope:** Full-stack inspection of `apps/api`, `firebase/functions`, `firebase/firestore.rules`, `packages/shared`, `apps/web/admin`, `apps/web/portal`, `apps/phlebo-app`, and `.env` configuration.  
**Important Distinction:** This report separates **Code Verification** (what is implemented in source files) from **Live Razorpay Account Verification** (whether Razorpay Route, RazorpayX, and Webhook Secrets are activated on the live/test Razorpay merchant account). No real-money payout was executed during this audit.

---

## Executive Summary: Why Money Does NOT Reach Phlebotomists Today

Even when a **Small Lab** pays online via Razorpay and the **Admin** clicks **Release Payout** (or **Run 30-Min Auto-Payout Batch**), **no money is actually transferred to the Phlebotomist's bank account or UPI in the active `apps/api` backend**:

1. **Two Divergent Backends (`apps/api` vs `firebase/functions`)**:
   - `apps/api/src/services/razorpay.service.ts` (`releasePayout`, lines 1123–1398) **does NOT call Razorpay Route or RazorpayX at all**. It generates a synthetic local reference (`CURPAY-xxxxxx`), writes a `payouts` document with `status: 'PROCESSED'`, marks `settlements.phleboPayoutStatus = 'PAID'`, and sends an email/notification claiming the payout was released.
   - `firebase/functions/src/razorpay.ts` (`tryExecuteRazorpayXPayout`, lines 1099–1174) *does* contain basic RazorpayX `fetch` calls (`/v1/contacts`, `/v1/fund_accounts`, `/v1/payouts`), **but**:
     - `RAZORPAYX_ACCOUNT_NUMBER` is **NOT SET** in `.env`, so `tryExecuteRazorpayXPayout()` returns `null` immediately and falls back to the same synthetic `CURPAY-xxxxxx` local record while still marking `status: 'PROCESSED'` and `phleboPayoutStatus = 'PAID'`.
     - It creates a brand-new RazorpayX Contact + Fund Account on every single payout instead of reusing verified beneficiary records.
     - It marks the payout `PROCESSED` / `PAID` synchronously on API acceptance without waiting for RazorpayX `payout.processed` / `payout.failed` / `payout.reversed` webhooks.
2. **Razorpay Route is Completely Unimplemented**: Neither `apps/api` nor `firebase/functions` implements Linked Accounts (`/v2/accounts`), Route Transfers (`/v1/payments/:id/transfers`), or `transfer.*` webhooks.
3. **Webhook Secret Missing & Payout/Transfer Webhooks Missing**:
   - `RAZORPAY_WEBHOOK_SECRET` is **NOT SET** in `.env`.
   - `processVerifiedRazorpayWebhook` only handles `payment.captured`, `order.paid`, `payment.failed`, and `refund.processed`. It does **not** handle `transfer.processed`, `transfer.settled`, `transfer.failed`, `transfer.reversed`, `payout.processed`, `payout.failed`, or `payout.reversed`.
4. **Plaintext Bank Account Storage & Over-Permissive Firestore Rules**:
   - `ProfileScreen.tsx` saves raw `payoutProfile.bankAccountNumber`, `ifscCode`, and `upiId` directly to `phlebotomists/{phleboId}` from the client.
   - `firebase/firestore.rules` line 230 allows **any authenticated, active user** (`isAuthenticated() && isAccountActive()`) to read **any** `phlebotomists/{phleboId}` document — exposing plaintext bank account numbers across tenants.
   - `firebase/firestore.rules` line 416 allows **any authenticated, active user** to `update` `settlements/{settlementId}`.

---

## 1. Existing Implementation Status Matrix

| Capability | Status | Evidence & Notes |
|---|---|---|
| **A. Razorpay Payment Gateway** | | |
| Order creation (`POST /payments/create-order`) | `IMPLEMENTED AND VERIFIED` | `apps/api/src/services/razorpay.service.ts` (`createOrder`), `firebase/functions/src/razorpay.ts` (`createRazorpayOrder`). Server-side amount lookup from `orders`/`invoices`/`settlements`. |
| Payment signature verification (`POST /payments/verify-payment`) | `IMPLEMENTED AND VERIFIED` | Timing-safe HMAC-SHA256 verification (`crypto.timingSafeEqual`) using `RAZORPAY_KEY_SECRET`. (`order_sim_` bypass exists for dev simulation.) |
| Captured payment verification | `PARTIALLY IMPLEMENTED` | Calls `client.payments.fetch(paymentId)` for method/amount, but does **not** reject if `paymentDetails.status !== 'captured'` when signature passes. |
| Payment ID & Order ID storage | `IMPLEMENTED AND VERIFIED` | Stored on `orders`, `settlements`, `invoices`, and `payment_records` (`PAY-{paymentId}`). |
| Webhook signature verification | `IMPLEMENTED BUT NOT VERIFIED` | Code in `processVerifiedRazorpayWebhook` verifies `X-Razorpay-Signature` via `crypto.timingSafeEqual`, **but `RAZORPAY_WEBHOOK_SECRET` is missing in `.env`** (`CONFIGURATION REQUIRED` in runtime). |
| Duplicate webhook protection & Idempotency | `IMPLEMENTED AND VERIFIED` | Checks `razorpay_webhook_events/{rawEventId}` (`status === 'PROCESSED'`) and logs `DUPLICATE_PREVENTED`. |
| **B. Razorpay Route** | | |
| Route enabled on merchant account | `CONFIGURATION REQUIRED` | Not verifiable from code alone; no Route API calls exist and merchant dashboard activation has not been confirmed. |
| Linked Accounts (`/v2/accounts`) | `NOT IMPLEMENTED` | Zero Linked Account creation/storage code in `apps/api` or `firebase/functions`. |
| Phlebo Linked Account registration & KYC status | `NOT IMPLEMENTED` | No `phlebo_linked_accounts` collection or KYC/activation tracking. |
| Transfer creation (`POST /payments/:id/transfers`) | `NOT IMPLEMENTED` | No Route transfer creation anywhere in codebase. |
| Transfer webhooks (`transfer.*`) & reversals | `NOT IMPLEMENTED` | Not handled in `processVerifiedRazorpayWebhook`. |
| **C. RazorpayX Payouts** | | |
| RazorpayX enabled / `RAZORPAYX_ACCOUNT_NUMBER` | `CONFIGURATION REQUIRED` | `RAZORPAYX_ACCOUNT_NUMBER` is **missing** in `.env`. `GET /payments/config` reports `razorpayXEnabled: false`. |
| Beneficiary (Contact + Fund Account) management | `PARTIALLY IMPLEMENTED` | `firebase/functions/src/razorpay.ts` (`tryExecuteRazorpayXPayout`) creates a new Contact & Fund Account inline per payout (no reuse, no encryption, no `apps/api` parity). |
| Payout creation (`POST /v1/payouts`) | `PARTIALLY IMPLEMENTED` | Present **only** in `firebase/functions/src/razorpay.ts` (absent in `apps/api/src/services/razorpay.service.ts`). Marks `PAID` immediately without waiting for webhook. |
| IMPS / NEFT / UPI payout modes | `PARTIALLY IMPLEMENTED` | Hardcoded `UPI` if `upiId` present else `IMPS` in `firebase/functions`; not implemented in `apps/api`. |
| Sufficient balance check | `NOT IMPLEMENTED` | Uses `queue_if_low_balance: true` without querying RazorpayX balance or surfacing `INSUFFICIENT_BALANCE` alerts. |
| Payout status webhooks (`payout.*`) | `NOT IMPLEMENTED` | Neither `apps/api` nor `firebase/functions` handles `payout.processed`, `payout.failed`, `payout.reversed`, or `payout.queued`. |
| **D. Automatic Phlebo Payout Engine** | | |
| Automatic trigger on Sample Handover / Completion | `NOT IMPLEMENTED` | `orders.routes.ts` only sets `instantPayoutEligible: true` on `settlements`. No automatic payout runs on handover/delivery; Admin must manually click **Run 30-Min Auto-Payout Batch** (`/finance/automation/process-instant-payouts`), which in `apps/api` only writes fake `CURPAY-*` docs. |
| Integer paise financial calculation | `NOT IMPLEMENTED` | Payout math uses floating-point INR (`Number(...)`) instead of integer paise. |
| Payout error monitoring & retry idempotency | `NOT IMPLEMENTED` | `payout_error_logs`, structured error codes (`BANK_DETAILS_NOT_VERIFIED`, `RAZORPAYX_NOT_ENABLED`, etc.), and safe idempotent retries do not exist. |
| **E. Phlebo Bank Account & UPI Management** | | |
| Searchable Bank Selector UI | `NOT IMPLEMENTED` | `ProfileScreen.tsx` has only plain text inputs for Account Number, IFSC, and UPI ID. |
| Backend IFSC lookup & branch verification | `NOT IMPLEMENTED` | No `/ifsc/:code` backend endpoint; IFSC is not validated against Razorpay IFSC API. |
| Bank Account encryption at rest (AES-256-GCM) | `NOT IMPLEMENTED` | Plaintext account number saved directly to `phlebotomists/{id}.payoutProfile.bankAccountNumber`. |
| Masked default display & Audited Reveal | `PARTIALLY IMPLEMENTED` | `ProfileScreen.tsx` has a local eye toggle, but full account number is stored & synced in plaintext to client. No Admin audited reveal workflow. |
| UPI verification via provider | `NOT IMPLEMENTED` | No VPA verification flow or separate verification status. |
| **F. Admin & Phlebo Payout UI** | | |
| Admin `Finance → Phlebo Payouts` dedicated error dashboard | `PARTIALLY IMPLEMENTED` | `AdminPaymentsTab.tsx` shows basic settlements & `Release Payout` modal, but lacks dedicated Phlebo payout ledger, error codes, filters, hold/release/retry/reconciliation workflows. |
| Phlebo `Profile → Bank & Payment Details` & `Earnings → Payout History` | `PARTIALLY IMPLEMENTED` | `EarningsScreen.tsx` shows `Pending Courier Payout` / `Paid Out Total` and `payouts` list, but lacks `PROCESSING` / `FAILED` / `ON_HOLD` breakdown, failure reasons, and bank/UPI verification status. |

---

## 2. Existing API Endpoints & File Locations

- **Node.js / Express Backend (`apps/api/src`)**:
  - `routes/payments.routes.ts`: `GET /api/v1/payments/config`, `POST /create-order`, `POST /verify-payment`, `POST /webhook`, `POST /create-payment-link`, `GET /payment-link/:id`, `POST /payout`.
  - `services/razorpay.service.ts`: `createOrder`, `verifyPayment`, `processVerifiedRazorpayWebhook`, `issueGatewayRefund`, `createPaymentLink`, `checkPaymentLink`, `releasePayout` (synthetic local payout only).
  - `routes/finance.routes.ts`: `GET/PATCH/PUT /finance/config`, `GET /finance/overview`, `POST /finance/automation/process-instant-payouts`.
  - `routes/orders.routes.ts`: Sets `instantPayoutEligible: true` on `settlements` upon delivery.
- **Firebase Cloud Functions (`firebase/functions/src`)**:
  - `razorpay.ts`: `createRazorpayOrder`, `verifyRazorpayPayment`, `processVerifiedRazorpayWebhook`, `tryExecuteRazorpayXPayout`, `releaseSettlementPayout`.
  - `finance.ts`: Mirrors `/finance/*` routes including `/automation/process-instant-payouts`.
- **Web Admin (`apps/web/admin` & `apps/web/portal`)**:
  - `dashboards/admin/AdminPaymentsTab.tsx`, `AdminModals.tsx` (Payout Modal), `FinanceAutomationTab.tsx`, `AdminCommissionTab.tsx`.
- **Phlebo App (`apps/phlebo-app`)**:
  - `screens/ProfileScreen.tsx` (inline `payoutProfile` fields), `screens/EarningsScreen.tsx`, `services/razorpayMobile.ts` (payment link collection from Small Lab).

---

## 3. Existing Database Collections & Fields

- `orders/{orderId}`: `totalAmountInr`, `courierFeeInr`, `paymentStatus`, `razorpayOrderId`, `razorpayPaymentId`, `phlebotomistId`, `status`, `deliveredAt`.
- `settlements/{settlementId}` (`STL-{orderId}`): `grossAmountInr`, `platformFeeInr`, `labPayoutInr`, `phleboPayoutInr`, `paymentStatus`, `labPayoutStatus`, `phleboPayoutStatus`, `labPayoutRef`, `phleboPayoutRef`, `instantPayoutEligible`, `status`.
- `payouts/{payoutId}`: `settlementId`, `orderId`, `recipientRole`, `recipientId`, `amountInr`, `grossAmountInr`, `deductedPlatformFeeOffsetInr`, `netPayoutInr`, `mode`, `referenceId`, `gatewayPayoutId` (only in Cloud Functions if RazorpayX configured), `status` (`PROCESSED`), `createdAt`.
- `payment_records/{PAY-...}`: `sourceType`, `bookingId`, `invoiceId`, `amountInr`, `razorpayOrderId`, `razorpayPaymentId`, `gatewayStatus`, `reconciliationStatus`.
- `razorpay_webhook_events/{eventId}`: `event`, `paymentId`, `orderId`, `status` (`PROCESSED`).
- `phlebotomists/{phleboId}`: `payoutProfile: { accountHolderName, bankAccountNumber (PLAINTEXT!), bankAccountLast4, ifscCode, upiId }`, `pendingPlatformFeeDueInr`.

---

## 4. End-to-End Trace of a Booking (Small Lab Payment → Phlebo Payout)

1. **Small Lab pays** → `POST /payments/create-order` creates Razorpay Order → Checkout completes → `POST /payments/verify-payment` verifies HMAC signature and updates `orders/{id}` & `settlements/STL-{id}` (`paymentStatus: 'PAID'`, `phleboPayoutStatus: 'PENDING'`).
2. **Sample Pickup & Handover** → Phlebo completes `COLLECT_SAMPLE` and `DROP_SAMPLE` (Handover OTP). `orders.routes.ts` sets `settlements.instantPayoutEligible = true`. **Execution stops here for automatic payouts** — nothing triggers a payout automatically.
3. **Admin triggers Payout (Manual or 30-Min Batch)** → Calls `POST /payments/payout` or `POST /finance/automation/process-instant-payouts`:
   - On `apps/api`: `releasePayout()` writes a local `payouts` document with `referenceId: 'CURPAY-...'` and sets `phleboPayoutStatus: 'PAID'` **without calling Razorpay**.
   - On `firebase/functions`: `tryExecuteRazorpayXPayout()` sees `RAZORPAYX_ACCOUNT_NUMBER` is empty, returns `null`, and also writes a local `CURPAY-...` doc while marking `PAID`.
4. **Result**: The dashboard and Phlebo App show `Paid`, **but Rs 0 was transferred via Razorpay Route or RazorpayX**.

---

## 5. Security Gaps Identified

1. **Cross-Tenant Plaintext Bank Read (`firestore.rules:230`)**: `match /phlebotomists/{phleboId}` grants `allow read: if isAuthenticated() && isAccountActive();`. Any logged-in lab or other phlebo can read `payoutProfile.bankAccountNumber`.
2. **Unrestricted Settlement Update (`firestore.rules:416`)**: `match /settlements/{settlementId}` grants `allow update: if isAuthenticated() && isAccountActive();`. Any authenticated user could tamper with `phleboPayoutInr` or `paymentStatus`.
3. **No Encryption at Rest for Bank/UPI**: Account numbers are stored in plaintext in Firestore and synced to client state.
4. **No Audited Reveal / RBAC Separation**: No permission-checked, re-authenticated, time-limited reveal endpoint for Finance/Super Admin.
5. **Missing Webhook Secret**: `RAZORPAY_WEBHOOK_SECRET` is not configured in `.env`.
6. **Client-Trusting Payout Profile**: No server-side IFSC verification or re-verification lock on bank detail updates.

---

## 6. Recommended Implementation Plan (Phases 2–8)

1. **Phase 3 + 7 (Backend Security & Data Design)**:
   - Tighten `firestore.rules` for `phlebotomists`, `settlements`, and lock down `phlebo_bank_accounts`, `phlebo_upi_accounts`, `phlebo_payment_methods`, `phlebo_linked_accounts`, `payout_ledger`, `payout_transactions`, `razorpay_transfers`, `payout_audit_logs`, `payout_error_logs` to server-only writes and strict RBAC reads.
   - Implement AES-256-GCM envelope encryption service (`bankCrypto.service.ts`) with versioned keys (`BANK_ENCRYPTION_KEY`, separated from Firestore) + audited Admin reveal endpoint.
   - Implement backend IFSC lookup (`GET /api/v1/phlebo-payouts/ifsc/:code` via `https://ifsc.razorpay.com/:code`) and searchable maintained bank directory (`GET /api/v1/phlebo-payouts/banks`).
2. **Phase 2 & 4 (Automatic Phlebo Payout Engine)**:
   - Implement unified payout engine in `apps/api` (`payoutEngine.service.ts`) using integer paise math, configurable eligibility trigger (`AFTER_HANDOVER` vs `AFTER_REPORT_COMPLETION`), immutable `payout_ledger` entries, atomic Firestore transactions, and idempotency keys.
   - Support **Razorpay Route** (Linked Accounts + Transfers) and **RazorpayX** (Contacts + Fund Accounts + Payouts) cleanly without duplicate payouts, mapping provider states (`PROCESSING`, `INITIATED`, `PROCESSED`, `SETTLED`, `FAILED`, `REVERSED`, `NEEDS_REVIEW`) and never marking `PAID` without authoritative confirmation.
   - Extend `processVerifiedRazorpayWebhook` for `transfer.*` and `payout.*` events.
3. **Phase 5 (Admin Finance → Phlebo Payouts Dashboard)**:
   - Add dedicated **Phlebo Payouts** tab under Admin Finance with KPI cards, filters, masked details, error codes, Retry (idempotent), Hold, Release, Manual Reconcile (with required external UTR/reference), and Audited Reveal.
4. **Phase 6 (Phlebo App Bank, UPI & Payout Screens)**:
   - Build `Profile → Bank & Payment Details` (searchable bank selector, IFSC auto-lookup & verify, masked account display, separate UPI section, default payout method selector) and enhanced `Earnings → Payout History` & `Payment Details`.
5. **Phase 8 (Verification & Test Suite)**:
   - Write and run automated unit/integration tests covering all 20 required test cases in Razorpay test/mocked mode.
