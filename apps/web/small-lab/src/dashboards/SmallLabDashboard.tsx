import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  computeBookingTrendPoints,
  computeDailyVolumeBars,
  computeStatusBreakdown,
  DiagnosticReportRecord,
  DiagnosticTestItem,
  formatInr,
  formatOrderStatus,
  isOrderCompleted,
  LABSETU_THEME,
  LabFacility,
  OrderPriority,
  OrderStatus,
  PatientRecord,
  PhlebotomistProfile,
  PickupOrder,
  PlatformNotification,
  ROLE_LABELS,
  SettlementRecord,
  type CommissionConfig,
} from '@diagnostic/shared';
import { type VerifiedPortalSession } from '../components/AuthGateScreen';
import { type DynamicAlertVariant } from '../components/DynamicAlertModal';
import {
  cancelSmallLabOrder,
  createLiveBooking,
  DEFAULT_COMMISSION_CONFIG,
  markNotificationRead,
  savePatientRecord,
  subscribeLabs,
  subscribeNotifications,
  subscribeOrders,
  subscribePatients,
  subscribePhlebotomists,
  subscribeReports,
  subscribeSettings,
  subscribeSettlements,
  subscribeTestCatalog,
} from '../services/firestoreService';
import { startRazorpayBookingCheckout } from '../services/razorpayCheckout';

export type AlertTriggerFn = (opts: {
  variant: DynamicAlertVariant;
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
}) => void;

interface SmallLabDashboardProps {
  session: VerifiedPortalSession;
  onSignOut: () => void;
  onShowAlert: AlertTriggerFn;
}

type SmallLabTab =
  | 'dashboard'
  | 'new-booking'
  | 'patients'
  | 'catalogue'
  | 'partners'
  | 'bookings'
  | 'reports'
  | 'payments'
  | 'support';

export function SmallLabDashboard({
  session,
  onSignOut,
  onShowAlert,
}: SmallLabDashboardProps) {
  const [activeTab, setActiveTab] = useState<SmallLabTab>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [trendDays, setTrendDays] = useState<7 | 30>(30);
  const [notifOpen, setNotifOpen] = useState(false);

  // Live Firestore States (ZERO dummy data)
  const [labs, setLabs] = useState<LabFacility[]>([]);
  const [phlebotomists, setPhlebotomists] = useState<PhlebotomistProfile[]>([]);
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [testCatalog, setTestCatalog] = useState<DiagnosticTestItem[]>([]);
  const [orders, setOrders] = useState<PickupOrder[]>([]);
  const [reports, setReports] = useState<DiagnosticReportRecord[]>([]);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [notifications, setNotifications] = useState<PlatformNotification[]>([]);
  const [commConfig, setCommConfig] = useState<CommissionConfig>(DEFAULT_COMMISSION_CONFIG);

  // Booking filters & Custody modal
  const [orderFilter, setOrderFilter] = useState<string>('ALL');
  const [custodyModalOrder, setCustodyModalOrder] = useState<PickupOrder | null>(null);

  // Patient CRUD modal
  const [showAddPatientModal, setShowAddPatientModal] = useState(false);
  const [ptName, setPtName] = useState('');
  const [ptAge, setPtAge] = useState(32);
  const [ptGender, setPtGender] = useState<'MALE' | 'FEMALE' | 'OTHER'>('MALE');
  const [ptPhone, setPtPhone] = useState('');
  const [ptAddress, setPtAddress] = useState('');
  const [savingPatient, setSavingPatient] = useState(false);

  // New Booking state
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [adhocPatientName, setAdhocPatientName] = useState('');
  const [adhocPatientAge, setAdhocPatientAge] = useState(35);
  const [adhocPatientGender, setAdhocPatientGender] = useState<'MALE' | 'FEMALE' | 'OTHER'>('MALE');
  const [selectedTargetLabId, setSelectedTargetLabId] = useState<string>('');
  const [selectedPhleboId, setSelectedPhleboId] = useState<string>('');
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
  const [bookingPriority, setBookingPriority] = useState<OrderPriority>(OrderPriority.ROUTINE);
  const [pickupSlot, setPickupSlot] = useState<string>('Within 45 Mins (Express)');
  const [payImmediatelyOnBook, setPayImmediatelyOnBook] = useState(true);
  const [payingSettlementId, setPayingSettlementId] = useState<string | null>(null);
  const [submittingBooking, setSubmittingBooking] = useState(false);

  const formatLabel = (raw: string) =>
    raw
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());

  useEffect(() => {
    if (!session.firebaseUser) return;
    const unsubs = [
      subscribeLabs(setLabs),
      subscribePhlebotomists(setPhlebotomists),
      subscribePatients(session.profile, setPatients),
      subscribeTestCatalog(setTestCatalog),
      subscribeOrders(session.profile, setOrders),
      subscribeReports(session.profile, setReports),
      subscribeSettlements(session.profile, setSettlements),
      subscribeNotifications(session.profile, setNotifications),
      subscribeSettings(
        () => {},
        setCommConfig,
        () => {}
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [session.firebaseUser, session.profile]);

  const myLabFacility = useMemo(() => {
    if (session.profile.labId) {
      const exact = labs.find((l) => l.id === session.profile.labId);
      if (exact) return exact;
    }
    return {
      id: session.profile.labId || `LAB-SM-${session.profile.id.slice(0, 6)}`,
      name: session.profile.displayName || 'Small Collection Center',
      type: 'SMALL_LAB' as const,
      city: 'Service City',
      address: `${session.profile.displayName} Collection Point`,
      phone: session.profile.phoneNumber || '',
      email: session.profile.email,
      verified: true,
      verificationStatus: 'VERIFIED' as const,
      createdAt: session.profile.createdAt,
      updatedAt: session.profile.updatedAt,
    };
  }, [labs, session.profile]);

  const verifiedLargeLabs = useMemo(
    () => labs.filter((l) => l.type === 'LARGE_LAB' && l.verificationStatus === 'VERIFIED'),
    [labs]
  );

  const onlinePhlebos = useMemo(
    () => phlebotomists.filter((p) => p.status === 'ONLINE'),
    [phlebotomists]
  );

  useEffect(() => {
    if (!selectedTargetLabId && verifiedLargeLabs.length > 0) {
      setSelectedTargetLabId(verifiedLargeLabs[0].id);
    }
  }, [verifiedLargeLabs, selectedTargetLabId]);

  const metrics = useMemo(() => {
    const activePickups = orders.filter(
      (o) =>
        o.status === OrderStatus.CREATED ||
        o.status === OrderStatus.READY_FOR_PICKUP ||
        o.status === OrderStatus.ASSIGNED_TO_PHLEBO
    );
    const inTransit = orders.filter(
      (o) =>
        o.status === OrderStatus.PICKED_UP ||
        o.status === OrderStatus.IN_TRANSIT ||
        o.status === OrderStatus.DELIVERED_TO_LAB ||
        o.status === OrderStatus.UNDER_ANALYSIS
    );
    const completed = orders.filter((o) => isOrderCompleted(o.status));
    const totalBilled =
      settlements.reduce((s, x) => s + (x.grossAmountInr || 0), 0) ||
      orders.reduce((s, o) => s + (o.totalAmountInr || 0), 0);
    const paidOnline = settlements
      .filter((s) => s.paymentStatus === 'PAID')
      .reduce((sum, x) => sum + (x.grossAmountInr || 0), 0);
    const pendingPay = settlements
      .filter((s) => s.paymentStatus !== 'PAID' && s.status !== 'SETTLED')
      .reduce((sum, x) => sum + (x.grossAmountInr || 0), 0);

    const statusBreakdown = computeStatusBreakdown(orders);
    const trendBuckets = computeBookingTrendPoints(orders, trendDays === 7 ? 7 : 10);
    const weeklyBars = computeDailyVolumeBars(orders);

    return {
      totalBookings: orders.length,
      activePickupsCount: activePickups.length,
      inTransitCount: inTransit.length,
      completedCount: completed.length,
      totalBilled,
      paidOnline,
      pendingPay,
      statusBreakdown,
      trendBuckets,
      weeklyBars,
    };
  }, [orders, settlements, trendDays]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const q = searchQuery.trim().toLowerCase();

  const filteredOrders = orders.filter(
    (o) =>
      (orderFilter === 'ALL' || o.status === orderFilter) &&
      (!q ||
        o.orderNumber.toLowerCase().includes(q) ||
        o.patient.pseudonym.toLowerCase().includes(q) ||
        o.targetLabName.toLowerCase().includes(q) ||
        o.specimens.some((s) => s.testCode.toLowerCase().includes(q)))
  );

  const filteredPatients = patients.filter(
    (p) =>
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      p.phone.toLowerCase().includes(q)
  );

  const selectedTestsList = useMemo(
    () => testCatalog.filter((t) => selectedTestIds.includes(t.id)),
    [testCatalog, selectedTestIds]
  );

  const bookingEstimate = useMemo(() => {
    const testsSum = selectedTestsList.reduce((s, t) => s + (t.b2bPriceInr || 0), 0);
    const courier =
      commConfig.courierBaseFeeInr +
      (bookingPriority === OrderPriority.STAT_CRITICAL ? commConfig.statSurchargeInr : 0);
    return {
      testsSum,
      courier,
      total: testsSum + courier,
    };
  }, [selectedTestsList, commConfig, bookingPriority]);

  async function handleSavePatient(e: FormEvent) {
    e.preventDefault();
    if (!ptName.trim() || !ptPhone.trim()) return;
    setSavingPatient(true);
    try {
      const saved = await savePatientRecord({
        name: ptName.trim(),
        age: Number(ptAge) || 30,
        gender: ptGender,
        phone: ptPhone.trim(),
        address: ptAddress.trim() || undefined,
        smallLabId: myLabFacility.id,
      });
      setShowAddPatientModal(false);
      setPtName('');
      setPtPhone('');
      setPtAddress('');
      setSelectedPatientId(saved.id);
      onShowAlert({
        variant: 'success',
        title: 'Patient Saved',
        message: `${saved.name} (${saved.id}) has been added to your patient directory.`,
      });
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Patient Save Error',
        message: (err as Error).message || 'Could not save patient record.',
      });
    } finally {
      setSavingPatient(false);
    }
  }

  async function handleCreateBooking(e: FormEvent) {
    e.preventDefault();
    if (!session.firebaseUser) return;

    const chosenPatient = patients.find((p) => p.id === selectedPatientId);
    const patientPayload = chosenPatient
      ? {
          id: chosenPatient.id,
          pseudonym: chosenPatient.name,
          age: chosenPatient.age,
          gender: chosenPatient.gender,
        }
      : {
          id: `PT-ADHOC-${Date.now().toString().slice(-4)}`,
          pseudonym: adhocPatientName.trim(),
          age: Number(adhocPatientAge) || 35,
          gender: adhocPatientGender,
        };

    if (!patientPayload.pseudonym) {
      onShowAlert({
        variant: 'warning',
        title: 'Patient Required',
        message: 'Select a registered patient or enter patient details.',
      });
      return;
    }

    const targetLab = verifiedLargeLabs.find((l) => l.id === selectedTargetLabId);
    if (!targetLab) {
      onShowAlert({
        variant: 'warning',
        title: 'Target Reference Lab Required',
        message: 'Select a verified Large Reference Lab partner to receive specimens.',
      });
      return;
    }

    if (selectedTestsList.length === 0) {
      onShowAlert({
        variant: 'warning',
        title: 'Diagnostic Tests Required',
        message: 'Select at least one diagnostic test panel from the live catalogue.',
      });
      return;
    }

    const chosenPhlebo = phlebotomists.find((p) => p.id === selectedPhleboId) || null;
    setSubmittingBooking(true);
    try {
      const created = await createLiveBooking({
        sessionUser: session.profile,
        operatorUid: session.firebaseUser.uid,
        patient: patientPayload,
        smallLab: {
          id: myLabFacility.id,
          name: myLabFacility.name,
          address: myLabFacility.address || `${myLabFacility.name}, ${myLabFacility.city}`,
          phone: myLabFacility.phone,
        },
        targetLab: {
          id: targetLab.id,
          name: targetLab.name,
          address: targetLab.address || `${targetLab.name}, ${targetLab.city}`,
        },
        phlebotomist: chosenPhlebo ? { id: chosenPhlebo.id, name: chosenPhlebo.name } : null,
        selectedTests: selectedTestsList,
        priority: bookingPriority,
        scheduledPickupAt: pickupSlot,
        commissionConfig: commConfig,
      });

      setSelectedTestIds([]);
      setAdhocPatientName('');

      const settlementId = `STL-${created.orderNumber.replace('BK-', '')}`;
      if (payImmediatelyOnBook && (created.totalAmountInr || 0) >= 1) {
        try {
          const checkoutRes = await startRazorpayBookingCheckout({
            amountInr: created.totalAmountInr || bookingEstimate.total,
            bookingId: created.id,
            settlementId,
            description: `LabSetu Pickup ${created.orderNumber} (${targetLab.name})`,
            customerName: myLabFacility.name,
            customerEmail: session.profile.email,
            customerPhone: myLabFacility.phone,
            collectedByRole: 'SMALL_LAB',
          });

          if (checkoutRes.status === 'PAID') {
            setActiveTab('bookings');
            onShowAlert({
              variant: 'success',
              title: `Paid & Booking ${created.orderNumber} Dispatched`,
              message: `Online payment (${checkoutRes.result.paymentId}) confirmed for ${patientPayload.pseudonym} -> ${targetLab.name}.`,
              detail: `Handover Receiving OTP: ${created.handoverOtp} • Barcodes: ${created.specimens
                .map((s) => s.barcode)
                .join(', ')}`,
            });
          } else {
            setActiveTab('payments');
            onShowAlert({
              variant: 'warning',
              title: `Booking ${created.orderNumber} Created (Payment Pending)`,
              message: checkoutRes.message,
              detail: `Handover Receiving OTP: ${created.handoverOtp} • Click Pay Now below to complete payment.`,
            });
          }
        } catch (payErr) {
          setActiveTab('payments');
          onShowAlert({
            variant: 'error',
            title: `Booking Saved, Payment Incomplete (${created.orderNumber})`,
            message:
              payErr instanceof Error
                ? payErr.message
                : 'Your booking is saved, but payment did not complete. Retry in Payments.',
            detail: `Invoice ${settlementId} is ready for retry in the Payments tab.`,
          });
        }
      } else {
        setActiveTab('bookings');
        onShowAlert({
          variant: 'success',
          title: `Booking ${created.orderNumber} Dispatched`,
          message: `Live order created for ${patientPayload.pseudonym} -> ${targetLab.name}. Invoice added to Payments.`,
          detail: `Handover Receiving OTP: ${created.handoverOtp} • Barcodes: ${created.specimens
            .map((s) => s.barcode)
            .join(', ')}`,
        });
      }
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Booking Failed',
        message: (err as Error).message || 'Could not create the pickup booking.',
      });
    } finally {
      setSubmittingBooking(false);
    }
  }

  async function handlePaySettlement(settlement: SettlementRecord) {
    if (settlement.paymentStatus === 'PAID') return;
    setPayingSettlementId(settlement.id);
    try {
      const outcome = await startRazorpayBookingCheckout({
        amountInr: settlement.grossAmountInr,
        bookingId: settlement.orderId,
        settlementId: settlement.id,
        description: `Invoice ${settlement.id} • Booking ${settlement.orderNumber}`,
        customerName: myLabFacility.name,
        customerEmail: session.profile.email,
        customerPhone: myLabFacility.phone,
        collectedByRole: 'SMALL_LAB',
      });

      if (outcome.status === 'PAID') {
        onShowAlert({
          variant: 'success',
          title: `Payment Successful • ${settlement.orderNumber}`,
          message: `Received ${formatInr(settlement.grossAmountInr)} via ${outcome.result.paymentMethod}.`,
          detail: `Payment Reference: ${outcome.result.paymentId}`,
        });
      } else {
        onShowAlert({
          variant: 'info',
          title: 'Payment Cancelled',
          message: outcome.message,
        });
      }
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Payment Failed',
        message:
          err instanceof Error
            ? err.message
            : 'Unable to complete online payment right now. Please try again.',
      });
    } finally {
      setPayingSettlementId(null);
    }
  }

  function toggleTestSelection(testId: string) {
    setSelectedTestIds((prev) =>
      prev.includes(testId) ? prev.filter((id) => id !== testId) : [...prev, testId]
    );
  }

  // Trend SVG Coordinates
  const trendMax = Math.max(4, ...metrics.trendBuckets.map((b) => Math.max(b.total, b.completed)));
  const totalPolyline = metrics.trendBuckets
    .map((b, idx) => {
      const x = 36 + (idx / Math.max(1, metrics.trendBuckets.length - 1)) * (435 - 36);
      const y = 148 - (b.total / trendMax) * 124;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const completedPolyline = metrics.trendBuckets
    .map((b, idx) => {
      const x = 36 + (idx / Math.max(1, metrics.trendBuckets.length - 1)) * (435 - 36);
      const y = 148 - (b.completed / trendMax) * 124;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const C = 301.6;
  const totalDonut = Math.max(1, metrics.statusBreakdown.total);
  const compLen = (metrics.statusBreakdown.completed / totalDonut) * C;
  const progLen = (metrics.statusBreakdown.inProgress / totalDonut) * C;
  const assignLen = (metrics.statusBreakdown.assigned / totalDonut) * C;
  const rejLen = (metrics.statusBreakdown.rejected / totalDonut) * C;

  const initials = (session.profile.displayName || 'SL')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="app-shell">
      {/* LEFT SIDEBAR */}
      <aside className="sidebar-dark">
        <div className="brand-header">
          <div className="brand-logo-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M10 2v7.31M14 2v7.31M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0" />
            </svg>
          </div>
          <div className="brand-title-wrap">
            <span className="brand-title">{LABSETU_THEME.brand.name}</span>
            <span className="brand-subtitle">Small Collection Lab</span>
          </div>
        </div>

        <ul className="sidebar-nav">
          <li className={`sidebar-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            <span>📊</span>
            <span>Dashboard</span>
          </li>
          <li className={`sidebar-nav-item ${activeTab === 'new-booking' ? 'active' : ''}`} onClick={() => setActiveTab('new-booking')}>
            <span>➕</span>
            <span>New Booking</span>
          </li>
          <li className={`sidebar-nav-item ${activeTab === 'patients' ? 'active' : ''}`} onClick={() => setActiveTab('patients')}>
            <span>👥</span>
            <span>Patients</span>
            <span className="nav-badge-green">{patients.length}</span>
          </li>
          <li className={`sidebar-nav-item ${activeTab === 'catalogue' ? 'active' : ''}`} onClick={() => setActiveTab('catalogue')}>
            <span>🧪</span>
            <span>Test Catalogue</span>
            <span className="nav-badge-teal">{testCatalog.length}</span>
          </li>
          <li className={`sidebar-nav-item ${activeTab === 'partners' ? 'active' : ''}`} onClick={() => setActiveTab('partners')}>
            <span>🔬</span>
            <span>Partner Labs</span>
          </li>
          <li className={`sidebar-nav-item ${activeTab === 'bookings' ? 'active' : ''}`} onClick={() => setActiveTab('bookings')}>
            <span>📦</span>
            <span>Bookings &amp; Custody</span>
            <span className="nav-badge-red">{orders.length}</span>
          </li>
          <li className={`sidebar-nav-item ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>
            <span>📄</span>
            <span>Reports</span>
            <span className="nav-badge-teal">{reports.length}</span>
          </li>
          <li className={`sidebar-nav-item ${activeTab === 'payments' ? 'active' : ''}`} onClick={() => setActiveTab('payments')}>
            <span>💳</span>
            <span>Payments</span>
          </li>
          <li className={`sidebar-nav-item ${activeTab === 'support' ? 'active' : ''}`} onClick={() => setActiveTab('support')}>
            <span>🎧</span>
            <span>Help &amp; Support</span>
          </li>
        </ul>

        <div className="sidebar-footer-card" onClick={() => setActiveTab('support')}>
          <div className="sidebar-footer-icon">🏥</div>
          <div>
            <div className="sidebar-footer-title">{myLabFacility.name}</div>
            <div className="sidebar-footer-subtitle">ID: {myLabFacility.id}</div>
          </div>
        </div>
      </aside>

      {/* MAIN WRAPPER */}
      <div className="main-wrapper">
        <header className="top-navbar">
          <div className="top-search-pill">
            <span>🔍</span>
            <input
              type="text"
              placeholder="Search patient, booking ID, test code, or reference lab..."
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
                      <div style={{ fontSize: '0.88rem', fontWeight: 700 }}>Lab Alerts</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{ROLE_LABELS[session.profile.role]}</div>
                    </div>
                  </div>
                  <div className="notif-list">
                    {notifications.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', fontSize: '0.82rem', color: '#64748B' }}>
                        No alerts yet.
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
                  <h1>Small Lab Dashboard</h1>
                  <p>
                    {myLabFacility.name} ({myLabFacility.id}) — live pickup orders &amp; sample tracking
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setTrendDays(trendDays === 30 ? 7 : 30)}
                  >
                    📅 {trendDays === 30 ? 'Last 30 Days' : 'Last 7 Days'}
                  </button>
                  <button type="button" className="btn-primary" onClick={() => setActiveTab('new-booking')}>
                    + New Pickup Booking
                  </button>
                </div>
              </div>

              <section className="kpi-5-row">
                <div className="kpi-card-modern">
                  <div className="kpi-icon-box-mint">📦</div>
                  <div className="kpi-body">
                    <span className="kpi-title">Total Bookings</span>
                    <span className="kpi-main-number">{metrics.totalBookings}</span>
                    <span className="kpi-sub-split">{metrics.activePickupsCount} awaiting pickup</span>
                  </div>
                </div>
                <div className="kpi-card-modern">
                  <div className="kpi-icon-box-blue">🚚</div>
                  <div className="kpi-body">
                    <span className="kpi-title">Samples In Transit</span>
                    <span className="kpi-main-number">{metrics.inTransitCount}</span>
                    <span className="kpi-sub-split">Cold-chain active</span>
                  </div>
                </div>
                <div className="kpi-card-modern">
                  <div className="kpi-icon-box-green">📄</div>
                  <div className="kpi-body">
                    <span className="kpi-title">Verified Reports</span>
                    <span className="kpi-main-number">{reports.length}</span>
                    <span className="kpi-sub-split">{metrics.completedCount} completed orders</span>
                  </div>
                </div>
                <div className="kpi-card-modern">
                  <div className="kpi-icon-box-indigo">👥</div>
                  <div className="kpi-body">
                    <span className="kpi-title">Registered Patients</span>
                    <span className="kpi-main-number">{patients.length}</span>
                    <span className="kpi-sub-split">Saved at your center</span>
                  </div>
                </div>
                <div className="kpi-card-modern">
                  <div className="kpi-icon-box-purple">₹</div>
                  <div className="kpi-body">
                    <span className="kpi-title">Total Billed</span>
                    <span className="kpi-main-number">{formatInr(metrics.totalBilled)}</span>
                    <span className="kpi-sub-split">{formatInr(metrics.pendingPay)} pending</span>
                  </div>
                </div>
              </section>

              <section className="analytics-3-row">
                <div className="chart-card-modern">
                  <div className="card-top-header">
                    <span className="card-top-title">Dispatch Volume Trend</span>
                    <div className="chart-legend-row">
                      <span><span className="legend-dot-teal" />Created</span>
                      <span><span className="legend-dot-blue" />Reports Ready</span>
                    </div>
                  </div>
                  <div style={{ height: '165px' }}>
                    <svg width="100%" height="100%" viewBox="0 0 460 165" preserveAspectRatio="none">
                      <line x1="30" y1="24" x2="445" y2="24" stroke="#F1F5F9" />
                      <line x1="30" y1="66" x2="445" y2="66" stroke="#F1F5F9" />
                      <line x1="30" y1="108" x2="445" y2="108" stroke="#F1F5F9" />
                      <line x1="30" y1="148" x2="445" y2="148" stroke="#CBD5E1" />
                      <text x="4" y="28" fontSize="10" fill="#94A3B8">{trendMax}</text>
                      <text x="4" y="90" fontSize="10" fill="#94A3B8">{Math.round(trendMax / 2)}</text>
                      <text x="10" y="151" fontSize="10" fill="#94A3B8">0</text>
                      {metrics.trendBuckets.length > 1 && (
                        <>
                          <polyline fill="none" stroke="#0D9488" strokeWidth="2.5" points={totalPolyline} />
                          <polyline fill="none" stroke="#2563EB" strokeWidth="2.5" points={completedPolyline} />
                        </>
                      )}
                    </svg>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '28px', fontSize: '10px', color: '#94A3B8' }}>
                    {metrics.trendBuckets.map((b) => (
                      <span key={b.dateKey}>{b.label}</span>
                    ))}
                  </div>
                </div>

                <div className="chart-card-modern">
                  <div className="card-top-header">
                    <span className="card-top-title">Booking Lifecycle</span>
                  </div>
                  <div className="donut-chart-layout">
                    <div className="donut-svg-wrap">
                      <svg width="120" height="120" viewBox="0 0 120 120">
                        <circle cx="60" cy="60" r="48" fill="none" stroke="#F1F5F9" strokeWidth="18" />
                        {metrics.statusBreakdown.total > 0 && (
                          <>
                            <circle cx="60" cy="60" r="48" fill="none" stroke="#10B981" strokeWidth="18" strokeDasharray={`${compLen} ${C}`} strokeDashoffset="75" />
                            <circle cx="60" cy="60" r="48" fill="none" stroke="#2563EB" strokeWidth="18" strokeDasharray={`${progLen} ${C}`} strokeDashoffset={75 - compLen} />
                            <circle cx="60" cy="60" r="48" fill="none" stroke="#F59E0B" strokeWidth="18" strokeDasharray={`${assignLen} ${C}`} strokeDashoffset={75 - compLen - progLen} />
                            <circle cx="60" cy="60" r="48" fill="none" stroke="#EF4444" strokeWidth="18" strokeDasharray={`${rejLen} ${C}`} strokeDashoffset={75 - compLen - progLen - assignLen} />
                          </>
                        )}
                      </svg>
                      <div className="donut-center-label">
                        <div className="donut-center-number">{metrics.statusBreakdown.total}</div>
                        <div className="donut-center-sub">Orders</div>
                      </div>
                    </div>
                    <div className="donut-legend-list">
                      <div className="donut-legend-item">
                        <span className="donut-label-group">● Completed</span>
                        <span className="donut-val-group">{metrics.statusBreakdown.completed} <span className="donut-pct-text">{metrics.statusBreakdown.completedPct}</span></span>
                      </div>
                      <div className="donut-legend-item">
                        <span className="donut-label-group">● In Progress</span>
                        <span className="donut-val-group">{metrics.statusBreakdown.inProgress} <span className="donut-pct-text">{metrics.statusBreakdown.inProgressPct}</span></span>
                      </div>
                      <div className="donut-legend-item">
                        <span className="donut-label-group">● Pickup Queue</span>
                        <span className="donut-val-group">{metrics.statusBreakdown.assigned} <span className="donut-pct-text">{metrics.statusBreakdown.assignedPct}</span></span>
                      </div>
                      <div className="donut-legend-item">
                        <span className="donut-label-group">● Rejected</span>
                        <span className="donut-val-group">{metrics.statusBreakdown.rejected} <span className="donut-pct-text">{metrics.statusBreakdown.rejectedPct}</span></span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="chart-card-modern">
                  <div className="card-top-header">
                    <span className="card-top-title">Dispatch Quick-Actions</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <button type="button" className="btn-primary btn-full" onClick={() => setActiveTab('new-booking')}>
                      ➕ Create Pickup Booking
                    </button>
                    <button type="button" className="btn-secondary btn-full" onClick={() => setShowAddPatientModal(true)}>
                      👤 Add Patient Record
                    </button>
                    <button type="button" className="btn-secondary btn-full" onClick={() => setActiveTab('reports')}>
                      📄 View Diagnostic Reports ({reports.length})
                    </button>
                    <button type="button" className="btn-secondary btn-full" onClick={() => setActiveTab('partners')}>
                      🔬 Partner Labs ({verifiedLargeLabs.length} Online)
                    </button>
                  </div>
                </div>
              </section>

              <section className="bottom-3-row">
                <div className="chart-card-modern">
                  <div className="card-top-header">
                    <span className="card-top-title">Recent Bookings</span>
                    <button type="button" className="btn-link-muted" onClick={() => setActiveTab('bookings')}>
                      View All →
                    </button>
                  </div>
                  {orders.length === 0 ? (
                    <div className="empty-state-box">
                      <h4>No Pickup Bookings Created Yet</h4>
                      <p>Create your first live pickup request using real patients and verified reference labs.</p>
                      <button type="button" className="btn-primary" onClick={() => setActiveTab('new-booking')}>
                        + Create First Booking
                      </button>
                    </div>
                  ) : (
                    <div className="data-table-container">
                      <table className="modern-data-table">
                        <thead>
                          <tr>
                            <th>Booking ID</th>
                            <th>Patient</th>
                            <th>Reference Hub</th>
                            <th>Tests</th>
                            <th>OTP</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orders.slice(0, 6).map((o) => (
                            <tr key={o.id}>
                              <td><strong>{o.orderNumber}</strong></td>
                              <td>{o.patient.pseudonym}</td>
                              <td>{o.targetLabName}</td>
                              <td>{o.specimens.map((s) => s.testCode).join(', ')}</td>
                              <td><code>{o.handoverOtp || '—'}</code></td>
                              <td><span className="status-pill-blue">{formatOrderStatus(o.status)}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="chart-card-modern">
                  <div className="card-top-header">
                    <span className="card-top-title">Available Couriers</span>
                  </div>
                  {onlinePhlebos.length === 0 ? (
                    <div className="empty-state-box">
                      <h4>No Online Couriers</h4>
                      <p>Bookings placed now enter the open pickup pool immediately.</p>
                    </div>
                  ) : (
                    onlinePhlebos.slice(0, 4).map((p) => (
                      <div key={p.id} className="network-list-item">
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>{p.name}</div>
                          <div style={{ fontSize: '0.74rem', color: '#64748B' }}>{p.currentLocation} • {p.chillerTempCelsius}°C</div>
                        </div>
                        <span className="status-pill-green">ONLINE</span>
                      </div>
                    ))
                  )}
                </div>

                <div className="chart-card-modern">
                  <div className="card-top-header">
                    <span className="card-top-title">Verified Reference Hubs</span>
                  </div>
                  {verifiedLargeLabs.length === 0 ? (
                    <div className="empty-state-box">
                      <h4>No Reference Hubs Verified</h4>
                      <p>Ask Platform Admin to register &amp; verify Large Partner Labs.</p>
                    </div>
                  ) : (
                    verifiedLargeLabs.slice(0, 4).map((l) => (
                      <div key={l.id} className="network-list-item">
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>{l.name}</div>
                          <div style={{ fontSize: '0.74rem', color: '#64748B' }}>{l.city} • {l.nablNumber || 'NABL'}</div>
                        </div>
                        <span className="status-pill-green">VERIFIED</span>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </>
          )}

          {/* TAB 2: NEW BOOKING */}
          {activeTab === 'new-booking' && (
            <div className="settings-grid-2">
              <form className="chart-card-modern" onSubmit={(e) => void handleCreateBooking(e)}>
                <div className="card-top-header">
                  <div>
                    <h2 className="card-top-title">Create Cold-Chain Pickup Booking</h2>
                    <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
                      Live bookings automatically update sample tracking, billing, and notifications
                    </p>
                  </div>
                </div>

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>Select Registered Patient</label>
                    <button type="button" className="btn-link-muted" onClick={() => setShowAddPatientModal(true)}>
                      + Register New Patient
                    </button>
                  </div>
                  <select
                    className="form-select"
                    value={selectedPatientId}
                    onChange={(e) => setSelectedPatientId(e.target.value)}
                  >
                    <option value="">-- Or Enter Patient Details Below --</option>
                    {patients.map((pt) => (
                      <option key={pt.id} value={pt.id}>
                        {pt.name} ({pt.age}y / {pt.gender}) — {pt.phone}
                      </option>
                    ))}
                  </select>
                </div>

                {!selectedPatientId && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 0.7fr 1fr', gap: '10px', marginBottom: '16px' }}>
                    <input
                      className="form-input"
                      placeholder="Patient Name / Code"
                      value={adhocPatientName}
                      onChange={(e) => setAdhocPatientName(e.target.value)}
                      required
                    />
                    <input
                      type="number"
                      className="form-input"
                      placeholder="Age"
                      value={adhocPatientAge}
                      onChange={(e) => setAdhocPatientAge(Number(e.target.value))}
                    />
                    <select
                      className="form-select"
                      value={adhocPatientGender}
                      onChange={(e) => setAdhocPatientGender(e.target.value as 'MALE' | 'FEMALE' | 'OTHER')}
                    >
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Target Partner Reference Lab</label>
                  <select
                    className="form-select"
                    value={selectedTargetLabId}
                    onChange={(e) => setSelectedTargetLabId(e.target.value)}
                    required
                  >
                    {verifiedLargeLabs.length === 0 ? (
                      <option value="">No Verified Reference Labs Available</option>
                    ) : (
                      verifiedLargeLabs.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} ({l.city}) — {l.nablNumber || 'NABL'}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Urgency Priority</label>
                    <select
                      className="form-select"
                      value={bookingPriority}
                      onChange={(e) => setBookingPriority(e.target.value as OrderPriority)}
                    >
                      <option value={OrderPriority.ROUTINE}>Routine (Standard Cold-Chain)</option>
                      <option value={OrderPriority.URGENT}>Urgent (Priority Batch)</option>
                      <option value={OrderPriority.STAT_CRITICAL}>
                        Critical Urgent (+{formatInr(commConfig.statSurchargeInr)})
                      </option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Preferred Pickup Window</label>
                    <select
                      className="form-select"
                      value={pickupSlot}
                      onChange={(e) => setPickupSlot(e.target.value)}
                    >
                      <option value="Within 45 Mins (Express)">Within 45 Mins (Express)</option>
                      <option value="Morning Batch (10:00 AM)">Morning Batch (10:00 AM)</option>
                      <option value="Afternoon Batch (02:30 PM)">Afternoon Batch (02:30 PM)</option>
                      <option value="Evening Cutoff (07:30 PM)">Evening Cutoff (07:30 PM)</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Assign Phlebotomist (Optional — leave blank for Open Dispatch Pool)</label>
                  <select
                    className="form-select"
                    value={selectedPhleboId}
                    onChange={(e) => setSelectedPhleboId(e.target.value)}
                  >
                    <option value="">Open Dispatch Pool (First Available Courier)</option>
                    {phlebotomists.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.id}) — {formatLabel(p.status)} • {p.currentLocation}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Select Diagnostic Panels ({selectedTestsList.length} selected)</label>
                  {testCatalog.length === 0 ? (
                    <div className="empty-state-box">
                      <h4>Test Catalogue Is Empty</h4>
                      <p>Ask Admin or a Reference Lab to add tests to the test catalogue.</p>
                    </div>
                  ) : (
                    <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '8px' }}>
                      {testCatalog
                        .filter((t) => t.isActive !== false)
                        .map((test) => {
                          const checked = selectedTestIds.includes(test.id);
                          return (
                            <label key={test.id} className="checkbox-row" style={{ marginBottom: '6px' }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleTestSelection(test.id)}
                              />
                              <div style={{ flex: 1 }}>
                                <strong>{test.code}</strong> — {test.name}
                                <div style={{ fontSize: '0.73rem', color: '#64748B' }}>
                                  {test.department} • {formatLabel(test.tubeType)} • TAT {test.tatHours}h
                                </div>
                              </div>
                              <strong>{formatInr(test.b2bPriceInr)}</strong>
                            </label>
                          );
                        })}
                    </div>
                  )}
                </div>

                <div className="form-group" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px' }}>
                  <label className="form-label" style={{ marginBottom: '8px' }}>Payment Method</label>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <label className="checkbox-row" style={{ margin: 0, cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="bookingPaymentMode"
                        checked={payImmediatelyOnBook}
                        onChange={() => setPayImmediatelyOnBook(true)}
                      />
                      <span>Pay Online Now (UPI / Card / NetBanking)</span>
                    </label>
                    <label className="checkbox-row" style={{ margin: 0, cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="bookingPaymentMode"
                        checked={!payImmediatelyOnBook}
                        onChange={() => setPayImmediatelyOnBook(false)}
                      />
                      <span>Create Invoice &amp; Pay Later</span>
                    </label>
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn-primary btn-full"
                  disabled={submittingBooking || verifiedLargeLabs.length === 0 || testCatalog.length === 0}
                >
                  {submittingBooking
                    ? payImmediatelyOnBook
                      ? 'Opening Checkout...'
                      : 'Creating Booking...'
                    : payImmediatelyOnBook && bookingEstimate.total >= 1
                    ? `Pay ${formatInr(bookingEstimate.total)} & Create Booking →`
                    : 'Create Pickup Booking →'}
                </button>
              </form>

              <div className="chart-card-modern" style={{ alignSelf: 'start' }}>
                <h3 className="card-top-title">Booking Summary &amp; Cold-Chain Manifest</h3>
                <div style={{ marginTop: '16px' }}>
                  <div className="network-list-item">
                    <span className="network-item-label">Origin Facility</span>
                    <strong>{myLabFacility.name}</strong>
                  </div>
                  <div className="network-list-item">
                    <span className="network-item-label">Selected Tests</span>
                    <strong>{selectedTestsList.length}</strong>
                  </div>
                  <div className="network-list-item">
                    <span className="network-item-label">B2B Test Tariff</span>
                    <strong>{formatInr(bookingEstimate.testsSum)}</strong>
                  </div>
                  <div className="network-list-item">
                    <span className="network-item-label">Cold-Chain Courier Fee</span>
                    <strong>{formatInr(bookingEstimate.courier)}</strong>
                  </div>
                  <div className="network-list-item" style={{ borderTop: '2px solid #E2E8F0', paddingTop: '14px' }}>
                    <span style={{ fontWeight: 700 }}>Estimated Total Settlement</span>
                    <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0D9488' }}>
                      {formatInr(bookingEstimate.total)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PATIENTS */}
          {activeTab === 'patients' && (
            <div className="chart-card-modern">
              <div className="card-top-header">
                <div>
                  <h2 className="card-top-title">Patient Directory ({filteredPatients.length})</h2>
                  <p style={{ fontSize: '0.8rem', color: '#64748B' }}>Saved directly for {myLabFacility.name}</p>
                </div>
                <button type="button" className="btn-primary" onClick={() => setShowAddPatientModal(true)}>
                  + Add Patient
                </button>
              </div>
              {filteredPatients.length === 0 ? (
                <div className="empty-state-box">
                  <h4>No Registered Patients Yet</h4>
                  <p>Add patients here for fast one-click selection during sample dispatch bookings.</p>
                  <button type="button" className="btn-primary" onClick={() => setShowAddPatientModal(true)}>
                    + Add First Patient
                  </button>
                </div>
              ) : (
                <div className="data-table-container">
                  <table className="modern-data-table">
                    <thead>
                      <tr>
                        <th>Patient ID</th>
                        <th>Name</th>
                        <th>Age / Gender</th>
                        <th>Phone</th>
                        <th>Total Orders</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPatients.map((pt) => (
                        <tr key={pt.id}>
                          <td><strong>{pt.id}</strong></td>
                          <td>{pt.name}</td>
                          <td>{pt.age}y / {pt.gender}</td>
                          <td>{pt.phone}</td>
                          <td>{pt.totalOrders || 0}</td>
                          <td>
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() => {
                                setSelectedPatientId(pt.id);
                                setActiveTab('new-booking');
                              }}
                            >
                              Book Test →
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

          {/* TAB 4: TEST CATALOGUE */}
          {activeTab === 'catalogue' && (
            <div className="chart-card-modern">
              <div className="card-top-header">
                <h2 className="card-top-title">Live B2B Test Catalogue ({testCatalog.length})</h2>
              </div>
              {testCatalog.length === 0 ? (
                <div className="empty-state-box">
                  <h4>No Tests Published Yet</h4>
                  <p>Tests and prices appear here as soon as Admin or Reference Labs add them.</p>
                </div>
              ) : (
                <div className="data-table-container">
                  <table className="modern-data-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Test Panel</th>
                        <th>Department</th>
                        <th>Tube &amp; Specimen</th>
                        <th>Cold-Chain</th>
                        <th>TAT</th>
                        <th>B2B Rate</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {testCatalog.map((t) => (
                        <tr key={t.id}>
                          <td><strong>{t.code}</strong></td>
                          <td>{t.name}</td>
                          <td>{t.department}</td>
                          <td>{formatLabel(t.tubeType)} ({formatLabel(t.specimenType)})</td>
                          <td><span className="status-pill-blue">{formatLabel(t.temperatureRequirement)}</span></td>
                          <td>{t.tatHours} hrs</td>
                          <td><strong>{formatInr(t.b2bPriceInr)}</strong></td>
                          <td>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => {
                                if (!selectedTestIds.includes(t.id)) {
                                  setSelectedTestIds((prev) => [...prev, t.id]);
                                }
                                setActiveTab('new-booking');
                              }}
                            >
                              Add to Booking
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

          {/* TAB 5: PARTNER LABS */}
          {activeTab === 'partners' && (
            <div className="chart-card-modern">
              <div className="card-top-header">
                <h2 className="card-top-title">Verified Reference Testing Hubs ({verifiedLargeLabs.length})</h2>
              </div>
              {verifiedLargeLabs.length === 0 ? (
                <div className="empty-state-box">
                  <h4>No Verified Large Reference Labs Yet</h4>
                  <p>Partner reference labs appear here once added and verified by Platform Admin.</p>
                </div>
              ) : (
                <div className="data-table-container">
                  <table className="modern-data-table">
                    <thead>
                      <tr>
                        <th>Lab ID</th>
                        <th>Facility Name</th>
                        <th>City &amp; Address</th>
                        <th>NABL / Accreditation</th>
                        <th>Cutoff Window</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {verifiedLargeLabs.map((l) => (
                        <tr key={l.id}>
                          <td><strong>{l.id}</strong></td>
                          <td>{l.name}</td>
                          <td>{l.city} • {l.address || 'Main Hub'}</td>
                          <td>{l.nablNumber || 'NABL ISO 15189'}</td>
                          <td>{l.cutoffWindow || '08:30 PM Daily'}</td>
                          <td>
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() => {
                                setSelectedTargetLabId(l.id);
                                setActiveTab('new-booking');
                              }}
                            >
                              Send Sample →
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

          {/* TAB 6: BOOKINGS & CUSTODY */}
          {activeTab === 'bookings' && (
            <div className="chart-card-modern">
              <div className="card-top-header">
                <div>
                  <h2 className="card-top-title">All Dispatch Bookings ({filteredOrders.length})</h2>
                  <p style={{ fontSize: '0.8rem', color: '#64748B' }}>Real-time tracking &amp; chain-of-custody logs</p>
                </div>
                <select className="form-select" style={{ width: '210px' }} value={orderFilter} onChange={(e) => setOrderFilter(e.target.value)}>
                  <option value="ALL">All Statuses</option>
                  {Object.values(OrderStatus).map((st) => (
                    <option key={st} value={st}>{formatOrderStatus(st)}</option>
                  ))}
                </select>
              </div>
              {filteredOrders.length === 0 ? (
                <div className="empty-state-box">
                  <h4>No Bookings Found</h4>
                  <p>Dispatch a booking to track sample custody live from collection to verified PDF report.</p>
                  <button type="button" className="btn-primary" onClick={() => setActiveTab('new-booking')}>
                    + Create Booking
                  </button>
                </div>
              ) : (
                <div className="data-table-container">
                  <table className="modern-data-table">
                    <thead>
                      <tr>
                        <th>Booking ID</th>
                        <th>Patient</th>
                        <th>Target Lab</th>
                        <th>Tests</th>
                        <th>Courier</th>
                        <th>Handover OTP</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((o) => {
                        const cancellable =
                          o.status === OrderStatus.CREATED ||
                          o.status === OrderStatus.READY_FOR_PICKUP ||
                          o.status === OrderStatus.ASSIGNED_TO_PHLEBO;
                        const matchingStl = settlements.find((s) => s.orderId === o.id);
                        const isOrderPaid = o.paymentStatus === 'PAID' || matchingStl?.paymentStatus === 'PAID';
                        const payableAmt = matchingStl?.grossAmountInr ?? o.totalAmountInr ?? 0;
                        const canPayOrder =
                          !isOrderPaid &&
                          payableAmt >= 1 &&
                          o.status !== OrderStatus.CANCELLED &&
                          o.status !== OrderStatus.REJECTED;
                        return (
                          <tr key={o.id}>
                            <td><strong>{o.orderNumber}</strong></td>
                            <td>{o.patient.pseudonym}</td>
                            <td>{o.targetLabName}</td>
                            <td>{o.specimens.map((s) => s.testCode).join(', ')}</td>
                            <td>{o.phlebotomistName || 'Open Pool'}</td>
                            <td><code>{o.handoverOtp || '—'}</code></td>
                            <td>
                              <div><span className="status-pill-blue">{formatOrderStatus(o.status)}</span></div>
                              <div style={{ marginTop: '4px' }}>
                                <span className={isOrderPaid ? 'status-pill-green' : 'status-pill-amber'}>
                                  {isOrderPaid ? 'Paid' : `Due ${formatInr(payableAmt)}`}
                                </span>
                              </div>
                            </td>
                            <td style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {canPayOrder && matchingStl && (
                                <button
                                  type="button"
                                  className="btn-primary"
                                  disabled={payingSettlementId === matchingStl.id}
                                  onClick={() => void handlePaySettlement(matchingStl)}
                                >
                                  {payingSettlementId === matchingStl.id ? 'Opening...' : 'Pay Now'}
                                </button>
                              )}
                              <button type="button" className="btn-secondary" onClick={() => setCustodyModalOrder(o)}>
                                Track Custody
                              </button>
                              {cancellable && (
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  style={{ color: '#DC2626', borderColor: '#FECACA' }}
                                  onClick={() =>
                                    onShowAlert({
                                      variant: 'confirm',
                                      title: `Cancel ${o.orderNumber}?`,
                                      message: 'Confirm cancellation prior to courier sample pickup.',
                                      onConfirm: () => {
                                        if (!session.firebaseUser) return;
                                        void cancelSmallLabOrder({
                                          order: o,
                                          operatorUid: session.firebaseUser.uid,
                                          operatorName: session.profile.displayName,
                                        });
                                      },
                                    })
                                  }
                                >
                                  Cancel
                                </button>
                              )}
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

          {/* TAB 7: REPORTS */}
          {activeTab === 'reports' && (
            <div className="chart-card-modern">
              <div className="card-top-header">
                <h2 className="card-top-title">Diagnostic Reports Ready for Download ({reports.length})</h2>
              </div>
              {reports.length === 0 ? (
                <div className="empty-state-box">
                  <h4>No Verified Reports Available Yet</h4>
                  <p>Once your Partner Reference Lab uploads a pathologist-verified PDF, it appears here immediately.</p>
                </div>
              ) : (
                <div className="data-table-container">
                  <table className="modern-data-table">
                    <thead>
                      <tr>
                        <th>Report ID</th>
                        <th>Booking ID</th>
                        <th>Patient</th>
                        <th>Tests</th>
                        <th>Reference Lab</th>
                        <th>Signed By</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.map((r) => (
                        <tr key={r.id}>
                          <td><strong>{r.id}</strong></td>
                          <td>{r.orderNumber}</td>
                          <td>{r.patientName}</td>
                          <td>{r.testsSummary}</td>
                          <td>{r.targetLabName}</td>
                          <td>{r.pathologistName}</td>
                          <td>
                            <a href={r.downloadUrl} target="_blank" rel="noreferrer" className="btn-primary" style={{ textDecoration: 'none' }}>
                              Download PDF
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 8: PAYMENTS */}
          {activeTab === 'payments' && (
            <div className="chart-card-modern">
              <div className="card-top-header">
                <div>
                  <h2 className="card-top-title">Billing &amp; Online Payments ({settlements.length})</h2>
                  <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
                    Pay booking invoices securely via UPI, Card, or NetBanking and track settlements
                  </p>
                </div>
              </div>
              <div className="kpi-row" style={{ marginBottom: '20px' }}>
                <div className="kpi-card-modern"><div className="kpi-body"><span className="kpi-title">Total Billed</span><span className="kpi-main-number">{formatInr(metrics.totalBilled)}</span></div></div>
                <div className="kpi-card-modern"><div className="kpi-body"><span className="kpi-title">Paid Online</span><span className="kpi-main-number">{formatInr(metrics.paidOnline)}</span></div></div>
                <div className="kpi-card-modern"><div className="kpi-body"><span className="kpi-title">Payment Due</span><span className="kpi-main-number">{formatInr(metrics.pendingPay)}</span></div></div>
                <div className="kpi-card-modern"><div className="kpi-body"><span className="kpi-title">Settled Invoices</span><span className="kpi-main-number">{settlements.filter((s) => s.status === 'SETTLED').length}</span></div></div>
              </div>
              {settlements.length === 0 ? (
                <div className="empty-state-box"><h4>No Ledger Entries Yet</h4><p>Invoices generate dynamically whenever you submit a pickup booking.</p></div>
              ) : (
                <div className="data-table-container">
                  <table className="modern-data-table">
                    <thead>
                      <tr>
                        <th>Invoice ID</th>
                        <th>Booking ID</th>
                        <th>Reference Lab</th>
                        <th>Period</th>
                        <th>Total</th>
                        <th>Payment Status</th>
                        <th>Settlement</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settlements.map((s) => {
                        const isPaid = s.paymentStatus === 'PAID';
                        const isSettled = s.status === 'SETTLED';
                        const isPaying = payingSettlementId === s.id;
                        return (
                          <tr key={s.id}>
                            <td><strong>{s.id}</strong></td>
                            <td>{s.orderNumber}</td>
                            <td>{s.targetLabName}</td>
                            <td>{s.billingPeriod}</td>
                            <td><strong>{formatInr(s.grossAmountInr)}</strong></td>
                            <td>
                              <span className={isPaid ? 'status-pill-green' : 'status-pill-amber'}>
                                {isPaid ? 'Paid' : 'Pending'}
                              </span>
                              {s.razorpayPaymentId && (
                                <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '2px' }}>
                                  {s.razorpayPaymentId}
                                </div>
                              )}
                            </td>
                            <td>
                              <span className={isSettled ? 'status-pill-green' : 'status-pill-blue'}>
                                {isSettled ? 'Settled' : 'In Progress'}
                              </span>
                            </td>
                            <td>
                              {isPaid ? (
                                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#059669' }}>
                                  ✓ Paid{s.paymentMethod ? ` (${s.paymentMethod})` : ''}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="btn-primary"
                                  disabled={isPaying || s.grossAmountInr < 1}
                                  onClick={() => void handlePaySettlement(s)}
                                >
                                  {isPaying ? 'Opening Checkout...' : `Pay ${formatInr(s.grossAmountInr)}`}
                                </button>
                              )}
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

          {/* TAB 9: HELP & SUPPORT */}
          {activeTab === 'support' && (
            <div className="settings-grid-2">
              <div className="chart-card-modern">
                <h2 className="card-top-title">Cold-Chain Packaging &amp; Handover SOP</h2>
                <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.86rem', color: '#475569' }}>
                  <div><strong>1. Barcode Labeling:</strong> Match vial barcode sticker (`SMP-...`) directly before sealing chiller pouch.</div>
                  <div><strong>2. Cold-Chain Band:</strong> Maintain pre-chilled gel packs at <strong>2°C – 8°C</strong> for blood/serum samples.</div>
                  <div><strong>3. Handover Verification:</strong> Provide the booking&apos;s 5-digit Handover OTP only at physical collection / receiving confirmation.</div>
                </div>
              </div>
              <div className="chart-card-modern">
                <h2 className="card-top-title">24x7 Operations Support Desk</h2>
                <p style={{ marginTop: '10px', fontSize: '0.86rem', color: '#64748B', lineHeight: 1.6 }}>
                  Active Facility: <strong>{myLabFacility.name}</strong> ({myLabFacility.id})<br />
                  Account Email: <strong>{session.profile.email}</strong><br />
                  Cold-Chain Dispatch Hotline: <strong>1800-889-SETU</strong>
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* MODAL: ADD PATIENT */}
      {showAddPatientModal && (
        <div className="modal-overlay" onClick={() => setShowAddPatientModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add New Patient</h3>
              <button type="button" className="btn-secondary" onClick={() => setShowAddPatientModal(false)}>✕</button>
            </div>
            <form onSubmit={(e) => void handleSavePatient(e)}>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">Full Name / Pseudonym</label><input className="form-input" value={ptName} onChange={(e) => setPtName(e.target.value)} required /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group"><label className="form-label">Age</label><input type="number" className="form-input" value={ptAge} onChange={(e) => setPtAge(Number(e.target.value))} required /></div>
                  <div className="form-group"><label className="form-label">Gender</label><select className="form-select" value={ptGender} onChange={(e) => setPtGender(e.target.value as 'MALE' | 'FEMALE' | 'OTHER')}><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option></select></div>
                </div>
                <div className="form-group"><label className="form-label">Mobile Number</label><input className="form-input" value={ptPhone} onChange={(e) => setPtPhone(e.target.value)} required /></div>
                <div className="form-group"><label className="form-label">Address (Optional)</label><input className="form-input" value={ptAddress} onChange={(e) => setPtAddress(e.target.value)} /></div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowAddPatientModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={savingPatient}>{savingPatient ? 'Saving...' : 'Save Patient'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CUSTODY TIMELINE */}
      {custodyModalOrder && (
        <div className="modal-overlay" onClick={() => setCustodyModalOrder(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Custody Chain • {custodyModalOrder.orderNumber}</h3>
              <button type="button" className="btn-secondary" onClick={() => setCustodyModalOrder(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <p style={{ fontSize: '0.84rem', marginBottom: '12px' }}>
                <strong>Patient:</strong> {custodyModalOrder.patient.pseudonym} • <strong>OTP:</strong> <code>{custodyModalOrder.handoverOtp || '—'}</code>
              </p>
              {(custodyModalOrder.custodyHistory || []).length === 0 ? (
                <p style={{ color: '#64748B', fontSize: '0.84rem' }}>No custody scan events yet.</p>
              ) : (
                custodyModalOrder.custodyHistory.map((ev) => (
                  <div key={ev.id} style={{ padding: '10px 12px', borderLeft: '3px solid #0D9488', background: '#F8FAFC', borderRadius: '6px', marginBottom: '8px' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.84rem' }}>{formatLabel(ev.eventType)}</div>
                    <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                      {ev.operatorName} ({ROLE_LABELS[ev.operatorRole] || formatLabel(ev.operatorRole)}) {ev.temperatureCelsius !== undefined ? `• Temp: ${ev.temperatureCelsius}°C` : ''}
                    </div>
                    {ev.notes && <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: '2px' }}>{ev.notes}</div>}
                    <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '4px' }}>{new Date(ev.timestamp).toLocaleString('en-IN')}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
