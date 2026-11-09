# LabSetu — Healthcare Diagnostic Sample Pickup & Logistics Platform

An enterprise-grade diagnostic specimen pickup and cold-chain logistics platform connecting local diagnostic collection centers, certified phlebotomists, large reference testing laboratories, and platform dispatch administrators.

---

## 1. Visual Design System ("LabSetu" UI/UX Guidelines)

The user interface follows the official **LabSetu Healthcare SaaS Design System**:

* **Font Family:** `Inter` (Google Fonts: Regular 400, Medium 500, SemiBold 600, Bold 700)
* **Color Palette:**
  * **Primary Teal:** `#0D9488`
  * **Primary Dark:** `#0F766E`
  * **Accent Blue:** `#2563EB`
  * **Success Green:** `#16A34A`
  * **Warning Amber:** `#F59E0B`
  * **Error Red:** `#DC2626`
  * **Background Canvas:** `#F8FAFC`
  * **Surface / Card:** `#FFFFFF`
  * **Text Primary:** `#0F172A`
  * **Text Secondary:** `#64748B`
  * **Border Light:** `#E2E8F0`

---

## 2. Platform Architecture & Workspaces

The platform is organized as a unified monorepo powered by **npm workspaces** and **TypeScript**:

```
diagnostic-platform/
├── apps/
│   ├── web/
│   │   ├── small-lab/      # Small Diagnostic Lab Portal (Port 3000)
│   │   ├── large-lab/      # Large Partner Reference Lab Portal (Port 3001)
│   │   └── admin/          # Admin Logistics & Dispatch Dashboard (Port 3002)
│   ├── phlebo-app/         # Phlebotomist Mobile App (Android/Expo React Native)
│   └── api/                # Secure Node.js Backend API (Port 5000)
├── packages/
│   └── shared/             # Shared TypeScript types, validation rules & LabSetu theme tokens
├── firebase/               # Firestore Security Rules, Storage Rules, and Index configurations
├── docs/                   # Architectural & compliance documentation
├── .env.example            # Environment variables template
├── .gitignore              # Git ignore rules
└── package.json            # Root workspaces orchestrator
```

---

## 3. Platform Modules Overview

| Module | Role | Port | Key Features |
| :--- | :--- | :--- | :--- |
| **Small Lab Web Portal** | `SMALL_LAB` | `3000` | Booking requests, patient registration, recent bookings table, live courier GPS tracking with ETA. |
| **Partner Reference Lab** | `LARGE_LAB` | `3001` | Batch accessioning, barcode scanning, temperature QC check, report upload modal. |
| **Admin Command Dashboard**| `ADMIN` | `3002` | Platform overview KPIs, interactive live operations route map, telemetry grid (battery, temperature). |
| **Phlebotomist Mobile App**| `PHLEBOTOMIST` | Expo (Android) | Dark teal header, online toggle, daily summary, 5-screen interactive flow (Requests, Details, Collect, Drop with OTP, Completed). |
| **Node.js Backend API** | Services | `5000` | Health check, specimen validation, Firebase Admin SDK integration with local mock fallback. |

---

## 4. Local Development & Running Guide

### Quick Start
1. **Navigate to the workspace:**
   ```bash
   cd diagnostic-platform
   ```

2. **Configure Environment:**
   ```bash
   copy .env.example .env
   ```

3. **Install Dependencies:**
   ```bash
   npm install
   ```

4. **Build All Workspaces:**
   ```bash
   npm run build:all
   ```

5. **Run Applications Independently:**
   * **Small Lab Web Portal (Port 3000):**
     ```bash
     npm run dev:small-lab
     ```
   * **Large Partner Lab Web Portal (Port 3001):**
     ```bash
     npm run dev:large-lab
     ```
   * **Admin Operations Dashboard (Port 3002):**
     ```bash
     npm run dev:admin
     ```
   * **Phlebotomist Mobile App (Expo / Android):**
     ```bash
     npm run dev:phlebo
     ```
   * **Backend API (Port 5000):**
     ```bash
     npm run dev:api
     ```

---

## 5. Security & Privacy Rules
* **No Real Patient Data:** Development mode uses synthesized patient identifiers (e.g. `PT-9482`, `PT-101`).
* **Role-Based Access Control (RBAC):** Firestore and API enforce user roles.
* **Cold-Chain Audit Trail:** Every specimen transfer logs temperature, location, and immutable timestamps.
