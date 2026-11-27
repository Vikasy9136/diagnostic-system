# LABSETU — WALLET, WEEKLY WITHDRAWAL & RESPONSIVE PORTAL AUDIT

**Audit Date:** 2026-11-27  
**Scope:** Full-stack audit prior to implementing the Phlebo Wallet, 7-Day Weekly Withdrawal System, Admin Manual Bank/UPI Settlement Workflow, and Responsive Portal UI.

## 1. Existing Financial & Wallet Architecture
- **Node.js Backend (`apps/api`)**: Contains `razorpay.service.ts`, `bankCrypto.service.ts` (AES-256-GCM), `bankDirectory.service.ts` (IFSC lookup), `phleboBank.service.ts`, and `payoutEngine.service.ts`. Synthetic `CURPAY-*` / `LABPAY-*` generation was already stopped in `releasePayout()`, and `verifyPayment()` enforces `captured` + `INR` + `order_id` checks.
- **Firebase Cloud Functions (`firebase/functions/src/razorpay.ts`)**: Serves `/api/**` rewrites in `firebase/firebase.json`. Synthetic `CURPAY-*` / `LABPAY-*` fallback was removed; `releaseSettlementPayout()` requires either real RazorpayX config or a verified external UTR.
- **Gap**: There is **no** Phlebo Wallet (`wallets`), **no** immutable wallet ledger (`walletTransactions`), **no** automatic earning credit on booking handover/completion in `orders.routes.ts`, **no** 7-day weekly withdrawal request lifecycle (`withdrawalRequests`), **no** Admin Manual Settlement UI (`manualSettlements`), and **no** private UPI QR upload/access flow.

## 2. Bank, UPI, QR & Firestore Security
- `phlebo_bank_accounts` & `phlebo_upi_accounts` are server-only (`allow read, write: if false;`) and encrypted via AES-256-GCM (`BANK_ENCRYPTION_KEY`).
- `phlebotomists/{phleboId}` and `settlements/{settlementId}` were hardened against cross-tenant reads and unauthorised writes.
- **Gap**: `firebase/storage.rules` lacks a `private-phlebo-qr/{phleboId}/{fileName}` rule (`allow read, write: if false;` from client, backend-only signed/authenticated access), and `firebase/firestore.rules` needs explicit server-write-only rules for `wallets`, `walletTransactions`, `withdrawalRequests`, `payoutProfiles`, `manualSettlements`, and `financialAuditLogs`.

## 3. Responsive Website Audit (Admin, Small Lab, Large Lab)
- `apps/web/portal/src/index.css` & `apps/web/admin/src/index.css` use fixed sidebar widths and multi-column KPI/table layouts that need responsive breakpoints across `320px–480px`, `481px–768px`, `769px–1024px`, `1025px–1440px`, and `>1440px` (collapsible mobile/tablet sidebar drawer, stacked KPI cards, `.data-table-container` horizontal scroll containment, full-width form inputs, and viewport-safe modals without page-wide horizontal overflow).
