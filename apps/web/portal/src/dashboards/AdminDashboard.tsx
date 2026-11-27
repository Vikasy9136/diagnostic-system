import { type ReactNode, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ADMIN_SUB_ROLE_LABELS,
  type CatalogItemType,
  computeBookingTrendPoints,
  computeDailyVolumeBars,
  computeOrderPricingSplit,
  computeStatusBreakdown,
  CustodyEvent,
  DEFAULT_SUPER_ADMIN_EMAIL,
  DiagnosticReportRecord,
  DiagnosticTestItem,
  EmailDeliverySettings,
  formatOrderStatus,
  FOUNDER_ROLE_LABELS,
  hasAnyPermission,
  hasPermission,
  isEffectiveSuperAdmin,
  isOrderCompleted,
  type LabCenterType,
  LabFacility,
  type LargeLabB2bAgreement,
  NotificationCategory,
  NotificationPriority,
  OrderPriority,
  OrderStatus,
  PayoutRecord,
  type PermissionCode,
  PhlebotomistProfile,
  PickupOrder,
  PlatformNotification,
  PlatformSlaConfig,
  type ServiceZoneRecord,
  SettlementRecord,
  UserProfile,
  UserRole,
  type CommissionConfig,
  getAdminPath,
  getAdminTitle,
  resolveAdminTab,
  type InventoryKitItem,
  type InventoryMaterialItem,
  type KitAllocationRecord,
  type VendorPurchaseRecord,
  DEFAULT_SUPPORT_CONTACTS,
  type SupportContactsConfig,
  DEFAULT_PLATFORM_FEATURES,
  type PlatformFeaturesConfig,
  type PlatformSopDocument,
  type PlatformFaqDocument,
} from '@diagnostic/shared';
import {
  EmailAuthProvider,
  linkWithCredential,
  updatePassword,
} from 'firebase/auth';
import {
  ADMIN_LOGIN_EMAIL,
  API_BASE_URL,
  auth,
  uploadDiagnosticDocument,
} from '../firebase';
import { type VerifiedPortalSession } from '../components/LoginPage';
import {
  CatalogItemModal,
  type CatalogItemSaveInput,
  CredentialSlipModal,
  DashboardShell,
  type GlobalSearchCategory,
  OrderLiveTrackingModal,
  SlaCountdownBadge,
} from '../components/shared';
import {
  assignPhlebotomistToOrder,
  clearAllNotifications,
  DEFAULT_COMMISSION_CONFIG,
  DEFAULT_EMAIL_SETTINGS,
  DEFAULT_PLATFORM_SLA,
  deleteDiagnosticTest,
  dispatchPlatformAlert,
  markAllNotificationsRead,
  markSettlementSettled,
  saveAdminSettings,
  saveCommissionSettings,
  saveDiagnosticTest,
  savePlatformFeatures,
  saveSupportContacts,
  subscribeCustodyEvents,
  subscribeInventoryKits,
  subscribeInventoryMaterials,
  subscribeKitAllocations,
  subscribeLabs,
  subscribeNotifications,
  subscribeOrders,
  subscribePayouts,
  subscribePhlebotomists,
  subscribePlatformFaqs,
  subscribePlatformFeatures,
  subscribePlatformSops,
  subscribeReports,
  subscribeServiceZones,
  subscribeSettings,
  subscribeSettlements,
  subscribeSupportContacts,
  subscribeTestCatalog,
  subscribeUserDirectory,
  subscribeVendorPurchases,
  toggleManagedUserStatus,
  updateLabVerification,
  updatePhleboVerification,
  updateManagedUserAccess,
} from '../services/firestoreService';
import {
  bootstrapOrgStructureApi,
  getExecutiveSummaryApi,
  runInstantPayoutProcessorApi,
  type ExecutiveSummaryData,
} from '../services/orgApiService';
import {
  AdminAnalyticsTab,
  AdminAssignCourierModal,
  AdminAssignPhleboZoneModal,
  AdminBookingsTab,
  AdminCommissionTab,
  AdminCourierDetailsModal,
  AdminEditUserModal,
  AdminInventoryKitsTab,
  AdminLabsTab,
  AdminMasterCatalogTab,
  AdminOnboardingModal,
  AdminOverviewTab,
  AdminPaymentsTab,
  AdminPayoutReleaseModal,
  AdminPhlebotomistsTab,
  AdminReportsTab,
  AdminSamplesTab,
  AdminSetPasswordModal,
  AdminSettingsTab,
  AdminSupportManagementTab,
  AdminUsersTab,
  AdminUrgentReportsTab,
  AdminZonesTab,
  AdminAgreementsTab,
  AuditLogsPanel,
  EmployeeManagementPanel,
  FinanceAutomationPanel,
  MarketingGrowthPanel,
  OperationsAutomationPanel,
  OrgStructurePanel,
  ProductTechPanel,
  type AdminCredentialSlip,
  type AdminDeptView,
  type AdminMetrics,
  type AdminPasswordTarget,
  type AdminTab,
} from './admin';
import {
  formatDashboardLabel,
  type AlertTriggerFn,
  type SidebarNavItem,
} from './types';
import { useDashboardPageRouter } from './useDashboardPageRouter';

export type { AlertTriggerFn } from './types';

export interface AdminRoleScopeConfig {
  brandSubtitle: string;
  allowedTabs: AdminTab[];
  defaultTab: AdminTab;
  allowAdminRoleCreation?: boolean;
  renderCustomOverview?: (ctx: {
    labs: LabFacility[];
    phlebotomists: PhlebotomistProfile[];
    onSelectTab: (tab: AdminTab) => void;
    onOpenAddUserModal: (presetRole: UserRole) => void;
  }) => ReactNode;
}

interface AdminDashboardProps {
  session: VerifiedPortalSession;
  onSignOut: () => void;
  onShowAlert: AlertTriggerFn;
  roleScope?: AdminRoleScopeConfig;
}

export function AdminDashboard({
  session,
  onSignOut,
  onShowAlert,
  roleScope,
}: AdminDashboardProps) {
  const rootAdminEmail = ADMIN_LOGIN_EMAIL || DEFAULT_SUPER_ADMIN_EMAIL;
  const isSuperAdmin = useMemo(
    () => isEffectiveSuperAdmin(session.profile, rootAdminEmail),
    [session.profile, rootAdminEmail]
  );

  const hasAnyPerm = useMemo(
    () =>
      (...perms: PermissionCode[]) =>
        isSuperAdmin || hasAnyPermission(session.profile, perms, rootAdminEmail),
    [session.profile, isSuperAdmin, rootAdminEmail]
  );

  const roleTitleDisplay = useMemo(() => {
    if (session.profile.founderRoles && session.profile.founderRoles.length > 0) {
      return session.profile.founderRoles.map((r: string) => (FOUNDER_ROLE_LABELS as Record<string, string>)[r] || r).join(' + ');
    }
    if (isSuperAdmin) return 'Super Admin + Product & Tech Head';
    if (session.profile.designationTitle) return session.profile.designationTitle;
    if (session.profile.adminSubRole) {
      return (ADMIN_SUB_ROLE_LABELS as Record<string, string>)[session.profile.adminSubRole] || session.profile.adminSubRole;
    }
    return 'Platform Admin';
  }, [session.profile, isSuperAdmin]);

  const canViewTab = useMemo(
    () =>
      (tab: AdminTab): boolean => {
        if (roleScope) {
          return roleScope.allowedTabs.includes(tab);
        }
        switch (tab) {
          case 'dashboard':
            return hasAnyPerm('VIEW_SUPER_ADMIN_DASHBOARD', 'FULL_PLATFORM_CONTROL');
          case 'org-structure':
            return hasAnyPerm(
              'VIEW_SUPER_ADMIN_DASHBOARD',
              'MANAGE_DEPARTMENTS',
              'MANAGE_DESIGNATIONS',
              'MANAGE_FOUNDER_SEATS',
              'FULL_PLATFORM_CONTROL'
            );
          case 'employees':
            return hasAnyPerm('VIEW_SUPER_ADMIN_DASHBOARD', 'MANAGE_EMPLOYEES');
          case 'finance-ops':
            return hasAnyPerm(
              'VIEW_FINANCE_DASHBOARD',
              'MANAGE_SUBSCRIPTIONS',
              'MANAGE_INVOICES',
              'VIEW_PAYMENT_RECORDS',
              'MANAGE_EXPENSES_BUDGETS',
              'MANAGE_RECONCILIATION',
              'APPROVE_REFUNDS',
              'CONFIGURE_COMMISSIONS_PAYOUTS',
              'VIEW_FINANCIAL_REPORTS',
              'VIEW_SUPER_ADMIN_DASHBOARD'
            );
          case 'ops-command':
          case 'urgent-reports':
            return hasAnyPerm(
              'VIEW_OPERATIONS_DASHBOARD',
              'MANAGE_BOOKINGS_DISPATCH',
              'MANAGE_ONBOARDING',
              'MANAGE_VERIFICATION',
              'MANAGE_TRAINING',
              'MANAGE_SUPPORT_TICKETS',
              'MANAGE_OPERATIONAL_QUALITY',
              'VIEW_SUPER_ADMIN_DASHBOARD'
            );
          case 'marketing-growth':
            return hasAnyPerm(
              'VIEW_MARKETING_DASHBOARD',
              'MANAGE_LEADS',
              'MANAGE_CAMPAIGNS',
              'VIEW_GROWTH_ANALYTICS',
              'MANAGE_FIELD_ACQUISITION',
              'VIEW_SUPER_ADMIN_DASHBOARD'
            );
          case 'product-tech':
            return hasAnyPerm(
              'VIEW_TECH_DASHBOARD',
              'MANAGE_SYSTEM_SECURITY',
              'VIEW_APP_ERROR_LOGS',
              'MANAGE_SYSTEM_HEALTH',
              'MANAGE_SOFTWARE_QA',
              'MANAGE_BACKUPS',
              'MANAGE_TECH_ISSUES',
              'VIEW_SUPER_ADMIN_DASHBOARD'
            );
          case 'audit-logs':
            return hasAnyPerm('VIEW_AUDIT_LOGS', 'VIEW_LOGIN_HISTORY', 'VIEW_SUPER_ADMIN_DASHBOARD');
          case 'users':
            return hasAnyPerm('MANAGE_EMPLOYEES', 'MANAGE_LAB_PARTNERSHIPS', 'VIEW_SUPER_ADMIN_DASHBOARD');
          case 'bookings':
            return hasAnyPerm(
              'VIEW_OPERATIONS_DASHBOARD',
              'MANAGE_BOOKINGS_DISPATCH',
              'MANAGE_OPERATIONAL_QUALITY'
            );
          case 'labs':
          case 'labs-small':
          case 'labs-large':
            return hasAnyPerm(
              'VIEW_OPERATIONS_DASHBOARD',
              'MANAGE_LAB_PARTNERSHIPS',
              'VIEW_MARKETING_DASHBOARD',
              'MANAGE_TEST_CATALOG'
            );
          case 'labs-verify':
            return hasAnyPerm('MANAGE_VERIFICATION', 'VIEW_IDENTITY_DOCS', 'MANAGE_LAB_PARTNERSHIPS');
          case 'phlebotomists':
          case 'inventory-kits':
            return hasAnyPerm(
              'VIEW_OPERATIONS_DASHBOARD',
              'MANAGE_PHLEBO_NETWORK',
              'MANAGE_BOOKINGS_DISPATCH',
              'MANAGE_OPERATIONAL_QUALITY',
              'VIEW_SUPER_ADMIN_DASHBOARD'
            );
          case 'samples':
            return hasAnyPerm(
              'VIEW_OPERATIONS_DASHBOARD',
              'MANAGE_BOOKINGS_DISPATCH',
              'MANAGE_OPERATIONAL_QUALITY'
            );
          case 'reports':
            return hasAnyPerm('VIEW_MEDICAL_REPORTS', 'MANAGE_OPERATIONAL_QUALITY');
          case 'payments':
            return hasAnyPerm(
              'VIEW_FINANCE_DASHBOARD',
              'VIEW_PAYMENT_RECORDS',
              'CONFIGURE_COMMISSIONS_PAYOUTS'
            );
          case 'commission':
            return hasAnyPerm('CONFIGURE_COMMISSIONS_PAYOUTS', 'VIEW_FINANCE_DASHBOARD');
          case 'analytics':
            return hasAnyPerm(
              'VIEW_SUPER_ADMIN_DASHBOARD',
              'VIEW_OPERATIONS_DASHBOARD',
              'VIEW_FINANCE_DASHBOARD'
            );
          case 'zones':
            return hasAnyPerm(
              'VIEW_OPERATIONS_DASHBOARD',
              'MANAGE_LAB_PARTNERSHIPS',
              'MANAGE_BOOKINGS_DISPATCH',
              'MANAGE_SETTINGS',
              'FULL_PLATFORM_CONTROL'
            );
          case 'master-data':
            return hasAnyPerm('MANAGE_TEST_CATALOG', 'VIEW_OPERATIONS_DASHBOARD');
          case 'agreements':
            return true;
          case 'support-sop-faq':
            return true;
          case 'settings':
            return hasAnyPerm('MANAGE_SETTINGS', 'FULL_PLATFORM_CONTROL');
          default:
            return false;
        }
      },
    [hasAnyPerm, roleScope]
  );

  const [labsMenuOpen, setLabsMenuOpen] = useState(true);
  const { activeTab, setActiveTab, getPathForTab } = useDashboardPageRouter<AdminTab>({
    resolveTabFromPath: resolveAdminTab,
    resolvePathForTab: getAdminPath,
    resolveTitleForTab: getAdminTitle,
    defaultTab: roleScope?.defaultTab || 'dashboard',
    baseRoleQuery: session.profile.role,
    onTabChange: (tab) => {
      if (tab === 'labs-small' || tab === 'labs-large' || tab === 'labs-verify' || tab === 'labs') {
        setLabsMenuOpen(true);
      }
    },
  });
  const [deptView, setDeptView] = useState<AdminDeptView>('ALL');
  const [execSummary, setExecSummary] = useState<ExecutiveSummaryData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [trendDays, setTrendDays] = useState<7 | 30>(30);

  // Live Network Data States
  const [managedUsers, setManagedUsers] = useState<UserProfile[]>([]);
  const [labs, setLabs] = useState<LabFacility[]>([]);
  const [phlebotomists, setPhlebotomists] = useState<PhlebotomistProfile[]>([]);
  const [orders, setOrders] = useState<PickupOrder[]>([]);
  const [custodyEvents, setCustodyEvents] = useState<CustodyEvent[]>([]);
  const [reports, setReports] = useState<DiagnosticReportRecord[]>([]);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [testCatalog, setTestCatalog] = useState<DiagnosticTestItem[]>([]);
  const [notifications, setNotifications] = useState<PlatformNotification[]>([]);
  const [serviceZones, setServiceZones] = useState<ServiceZoneRecord[]>([]);
  const [materials, setMaterials] = useState<InventoryMaterialItem[]>([]);
  const [kits, setKits] = useState<InventoryKitItem[]>([]);
  const [allocations, setAllocations] = useState<KitAllocationRecord[]>([]);
  const [purchases, setPurchases] = useState<VendorPurchaseRecord[]>([]);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [runningInstantBatch, setRunningInstantBatch] = useState(false);

  const [slaConfig, setSlaConfig] = useState<PlatformSlaConfig>(DEFAULT_PLATFORM_SLA);
  const [commConfig, setCommConfig] = useState<CommissionConfig>(DEFAULT_COMMISSION_CONFIG);
  const [emailSettings, setEmailSettings] = useState<EmailDeliverySettings>(DEFAULT_EMAIL_SETTINGS);
  const [supportContacts, setSupportContacts] = useState<SupportContactsConfig>(DEFAULT_SUPPORT_CONTACTS);
  const [featuresConfig, setFeaturesConfig] = useState<PlatformFeaturesConfig>(DEFAULT_PLATFORM_FEATURES);
  const [platformSops, setPlatformSops] = useState<PlatformSopDocument[]>([]);
  const [platformFaqs, setPlatformFaqs] = useState<PlatformFaqDocument[]>([]);

  // Commission Simulator & Agreements State
  const [simLabOrgId, setSimLabOrgId] = useState<string>('');
  const [simSmallTariff, setSimSmallTariff] = useState<number>(1200);
  const [simLargeB2bRate, setSimLargeB2bRate] = useState<number>(950);
  const [simDistanceKm, setSimDistanceKm] = useState<number>(7.5);
  const [simPriority, setSimPriority] = useState<OrderPriority>(OrderPriority.ROUTINE);
  const [simDropType, setSimDropType] = useState<'LARGE_LAB' | 'SELF_DROP' | 'CUSTOM_ADDRESS'>('LARGE_LAB');
  const [agreementLabId, setAgreementLabId] = useState<string>('');
  const [agreementCommPct, setAgreementCommPct] = useState<number>(15);
  const [agreementMarkupPct, setAgreementMarkupPct] = useState<number>(18);
  const [agreementMinPayout, setAgreementMinPayout] = useState<number>(0);
  const [agreementCycle, setAgreementCycle] = useState<'DAILY' | 'T_PLUS_2' | 'WEEKLY'>('DAILY');
  const [agreementNotes, setAgreementNotes] = useState<string>('');

  // Filters & Modal Targets
  const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole>('ALL');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('ALL');
  const [catalogOwnerFilter, setCatalogOwnerFilter] = useState<string>('ALL');
  const [trackingOrder, setTrackingOrder] = useState<PickupOrder | null>(null);
  const [selectedCourier, setSelectedCourier] = useState<PhlebotomistProfile | null>(null);
  const [assignZoneCourier, setAssignZoneCourier] = useState<PhlebotomistProfile | null>(null);
  const [assignModalOrder, setAssignModalOrder] = useState<PickupOrder | null>(null);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [payoutModalState, setPayoutModalState] = useState<{
    settlement: SettlementRecord;
    recipientType: 'LARGE_LAB' | 'PHLEBOTOMIST' | 'BOTH';
  } | null>(null);

  const [onboardingModal, setOnboardingModal] = useState<{
    open: boolean;
    presetRole: UserRole;
    presetCenterType: LabCenterType;
  }>({ open: false, presetRole: UserRole.SMALL_LAB, presetCenterType: 'MAIN_HUB' });

  const [pwdTarget, setPwdTarget] = useState<AdminPasswordTarget | null>(null);
  const [onboardedSlip, setOnboardedSlip] = useState<AdminCredentialSlip | null>(null);

  const [catalogModalState, setCatalogModalState] = useState<{
    open: boolean;
    editingItem: DiagnosticTestItem | null;
    initialType: CatalogItemType;
  }>({ open: false, editingItem: null, initialType: 'TEST' });

  const [storageStatusMsg, setStorageStatusMsg] = useState<string | null>(null);
  const [notifStatusMsg, setNotifStatusMsg] = useState<string | null>(null);

  // Account Password Setup / Change
  const [newAccountPassword, setNewAccountPassword] = useState('');
  const [confirmAccountPassword, setConfirmAccountPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (!canViewTab(activeTab)) {
      const priorityOrder: AdminTab[] = [
        'dashboard',
        'finance-ops',
        'ops-command',
        'marketing-growth',
        'product-tech',
        'org-structure',
        'employees',
        'audit-logs',
        'bookings',
        'settings',
      ];
      const next = priorityOrder.find((t) => canViewTab(t));
      if (next) setActiveTab(next);
    }
  }, [activeTab, canViewTab]);

  useEffect(() => {
    if (!session.firebaseUser) return;
    const noop = () => { };
    const unsubs = [
      subscribeTestCatalog(setTestCatalog, noop),
      subscribeNotifications(session.profile, setNotifications, noop),
      subscribeSettings(setSlaConfig, setCommConfig, setEmailSettings),
      subscribeSupportContacts(setSupportContacts, noop),
      subscribePlatformFeatures(setFeaturesConfig, noop),
      subscribePlatformSops(setPlatformSops, noop),
      subscribePlatformFaqs(setPlatformFaqs, noop),
      subscribeServiceZones(setServiceZones, noop),
      subscribeInventoryMaterials(setMaterials),
      subscribeInventoryKits(setKits),
      subscribeKitAllocations(setAllocations),
      subscribeVendorPurchases(setPurchases),
    ];

    if (hasAnyPerm('MANAGE_EMPLOYEES', 'MANAGE_LAB_PARTNERSHIPS', 'VIEW_SUPER_ADMIN_DASHBOARD')) {
      unsubs.push(subscribeUserDirectory(setManagedUsers, noop));
    }
    if (
      hasAnyPerm(
        'VIEW_OPERATIONS_DASHBOARD',
        'MANAGE_LAB_PARTNERSHIPS',
        'MANAGE_VERIFICATION',
        'VIEW_MARKETING_DASHBOARD',
        'MANAGE_TEST_CATALOG',
        'VIEW_FINANCE_DASHBOARD',
        'CONFIGURE_COMMISSIONS_PAYOUTS'
      )
    ) {
      unsubs.push(subscribeLabs(setLabs, noop));
    }
    if (hasAnyPerm('VIEW_OPERATIONS_DASHBOARD', 'MANAGE_PHLEBO_NETWORK', 'MANAGE_BOOKINGS_DISPATCH')) {
      unsubs.push(subscribePhlebotomists(setPhlebotomists, noop));
    }
    if (
      hasAnyPerm(
        'VIEW_OPERATIONS_DASHBOARD',
        'MANAGE_BOOKINGS_DISPATCH',
        'MANAGE_OPERATIONAL_QUALITY',
        'VIEW_PATIENT_METADATA'
      )
    ) {
      unsubs.push(subscribeOrders(session.profile, setOrders, noop));
      unsubs.push(subscribeCustodyEvents(setCustodyEvents, noop));
    }
    if (hasAnyPerm('VIEW_MEDICAL_REPORTS', 'MANAGE_OPERATIONAL_QUALITY')) {
      unsubs.push(subscribeReports(session.profile, setReports, noop));
    }
    if (hasAnyPerm('VIEW_FINANCE_DASHBOARD', 'VIEW_PAYMENT_RECORDS', 'CONFIGURE_COMMISSIONS_PAYOUTS')) {
      unsubs.push(subscribeSettlements(session.profile, setSettlements, noop));
      unsubs.push(subscribePayouts(session.profile, setPayouts, noop));
    }

    return () => unsubs.forEach((u) => u());
  }, [session.firebaseUser, session.profile, hasAnyPerm]);

  useEffect(() => {
    if (!session.firebaseUser) return;
    const canViewExec =
      isSuperAdmin ||
      hasPermission(session.profile, 'VIEW_SUPER_ADMIN_DASHBOARD', rootAdminEmail);
    if (!canViewExec) return;
    void bootstrapOrgStructureApi(session.bearerToken).catch(() => { });
    if (activeTab === 'dashboard') {
      void getExecutiveSummaryApi(session.bearerToken)
        .then((res) => setExecSummary(res.data))
        .catch(() => { });
    }
  }, [
    session.firebaseUser,
    session.profile,
    session.bearerToken,
    isSuperAdmin,
    rootAdminEmail,
    activeTab,
  ]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const metrics: AdminMetrics = useMemo(() => {
    const smallLabs = labs.filter((l) => l.type === 'SMALL_LAB');
    const largeLabs = labs.filter((l) => l.type === 'LARGE_LAB');
    const pendingLabs = labs.filter(
      (l) => l.verificationStatus !== 'VERIFIED' || !l.documents || l.documents.length === 0 || !l.exteriorPhotoUrl
    );
    const onlinePhlebos = phlebotomists.filter((p) => p.status === 'ONLINE');

    const totalOrders = orders.length;
    const totalSpecimens = orders.reduce((sum, o) => sum + (o.specimens?.length || 0), 0);
    const completedOrders = orders.filter((o) => isOrderCompleted(o.status));
    const activePickups = orders.filter(
      (o) =>
        o.status === OrderStatus.READY_FOR_PICKUP ||
        o.status === OrderStatus.ASSIGNED_TO_PHLEBO ||
        o.status === OrderStatus.PICKED_UP
    );
    const inTransit = orders.filter((o) => o.status === OrderStatus.IN_TRANSIT);

    const todayStr = new Date().toDateString();
    const todayOrders = orders.filter((o) => new Date(o.createdAt).toDateString() === todayStr);
    const todayRevenue = todayOrders.reduce((s, o) => s + (o.totalAmountInr || 0), 0);

    const grossGmv = settlements.reduce((s, x) => s + (x.grossAmountInr || 0), 0);
    const collectedOnline = settlements
      .filter((x) => x.paymentStatus === 'PAID')
      .reduce((s, x) => s + (x.grossAmountInr || 0), 0);
    const awaitingCollection = settlements
      .filter((x) => x.paymentStatus !== 'PAID' && x.status !== 'SETTLED')
      .reduce((s, x) => s + (x.grossAmountInr || 0), 0);
    const platformFees = settlements.reduce((s, x) => s + (x.platformFeeInr || 0), 0);
    const labPayouts = settlements.reduce((s, x) => s + (x.labPayoutInr || 0), 0);
    const labPayoutsPaid = settlements
      .filter((x) => x.labPayoutStatus === 'PAID' || x.status === 'SETTLED')
      .reduce((s, x) => s + (x.labPayoutInr || 0), 0);
    const labPayoutsDue = Math.max(0, labPayouts - labPayoutsPaid);
    const phleboPayouts = settlements.reduce((s, x) => s + (x.phleboPayoutInr || 0), 0);
    const phleboPayoutsPaid = settlements
      .filter((x) => x.phleboPayoutStatus === 'PAID' || x.status === 'SETTLED')
      .reduce((s, x) => s + (x.phleboPayoutInr || 0), 0);
    const phleboPayoutsDue = Math.max(0, phleboPayouts - phleboPayoutsPaid);
    const totalRevenue = grossGmv || orders.reduce((s, o) => s + (o.totalAmountInr || 0), 0);

    const statusBreakdown = computeStatusBreakdown(orders);
    const trendBuckets = computeBookingTrendPoints(orders, trendDays === 7 ? 7 : 10);
    const weeklyBars = computeDailyVolumeBars(orders);

    const tempCompliantEvents = custodyEvents.filter(
      (e) => e.temperatureCelsius === undefined || (e.temperatureCelsius >= 2 && e.temperatureCelsius <= 8)
    );
    const coldChainRate = custodyEvents.length
      ? `${((tempCompliantEvents.length / custodyEvents.length) * 100).toFixed(1)}%`
      : '100%';

    return {
      smallLabsCount: smallLabs.length,
      largeLabsCount: largeLabs.length,
      pendingLabsCount: pendingLabs.length,
      onlinePhlebosCount: onlinePhlebos.length,
      totalOrders,
      totalSpecimens,
      completedCount: completedOrders.length,
      activePickupsCount: activePickups.length,
      inTransitCount: inTransit.length,
      todayCompletedCount: todayOrders.filter((o) => isOrderCompleted(o.status)).length,
      todayOrdersCount: todayOrders.length,
      todayRevenue,
      totalRevenue,
      grossGmv,
      collectedOnline,
      awaitingCollection,
      platformFees,
      labPayouts,
      labPayoutsPaid,
      labPayoutsDue,
      phleboPayouts,
      phleboPayoutsPaid,
      phleboPayoutsDue,
      statusBreakdown,
      trendBuckets,
      weeklyBars,
      coldChainRate,
    };
  }, [labs, phlebotomists, orders, settlements, custodyEvents, trendDays]);

  const largeLabOrgs = useMemo(
    () => labs.filter((l) => l.type === 'LARGE_LAB' && (!l.parentLabId || l.centerType === 'MAIN_HUB')),
    [labs]
  );

  const singleTestsCatalog = useMemo(
    () => testCatalog.filter((t) => (t.itemType || 'TEST') === 'TEST' && t.isActive !== false),
    [testCatalog]
  );

  useEffect(() => {
    if (!agreementLabId && largeLabOrgs.length > 0) {
      const firstOrg = largeLabOrgs[0];
      setAgreementLabId(firstOrg.id);
      const existing = commConfig.largeLabAgreements?.[firstOrg.id];
      if (existing) {
        setAgreementCommPct(existing.agreedCommissionPct);
        setAgreementMarkupPct(existing.b2bMarkupPct);
        setAgreementMinPayout(existing.minPayoutInr || 0);
        setAgreementCycle(existing.settlementCycle || 'DAILY');
        setAgreementNotes(existing.notes || '');
      }
    }
  }, [largeLabOrgs, agreementLabId, commConfig.largeLabAgreements]);

  const simulatedSplit = useMemo(
    () =>
      computeOrderPricingSplit({
        smallLabTestTotalInr: simSmallTariff,
        largeLabB2bTotalInr: simDropType === 'LARGE_LAB' ? simLargeB2bRate : undefined,
        commissionConfig: commConfig,
        targetLabId: simLabOrgId || undefined,
        priority: simPriority,
        distanceKm: simDistanceKm,
        dropType: simDropType,
      }),
    [simSmallTariff, simLargeB2bRate, commConfig, simLabOrgId, simPriority, simDistanceKm, simDropType]
  );

  const allExistingAssignedCodes = useMemo(() => {
    return [
      ...managedUsers.map((u) => u.userCode || u.labId || u.phlebotomistId || u.employeeId || ''),
      ...labs.map((l) => l.userCode || l.id),
      ...phlebotomists.map((p) => p.userCode || p.id),
    ].filter(Boolean);
  }, [managedUsers, labs, phlebotomists]);

  function selectAdminTab(tab: AdminTab) {
    if (tab === 'dashboard') setDeptView('ALL');
    else if (tab === 'finance-ops') setDeptView('FINANCE_BUSINESS');
    else if (tab === 'ops-command') setDeptView('OPERATIONS_PARTNERSHIPS');
    else if (tab === 'marketing-growth') setDeptView('MARKETING_GROWTH');
    else if (tab === 'product-tech') setDeptView('PRODUCT_TECHNOLOGY');
    setActiveTab(tab);
  }

  function openAddUserModal(
    presetRole: UserRole = UserRole.SMALL_LAB,
    presetCenterType: LabCenterType = 'MAIN_HUB'
  ) {
    setOnboardingModal({ open: true, presetRole, presetCenterType });
  }

  function openAddTestModal(itemType: CatalogItemType = 'TEST') {
    setCatalogModalState({ open: true, editingItem: null, initialType: itemType });
  }

  function openEditTestModal(item: DiagnosticTestItem) {
    setCatalogModalState({ open: true, editingItem: item, initialType: item.itemType || 'TEST' });
  }

  async function handleSaveCatalogItem(input: CatalogItemSaveInput) {
    await saveDiagnosticTest({
      ...input,
      isActive: true,
    });
    onShowAlert({
      variant: 'success',
      title: input.itemType === 'PACKAGE' ? 'Health Package Saved' : 'Test Panel Saved',
      message: `${input.code} (${input.name}) has been saved${input.ownerOrgId ? ` for ${input.labName}` : ' to global catalogue'
        }.`,
    });
  }

  async function handleRunInstantPayoutBatch() {
    setRunningInstantBatch(true);
    try {
      const res = await runInstantPayoutProcessorApi('UPI', session.bearerToken);
      const d = res.data;
      onShowAlert({
        variant: 'success',
        title: '30-Min Instant Payout Batch Complete',
        message:
          res.message ||
          `Released ${d.releasedCount} instant payout(s), skipped ${d.skippedCount}, failed ${d.failedCount}.`,
      });
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Instant Payout Batch Error',
        message: (err as Error).message || 'Could not run 30-min instant payout batch.',
      });
    } finally {
      setRunningInstantBatch(false);
    }
  }

  async function handleSaveAgreement(e: FormEvent) {
    e.preventDefault();
    if (!agreementLabId) return;
    const targetLab = largeLabOrgs.find((l) => l.id === agreementLabId);
    if (!targetLab) return;
    const nextAgreement: LargeLabB2bAgreement = {
      labId: targetLab.id,
      labName: targetLab.name,
      agreedCommissionPct: Number(agreementCommPct) || 0,
      b2bMarkupPct: Number(agreementMarkupPct) || 0,
      minPayoutInr: Number(agreementMinPayout) || 0,
      settlementCycle: agreementCycle,
      notes: agreementNotes.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    const nextConfig: CommissionConfig = {
      ...commConfig,
      largeLabAgreements: {
        ...(commConfig.largeLabAgreements || {}),
        [targetLab.id]: nextAgreement,
      },
    };
    await saveCommissionSettings(nextConfig, session.profile.email);
    onShowAlert({
      variant: 'success',
      title: 'B2B Agreement Updated',
      message: `Saved negotiated B2B rate rule for ${targetLab.name} (${nextAgreement.agreedCommissionPct}% commission, ${nextAgreement.b2bMarkupPct}% markup).`,
    });
  }

  async function handleAssignCourierSubmit(phlebotomistId: string) {
    if (!assignModalOrder || !session.firebaseUser) return;
    const phlebo = phlebotomists.find((p) => p.id === phlebotomistId);
    if (!phlebo) return;
    await assignPhlebotomistToOrder({
      order: assignModalOrder,
      phlebo,
      operatorUid: session.firebaseUser.uid,
      operatorName: session.profile.displayName,
      operatorRole: UserRole.ADMIN,
    });
    const orderNum = assignModalOrder.orderNumber;
    setAssignModalOrder(null);
    onShowAlert({
      variant: 'success',
      title: 'Booking Assigned',
      message: `${orderNum} assigned to ${phlebo.name} (${phlebo.id}).`,
    });
  }

  async function handleSendTestNotification() {
    setNotifStatusMsg('Sending test alert & email...');
    try {
      const res = await fetch(`${API_BASE_URL}/notifications/test-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.bearerToken}`,
        },
        body: JSON.stringify({ recipientEmail: emailSettings.adminEmail }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.data) {
        setNotifStatusMsg(
          json.data.emailSent
            ? `Test email delivered to ${emailSettings.adminEmail}.`
            : `Notification saved; email delivery to ${emailSettings.adminEmail} queued.`
        );
        return;
      }
    } catch {
      // Fallback below
    }

    await dispatchPlatformAlert({
      title: 'LabSetu Live Alert & Email Check',
      message: `Verified real-time alert for ${emailSettings.adminEmail} triggered at ${new Date().toLocaleTimeString('en-IN')}.`,
      category: NotificationCategory.SYSTEM_ALERT,
      priority: NotificationPriority.NORMAL,
      recipientEmail: emailSettings.adminEmail,
      recipientRole: UserRole.ADMIN,
      queueEmail: true,
    });
    setNotifStatusMsg(`Alert & email queued for ${emailSettings.adminEmail}.`);
  }

  async function handleStorageUploadTest(file: File | undefined) {
    if (!file) return;
    setStorageStatusMsg('Uploading test document...');
    try {
      const url = await uploadDiagnosticDocument(
        `documents/admin/${Date.now()}-${file.name}`,
        file
      );
      setStorageStatusMsg(`Uploaded successfully: ${url}`);
      onShowAlert({
        variant: 'success',
        title: 'Document Upload Verified',
        message: `${file.name} uploaded securely.`,
        detail: url,
      });
    } catch (err) {
      const msg = (err as Error).message;
      setStorageStatusMsg(`Upload failed: ${msg}`);
      onShowAlert({ variant: 'warning', title: 'Upload Error', message: msg });
    }
  }

  async function handleUpdateAccountPassword(e: FormEvent) {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user || !user.email) {
      onShowAlert({
        variant: 'error',
        title: 'Sign-In Required',
        message: 'Please sign in again before updating your password.',
      });
      return;
    }
    if (newAccountPassword.length < 6) {
      onShowAlert({
        variant: 'warning',
        title: 'Password Too Short',
        message: 'Please enter a password of at least 6 characters.',
      });
      return;
    }
    if (newAccountPassword !== confirmAccountPassword) {
      onShowAlert({
        variant: 'warning',
        title: 'Passwords Do Not Match',
        message: 'Both password fields must match exactly.',
      });
      return;
    }

    setSavingPassword(true);
    try {
      const hasPasswordProvider = user.providerData.some((p) => p.providerId === 'password');
      if (hasPasswordProvider) {
        await updatePassword(user, newAccountPassword);
      } else {
        const cred = EmailAuthProvider.credential(user.email, newAccountPassword);
        await linkWithCredential(user, cred);
      }
      setNewAccountPassword('');
      setConfirmAccountPassword('');
      onShowAlert({
        variant: 'success',
        title: 'Sign-In Password Updated',
        message: `You can now sign in to ${user.email} using Email & Password anytime.`,
      });
    } catch (err: unknown) {
      const fbErr = err as { code?: string; message?: string };
      if (fbErr.code === 'auth/requires-recent-login') {
        onShowAlert({
          variant: 'warning',
          title: 'Please Sign In Again',
          message: 'For security reasons, please sign out and sign back in once before changing your password.',
        });
      } else {
        onShowAlert({
          variant: 'error',
          title: 'Password Update Failed',
          message: fbErr.message || 'Could not update your account password.',
        });
      }
    } finally {
      setSavingPassword(false);
    }
  }

  function handleExportCsv() {
    if (orders.length === 0) {
      onShowAlert({
        variant: 'info',
        title: 'No Bookings to Export',
        message: 'Create or receive live bookings before exporting CSV.',
      });
      return;
    }
    const headers = ['Order Number', 'Source Lab', 'Target Hub', 'Patient', 'Tests', 'Phlebotomist', 'Status', 'Total INR', 'Created'];
    const rows = orders.map((o) =>
      [
        o.orderNumber,
        `"${o.smallLabName}"`,
        `"${o.targetLabName}"`,
        `"${o.patient.pseudonym}"`,
        `"${o.specimens.map((s) => s.testCode).join(', ')}"`,
        `"${o.phlebotomistName || 'Unassigned'}"`,
        formatOrderStatus(o.status),
        o.totalAmountInr || 0,
        o.createdAt,
      ].join(',')
    );
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `labsetu-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    onShowAlert({
      variant: 'success',
      title: 'Bookings CSV Exported',
      message: `Exported ${orders.length} live bookings.`,
    });
  }

  const q = searchQuery.trim().toLowerCase();
  const filteredUsers = managedUsers.filter(
    (u) =>
      (roleFilter === 'ALL' || u.role === roleFilter) &&
      (!q ||
        u.email.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q) ||
        (u.userCode || '').toLowerCase().includes(q) ||
        (u.employeeId || '').toLowerCase().includes(q) ||
        (u.phlebotomistId || '').toLowerCase().includes(q) ||
        (u.labId || '').toLowerCase().includes(q))
  );
  const filteredOrders = orders.filter(
    (o) =>
      (orderStatusFilter === 'ALL' || o.status === orderStatusFilter) &&
      (!q ||
        o.orderNumber.toLowerCase().includes(q) ||
        o.smallLabName.toLowerCase().includes(q) ||
        o.targetLabName.toLowerCase().includes(q) ||
        o.patient.pseudonym.toLowerCase().includes(q))
  );

  const initials = (session.profile.displayName || 'AD')
    .split(' ')
    .map((p: string) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const navItems: SidebarNavItem<AdminTab>[] = useMemo(() => {
    const topItems: SidebarNavItem<AdminTab>[] = canViewTab('dashboard')
      ? [{ id: 'dashboard', icon: '📊', label: 'Admin Dashboard', path: getPathForTab('dashboard') }]
      : [];

    const orgItems = (
      [
        canViewTab('org-structure') && { id: 'org-structure', icon: '🏢', label: 'Org & Founder Seats', path: getPathForTab('org-structure') },
        canViewTab('employees') && { id: 'employees', icon: '🧑‍💼', label: 'Employees & Access', path: getPathForTab('employees') },
        canViewTab('finance-ops') && {
          id: 'finance-ops',
          icon: '💰',
          label:
            commConfig.hideSubscriptionsUi === false && commConfig.enableSubscriptionsModule
              ? 'Finance & Subscriptions'
              : 'Finance & Instant Payouts',
          path: getPathForTab('finance-ops'),
        },
        canViewTab('ops-command') && { id: 'ops-command', icon: '🚚', label: 'Operations & KYC', path: getPathForTab('ops-command') },
        canViewTab('urgent-reports') && { id: 'urgent-reports', icon: '⚡', label: 'Urgent Report Requests', path: getPathForTab('urgent-reports') },
        canViewTab('marketing-growth') && { id: 'marketing-growth', icon: '📢', label: 'Marketing & Growth', path: getPathForTab('marketing-growth') },
        canViewTab('product-tech') && { id: 'product-tech', icon: '💻', label: 'Product & Technology', path: getPathForTab('product-tech') },
        canViewTab('audit-logs') && { id: 'audit-logs', icon: '📜', label: 'Audit & Login Logs', path: getPathForTab('audit-logs') },
      ].filter(Boolean) as SidebarNavItem<AdminTab>[]
    );
    if (orgItems.length > 0) {
      orgItems[0] = { ...orgItems[0], sectionLabel: 'Organisation & Departments' };
    }

    const activeZonesCount = serviceZones.filter((z) => z.isActive && z.launchPhase !== 'PAUSED').length;
    const opsItems = (
      [
        canViewTab('users') && {
          id: 'users',
          icon: '🛡️',
          label: 'Users & Roles',
          badgeCount: managedUsers.length,
          badgeVariant: 'green' as const,
          path: getPathForTab('users'),
        },
        canViewTab('bookings') && {
          id: 'bookings',
          icon: '📦',
          label: 'Bookings',
          badgeCount: orders.length,
          badgeVariant: 'red' as const,
          path: getPathForTab('bookings'),
        },
        canViewTab('labs') && {
          id: 'labs',
          icon: '🏥',
          label: 'Labs & Partners',
          path: getPathForTab('labs'),
          activeMatchIds: ['labs-small', 'labs-large', 'labs-verify'] as AdminTab[],
          isExpanded: labsMenuOpen,
          onToggleExpand: () => {
            setLabsMenuOpen((prev) => !prev);
            setActiveTab('labs');
          },
          subItems: [
            { id: 'labs-small', label: `• Collection Centres (${metrics.smallLabsCount})`, path: getPathForTab('labs-small') },
            { id: 'labs-large', label: `• Reference Labs (${metrics.largeLabsCount})`, path: getPathForTab('labs-large') },
            { id: 'labs-verify', label: `• Verification (${metrics.pendingLabsCount})`, path: getPathForTab('labs-verify') },
          ],
        },
        canViewTab('phlebotomists') && {
          id: 'phlebotomists',
          icon: '🛵',
          label: 'Phlebotomists',
          badgeCount: phlebotomists.length,
          badgeVariant: 'teal' as const,
          path: getPathForTab('phlebotomists'),
        },
        canViewTab('inventory-kits') && {
          id: 'inventory-kits',
          icon: '📦',
          label: 'Kits & Vacutainers Stock',
          badgeCount: kits.length,
          badgeVariant: 'teal' as const,
          path: getPathForTab('inventory-kits'),
        },
        canViewTab('samples') && { id: 'samples', icon: '🧪', label: 'Samples Cold-Chain', path: getPathForTab('samples') },
        canViewTab('reports') && { id: 'reports', icon: '📄', label: 'Reports', path: getPathForTab('reports') },
        canViewTab('payments') && { id: 'payments', icon: '💳', label: 'Payments & Settlements', path: getPathForTab('payments') },
        canViewTab('commission') && { id: 'commission', icon: '%', label: 'Commissions', path: getPathForTab('commission') },
        canViewTab('analytics') && { id: 'analytics', icon: '📈', label: 'Analytics', path: getPathForTab('analytics') },
        canViewTab('zones') && {
          id: 'zones',
          icon: '🗺️',
          label: 'Area Expansion Zones',
          badgeCount: activeZonesCount,
          badgeVariant: 'green' as const,
          path: getPathForTab('zones'),
        },
        canViewTab('agreements') && {
          id: 'agreements',
          icon: '🤝',
          label: 'Master Agreements',
          path: getPathForTab('agreements'),
        },
        canViewTab('master-data') && { id: 'master-data', icon: '📁', label: 'Master Test Data', path: getPathForTab('master-data') },
        canViewTab('support-sop-faq') && {
          id: 'support-sop-faq',
          icon: '🎧',
          label: 'Support, SOP & FAQ',
          path: getPathForTab('support-sop-faq'),
        },
        canViewTab('settings') && { id: 'settings', icon: '⚙️', label: 'Settings', path: getPathForTab('settings') },
      ].filter(Boolean) as SidebarNavItem<AdminTab>[]
    );
    if (opsItems.length > 0) {
      opsItems[0] = { ...opsItems[0], sectionLabel: 'Operations & Platform' };
    }

    return [...topItems, ...orgItems, ...opsItems];
  }, [
    canViewTab,
    commConfig.hideSubscriptionsUi,
    commConfig.enableSubscriptionsModule,
    getPathForTab,
    labsMenuOpen,
    managedUsers.length,
    metrics.largeLabsCount,
    metrics.pendingLabsCount,
    metrics.smallLabsCount,
    orders.length,
    phlebotomists.length,
    serviceZones,
    setActiveTab,
  ]);

  const deptSwitcherCount = [
    canViewTab('dashboard'),
    canViewTab('finance-ops'),
    canViewTab('ops-command'),
    canViewTab('marketing-growth'),
    canViewTab('product-tech'),
  ].filter(Boolean).length;

  const handleMarkAllNotificationsRead = async () => {
    try {
      const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
      if (unreadIds.length === 0) return;
      await markAllNotificationsRead(unreadIds);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err) {
      console.warn('Failed to mark all notifications read:', err);
    }
  };

  const handleClearAllNotifications = async () => {
    try {
      const allIds = notifications.map((n) => n.id);
      if (allIds.length === 0) return;
      await clearAllNotifications(allIds);
      setNotifications([]);
    } catch (err) {
      console.warn('Failed to clear notifications:', err);
    }
  };

  const globalSearchResults: GlobalSearchCategory[] = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];

    const matchedOrders = orders
      .filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(q) ||
          o.patient.pseudonym.toLowerCase().includes(q) ||
          o.smallLabName.toLowerCase().includes(q) ||
          o.targetLabName.toLowerCase().includes(q) ||
          (o.pickupLocation?.address || '').toLowerCase().includes(q) ||
          (o.specimens || []).some(
            (s) =>
              s.testCode.toLowerCase().includes(q) ||
              (s.barcode || '').toLowerCase().includes(q)
          )
      )
      .slice(0, 5)
      .map((o) => ({
        id: o.id,
        icon: '📦',
        title: `${o.orderNumber} • ${o.patient.pseudonym}`,
        subtitle: `${o.smallLabName} → ${o.targetLabName} • ₹${o.totalAmountInr || o.courierFeeInr || 0}`,
        tag: formatOrderStatus(o.status),
        onClick: () => {
          setActiveTab('bookings');
          setTrackingOrder(o);
          setSearchQuery('');
        },
      }));

    const matchedUsers = managedUsers
      .filter(
        (u) =>
          u.displayName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.userCode || '').toLowerCase().includes(q) ||
          (u.phoneNumber || '').toLowerCase().includes(q) ||
          (u.role || '').toLowerCase().includes(q)
      )
      .slice(0, 5)
      .map((u) => ({
        id: u.id,
        icon: u.role === UserRole.PHLEBOTOMIST ? '🛵' : '👤',
        title: `${u.displayName} (${u.userCode || u.id.slice(0, 8)})`,
        subtitle: `${u.email} • ${formatDashboardLabel(u.role)}`,
        tag: formatDashboardLabel(u.role),
        onClick: () => {
          if (u.role === UserRole.PHLEBOTOMIST) {
            setActiveTab('phlebotomists');
          } else {
            setActiveTab('users');
          }
          setSearchQuery('');
        },
      }));

    const matchedLabs = labs
      .filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          (l.userCode || '').toLowerCase().includes(q) ||
          (l.city || '').toLowerCase().includes(q) ||
          (l.address || '').toLowerCase().includes(q) ||
          (l.phone || '').toLowerCase().includes(q)
      )
      .slice(0, 5)
      .map((l) => ({
        id: l.id,
        icon: '🏥',
        title: `${l.name} (${l.userCode || l.id.slice(0, 8)})`,
        subtitle: `${l.city} • ${l.address || ''}`,
        tag: l.type === 'SMALL_LAB' ? 'Collection Centre' : 'Reference Lab',
        onClick: () => {
          setActiveTab(l.type === 'SMALL_LAB' ? 'labs-small' : 'labs-large');
          setSearchQuery('');
        },
      }));

    const matchedInventory: Array<{
      id: string;
      icon: string;
      title: string;
      subtitle: string;
      tag?: string;
      onClick: () => void;
    }> = [];

    kits
      .filter(
        (k) =>
          k.kitName.toLowerCase().includes(q) ||
          k.kitCode.toLowerCase().includes(q) ||
          (k.id || '').toLowerCase().includes(q)
      )
      .slice(0, 4)
      .forEach((k) => {
        matchedInventory.push({
          id: k.id,
          icon: '🔬',
          title: `${k.kitName} (${k.kitCode})`,
          subtitle: `BOM: ${k.billOfMaterials?.length || 0} items • Stock: ${k.currentAssembledStock} kits`,
          tag: 'Kit Master',
          onClick: () => {
            setActiveTab('inventory-kits');
            setSearchQuery('');
          },
        });
      });

    materials
      .filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.category.toLowerCase().includes(q) ||
          (m.batchNumber || '').toLowerCase().includes(q)
      )
      .slice(0, 4)
      .forEach((m) => {
        matchedInventory.push({
          id: m.id,
          icon: '🧪',
          title: `${m.name} (${m.category})`,
          subtitle: `Stock: ${m.currentStock} ${m.unit} • Batch: ${m.batchNumber || 'N/A'} • Exp: ${m.expiryDate || 'N/A'}`,
          tag: 'Stock Item',
          onClick: () => {
            setActiveTab('inventory-kits');
            setSearchQuery('');
          },
        });
      });

    const categories: GlobalSearchCategory[] = [];
    if (matchedOrders.length > 0) {
      categories.push({ category: 'Bookings & Orders', items: matchedOrders });
    }
    if (matchedUsers.length > 0) {
      categories.push({ category: 'Users & Phlebotomists', items: matchedUsers });
    }
    if (matchedLabs.length > 0) {
      categories.push({ category: 'Collection Centres & Labs', items: matchedLabs });
    }
    if (matchedInventory.length > 0) {
      categories.push({ category: 'Inventory Kits & Supplies', items: matchedInventory });
    }

    return categories;
  }, [searchQuery, orders, managedUsers, labs, kits, materials]);

  return (
    <>
      <DashboardShell<AdminTab>
        brandSubtitle={roleScope?.brandSubtitle || roleTitleDisplay}
        navItems={navItems}
        activeTab={activeTab}
        onSelectTab={selectAdminTab}
        footerCard={{
          icon: '🎧',
          title: roleTitleDisplay,
          subtitle: 'Live Auto-Sync Active',
          onClick: () =>
            onShowAlert({
              variant: 'info',
              title: 'LabSetu Operations',
              message: `Signed in as ${roleTitleDisplay}\nRoot Admin: ${ADMIN_LOGIN_EMAIL}`,
            }),
        }}
        searchPlaceholder="Search booking ID, email, lab, patient, or phlebotomist..."
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        globalSearchResults={globalSearchResults}
        notifications={notifications}
        onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
        onClearAllNotifications={handleClearAllNotifications}
        notifTitle="Live Notifications"
        notifSubtitle={emailSettings.adminEmail}
        notifHeaderAction={
          <button
            type="button"
            className="btn-link-muted"
            onClick={() => void handleSendTestNotification()}
          >
            + Send Test
          </button>
        }
        notifExtraBanner={
          notifStatusMsg ? (
            <div style={{ padding: '8px 14px', background: '#F0FDFA', color: '#0F766E', fontSize: '0.75rem' }}>
              {notifStatusMsg}
            </div>
          ) : undefined
        }
        formatLabel={formatDashboardLabel}
        profile={{
          initials,
          displayName: session.profile.displayName,
          userCode:
            session.profile.userCode ||
            session.profile.employeeId ||
            (isSuperAdmin ? 'USR-ADM-1001' : undefined),
          roleSummary: `${roleTitleDisplay} • ${session.profile.email}`,
        }}
        onSignOut={onSignOut}
      >
        {(isSuperAdmin || deptSwitcherCount > 1) && (
          <div className="dept-switcher-bar">
            <span className="dept-switcher-label">Workspace:</span>
            {canViewTab('dashboard') && (
              <button
                type="button"
                className={`dept-pill-btn ${activeTab === 'dashboard' && deptView === 'ALL' ? 'active' : ''}`}
                onClick={() => selectAdminTab('dashboard')}
              >
                Executive All
              </button>
            )}
            {canViewTab('finance-ops') && (
              <button
                type="button"
                className={`dept-pill-btn ${activeTab === 'finance-ops' ? 'active' : ''}`}
                onClick={() => selectAdminTab('finance-ops')}
              >
                💰 Finance (Ashwani)
              </button>
            )}
            {canViewTab('ops-command') && (
              <button
                type="button"
                className={`dept-pill-btn ${activeTab === 'ops-command' ? 'active' : ''}`}
                onClick={() => selectAdminTab('ops-command')}
              >
                🚚 Operations (Akash)
              </button>
            )}
            {canViewTab('marketing-growth') && (
              <button
                type="button"
                className={`dept-pill-btn ${activeTab === 'marketing-growth' ? 'active' : ''}`}
                onClick={() => selectAdminTab('marketing-growth')}
              >
                📣 Marketing (Vishal)
              </button>
            )}
            {canViewTab('product-tech') && (
              <button
                type="button"
                className={`dept-pill-btn ${activeTab === 'product-tech' ? 'active' : ''}`}
                onClick={() => selectAdminTab('product-tech')}
              >
                💻 Product &amp; Tech (Vikas)
              </button>
            )}
          </div>
        )}

        {activeTab === 'dashboard' &&
          (roleScope?.renderCustomOverview ? (
            roleScope.renderCustomOverview({
              labs,
              phlebotomists,
              onSelectTab: selectAdminTab,
              onOpenAddUserModal: (r) => openAddUserModal(r),
            })
          ) : (
            <AdminOverviewTab
              metrics={metrics}
              trendDays={trendDays}
              onToggleTrendDays={() => setTrendDays(trendDays === 30 ? 7 : 30)}
              labs={labs}
              phlebotomists={phlebotomists}
              orders={orders}
              managedUsers={managedUsers}
              reports={reports}
              execSummary={execSummary}
              commConfig={commConfig}
              canViewTab={canViewTab}
              onSelectTab={selectAdminTab}
              onSelectDeptWorkspace={(dept: AdminDeptView, tab: AdminTab) => {
                setDeptView(dept);
                setActiveTab(tab);
              }}
              onOpenAddUserModal={(r) => openAddUserModal(r)}
              onOpenAddTestModal={() => openAddTestModal('TEST')}
              onExportCsv={handleExportCsv}
            />
          ))}

        {activeTab === 'org-structure' && canViewTab('org-structure') && (
          <OrgStructurePanel
            currentUser={session.profile}
            bearerToken={session.bearerToken}
            onShowAlert={onShowAlert}
            onJumpToEmployees={() => setActiveTab('employees')}
          />
        )}

        {activeTab === 'employees' && canViewTab('employees') && (
          <EmployeeManagementPanel
            currentUser={session.profile}
            bearerToken={session.bearerToken}
            onShowAlert={onShowAlert}
          />
        )}

        {activeTab === 'finance-ops' && canViewTab('finance-ops') && (
          <FinanceAutomationPanel
            currentUser={session.profile}
            bearerToken={session.bearerToken}
            labs={labs}
            onShowAlert={onShowAlert}
            onConfigSaved={(cfg) => setCommConfig(cfg)}
          />
        )}

        {activeTab === 'ops-command' && canViewTab('ops-command') && (
          <OperationsAutomationPanel
            currentUser={session.profile}
            bearerToken={session.bearerToken}
            phlebotomists={phlebotomists}
            onShowAlert={onShowAlert}
          />
        )}

        {activeTab === 'urgent-reports' && canViewTab('urgent-reports') && (
          <AdminUrgentReportsTab labs={labs} orders={orders} />
        )}

        {activeTab === 'marketing-growth' && canViewTab('marketing-growth') && (
          <MarketingGrowthPanel
            currentUser={session.profile}
            bearerToken={session.bearerToken}
            onShowAlert={onShowAlert}
            onOpenAddUserModal={(r) => openAddUserModal(r)}
            labs={labs}
            phlebotomists={phlebotomists}
          />
        )}

        {activeTab === 'product-tech' && canViewTab('product-tech') && (
          <ProductTechPanel
            currentUser={session.profile}
            bearerToken={session.bearerToken}
            onShowAlert={onShowAlert}
          />
        )}

        {activeTab === 'audit-logs' && canViewTab('audit-logs') && (
          <AuditLogsPanel
            currentUser={session.profile}
            bearerToken={session.bearerToken}
          />
        )}

        {activeTab === 'users' && (
          <AdminUsersTab
            managedUsers={managedUsers}
            filteredUsers={filteredUsers}
            roleFilter={roleFilter}
            onRoleFilterChange={setRoleFilter}
            rootAdminEmail={rootAdminEmail}
            onOpenAddUserModal={(r) => openAddUserModal(r)}
            onOpenSetPasswordDialog={setPwdTarget}
            onEditUser={setEditingUser}
            onToggleUserStatus={(u, nextActive) => {
              void toggleManagedUserStatus(session.bearerToken, u, nextActive);
            }}
            onShowAlert={onShowAlert}
          />
        )}

        {activeTab === 'bookings' && (
          <AdminBookingsTab
            filteredOrders={filteredOrders}
            orderStatusFilter={orderStatusFilter}
            onOrderStatusFilterChange={setOrderStatusFilter}
            onExportCsv={handleExportCsv}
            onTrackOrder={setTrackingOrder}
            onAssignCourier={setAssignModalOrder}
          />
        )}

        {(activeTab === 'labs' ||
          activeTab === 'labs-small' ||
          activeTab === 'labs-large' ||
          activeTab === 'labs-verify') && (
            <AdminLabsTab
              activeTab={activeTab}
              labs={labs}
              formatLabel={formatDashboardLabel}
              onOpenAddUserModal={(r) => openAddUserModal(r)}
              onVerifyLab={async (labId) => {
                try {
                  await updateLabVerification(labId, 'VERIFIED');
                  onShowAlert({
                    variant: 'success',
                    title: 'Lab Verified & Credentials Dispatched',
                    message: 'The lab facility has been successfully verified. An onboarding email with login steps and credentials has been dispatched to their registered email.',
                  });
                } catch (err) {
                  onShowAlert({
                    variant: 'error',
                    title: 'Verification Blocked',
                    message: (err as Error).message || 'Could not verify lab.',
                  });
                }
              }}
              onOpenSetPasswordDialog={setPwdTarget}
              onShowAlert={onShowAlert}
            />
          )}

        {activeTab === 'phlebotomists' && (
          <AdminPhlebotomistsTab
            phlebotomists={phlebotomists}
            managedUsers={managedUsers}
            serviceZones={serviceZones}
            formatLabel={formatDashboardLabel}
            onOpenAddUserModal={(r) => openAddUserModal(r)}
            onSelectCourier={setSelectedCourier}
            onOpenAssignZone={setAssignZoneCourier}
            onOpenSetPasswordDialog={setPwdTarget}
            onVerifyPhlebo={async (phleboId) => {
              try {
                await updatePhleboVerification(phleboId, 'VERIFIED');
                onShowAlert({
                  variant: 'success',
                  title: 'Phlebotomist Verified & Credentials Dispatched',
                  message: 'The field phlebotomist has been verified. Mobile app login steps and credentials have been dispatched to their registered email.',
                });
              } catch (err) {
                onShowAlert({
                  variant: 'error',
                  title: 'Verification Blocked',
                  message: (err as Error).message || 'Could not verify phlebotomist.',
                });
              }
            }}
          />
        )}

        {activeTab === 'samples' && (
          <AdminSamplesTab
            custodyEvents={custodyEvents}
            formatLabel={formatDashboardLabel}
          />
        )}

        {activeTab === 'inventory-kits' && canViewTab('inventory-kits') && (
          <AdminInventoryKitsTab
            materials={materials}
            kits={kits}
            allocations={allocations}
            purchases={purchases}
            phlebotomists={phlebotomists}
            adminEmail={session.profile.email}
            onShowAlert={onShowAlert}
          />
        )}

        {activeTab === 'reports' && <AdminReportsTab reports={reports} />}

        {activeTab === 'payments' && (
          <AdminPaymentsTab
            settlements={settlements}
            payouts={payouts}
            orders={orders}
            commConfig={commConfig}
            metrics={metrics}
            nowTick={nowTick}
            runningInstantBatch={runningInstantBatch}
            onRunInstantPayoutBatch={() => void handleRunInstantPayoutBatch()}
            onOpenPayoutModal={(settlement, recipientType) =>
              setPayoutModalState({ settlement, recipientType })
            }
            onMarkSettlementSettled={(id) => {
              void markSettlementSettled(id);
            }}
          />
        )}

        {activeTab === 'commission' && (
          <AdminCommissionTab
            commConfig={commConfig}
            onCommConfigChange={setCommConfig}
            onSaveCommissionConfig={async () => {
              await saveCommissionSettings(commConfig, session.profile.email);
              onShowAlert({
                variant: 'success',
                title: 'Commission & Payout Rules Saved',
                message: 'Global commission, 30-min instant payout SLA, and visibility rules have been updated.',
              });
            }}
            canViewFinanceOps={canViewTab('finance-ops')}
            onOpenFinanceOps={() => selectAdminTab('finance-ops')}
            largeLabOrgs={largeLabOrgs}
            simDropType={simDropType}
            onSimDropTypeChange={setSimDropType}
            simLabOrgId={simLabOrgId}
            onSimLabOrgIdChange={setSimLabOrgId}
            simSmallTariff={simSmallTariff}
            onSimSmallTariffChange={setSimSmallTariff}
            simLargeB2bRate={simLargeB2bRate}
            onSimLargeB2bRateChange={setSimLargeB2bRate}
            simDistanceKm={simDistanceKm}
            onSimDistanceKmChange={setSimDistanceKm}
            simPriority={simPriority}
            onSimPriorityChange={setSimPriority}
            simulatedSplit={simulatedSplit}
            agreementLabId={agreementLabId}
            onAgreementLabChange={(id) => {
              setAgreementLabId(id);
              const existing = commConfig.largeLabAgreements?.[id];
              setAgreementCommPct(existing?.agreedCommissionPct ?? commConfig.commissionPct);
              setAgreementMarkupPct(existing?.b2bMarkupPct ?? 18);
              setAgreementMinPayout(existing?.minPayoutInr ?? 0);
              setAgreementCycle(existing?.settlementCycle ?? 'DAILY');
              setAgreementNotes(existing?.notes ?? '');
            }}
            agreementCommPct={agreementCommPct}
            onAgreementCommPctChange={setAgreementCommPct}
            agreementMarkupPct={agreementMarkupPct}
            onAgreementMarkupPctChange={setAgreementMarkupPct}
            agreementCycle={agreementCycle}
            onAgreementCycleChange={setAgreementCycle}
            agreementMinPayout={agreementMinPayout}
            onAgreementMinPayoutChange={setAgreementMinPayout}
            agreementNotes={agreementNotes}
            onAgreementNotesChange={setAgreementNotes}
            onSaveAgreement={handleSaveAgreement}
          />
        )}

        {activeTab === 'analytics' && (
          <AdminAnalyticsTab weeklyBars={metrics.weeklyBars} />
        )}

        {activeTab === 'zones' && canViewTab('zones') && (
          <AdminZonesTab
            serviceZones={serviceZones}
            phlebotomists={phlebotomists}
            actorEmail={session.profile.email}
            bearerToken={session.bearerToken}
            onShowAlert={onShowAlert}
          />
        )}

        {activeTab === 'agreements' && canViewTab('agreements') && (
          <AdminAgreementsTab
            actorEmail={session.profile.email}
            labs={labs}
            phlebotomists={phlebotomists}
            onShowAlert={onShowAlert}
          />
        )}

        {activeTab === 'master-data' && (
          <AdminMasterCatalogTab
            testCatalog={testCatalog}
            largeLabOrgs={largeLabOrgs}
            commConfig={commConfig}
            catalogOwnerFilter={catalogOwnerFilter}
            onCatalogOwnerFilterChange={setCatalogOwnerFilter}
            onOpenAddTestModal={(type) => openAddTestModal(type)}
            onEditTestModal={openEditTestModal}
            onDeleteTest={(id) => {
              void deleteDiagnosticTest(id);
            }}
            onShowAlert={onShowAlert}
          />
        )}

        {activeTab === 'support-sop-faq' && (
          <AdminSupportManagementTab
            adminEmail={session.profile.email}
            supportContacts={supportContacts}
            onSupportContactsChange={setSupportContacts}
            platformSops={platformSops}
            platformFaqs={platformFaqs}
            onShowAlert={onShowAlert}
          />
        )}

        {activeTab === 'settings' && (
          <AdminSettingsTab
            profileEmail={session.profile.email}
            slaConfig={slaConfig}
            onSlaConfigChange={setSlaConfig}
            emailSettings={emailSettings}
            onEmailSettingsChange={setEmailSettings}
            supportContacts={supportContacts}
            onSupportContactsChange={setSupportContacts}
            featuresConfig={featuresConfig}
            onFeaturesConfigChange={setFeaturesConfig}
            onSaveSettings={async () => {
              await saveAdminSettings({
                sla: slaConfig,
                email: emailSettings,
                adminEmail: session.profile.email,
              });
              await saveSupportContacts(supportContacts, session.profile.email);
              await savePlatformFeatures(featuresConfig, session.profile.email);
              onShowAlert({
                variant: 'success',
                title: 'Settings Saved',
                message: 'Pickup targets, alert preferences, feature controls, and live Support Desk contacts saved successfully.',
              });
            }}
            newAccountPassword={newAccountPassword}
            onNewAccountPasswordChange={setNewAccountPassword}
            confirmAccountPassword={confirmAccountPassword}
            onConfirmAccountPasswordChange={setConfirmAccountPassword}
            savingPassword={savingPassword}
            onUpdateAccountPassword={handleUpdateAccountPassword}
            onSendTestNotification={handleSendTestNotification}
            notifStatusMsg={notifStatusMsg}
            onStorageUploadTest={handleStorageUploadTest}
            storageStatusMsg={storageStatusMsg}
          />
        )}
      </DashboardShell>

      <AdminOnboardingModal
        open={onboardingModal.open}
        presetRole={onboardingModal.presetRole}
        presetCenterType={onboardingModal.presetCenterType}
        onClose={() => setOnboardingModal((prev) => ({ ...prev, open: false }))}
        isSuperAdmin={isSuperAdmin}
        allowAdminRoleCreation={roleScope?.allowAdminRoleCreation ?? (isSuperAdmin || hasAnyPerm('MANAGE_EMPLOYEES'))}
        rootAdminEmail={rootAdminEmail}
        currentUserEmail={session.profile.email}
        currentUserName={session.profile.displayName}
        bearerToken={session.bearerToken}
        largeLabOrgs={largeLabOrgs}
        serviceZones={serviceZones}
        allExistingAssignedCodes={allExistingAssignedCodes}
        onShowAlert={onShowAlert}
        onProvisioned={setOnboardedSlip}
      />

      <AdminEditUserModal
        user={editingUser}
        onClose={() => setEditingUser(null)}
        isSuperAdmin={isSuperAdmin}
        largeLabOrgs={largeLabOrgs}
        onSave={async (updates) => {
          if (!editingUser) return;
          const targetEmail = editingUser.email;
          await updateManagedUserAccess(session.bearerToken, editingUser, updates);
          setEditingUser(null);
          onShowAlert({
            variant: 'success',
            title: 'Access Updated',
            message: `Updated role permissions and facility assignment for ${targetEmail}.`,
          });
        }}
      />

      <AdminSetPasswordModal
        target={pwdTarget}
        onClose={() => setPwdTarget(null)}
        bearerToken={session.bearerToken}
        onSuccessSlip={setOnboardedSlip}
        onShowAlert={onShowAlert}
      />

      <CredentialSlipModal
        slip={onboardedSlip}
        onClose={() => setOnboardedSlip(null)}
      />

      <CatalogItemModal
        open={catalogModalState.open}
        onClose={() => setCatalogModalState({ open: false, editingItem: null, initialType: 'TEST' })}
        mode="ADMIN"
        editingItem={catalogModalState.editingItem}
        initialItemType={catalogModalState.initialType}
        largeLabOrgs={largeLabOrgs}
        singleTestsCatalog={singleTestsCatalog}
        commConfig={commConfig}
        defaultMarkupPct={18}
        formatLabel={formatDashboardLabel}
        onShowAlert={onShowAlert}
        onSave={handleSaveCatalogItem}
      />

      <AdminAssignCourierModal
        order={assignModalOrder}
        phlebotomists={phlebotomists}
        formatLabel={formatDashboardLabel}
        onClose={() => setAssignModalOrder(null)}
        onAssign={handleAssignCourierSubmit}
      />

      <AdminCourierDetailsModal
        courier={selectedCourier}
        onClose={() => setSelectedCourier(null)}
        formatLabel={formatDashboardLabel}
        onOpenAssignZone={(courier) => {
          setSelectedCourier(null);
          setAssignZoneCourier(courier);
        }}
      />

      <AdminAssignPhleboZoneModal
        courier={assignZoneCourier}
        serviceZones={serviceZones}
        actorEmail={session.profile.email}
        onClose={() => setAssignZoneCourier(null)}
        onShowAlert={onShowAlert}
      />

      <OrderLiveTrackingModal
        order={trackingOrder}
        onClose={() => setTrackingOrder(null)}
        phleboCourier={
          trackingOrder ? phlebotomists.find((p) => p.id === trackingOrder.phlebotomistId) : null
        }
        showLiveRouteCard={false}
        showMetadataGrid={true}
        showSpecimensAudit={false}
        formatLabel={formatDashboardLabel}
        headerBadges={
          trackingOrder ? (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="status-pill-blue">{formatOrderStatus(trackingOrder.status)}</span>
              {trackingOrder.serviceZoneName && (
                <span className="zone-coverage-pill covered" style={{ padding: '3px 8px', fontSize: '0.74rem' }}>
                  {trackingOrder.serviceZoneName}
                </span>
              )}
              <SlaCountdownBadge
                isSettled={settlements.find((s) => s.orderId === trackingOrder.id)?.status === 'SETTLED'}
                payoutDueAt={trackingOrder.payoutDueAt}
                completedAt={trackingOrder.completedAt}
                windowMinutes={commConfig.instantPayoutWindowMinutes}
                nowMs={nowTick}
              />
            </div>
          ) : undefined
        }
      />

      <AdminPayoutReleaseModal
        settlement={payoutModalState?.settlement || null}
        initialRecipientType={payoutModalState?.recipientType || 'BOTH'}
        onClose={() => setPayoutModalState(null)}
        onShowAlert={onShowAlert}
      />
    </>
  );
}
