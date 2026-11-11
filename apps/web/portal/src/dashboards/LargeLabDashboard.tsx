import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  type CatalogItemType,
  type CommissionConfig,
  computeDailyVolumeBars,
  computeStatusBreakdown,
  CustodyEvent,
  CustodyEventType,
  DiagnosticReportRecord,
  DiagnosticTestItem,
  EmailDeliverySettings,
  formatInr,
  formatOrderStatus,
  isOrderCompleted,
  LABSETU_THEME,
  LabFacility,
  LOCALITY_GPS_PRESETS,
  OrderStatus,
  PayoutRecord,
  PickupOrder,
  PlatformNotification,
  PlatformSlaConfig,
  ROLE_LABELS,
  SettlementRecord,
  SpecimenQualityStatus,
  SpecimenType,
  StorageTemperature,
  TUBE_METADATA,
  TubeType,
  UserRole,
  type DiagnosticDepartment,
  type PayoutProfile,
} from '@diagnostic/shared';
import { type VerifiedPortalSession } from '../components/LoginPage';
import { type DynamicAlertVariant } from '../components/DynamicAlertModal';
import {
  DEFAULT_COMMISSION_CONFIG,
  DEFAULT_EMAIL_SETTINGS,
  DEFAULT_PLATFORM_SLA,
  deleteDiagnosticTest,
  markNotificationRead,
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

export type AlertTriggerFn = (opts: {
  variant: DynamicAlertVariant;
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
}) => void;

interface LargeLabDashboardProps {
  session: VerifiedPortalSession;
  onSignOut: () => void;
  onShowAlert: AlertTriggerFn;
}

type LargeLabTab =
  | 'dashboard'
  | 'incoming'
  | 'testing'
  | 'reports'
  | 'rates'
  | 'settlements'
  | 'analytics'
  | 'settings';

export function LargeLabDashboard({
  session,
  onSignOut,
  onShowAlert,
}: LargeLabDashboardProps) {
  const [activeTab, setActiveTab] = useState<LargeLabTab>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);
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
  const [qcTemp, setQcTemp] = useState<string>('4.2');
  const [qcQuality, setQcQuality] = useState<SpecimenQualityStatus>(SpecimenQualityStatus.INTACT);
  const [qcRejectReason, setQcRejectReason] = useState('');
  const [submittingQc, setSubmittingQc] = useState(false);

  // Report Publish Modal
  const [reportOrder, setReportOrder] = useState<PickupOrder | null>(null);
  const [pathologistName, setPathologistName] = useState(
    session.profile.displayName ? `${session.profile.displayName} (Authorized Signatory)` : ''
  );
  const [reportFile, setReportFile] = useState<File | null>(null);
  const [uploadingReport, setUploadingReport] = useState(false);

  // Rate Panel / Package Modal
  const [showAddTestModal, setShowAddTestModal] = useState(false);
  const [editingTestId, setEditingTestId] = useState<string | null>(null);
  const [testItemType, setTestItemType] = useState<CatalogItemType>('TEST');
  const [testIncludedCodes, setTestIncludedCodes] = useState<string[]>([]);
  const [testCustomCodesInput, setTestCustomCodesInput] = useState('');
  const [testCode, setTestCode] = useState('');
  const [testName, setTestName] = useState('');
  const [testDept, setTestDept] = useState<DiagnosticDepartment>('Hematology');
  const [testSpecimen, setTestSpecimen] = useState<SpecimenType>(SpecimenType.BLOOD);
  const [testTube, setTestTube] = useState<TubeType>(TubeType.EDTA_LAVENDER);
  const [testTemp, setTestTemp] = useState<StorageTemperature>(StorageTemperature.REFRIGERATED);
  const [testTat, setTestTat] = useState(4);
  const [testLargeLabRate, setTestLargeLabRate] = useState(200);
  const [testB2bPrice, setTestB2bPrice] = useState(250);
  const [testMrp, setTestMrp] = useState(500);

  // Add Branch / Collection Center Modal (Main Hub HQ only)
  const [showAddBranchModal, setShowAddBranchModal] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [branchCity, setBranchCity] = useState('Mumbai');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchPincode, setBranchPincode] = useState('');
  const [branchLat, setBranchLat] = useState<number>(LOCALITY_GPS_PRESETS[0].latitude);
  const [branchLng, setBranchLng] = useState<number>(LOCALITY_GPS_PRESETS[0].longitude);
  const [branchEmail, setBranchEmail] = useState('');
  const [branchPhone, setBranchPhone] = useState('');

  // Operational Profile Settings Form
  const [settingsName, setSettingsName] = useState(session.profile.displayName || '');
  const [settingsCity, setSettingsCity] = useState('');
  const [settingsAddress, setSettingsAddress] = useState('');
  const [settingsPincode, setSettingsPincode] = useState('');
  const [settingsLat, setSettingsLat] = useState<number>(LOCALITY_GPS_PRESETS[0].latitude);
  const [settingsLng, setSettingsLng] = useState<number>(LOCALITY_GPS_PRESETS[0].longitude);
  const [settingsNabl, setSettingsNabl] = useState('');
  const [settingsCutoff, setSettingsCutoff] = useState('08:30 PM Daily Cutoff');

  const formatLabel = (raw: string) =>
    raw
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());

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

  const metrics = useMemo(() => {
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

  const orgCatalogItems = useMemo(() => {
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

  const unreadCount = notifications.filter((n) => !n.read).length;

  function openAddCatalogModal(itemType: CatalogItemType = 'TEST') {
    setEditingTestId(null);
    setTestItemType(itemType);
    setTestIncludedCodes([]);
    setTestCustomCodesInput('');
    setTestCode('');
    setTestName('');
    setTestDept(itemType === 'PACKAGE' ? 'Preventive Health' : 'Hematology');
    setTestSpecimen(SpecimenType.BLOOD);
    setTestTube(TubeType.EDTA_LAVENDER);
    setTestTemp(StorageTemperature.REFRIGERATED);
    setTestTat(itemType === 'PACKAGE' ? 12 : 4);
    const defaultB2b = itemType === 'PACKAGE' ? 680 : 190;
    const markup = activeAgreement?.b2bMarkupPct ?? Math.round((commConfig.commissionPct || 15) * 1.2);
    setTestLargeLabRate(defaultB2b);
    setTestB2bPrice(Math.round(defaultB2b * (1 + markup / 100)));
    setTestMrp(itemType === 'PACKAGE' ? 1500 : 500);
    setShowAddTestModal(true);
  }

  function openEditCatalogModal(item: DiagnosticTestItem) {
    const isOwned = Boolean(orgId && (item.ownerOrgId === orgId || item.labId === orgId));
    setEditingTestId(isOwned ? item.id : null);
    setTestItemType(item.itemType || 'TEST');
    setTestIncludedCodes(item.includedTestCodes || []);
    setTestCustomCodesInput('');
    setTestCode(item.code);
    setTestName(item.name);
    setTestDept(item.department);
    setTestSpecimen(item.specimenType);
    setTestTube(item.tubeType);
    setTestTemp(item.temperatureRequirement);
    setTestTat(item.tatHours);
    const baseRate =
      typeof item.largeLabB2bRateInr === 'number'
        ? item.largeLabB2bRateInr
        : Math.round((item.b2bPriceInr || 250) * (1 - (activeAgreement?.agreedCommissionPct ?? commConfig.commissionPct ?? 15) / 100));
    setTestLargeLabRate(baseRate);
    setTestB2bPrice(item.b2bPriceInr);
    setTestMrp(item.mrpInr);
    setShowAddTestModal(true);
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
            ? `QC Accessioning Passed (${formatLabel(qcQuality)}) at ${numericTemp}°C`
            : `Rejected during QC: ${qcRejectReason || formatLabel(qcQuality)}`,
        extraFields: decision === 'REJECT' ? { rejectionReason: qcRejectReason || formatLabel(qcQuality) } : undefined,
      });
      setQcOrder(null);
      setQcRejectReason('');
      onShowAlert({
        variant: decision === 'ACCEPT' ? 'success' : 'warning',
        title: decision === 'ACCEPT' ? 'Specimen Accessioned' : 'Specimen Rejected',
        message: `${qcOrder.orderNumber} logged at ${numericTemp}°C (${formatLabel(qcQuality)}).`,
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

  async function handlePublishReportSubmit(e: FormEvent) {
    e.preventDefault();
    if (!reportOrder || !session.firebaseUser) return;
    setUploadingReport(true);
    try {
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

  async function handleSaveRatePanel(e: FormEvent) {
    e.preventDefault();
    const cleanCode = testCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!cleanCode || !testName.trim()) return;

    const customCodes = testCustomCodesInput
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const mergedIncludedCodes =
      testItemType === 'PACKAGE'
        ? Array.from(new Set([...testIncludedCodes, ...customCodes]))
        : undefined;

    if (testItemType === 'PACKAGE' && (!mergedIncludedCodes || mergedIncludedCodes.length < 2)) {
      onShowAlert({
        variant: 'warning',
        title: 'Include At Least 2 Tests',
        message: 'A combo package must map to at least 2 test codes so Small Lab quotes match automatically.',
      });
      return;
    }

    const ownerKey = orgId || session.profile.labId || 'LARGE_HUB';
    const docId = editingTestId || `${ownerKey}__${cleanCode}`;

    await saveDiagnosticTest({
      id: docId,
      code: cleanCode,
      name: testName.trim(),
      itemType: testItemType,
      includedTestCodes: mergedIncludedCodes,
      department: testDept,
      specimenType: testSpecimen,
      tubeType: testTube,
      temperatureRequirement: testTemp,
      tatHours: Number(testTat) || 4,
      largeLabB2bRateInr: Number(testLargeLabRate) || 0,
      b2bPriceInr: Number(testB2bPrice) || 250,
      mrpInr: Number(testMrp) || 500,
      isActive: true,
      ownerOrgId: ownerKey,
      labId: ownerKey,
      labName: orgRootLab?.name || myLab?.name || session.profile.displayName,
    });
    setShowAddTestModal(false);
    setEditingTestId(null);
    setTestCode('');
    setTestName('');
    onShowAlert({
      variant: 'success',
      title: testItemType === 'PACKAGE' ? 'Health Package Published' : 'Test Tariff Saved',
      message: `${cleanCode} (${testName.trim()}) is now live for Small Collection Labs to compare & book.`,
    });
  }

  async function handleSaveBranchCenter(e: FormEvent) {
    e.preventDefault();
    if (!orgId || !branchName.trim()) return;
    const branchId = `LAB-CC-${Date.now().toString().slice(-4)}`;
    await saveLabFacility({
      id: branchId,
      name: branchName.trim(),
      type: 'LARGE_LAB',
      centerType: 'COLLECTION_CENTER',
      parentLabId: orgId,
      parentLabName: orgRootLab?.name || myLab?.name || session.profile.displayName,
      city: branchCity.trim() || 'Mumbai',
      address: branchAddress.trim() || `${branchName.trim()}, ${branchCity.trim()}`,
      pincode: branchPincode.trim() || undefined,
      latitude: Number(branchLat) || LOCALITY_GPS_PRESETS[0].latitude,
      longitude: Number(branchLng) || LOCALITY_GPS_PRESETS[0].longitude,
      serviceRadiusKm: 15,
      email: branchEmail.trim().toLowerCase() || session.profile.email,
      phone: branchPhone.trim(),
      nablNumber: myLab?.nablNumber,
      verified: true,
      verificationStatus: 'VERIFIED',
      rating: 5.0,
      courierEtaMins: 15,
    });
    setShowAddBranchModal(false);
    setBranchName('');
    setBranchAddress('');
    setBranchPincode('');
    setBranchEmail('');
    setBranchPhone('');
    onShowAlert({
      variant: 'success',
      title: `Branch Registered (${branchId})`,
      message: `${branchName.trim()} is now selectable by nearby Small Labs. Ask Platform Admin in Users & Roles to assign a separate login email to ${branchId} if branch staff need an independent login.`,
    });
  }

  const C = 301.6;
  const totalDonut = Math.max(1, metrics.statusBreakdown.total);
  const compLen = (metrics.statusBreakdown.completed / totalDonut) * C;
  const progLen = (metrics.statusBreakdown.inProgress / totalDonut) * C;
  const assignLen = (metrics.statusBreakdown.assigned / totalDonut) * C;

  const initials = (session.profile.displayName || 'LL')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="app-shell">
      <aside className="sidebar-dark">
        <div className="brand-header">
          <div className="brand-logo-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M10 2v7.31M14 2v7.31M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0" />
            </svg>
          </div>
          <div className="brand-title-wrap">
            <span className="brand-title">{LABSETU_THEME.brand.name}</span>
            <span className="brand-subtitle">{isBranchCenter ? 'Collection Center Branch' : 'Reference Lab HQ'}</span>
          </div>
        </div>

        <ul className="sidebar-nav">
          <li className={`sidebar-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            <span>📊</span>
            <span>Lab Overview</span>
          </li>
          <li className={`sidebar-nav-item ${activeTab === 'incoming' ? 'active' : ''}`} onClick={() => setActiveTab('incoming')}>
            <span>🧊</span>
            <span>Incoming &amp; QC</span>
            <span className="nav-badge-red">{metrics.incomingCount}</span>
          </li>
          <li className={`sidebar-nav-item ${activeTab === 'testing' ? 'active' : ''}`} onClick={() => setActiveTab('testing')}>
            <span>🔬</span>
            <span>Analyzer Worklist</span>
            <span className="nav-badge-teal">{testingQueue.length}</span>
          </li>
          <li className={`sidebar-nav-item ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>
            <span>📄</span>
            <span>Upload Reports</span>
            <span className="nav-badge-green">{reports.length}</span>
          </li>
          <li className={`sidebar-nav-item ${activeTab === 'rates' ? 'active' : ''}`} onClick={() => setActiveTab('rates')}>
            <span>🏷️</span>
            <span>Catalog &amp; Branches</span>
          </li>
          <li className={`sidebar-nav-item ${activeTab === 'settlements' ? 'active' : ''}`} onClick={() => setActiveTab('settlements')}>
            <span>💳</span>
            <span>Settlements</span>
          </li>
          <li className={`sidebar-nav-item ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>
            <span>📈</span>
            <span>TAT &amp; Analytics</span>
          </li>
          <li className={`sidebar-nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
            <span>⚙️</span>
            <span>Facility Settings</span>
          </li>
        </ul>

        <div className="sidebar-footer-card" onClick={() => setActiveTab('settings')}>
          <div className="sidebar-footer-icon">🔬</div>
          <div>
            <div className="sidebar-footer-title">{myLab?.name || session.profile.displayName}</div>
            <div className="sidebar-footer-subtitle">
              {isBranchCenter ? `Branch • HQ ${orgId}` : `HQ ID: ${session.profile.labId || 'HUB'}`}
            </div>
          </div>
        </div>
      </aside>

      <div className="main-wrapper">
        <header className="top-navbar">
          <div className="top-search-pill">
            <span>🔍</span>
            <input
              type="text"
              placeholder="Filter by booking ID, vial barcode, source lab, or test code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="top-nav-right">
            <div className="notif-wrapper">
              <div className="nav-icon-circle" onClick={() => setNotifOpen(!notifOpen)}>
                <span>🔔</span>
                {unreadCount > 0 && <span className="notif-count-badge">{unreadCount}</span>}
              </div>

              {notifOpen && (
                <div className="notif-popover">
                  <div className="notif-popover-header">
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700 }}>Hub Notifications</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{ROLE_LABELS[session.profile.role]}</div>
                    </div>
                  </div>
                  <div className="notif-list">
                    {notifications.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', fontSize: '0.82rem', color: '#64748B' }}>
                        No hub alerts yet.
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`notif-item ${!n.read ? 'unread' : ''}`}
                          onClick={() => void markNotificationRead(n.id)}
                        >
                          <div className="notif-item-title">{n.title}</div>
                          <div className="notif-item-msg">{n.message}</div>
                          <div className="notif-item-meta">
                            <span>{formatLabel(n.category)}</span>
                            <span>{new Date(n.createdAt).toLocaleString('en-IN')}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="user-profile-badge">
              <div className="user-photo-avatar">{initials}</div>
              <div className="user-profile-info">
                <span className="user-profile-name">{session.profile.displayName}</span>
                <span className="user-profile-role">
                  {isBranchCenter ? `Branch (${myLab?.id || session.profile.labId})` : 'Main Hub HQ'} • {session.profile.email}
                </span>
              </div>
              <button type="button" className="signout-btn" onClick={onSignOut}>
                Sign Out
              </button>
            </div>
          </div>
        </header>

        <main className="dashboard-content">
          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <>
              <div className="page-header-row">
                <div className="page-title-group">
                  <h1>{isBranchCenter ? 'Collection Center Branch Dashboard' : 'Reference Lab Hub Dashboard'}</h1>
                  <p>
                    {myLab?.name || session.profile.displayName}
                    {isBranchCenter && orgRootLab ? ` (Branch under ${orgRootLab.name})` : ` — ${orgCenters.length} Connected Center(s)`}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {!isBranchCenter && orgCenters.length > 1 && (
                    <select
                      className="form-select"
                      style={{ width: '210px' }}
                      value={centerFilter}
                      onChange={(e) => setCenterFilter(e.target.value)}
                    >
                      <option value="ALL_ORG">All Org Centers ({orders.length})</option>
                      {orgCenters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.centerType === 'COLLECTION_CENTER' ? 'Branch' : 'Main HQ'})
                        </option>
                      ))}
                    </select>
                  )}
                  <button type="button" className="btn-primary" onClick={() => setActiveTab('incoming')}>
                    🧊 Open QC Queue ({metrics.incomingCount})
                  </button>
                </div>
              </div>

              <section className="kpi-5-row">
                <div className="kpi-card-modern">
                  <div className="kpi-icon-box-blue">🧊</div>
                  <div className="kpi-body">
                    <span className="kpi-title">Incoming Specimens</span>
                    <span className="kpi-main-number">{metrics.incomingCount}</span>
                    <span className="kpi-sub-split">In transit / awaiting QC</span>
                  </div>
                </div>
                <div className="kpi-card-modern">
                  <div className="kpi-icon-box-mint">🔬</div>
                  <div className="kpi-body">
                    <span className="kpi-title">Under Analysis</span>
                    <span className="kpi-main-number">{metrics.inTestingCount}</span>
                    <span className="kpi-sub-split">Active bench queue</span>
                  </div>
                </div>
                <div className="kpi-card-modern">
                  <div className="kpi-icon-box-green">📄</div>
                  <div className="kpi-body">
                    <span className="kpi-title">Verified Reports</span>
                    <span className="kpi-main-number">{reports.length}</span>
                    <span className="kpi-sub-split">Avg TAT: {metrics.avgTatMins ? `${metrics.avgTatMins} mins` : '—'}</span>
                  </div>
                </div>
                <div className="kpi-card-modern">
                  <div className="kpi-icon-box-indigo">🏷️</div>
                  <div className="kpi-body">
                    <span className="kpi-title">Org Tests &amp; Packages</span>
                    <span className="kpi-main-number">{orgCatalogItems.owned.length}</span>
                    <span className="kpi-sub-split">+{orgCatalogItems.globalFallback.length} global baseline</span>
                  </div>
                </div>
                <div className="kpi-card-modern">
                  <div className="kpi-icon-box-purple">₹</div>
                  <div className="kpi-body">
                    <span className="kpi-title">Lab Receivables</span>
                    <span className="kpi-main-number">{formatInr(metrics.totalReceivable)}</span>
                    <span className="kpi-sub-split">{formatInr(metrics.pendingReceivable)} unsettled</span>
                  </div>
                </div>
              </section>

              <section className="bottom-3-row">
                <div className="chart-card-modern">
                  <div className="card-top-header">
                    <span className="card-top-title">Incoming &amp; Live Pickups</span>
                    <button type="button" className="btn-link-muted" onClick={() => setActiveTab('incoming')}>
                      Open QC Queue →
                    </button>
                  </div>
                  {filteredOrders.length === 0 ? (
                    <div className="empty-state-box">
                      <h4>No Specimens Routed Yet</h4>
                      <p>Live bookings sent to {isBranchCenter ? 'this Collection Center' : 'your Reference Lab organization'} appear here right away.</p>
                    </div>
                  ) : (
                    <div className="data-table-container">
                      <table className="modern-data-table">
                        <thead>
                          <tr>
                            <th>Order ID</th>
                            <th>Source Lab</th>
                            <th>Courier &amp; Live GPS</th>
                            <th>Tests</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredOrders.slice(0, 6).map((o) => (
                            <tr key={o.id}>
                              <td>
                                <strong>{o.orderNumber}</strong>
                                {o.targetLabName && <div style={{ fontSize: '0.7rem', color: '#64748B' }}>{o.targetLabName}</div>}
                              </td>
                              <td>{o.smallLabName}</td>
                              <td>
                                {o.phlebotomistName ? (
                                  <div>
                                    <strong>{o.phlebotomistName}</strong>
                                    {o.phleboLiveLocation && (
                                      <div>
                                        <button
                                          type="button"
                                          className="btn-link-muted"
                                          style={{ fontSize: '0.74rem' }}
                                          onClick={() => setTrackingOrder(o)}
                                        >
                                          📍 Track Route
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span style={{ color: '#64748B' }}>Broadcasting (1–5 km)</span>
                                )}
                              </td>
                              <td>{o.specimens.map((s) => s.testCode).join(', ')}</td>
                              <td><span className="status-pill-blue">{formatOrderStatus(o.status)}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="chart-card-modern">
                  <div className="card-top-header"><span className="card-top-title">Processing Distribution</span></div>
                  <div className="donut-chart-layout">
                    <div className="donut-svg-wrap">
                      <svg width="120" height="120" viewBox="0 0 120 120">
                        <circle cx="60" cy="60" r="48" fill="none" stroke="#F1F5F9" strokeWidth="18" />
                        {metrics.statusBreakdown.total > 0 && (
                          <>
                            <circle cx="60" cy="60" r="48" fill="none" stroke="#10B981" strokeWidth="18" strokeDasharray={`${compLen} ${C}`} strokeDashoffset="75" />
                            <circle cx="60" cy="60" r="48" fill="none" stroke="#2563EB" strokeWidth="18" strokeDasharray={`${progLen} ${C}`} strokeDashoffset={75 - compLen} />
                            <circle cx="60" cy="60" r="48" fill="none" stroke="#F59E0B" strokeWidth="18" strokeDasharray={`${assignLen} ${C}`} strokeDashoffset={75 - compLen - progLen} />
                          </>
                        )}
                      </svg>
                      <div className="donut-center-label">
                        <div className="donut-center-number">{metrics.statusBreakdown.total}</div>
                        <div className="donut-center-sub">Orders</div>
                      </div>
                    </div>
                    <div className="donut-legend-list">
                      <div className="donut-legend-item"><span>● Reported</span><strong>{metrics.statusBreakdown.completed}</strong></div>
                      <div className="donut-legend-item"><span>● QC / Testing</span><strong>{metrics.statusBreakdown.inProgress}</strong></div>
                      <div className="donut-legend-item"><span>● Pre-Delivery</span><strong>{metrics.statusBreakdown.assigned}</strong></div>
                      <div className="donut-legend-item"><span>● Rejected</span><strong>{metrics.statusBreakdown.rejected}</strong></div>
                    </div>
                  </div>
                </div>

                <div className="chart-card-modern">
                  <div className="card-top-header"><span className="card-top-title">Hub &amp; Contract Info</span></div>
                  <div className="network-list-item"><span>Center ID</span><strong>{session.profile.labId || 'N/A'}</strong></div>
                  <div className="network-list-item"><span>Hierarchy</span><strong>{isBranchCenter ? `Branch of ${orgId}` : `Main Hub (${orgCenters.length} centers)`}</strong></div>
                  <div className="network-list-item"><span>NABL Cert</span><strong>{myLab?.nablNumber || 'NABL ISO 15189'}</strong></div>
                  <div className="network-list-item"><span>B2B Commission</span><strong>{activeAgreement ? `${activeAgreement.agreedCommissionPct}% Agreed` : `${commConfig.commissionPct}% Standard`}</strong></div>
                  <div className="network-list-item"><span>Verification</span><span className="status-pill-green">{formatLabel(myLab?.verificationStatus || 'VERIFIED')}</span></div>
                </div>
              </section>
            </>
          )}

          {/* TAB 2: INCOMING SAMPLES & QC */}
          {activeTab === 'incoming' && (
            <div className="chart-card-modern">
              <div className="card-top-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h2 className="card-top-title">Incoming Cold-Chain Receiving &amp; QC Accessioning ({filteredOrders.length})</h2>
                  <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
                    Monitor live phlebotomist GPS, inspect uploaded sample photos &amp; tube barcode scans, and log cooler temperature (2°C – 8°C)
                  </p>
                </div>
                {!isBranchCenter && orgCenters.length > 1 && (
                  <select
                    className="form-select"
                    style={{ width: '210px' }}
                    value={centerFilter}
                    onChange={(e) => setCenterFilter(e.target.value)}
                  >
                    <option value="ALL_ORG">All Org Centers</option>
                    {orgCenters.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
              </div>
              {filteredOrders.length === 0 ? (
                <div className="empty-state-box"><h4>No Incoming Orders</h4><p>Dispatched bookings destined for your Reference Lab appear here in real time.</p></div>
              ) : (
                <div className="data-table-container">
                  <table className="modern-data-table">
                    <thead>
                      <tr>
                        <th>Booking ID &amp; Center</th>
                        <th>Source Lab &amp; Patient</th>
                        <th>Tubes &amp; Barcode Checks</th>
                        <th>Phlebotomist / Proof</th>
                        <th>Temp (°C)</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((o) => {
                        const verifiedCount = o.specimens.filter((s) => s.validationStatus === 'VERIFIED').length;
                        const mismatchCount = o.specimens.filter((s) => s.validationStatus === 'MISMATCH').length;
                        return (
                          <tr key={o.id}>
                            <td>
                              <strong>{o.orderNumber}</strong>
                              <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{o.targetLabName}</div>
                            </td>
                            <td>
                              <div>{o.smallLabName}</div>
                              <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{o.patient.pseudonym}</div>
                            </td>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {o.specimens.map((s) => {
                                  const tubeMeta = TUBE_METADATA[s.tubeType] || TUBE_METADATA[TubeType.SERUM_RED_GOLD];
                                  return (
                                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontSize: '0.76rem' }}>
                                      <span className="tube-cap-pill" style={{ background: tubeMeta.bgHex, color: tubeMeta.colorHex }}>
                                        <span className="tube-cap-dot" style={{ background: tubeMeta.colorHex }} />
                                        {s.testCode}
                                      </span>
                                      <code>{s.scannedBarcode || s.barcode}</code>
                                      {s.validationStatus === 'VERIFIED' && <span style={{ color: '#059669', fontWeight: 700 }}>✓</span>}
                                      {s.validationStatus === 'MISMATCH' && <span style={{ color: '#DC2626', fontWeight: 700 }}>⚠ Mismatch</span>}
                                    </div>
                                  );
                                })}
                                {o.specimens.length > 0 && (
                                  <div style={{ fontSize: '0.7rem', color: mismatchCount > 0 ? '#DC2626' : '#64748B' }}>
                                    {verifiedCount}/{o.specimens.length} tubes barcode-verified
                                  </div>
                                )}
                              </div>
                            </td>
                            <td>
                              <div><strong>{o.phlebotomistName || 'Broadcasting'}</strong></div>
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                                {(o.phleboLiveLocation || o.sampleCollectionPhotoUrl) && (
                                  <button type="button" className="btn-link-muted" style={{ fontSize: '0.74rem' }} onClick={() => setTrackingOrder(o)}>
                                    {o.sampleCollectionPhotoUrl ? '📷 Photo & 📍 Live' : '📍 Live Location'}
                                  </button>
                                )}
                              </div>
                            </td>
                            <td>{o.arrivalTemperatureCelsius !== undefined ? `${o.arrivalTemperatureCelsius}°C` : 'Pending Check'}</td>
                            <td><span className="status-pill-blue">{formatOrderStatus(o.status)}</span></td>
                            <td>
                              <button
                                type="button"
                                className="btn-primary"
                                onClick={() => {
                                  setQcOrder(o);
                                  setQcTemp(String(o.arrivalTemperatureCelsius ?? '4.2'));
                                  setQcQuality(o.qualityStatus || SpecimenQualityStatus.INTACT);
                                }}
                              >
                                Perform QC
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ANALYZER TESTING WORKLIST */}
          {activeTab === 'testing' && (
            <div className="chart-card-modern">
              <div className="card-top-header">
                <h2 className="card-top-title">Department Analyzer Queue ({testingQueue.length})</h2>
                <select className="form-select" style={{ width: '190px' }} value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
                  <option value="ALL">All Departments</option>
                  <option value="Hematology">Hematology</option>
                  <option value="Biochemistry">Biochemistry</option>
                  <option value="Immunology">Immunology</option>
                  <option value="Molecular">Molecular</option>
                  <option value="Microbiology">Microbiology</option>
                </select>
              </div>
              {testingQueue.length === 0 ? (
                <div className="empty-state-box">
                  <h4>No Samples in Testing Queue</h4>
                  <p>Perform QC accessioning in Incoming Samples to move specimens onto analyzers.</p>
                </div>
              ) : (
                <div className="data-table-container">
                  <table className="modern-data-table">
                    <thead>
                      <tr>
                        <th>Booking ID</th>
                        <th>Patient</th>
                        <th>Department</th>
                        <th>Tests</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {testingQueue.map((o) => (
                        <tr key={o.id}>
                          <td><strong>{o.orderNumber}</strong></td>
                          <td>{o.patient.pseudonym}</td>
                          <td>{o.department || 'Pathology'}</td>
                          <td>{o.specimens.map((s) => s.testCode).join(', ')}</td>
                          <td><span className="status-pill-blue">{formatOrderStatus(o.status)}</span></td>
                          <td style={{ display: 'flex', gap: '8px' }}>
                            {o.status === OrderStatus.DELIVERED_TO_LAB && (
                              <button type="button" className="btn-secondary" onClick={() => void handleMoveToAnalysis(o)}>
                                Start Run
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() => {
                                setReportOrder(o);
                                setActiveTab('reports');
                              }}
                            >
                              Upload Report →
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: UPLOAD REPORTS */}
          {activeTab === 'reports' && (
            <div className="settings-grid-2">
              <div className="chart-card-modern">
                <div className="card-top-header">
                  <h2 className="card-top-title">Upload &amp; Share Verified PDF Report</h2>
                </div>
                <form onSubmit={(e) => void handlePublishReportSubmit(e)}>
                  <div className="form-group">
                    <label className="form-label">Select Order Ready for Reporting</label>
                    <select
                      className="form-select"
                      value={reportOrder?.id || ''}
                      onChange={(e) => setReportOrder(orders.find((o) => o.id === e.target.value) || null)}
                      required
                    >
                      <option value="">-- Select Booking --</option>
                      {orders
                        .filter((o) => !isOrderCompleted(o.status) && o.status !== OrderStatus.CANCELLED && o.status !== OrderStatus.REJECTED)
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.orderNumber} — {o.patient.pseudonym} ({o.smallLabName}) [{formatOrderStatus(o.status)}]
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Sign-off Pathologist Name</label>
                    <input
                      className="form-input"
                      placeholder="Enter verifying MD Pathologist / Signatory name"
                      value={pathologistName}
                      onChange={(e) => setPathologistName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Verified Report File (PDF / Document)</label>
                    <input type="file" accept=".pdf,.png,.jpg,.txt" className="form-input" onChange={(e) => setReportFile(e.target.files?.[0] || null)} />
                  </div>
                  <button type="submit" className="btn-primary btn-full" disabled={uploadingReport || !reportOrder}>
                    {uploadingReport ? 'Uploading Report...' : 'Verify & Publish Report →'}
                  </button>
                </form>
              </div>

              <div className="chart-card-modern">
                <div className="card-top-header">
                  <h2 className="card-top-title">Published Reports ({reports.length})</h2>
                </div>
                {reports.length === 0 ? (
                  <div className="empty-state-box"><h4>No Reports Uploaded Yet</h4><p>Uploaded PDFs are shared immediately in the referring Collection Lab&apos;s Reports tab.</p></div>
                ) : (
                  <div className="data-table-container">
                    <table className="modern-data-table">
                      <thead>
                        <tr><th>ID</th><th>Order</th><th>Patient</th><th>Download</th></tr>
                      </thead>
                      <tbody>
                        {reports.map((r) => (
                          <tr key={r.id}>
                            <td><strong>{r.id}</strong></td>
                            <td>{r.orderNumber}</td>
                            <td>{r.patientName}</td>
                            <td><a href={r.downloadUrl} target="_blank" rel="noreferrer" className="btn-link-muted">Open PDF</a></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: CATALOGUE & BRANCH NETWORK */}
          {activeTab === 'rates' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="chart-card-modern">
                <div className="card-top-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h2 className="card-top-title">
                      Partner Test &amp; Package Catalogue ({orgCatalogItems.owned.length} Published)
                    </h2>
                    <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
                      Enter each test-wise &amp; combo package B2B rate for Small Labs to auto-match and compare prices live.{' '}
                      {activeAgreement
                        ? `Negotiated Contract: ${activeAgreement.agreedCommissionPct}% Commission • ${activeAgreement.b2bMarkupPct}% Markup`
                        : `Default Network Rule: ${commConfig.commissionPct}% Commission`}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button type="button" className="btn-secondary" onClick={() => openAddCatalogModal('TEST')}>
                      + Add Test Rate
                    </button>
                    <button type="button" className="btn-primary" onClick={() => openAddCatalogModal('PACKAGE')}>
                      + Add Combo Package
                    </button>
                  </div>
                </div>

                {orgCatalogItems.owned.length === 0 ? (
                  <div className="empty-state-box">
                    <h4>No Custom Tests or Packages Published Yet</h4>
                    <p>
                      Add your Lab&apos;s Test Panels &amp; Health Packages below, or customize any Global Baseline test below so Small Labs see your competitive quotes at #1.
                    </p>
                  </div>
                ) : (
                  <div className="data-table-container">
                    <table className="modern-data-table">
                      <thead>
                        <tr>
                          <th>Code &amp; Type</th>
                          <th>Test / Package Name</th>
                          <th>Tube Cap</th>
                          <th>Your B2B Payout</th>
                          <th>Small Lab Pays</th>
                          <th>MRP / TAT</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orgCatalogItems.owned.map((t) => {
                          const tubeMeta = TUBE_METADATA[t.tubeType] || TUBE_METADATA[TubeType.SERUM_RED_GOLD];
                          const largeRate =
                            typeof t.largeLabB2bRateInr === 'number'
                              ? t.largeLabB2bRateInr
                              : Math.round((t.b2bPriceInr || 0) * (1 - (activeAgreement?.agreedCommissionPct ?? commConfig.commissionPct) / 100));
                          return (
                            <tr key={t.id}>
                              <td>
                                <strong>{t.code}</strong>
                                <div style={{ marginTop: '4px' }}>
                                  <span className={t.itemType === 'PACKAGE' ? 'package-match-pill' : 'status-pill-blue'}>
                                    {t.itemType === 'PACKAGE' ? '📦 PACKAGE' : '🧪 TEST'}
                                  </span>
                                </div>
                              </td>
                              <td>
                                <div><strong>{t.name}</strong></div>
                                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{t.department}</div>
                                {t.itemType === 'PACKAGE' && t.includedTestCodes && (
                                  <div style={{ fontSize: '0.72rem', color: '#1D4ED8', marginTop: '2px' }}>
                                    Includes: {t.includedTestCodes.join(', ')}
                                  </div>
                                )}
                              </td>
                              <td>
                                <span className="tube-cap-pill" style={{ background: tubeMeta.bgHex, color: tubeMeta.colorHex }}>
                                  <span className="tube-cap-dot" style={{ background: tubeMeta.colorHex }} />
                                  {tubeMeta.capColorName}
                                </span>
                              </td>
                              <td><strong style={{ color: '#059669' }}>{formatInr(largeRate)}</strong></td>
                              <td><strong>{formatInr(t.b2bPriceInr)}</strong></td>
                              <td>{formatInr(t.mrpInr)} / {t.tatHours}h</td>
                              <td>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <button type="button" className="btn-secondary" onClick={() => openEditCatalogModal(t)}>
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() =>
                                      onShowAlert({
                                        variant: 'confirm',
                                        title: `Delete ${t.code}?`,
                                        message: `Remove ${t.name} from your Lab's rate card?`,
                                        onConfirm: () => {
                                          void deleteDiagnosticTest(t.id);
                                        },
                                      })
                                    }
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {orgCatalogItems.globalFallback.length > 0 && (
                  <div style={{ marginTop: '22px', borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
                    <h3 style={{ fontSize: '0.94rem', fontWeight: 700, marginBottom: '10px' }}>
                      Global Network Baseline Panels ({orgCatalogItems.globalFallback.length})
                    </h3>
                    <div className="data-table-container">
                      <table className="modern-data-table">
                        <thead>
                          <tr>
                            <th>Code</th>
                            <th>Panel Name</th>
                            <th>Tube</th>
                            <th>Baseline Tariff</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orgCatalogItems.globalFallback.map((t) => (
                            <tr key={t.id}>
                              <td><strong>{t.code}</strong></td>
                              <td>{t.name} {t.itemType === 'PACKAGE' && t.includedTestCodes ? `(${t.includedTestCodes.join(', ')})` : ''}</td>
                              <td>{TUBE_METADATA[t.tubeType]?.capColorName || formatLabel(t.tubeType)}</td>
                              <td>{formatInr(t.b2bPriceInr)}</td>
                              <td>
                                <button type="button" className="btn-secondary" onClick={() => openEditCatalogModal(t)}>
                                  Customize Rate
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Connected Centers & Branches Card */}
              <div className="chart-card-modern">
                <div className="card-top-header">
                  <div>
                    <h3 className="card-top-title">Organization Hubs &amp; Branch Collection Centers ({orgCenters.length})</h3>
                    <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
                      Each branch center appears as a nearby sample drop-off option when Small Labs select your Hub.
                    </p>
                  </div>
                  {!isBranchCenter && (
                    <button type="button" className="btn-primary" onClick={() => setShowAddBranchModal(true)}>
                      + Add Collection Center Branch
                    </button>
                  )}
                </div>
                <div className="data-table-container">
                  <table className="modern-data-table">
                    <thead>
                      <tr>
                        <th>Center ID</th>
                        <th>Branch Name</th>
                        <th>Role</th>
                        <th>City / Pincode</th>
                        <th>Address &amp; GPS</th>
                        <th>Login Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orgCenters.map((c) => (
                        <tr key={c.id}>
                          <td><strong>{c.id}</strong></td>
                          <td>{c.name}</td>
                          <td>
                            <span className={c.centerType === 'COLLECTION_CENTER' ? 'status-pill-blue' : 'status-pill-green'}>
                              {c.centerType === 'COLLECTION_CENTER' ? 'Branch Center' : 'Main Hub HQ'}
                            </span>
                          </td>
                          <td>{c.city}{c.pincode ? ` (${c.pincode})` : ''}</td>
                          <td>
                            <div>{c.address}</div>
                            {c.latitude && c.longitude && (
                              <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                GPS: {c.latitude.toFixed(4)}, {c.longitude.toFixed(4)}
                              </div>
                            )}
                          </td>
                          <td>{c.email}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: SETTLEMENTS */}
          {activeTab === 'settlements' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="chart-card-modern">
                <div className="card-top-header">
                  <div>
                    <h2 className="card-top-title">Receivables &amp; Lab Payouts ({settlements.length})</h2>
                    <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
                      Track customer payment confirmations and payouts sent to your Reference Hub
                    </p>
                  </div>
                </div>
                <div className="kpi-row" style={{ marginBottom: '20px' }}>
                  <div className="kpi-card-modern"><div className="kpi-body"><span className="kpi-title">Total Lab Earnings</span><span className="kpi-main-number">{formatInr(metrics.totalReceivable)}</span></div></div>
                  <div className="kpi-card-modern"><div className="kpi-body"><span className="kpi-title">Paid Out to Hub</span><span className="kpi-main-number">{formatInr(metrics.paidReceivable)}</span></div></div>
                  <div className="kpi-card-modern"><div className="kpi-body"><span className="kpi-title">Pending Payout</span><span className="kpi-main-number">{formatInr(metrics.pendingReceivable)}</span></div></div>
                </div>
                {settlements.length === 0 ? (
                  <div className="empty-state-box"><h4>No Settlement Records Yet</h4><p>Receivables generate live for every booking routed to your hub.</p></div>
                ) : (
                  <div className="data-table-container">
                    <table className="modern-data-table">
                      <thead>
                        <tr>
                          <th>Invoice ID</th>
                          <th>Booking</th>
                          <th>Source Lab</th>
                          <th>Customer Payment</th>
                          <th>Lab Share</th>
                          <th>Payout Status</th>
                          <th>Reference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {settlements.map((s) => {
                          const isLabPaid = s.labPayoutStatus === 'PAID' || s.status === 'SETTLED';
                          const isCustomerPaid = s.paymentStatus === 'PAID';
                          return (
                            <tr key={s.id}>
                              <td><strong>{s.id}</strong></td>
                              <td>{s.orderNumber}</td>
                              <td>{s.smallLabName}</td>
                              <td>
                                <span className={isCustomerPaid ? 'status-pill-green' : 'status-pill-amber'}>
                                  {isCustomerPaid ? 'Paid Online' : 'Payment Due'}
                                </span>
                              </td>
                              <td><strong>{formatInr(s.labPayoutInr)}</strong></td>
                              <td>
                                <span className={isLabPaid ? 'status-pill-green' : 'status-pill-amber'}>
                                  {isLabPaid ? 'Paid Out' : 'Pending Payout'}
                                </span>
                              </td>
                              <td>
                                <code style={{ fontSize: '0.75rem' }}>
                                  {s.labPayoutRef || s.razorpayPaymentId || '—'}
                                </code>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="chart-card-modern">
                <div className="card-top-header">
                  <h3 className="card-top-title">Payout Receipts ({payouts.length})</h3>
                </div>
                {payouts.length === 0 ? (
                  <div className="empty-state-box">
                    <h4>No Payout Transfers Recorded Yet</h4>
                    <p>Completed payouts transferred by Platform Admin appear here with their reference number.</p>
                  </div>
                ) : (
                  <div className="data-table-container">
                    <table className="modern-data-table">
                      <thead>
                        <tr>
                          <th>Payout ID</th>
                          <th>Order</th>
                          <th>Mode</th>
                          <th>Destination</th>
                          <th>Reference</th>
                          <th>Amount</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payouts.map((p) => (
                          <tr key={p.id}>
                            <td><strong>{p.id}</strong></td>
                            <td>{p.orderNumber}</td>
                            <td>{p.mode}</td>
                            <td>{p.destinationSummary}</td>
                            <td><code>{p.referenceId}</code></td>
                            <td><strong>{formatInr(p.amountInr)}</strong></td>
                            <td>{new Date(p.createdAt).toLocaleString('en-IN')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 7: ANALYTICS */}
          {activeTab === 'analytics' && (
            <div className="chart-card-modern">
              <h2 className="card-top-title">Weekly Specimen Volume &amp; Turnaround (Live)</h2>
              <div style={{ padding: '24px 0', display: 'flex', alignItems: 'flex-end', gap: '18px', height: '220px', borderBottom: '1px solid #E2E8F0' }}>
                {metrics.weeklyBars.map((bar) => {
                  const maxC = Math.max(1, ...metrics.weeklyBars.map((b) => b.count));
                  return (
                    <div key={bar.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{bar.count}</span>
                      <div style={{ width: '100%', maxWidth: '42px', height: `${Math.max(6, (bar.count / maxC) * 150)}px`, background: '#0D9488', borderRadius: '6px 6px 0 0' }} />
                      <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{bar.day}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 8: SETTINGS */}
          {activeTab === 'settings' && (
            <div className="chart-card-modern" style={{ maxWidth: '680px' }}>
              <h2 className="card-top-title">Reference Hub Facility &amp; Payout Settings</h2>
              <form
                style={{ marginTop: '16px' }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!session.profile.labId) {
                    onShowAlert({ variant: 'warning', title: 'Missing Lab Profile', message: 'Ask Admin to link a Reference Lab facility ID to your account.' });
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
                  onShowAlert({ variant: 'success', title: 'Hub Settings Saved', message: 'Facility location and payout receiving details updated successfully.' });
                }}
              >
                <div className="form-group"><label className="form-label">Hub / Center Display Name</label><input className="form-input" value={settingsName} onChange={(e) => setSettingsName(e.target.value)} required /></div>
                <div className="form-group">
                  <label className="form-label">Quick Locality / GPS Coordinate Preset</label>
                  <select
                    className="form-select"
                    defaultValue=""
                    onChange={(e) => {
                      const preset = LOCALITY_GPS_PRESETS.find((p) => p.label === e.target.value);
                      if (preset) {
                        setSettingsCity(preset.city);
                        if (!settingsAddress.trim()) setSettingsAddress(preset.label);
                        setSettingsLat(preset.latitude);
                        setSettingsLng(preset.longitude);
                      }
                    }}
                  >
                    <option value="">Set coordinates from preset locality...</option>
                    {LOCALITY_GPS_PRESETS.map((p) => (
                      <option key={p.label} value={p.label}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group"><label className="form-label">City</label><input className="form-input" value={settingsCity} onChange={(e) => setSettingsCity(e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Pincode</label><input className="form-input" placeholder="e.g. 400053" value={settingsPincode} onChange={(e) => setSettingsPincode(e.target.value)} /></div>
                </div>
                <div className="form-group"><label className="form-label">Address</label><input className="form-input" value={settingsAddress} onChange={(e) => setSettingsAddress(e.target.value)} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group"><label className="form-label">GPS Latitude</label><input type="number" step="0.0001" className="form-input" value={settingsLat} onChange={(e) => setSettingsLat(Number(e.target.value))} /></div>
                  <div className="form-group"><label className="form-label">GPS Longitude</label><input type="number" step="0.0001" className="form-input" value={settingsLng} onChange={(e) => setSettingsLng(Number(e.target.value))} /></div>
                </div>
                <div className="form-group"><label className="form-label">NABL Accreditation</label><input className="form-input" value={settingsNabl} onChange={(e) => setSettingsNabl(e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Daily Sample Cutoff</label><input className="form-input" value={settingsCutoff} onChange={(e) => setSettingsCutoff(e.target.value)} /></div>

                <div style={{ borderTop: '1px solid #E2E8F0', margin: '18px 0 14px', paddingTop: '14px' }}>
                  <h3 style={{ fontSize: '0.96rem', fontWeight: 700, marginBottom: '12px' }}>Payout Account Details</h3>
                  <div className="form-group">
                    <label className="form-label">Preferred Settlement Method</label>
                    <select className="form-select" value={payoutMethod} onChange={(e) => setPayoutMethod(e.target.value as 'UPI' | 'BANK_TRANSFER')}>
                      <option value="UPI">UPI Transfer</option>
                      <option value="BANK_TRANSFER">Bank Transfer (NEFT / IMPS)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Beneficiary / Business Account Name</label>
                    <input className="form-input" placeholder="e.g. Metro Diagnostics Pvt Ltd" value={payoutHolderName} onChange={(e) => setPayoutHolderName(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">UPI ID (Optional)</label>
                    <input className="form-input" placeholder="e.g. labhub@icici" value={payoutUpiId} onChange={(e) => setPayoutUpiId(e.target.value)} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group">
                      <label className="form-label">Bank Account Last 4 Digits</label>
                      <input className="form-input" maxLength={4} placeholder="e.g. 4821" value={payoutBankLast4} onChange={(e) => setPayoutBankLast4(e.target.value.replace(/\D/g, ''))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">IFSC Code</label>
                      <input className="form-input" placeholder="e.g. HDFC0000123" value={payoutIfsc} onChange={(e) => setPayoutIfsc(e.target.value.toUpperCase())} />
                    </div>
                  </div>
                </div>

                <button type="submit" className="btn-primary">Save Facility &amp; Payout Profile</button>
              </form>
            </div>
          )}
        </main>
      </div>

      {/* MODAL: QC ACCESSIONING WITH SAMPLE PROOF & BARCODE AUDIT */}
      {qcOrder && (
        <div className="modal-overlay" onClick={() => setQcOrder(null)}>
          <div className="modal-card" style={{ maxWidth: '620px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Specimen QC Check • {qcOrder.orderNumber}</h3>
              <button type="button" className="btn-secondary" onClick={() => setQcOrder(null)}>✕</button>
            </div>
            <form onSubmit={(e) => void handleQcSubmit(e, 'ACCEPT')}>
              <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
                <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '10px', border: '1px solid #E2E8F0', marginBottom: '14px' }}>
                  <div style={{ fontSize: '0.82rem', marginBottom: '8px' }}>
                    <strong>Source:</strong> {qcOrder.smallLabName} &rarr; <strong>Receiving Center:</strong> {qcOrder.targetLabName}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {qcOrder.specimens.map((s) => {
                      const tubeMeta = TUBE_METADATA[s.tubeType] || TUBE_METADATA[TubeType.SERUM_RED_GOLD];
                      return (
                        <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', background: '#FFF', padding: '6px 10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="tube-cap-pill" style={{ background: tubeMeta.bgHex, color: tubeMeta.colorHex }}>
                              <span className="tube-cap-dot" style={{ background: tubeMeta.colorHex }} />
                              {tubeMeta.capColorName}
                            </span>
                            <strong>{s.testCode}</strong>
                            <code>{s.scannedBarcode || s.barcode}</code>
                          </div>
                          <span className={s.validationStatus === 'VERIFIED' ? 'status-pill-green' : s.validationStatus === 'MISMATCH' ? 'status-pill-red' : 'status-pill-amber'}>
                            {s.validationStatus === 'VERIFIED' ? 'Barcode Matched' : s.validationStatus === 'MISMATCH' ? 'Tube Mismatch' : 'Not Scanned'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {qcOrder.sampleCollectionPhotoUrl && (
                    <div style={{ marginTop: '12px' }}>
                      <div style={{ fontSize: '0.76rem', fontWeight: 700, marginBottom: '6px' }}>Phlebotomist Collection Photo</div>
                      <a href={qcOrder.sampleCollectionPhotoUrl} target="_blank" rel="noreferrer">
                        <img src={qcOrder.sampleCollectionPhotoUrl} alt="Collected sample tubes" className="sample-proof-thumb" />
                      </a>
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Arrival Cooler Temperature (°C)</label>
                  <input type="number" step="0.1" className="form-input" value={qcTemp} onChange={(e) => setQcTemp(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Specimen Integrity Status</label>
                  <select className="form-select" value={qcQuality} onChange={(e) => setQcQuality(e.target.value as SpecimenQualityStatus)}>
                    {Object.values(SpecimenQualityStatus).map((st) => (
                      <option key={st} value={st}>{formatLabel(st)}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Rejection Reason (Only if rejecting specimen)</label>
                  <input className="form-input" placeholder="e.g. Hemolyzed sample or temperature excursion" value={qcRejectReason} onChange={(e) => setQcRejectReason(e.target.value)} />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="labsetu-alert-btn-danger"
                  disabled={submittingQc}
                  onClick={(e) => void handleQcSubmit(e, 'REJECT')}
                >
                  Reject Specimen
                </button>
                <button type="submit" className="btn-primary" disabled={submittingQc}>
                  {submittingQc ? 'Saving...' : 'Accept & Accession'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: LIVE PHLEBOTOMIST LOCATION & SPECIMEN PROOF */}
      {trackingOrder && (
        <div className="modal-overlay" onClick={() => setTrackingOrder(null)}>
          <div className="modal-card" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Live Pickup &amp; Specimen Proof • {trackingOrder.orderNumber}</h3>
              <button type="button" className="btn-secondary" onClick={() => setTrackingOrder(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
              <div className="live-route-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A' }}>
                      🏍️ {trackingOrder.phlebotomistName || 'Awaiting Phlebotomist'}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                      Status: <strong>{formatOrderStatus(trackingOrder.status)}</strong> • Center: {trackingOrder.targetLabName}
                    </div>
                    {trackingOrder.phleboLiveLocation && (
                      <div style={{ fontSize: '0.75rem', color: '#0F766E', marginTop: '4px' }}>
                        Live GPS: {trackingOrder.phleboLiveLocation.latitude.toFixed(5)}, {trackingOrder.phleboLiveLocation.longitude.toFixed(5)}
                        {trackingOrder.phleboLiveLocation.updatedAt
                          ? ` • Updated ${new Date(trackingOrder.phleboLiveLocation.updatedAt).toLocaleTimeString('en-IN')}`
                          : ''}
                      </div>
                    )}
                  </div>
                  {trackingOrder.phleboLiveLocation && (
                    <a
                      className="btn-primary"
                      style={{ textDecoration: 'none', fontSize: '0.78rem' }}
                      href={`https://www.google.com/maps/dir/?api=1&origin=${trackingOrder.phleboLiveLocation.latitude},${trackingOrder.phleboLiveLocation.longitude}&destination=${
                        trackingOrder.deliveryLocation?.latitude || myLab?.latitude || 19.076
                      },${trackingOrder.deliveryLocation?.longitude || myLab?.longitude || 72.8777}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      🗺️ Open Live Route Map
                    </a>
                  )}
                </div>
              </div>

              {trackingOrder.sampleCollectionPhotoUrl && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>Uploaded Sample Collection Photo</div>
                  <a href={trackingOrder.sampleCollectionPhotoUrl} target="_blank" rel="noreferrer">
                    <img src={trackingOrder.sampleCollectionPhotoUrl} alt="Sample collection proof" className="sample-proof-thumb" />
                  </a>
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: '8px' }}>Tube &amp; Barcode Validation</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {trackingOrder.specimens.map((s) => {
                    const tm = TUBE_METADATA[s.tubeType] || TUBE_METADATA[TubeType.SERUM_RED_GOLD];
                    return (
                      <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0', fontSize: '0.78rem' }}>
                        <div>
                          <span className="tube-cap-pill" style={{ background: tm.bgHex, color: tm.colorHex, marginRight: '8px' }}>
                            <span className="tube-cap-dot" style={{ background: tm.colorHex }} />
                            {tm.label}
                          </span>
                          <strong>{s.testCode}</strong> — <code>{s.scannedBarcode || s.barcode}</code>
                        </div>
                        <span className={s.validationStatus === 'VERIFIED' ? 'status-pill-green' : s.validationStatus === 'MISMATCH' ? 'status-pill-red' : 'status-pill-amber'}>
                          {s.validationStatus === 'VERIFIED' ? 'Verified' : s.validationStatus === 'MISMATCH' ? 'Mismatch' : 'Pending Scan'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: '8px' }}>Chain of Custody Log</div>
                {custodyEvents
                  .filter((ev) => ev.orderId === trackingOrder.id)
                  .slice(0, 8)
                  .map((ev) => (
                    <div key={ev.id} style={{ fontSize: '0.78rem', padding: '6px 0', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between' }}>
                      <span>
                        <strong>{formatLabel(ev.eventType)}</strong> by {ev.operatorName}
                        {ev.temperatureCelsius !== undefined ? ` (${ev.temperatureCelsius}°C)` : ''}
                      </span>
                      <span style={{ color: '#64748B' }}>{new Date(ev.timestamp).toLocaleTimeString('en-IN')}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT B2B TEST PANEL OR COMBO PACKAGE */}
      {showAddTestModal && (
        <div className="modal-overlay" onClick={() => setShowAddTestModal(false)}>
          <div className="modal-card" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingTestId ? 'Edit Partner Rate Card Item' : testItemType === 'PACKAGE' ? 'Publish B2B Combo Package' : 'Publish B2B Test Panel'}</h3>
              <button type="button" className="btn-secondary" onClick={() => setShowAddTestModal(false)}>✕</button>
            </div>
            <form onSubmit={(e) => void handleSaveRatePanel(e)}>
              <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
                <div className="form-group">
                  <label className="form-label">Catalogue Type</label>
                  <select className="form-select" value={testItemType} onChange={(e) => setTestItemType(e.target.value as CatalogItemType)}>
                    <option value="TEST">Individual Test</option>
                    <option value="PACKAGE">Health / Combo Package</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                  <div className="form-group"><label className="form-label">Code</label><input className="form-input" placeholder={testItemType === 'PACKAGE' ? 'WELL4' : 'CBC'} value={testCode} onChange={(e) => setTestCode(e.target.value)} required /></div>
                  <div className="form-group"><label className="form-label">Name</label><input className="form-input" placeholder={testItemType === 'PACKAGE' ? 'Executive Master Package' : 'Complete Blood Count'} value={testName} onChange={(e) => setTestName(e.target.value)} required /></div>
                </div>

                {testItemType === 'PACKAGE' && (
                  <div className="form-group" style={{ background: '#F8FAFC', padding: '12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                    <label className="form-label">Included Test Codes (auto-matched when Small Labs pick tests)</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                      {Array.from(new Set(orgCatalogItems.singleTests.map((t) => t.code))).map((code) => {
                        const active = testIncludedCodes.includes(code);
                        return (
                          <button
                            key={code}
                            type="button"
                            className={active ? 'btn-primary' : 'btn-secondary'}
                            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                            onClick={() =>
                              setTestIncludedCodes((prev) =>
                                prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
                              )
                            }
                          >
                            {active ? '✓ ' : '+ '}{code}
                          </button>
                        );
                      })}
                    </div>
                    <input
                      className="form-input"
                      placeholder="Additional codes comma-separated (e.g. LFT, KFT, TSH)"
                      value={testCustomCodesInput}
                      onChange={(e) => setTestCustomCodesInput(e.target.value)}
                    />
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div className="form-group"><label className="form-label">Department</label><select className="form-select" value={testDept} onChange={(e) => setTestDept(e.target.value as DiagnosticDepartment)}><option value="Hematology">Hematology</option><option value="Biochemistry">Biochemistry</option><option value="Immunology">Immunology</option><option value="Molecular">Molecular</option><option value="Microbiology">Microbiology</option><option value="Pathology">Pathology</option><option value="Preventive Health">Preventive Health</option></select></div>
                  <div className="form-group"><label className="form-label">Specimen</label><select className="form-select" value={testSpecimen} onChange={(e) => setTestSpecimen(e.target.value as SpecimenType)}>{Object.values(SpecimenType).map((s) => <option key={s} value={s}>{formatLabel(s)}</option>)}</select></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div className="form-group"><label className="form-label">Required Vacutainer / Tube</label><select className="form-select" value={testTube} onChange={(e) => setTestTube(e.target.value as TubeType)}>{Object.values(TubeType).map((t) => <option key={t} value={t}>{TUBE_METADATA[t].label}</option>)}</select></div>
                  <div className="form-group"><label className="form-label">Storage Band</label><select className="form-select" value={testTemp} onChange={(e) => setTestTemp(e.target.value as StorageTemperature)}>{Object.values(StorageTemperature).map((t) => <option key={t} value={t}>{formatLabel(t)}</option>)}</select></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
                  <div className="form-group">
                    <label className="form-label">Your B2B Rate (₹)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={testLargeLabRate}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setTestLargeLabRate(v);
                        const markup = activeAgreement?.b2bMarkupPct ?? Math.round((commConfig.commissionPct || 15) * 1.2);
                        setTestB2bPrice(Math.round(v * (1 + markup / 100)));
                      }}
                    />
                  </div>
                  <div className="form-group"><label className="form-label">Small Lab Price (₹)</label><input type="number" className="form-input" value={testB2bPrice} onChange={(e) => setTestB2bPrice(Number(e.target.value))} /></div>
                  <div className="form-group"><label className="form-label">MRP (₹)</label><input type="number" className="form-input" value={testMrp} onChange={(e) => setTestMrp(Number(e.target.value))} /></div>
                  <div className="form-group"><label className="form-label">TAT (Hrs)</label><input type="number" className="form-input" value={testTat} onChange={(e) => setTestTat(Number(e.target.value))} /></div>
                </div>
              </div>
              <div className="modal-footer"><button type="button" className="btn-secondary" onClick={() => setShowAddTestModal(false)}>Cancel</button><button type="submit" className="btn-primary">{editingTestId ? 'Update Tariff' : 'Publish to Rate Card'}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD COLLECTION CENTER BRANCH (MAIN HUB HQ ONLY) */}
      {showAddBranchModal && (
        <div className="modal-overlay" onClick={() => setShowAddBranchModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Collection Center / Branch</h3>
              <button type="button" className="btn-secondary" onClick={() => setShowAddBranchModal(false)}>✕</button>
            </div>
            <form onSubmit={(e) => void handleSaveBranchCenter(e)}>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">Branch / Center Name</label><input className="form-input" placeholder="e.g. Metro Diagnostics - Thane Branch" value={branchName} onChange={(e) => setBranchName(e.target.value)} required /></div>
                <div className="form-group">
                  <label className="form-label">Quick Locality / GPS Preset</label>
                  <select
                    className="form-select"
                    defaultValue=""
                    onChange={(e) => {
                      const preset = LOCALITY_GPS_PRESETS.find((p) => p.label === e.target.value);
                      if (preset) {
                        setBranchCity(preset.city);
                        setBranchAddress(preset.label);
                        setBranchLat(preset.latitude);
                        setBranchLng(preset.longitude);
                      }
                    }}
                  >
                    <option value="">Choose locality preset...</option>
                    {LOCALITY_GPS_PRESETS.map((p) => (
                      <option key={p.label} value={p.label}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div className="form-group"><label className="form-label">City</label><input className="form-input" value={branchCity} onChange={(e) => setBranchCity(e.target.value)} required /></div>
                  <div className="form-group"><label className="form-label">Pincode</label><input className="form-input" placeholder="e.g. 400601" value={branchPincode} onChange={(e) => setBranchPincode(e.target.value)} /></div>
                </div>
                <div className="form-group"><label className="form-label">Full Branch Address</label><input className="form-input" value={branchAddress} onChange={(e) => setBranchAddress(e.target.value)} required /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div className="form-group"><label className="form-label">Latitude</label><input type="number" step="0.0001" className="form-input" value={branchLat} onChange={(e) => setBranchLat(Number(e.target.value))} /></div>
                  <div className="form-group"><label className="form-label">Longitude</label><input type="number" step="0.0001" className="form-input" value={branchLng} onChange={(e) => setBranchLng(Number(e.target.value))} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div className="form-group"><label className="form-label">Branch Contact Email</label><input type="email" className="form-input" value={branchEmail} onChange={(e) => setBranchEmail(e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Phone</label><input className="form-input" value={branchPhone} onChange={(e) => setBranchPhone(e.target.value)} /></div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowAddBranchModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Register Branch</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
