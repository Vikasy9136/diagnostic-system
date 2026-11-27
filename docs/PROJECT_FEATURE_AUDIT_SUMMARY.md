# LabSetu Diagnostic Platform — Executive Audit Summary

**Audit Date:** 2026-11-27  
**Full Report:** [PROJECT_FEATURE_AUDIT_REPORT.md](./PROJECT_FEATURE_AUDIT_REPORT.md)

## Verdict: Is the current website and app fully dynamic and connected?
**Yes for all core web and backend workflows; partially unverified on physical Android hardware.**  
All 4 web portals (`portal`, `admin`, `small-lab`, `large-lab`), the Express/Firebase Functions API (`apps/api`), and the Firestore/Storage backend are wired to real Firebase Auth, Firestore real-time listeners, and integer-paise financial ledgers — with **zero UI-only or dummy-data dashboards** remaining in the core workflows, and **37/37 automated backend & financial tests passing** (`FORCE_FIREBASE_MOCK=true`).  

However, **13 features** (primarily Phlebo Android native device capabilities and the Inventory / Org-Structure sub-modules) are **`BACKEND CONNECTED BUT NOT VERIFIED`** end-to-end on a physical Android device or live Firebase emulator, and **1 feature** (automated RazorpayX bank transfer disbursement) is **`BLOCKED BY CONFIGURATION`** until live `RAZORPAYX_ACCOUNT_NUMBER` credentials are configured.

---

## Key Metrics
- **Applications Inspected:** 7 (`portal`, `admin`, `small-lab`, `large-lab`, `phlebo-app`, `apps/api`, `firebase/functions` + `packages/shared`)
- **Total Features Inventoried:** 64
  - **Fully Working:** 50 (78.1%)
  - **Backend Connected But Not Verified:** 13 (20.3%)
  - **Blocked By Configuration:** 1 (1.6%)
  - **UI-Only / Dummy Data / Broken:** 0 (0.0%)
- **Automated Tests:** 37 / 37 passed (`FORCE_FIREBASE_MOCK=true`)
- **Build Verification:** All TypeScript & Vite builds (`shared`, `api`, `portal`, `large-lab`, `small-lab`, `admin`, `firebase/functions`, `phlebo-app` `tsc --noEmit`) passed with exit code `0`.

---

## Top Priorities Requiring Immediate Attention
1. **CRITICAL — Credentials in `.env.example` (lines 30–42):** Contains non-redacted template credentials (Admin password, SMTP App Password, Razorpay test secret). Rotate immediately and replace with placeholders.
2. **HIGH — `users/{userId}` Firestore update rule (`firebase/firestore.rules:182-189`):** Lock `role`, `permissions`, `isSuperAdmin`, `labId`, and `active` from client self-update.
3. **MEDIUM — Storage & Scanner Rule Scoping (`storage.rules:152-165`, `firestore.rules:933-944`):** Scope `samples/`, `signatures/`, `scannerPairingSessions`, and `scannerEvents` to order/tenant participants.
4. **MEDIUM — Physical Android Device QA (`apps/phlebo-app`):** Verify native Google Sign-In Account Picker, camera barcode scanner, background GPS, floating overlay, and dynamic launcher icons on a real Android device.
5. **MEDIUM — Production Keys:** Configure `RAZORPAYX_ACCOUNT_NUMBER` and a persistent 32-byte `BANK_ENCRYPTION_KEY`.
6. **LOW — Codebase Maintainability & Bundle Size:** Deduplicate standalone web portals (`admin`, `small-lab`, `large-lab`) against `portal`, add `React.lazy` code-splitting, and clean up 2 `storage.rules` compiler warnings.
