import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  computeDailyVolumeBars,
  computeStatusBreakdown,
  CustodyEventType,
  DiagnosticReportRecord,
  DiagnosticTestItem,
  formatInr,
  isOrderCompleted,
  LABSETU_THEME,
  LabFacility,
  OrderStatus,
  PickupOrder,
  PlatformNotification,
  ROLE_LABELS,
  SettlementRecord,
  SpecimenQualityStatus,
  SpecimenType,
  StorageTemperature,
  TubeType,
  UserRole,
  type DiagnosticDepartment,
} from '@diagnostic/shared';
import { type VerifiedPortalSession } from '../components/AuthGateScreen';
import { type DynamicAlertVariant } from '../components/DynamicAlertModal';
import {
  markNotificationRead,
  publishDiagnosticReport,
  saveDiagnosticTest,
  subscribeLabs,
  subscribeNotifications,
  subscribeOrders,
  subscribeReports,
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

  // Live Firestore States (ZERO dummy data)
  const [labs, setLabs] = useState<LabFacility[]>([]);
  const [orders, setOrders] = useState<PickupOrder[]>([]);
  const [reports, setReports] = useState<DiagnosticReportRecord[]>([]);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [testCatalog, setTestCatalog] = useState<DiagnosticTestItem[]>([]);
  const [notifications, setNotifications] = useState<PlatformNotification[]>([]);

  // QC Accessioning Modal
  const [qcOrder, setQcOrder] = useState<PickupOrder | null>(null);
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

  // Rate Panel Modal
  const [showAddTestModal, setShowAddTestModal] = useState(false);
  const [testCode, setTestCode] = useState('');
  const [testName, setTestName] = useState('');
  const [testDept, setTestDept] = useState<DiagnosticDepartment>('Hematology');
  const [testSpecimen, setTestSpecimen] = useState<SpecimenType>(SpecimenType.BLOOD);
  const [testTube, setTestTube] = useState<TubeType>(TubeType.EDTA_LAVENDER);
  const [testTemp, setTestTemp] = useState<StorageTemperature>(StorageTemperature.REFRIGERATED);
  const [testTat, setTestTat] = useState(4);
  const [testB2bPrice, setTestB2bPrice] = useState(250);
  const [testMrp, setTestMrp] = useState(500);

  // Operational Profile Settings Form
  const [settingsName, setSettingsName] = useState(session.profile.displayName || '');
  const [settingsCity, setSettingsCity] = useState('');
  const [settingsAddress, setSettingsAddress] = useState('');
  const [settingsNabl, setSettingsNabl] = useState('');
  const [settingsCutoff, setSettingsCutoff] = useState('08:30 PM Daily Cutoff');

  useEffect(() => {
    if (!session.firebaseUser) return;
    const unsubs = [
      subscribeLabs(setLabs),
      subscribeOrders(session.profile, setOrders),
      subscribeReports(session.profile, setReports),
      subscribeSettlements(session.profile, setSettlements),
      subscribeTestCatalog(setTestCatalog),
      subscribeNotifications(session.profile, setNotifications),
    ];
    return () => unsubs.forEach((u) => u());
  }, [session.firebaseUser, session.profile]);

  const myLab = useMemo(() => {
    const match = session.profile.labId ? labs.find((l) => l.id === session.profile.labId) : undefined;
    return match || null;
  }, [labs, session.profile.labId]);

  useEffect(() => {
    if (myLab) {
      setSettingsName(myLab.name || session.profile.displayName);
      setSettingsCity(myLab.city || '');
      setSettingsAddress(myLab.address || '');
      setSettingsNabl(myLab.nablNumber || '');
      setSettingsCutoff(myLab.cutoffWindow || '08:30 PM Daily Cutoff');
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
    const pendingReceivable = settlements
      .filter((s) => s.status !== 'SETTLED')
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
      pendingReceivable,
      statusBreakdown,
      weeklyBars,
      avgTatMins,
    };
  }, [orders, settlements, reports]);

  const q = searchQuery.trim().toLowerCase();
  const filteredOrders = orders.filter(
    (o) =>
      (!q ||
        o.orderNumber.toLowerCase().includes(q) ||
        o.smallLabName.toLowerCase().includes(q) ||
        o.patient.pseudonym.toLowerCase().includes(q) ||
        o.specimens.some((s) => s.barcode.toLowerCase().includes(q) || s.testCode.toLowerCase().includes(q)))
  );

  const testingQueue = filteredOrders.filter(
    (o) =>
      (o.status === OrderStatus.DELIVERED_TO_LAB || o.status === OrderStatus.UNDER_ANALYSIS) &&
      (deptFilter === 'ALL' || (o.department || '').toLowerCase() === deptFilter.toLowerCase())
  );

  const unreadCount = notifications.filter((n) => !n.read).length;

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
            ? `QC Accessioning Passed (${qcQuality}) at ${numericTemp}°C`
            : `Rejected during QC: ${qcRejectReason || qcQuality}`,
        extraFields: decision === 'REJECT' ? { rejectionReason: qcRejectReason || qcQuality } : undefined,
      });
      setQcOrder(null);
      setQcRejectReason('');
      onShowAlert({
        variant: decision === 'ACCEPT' ? 'success' : 'warning',
        title: decision === 'ACCEPT' ? 'Specimen Accessioned' : 'Specimen Rejected',
        message: `${qcOrder.orderNumber} logged at ${numericTemp}°C (${qcQuality}).`,
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
      title: 'Analyzer Run Started',
      message: `${order.orderNumber} moved to UNDER_ANALYSIS.`,
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
      });
      setReportOrder(null);
      setReportFile(null);
      onShowAlert({
        variant: 'success',
        title: `Report ${rec.id} Published`,
        message: `Uploaded to Firebase Storage & shared live with ${reportOrder.smallLabName}.`,
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
    const cleanCode = testCode.trim().toUpperCase();
    if (!cleanCode || !testName.trim()) return;
    await saveDiagnosticTest({
      id: cleanCode,
      code: cleanCode,
      name: testName.trim(),
      department: testDept,
      specimenType: testSpecimen,
      tubeType: testTube,
      temperatureRequirement: testTemp,
      tatHours: Number(testTat) || 4,
      b2bPriceInr: Number(testB2bPrice) || 250,
      mrpInr: Number(testMrp) || 500,
      isActive: true,
      labId: session.profile.labId,
    });
    setShowAddTestModal(false);
    setTestCode('');
    setTestName('');
    onShowAlert({
      variant: 'success',
      title: 'B2B Test Tariff Published',
      message: `${cleanCode} (${testName.trim()}) saved live to Firestore \`test_catalog\`.`,
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
            <span className="brand-subtitle">Partner Reference Lab</span>
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
            <span>Rate Management</span>
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
            <div className="sidebar-footer-subtitle">ID: {session.profile.labId || 'HUB'}</div>
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
                            <span>{n.category}</span>
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
                <span className="user-profile-role">{session.profile.email}</span>
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
                  <h1>Reference Lab Hub Dashboard</h1>
                  <p>{myLab?.name || session.profile.displayName} — Live Cold-Chain Accessioning &amp; Reporting</p>
                </div>
                <button type="button" className="btn-primary" onClick={() => setActiveTab('incoming')}>
                  🧊 Open QC Queue ({metrics.incomingCount})
                </button>
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
                    <span className="kpi-title">Published Test Panels</span>
                    <span className="kpi-main-number">{testCatalog.length}</span>
                    <span className="kpi-sub-split">Live Firestore tariffs</span>
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
                    <span className="card-top-title">Incoming &amp; Bench Specimens</span>
                    <button type="button" className="btn-link-muted" onClick={() => setActiveTab('incoming')}>
                      Open QC Queue →
                    </button>
                  </div>
                  {filteredOrders.length === 0 ? (
                    <div className="empty-state-box">
                      <h4>No Specimens Routed to Your Hub Yet</h4>
                      <p>Live bookings targeted to `{session.profile.labId}` appear here immediately.</p>
                    </div>
                  ) : (
                    <div className="data-table-container">
                      <table className="modern-data-table">
                        <thead>
                          <tr>
                            <th>Order ID</th>
                            <th>Source Lab</th>
                            <th>Tests</th>
                            <th>Arrival Temp</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredOrders.slice(0, 6).map((o) => (
                            <tr key={o.id}>
                              <td><strong>{o.orderNumber}</strong></td>
                              <td>{o.smallLabName}</td>
                              <td>{o.specimens.map((s) => s.testCode).join(', ')}</td>
                              <td>{o.arrivalTemperatureCelsius !== undefined ? `${o.arrivalTemperatureCelsius}°C` : 'In Transit'}</td>
                              <td><span className="status-pill-blue">{o.status}</span></td>
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
                  <div className="card-top-header"><span className="card-top-title">Hub Accreditation</span></div>
                  <div className="network-list-item"><span>Hub ID</span><strong>{session.profile.labId || 'N/A'}</strong></div>
                  <div className="network-list-item"><span>NABL Cert</span><strong>{myLab?.nablNumber || 'NABL ISO 15189'}</strong></div>
                  <div className="network-list-item"><span>Daily Cutoff</span><strong>{myLab?.cutoffWindow || '08:30 PM'}</strong></div>
                  <div className="network-list-item"><span>Verification</span><span className="status-pill-green">{myLab?.verificationStatus || 'VERIFIED'}</span></div>
                </div>
              </section>
            </>
          )}

          {/* TAB 2: INCOMING SAMPLES & QC */}
          {activeTab === 'incoming' && (
            <div className="chart-card-modern">
              <div className="card-top-header">
                <div>
                  <h2 className="card-top-title">Incoming Cold-Chain Receiving &amp; QC Accessioning ({filteredOrders.length})</h2>
                  <p style={{ fontSize: '0.8rem', color: '#64748B' }}>Log cooler temperature (2°C – 8°C) and specimen quality before testing</p>
                </div>
              </div>
              {filteredOrders.length === 0 ? (
                <div className="empty-state-box"><h4>No Incoming Orders</h4><p>Dispatched bookings destined for your Reference Lab appear here in real time.</p></div>
              ) : (
                <div className="data-table-container">
                  <table className="modern-data-table">
                    <thead>
                      <tr>
                        <th>Booking ID</th>
                        <th>Source Lab</th>
                        <th>Patient</th>
                        <th>Barcodes &amp; Tests</th>
                        <th>Temp (°C)</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((o) => (
                        <tr key={o.id}>
                          <td><strong>{o.orderNumber}</strong></td>
                          <td>{o.smallLabName}</td>
                          <td>{o.patient.pseudonym}</td>
                          <td>{o.specimens.map((s) => `${s.testCode} (${s.barcode})`).join(', ')}</td>
                          <td>{o.arrivalTemperatureCelsius !== undefined ? `${o.arrivalTemperatureCelsius}°C` : 'Pending Check'}</td>
                          <td><span className="status-pill-blue">{o.status}</span></td>
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
                      ))}
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
                          <td><span className="status-pill-blue">{o.status}</span></td>
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
                  <h2 className="card-top-title">Publish Signed PDF Report to Firebase Storage</h2>
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
                            {o.orderNumber} — {o.patient.pseudonym} ({o.smallLabName}) [{o.status}]
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
                    {uploadingReport ? 'Uploading to Cloud Storage...' : 'Verify & Publish Report →'}
                  </button>
                </form>
              </div>

              <div className="chart-card-modern">
                <div className="card-top-header">
                  <h2 className="card-top-title">Published Reports ({reports.length})</h2>
                </div>
                {reports.length === 0 ? (
                  <div className="empty-state-box"><h4>No Reports Uploaded Yet</h4><p>Uploaded PDFs save to Firebase Storage &amp; appear in the Small Lab&apos;s Reports tab immediately.</p></div>
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

          {/* TAB 5: RATE MANAGEMENT */}
          {activeTab === 'rates' && (
            <div className="chart-card-modern">
              <div className="card-top-header">
                <h2 className="card-top-title">B2B Test Tariff Schedule ({testCatalog.length})</h2>
                <button type="button" className="btn-primary" onClick={() => setShowAddTestModal(true)}>
                  + Add / Update Test Rate
                </button>
              </div>
              {testCatalog.length === 0 ? (
                <div className="empty-state-box"><h4>No Test Panels Published</h4><p>Add diagnostic tests &amp; B2B pricing for referring Small Collection Labs.</p></div>
              ) : (
                <div className="data-table-container">
                  <table className="modern-data-table">
                    <thead>
                      <tr><th>Code</th><th>Test Name</th><th>Dept</th><th>Tube</th><th>B2B Price</th><th>MRP</th><th>TAT</th></tr>
                    </thead>
                    <tbody>
                      {testCatalog.map((t) => (
                        <tr key={t.id}>
                          <td><strong>{t.code}</strong></td>
                          <td>{t.name}</td>
                          <td>{t.department}</td>
                          <td>{t.tubeType}</td>
                          <td><strong>{formatInr(t.b2bPriceInr)}</strong></td>
                          <td>{formatInr(t.mrpInr)}</td>
                          <td>{t.tatHours} hrs</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 6: SETTLEMENTS */}
          {activeTab === 'settlements' && (
            <div className="chart-card-modern">
              <div className="card-top-header"><h2 className="card-top-title">Receivables &amp; Lab Payouts ({settlements.length})</h2></div>
              {settlements.length === 0 ? (
                <div className="empty-state-box"><h4>No Settlement Records Yet</h4><p>Receivables generate live for every booking routed to your hub.</p></div>
              ) : (
                <div className="data-table-container">
                  <table className="modern-data-table">
                    <thead><tr><th>ID</th><th>Booking</th><th>Source Lab</th><th>Lab Payout</th><th>Status</th></tr></thead>
                    <tbody>
                      {settlements.map((s) => (
                        <tr key={s.id}>
                          <td><strong>{s.id}</strong></td>
                          <td>{s.orderNumber}</td>
                          <td>{s.smallLabName}</td>
                          <td><strong>{formatInr(s.labPayoutInr)}</strong></td>
                          <td><span className={s.status === 'SETTLED' ? 'status-pill-green' : 'status-pill-amber'}>{s.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
            <div className="chart-card-modern" style={{ maxWidth: '640px' }}>
              <h2 className="card-top-title">Reference Hub Facility Profile</h2>
              <form
                style={{ marginTop: '16px' }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!session.profile.labId) {
                    onShowAlert({ variant: 'warning', title: 'Missing Lab ID', message: 'Ask Admin to assign a labId to your account.' });
                    return;
                  }
                  await updateLabOperationsProfile(session.profile.labId, {
                    name: settingsName,
                    city: settingsCity,
                    address: settingsAddress,
                    nablNumber: settingsNabl,
                    cutoffWindow: settingsCutoff,
                  });
                  onShowAlert({ variant: 'success', title: 'Hub Settings Saved', message: 'Updated live in Firestore.' });
                }}
              >
                <div className="form-group"><label className="form-label">Hub Display Name</label><input className="form-input" value={settingsName} onChange={(e) => setSettingsName(e.target.value)} required /></div>
                <div className="form-group"><label className="form-label">City</label><input className="form-input" value={settingsCity} onChange={(e) => setSettingsCity(e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Address</label><input className="form-input" value={settingsAddress} onChange={(e) => setSettingsAddress(e.target.value)} /></div>
                <div className="form-group"><label className="form-label">NABL Accreditation</label><input className="form-input" value={settingsNabl} onChange={(e) => setSettingsNabl(e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Daily Sample Cutoff</label><input className="form-input" value={settingsCutoff} onChange={(e) => setSettingsCutoff(e.target.value)} /></div>
                <button type="submit" className="btn-primary">Save Facility Profile</button>
              </form>
            </div>
          )}
        </main>
      </div>

      {/* MODAL: QC ACCESSIONING */}
      {qcOrder && (
        <div className="modal-overlay" onClick={() => setQcOrder(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Specimen QC Check • {qcOrder.orderNumber}</h3>
              <button type="button" className="btn-secondary" onClick={() => setQcOrder(null)}>✕</button>
            </div>
            <form onSubmit={(e) => void handleQcSubmit(e, 'ACCEPT')}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Arrival Cooler Temperature (°C)</label>
                  <input type="number" step="0.1" className="form-input" value={qcTemp} onChange={(e) => setQcTemp(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Specimen Integrity Status</label>
                  <select className="form-select" value={qcQuality} onChange={(e) => setQcQuality(e.target.value as SpecimenQualityStatus)}>
                    {Object.values(SpecimenQualityStatus).map((st) => (
                      <option key={st} value={st}>{st}</option>
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

      {/* MODAL: ADD TEST PANEL */}
      {showAddTestModal && (
        <div className="modal-overlay" onClick={() => setShowAddTestModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Publish B2B Test Panel</h3><button type="button" className="btn-secondary" onClick={() => setShowAddTestModal(false)}>✕</button></div>
            <form onSubmit={(e) => void handleSaveRatePanel(e)}>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">Test Code</label><input className="form-input" placeholder="CBC" value={testCode} onChange={(e) => setTestCode(e.target.value)} required /></div>
                <div className="form-group"><label className="form-label">Test Name</label><input className="form-input" placeholder="Complete Blood Count" value={testName} onChange={(e) => setTestName(e.target.value)} required /></div>
                <div className="form-group"><label className="form-label">Department</label><select className="form-select" value={testDept} onChange={(e) => setTestDept(e.target.value as DiagnosticDepartment)}><option value="Hematology">Hematology</option><option value="Biochemistry">Biochemistry</option><option value="Immunology">Immunology</option><option value="Molecular">Molecular</option></select></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div className="form-group"><label className="form-label">Specimen</label><select className="form-select" value={testSpecimen} onChange={(e) => setTestSpecimen(e.target.value as SpecimenType)}>{Object.values(SpecimenType).map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
                  <div className="form-group"><label className="form-label">Tube</label><select className="form-select" value={testTube} onChange={(e) => setTestTube(e.target.value as TubeType)}>{Object.values(TubeType).map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
                </div>
                <div className="form-group"><label className="form-label">Storage Band</label><select className="form-select" value={testTemp} onChange={(e) => setTestTemp(e.target.value as StorageTemperature)}>{Object.values(StorageTemperature).map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  <div className="form-group"><label className="form-label">B2B Rate (₹)</label><input type="number" className="form-input" value={testB2bPrice} onChange={(e) => setTestB2bPrice(Number(e.target.value))} /></div>
                  <div className="form-group"><label className="form-label">MRP (₹)</label><input type="number" className="form-input" value={testMrp} onChange={(e) => setTestMrp(Number(e.target.value))} /></div>
                  <div className="form-group"><label className="form-label">TAT (Hrs)</label><input type="number" className="form-input" value={testTat} onChange={(e) => setTestTat(Number(e.target.value))} /></div>
                </div>
              </div>
              <div className="modal-footer"><button type="button" className="btn-secondary" onClick={() => setShowAddTestModal(false)}>Cancel</button><button type="submit" className="btn-primary">Publish Panel</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
