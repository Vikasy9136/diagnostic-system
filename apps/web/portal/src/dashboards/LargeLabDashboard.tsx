import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  type CatalogItemType,
  type CommissionConfig,
  computeDailyVolumeBars,
  computeStatusBreakdown,
  type CustodyEvent,
  CustodyEventType,
  type DiagnosticReportRecord,
  type DiagnosticTestItem,
  type EmailDeliverySettings,
  isOrderCompleted,
  type LabFacility,
  LOCALITY_GPS_PRESETS,
  OrderStatus,
  type PayoutProfile,
  type PayoutRecord,
  type PickupOrder,
  type PlatformNotification,
  type PlatformSlaConfig,
  ROLE_LABELS,
  type SettlementRecord,
  SpecimenQualityStatus,
  UserRole,
  getLargeLabPath,
  getLargeLabTitle,
  resolveLargeLabTab,
} from '@diagnostic/shared';
import { type VerifiedPortalSession } from '../components/LoginPage';
import {
  CatalogItemModal,
  type CatalogItemSaveInput,
  CredentialSlipModal,
  DashboardShell,
  OrderLiveTrackingModal,
  SmallLabOrderChatModal,
} from '../components/shared';
import {
  computeNextAssignedIdForRole,
  DEFAULT_COMMISSION_CONFIG,
  DEFAULT_EMAIL_SETTINGS,
  DEFAULT_PLATFORM_SLA,
  deleteDiagnosticTest,
  publishDiagnosticReport,
  saveDiagnosticTest,
  saveLabFacility,
  subscribeCustodyEvents,
  subscribeLabs,
  subscribeNotifications,
  subscribeOrders,
  subscribePayouts,
  subscribeReports,
  subscribeSettings,
  subscribeSettlements,
  subscribeTestCatalog,
  updateLabOperationsProfile,
  updateOrderCustodyTransition,
} from '../services/firestoreService';
import { provisionBranchFacilityApi } from '../services/orgApiService';
import {
  transitionOrderProcessingStatusApi,
  uploadTestOrCombinedReportApi,
  upsertCatalogueItemApi,
  type WorkflowReportType,
} from '../services/workflowApiService';
import {
  LargeLabAddBranchModal,
  LargeLabAnalyticsTab,
  LargeLabBankingTab,
  LargeLabCentresTab,
  LargeLabIncomingTab,
  type LargeLabMetrics,
  type LargeLabOrgCatalogItems,
  LargeLabOverviewTab,
  LargeLabQcModal,
  LargeLabRatesTab,
  LargeLabReportsTab,
  LargeLabSettingsTab,
  LargeLabSettlementsTab,
  LargeLabWalletTab,
  type LargeLabTab,
  LargeLabTestingTab,
  LargeLabUrgentRequestsTab,
} from './large-lab';
import {
  type AlertTriggerFn,
  type CredentialSlipData,
  formatDashboardLabel,
  type SidebarNavItem,
} from './types';
import { useDashboardPageRouter } from './useDashboardPageRouter';

export type { AlertTriggerFn };

interface LargeLabDashboardProps {
  session: VerifiedPortalSession;
  onSignOut: () => void;
  onShowAlert: AlertTriggerFn;
}

export function LargeLabDashboard({
  session,
  onSignOut,
  onShowAlert,
}: LargeLabDashboardProps) {
    const { activeTab, setActiveTab, getPathForTab } = useDashboardPageRouter<LargeLabTab>({
    resolveTabFromPath: resolveLargeLabTab,
    resolvePathForTab: getLargeLabPath,
    resolveTitleForTab: getLargeLabTitle,
    defaultTab: 'dashboard',
    baseRoleQuery: session.profile.role,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('ALL');
  const [centerFilter, setCenterFilter] = useState<string>('ALL_ORG');

  // Live Data States (ZERO dummy data)
  const [labs, setLabs] = useState<LabFacility[]>([]);
  const [orders, setOrders] = useState<PickupOrder[]>([]);
  const [custodyEvents, setCustodyEvents] = useState<CustodyEvent[]>([]);
  const [reports, setReports] = useState<DiagnosticReportRecord[]>([]);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [testCatalog, setTestCatalog] = useState<DiagnosticTestItem[]>([]);
  const [notifications, setNotifications] = useState<PlatformNotification[]>([]);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [, setSlaConfig] = useState<PlatformSlaConfig>(DEFAULT_PLATFORM_SLA);
  const [commConfig, setCommConfig] = useState<CommissionConfig>(DEFAULT_COMMISSION_CONFIG);
  const [, setEmailSettings] = useState<EmailDeliverySettings>(DEFAULT_EMAIL_SETTINGS);

  // Hub Payout Receiving Details
  const [payoutMethod, setPayoutMethod] = useState<'UPI' | 'BANK_TRANSFER'>('UPI');
  const [payoutHolderName, setPayoutHolderName] = useState('');
  const [payoutUpiId, setPayoutUpiId] = useState('');
  const [payoutBankLast4, setPayoutBankLast4] = useState('');
  const [payoutIfsc, setPayoutIfsc] = useState('');

  // QC Accessioning Modal & Live Tracking Modal
  const [qcOrder, setQcOrder] = useState<PickupOrder | null>(null);
  const [trackingOrder, setTrackingOrder] = useState<PickupOrder | null>(null);
  const [chatOrder, setChatOrder] = useState<PickupOrder | null>(null);
  const [qcTemp, setQcTemp] = useState<string>('4.2');
  const [qcQuality, setQcQuality] = useState<SpecimenQualityStatus>(SpecimenQualityStatus.INTACT);
  const [qcRejectReason, setQcRejectReason] = useState('');
  const [submittingQc, setSubmittingQc] = useState(false);

  // Report Publish Form State
  const [reportOrder, setReportOrder] = useState<PickupOrder | null>(null);
  const [pathologistName, setPathologistName] = useState(
    session.profile.displayName ? `${session.profile.displayName} (Authorized Signatory)` : ''
  );
  const [reportFile, setReportFile] = useState<File | null>(null);
  const [uploadingReport, setUploadingReport] = useState(false);

  // Rate Panel / Package Modal (delegated to shared CatalogItemModal)
  const [showAddTestModal, setShowAddTestModal] = useState(false);
  const [editingCatalogItem, setEditingCatalogItem] = useState<DiagnosticTestItem | null>(null);
  const [initialCatalogType, setInitialCatalogType] = useState<CatalogItemType>('TEST');

  // Add Branch / Collection Center Modal (Main Hub HQ only)
  const [showAddBranchModal, setShowAddBranchModal] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [branchManagerName, setBranchManagerName] = useState('');
  const [branchCity, setBranchCity] = useState('Mumbai');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchPincode, setBranchPincode] = useState('');
  const [branchLat, setBranchLat] = useState<number>(LOCALITY_GPS_PRESETS[0].latitude);
  const [branchLng, setBranchLng] = useState<number>(LOCALITY_GPS_PRESETS[0].longitude);
  const [branchEmail, setBranchEmail] = useState('');
  const [branchPhone, setBranchPhone] = useState('');
  const [branchCreateLogin, setBranchCreateLogin] = useState(true);
  const [branchPassword, setBranchPassword] = useState('');
  const [showBranchPassword, setShowBranchPassword] = useState(false);
  const [savingBranch, setSavingBranch] = useState(false);
  const [branchCredSlip, setBranchCredSlip] = useState<CredentialSlipData | null>(null);

  // Operational Profile Settings Form
  const [settingsName, setSettingsName] = useState(session.profile.displayName || '');
  const [settingsCity, setSettingsCity] = useState('');
  const [settingsAddress, setSettingsAddress] = useState('');
  const [settingsPincode, setSettingsPincode] = useState('');
  const [settingsLat, setSettingsLat] = useState<number>(LOCALITY_GPS_PRESETS[0].latitude);
  const [settingsLng, setSettingsLng] = useState<number>(LOCALITY_GPS_PRESETS[0].longitude);
  const [settingsNabl, setSettingsNabl] = useState('');
  const [settingsCutoff, setSettingsCutoff] = useState('08:30 PM Daily Cutoff');

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!session.firebaseUser) return;
    const unsubs = [
      subscribeLabs(setLabs),
      subscribeOrders(session.profile, setOrders),
      subscribeCustodyEvents(setCustodyEvents),
      subscribeReports(session.profile, setReports),
      subscribeSettlements(session.profile, setSettlements),
      subscribePayouts(session.profile, setPayouts),
      subscribeTestCatalog(setTestCatalog),
      subscribeNotifications(session.profile, setNotifications),
      subscribeSettings(setSlaConfig, setCommConfig, setEmailSettings),
    ];
    return () => unsubs.forEach((u) => u());
  }, [session.firebaseUser, session.profile]);

  const previewBranchId = useMemo(
    () =>
      computeNextAssignedIdForRole({
        role: UserRole.LARGE_LAB,
        centerType: 'COLLECTION_CENTER',
        existingCodes: labs.map((l) => l.userCode || l.id),
      }),
    [labs]
  );

  const myLab = useMemo(() => {
    const match = session.profile.labId ? labs.find((l) => l.id === session.profile.labId) : undefined;
    return match || null;
  }, [labs, session.profile.labId]);

  const orgId = useMemo(
    () => session.profile.parentLabId || myLab?.parentLabId || session.profile.labId || '',
    [session.profile.parentLabId, session.profile.labId, myLab?.parentLabId]
  );

  const isBranchCenter = useMemo(
    () => Boolean(session.profile.parentLabId || myLab?.centerType === 'COLLECTION_CENTER'),
    [session.profile.parentLabId, myLab?.centerType]
  );

  const orgCenters = useMemo(
    () =>
      labs.filter(
        (l) => l.type === 'LARGE_LAB' && orgId && (l.id === orgId || l.parentLabId === orgId)
      ),
    [labs, orgId]
  );

  const orgRootLab = useMemo(
    () => orgCenters.find((l) => l.id === orgId) || myLab,
    [orgCenters, orgId, myLab]
  );

  const activeAgreement = useMemo(
    () => (orgId ? commConfig.largeLabAgreements?.[orgId] : undefined),
    [commConfig.largeLabAgreements, orgId]
  );

  useEffect(() => {
    if (myLab) {
      setSettingsName(myLab.name || session.profile.displayName);
      setSettingsCity(myLab.city || '');
      setSettingsAddress(myLab.address || '');
      setSettingsPincode(myLab.pincode || '');
      setSettingsLat(myLab.latitude ?? LOCALITY_GPS_PRESETS[0].latitude);
      setSettingsLng(myLab.longitude ?? LOCALITY_GPS_PRESETS[0].longitude);
      setSettingsNabl(myLab.nablNumber || '');
      setSettingsCutoff(myLab.cutoffWindow || '08:30 PM Daily Cutoff');
      setPayoutMethod(myLab.payoutProfile?.preferredMethod || 'UPI');
      setPayoutHolderName(myLab.payoutProfile?.accountHolderName || myLab.name || '');
      setPayoutUpiId(myLab.payoutProfile?.upiId || '');
      setPayoutBankLast4(myLab.payoutProfile?.bankAccountLast4 || '');
      setPayoutIfsc(myLab.payoutProfile?.ifscCode || '');
    }
  }, [myLab, session.profile.displayName]);

  const metrics: LargeLabMetrics = useMemo(() => {
    const incomingOrders = orders.filter(
      (o) =>
        o.status === OrderStatus.PICKED_UP ||
        o.status === OrderStatus.IN_TRANSIT ||
        o.status === OrderStatus.DELIVERED_TO_LAB ||
        o.status === OrderStatus.ASSIGNED_TO_PHLEBO
    );
    const inTesting = orders.filter((o) => o.status === OrderStatus.UNDER_ANALYSIS);
    const completed = orders.filter((o) => isOrderCompleted(o.status));
    const totalReceivable = settlements.reduce((s, x) => s + (x.labPayoutInr || 0), 0);
    const paidReceivable = settlements
      .filter((s) => s.labPayoutStatus === 'PAID' || s.status === 'SETTLED')
      .reduce((s, x) => s + (x.labPayoutInr || 0), 0);
    const pendingReceivable = settlements
      .filter((s) => s.labPayoutStatus !== 'PAID' && s.status !== 'SETTLED')
      .reduce((s, x) => s + (x.labPayoutInr || 0), 0);

    const statusBreakdown = computeStatusBreakdown(orders);
    const weeklyBars = computeDailyVolumeBars(orders);

    const turnarounds = reports
      .map((r) => r.turnaroundMinutes)
      .filter((m): m is number => typeof m === 'number');
    const avgTatMins = turnarounds.length
      ? Math.round(turnarounds.reduce((s, x) => s + x, 0) / turnarounds.length)
      : 0;

    return {
      incomingCount: incomingOrders.length,
      inTestingCount: inTesting.length,
      completedCount: completed.length,
      totalReceivable,
      paidReceivable,
      pendingReceivable,
      statusBreakdown,
      weeklyBars,
      avgTatMins,
    };
  }, [orders, settlements, reports]);

  const q = searchQuery.trim().toLowerCase();
  const filteredOrders = orders.filter(
    (o) =>
      (centerFilter === 'ALL_ORG' || o.targetLabId === centerFilter) &&
      (!q ||
        o.orderNumber.toLowerCase().includes(q) ||
        o.smallLabName.toLowerCase().includes(q) ||
        o.targetLabName.toLowerCase().includes(q) ||
        o.patient.pseudonym.toLowerCase().includes(q) ||
        o.specimens.some((s) => s.barcode.toLowerCase().includes(q) || s.testCode.toLowerCase().includes(q)))
  );

  const orgCatalogItems: LargeLabOrgCatalogItems = useMemo(() => {
    const owned = testCatalog.filter(
      (t) =>
        (orgId && (t.ownerOrgId === orgId || t.labId === orgId)) ||
        orgCenters.some((c) => c.id === t.labId)
    );
    const globalFallback = testCatalog.filter(
      (t) => !t.ownerOrgId && !t.labId && !owned.some((o) => o.code === t.code)
    );
    return { owned, globalFallback, singleTests: testCatalog.filter((t) => (t.itemType || 'TEST') === 'TEST') };
  }, [testCatalog, orgId, orgCenters]);

  const testingQueue = filteredOrders.filter(
    (o) =>
      (o.status === OrderStatus.DELIVERED_TO_LAB || o.status === OrderStatus.UNDER_ANALYSIS) &&
      (deptFilter === 'ALL' || (o.department || '').toLowerCase() === deptFilter.toLowerCase())
  );

  function openAddCatalogModal(itemType: CatalogItemType = 'TEST') {
    setEditingCatalogItem(null);
    setInitialCatalogType(itemType);
    setShowAddTestModal(true);
  }

  function openEditCatalogModal(item: DiagnosticTestItem) {
    setEditingCatalogItem(item);
    setInitialCatalogType(item.itemType || 'TEST');
    setShowAddTestModal(true);
  }

  async function handleSaveCatalogItem(input: CatalogItemSaveInput) {
    try {
      await upsertCatalogueItemApi({
        ...input,
        isActive: true,
        isAvailable: true,
      });
    } catch {
      await saveDiagnosticTest({
        ...input,
        isActive: true,
      });
    }
    onShowAlert({
      variant: 'success',
      title: input.itemType === 'PACKAGE' ? 'Health Package Published' : 'Test Tariff Saved',
      message: `${input.code} (${input.name}) is now saved in your verified catalogue.`,
    });
  }

  async function handleQcSubmit(e: FormEvent, decision: 'ACCEPT' | 'REJECT') {
    e.preventDefault();
    if (!qcOrder || !session.firebaseUser) return;
    const numericTemp = Number.parseFloat(qcTemp);
    if (Number.isNaN(numericTemp)) {
      onShowAlert({ variant: 'warning', title: 'Valid Temperature Required', message: 'Enter cooler arrival temperature in °C.' });
      return;
    }
    setSubmittingQc(true);
    try {
      await updateOrderCustodyTransition({
        order: qcOrder,
        nextStatus: decision === 'ACCEPT' ? OrderStatus.DELIVERED_TO_LAB : OrderStatus.REJECTED,
        eventType:
          decision === 'ACCEPT'
            ? CustodyEventType.ACCESSIONED_BY_PARTNER_LAB
            : CustodyEventType.REJECTED_AT_LAB,
        operatorUid: session.firebaseUser.uid,
        operatorName: session.profile.displayName,
        operatorRole: UserRole.LARGE_LAB,
        temperatureCelsius: numericTemp,
        qualityStatus: qcQuality,
        notes:
          decision === 'ACCEPT'
            ? `QC Accessioning Passed (${formatDashboardLabel(qcQuality)}) at ${numericTemp}°C`
            : `Rejected during QC: ${qcRejectReason || formatDashboardLabel(qcQuality)}`,
        extraFields: decision === 'REJECT' ? { rejectionReason: qcRejectReason || formatDashboardLabel(qcQuality) } : undefined,
      });
      setQcOrder(null);
      setQcRejectReason('');
      onShowAlert({
        variant: decision === 'ACCEPT' ? 'success' : 'warning',
        title: decision === 'ACCEPT' ? 'Specimen Accessioned' : 'Specimen Rejected',
        message: `${qcOrder.orderNumber} logged at ${numericTemp}°C (${formatDashboardLabel(qcQuality)}).`,
      });
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'QC Update Failed',
        message: (err as Error).message || 'Could not update specimen status.',
      });
    } finally {
      setSubmittingQc(false);
    }
  }

  async function handleMoveToAnalysis(order: PickupOrder) {
    if (!session.firebaseUser) return;
    await updateOrderCustodyTransition({
      order,
      nextStatus: OrderStatus.UNDER_ANALYSIS,
      eventType: CustodyEventType.ACCESSIONED_BY_PARTNER_LAB,
      operatorUid: session.firebaseUser.uid,
      operatorName: session.profile.displayName,
      operatorRole: UserRole.LARGE_LAB,
      notes: `Loaded onto analyzer (${order.department || 'Core Lab'})`,
    });
    onShowAlert({
      variant: 'success',
      title: 'Testing Started',
      message: `${order.orderNumber} is now Under Analysis.`,
    });
  }

  async function handleTransitionOrderStatus(
    order: PickupOrder,
    nextStatus: OrderStatus,
    remarks?: string
  ) {
    try {
      await transitionOrderProcessingStatusApi(order.id, nextStatus, remarks);
      onShowAlert({
        variant: 'success',
        title: 'Processing Stage Updated',
        message: `${order.orderNumber} moved to ${formatDashboardLabel(nextStatus)}.`,
      });
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Status Transition Blocked',
        message: (err as Error).message || 'Invalid processing stage transition.',
      });
    }
  }

  async function handlePublishReportSubmit(
    e: FormEvent,
    options?: {
      reportType: WorkflowReportType;
      coveredTestIds: string[];
      remarks?: string;
    }
  ) {
    e.preventDefault();
    if (!reportOrder || !session.firebaseUser) return;
    setUploadingReport(true);
    try {
      if (reportFile) {
        const buffer = await reportFile.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 1) {
          binary += String.fromCharCode(bytes[i]);
        }
        const fileBase64 = btoa(binary);
        const result = await uploadTestOrCombinedReportApi(reportOrder.id, {
          reportType: options?.reportType || 'COMBINED',
          coveredTestIds: options?.coveredTestIds || [],
          pathologistName,
          fileName: reportFile.name,
          fileBase64,
          contentType: reportFile.type || 'application/pdf',
          remarks: options?.remarks,
          authorisationStatus: 'AUTHORISED',
        });
        setReportOrder(null);
        setReportFile(null);
        onShowAlert({
          variant: 'success',
          title: `Report ${result.report.id} Published`,
          message: `Private encrypted PDF shared with ${reportOrder.smallLabName}.`,
        });
      } else {
        const rec = await publishDiagnosticReport({
          order: reportOrder,
          pathologistName,
          file: reportFile,
          operatorUid: session.firebaseUser.uid,
          operatorName: session.profile.displayName,
          operatorRole: UserRole.LARGE_LAB,
        });
        setReportOrder(null);
        setReportFile(null);
        onShowAlert({
          variant: 'success',
          title: `Report ${rec.id} Published`,
          message: `Uploaded and shared immediately with ${reportOrder.smallLabName}.`,
        });
      }
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Report Upload Failed',
        message: (err as Error).message || 'Failed to upload report PDF.',
      });
    } finally {
      setUploadingReport(false);
    }
  }

  function openAddBranchModal() {
    setBranchName('');
    setBranchManagerName('');
    setBranchCity(myLab?.city || 'Mumbai');
    setBranchAddress('');
    setBranchPincode('');
    setBranchLat(myLab?.latitude ?? LOCALITY_GPS_PRESETS[0].latitude);
    setBranchLng(myLab?.longitude ?? LOCALITY_GPS_PRESETS[0].longitude);
    setBranchEmail('');
    setBranchPhone('');
    setBranchCreateLogin(true);
    setBranchPassword('');
    setShowBranchPassword(false);
    setShowAddBranchModal(true);
  }

  async function handleSaveBranchCenter(e: FormEvent) {
    e.preventDefault();
    if (!orgId || !branchName.trim()) return;
    const cleanEmail = branchEmail.trim().toLowerCase();
    const cleanPwd = branchPassword.trim();

    if (branchCreateLogin && !cleanEmail) {
      onShowAlert({
        variant: 'warning',
        title: 'Branch Login Email Required',
        message: 'Enter a valid Branch Portal login email, or uncheck separate login to share your Hub login.',
      });
      return;
    }
    if (branchCreateLogin && cleanPwd && cleanPwd.length < 6) {
      onShowAlert({
        variant: 'warning',
        title: 'Password Too Short',
        message: 'Initial branch password must be at least 6 characters (or leave blank for Email OTP / Google Sign-In).',
      });
      return;
    }

    setSavingBranch(true);
    try {
      const apiRes = await provisionBranchFacilityApi(
        {
          parentLabId: orgId,
          name: branchName.trim(),
          city: branchCity.trim() || 'Mumbai',
          address: branchAddress.trim() || `${branchName.trim()}, ${branchCity.trim()}`,
          pincode: branchPincode.trim() || undefined,
          phone: branchPhone.trim() || undefined,
          latitude: Number(branchLat) || LOCALITY_GPS_PRESETS[0].latitude,
          longitude: Number(branchLng) || LOCALITY_GPS_PRESETS[0].longitude,
          serviceRadiusKm: 15,
          nablNumber: myLab?.nablNumber,
          managerName: branchManagerName.trim() || undefined,
          createSeparateLogin: branchCreateLogin,
          email: branchCreateLogin ? cleanEmail : cleanEmail || session.profile.email,
          password: branchCreateLogin && cleanPwd ? cleanPwd : undefined,
        },
        session.bearerToken
      );

      const createdBranchId = apiRes.data?.branchId || previewBranchId;
      const savedName = branchName.trim();
      setShowAddBranchModal(false);
      setBranchName('');
      setBranchManagerName('');
      setBranchAddress('');
      setBranchPincode('');
      setBranchEmail('');
      setBranchPhone('');
      setBranchPassword('');
      setBranchCredSlip({
        title: 'Branch Collection Center Ready',
        headline: `${savedName} is live and selectable by nearby Small Labs!`,
        assignedIdLabel: 'Branch Center ID',
        name: savedName,
        roleLabel: 'Collection Center Branch',
        userCode: createdBranchId,
        email: branchCreateLogin ? cleanEmail : undefined,
        initialPassword: branchCreateLogin && cleanPwd ? cleanPwd : undefined,
        noPasswordMessage: branchCreateLogin
          ? 'Branch user can sign in with Google Sign-In or Email OTP.'
          : 'Managed under your Main Hub HQ login.',
      });
    } catch (err) {
      const msg = (err as Error).message || 'Could not register collection center branch.';
      const isNetworkDown = /failed to fetch|networkerror|network request failed/i.test(msg);
      if (!branchCreateLogin && isNetworkDown) {
        const branchId = previewBranchId;
        const savedName = branchName.trim();
        await saveLabFacility({
          id: branchId,
          userCode: branchId,
          userCodeUpper: branchId.toUpperCase(),
          name: savedName,
          type: 'LARGE_LAB',
          centerType: 'COLLECTION_CENTER',
          parentLabId: orgId,
          parentLabName: orgRootLab?.name || myLab?.name || session.profile.displayName,
          city: branchCity.trim() || 'Mumbai',
          address: branchAddress.trim() || `${savedName}, ${branchCity.trim()}`,
          pincode: branchPincode.trim() || undefined,
          latitude: Number(branchLat) || LOCALITY_GPS_PRESETS[0].latitude,
          longitude: Number(branchLng) || LOCALITY_GPS_PRESETS[0].longitude,
          serviceRadiusKm: 15,
          email: cleanEmail || session.profile.email,
          phone: branchPhone.trim(),
          nablNumber: myLab?.nablNumber,
          verified: true,
          verificationStatus: 'VERIFIED',
          rating: 5.0,
          courierEtaMins: 15,
        });
        setShowAddBranchModal(false);
        setBranchCredSlip({
          title: 'Branch Collection Center Ready',
          headline: `${savedName} is live and selectable by nearby Small Labs!`,
          assignedIdLabel: 'Branch Center ID',
          name: savedName,
          roleLabel: 'Collection Center Branch',
          userCode: branchId,
          noPasswordMessage: 'Managed under your Main Hub HQ login.',
        });
      } else {
        onShowAlert({
          variant: 'error',
          title: 'Branch Registration Error',
          message: msg,
        });
      }
    } finally {
      setSavingBranch(false);
    }
  }

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    if (!session.profile.labId) {
      onShowAlert({
        variant: 'warning',
        title: 'Missing Lab Profile',
        message: 'Ask Admin to link a Reference Lab facility ID to your account.',
      });
      return;
    }
    const payoutProfile: PayoutProfile = {
      preferredMethod: payoutMethod,
      accountHolderName: payoutHolderName.trim() || settingsName.trim(),
      ...(payoutUpiId.trim() ? { upiId: payoutUpiId.trim() } : {}),
      ...(payoutBankLast4.trim() ? { bankAccountLast4: payoutBankLast4.trim().slice(-4) } : {}),
      ...(payoutIfsc.trim() ? { ifscCode: payoutIfsc.trim().toUpperCase() } : {}),
      updatedAt: new Date().toISOString(),
    };
    await updateLabOperationsProfile(session.profile.labId, {
      name: settingsName,
      city: settingsCity,
      address: settingsAddress,
      pincode: settingsPincode.trim() || undefined,
      latitude: Number(settingsLat) || undefined,
      longitude: Number(settingsLng) || undefined,
      nablNumber: settingsNabl,
      cutoffWindow: settingsCutoff,
      payoutProfile,
    });
    onShowAlert({
      variant: 'success',
      title: 'Hub Settings Saved',
      message: 'Facility location and payout receiving details updated successfully.',
    });
  }

  const navItems: SidebarNavItem<LargeLabTab>[] = [
    { id: 'dashboard', icon: '📊', label: 'Lab Overview', path: getPathForTab('dashboard') },
    { id: 'incoming', icon: '🧊', label: 'Incoming & QC', badgeCount: metrics.incomingCount, badgeVariant: 'red', path: getPathForTab('incoming') },
    { id: 'testing', icon: '🔬', label: 'Analyzer Worklist', badgeCount: testingQueue.length, badgeVariant: 'teal', path: getPathForTab('testing') },
    { id: 'reports', icon: '📄', label: 'Upload Reports', badgeCount: reports.length, badgeVariant: 'green', path: getPathForTab('reports') },
    { id: 'urgent-reports', icon: '⚡', label: 'Urgent Requests', path: getPathForTab('urgent-reports') },
    { id: 'rates', icon: '🏷️', label: 'Catalog & Branches', path: getPathForTab('rates') },
    { id: 'centres', icon: '📍', label: 'Collection Centres', path: getPathForTab('centres') },
    { id: 'settlements', icon: '💳', label: 'Settlements', path: getPathForTab('settlements') },
    { id: 'wallet', icon: '💰', label: 'Wallet & Payouts', path: getPathForTab('wallet') },
    { id: 'banking', icon: '🏦', label: 'Banking & Payouts', path: getPathForTab('banking') },
    { id: 'analytics', icon: '📈', label: 'TAT & Analytics', path: getPathForTab('analytics') },
    { id: 'settings', icon: '⚙️', label: 'Facility Settings', path: getPathForTab('settings') },
  ];

  const initials = (session.profile.displayName || 'LL')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <>
      <DashboardShell<LargeLabTab>
        brandSubtitle={isBranchCenter ? 'Collection Center Branch' : 'Reference Lab HQ'}
        navItems={navItems}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        footerCard={{
          icon: '🔬',
          title: myLab?.name || session.profile.displayName,
          subtitle: isBranchCenter ? `Branch • HQ ${orgId}` : `HQ ID: ${session.profile.labId || 'HUB'}`,
          onClick: () => setActiveTab('settings'),
        }}
        searchPlaceholder="Filter by booking ID, vial barcode, source lab, or test code..."
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        notifications={notifications}
        notifTitle="Hub Notifications"
        notifSubtitle={ROLE_LABELS[session.profile.role]}
        notifEmptyText="No hub alerts yet."
        formatLabel={formatDashboardLabel}
        profile={{
          initials,
          displayName: session.profile.displayName,
          userCode: myLab?.userCode || session.profile.userCode || session.profile.labId,
          roleSummary: `${isBranchCenter ? `Branch (${myLab?.id || session.profile.labId})` : 'Main Hub HQ'} • ${session.profile.email}`,
        }}
        onSignOut={onSignOut}
      >
        {activeTab === 'dashboard' && (
          <LargeLabOverviewTab
            myLab={myLab}
            orgId={orgId}
            orgRootLab={orgRootLab}
            orgCenters={orgCenters}
            isBranchCenter={isBranchCenter}
            displayName={session.profile.displayName}
            userCode={session.profile.userCode}
            labId={session.profile.labId}
            centerFilter={centerFilter}
            onCenterFilterChange={setCenterFilter}
            orders={orders}
            filteredOrders={filteredOrders}
            reports={reports}
            metrics={metrics}
            orgCatalogItems={orgCatalogItems}
            activeAgreement={activeAgreement}
            commConfig={commConfig}
            formatLabel={formatDashboardLabel}
            onSelectTab={setActiveTab}
            onTrackOrder={setTrackingOrder}
          />
        )}

        {activeTab === 'incoming' && (
          <LargeLabIncomingTab
            isBranchCenter={isBranchCenter}
            orgCenters={orgCenters}
            centerFilter={centerFilter}
            onCenterFilterChange={setCenterFilter}
            filteredOrders={filteredOrders}
            onTrackOrder={setTrackingOrder}
            onOpenChat={setChatOrder}
            onOpenQc={(o) => {
              setQcOrder(o);
              setQcTemp(String(o.arrivalTemperatureCelsius ?? '4.2'));
              setQcQuality(o.qualityStatus || SpecimenQualityStatus.INTACT);
            }}
          />
        )}

        {activeTab === 'testing' && (
          <LargeLabTestingTab
            testingQueue={testingQueue}
            deptFilter={deptFilter}
            onDeptFilterChange={setDeptFilter}
            onStartRun={handleMoveToAnalysis}
            onTransitionStatus={handleTransitionOrderStatus}
            onOpenReportUpload={(o) => {
              setReportOrder(o);
              setActiveTab('reports');
            }}
          />
        )}

        {activeTab === 'reports' && (
          <LargeLabReportsTab
            orders={orders}
            reports={reports}
            reportOrder={reportOrder}
            onSelectReportOrder={setReportOrder}
            pathologistName={pathologistName}
            onPathologistNameChange={setPathologistName}
            onSelectReportFile={setReportFile}
            uploadingReport={uploadingReport}
            onSubmitReport={handlePublishReportSubmit}
          />
        )}

        {activeTab === 'urgent-reports' && (
          <LargeLabUrgentRequestsTab orders={orders} onAlert={onShowAlert} />
        )}

        {activeTab === 'rates' && (
          <LargeLabRatesTab
            orgCatalogItems={orgCatalogItems}
            activeAgreement={activeAgreement}
            commConfig={commConfig}
            orgCenters={orgCenters}
            isBranchCenter={isBranchCenter}
            formatLabel={formatDashboardLabel}
            onOpenAddCatalogModal={openAddCatalogModal}
            onOpenEditCatalogModal={openEditCatalogModal}
            onConfirmDeleteTest={(t) =>
              onShowAlert({
                variant: 'confirm',
                title: `Delete ${t.code}?`,
                message: `Remove ${t.name} from your Lab's rate card?`,
                onConfirm: () => {
                  void deleteDiagnosticTest(t.id);
                },
              })
            }
            onOpenAddBranchModal={openAddBranchModal}
          />
        )}

        {activeTab === 'centres' && (
          <LargeLabCentresTab
            largeLabId={orgId || session.profile.labId || ''}
            largeLabName={myLab?.name || session.profile.displayName}
            onAlert={onShowAlert}
          />
        )}

        {activeTab === 'settlements' && (
          <LargeLabSettlementsTab
            commConfig={commConfig}
            metrics={metrics}
            settlements={settlements}
            payouts={payouts}
            nowTick={nowTick}
          />
        )}

        {activeTab === 'wallet' && (
          <LargeLabWalletTab onOpenSettings={() => setActiveTab('banking')} />
        )}

        {activeTab === 'banking' && (
          <LargeLabBankingTab onOpenWallet={() => setActiveTab('wallet')} />
        )}

        {activeTab === 'analytics' && (
          <LargeLabAnalyticsTab weeklyBars={metrics.weeklyBars} />
        )}

        {activeTab === 'settings' && (
          <LargeLabSettingsTab
            settingsName={settingsName}
            onSettingsNameChange={setSettingsName}
            settingsLat={settingsLat}
            settingsLng={settingsLng}
            onLocationChange={(loc) => {
              setSettingsLat(loc.latitude);
              setSettingsLng(loc.longitude);
              if (loc.address) setSettingsAddress(loc.address);
              if (loc.city) setSettingsCity(loc.city);
              if (loc.pincode) setSettingsPincode(loc.pincode);
            }}
            settingsCity={settingsCity}
            onSettingsCityChange={setSettingsCity}
            settingsPincode={settingsPincode}
            onSettingsPincodeChange={setSettingsPincode}
            settingsAddress={settingsAddress}
            onSettingsAddressChange={setSettingsAddress}
            settingsNabl={settingsNabl}
            onSettingsNablChange={setSettingsNabl}
            settingsCutoff={settingsCutoff}
            onSettingsCutoffChange={setSettingsCutoff}
            payoutMethod={payoutMethod}
            onPayoutMethodChange={setPayoutMethod}
            payoutHolderName={payoutHolderName}
            onPayoutHolderNameChange={setPayoutHolderName}
            payoutUpiId={payoutUpiId}
            onPayoutUpiIdChange={setPayoutUpiId}
            payoutBankLast4={payoutBankLast4}
            onPayoutBankLast4Change={setPayoutBankLast4}
            payoutIfsc={payoutIfsc}
            onPayoutIfscChange={setPayoutIfsc}
            onSubmitSettings={handleSaveSettings}
          />
        )}
      </DashboardShell>

      <LargeLabQcModal
        qcOrder={qcOrder}
        onClose={() => setQcOrder(null)}
        qcTemp={qcTemp}
        onQcTempChange={setQcTemp}
        qcQuality={qcQuality}
        onQcQualityChange={setQcQuality}
        qcRejectReason={qcRejectReason}
        onQcRejectReasonChange={setQcRejectReason}
        submittingQc={submittingQc}
        onSubmitQc={handleQcSubmit}
        formatLabel={formatDashboardLabel}
      />

      <OrderLiveTrackingModal
        order={trackingOrder}
        onClose={() => setTrackingOrder(null)}
        titlePrefix="Live Pickup & Specimen Proof"
        fallbackDropLat={myLab?.latitude || 19.076}
        fallbackDropLng={myLab?.longitude || 72.8777}
        fallbackDropAddress={myLab?.address}
        custodyTimeline={
          trackingOrder
            ? custodyEvents.filter((ev) => ev.orderId === trackingOrder.id).slice(0, 8)
            : undefined
        }
        formatLabel={formatDashboardLabel}
        onOpenChat={setChatOrder}
      />

      <SmallLabOrderChatModal
        open={Boolean(chatOrder)}
        order={chatOrder}
        labName={myLab?.name || 'Reference Lab'}
        senderRole="LARGE_LAB"
        onClose={() => setChatOrder(null)}
      />

      <CatalogItemModal
        open={showAddTestModal}
        onClose={() => {
          setShowAddTestModal(false);
          setEditingCatalogItem(null);
        }}
        mode="LARGE_LAB"
        editingItem={editingCatalogItem}
        initialItemType={initialCatalogType}
        fixedOrgId={orgId || session.profile.labId || 'LARGE_HUB'}
        fixedOrgName={orgRootLab?.name || myLab?.name || session.profile.displayName}
        singleTestsCatalog={orgCatalogItems.singleTests}
        commConfig={commConfig}
        defaultMarkupPct={Math.round((commConfig.commissionPct || 15) * 1.2)}
        formatLabel={formatDashboardLabel}
        onShowAlert={onShowAlert}
        onSave={handleSaveCatalogItem}
      />

      <LargeLabAddBranchModal
        open={showAddBranchModal}
        onClose={() => setShowAddBranchModal(false)}
        previewBranchId={previewBranchId}
        defaultContactEmail={session.profile.email}
        branchName={branchName}
        onBranchNameChange={setBranchName}
        branchManagerName={branchManagerName}
        onBranchManagerNameChange={setBranchManagerName}
        branchLat={branchLat}
        branchLng={branchLng}
        onBranchLocationChange={(loc) => {
          setBranchLat(loc.latitude);
          setBranchLng(loc.longitude);
          if (loc.city) setBranchCity(loc.city);
          if (loc.address) setBranchAddress(loc.address);
          if (loc.pincode) setBranchPincode(loc.pincode);
        }}
        branchCity={branchCity}
        onBranchCityChange={setBranchCity}
        branchPincode={branchPincode}
        onBranchPincodeChange={setBranchPincode}
        branchPhone={branchPhone}
        onBranchPhoneChange={setBranchPhone}
        branchAddress={branchAddress}
        onBranchAddressChange={setBranchAddress}
        branchCreateLogin={branchCreateLogin}
        onBranchCreateLoginChange={setBranchCreateLogin}
        branchEmail={branchEmail}
        onBranchEmailChange={setBranchEmail}
        branchPassword={branchPassword}
        onBranchPasswordChange={setBranchPassword}
        showBranchPassword={showBranchPassword}
        onToggleShowBranchPassword={() => setShowBranchPassword((s) => !s)}
        savingBranch={savingBranch}
        onSubmitBranch={handleSaveBranchCenter}
      />

      <CredentialSlipModal slip={branchCredSlip} onClose={() => setBranchCredSlip(null)} />
    </>
  );
}
