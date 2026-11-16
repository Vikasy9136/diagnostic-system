import {
  type AdminTab,
  type DashboardRouteMeta,
  type LargeLabTab,
  type SmallLabTab,
} from '../types/routes.js';

// ==========================================
// SMALL COLLECTION LAB ROUTE MAPPINGS
// ==========================================
export const SMALL_LAB_ROUTES: Record<SmallLabTab, DashboardRouteMeta<SmallLabTab>> = {
  dashboard: {
    tab: 'dashboard',
    path: '/dashboard',
    aliases: ['/dashboard/overview', '/overview'],
    title: 'LabSetu | Collection Lab Dashboard',
    navLabel: 'Dashboard',
  },
  'new-booking': {
    tab: 'new-booking',
    path: '/dashboard/new-booking',
    aliases: ['/new-booking', '/dashboard/create-booking', '/create-booking'],
    title: 'LabSetu | Create New Booking - Collection Lab',
    navLabel: 'New Booking',
  },
  patients: {
    tab: 'patients',
    path: '/dashboard/patients',
    aliases: ['/patients', '/dashboard/patient-directory'],
    title: 'LabSetu | Patients Directory',
    navLabel: 'Patients',
  },
  catalogue: {
    tab: 'catalogue',
    path: '/dashboard/catalogue',
    aliases: ['/catalogue', '/dashboard/test-catalogue', '/test-catalogue'],
    title: 'LabSetu | Test Catalogue',
    navLabel: 'Test Catalogue',
  },
  partners: {
    tab: 'partners',
    path: '/dashboard/partner-labs',
    aliases: ['/partner-labs', '/dashboard/partners', '/partners', '/dashboard/reference-labs'],
    title: 'LabSetu | Partner Reference Labs',
    navLabel: 'Partner Labs',
  },
  bookings: {
    tab: 'bookings',
    path: '/dashboard/bookings',
    aliases: ['/bookings', '/dashboard/bookings-custody', '/dashboard/orders'],
    title: 'LabSetu | Bookings & Custody Tracking',
    navLabel: 'Bookings & Custody',
  },
  reports: {
    tab: 'reports',
    path: '/dashboard/reports',
    aliases: ['/reports', '/dashboard/diagnostic-reports'],
    title: 'LabSetu | Reports & Diagnostic Results',
    navLabel: 'Reports',
  },
  payments: {
    tab: 'payments',
    path: '/dashboard/payments',
    aliases: ['/payments', '/dashboard/settlements', '/settlements'],
    title: 'LabSetu | Payments & Settlements',
    navLabel: 'Payments',
  },
  support: {
    tab: 'support',
    path: '/dashboard/support',
    aliases: ['/support', '/dashboard/help-support', '/help'],
    title: 'LabSetu | Help & Support',
    navLabel: 'Help & Support',
  },
};

export function resolveSmallLabTab(pathname: string): SmallLabTab {
  const clean = (pathname || '').trim().toLowerCase().replace(/\/+$/, '') || '/';
  for (const meta of Object.values(SMALL_LAB_ROUTES)) {
    if (meta.path === clean) return meta.tab;
    if (meta.aliases?.some((a) => a === clean)) return meta.tab;
  }
  return 'dashboard';
}

export function getSmallLabPath(tab: SmallLabTab): string {
  return SMALL_LAB_ROUTES[tab]?.path || '/dashboard';
}

export function getSmallLabTitle(tab: SmallLabTab): string {
  return SMALL_LAB_ROUTES[tab]?.title || 'LabSetu | Collection Lab Portal';
}

// ==========================================
// ADMIN CONTROL TOWER ROUTE MAPPINGS
// ==========================================
export const ADMIN_ROUTES: Record<AdminTab, DashboardRouteMeta<AdminTab>> = {
  dashboard: {
    tab: 'dashboard',
    path: '/dashboard',
    aliases: ['/dashboard/overview', '/overview'],
    title: 'LabSetu | Platform Admin Dashboard',
    navLabel: 'Executive Overview',
  },
  'ops-command': {
    tab: 'ops-command',
    path: '/dashboard/live-ops',
    aliases: ['/live-ops', '/dashboard/ops-command', '/dashboard/command-center'],
    title: 'LabSetu | Live Operations Command Tower',
    navLabel: 'Ops Command Tower',
  },
  bookings: {
    tab: 'bookings',
    path: '/dashboard/bookings',
    aliases: ['/bookings', '/dashboard/orders', '/orders'],
    title: 'LabSetu | Platform Bookings & Custody',
    navLabel: 'Live Bookings',
  },
  labs: {
    tab: 'labs',
    path: '/dashboard/labs',
    aliases: ['/labs', '/dashboard/labs/all'],
    title: 'LabSetu | Laboratory Directory',
    navLabel: 'All Laboratories',
  },
  'labs-small': {
    tab: 'labs-small',
    path: '/dashboard/labs/small',
    aliases: ['/dashboard/small-labs', '/small-labs', '/dashboard/collection-labs'],
    title: 'LabSetu | Small Collection Labs',
    navLabel: 'Collection Centers',
  },
  'labs-large': {
    tab: 'labs-large',
    path: '/dashboard/labs/large',
    aliases: ['/dashboard/large-labs', '/large-labs', '/dashboard/reference-hubs'],
    title: 'LabSetu | Partner Reference Hubs',
    navLabel: 'Reference Hubs',
  },
  'labs-verify': {
    tab: 'labs-verify',
    path: '/dashboard/labs/verify',
    aliases: ['/dashboard/verify-labs', '/verify-labs', '/dashboard/verification'],
    title: 'LabSetu | Lab Document Verification',
    navLabel: 'Doc Verification',
  },
  phlebotomists: {
    tab: 'phlebotomists',
    path: '/dashboard/phlebotomists',
    aliases: ['/phlebotomists', '/dashboard/phlebos', '/dashboard/riders'],
    title: 'LabSetu | Phlebotomists Fleet',
    navLabel: 'Phlebotomists',
  },
  'inventory-kits': {
    tab: 'inventory-kits',
    path: '/dashboard/inventory-kits',
    aliases: ['/inventory-kits', '/dashboard/kits', '/kits', '/dashboard/vacutainers', '/vacutainers'],
    title: 'LabSetu | Central Vacutainers & Kit Supply Chain',
    navLabel: 'Kits & Vacutainers',
  },
  samples: {
    tab: 'samples',
    path: '/dashboard/samples',
    aliases: ['/samples', '/dashboard/specimens', '/dashboard/cold-chain'],
    title: 'LabSetu | Specimen Custody Chain',
    navLabel: 'Specimen Custody',
  },
  reports: {
    tab: 'reports',
    path: '/dashboard/reports',
    aliases: ['/reports', '/dashboard/diagnostic-reports'],
    title: 'LabSetu | Diagnostic Reports Audit',
    navLabel: 'Diagnostic Reports',
  },
  payments: {
    tab: 'payments',
    path: '/dashboard/payments',
    aliases: ['/payments', '/dashboard/reconciliation'],
    title: 'LabSetu | Payment Reconciliation',
    navLabel: 'Reconciliation',
  },
  commission: {
    tab: 'commission',
    path: '/dashboard/commission',
    aliases: ['/commission', '/dashboard/commissions'],
    title: 'LabSetu | Commercial Commission Matrix',
    navLabel: 'Commission Matrix',
  },
  zones: {
    tab: 'zones',
    path: '/dashboard/zones',
    aliases: ['/zones', '/dashboard/service-zones', '/dashboard/area-expansion'],
    title: 'LabSetu | Service Zones & Pincode Coverage',
    navLabel: 'Service Zones',
  },
  'master-data': {
    tab: 'master-data',
    path: '/dashboard/catalogue',
    aliases: ['/catalogue', '/dashboard/master-data', '/dashboard/master-catalogue'],
    title: 'LabSetu | Master Test Catalogue',
    navLabel: 'Master Catalogue',
  },
  users: {
    tab: 'users',
    path: '/dashboard/users',
    aliases: ['/users', '/dashboard/roles'],
    title: 'LabSetu | Platform Users & Access',
    navLabel: 'Platform Users',
  },
  employees: {
    tab: 'employees',
    path: '/dashboard/employees',
    aliases: ['/employees', '/dashboard/hr'],
    title: 'LabSetu | Employee Directory & Onboarding',
    navLabel: 'Employees & HR',
  },
  'org-structure': {
    tab: 'org-structure',
    path: '/dashboard/org-structure',
    aliases: ['/org-structure', '/dashboard/org', '/dashboard/founders'],
    title: 'LabSetu | Organization Structure & Teams',
    navLabel: 'Org Structure',
  },
  'finance-ops': {
    tab: 'finance-ops',
    path: '/dashboard/finance-ops',
    aliases: ['/finance-ops', '/dashboard/finance'],
    title: 'LabSetu | Finance Operations & Ledgers',
    navLabel: 'Finance Operations',
  },
  'marketing-growth': {
    tab: 'marketing-growth',
    path: '/dashboard/marketing-growth',
    aliases: ['/marketing-growth', '/dashboard/marketing'],
    title: 'LabSetu | Marketing Campaigns & Growth',
    navLabel: 'Marketing & Growth',
  },
  'product-tech': {
    tab: 'product-tech',
    path: '/dashboard/product-tech',
    aliases: ['/product-tech', '/dashboard/tech'],
    title: 'LabSetu | Product Roadmap & Tech Health',
    navLabel: 'Product & Tech',
  },
  'audit-logs': {
    tab: 'audit-logs',
    path: '/dashboard/audit-logs',
    aliases: ['/audit-logs', '/dashboard/audit', '/dashboard/logs'],
    title: 'LabSetu | Platform Audit Logs',
    navLabel: 'Security Audit',
  },
  analytics: {
    tab: 'analytics',
    path: '/dashboard/analytics',
    aliases: ['/analytics', '/dashboard/insights'],
    title: 'LabSetu | Platform Business Analytics',
    navLabel: 'Analytics',
  },
  settings: {
    tab: 'settings',
    path: '/dashboard/settings',
    aliases: ['/settings', '/dashboard/config'],
    title: 'LabSetu | Platform Settings',
    navLabel: 'Settings',
  },
};

export function resolveAdminTab(pathname: string): AdminTab {
  const clean = (pathname || '').trim().toLowerCase().replace(/\/+$/, '') || '/';
  for (const meta of Object.values(ADMIN_ROUTES)) {
    if (meta.path === clean) return meta.tab;
    if (meta.aliases?.some((a) => a === clean)) return meta.tab;
  }
  return 'dashboard';
}

export function getAdminPath(tab: AdminTab): string {
  return ADMIN_ROUTES[tab]?.path || '/dashboard';
}

export function getAdminTitle(tab: AdminTab): string {
  return ADMIN_ROUTES[tab]?.title || 'LabSetu | Admin Control Tower';
}

// ==========================================
// LARGE REFERENCE LAB ROUTE MAPPINGS
// ==========================================
export const LARGE_LAB_ROUTES: Record<LargeLabTab, DashboardRouteMeta<LargeLabTab>> = {
  dashboard: {
    tab: 'dashboard',
    path: '/dashboard',
    aliases: ['/dashboard/overview', '/overview'],
    title: 'LabSetu | Reference Lab Hub',
    navLabel: 'Dashboard',
  },
  incoming: {
    tab: 'incoming',
    path: '/dashboard/incoming',
    aliases: ['/incoming', '/dashboard/incoming-batches'],
    title: 'LabSetu | Incoming Specimen Batches',
    navLabel: 'Incoming Batches',
  },
  testing: {
    tab: 'testing',
    path: '/dashboard/testing',
    aliases: ['/testing', '/dashboard/in-testing'],
    title: 'LabSetu | In-Testing Specimens',
    navLabel: 'In-Testing',
  },
  reports: {
    tab: 'reports',
    path: '/dashboard/reports',
    aliases: ['/reports', '/dashboard/report-entry'],
    title: 'LabSetu | Diagnostic Reports Entry',
    navLabel: 'Reports & Entry',
  },
  rates: {
    tab: 'rates',
    path: '/dashboard/rates',
    aliases: ['/rates', '/dashboard/rate-sheet', '/dashboard/b2b-rates'],
    title: 'LabSetu | Custom B2B Rate Sheet',
    navLabel: 'B2B Rate Sheet',
  },
  settlements: {
    tab: 'settlements',
    path: '/dashboard/settlements',
    aliases: ['/settlements', '/dashboard/receivables'],
    title: 'LabSetu | Financial Settlements',
    navLabel: 'Settlements',
  },
  analytics: {
    tab: 'analytics',
    path: '/dashboard/analytics',
    aliases: ['/analytics', '/dashboard/tat'],
    title: 'LabSetu | Reference Lab Analytics',
    navLabel: 'TAT & Analytics',
  },
  settings: {
    tab: 'settings',
    path: '/dashboard/settings',
    aliases: ['/settings', '/dashboard/facility'],
    title: 'LabSetu | Reference Facility Settings',
    navLabel: 'Facility Settings',
  },
};

export function resolveLargeLabTab(pathname: string): LargeLabTab {
  const clean = (pathname || '').trim().toLowerCase().replace(/\/+$/, '') || '/';
  for (const meta of Object.values(LARGE_LAB_ROUTES)) {
    if (meta.path === clean) return meta.tab;
    if (meta.aliases?.some((a) => a === clean)) return meta.tab;
  }
  return 'dashboard';
}

export function getLargeLabPath(tab: LargeLabTab): string {
  return LARGE_LAB_ROUTES[tab]?.path || '/dashboard';
}

export function getLargeLabTitle(tab: LargeLabTab): string {
  return LARGE_LAB_ROUTES[tab]?.title || 'LabSetu | Reference Lab Hub';
}

