import {
  type CoreDepartmentId,
  type DepartmentRecord,
  type DesignationRecord,
  type FounderRoleCode,
  type FounderSeatKey,
  type FounderSeatRecord,
  type PermissionCode,
  type PermissionDefinition,
} from '../types/org.js';
import { type AdminTeamRole, type UserCustomClaims, type UserProfile, UserRole } from '../types/user.js';

export const DEFAULT_SUPER_ADMIN_EMAIL = 'lab.setu.admin@gmail.com';

export const FOUNDER_ROLE_LABELS: Record<FounderRoleCode, string> = {
  SUPER_ADMIN: 'Super Admin',
  FINANCE_BUSINESS_HEAD: 'Finance & Business Head',
  OPERATIONS_PARTNERSHIPS_HEAD: 'Operations & Partnerships Head',
  MARKETING_GROWTH_HEAD: 'Marketing & Growth Head',
  PRODUCT_TECHNOLOGY_HEAD: 'Product & Technology Head',
};

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  // Organisation & Super Admin
  {
    code: 'FULL_PLATFORM_CONTROL',
    label: 'Full Platform Control (Super Admin)',
    group: 'ORGANISATION',
    sensitive: true,
    description: 'Complete administrative authority across all departments, users, approvals, and settings.',
  },
  {
    code: 'VIEW_SUPER_ADMIN_DASHBOARD',
    label: 'View Super Admin Command Center',
    group: 'ORGANISATION',
    description: 'Access executive cross-department KPIs, department switcher, and consolidated platform status.',
  },
  {
    code: 'MANAGE_DEPARTMENTS',
    label: 'Manage Departments & Reporting Heads',
    group: 'ORGANISATION',
    sensitive: true,
    description: 'Create, edit, activate/deactivate departments and assign department heads.',
  },
  {
    code: 'MANAGE_DESIGNATIONS',
    label: 'Manage Future Designations',
    group: 'ORGANISATION',
    description: 'Configure designation catalog, responsibilities, and default permission bundles.',
  },
  {
    code: 'MANAGE_EMPLOYEES',
    label: 'Manage Employees & Transfers',
    group: 'ORGANISATION',
    sensitive: true,
    description: 'Add, edit, transfer, deactivate employees and manage explicit permission grants.',
  },
  {
    code: 'MANAGE_FOUNDER_SEATS',
    label: 'Manage Founder Seats & Transfers',
    group: 'ORGANISATION',
    sensitive: true,
    description: 'Bind founder seats to email accounts or safely transfer Super Admin access.',
  },
  {
    code: 'APPROVE_SENSITIVE_ACTIONS',
    label: 'Approve Sensitive Platform Actions',
    group: 'ORGANISATION',
    sensitive: true,
    description: 'Human review approval for refunds, verification decisions, and exceptional actions.',
  },
  {
    code: 'VIEW_AUDIT_LOGS',
    label: 'View Immutable Audit Logs',
    group: 'ORGANISATION',
    description: 'Inspect platform activity trails across departments, staff, and automation runs.',
  },
  {
    code: 'VIEW_LOGIN_HISTORY',
    label: 'View Login & Session History',
    group: 'ORGANISATION',
    description: 'Review user sign-in logs across web portals and mobile app.',
  },

  // Finance & Business
  {
    code: 'VIEW_FINANCE_DASHBOARD',
    label: 'View Finance & Business Workspace',
    group: 'FINANCE_BUSINESS',
    description: 'Access revenue, expenses, budgets, subscription billing, and financial summaries.',
  },
  {
    code: 'MANAGE_SUBSCRIPTIONS',
    label: 'Manage Plans & Lab Subscriptions',
    group: 'FINANCE_BUSINESS',
    description: 'Configure LabSetu subscription plans, cycles, renewal reminders, and active lab plans.',
  },
  {
    code: 'MANAGE_INVOICES',
    label: 'Generate & Manage Subscription Invoices',
    group: 'FINANCE_BUSINESS',
    description: 'Create and track subscription invoices, platform fee bills, and overdue follow-ups.',
  },
  {
    code: 'VIEW_PAYMENT_RECORDS',
    label: 'View Payment & Gateway Records',
    group: 'FINANCE_BUSINESS',
    sensitive: true,
    description: 'Inspect Razorpay payment records, webhook confirmations, and receipt metadata.',
  },
  {
    code: 'MANAGE_EXPENSES_BUDGETS',
    label: 'Manage Expenses & Budgets',
    group: 'FINANCE_BUSINESS',
    description: 'Track business expenses, approve expense entries, and maintain department budgets.',
  },
  {
    code: 'MANAGE_RECONCILIATION',
    label: 'Manage Payment Reconciliation & Alerts',
    group: 'FINANCE_BUSINESS',
    sensitive: true,
    description: 'Match gateway settlements, resolve unmatched alerts, and prevent duplicate charges.',
  },
  {
    code: 'APPROVE_REFUNDS',
    label: 'Approve or Reject Refund Requests',
    group: 'FINANCE_BUSINESS',
    sensitive: true,
    description: 'Human-reviewed approval workflow for partner refund requests.',
  },
  {
    code: 'CONFIGURE_COMMISSIONS_PAYOUTS',
    label: 'Configure Future Commission & Split Rules',
    group: 'FINANCE_BUSINESS',
    sensitive: true,
    description: 'Maintain configurable commission, courier fee, and future payout settings.',
  },
  {
    code: 'VIEW_FINANCIAL_REPORTS',
    label: 'Export Monthly, Yearly & CA Review Reports',
    group: 'FINANCE_BUSINESS',
    description: 'Generate financial summaries and tax/accounting workbooks for CA review.',
  },

  // Operations & Partnerships
  {
    code: 'VIEW_OPERATIONS_DASHBOARD',
    label: 'View Operations & Partnerships Workspace',
    group: 'OPERATIONS_PARTNERSHIPS',
    description: 'Monitor live bookings, phlebotomist dispatch, onboarding, and operational exceptions.',
  },
  {
    code: 'MANAGE_BOOKINGS_DISPATCH',
    label: 'Manage Bookings & Phlebo Dispatch',
    group: 'OPERATIONS_PARTNERSHIPS',
    description: 'Track sample pickups, manage phlebo assignment exceptions, and dispatch escalations.',
  },
  {
    code: 'MANAGE_PHLEBO_NETWORK',
    label: 'Manage Field Phlebotomist Network',
    group: 'OPERATIONS_PARTNERSHIPS',
    description: 'Manage field phlebotomists, shift readiness, eligibility, and cold-chain compliance.',
  },
  {
    code: 'MANAGE_LAB_PARTNERSHIPS',
    label: 'Manage Partner Labs & Centers',
    group: 'OPERATIONS_PARTNERSHIPS',
    description: 'Manage small collection labs, large reference labs, branches, and partner coordination.',
  },
  {
    code: 'MANAGE_ONBOARDING',
    label: 'Manage Lab & Phlebo Onboarding',
    group: 'OPERATIONS_PARTNERSHIPS',
    description: 'Track partner onboarding milestones from application to live activation.',
  },
  {
    code: 'MANAGE_VERIFICATION',
    label: 'Approve Partner Verification Decisions',
    group: 'OPERATIONS_PARTNERSHIPS',
    sensitive: true,
    description: 'Perform authorised human verification decisions after document inspection.',
  },
  {
    code: 'VIEW_IDENTITY_DOCS',
    label: 'View Partner KYC & Identity Documents',
    group: 'OPERATIONS_PARTNERSHIPS',
    sensitive: true,
    description: 'Restricted permission to inspect NABL certificates, licenses, and courier KYC docs.',
  },
  {
    code: 'MANAGE_TRAINING',
    label: 'Manage Training & Assessments',
    group: 'OPERATIONS_PARTNERSHIPS',
    description: 'Assign and verify operational training completion for phlebotomists and lab staff.',
  },
  {
    code: 'MANAGE_SUPPORT_TICKETS',
    label: 'Manage Operational Support & Escalations',
    group: 'OPERATIONS_PARTNERSHIPS',
    description: 'Handle partner/courier support tickets, SLA timers, and head escalations.',
  },
  {
    code: 'MANAGE_OPERATIONAL_QUALITY',
    label: 'Manage Operational Sample Quality',
    group: 'OPERATIONS_PARTNERSHIPS',
    description: 'Oversee sample handling quality, temperature excursions, and logistics compliance.',
  },
  {
    code: 'VIEW_MEDICAL_REPORTS',
    label: 'Access Verified Diagnostic Report Files',
    group: 'OPERATIONS_PARTNERSHIPS',
    sensitive: true,
    description: 'Restricted permission to inspect uploaded lab report metadata and PDF documents.',
  },
  {
    code: 'VIEW_PATIENT_METADATA',
    label: 'Access De-Identified Patient Records',
    group: 'OPERATIONS_PARTNERSHIPS',
    sensitive: true,
    description: 'Restricted permission to inspect patient booking records when operationally needed.',
  },

  // Operations - Inventory, Central Warehouse & Kit Management
  {
    code: 'VIEW_INVENTORY_DASHBOARD',
    label: 'View Inventory & Warehouse Operations',
    group: 'OPERATIONS_PARTNERSHIPS',
    description: 'Access warehouse stock levels, stock movement ledgers, valuation, and kit statuses.',
  },
  {
    code: 'MANAGE_INVENTORY_MASTER',
    label: 'Manage Inventory Items, Suppliers & BOMs',
    group: 'OPERATIONS_PARTNERSHIPS',
    description: 'Create and update items, categories, supplier barcodes, kit recipes, and BOM versions.',
  },
  {
    code: 'MANAGE_STOCK_INWARD',
    label: 'Process Supplier Stock Inward & Conversion',
    group: 'OPERATIONS_PARTNERSHIPS',
    description: 'Inward purchase shipments, scan supplier barcodes, convert carton/pack to units, and record batches.',
  },
  {
    code: 'MANAGE_CENTRAL_WAREHOUSE',
    label: 'Manage Central Warehouse Locations & Stock',
    group: 'OPERATIONS_PARTNERSHIPS',
    description: 'Oversee physical bins, racks, multi-warehouse stock allocations, and inventory audits.',
  },
  {
    code: 'ASSEMBLE_DIAGNOSTIC_KITS',
    label: 'Assemble Central Warehouse Diagnostic Kits',
    group: 'OPERATIONS_PARTNERSHIPS',
    description: 'Execute kit production runs, serialize kits & tubes, print barcodes, and auto-deduct loose BOM stock.',
  },
  {
    code: 'ISSUE_KITS_TO_PHLEBO',
    label: 'Issue Diagnostic Kits to Phlebotomists',
    group: 'OPERATIONS_PARTNERSHIPS',
    description: 'Scan kit barcodes to assign and issue pre-assembled kits to field phlebotomists.',
  },
  {
    code: 'INSPECT_KIT_RETURNS',
    label: 'Inspect & Process Phlebotomist Kit Returns',
    group: 'OPERATIONS_PARTNERSHIPS',
    description: 'Inspect returned/unused kits, verify integrity, restock intact tubes, or mark damaged/expired.',
  },
  {
    code: 'MANAGE_STOCK_ADJUSTMENTS',
    label: 'Authorize Stock Write-offs & Adjustments',
    group: 'OPERATIONS_PARTNERSHIPS',
    sensitive: true,
    description: 'Perform ledger-backed stock write-offs, variance corrections, and shrinkage adjustments.',
  },
  {
    code: 'VIEW_INVENTORY_VALUATION',
    label: 'View Inventory Asset Valuation & Costs',
    group: 'OPERATIONS_PARTNERSHIPS',
    description: 'Inspect stock valuation, weighted average costs, and kit production costs.',
  },
  {
    code: 'VIEW_TRACEABILITY_AUDIT',
    label: 'View Complete Specimen & Tube Audit Trail',
    group: 'OPERATIONS_PARTNERSHIPS',
    sensitive: true,
    description: 'Track complete end-to-end custody chain from supplier batch, kit assembly, to patient sample handover.',
  },

  // Marketing & Growth
  {
    code: 'VIEW_MARKETING_DASHBOARD',
    label: 'View Marketing & Growth Workspace',
    group: 'MARKETING_GROWTH',
    description: 'Access leads pipeline, campaign performance, and geographic growth analytics.',
  },
  {
    code: 'MANAGE_LEADS',
    label: 'Manage Leads & Follow-Up Reminders',
    group: 'MARKETING_GROWTH',
    description: 'Track B2B lab leads, conversion stages, and automated follow-up reminders.',
  },
  {
    code: 'MANAGE_CAMPAIGNS',
    label: 'Manage Marketing Campaigns & Budget Spend',
    group: 'MARKETING_GROWTH',
    description: 'Create and monitor field, referral, and digital acquisition campaigns.',
  },
  {
    code: 'VIEW_GROWTH_ANALYTICS',
    label: 'View Acquisition & Area-Wise Growth Reports',
    group: 'MARKETING_GROWTH',
    description: 'Analyze city/zone acquisition metrics and funnel conversion rates.',
  },
  {
    code: 'MANAGE_FIELD_ACQUISITION',
    label: 'Coordinate Field Acquisition Pipeline',
    group: 'MARKETING_GROWTH',
    description: 'Manage territory assignment and field visit follow-ups for partner onboarding leads.',
  },

  // Product & Technology
  {
    code: 'VIEW_TECH_DASHBOARD',
    label: 'View Product & Technology Workspace',
    group: 'PRODUCT_TECHNOLOGY',
    description: 'Access engineering operations, portal/mobile status, security matrix, and health.',
  },
  {
    code: 'MANAGE_SYSTEM_SECURITY',
    label: 'Manage System Security & Access Controls',
    group: 'PRODUCT_TECHNOLOGY',
    sensitive: true,
    description: 'Inspect and maintain backend security rules, role policies, and token controls.',
  },
  {
    code: 'VIEW_APP_ERROR_LOGS',
    label: 'Inspect Application Error Logs',
    group: 'PRODUCT_TECHNOLOGY',
    description: 'Review frontend, mobile app, API, and webhook execution error logs.',
  },
  {
    code: 'MANAGE_SYSTEM_HEALTH',
    label: 'Monitor System Health & Services',
    group: 'PRODUCT_TECHNOLOGY',
    description: 'Run and track availability checks across authentication, storage, database, and email.',
  },
  {
    code: 'MANAGE_SOFTWARE_QA',
    label: 'Manage Software QA & Automated Testing',
    group: 'PRODUCT_TECHNOLOGY',
    description: 'Track software testing suites, release readiness, and QA verification (distinct from ops quality).',
  },
  {
    code: 'MANAGE_BACKUPS',
    label: 'Monitor Backup & Recovery Verification',
    group: 'PRODUCT_TECHNOLOGY',
    sensitive: true,
    description: 'Record and verify database snapshots, rules backups, and recovery readiness.',
  },
  {
    code: 'MANAGE_TECH_ISSUES',
    label: 'Manage Technical Issues & Bug Triage',
    group: 'PRODUCT_TECHNOLOGY',
    description: 'Log, assign, and resolve portal, mobile app, and API engineering issues.',
  },
  {
    code: 'MANAGE_TEST_CATALOG',
    label: 'Manage Master Diagnostic Test Catalog',
    group: 'PRODUCT_TECHNOLOGY',
    description: 'Maintain master diagnostic test panels, specimen tubes, and platform parameters.',
  },
  {
    code: 'MANAGE_SETTINGS',
    label: 'Manage Platform Configuration & Alert Settings',
    group: 'PRODUCT_TECHNOLOGY',
    description: 'Configure SLA thresholds, broadcast radius defaults, and email template toggles.',
  },
];

export const ALL_PERMISSION_CODES: PermissionCode[] = PERMISSION_CATALOG.map((p) => p.code);

export const FINANCE_HEAD_PERMISSIONS: PermissionCode[] = [
  'VIEW_FINANCE_DASHBOARD',
  'MANAGE_SUBSCRIPTIONS',
  'MANAGE_INVOICES',
  'VIEW_PAYMENT_RECORDS',
  'MANAGE_EXPENSES_BUDGETS',
  'MANAGE_RECONCILIATION',
  'APPROVE_REFUNDS',
  'CONFIGURE_COMMISSIONS_PAYOUTS',
  'VIEW_FINANCIAL_REPORTS',
  'APPROVE_SENSITIVE_ACTIONS',
  'VIEW_AUDIT_LOGS',
];

export const OPERATIONS_HEAD_PERMISSIONS: PermissionCode[] = [
  'VIEW_OPERATIONS_DASHBOARD',
  'MANAGE_BOOKINGS_DISPATCH',
  'MANAGE_PHLEBO_NETWORK',
  'MANAGE_LAB_PARTNERSHIPS',
  'MANAGE_ONBOARDING',
  'MANAGE_VERIFICATION',
  'VIEW_IDENTITY_DOCS',
  'MANAGE_TRAINING',
  'MANAGE_SUPPORT_TICKETS',
  'MANAGE_OPERATIONAL_QUALITY',
  'VIEW_MEDICAL_REPORTS',
  'VIEW_PATIENT_METADATA',
  'VIEW_INVENTORY_DASHBOARD',
  'MANAGE_INVENTORY_MASTER',
  'MANAGE_STOCK_INWARD',
  'MANAGE_CENTRAL_WAREHOUSE',
  'ASSEMBLE_DIAGNOSTIC_KITS',
  'ISSUE_KITS_TO_PHLEBO',
  'INSPECT_KIT_RETURNS',
  'MANAGE_STOCK_ADJUSTMENTS',
  'VIEW_INVENTORY_VALUATION',
  'VIEW_TRACEABILITY_AUDIT',
  'APPROVE_SENSITIVE_ACTIONS',
  'VIEW_AUDIT_LOGS',
];

export const MARKETING_HEAD_PERMISSIONS: PermissionCode[] = [
  'VIEW_MARKETING_DASHBOARD',
  'MANAGE_LEADS',
  'MANAGE_CAMPAIGNS',
  'VIEW_GROWTH_ANALYTICS',
  'MANAGE_FIELD_ACQUISITION',
  'VIEW_AUDIT_LOGS',
];

export const PRODUCT_TECH_HEAD_PERMISSIONS: PermissionCode[] = [
  'VIEW_TECH_DASHBOARD',
  'MANAGE_SYSTEM_SECURITY',
  'VIEW_APP_ERROR_LOGS',
  'MANAGE_SYSTEM_HEALTH',
  'MANAGE_SOFTWARE_QA',
  'MANAGE_BACKUPS',
  'MANAGE_TECH_ISSUES',
  'MANAGE_TEST_CATALOG',
  'MANAGE_SETTINGS',
  'VIEW_AUDIT_LOGS',
  'VIEW_LOGIN_HISTORY',
];

export const LEGACY_SUBROLE_PERMISSIONS: Record<AdminTeamRole, PermissionCode[]> = {
  SUPER_ADMIN: ALL_PERMISSION_CODES,
  FINANCE_B2B: FINANCE_HEAD_PERMISSIONS,
  FINANCE_BUSINESS_HEAD: FINANCE_HEAD_PERMISSIONS,
  OPS_DISPATCH: OPERATIONS_HEAD_PERMISSIONS,
  OPERATIONS_PARTNERSHIPS_HEAD: OPERATIONS_HEAD_PERMISSIONS,
  CATALOG_LABS: [
    'VIEW_OPERATIONS_DASHBOARD',
    'MANAGE_LAB_PARTNERSHIPS',
    'MANAGE_ONBOARDING',
    'MANAGE_VERIFICATION',
    'VIEW_IDENTITY_DOCS',
    'MANAGE_TEST_CATALOG',
    'VIEW_AUDIT_LOGS',
  ],
  MARKETING_GROWTH_HEAD: MARKETING_HEAD_PERMISSIONS,
  MARKETING_EXECUTIVE: [
    'VIEW_MARKETING_DASHBOARD',
    'MANAGE_LEADS',
    'MANAGE_CAMPAIGNS',
    'VIEW_GROWTH_ANALYTICS',
    'MANAGE_FIELD_ACQUISITION',
    'MANAGE_ONBOARDING',
    'MANAGE_VERIFICATION',
    'VIEW_IDENTITY_DOCS',
  ],
  PRODUCT_TECHNOLOGY_HEAD: PRODUCT_TECH_HEAD_PERMISSIONS,
  DEPARTMENT_EMPLOYEE: [],
};

const SEED_TS = '2026-11-11T00:00:00.000Z';

export const DEFAULT_DEPARTMENTS: DepartmentRecord[] = [
  {
    id: 'FINANCE_BUSINESS',
    code: 'FINANCE_BUSINESS',
    name: 'Finance & Business',
    shortName: 'Finance',
    description:
      'Subscription invoicing, platform fees, Razorpay webhook reconciliation, expenses, budgets, refunds, and CA-review financial reporting.',
    headFounderKey: 'ASHWANI',
    headName: 'Ashwani',
    reportsTo: 'SUPER_ADMIN',
    isActive: true,
    isCoreDepartment: true,
    defaultPermissions: FINANCE_HEAD_PERMISSIONS,
    responsibilities: [
      'Subscription invoice generation & renewal tracking',
      'Platform fee calculation & Razorpay webhook reconciliation',
      'Duplicate payment prevention & unmatched transaction resolution',
      'Expense tracking, business budgets & financial planning',
      'Human-approved refund workflows & CA-review tax/accounting reports',
    ],
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  },
  {
    id: 'OPERATIONS_PARTNERSHIPS',
    code: 'OPERATIONS_PARTNERSHIPS',
    name: 'Operations & Partnerships',
    shortName: 'Operations',
    description:
      'Live booking monitoring, automatic phlebotomist dispatch oversight, lab partnerships, onboarding, document verification, training, support & operational quality.',
    headFounderKey: 'AKASH',
    headName: 'Akash',
    reportsTo: 'SUPER_ADMIN',
    isActive: true,
    isCoreDepartment: true,
    defaultPermissions: OPERATIONS_HEAD_PERMISSIONS,
    responsibilities: [
      'Automatic phlebotomist assignment monitoring & unassigned alerts',
      'Pickup/drop-off SLA tracking & delay/cancellation alerts',
      'Small & Large Lab partnerships, onboarding & training supervision',
      'Authorised document review & human verification approvals',
      'Support tickets, escalations & operational cold-chain quality oversight',
    ],
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  },
  {
    id: 'MARKETING_GROWTH',
    code: 'MARKETING_GROWTH',
    name: 'Marketing & Growth',
    shortName: 'Marketing',
    description:
      'Small lab acquisition, B2B lead pipeline, automated follow-up reminders, campaign tracking, field growth & area conversion analytics.',
    headFounderKey: 'VISHAL',
    headName: 'Vishal',
    reportsTo: 'SUPER_ADMIN',
    isActive: true,
    isCoreDepartment: true,
    defaultPermissions: MARKETING_HEAD_PERMISSIONS,
    responsibilities: [
      'B2B Lead & business development pipeline management',
      'Automated follow-up reminder tracking & conversion analytics',
      'Small lab acquisition & area-wise growth reporting',
      'Field acquisition coordination, branding & campaigns',
    ],
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  },
  {
    id: 'PRODUCT_TECHNOLOGY',
    code: 'PRODUCT_TECHNOLOGY',
    name: 'Product & Technology',
    shortName: 'Product & Tech',
    description:
      'Website, partner portals, Phlebo mobile app, cloud backend & database architecture, security & permissions, error logs, system health, software QA & backups.',
    headFounderKey: 'VIKAS',
    headName: 'Vikas',
    headEmail: DEFAULT_SUPER_ADMIN_EMAIL,
    reportsTo: 'SUPER_ADMIN',
    isActive: true,
    isCoreDepartment: true,
    defaultPermissions: PRODUCT_TECH_HEAD_PERMISSIONS,
    responsibilities: [
      'Website, Admin Control Tower & Partner Portals engineering',
      'Field Phlebotomist mobile app engineering & release oversight',
      'Cloud backend, security rules, RBAC permissions & health monitoring',
      'Application error logs, backups, technical issues & Software QA testing',
    ],
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  },
];

export function buildDefaultFounderSeats(rootAdminEmail = DEFAULT_SUPER_ADMIN_EMAIL): FounderSeatRecord[] {
  const cleanRoot = rootAdminEmail.trim().toLowerCase();
  return [
    {
      seatKey: 'VIKAS',
      founderName: 'Vikas',
      title: 'Super Admin & Product & Technology Head',
      founderRoles: ['SUPER_ADMIN', 'PRODUCT_TECHNOLOGY_HEAD'],
      isSuperAdmin: true,
      primaryDepartmentId: 'PRODUCT_TECHNOLOGY',
      departmentIds: [
        'PRODUCT_TECHNOLOGY',
        'FINANCE_BUSINESS',
        'OPERATIONS_PARTNERSHIPS',
        'MARKETING_GROWTH',
      ],
      assignedEmail: cleanRoot,
      seatStatus: 'ACTIVE',
      reportsTo: 'ROOT_OWNER',
      responsibilities: [
        'Complete platform visibility & administrative authority across all departments',
        'Website, Partner Portals & Phlebo Mobile App development',
        'Backend architecture, system security & RBAC governance',
        'Application error logs, system health, Software QA & backup monitoring',
      ],
      permissions: ALL_PERMISSION_CODES,
      notes: 'Active root founder account at launch. Coexists as Super Admin and Product & Technology Head.',
      createdAt: SEED_TS,
      updatedAt: SEED_TS,
    },
    {
      seatKey: 'ASHWANI',
      founderName: 'Ashwani',
      title: 'Finance & Business Head',
      founderRoles: ['FINANCE_BUSINESS_HEAD'],
      isSuperAdmin: false,
      primaryDepartmentId: 'FINANCE_BUSINESS',
      departmentIds: ['FINANCE_BUSINESS'],
      seatStatus: 'AWAITING_EMAIL_ASSIGNMENT',
      reportsTo: 'SUPER_ADMIN',
      responsibilities: [
        'Subscription invoices, platform fees & Razorpay webhook verification',
        'Payment reconciliation, unmatched alerts & duplicate prevention',
        'Expenses, department budgets & CA-review financial reporting',
        'Human approval for refunds, financial adjustments & exception reviews',
      ],
      permissions: FINANCE_HEAD_PERMISSIONS,
      notes: 'Seat ready. Assign Ashwani real email when ready to activate login.',
      createdAt: SEED_TS,
      updatedAt: SEED_TS,
    },
    {
      seatKey: 'AKASH',
      founderName: 'Akash',
      title: 'Operations & Partnerships Head',
      founderRoles: ['OPERATIONS_PARTNERSHIPS_HEAD'],
      isSuperAdmin: false,
      primaryDepartmentId: 'OPERATIONS_PARTNERSHIPS',
      departmentIds: ['OPERATIONS_PARTNERSHIPS'],
      seatStatus: 'AWAITING_EMAIL_ASSIGNMENT',
      reportsTo: 'SUPER_ADMIN',
      responsibilities: [
        'Automatic phlebotomist dispatch monitoring & assignment exception resolution',
        'Small & Large Lab partnerships, coordination & cold-chain SLA oversight',
        'Partner onboarding, document verification approvals & training oversight',
        'Support tickets, escalations & operational quality supervision',
      ],
      permissions: OPERATIONS_HEAD_PERMISSIONS,
      notes: 'Seat ready. Assign Akash real email when ready to activate login.',
      createdAt: SEED_TS,
      updatedAt: SEED_TS,
    },
    {
      seatKey: 'VISHAL',
      founderName: 'Vishal',
      title: 'Marketing & Growth Head',
      founderRoles: ['MARKETING_GROWTH_HEAD'],
      isSuperAdmin: false,
      primaryDepartmentId: 'MARKETING_GROWTH',
      departmentIds: ['MARKETING_GROWTH'],
      seatStatus: 'AWAITING_EMAIL_ASSIGNMENT',
      reportsTo: 'SUPER_ADMIN',
      responsibilities: [
        'B2B small lab acquisition & territory expansion planning',
        'Lead pipeline tracking & automated follow-up reminders',
        'Marketing campaigns, branding & field coordination',
        'Area-wise growth & lead conversion analytics',
      ],
      permissions: MARKETING_HEAD_PERMISSIONS,
      notes: 'Seat ready. Assign Vishal real email when ready to activate login.',
      createdAt: SEED_TS,
      updatedAt: SEED_TS,
    },
  ];
}

export const DEFAULT_DESIGNATIONS: DesignationRecord[] = [
  // FINANCE & BUSINESS (7)
  {
    id: 'DES-FIN-ACCOUNTS-EXEC',
    departmentId: 'FINANCE_BUSINESS',
    departmentName: 'Finance & Business',
    title: 'Accounts Executive',
    slug: 'accounts-executive',
    category: 'EXECUTIVE',
    description: 'Day-to-day ledger entries, expense verification, and vendor bookkeeping.',
    defaultResponsibilities: ['Maintain expense vouchers & ledger entries', 'Support monthly closing'],
    defaultPermissions: ['VIEW_FINANCE_DASHBOARD', 'MANAGE_EXPENSES_BUDGETS', 'VIEW_FINANCIAL_REPORTS'],
    isActive: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  },
  {
    id: 'DES-FIN-BILLING-EXEC',
    departmentId: 'FINANCE_BUSINESS',
    departmentName: 'Finance & Business',
    title: 'Billing Executive',
    slug: 'billing-executive',
    category: 'EXECUTIVE',
    description: 'Subscription invoice generation, renewal follow-ups, and outstanding invoice tracking.',
    defaultResponsibilities: ['Generate lab subscription invoices', 'Monitor renewal due dates & overdue bills'],
    defaultPermissions: ['VIEW_FINANCE_DASHBOARD', 'MANAGE_SUBSCRIPTIONS', 'MANAGE_INVOICES'],
    isActive: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  },
  {
    id: 'DES-FIN-RECON-EXEC',
    departmentId: 'FINANCE_BUSINESS',
    departmentName: 'Finance & Business',
    title: 'Payment & Reconciliation Executive',
    slug: 'payment-and-reconciliation-executive',
    category: 'EXECUTIVE',
    description: 'Matches Razorpay webhook events to invoices, investigates unmatched transactions and duplicate charges.',
    defaultResponsibilities: ['Verify Razorpay payment records', 'Investigate unmatched payment alerts'],
    defaultPermissions: ['VIEW_FINANCE_DASHBOARD', 'VIEW_PAYMENT_RECORDS', 'MANAGE_RECONCILIATION'],
    isActive: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  },
  {
    id: 'DES-FIN-FINANCE-EXEC',
    departmentId: 'FINANCE_BUSINESS',
    departmentName: 'Finance & Business',
    title: 'Finance Executive',
    slug: 'finance-executive',
    category: 'EXECUTIVE',
    description: 'General finance execution across billing, expenses, payment monitoring, and budget tracking.',
    defaultResponsibilities: ['Monitor daily collections & expenses', 'Assist with refund preparation'],
    defaultPermissions: [
      'VIEW_FINANCE_DASHBOARD',
      'MANAGE_INVOICES',
      'VIEW_PAYMENT_RECORDS',
      'MANAGE_EXPENSES_BUDGETS',
    ],
    isActive: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  },
  {
    id: 'DES-FIN-COMMISSION-EXEC',
    departmentId: 'FINANCE_BUSINESS',
    departmentName: 'Finance & Business',
    title: 'Commission & Payout Executive',
    slug: 'commission-and-payout-executive',
    category: 'EXECUTIVE',
    description: 'Manages configurable commission calculation rules and eligible phlebo/partner payout schedules when enabled.',
    defaultResponsibilities: ['Maintain commission tiers & courier payout calculations'],
    defaultPermissions: [
      'VIEW_FINANCE_DASHBOARD',
      'CONFIGURE_COMMISSIONS_PAYOUTS',
      'VIEW_PAYMENT_RECORDS',
    ],
    isActive: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  },
  {
    id: 'DES-FIN-REPORTING-EXEC',
    departmentId: 'FINANCE_BUSINESS',
    departmentName: 'Finance & Business',
    title: 'Financial Reporting Executive',
    slug: 'financial-reporting-executive',
    category: 'EXECUTIVE',
    description: 'Prepares monthly/yearly financial summaries, invoice aging reports, and CA-review tax workbooks.',
    defaultResponsibilities: ['Prepare monthly & annual statements for CA review', 'Maintain audit-ready billing exports'],
    defaultPermissions: ['VIEW_FINANCE_DASHBOARD', 'VIEW_PAYMENT_RECORDS', 'VIEW_FINANCIAL_REPORTS'],
    isActive: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  },
  {
    id: 'DES-FIN-BUSINESS-ANALYST',
    departmentId: 'FINANCE_BUSINESS',
    departmentName: 'Finance & Business',
    title: 'Business Analyst',
    slug: 'business-analyst',
    category: 'ANALYST',
    description: 'Unit economics, pricing modeling, subscription retention metrics, and budget variance analysis.',
    defaultResponsibilities: ['Analyze unit economics & budget utilization', 'Support pricing strategy'],
    defaultPermissions: ['VIEW_FINANCE_DASHBOARD', 'VIEW_FINANCIAL_REPORTS'],
    isActive: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  },

  // OPERATIONS & PARTNERSHIPS (7)
  {
    id: 'DES-OPS-EXEC',
    departmentId: 'OPERATIONS_PARTNERSHIPS',
    departmentName: 'Operations & Partnerships',
    title: 'Operations Executive',
    slug: 'operations-executive',
    category: 'EXECUTIVE',
    description: 'Monitors live bookings, unassigned pickup alerts, pickup/drop tracking, and SLA exceptions.',
    defaultResponsibilities: ['Monitor live booking dispatch', 'Resolve delay & cancellation exceptions'],
    defaultPermissions: ['VIEW_OPERATIONS_DASHBOARD', 'MANAGE_BOOKINGS_DISPATCH', 'MANAGE_SUPPORT_TICKETS'],
    isActive: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  },
  {
    id: 'DES-OPS-PHLEBO-SUPPORT',
    departmentId: 'OPERATIONS_PARTNERSHIPS',
    departmentName: 'Operations & Partnerships',
    title: 'Phlebo Support Executive',
    slug: 'phlebo-support-executive',
    category: 'SUPPORT',
    description: 'Supports field phlebotomists on route, timeout/acceptance follow-ups, shift status, and handset troubleshooting.',
    defaultResponsibilities: ['Resolve field phlebo dispatch issues', 'Track phlebo acceptance & delays'],
    defaultPermissions: [
      'VIEW_OPERATIONS_DASHBOARD',
      'MANAGE_PHLEBO_NETWORK',
      'MANAGE_BOOKINGS_DISPATCH',
      'MANAGE_SUPPORT_TICKETS',
    ],
    isActive: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  },
  {
    id: 'DES-OPS-LAB-SUPPORT',
    departmentId: 'OPERATIONS_PARTNERSHIPS',
    departmentName: 'Operations & Partnerships',
    title: 'Lab Support Executive',
    slug: 'lab-support-executive',
    category: 'SUPPORT',
    description: 'Coordinates with small collection centers and large reference hubs for sample handovers and partner tickets.',
    defaultResponsibilities: ['Handle partner lab support requests', 'Coordinate branch pickup/drop workflows'],
    defaultPermissions: [
      'VIEW_OPERATIONS_DASHBOARD',
      'MANAGE_LAB_PARTNERSHIPS',
      'MANAGE_BOOKINGS_DISPATCH',
      'MANAGE_SUPPORT_TICKETS',
    ],
    isActive: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  },
  {
    id: 'DES-OPS-ONBOARDING-EXEC',
    departmentId: 'OPERATIONS_PARTNERSHIPS',
    departmentName: 'Operations & Partnerships',
    title: 'Onboarding Executive',
    slug: 'onboarding-executive',
    category: 'EXECUTIVE',
    description: 'Manages small lab, large lab, and phlebotomist onboarding checklists until go-live.',
    defaultResponsibilities: ['Track onboarding pipelines', 'Collect facility & service radius details'],
    defaultPermissions: ['VIEW_OPERATIONS_DASHBOARD', 'MANAGE_ONBOARDING', 'MANAGE_LAB_PARTNERSHIPS'],
    isActive: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  },
  {
    id: 'DES-OPS-TRAINING-EXEC',
    departmentId: 'OPERATIONS_PARTNERSHIPS',
    departmentName: 'Operations & Partnerships',
    title: 'Training Executive',
    slug: 'training-executive',
    category: 'EXECUTIVE',
    description: 'Conducts SOP, cold-chain box, barcode scan, and portal training and tracks completion scores.',
    defaultResponsibilities: ['Track phlebo & lab SOP training completion', 'Log assessment readiness'],
    defaultPermissions: ['VIEW_OPERATIONS_DASHBOARD', 'MANAGE_TRAINING', 'MANAGE_ONBOARDING'],
    isActive: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  },
  {
    id: 'DES-OPS-VERIFICATION-EXEC',
    departmentId: 'OPERATIONS_PARTNERSHIPS',
    departmentName: 'Operations & Partnerships',
    title: 'Verification Executive',
    slug: 'verification-executive',
    category: 'EXECUTIVE',
    description: 'Authorised document reviewer for NABL certificates, lab registrations, and phlebo KYC records.',
    defaultResponsibilities: ['Review KYC & NABL accreditation uploads', 'Submit human-approved verification decisions'],
    defaultPermissions: [
      'VIEW_OPERATIONS_DASHBOARD',
      'MANAGE_VERIFICATION',
      'VIEW_IDENTITY_DOCS',
      'MANAGE_ONBOARDING',
    ],
    isActive: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  },
  {
    id: 'DES-OPS-QUALITY-EXEC',
    departmentId: 'OPERATIONS_PARTNERSHIPS',
    departmentName: 'Operations & Partnerships',
    title: 'Quality Executive',
    slug: 'quality-executive',
    category: 'QA',
    isOperationalQuality: true,
    isSoftwareQa: false,
    description: 'Operational sample quality oversight: cold-chain 2°C–8°C compliance, tube mismatch audits, and rejection root causes (separate from Tech QA Executive).',
    defaultResponsibilities: ['Monitor sample integrity & temperature excursions', 'Audit operational SLA quality'],
    defaultPermissions: [
      'VIEW_OPERATIONS_DASHBOARD',
      'MANAGE_OPERATIONAL_QUALITY',
      'MANAGE_BOOKINGS_DISPATCH',
      'VIEW_MEDICAL_REPORTS',
    ],
    isActive: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  },

  // MARKETING & GROWTH (5)
  {
    id: 'DES-MKT-FIELD-EXEC',
    departmentId: 'MARKETING_GROWTH',
    departmentName: 'Marketing & Growth',
    title: 'Field Executive',
    slug: 'field-executive',
    category: 'EXECUTIVE',
    description: 'On-ground visits to small pathology labs, clinic collection points, and diagnostic partners.',
    defaultResponsibilities: ['Conduct local lab discovery visits', 'Update field lead status & follow-ups'],
    defaultPermissions: ['VIEW_MARKETING_DASHBOARD', 'MANAGE_LEADS', 'MANAGE_FIELD_ACQUISITION'],
    isActive: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  },
  {
    id: 'DES-MKT-MARKETING-EXEC',
    departmentId: 'MARKETING_GROWTH',
    departmentName: 'Marketing & Growth',
    title: 'Marketing Executive',
    slug: 'marketing-executive',
    category: 'EXECUTIVE',
    description: 'Executes acquisition campaigns, B2B outreach funnels, and event tracking.',
    defaultResponsibilities: ['Run outreach campaigns & track ROI', 'Monitor campaign lead sources'],
    defaultPermissions: ['VIEW_MARKETING_DASHBOARD', 'MANAGE_CAMPAIGNS', 'MANAGE_LEADS'],
    isActive: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  },
  {
    id: 'DES-MKT-BD-EXEC',
    departmentId: 'MARKETING_GROWTH',
    departmentName: 'Marketing & Growth',
    title: 'Business Development Executive',
    slug: 'business-development-executive',
    category: 'EXECUTIVE',
    description: 'Owns demo calls, commercial proposals, and closing small/large diagnostic labs into active partners.',
    defaultResponsibilities: ['Drive B2B pipeline demos & conversion', 'Hand over converted leads to Operations onboarding'],
    defaultPermissions: [
      'VIEW_MARKETING_DASHBOARD',
      'MANAGE_LEADS',
      'MANAGE_FIELD_ACQUISITION',
      'VIEW_GROWTH_ANALYTICS',
    ],
    isActive: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  },
  {
    id: 'DES-MKT-GROWTH-EXEC',
    departmentId: 'MARKETING_GROWTH',
    departmentName: 'Marketing & Growth',
    title: 'Growth Executive',
    slug: 'growth-executive',
    category: 'ANALYST',
    description: 'Analyzes city/zone acquisition density, funnel conversion rates, and retention cohorts.',
    defaultResponsibilities: ['Track city-wise acquisition velocity', 'Optimize lead-to-active lab funnel'],
    defaultPermissions: ['VIEW_MARKETING_DASHBOARD', 'VIEW_GROWTH_ANALYTICS', 'MANAGE_CAMPAIGNS'],
    isActive: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  },
  {
    id: 'DES-MKT-CONTENT-BRAND',
    departmentId: 'MARKETING_GROWTH',
    departmentName: 'Marketing & Growth',
    title: 'Content & Brand Executive',
    slug: 'content-and-brand-executive',
    category: 'DESIGN',
    description: 'Creates B2B diagnostic collateral, partner onboarding kits, and brand communications.',
    defaultResponsibilities: ['Manage brand guidelines & marketing assets', 'Support campaign creatives'],
    defaultPermissions: ['VIEW_MARKETING_DASHBOARD', 'MANAGE_CAMPAIGNS'],
    isActive: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  },

  // PRODUCT & TECHNOLOGY (7)
  {
    id: 'DES-TECH-LEAD',
    departmentId: 'PRODUCT_TECHNOLOGY',
    departmentName: 'Product & Technology',
    title: 'Technical Lead',
    slug: 'technical-lead',
    category: 'HEAD',
    description: 'Architecture governance across web portals, mobile app, cloud APIs, security, and deployments.',
    defaultResponsibilities: ['Code reviews, API security & reliability engineering', 'System health & incident triage'],
    defaultPermissions: [
      'VIEW_TECH_DASHBOARD',
      'MANAGE_SYSTEM_SECURITY',
      'VIEW_APP_ERROR_LOGS',
      'MANAGE_SYSTEM_HEALTH',
      'MANAGE_SOFTWARE_QA',
      'MANAGE_BACKUPS',
      'MANAGE_TECH_ISSUES',
      'MANAGE_SETTINGS',
    ],
    isActive: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  },
  {
    id: 'DES-TECH-FRONTEND',
    departmentId: 'PRODUCT_TECHNOLOGY',
    departmentName: 'Product & Technology',
    title: 'Frontend Developer',
    slug: 'frontend-developer',
    category: 'DEVELOPER',
    description: 'Builds Admin Control Tower, Partner Portals, and responsive web workflows.',
    defaultResponsibilities: ['Maintain web portal UI & performance', 'Resolve frontend technical issues'],
    defaultPermissions: ['VIEW_TECH_DASHBOARD', 'VIEW_APP_ERROR_LOGS', 'MANAGE_TECH_ISSUES'],
    isActive: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  },
  {
    id: 'DES-TECH-BACKEND',
    departmentId: 'PRODUCT_TECHNOLOGY',
    departmentName: 'Product & Technology',
    title: 'Backend Developer',
    slug: 'backend-developer',
    category: 'DEVELOPER',
    description: 'Maintains Cloud Functions, REST APIs, webhooks, RBAC middleware, database schemas, and rules.',
    defaultResponsibilities: ['Maintain API endpoints, webhooks & database rules', 'Monitor backups & service health'],
    defaultPermissions: [
      'VIEW_TECH_DASHBOARD',
      'VIEW_APP_ERROR_LOGS',
      'MANAGE_SYSTEM_HEALTH',
      'MANAGE_BACKUPS',
      'MANAGE_TECH_ISSUES',
    ],
    isActive: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  },
  {
    id: 'DES-TECH-MOBILE',
    departmentId: 'PRODUCT_TECHNOLOGY',
    departmentName: 'Product & Technology',
    title: 'Mobile App Developer',
    slug: 'mobile-app-developer',
    category: 'DEVELOPER',
    description: 'Develops the React Native / Expo Field Phlebotomist mobile app (barcode scan, GPS, photo capture).',
    defaultResponsibilities: ['Maintain Phlebo Mobile App builds & GPS/barcode modules', 'Track mobile crash logs'],
    defaultPermissions: ['VIEW_TECH_DASHBOARD', 'VIEW_APP_ERROR_LOGS', 'MANAGE_TECH_ISSUES'],
    isActive: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  },
  {
    id: 'DES-TECH-UIUX',
    departmentId: 'PRODUCT_TECHNOLOGY',
    departmentName: 'Product & Technology',
    title: 'UI/UX Designer',
    slug: 'ui-ux-designer',
    category: 'DESIGN',
    description: 'Designs user flows, accessibility standards, design systems, and workflows across web & mobile.',
    defaultResponsibilities: ['Design web & mobile workflows', 'Track UX defects in issue tracker'],
    defaultPermissions: ['VIEW_TECH_DASHBOARD', 'MANAGE_TECH_ISSUES'],
    isActive: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  },
  {
    id: 'DES-TECH-QA-EXEC',
    departmentId: 'PRODUCT_TECHNOLOGY',
    departmentName: 'Product & Technology',
    title: 'QA Executive',
    slug: 'qa-executive-software',
    category: 'QA',
    isSoftwareQa: true,
    isOperationalQuality: false,
    description: 'Software Quality Assurance & Automated Testing across web portals, APIs, security rules, and mobile app (distinct from Operations Quality Executive).',
    defaultResponsibilities: ['Maintain automated regression & API test suites', 'Sign off software release QA checks'],
    defaultPermissions: ['VIEW_TECH_DASHBOARD', 'MANAGE_SOFTWARE_QA', 'VIEW_APP_ERROR_LOGS', 'MANAGE_TECH_ISSUES'],
    isActive: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  },
  {
    id: 'DES-TECH-IT-SUPPORT',
    departmentId: 'PRODUCT_TECHNOLOGY',
    departmentName: 'Product & Technology',
    title: 'IT Support Executive',
    slug: 'it-support-executive',
    category: 'SUPPORT',
    description: 'Internal team IT readiness, device troubleshooting, access diagnostics, and technical helpdesk.',
    defaultResponsibilities: ['Resolve internal IT & login diagnostics', 'Triage technical support escalations'],
    defaultPermissions: ['VIEW_TECH_DASHBOARD', 'VIEW_APP_ERROR_LOGS', 'MANAGE_SYSTEM_HEALTH', 'MANAGE_TECH_ISSUES'],
    isActive: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  },
];

export function isEffectiveSuperAdmin(
  profile: Partial<UserProfile> | null | undefined,
  rootAdminEmail = DEFAULT_SUPER_ADMIN_EMAIL
): boolean {
  if (!profile || profile.isActive === false) return false;
  if (profile.role !== UserRole.ADMIN) return false;
  if (profile.isSuperAdmin === true) return true;
  if (profile.founderRoles?.includes('SUPER_ADMIN')) return true;
  if (profile.adminSubRole === 'SUPER_ADMIN' && !profile.revokedSuperAdmin) return true;
  const email = profile.email?.trim().toLowerCase();
  if (email && email === rootAdminEmail.trim().toLowerCase() && !profile.revokedSuperAdmin) {
    return true;
  }
  return false;
}

export const isSuperAdminUser = isEffectiveSuperAdmin;

export function resolveEffectivePermissions(
  profile: Partial<UserProfile> | null | undefined,
  rootAdminEmail = DEFAULT_SUPER_ADMIN_EMAIL
): PermissionCode[] {
  if (!profile || profile.isActive === false || profile.role !== UserRole.ADMIN) {
    return [];
  }

  if (isEffectiveSuperAdmin(profile, rootAdminEmail)) {
    return [...ALL_PERMISSION_CODES];
  }

  const perms = new Set<PermissionCode>();

  if (Array.isArray(profile.permissions)) {
    for (const p of profile.permissions) {
      perms.add(p);
    }
  }

  if (Array.isArray(profile.founderRoles)) {
    for (const fr of profile.founderRoles) {
      if (fr === 'SUPER_ADMIN') {
        ALL_PERMISSION_CODES.forEach((p) => perms.add(p));
      } else if (fr === 'FINANCE_BUSINESS_HEAD') {
        FINANCE_HEAD_PERMISSIONS.forEach((p) => perms.add(p));
      } else if (fr === 'OPERATIONS_PARTNERSHIPS_HEAD') {
        OPERATIONS_HEAD_PERMISSIONS.forEach((p) => perms.add(p));
      } else if (fr === 'MARKETING_GROWTH_HEAD') {
        MARKETING_HEAD_PERMISSIONS.forEach((p) => perms.add(p));
      } else if (fr === 'PRODUCT_TECHNOLOGY_HEAD') {
        PRODUCT_TECH_HEAD_PERMISSIONS.forEach((p) => perms.add(p));
      }
    }
  }

  if (profile.adminSubRole && LEGACY_SUBROLE_PERMISSIONS[profile.adminSubRole]) {
    LEGACY_SUBROLE_PERMISSIONS[profile.adminSubRole].forEach((p) => perms.add(p));
  }

  return Array.from(perms);
}

export function hasPermission(
  profile: Partial<UserProfile> | null | undefined,
  permission: PermissionCode,
  rootAdminEmail = DEFAULT_SUPER_ADMIN_EMAIL
): boolean {
  if (!profile || profile.isActive === false) return false;
  if (isEffectiveSuperAdmin(profile, rootAdminEmail)) return true;
  const effective = resolveEffectivePermissions(profile, rootAdminEmail);
  return effective.includes('FULL_PLATFORM_CONTROL') || effective.includes(permission);
}

export function hasAnyPermission(
  profile: Partial<UserProfile> | null | undefined,
  permissions: PermissionCode[],
  rootAdminEmail = DEFAULT_SUPER_ADMIN_EMAIL
): boolean {
  if (!profile || profile.isActive === false) return false;
  if (isEffectiveSuperAdmin(profile, rootAdminEmail)) return true;
  const effective = resolveEffectivePermissions(profile, rootAdminEmail);
  if (effective.includes('FULL_PLATFORM_CONTROL')) return true;
  return permissions.some((p) => effective.includes(p));
}

export function canAccessDepartment(
  profile: Partial<UserProfile> | null | undefined,
  departmentId: string,
  rootAdminEmail = DEFAULT_SUPER_ADMIN_EMAIL
): boolean {
  if (!profile || profile.isActive === false || profile.role !== UserRole.ADMIN) return false;
  if (isEffectiveSuperAdmin(profile, rootAdminEmail)) return true;
  if (profile.primaryDepartmentId === departmentId) return true;
  if (Array.isArray(profile.departmentIds) && profile.departmentIds.includes(departmentId)) {
    return true;
  }
  const perms = resolveEffectivePermissions(profile, rootAdminEmail);
  if (departmentId === 'FINANCE_BUSINESS') return perms.includes('VIEW_FINANCE_DASHBOARD');
  if (departmentId === 'OPERATIONS_PARTNERSHIPS') return perms.includes('VIEW_OPERATIONS_DASHBOARD');
  if (departmentId === 'MARKETING_GROWTH') return perms.includes('VIEW_MARKETING_DASHBOARD');
  if (departmentId === 'PRODUCT_TECHNOLOGY') return perms.includes('VIEW_TECH_DASHBOARD');
  return false;
}

export function buildCompactCustomClaims(
  profile: Partial<UserProfile>,
  rootAdminEmail = DEFAULT_SUPER_ADMIN_EMAIL
): UserCustomClaims {
  const superAdmin = isEffectiveSuperAdmin(profile, rootAdminEmail);
  const role = profile.role || UserRole.SMALL_LAB;
  const claims: UserCustomClaims = { role };

  if (role === UserRole.ADMIN) {
    claims.isSuperAdmin = superAdmin;
    if (profile.adminSubRole) claims.adminSubRole = profile.adminSubRole;
    if (Array.isArray(profile.founderRoles) && profile.founderRoles.length > 0) {
      claims.founderRoles = profile.founderRoles.slice(0, 4);
    }
    if (profile.primaryDepartmentId) {
      claims.primaryDepartmentId = profile.primaryDepartmentId;
    }
    if (Array.isArray(profile.departmentIds) && profile.departmentIds.length > 0) {
      claims.departmentIds = profile.departmentIds.slice(0, 6);
    }
    if (profile.designationId) {
      claims.designationId = profile.designationId;
    }
  } else {
    if (profile.labId) claims.labId = profile.labId;
    if (role === UserRole.LARGE_LAB && profile.parentLabId) {
      claims.parentLabId = profile.parentLabId;
    }
    if (profile.phlebotomistId) claims.phlebotomistId = profile.phlebotomistId;
  }

  return claims;
}

export function getFounderSeatKeyFromRoles(roles?: FounderRoleCode[]): FounderSeatKey | undefined {
  if (!roles || roles.length === 0) return undefined;
  if (roles.includes('SUPER_ADMIN') || roles.includes('PRODUCT_TECHNOLOGY_HEAD')) return 'VIKAS';
  if (roles.includes('FINANCE_BUSINESS_HEAD')) return 'ASHWANI';
  if (roles.includes('OPERATIONS_PARTNERSHIPS_HEAD')) return 'AKASH';
  if (roles.includes('MARKETING_GROWTH_HEAD')) return 'VISHAL';
  return undefined;
}

export interface ReportingManagerResolution {
  reportingManagerName?: string;
  reportingManagerEmail?: string;
  reportsToLabel: string;
}

export function inferDepartmentIdForSubRole(adminSubRole?: AdminTeamRole): CoreDepartmentId | undefined {
  if (!adminSubRole) return undefined;
  if (adminSubRole === 'FINANCE_BUSINESS_HEAD' || adminSubRole === 'FINANCE_B2B') {
    return 'FINANCE_BUSINESS';
  }
  if (
    adminSubRole === 'OPERATIONS_PARTNERSHIPS_HEAD' ||
    adminSubRole === 'OPS_DISPATCH' ||
    adminSubRole === 'CATALOG_LABS'
  ) {
    return 'OPERATIONS_PARTNERSHIPS';
  }
  if (adminSubRole === 'MARKETING_GROWTH_HEAD') {
    return 'MARKETING_GROWTH';
  }
  if (adminSubRole === 'PRODUCT_TECHNOLOGY_HEAD' || adminSubRole === 'SUPER_ADMIN') {
    return 'PRODUCT_TECHNOLOGY';
  }
  return undefined;
}

export function resolveReportingManagerForRole(params: {
  role?: UserRole;
  adminSubRole?: AdminTeamRole;
  isSuperAdmin?: boolean;
  founderRoles?: FounderRoleCode[];
  primaryDepartmentId?: string;
  targetEmail?: string;
  departments?: Array<
    Pick<DepartmentRecord, 'id' | 'name' | 'headEmail'> & {
      headName?: string;
      shortName?: string;
    }
  >;
  founderSeats?: Array<
    Pick<
      FounderSeatRecord,
      'seatKey' | 'founderName' | 'assignedEmail' | 'isSuperAdmin' | 'founderRoles' | 'primaryDepartmentId'
    >
  >;
  rootAdminEmail?: string;
}): ReportingManagerResolution {
  const rootEmail = (params.rootAdminEmail || DEFAULT_SUPER_ADMIN_EMAIL).trim().toLowerCase();
  const seats = params.founderSeats || [];
  const depts = params.departments && params.departments.length > 0 ? params.departments : DEFAULT_DEPARTMENTS;

  const superAdminSeat =
    seats.find((s) => s.isSuperAdmin || s.founderRoles?.includes('SUPER_ADMIN')) ||
    seats.find((s) => s.seatKey === 'VIKAS');
  const superAdminEmail = (superAdminSeat?.assignedEmail || rootEmail).trim().toLowerCase();
  const superAdminName = superAdminSeat?.founderName || 'Vikas';

  const cleanTargetEmail = (params.targetEmail || '').trim().toLowerCase();
  const role = params.role ?? UserRole.ADMIN;

  if (role !== UserRole.ADMIN) {
    const opsDept = depts.find((d) => d.id === 'OPERATIONS_PARTNERSHIPS');
    const opsSeat = seats.find((s) => s.primaryDepartmentId === 'OPERATIONS_PARTNERSHIPS');
    const opsName = opsDept?.headName || opsSeat?.founderName || 'Akash';
    const opsEmail = (opsDept?.headEmail || opsSeat?.assignedEmail || superAdminEmail).trim().toLowerCase();
    return {
      reportingManagerName: opsName,
      reportingManagerEmail: opsEmail,
      reportsToLabel: `${opsName} (Operations & Partnerships Head)`,
    };
  }

  const isSuper =
    params.isSuperAdmin === true ||
    params.adminSubRole === 'SUPER_ADMIN' ||
    Boolean(params.founderRoles?.includes('SUPER_ADMIN')) ||
    Boolean(cleanTargetEmail && cleanTargetEmail === superAdminEmail);

  if (isSuper) {
    return {
      reportingManagerName: 'Root Owner (Self-Governed)',
      reportingManagerEmail: undefined,
      reportsToLabel: 'Root Owner (Super Admin • No Escalation Above)',
    };
  }

  const isHeadSubRole =
    params.adminSubRole === 'FINANCE_BUSINESS_HEAD' ||
    params.adminSubRole === 'OPERATIONS_PARTNERSHIPS_HEAD' ||
    params.adminSubRole === 'MARKETING_GROWTH_HEAD' ||
    params.adminSubRole === 'PRODUCT_TECHNOLOGY_HEAD' ||
    Boolean(
      params.founderRoles?.some((fr) =>
        [
          'FINANCE_BUSINESS_HEAD',
          'OPERATIONS_PARTNERSHIPS_HEAD',
          'MARKETING_GROWTH_HEAD',
          'PRODUCT_TECHNOLOGY_HEAD',
        ].includes(fr)
      )
    );

  if (isHeadSubRole) {
    return {
      reportingManagerName: `${superAdminName} (Super Admin)`,
      reportingManagerEmail: superAdminEmail,
      reportsToLabel: `${superAdminName} (Super Admin • ${superAdminEmail})`,
    };
  }

  const resolvedDeptId =
    params.primaryDepartmentId || inferDepartmentIdForSubRole(params.adminSubRole) || 'OPERATIONS_PARTNERSHIPS';
  const matchedDept = depts.find((d) => d.id === resolvedDeptId);
  const matchedSeat = seats.find((s) => s.primaryDepartmentId === resolvedDeptId);

  const headName = matchedDept?.headName || matchedSeat?.founderName || superAdminName;
  const headEmail = (matchedDept?.headEmail || matchedSeat?.assignedEmail || superAdminEmail)
    .trim()
    .toLowerCase();

  if (cleanTargetEmail && headEmail === cleanTargetEmail) {
    return {
      reportingManagerName: `${superAdminName} (Super Admin)`,
      reportingManagerEmail: superAdminEmail,
      reportsToLabel: `${superAdminName} (Super Admin • ${superAdminEmail})`,
    };
  }

  return {
    reportingManagerName: `${headName} (${matchedDept?.shortName || matchedDept?.name || 'Dept'} Head)`,
    reportingManagerEmail: headEmail,
    reportsToLabel: `${headName} (${matchedDept?.name || resolvedDeptId} Head • ${headEmail})`,
  };
}
