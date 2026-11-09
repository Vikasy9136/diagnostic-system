# Platform Modules & User Roles

## 1. User Roles & RBAC (Role-Based Access Control)

The platform enforces strict authorization mapped to Firebase Authentication Custom Claims:

* `ROLE_ADMIN`: Platform operations, fleet management, dispatching, compliance oversight.
* `ROLE_SMALL_LAB`: Small diagnostic clinic or local sample collection center staff.
* `ROLE_LARGE_LAB`: Partner reference laboratory accessioning staff and pathologists.
* `ROLE_PHLEBOTOMIST`: Field technicians responsible for sample collection and transit.

## 2. Module Specifications

### Module 1: Small Diagnostic Lab Web Portal (`apps/web/small-lab`)
* **Patient Registration:** Register mock patient metadata (Name, Age, Gender, Contact).
* **Test Catalog & Order Entry:** Select required diagnostic tests (e.g., CBC, Lipid Panel, HbA1c).
* **Barcode Generation:** Generate printable sample labels with unique accession numbers.
* **Pickup Dispatch Requests:** Request on-demand or scheduled phlebotomist pickup.
* **Tracking & Reports:** View live ETA and download verified diagnostic reports.

### Module 2: Large Partner Lab Web Portal (`apps/web/large-lab`)
* **Batch Accessioning:** Scan arriving transport coolers and match manifest barcodes.
* **Pre-Analytical QC:** Inspect specimen integrity (hemolysis, volume sufficiency, temperature).
* **Worklist Management:** Group samples by department (Biochemistry, Hematology, Molecular).
* **Diagnostic Report Upload:** Secure PDF and structured JSON result publishing.

### Module 3: Central Operations Admin Dashboard (`apps/web/admin`)
* **Dispatch Grid:** Visual map of active pickup requests, unassigned orders, and active field phlebos.
* **Telemetry & SLA Monitoring:** Track specimen turnaround time (TAT) and temperature alerts.
* **Lab Network Management:** Onboard, activate, and manage small and partner laboratory accounts.
* **Audit & Compliance Trail:** Searchable ledger of every custody handover and GPS event.

### Module 4: Phlebotomist Mobile App (`apps/phlebo-app`)
* **Task Queue:** Daily pickup list ordered by geographic route and priority SLA.
* **In-App Barcode Scanner:** Camera-based barcode scanner for instant custody verification.
* **Cold-Chain Check-in:** Log storage container temperature upon pickup and delivery.
* **Digital Signatures:** Dual-confirmation signature between lab staff and phlebotomist.

### Module 5: Backend API (`apps/api`)
* **Secure Firebase Admin Proxy:** Verify Firebase JWTs and enforce custom role claims.
* **Business Validation Rules:** Enforce valid state transitions (e.g., cannot deliver without pickup).
* **Push Notifications:** Send FCM notifications for pickup assignments and status updates.
