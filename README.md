# Healthcare Diagnostic Sample Pickup & Logistics Platform

An enterprise-grade, HIPAA-compliant diagnostic specimen pickup and cold-chain logistics platform connecting small diagnostic collection centers, certified phlebotomists, large reference/partner testing laboratories, and centralized operations administrators.

---

## 1. System Architecture & Modules

The platform is organized as a unified monorepo powered by **npm workspaces** and **TypeScript**:

```
diagnostic-platform/
├── apps/
│   ├── web/
│   │   ├── small-lab/      # Small Diagnostic Lab Portal (Booking, Barcoding, Manifests)
│   │   ├── large-lab/      # Reference Lab Portal (Accessioning, Quality Check, Reports)
│   │   └── admin/          # Centralized Logistics & Dispatch Command Center
│   ├── phlebo-app/         # Phlebotomist Mobile App (Android/Expo: GPS, Barcode Scanner, Cold-Chain)
│   └── api/                # Secure Node.js Backend API (Firebase Admin SDK, Express, TypeScript)
├── packages/
│   └── shared/             # Shared TypeScript types, status enums, validation schemas & utils
├── firebase/               # Firestore Security Rules, Storage Rules, and Index configurations
├── docs/                   # Platform architecture, compliance, and module specifications
├── .env.example            # Environment variables template
├── .gitignore              # Monorepo git ignore rules
└── package.json            # Root workspaces configuration
```

---

## 2. Technology Stack

* **Web Applications:** React.js, TypeScript, Vite, Tailwind CSS (or clean CSS systems).
* **Mobile Application:** React Native, Expo SDK, TypeScript (Android-first).
* **Backend Services:** Node.js, Express, TypeScript, Firebase Admin SDK.
* **Database & Storage:** Google Cloud Firestore (NoSQL Document Store), Firebase Cloud Storage (Encrypted documents & reports).
* **Identity & Access:** Firebase Authentication with Role-Based Access Control (RBAC) via Custom Claims.
* **Notifications:** Firebase Cloud Messaging (FCM).
* **Version Control:** Git.

---

## 3. Platform Modules Overview

| Module | Target Users | Primary Responsibilities |
| :--- | :--- | :--- |
| **Small Lab Portal** | Clinic staff, local collection centers | Register test orders, generate barcode labels, request sample pickups, view digital manifests. |
| **Large Partner Lab Portal** | Reference lab technicians & pathologists | Receive batches, verify barcode custody, accept/reject specimens, upload test reports. |
| **Admin Dashboard** | Operations managers & dispatchers | Live map tracking, phlebotomist assignment, SLA alerts, cold-chain temperature telemetry, audit logs. |
| **Phlebotomist App** | Field phlebotomists & couriers | Real-time pickup route, sample scanning, cold-chain status logging, digital handover signatures. |
| **Backend API** | Internal system services | Secure business validation, barcode verification, notifications dispatcher, audit trail generator. |

---

## 4. Getting Started (Local Development)

### Prerequisites
* **Node.js:** v18+ (tested on Node v24.17.0)
* **npm:** v9+ (tested on npm 11.13.0)
* **Git:** v2.30+
* **Java:** JDK 11+ (recommended JDK 17 for native Android builds)

### Quick Start
1. **Clone & Navigate:**
   ```bash
   cd diagnostic-platform
   ```

2. **Configure Environment:**
   ```bash
   copy .env.example .env
   ```
   *(Ensure placeholder values are reviewed. No real credentials or patient data should ever be committed).*

3. **Install Dependencies:**
   ```bash
   npm install
   ```

4. **Build Shared Packages:**
   ```bash
   npm run build:shared
   ```

5. **Run Applications:**
   * Backend API: `npm run dev:api` (Port 5000)
   * Small Lab Web: `npm run dev:small-lab` (Port 3000)
   * Large Lab Web: `npm run dev:large-lab` (Port 3001)
   * Admin Dashboard: `npm run dev:admin` (Port 3002)
   * Phlebotomist App: `npm run dev:phlebo` (Expo Dev Server)

---

## 5. Security & Privacy Rules
* **No Real Patient Health Information (PHI):** Always use mock, synthesized records during development.
* **Encrypted Storage:** All clinical reports and identity documents use signed, authenticated URLs.
* **Immutable Audit Trail:** Every custody transfer (Small Lab -> Phlebotomist -> Large Lab) logs timestamp, GPS coordinates, temperature, and user signature.
