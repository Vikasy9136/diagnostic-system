import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  computeDailyVolumeBars,
  computeStatusBreakdown,
  CustodyEventType,
  formatInr,
  isOrderCompleted,
  LABSETU_THEME,
  NotificationCategory,
  NotificationPriority,
  OrderStatus,
  type PhlebotomistProfile,
  type PhlebotomistShiftStatus,
  type PickupOrder,
  type PlatformNotification,
  ROLE_LABELS,
  type SettlementRecord,
  UserRole,
} from '@diagnostic/shared';
import { ADMIN_LOGIN_EMAIL } from '../firebase';
import { type VerifiedPortalSession } from '../components/LoginPage';
import { type DynamicAlertVariant } from '../components/DynamicAlertModal';
import {
  assignPhlebotomistToOrder,
  dispatchPlatformAlert,
  markNotificationRead,
  subscribeNotifications,
  subscribeOrders,
  subscribePhlebotomists,
  subscribeSettlements,
  updateOrderCustodyTransition,
  updatePhleboShiftStatus,
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

interface PhleboDashboardProps {
  session: VerifiedPortalSession;
  onSignOut: () => void;
  onShowAlert: AlertTriggerFn;
}

type PhleboTab =
  | 'requests'
  | 'collect'
  | 'deliver'
  | 'custody'
  | 'earnings'
  | 'profile';

export function PhleboDashboard({
  session,
  onSignOut,
  onShowAlert,
}: PhleboDashboardProps) {
  const [activeTab, setActiveTab] = useState<PhleboTab>('requests');
  const [searchQuery, setSearchQuery] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);

  // Live Cloud Firestore Data States (ZERO dummy/hardcoded records)
  const [orders, setOrders] = useState<PickupOrder[]>([]);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [phlebotomists, setPhlebotomists] = useState<PhlebotomistProfile[]>([]);
  const [notifications, setNotifications] = useState<PlatformNotification[]>([]);

  // Collect Sample Modal
  const [collectOrder, setCollectOrder] = useState<PickupOrder | null>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [pickupTempInput, setPickupTempInput] = useState('4.2');
  const [submittingCollect, setSubmittingCollect] = useState(false);

  // Drop Sample & OTP Verification Modal
  const [deliverOrder, setDeliverOrder] = useState<PickupOrder | null>(null);
  const [otpInput, setOtpInput] = useState('');
  const [dropTempInput, setDropTempInput] = useState('4.3');
  const [submittingDeliver, setSubmittingDeliver] = useState(false);

  // Busy states
  const [claimingOrderId, setClaimingOrderId] = useState<string | null>(null);
  const [updatingShift, setUpdatingShift] = useState(false);

  const myPhleboId = session.profile.phlebotomistId?.trim() || '';

  useEffect(() => {
    if (!session.firebaseUser) return;
    const unsubs = [
      subscribeOrders(session.profile, setOrders),
      subscribeSettlements(session.profile, setSettlements),
      subscribePhlebotomists(setPhlebotomists),
      subscribeNotifications(session.profile, setNotifications),
    ];
    return () => unsubs.forEach((u) => u());
  }, [session.firebaseUser, session.profile]);

  const myPhleboProfile = useMemo(() => {
    const emailLower = session.profile.email.trim().toLowerCase();
    return (
      phlebotomists.find(
        (p) =>
          (myPhleboId && p.id === myPhleboId) ||
          p.email.trim().toLowerCase() === emailLower
      ) || null
    );
  }, [phlebotomists, myPhleboId, session.profile.email]);

  const openPoolOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.status === OrderStatus.READY_FOR_PICKUP &&
          (!o.phlebotomistId || o.phlebotomistId === '')
      ),
    [orders]
  );

  const myAssignedOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          Boolean(myPhleboId) &&
          o.phlebotomistId === myPhleboId
      ),
    [orders, myPhleboId]
  );

  const awaitingCollectionOrders = useMemo(
    () =>
      myAssignedOrders.filter(
        (o) =>
          o.status === OrderStatus.ASSIGNED_TO_PHLEBO ||
          o.status === OrderStatus.READY_FOR_PICKUP
      ),
    [myAssignedOrders]
  );

  const inTransitOrders = useMemo(
    () =>
      myAssignedOrders.filter(
        (o) =>
          o.status === OrderStatus.PICKED_UP ||
          o.status === OrderStatus.IN_TRANSIT
      ),
    [myAssignedOrders]
  );

  const completedOrHandedOverOrders = useMemo(
    () =>
      myAssignedOrders.filter(
        (o) =>
          o.status === OrderStatus.DELIVERED_TO_LAB ||
          o.status === OrderStatus.UNDER_ANALYSIS ||
          isOrderCompleted(o.status)
      ),
    [myAssignedOrders]
  );

  // Merge live settlements with handled orders so earnings reflect every live order accurately
  const earningRows = useMemo(() => {
    const settlementByOrderId = new Map(settlements.map((s) => [s.orderId, s]));
    const rows = myAssignedOrders
      .filter((o) => o.status !== OrderStatus.CANCELLED && o.status !== OrderStatus.REJECTED)
      .map((order) => {
        const stl = settlementByOrderId.get(order.id);
        const amountInr = stl?.phleboPayoutInr ?? order.courierFeeInr ?? 0;
        const settled = stl?.status === 'SETTLED';
        const delivered =
          order.status === OrderStatus.DELIVERED_TO_LAB ||
          order.status === OrderStatus.UNDER_ANALYSIS ||
          isOrderCompleted(order.status);
        return {
          order,
          settlement: stl || null,
          amountInr,
          settled,
          delivered,
        };
      });
    return rows;
  }, [myAssignedOrders, settlements]);

  const metrics = useMemo(() => {
    const earnedDelivered = earningRows
      .filter((r) => r.delivered)
      .reduce((sum, r) => sum + r.amountInr, 0);
    const settledInr = earningRows
      .filter((r) => r.settled)
      .reduce((sum, r) => sum + r.amountInr, 0);
    const pendingPayoutInr = Math.max(0, earnedDelivered - settledInr);

    const todayStr = new Date().toDateString();
    const todayPickups = myAssignedOrders.filter(
      (o) => new Date(o.updatedAt || o.createdAt).toDateString() === todayStr
    ).length;

    const statusBreakdown = computeStatusBreakdown(myAssignedOrders);
    const weeklyBars = computeDailyVolumeBars(myAssignedOrders);

    return {
      openPoolCount: openPoolOrders.length,
      toCollectCount: awaitingCollectionOrders.length,
      inTransitCount: inTransitOrders.length,
      completedCount: completedOrHandedOverOrders.length,
      totalAssignedCount: myAssignedOrders.length,
      earnedDelivered,
      settledInr,
      pendingPayoutInr,
      todayPickups,
      statusBreakdown,
      weeklyBars,
    };
  }, [
    earningRows,
    myAssignedOrders,
    openPoolOrders.length,
    awaitingCollectionOrders.length,
    inTransitOrders.length,
    completedOrHandedOverOrders.length,
  ]);

  const q = searchQuery.trim().toLowerCase();
  const filterOrder = (o: PickupOrder) =>
    !q ||
    o.orderNumber.toLowerCase().includes(q) ||
    o.smallLabName.toLowerCase().includes(q) ||
    o.targetLabName.toLowerCase().includes(q) ||
    o.patient.pseudonym.toLowerCase().includes(q) ||
    o.specimens.some(
      (s) => s.barcode.toLowerCase().includes(q) || s.testCode.toLowerCase().includes(q)
    );

  const filteredOpenPool = openPoolOrders.filter(filterOrder);
  const filteredToCollect = awaitingCollectionOrders.filter(filterOrder);
  const filteredInTransit = inTransitOrders.filter(filterOrder);
  const filteredAllMine = myAssignedOrders.filter(filterOrder);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const currentShift: PhlebotomistShiftStatus = myPhleboProfile?.status || 'ONLINE';

  async function handleAcceptPoolBooking(order: PickupOrder) {
    if (!session.firebaseUser) return;
    if (!myPhleboId) {
      onShowAlert({
        variant: 'warning',
        title: 'Phlebotomist ID Required',
        message:
          'Your account does not have an assigned Phlebotomist ID yet. Ask Platform Admin to edit your user profile in Admin -> Users & Roles.',
      });
      return;
    }

    setClaimingOrderId(order.id);
    try {
      const phleboRecord: PhlebotomistProfile = myPhleboProfile || {
        id: myPhleboId,
        name: session.profile.displayName,
        phone: session.profile.phoneNumber || '',
        email: session.profile.email,
        status: 'ONLINE',
        currentLocation: 'Assigned Field Route',
        batteryPct: 100,
        chillerTempCelsius: 4.2,
        rating: 5.0,
        totalPickups: 0,
        verified: true,
        createdAt: session.profile.createdAt,
        updatedAt: new Date().toISOString(),
      };

      await assignPhlebotomistToOrder({
        order,
        phlebo: phleboRecord,
        operatorUid: session.firebaseUser.uid,
        operatorName: session.profile.displayName,
        operatorRole: UserRole.PHLEBOTOMIST,
      });

      onShowAlert({
        variant: 'success',
        title: `Booking ${order.orderNumber} Claimed`,
        message: `Assigned to you (${myPhleboId}). Proceed to ${order.smallLabName} for sample pickup.`,
        detail: `Destination: ${order.targetLabName}`,
      });
      setActiveTab('collect');
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Could Not Claim Booking',
        message: (err as Error).message || 'Another courier may have already claimed this booking.',
      });
    } finally {
      setClaimingOrderId(null);
    }
  }

  function handleDeclineAssignedBooking(order: PickupOrder) {
    if (!session.firebaseUser) return;
    onShowAlert({
      variant: 'confirm',
      title: `Release Booking ${order.orderNumber}?`,
      message: `This returns ${order.orderNumber} back to the open dispatch pool for another phlebotomist.`,
      confirmLabel: 'Release Booking',
      cancelLabel: 'Keep Assignment',
      onConfirm: () => {
        if (!session.firebaseUser) return;
        void (async () => {
          try {
            await updateOrderCustodyTransition({
              order,
              nextStatus: OrderStatus.READY_FOR_PICKUP,
              eventType: CustodyEventType.COLD_CHAIN_CHECK,
              operatorUid: session.firebaseUser!.uid,
              operatorName: session.profile.displayName,
              operatorRole: UserRole.PHLEBOTOMIST,
              notes: `Assignment released back to open pool by ${session.profile.displayName}`,
              extraFields: {
                phlebotomistId: '',
                phlebotomistName: '',
              },
            });
            onShowAlert({
              variant: 'info',
              title: 'Booking Returned to Pool',
              message: `${order.orderNumber} is now available for other active field couriers.`,
            });
          } catch (err) {
            onShowAlert({
              variant: 'error',
              title: 'Could Not Release Booking',
              message: (err as Error).message || 'Firestore update failed.',
            });
          }
        })();
      },
    });
  }

  async function handleCollectSampleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!collectOrder || !session.firebaseUser) return;

    const cleanBarcode = barcodeInput.trim();
    const numericTemp = Number.parseFloat(pickupTempInput);
    if (!cleanBarcode) {
      onShowAlert({
        variant: 'warning',
        title: 'Specimen Barcode Required',
        message: 'Scan or enter the specimen tube barcode before marking as collected.',
      });
      return;
    }
    if (Number.isNaN(numericTemp)) {
      onShowAlert({
        variant: 'warning',
        title: 'Cooler Temperature Required',
        message: 'Enter current chiller sensor reading in °C.',
      });
      return;
    }

    setSubmittingCollect(true);
    try {
      await updateOrderCustodyTransition({
        order: collectOrder,
        nextStatus: OrderStatus.PICKED_UP,
        eventType: CustodyEventType.PICKED_UP_BY_PHLEBO,
        operatorUid: session.firebaseUser.uid,
        operatorName: session.profile.displayName,
        operatorRole: UserRole.PHLEBOTOMIST,
        temperatureCelsius: numericTemp,
        scannedBarcode: cleanBarcode,
        notes: `Specimen collected by ${session.profile.displayName} • Barcode ${cleanBarcode} at ${numericTemp}°C`,
      });

      await dispatchPlatformAlert({
        title: `Sample Collected: ${collectOrder.orderNumber}`,
        message: `${session.profile.displayName} scanned barcode ${cleanBarcode} (${numericTemp}°C) and is en route to ${collectOrder.targetLabName}.`,
        category: NotificationCategory.SAMPLE_COLLECTED,
        priority: NotificationPriority.NORMAL,
        recipientRole: UserRole.SMALL_LAB,
        orderId: collectOrder.id,
        queueEmail: false,
      });

      setCollectOrder(null);
      setActiveTab('deliver');
      onShowAlert({
        variant: numericTemp < 2 || numericTemp > 8 ? 'warning' : 'success',
        title: 'Specimen Collected & Sealed',
        message: `${collectOrder.orderNumber} marked PICKED_UP at ${numericTemp}°C.`,
        detail:
          numericTemp < 2 || numericTemp > 8
            ? 'Cold-chain temperature outside 2°C–8°C band. Excursion alert dispatched to Admin!'
            : `Proceed to ${collectOrder.targetLabName} for 5-digit handover OTP verification.`,
      });
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Collection Log Failed',
        message: (err as Error).message || 'Could not update specimen status.',
      });
    } finally {
      setSubmittingCollect(false);
    }
  }

  async function handleMarkInTransit(order: PickupOrder) {
    if (!session.firebaseUser) return;
    try {
      await updateOrderCustodyTransition({
        order,
        nextStatus: OrderStatus.IN_TRANSIT,
        eventType: CustodyEventType.COLD_CHAIN_CHECK,
        operatorUid: session.firebaseUser.uid,
        operatorName: session.profile.displayName,
        operatorRole: UserRole.PHLEBOTOMIST,
        temperatureCelsius: myPhleboProfile?.chillerTempCelsius ?? 4.2,
        notes: `En route to ${order.targetLabName}`,
      });
      onShowAlert({
        variant: 'info',
        title: 'Transit Status Updated',
        message: `${order.orderNumber} is now marked IN_TRANSIT to ${order.targetLabName}.`,
      });
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Update Failed',
        message: (err as Error).message || 'Could not update transit state.',
      });
    }
  }

  async function handleDeliverOtpSubmit(e: FormEvent) {
    e.preventDefault();
    if (!deliverOrder || !session.firebaseUser) return;

    const cleanOtp = otpInput.replace(/\D/g, '').trim();
    const numericTemp = Number.parseFloat(dropTempInput);

    if (cleanOtp.length < 5) {
      onShowAlert({
        variant: 'warning',
        title: '5-Digit Handover OTP Required',
        message: 'Ask receiving lab / Small Lab staff for the 5-digit handover code.',
      });
      return;
    }

    if (deliverOrder.handoverOtp && cleanOtp !== deliverOrder.handoverOtp) {
      onShowAlert({
        variant: 'error',
        title: 'Handover OTP Mismatch',
        message: `Entered code "${cleanOtp}" does not match the booking handover OTP on record.`,
        detail: `Verify directly with ${deliverOrder.smallLabName} or ${deliverOrder.targetLabName} receiving desk.`,
      });
      return;
    }

    if (Number.isNaN(numericTemp)) {
      onShowAlert({
        variant: 'warning',
        title: 'Drop Temperature Required',
        message: 'Log chiller arrival temperature in °C before completing delivery.',
      });
      return;
    }

    setSubmittingDeliver(true);
    try {
      await updateOrderCustodyTransition({
        order: deliverOrder,
        nextStatus: OrderStatus.DELIVERED_TO_LAB,
        eventType: CustodyEventType.DELIVERED_TO_PARTNER_LAB,
        operatorUid: session.firebaseUser.uid,
        operatorName: session.profile.displayName,
        operatorRole: UserRole.PHLEBOTOMIST,
        temperatureCelsius: numericTemp,
        notes: `Handover OTP verified & delivered to ${deliverOrder.targetLabName} at ${numericTemp}°C`,
      });

      await dispatchPlatformAlert({
        title: `Specimen Arrived: ${deliverOrder.orderNumber}`,
        message: `${session.profile.displayName} handed over ${deliverOrder.specimens.map((s) => s.testCode).join(', ')} at ${numericTemp}°C. Ready for QC accessioning.`,
        category: NotificationCategory.SAMPLE_COLLECTED,
        priority: NotificationPriority.HIGH,
        recipientRole: UserRole.LARGE_LAB,
        orderId: deliverOrder.id,
        queueEmail: false,
      });

      const finishedNum = deliverOrder.orderNumber;
      const targetName = deliverOrder.targetLabName;
      setDeliverOrder(null);
      setOtpInput('');
      setActiveTab('custody');
      onShowAlert({
        variant: 'success',
        title: `Delivered: ${finishedNum}`,
        message: `Handover OTP verified and sample logged as DELIVERED_TO_LAB at ${targetName}.`,
      });
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Delivery Verification Failed',
        message: (err as Error).message || 'Could not update delivery record in Firestore.',
      });
    } finally {
      setSubmittingDeliver(false);
    }
  }

  async function handleShiftChange(nextStatus: PhlebotomistShiftStatus) {
    if (!myPhleboId) {
      onShowAlert({
        variant: 'warning',
        title: 'Missing Phlebotomist Profile',
        message: 'Ask Platform Admin to assign a Phlebotomist ID to your user record.',
      });
      return;
    }
    setUpdatingShift(true);
    try {
      await updatePhleboShiftStatus(myPhleboId, nextStatus, {
        name: session.profile.displayName,
        email: session.profile.email.trim().toLowerCase(),
      });
      onShowAlert({
        variant: 'success',
        title: 'Shift Status Saved',
        message: `Duty mode updated to ${nextStatus} live in Cloud Firestore.`,
      });
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Shift Update Blocked',
        message:
          (err as Error).message ||
          'Ensure Platform Admin has initialized your fleet profile in Admin -> Phlebotomists.',
      });
    } finally {
      setUpdatingShift(false);
    }
  }

  function handleTriggerSos() {
    onShowAlert({
      variant: 'confirm',
      title: 'Trigger Cold-Chain Emergency SOS?',
      message:
        'This dispatches a CRITICAL priority alert + email to Platform Admin Operations Desk for immediate backup courier assignment.',
      confirmLabel: 'Dispatch SOS Alert',
      cancelLabel: 'Cancel',
      onConfirm: () => {
        void (async () => {
          try {
            await dispatchPlatformAlert({
              title: `EMERGENCY SOS — ${myPhleboId || session.profile.displayName}`,
              message: `Field Phlebotomist ${session.profile.displayName} (${session.profile.email}) triggered a Cold-Chain Emergency SOS. Immediate dispatch intervention required.`,
              category: NotificationCategory.TEMPERATURE_ALERT,
              priority: NotificationPriority.CRITICAL,
              recipientEmail: ADMIN_LOGIN_EMAIL,
              recipientRole: UserRole.ADMIN,
              queueEmail: true,
            });
            onShowAlert({
              variant: 'error',
              title: 'SOS Alert Dispatched to Admin',
              message:
                'Critical notification and email alert queued in Cloud Firestore for Platform Admin.',
            });
          } catch (err) {
            onShowAlert({
              variant: 'error',
              title: 'SOS Dispatch Failed',
              message: (err as Error).message || 'Could not queue SOS notification.',
            });
          }
        })();
      },
    });
  }

  const initials = (session.profile.displayName || 'PH')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="app-shell">
      {/* DARK SPRUCE SIDEBAR */}
      <aside className="sidebar-dark">
        <div className="brand-header">
          <div className="brand-logo-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M10 2v7.31M14 2v7.31M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0" />
            </svg>
          </div>
          <div className="brand-title-wrap">
            <span className="brand-title">{LABSETU_THEME.brand.name}</span>
            <span className="brand-subtitle">Field Phlebotomist</span>
          </div>
        </div>

        <ul className="sidebar-nav">
          <li
            className={`sidebar-nav-item ${activeTab === 'requests' ? 'active' : ''}`}
            onClick={() => setActiveTab('requests')}
          >
            <span>📥</span>
            <span>Booking Requests</span>
            <span className="nav-badge-red">{metrics.openPoolCount}</span>
          </li>
          <li
            className={`sidebar-nav-item ${activeTab === 'collect' ? 'active' : ''}`}
            onClick={() => setActiveTab('collect')}
          >
            <span>🧪</span>
            <span>Collect Sample</span>
            <span className="nav-badge-teal">{metrics.toCollectCount}</span>
          </li>
          <li
            className={`sidebar-nav-item ${activeTab === 'deliver' ? 'active' : ''}`}
            onClick={() => setActiveTab('deliver')}
          >
            <span>🔐</span>
            <span>Drop &amp; OTP Verify</span>
            <span className="nav-badge-amber">{metrics.inTransitCount}</span>
          </li>
          <li
            className={`sidebar-nav-item ${activeTab === 'custody' ? 'active' : ''}`}
            onClick={() => setActiveTab('custody')}
          >
            <span>📦</span>
            <span>Custody History</span>
            <span className="nav-badge-green">{metrics.totalAssignedCount}</span>
          </li>
          <li
            className={`sidebar-nav-item ${activeTab === 'earnings' ? 'active' : ''}`}
            onClick={() => setActiveTab('earnings')}
          >
            <span>💰</span>
            <span>Earnings &amp; Ledger</span>
          </li>
          <li
            className={`sidebar-nav-item ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            <span>🏍️</span>
            <span>Shift &amp; Chiller Kit</span>
          </li>
        </ul>

        <div className="sidebar-footer-card" onClick={() => setActiveTab('profile')}>
          <div className="sidebar-footer-icon">🏍️</div>
          <div>
            <div className="sidebar-footer-title">{session.profile.displayName}</div>
            <div className="sidebar-footer-subtitle">
              {myPhleboId || 'Unassigned ID'} • {currentShift}
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="main-wrapper">
        <header className="top-navbar">
          <div className="top-search-pill">
            <span>🔍</span>
            <input
              type="text"
              placeholder="Search booking ID, pickup lab, target lab, barcode, or patient..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="top-nav-right">
            <span
              className={
                currentShift === 'ONLINE'
                  ? 'status-pill-green'
                  : currentShift === 'BREAK'
                  ? 'status-pill-amber'
                  : 'status-pill-red'
              }
            >
              ● {currentShift}
            </span>

            <div className="notif-wrapper">
              <div className="nav-icon-circle" onClick={() => setNotifOpen(!notifOpen)}>
                <span>🔔</span>
                {unreadCount > 0 && <span className="notif-count-badge">{unreadCount}</span>}
              </div>

              {notifOpen && (
                <div className="notif-popover">
                  <div className="notif-popover-header">
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700 }}>Dispatch Alerts</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                        {ROLE_LABELS[session.profile.role]}
                      </div>
                    </div>
                  </div>
                  <div className="notif-list">
                    {notifications.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', fontSize: '0.82rem', color: '#64748B' }}>
                        No dispatch notifications yet.
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
          {!myPhleboId && (
            <div
              className="admin-auth-alert error"
              style={{ marginBottom: '20px', fontWeight: 600 }}
            >
              Action Required: Your user record does not have a <code>phlebotomistId</code> yet.
              Ask Platform Admin to assign a fleet ID in <strong>Users &amp; Roles</strong> so you
              can claim open bookings and log chain-of-custody events.
            </div>
          )}

          {/* LIVE KPI SUMMARY */}
          <section className="kpi-5-row">
            <div className="kpi-card-modern">
              <div className="kpi-icon-box-orange">📥</div>
              <div className="kpi-body">
                <span className="kpi-title">Open Dispatch Pool</span>
                <span className="kpi-main-number">{metrics.openPoolCount}</span>
                <span className="kpi-sub-split">Ready to accept</span>
              </div>
            </div>

            <div className="kpi-card-modern">
              <div className="kpi-icon-box-blue">🧪</div>
              <div className="kpi-body">
                <span className="kpi-title">Awaiting Collection</span>
                <span className="kpi-main-number">{metrics.toCollectCount}</span>
                <span className="kpi-sub-split">Assigned to {myPhleboId || 'you'}</span>
              </div>
            </div>

            <div className="kpi-card-modern">
              <div className="kpi-icon-box-mint">🏍️</div>
              <div className="kpi-body">
                <span className="kpi-title">In Chiller Transit</span>
                <span className="kpi-main-number">{metrics.inTransitCount}</span>
                <span className="kpi-sub-split">Awaiting OTP handover</span>
              </div>
            </div>

            <div className="kpi-card-modern">
              <div className="kpi-icon-box-green">✅</div>
              <div className="kpi-body">
                <span className="kpi-title">Delivered Handovers</span>
                <span className="kpi-main-number">{metrics.completedCount}</span>
                <span className="kpi-sub-split">{metrics.todayPickups} active today</span>
              </div>
            </div>

            <div className="kpi-card-modern">
              <div className="kpi-icon-box-purple">₹</div>
              <div className="kpi-body">
                <span className="kpi-title">Delivered Payouts</span>
                <span className="kpi-main-number">{formatInr(metrics.earnedDelivered)}</span>
                <span className="kpi-sub-split">{formatInr(metrics.settledInr)} settled</span>
              </div>
            </div>
          </section>

          {/* TAB 1: BOOKING REQUESTS */}
          {activeTab === 'requests' && (
            <div className="settings-grid-2">
              <div className="chart-card-modern">
                <div className="card-top-header">
                  <div>
                    <h2 className="card-top-title">
                      Open Dispatch Pool ({filteredOpenPool.length})
                    </h2>
                    <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
                      Unassigned READY_FOR_PICKUP bookings stored live in Cloud Firestore
                    </p>
                  </div>
                </div>

                {filteredOpenPool.length === 0 ? (
                  <div className="empty-state-box">
                    <h4>No Unassigned Pickups in Pool</h4>
                    <p>
                      Whenever a Small Collection Lab creates a pickup booking without a fixed
                      courier, it appears here immediately.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {filteredOpenPool.map((o) => (
                      <div
                        key={o.id}
                        style={{
                          border: '1px solid #E2E8F0',
                          borderRadius: '12px',
                          padding: '16px',
                          background: '#F8FAFC',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <div>
                            <strong style={{ fontSize: '0.96rem' }}>{o.orderNumber}</strong>
                            <span className="status-pill-amber" style={{ marginLeft: '8px' }}>
                              {o.priority}
                            </span>
                          </div>
                          <strong style={{ color: '#0D9488' }}>
                            {formatInr(o.courierFeeInr || 0)}
                          </strong>
                        </div>
                        <div style={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.55 }}>
                          <div><strong>Pickup:</strong> {o.smallLabName} ({o.pickupLocation.address})</div>
                          <div><strong>Drop:</strong> {o.targetLabName} ({o.deliveryLocation.address})</div>
                          <div><strong>Specimens:</strong> {o.specimens.map((s) => `${s.testCode} (${s.tubeType})`).join(', ')}</div>
                          <div><strong>Patient:</strong> {o.patient.pseudonym} • <strong>Slot:</strong> {o.scheduledPickupAt}</div>
                        </div>
                        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="btn-primary"
                            disabled={claimingOrderId === o.id}
                            onClick={() => void handleAcceptPoolBooking(o)}
                          >
                            {claimingOrderId === o.id ? 'Claiming...' : 'Accept & Claim Pickup →'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="chart-card-modern">
                <div className="card-top-header">
                  <div>
                    <h2 className="card-top-title">
                      Assigned to Me ({filteredToCollect.length})
                    </h2>
                    <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
                      Proceed to collection center &amp; verify specimen barcode
                    </p>
                  </div>
                </div>

                {filteredToCollect.length === 0 ? (
                  <div className="empty-state-box">
                    <h4>No Pending Pickups Assigned</h4>
                    <p>Accept a booking from the Open Dispatch Pool or wait for Admin dispatch.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {filteredToCollect.map((o) => (
                      <div
                        key={o.id}
                        style={{
                          border: '1px solid #99F6E4',
                          borderRadius: '12px',
                          padding: '16px',
                          background: '#F0FDFA',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <strong>{o.orderNumber}</strong>
                          <span className="status-pill-blue">{o.status}</span>
                        </div>
                        <div style={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.55 }}>
                          <div><strong>Pickup From:</strong> {o.smallLabName}</div>
                          <div><strong>Deliver To:</strong> {o.targetLabName}</div>
                          <div><strong>Tests:</strong> {o.specimens.map((s) => s.testCode).join(', ')}</div>
                          <div><strong>Barcodes:</strong> <code>{o.specimens.map((s) => s.barcode).join(', ')}</code></div>
                        </div>
                        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => handleDeclineAssignedBooking(o)}
                          >
                            Decline
                          </button>
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => {
                              setCollectOrder(o);
                              setBarcodeInput(o.specimens[0]?.barcode || '');
                              setPickupTempInput(String(myPhleboProfile?.chillerTempCelsius ?? 4.2));
                            }}
                          >
                            Collect Sample →
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: COLLECT SAMPLE */}
          {activeTab === 'collect' && (
            <div className="chart-card-modern">
              <div className="card-top-header">
                <div>
                  <h2 className="card-top-title">
                    Sample Collection &amp; Barcode Scan Queue ({filteredToCollect.length})
                  </h2>
                  <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
                    Scan specimen tube barcode and log chiller box temperature (2°C–8°C) before
                    departing collection lab
                  </p>
                </div>
              </div>

              {filteredToCollect.length === 0 ? (
                <div className="empty-state-box">
                  <h4>No Specimens Awaiting Pickup</h4>
                  <p>All assigned bookings have already been collected or none are assigned yet.</p>
                  <button type="button" className="btn-primary" onClick={() => setActiveTab('requests')}>
                    Browse Booking Requests
                  </button>
                </div>
              ) : (
                <div className="data-table-container">
                  <table className="modern-data-table">
                    <thead>
                      <tr>
                        <th>Booking ID</th>
                        <th>Collection Lab</th>
                        <th>Patient</th>
                        <th>Expected Barcode(s)</th>
                        <th>Destination Hub</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredToCollect.map((o) => (
                        <tr key={o.id}>
                          <td><strong>{o.orderNumber}</strong></td>
                          <td>{o.smallLabName}</td>
                          <td>{o.patient.pseudonym}</td>
                          <td><code>{o.specimens.map((s) => s.barcode).join(', ')}</code></td>
                          <td>{o.targetLabName}</td>
                          <td style={{ display: 'flex', gap: '8px' }}>
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() => {
                                setCollectOrder(o);
                                setBarcodeInput(o.specimens[0]?.barcode || '');
                                setPickupTempInput(String(myPhleboProfile?.chillerTempCelsius ?? 4.2));
                              }}
                            >
                              Scan &amp; Collect
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => handleDeclineAssignedBooking(o)}
                            >
                              Decline
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

          {/* TAB 3: DROP SAMPLE & VERIFY OTP */}
          {activeTab === 'deliver' && (
            <div className="chart-card-modern">
              <div className="card-top-header">
                <div>
                  <h2 className="card-top-title">
                    Active Chiller Transit &amp; OTP Drop Handover ({filteredInTransit.length})
                  </h2>
                  <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
                    Verify the 5-digit Handover OTP with Reference Lab receiving staff to log
                    DELIVERED_TO_LAB
                  </p>
                </div>
              </div>

              {filteredInTransit.length === 0 ? (
                <div className="empty-state-box">
                  <h4>No Specimens Currently In Transit</h4>
                  <p>Collect an assigned sample first to begin tracked cold-chain transit.</p>
                </div>
              ) : (
                <div className="data-table-container">
                  <table className="modern-data-table">
                    <thead>
                      <tr>
                        <th>Booking ID</th>
                        <th>From Lab</th>
                        <th>Target Reference Hub</th>
                        <th>Temp Logged</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInTransit.map((o) => (
                        <tr key={o.id}>
                          <td><strong>{o.orderNumber}</strong></td>
                          <td>{o.smallLabName}</td>
                          <td>{o.targetLabName}</td>
                          <td>
                            {o.arrivalTemperatureCelsius !== undefined
                              ? `${o.arrivalTemperatureCelsius}°C`
                              : '—'}
                          </td>
                          <td><span className="status-pill-blue">{o.status}</span></td>
                          <td style={{ display: 'flex', gap: '8px' }}>
                            {o.status === OrderStatus.PICKED_UP && (
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => void handleMarkInTransit(o)}
                              >
                                Mark In Transit
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() => {
                                setDeliverOrder(o);
                                setOtpInput('');
                                setDropTempInput(
                                  String(o.arrivalTemperatureCelsius ?? myPhleboProfile?.chillerTempCelsius ?? 4.2)
                                );
                              }}
                            >
                              Verify OTP &amp; Drop →
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

          {/* TAB 4: CUSTODY HISTORY */}
          {activeTab === 'custody' && (
            <div className="chart-card-modern">
              <div className="card-top-header">
                <h2 className="card-top-title">
                  My Bookings &amp; Custody Ledger ({filteredAllMine.length})
                </h2>
              </div>

              {filteredAllMine.length === 0 ? (
                <div className="empty-state-box">
                  <h4>No Pickups Recorded Yet</h4>
                  <p>Accepted and delivered bookings appear here with real-time custody status.</p>
                </div>
              ) : (
                <div className="data-table-container">
                  <table className="modern-data-table">
                    <thead>
                      <tr>
                        <th>Booking ID</th>
                        <th>Route</th>
                        <th>Patient</th>
                        <th>Tests</th>
                        <th>Last Temp</th>
                        <th>Courier Fee</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAllMine.map((o) => (
                        <tr key={o.id}>
                          <td><strong>{o.orderNumber}</strong></td>
                          <td>
                            {o.smallLabName} → {o.targetLabName}
                          </td>
                          <td>{o.patient.pseudonym}</td>
                          <td>{o.specimens.map((s) => s.testCode).join(', ')}</td>
                          <td>
                            {o.arrivalTemperatureCelsius !== undefined
                              ? `${o.arrivalTemperatureCelsius}°C`
                              : '—'}
                          </td>
                          <td><strong>{formatInr(o.courierFeeInr || 0)}</strong></td>
                          <td>
                            <span
                              className={
                                isOrderCompleted(o.status) ||
                                o.status === OrderStatus.DELIVERED_TO_LAB
                                  ? 'status-pill-green'
                                  : 'status-pill-blue'
                              }
                            >
                              {o.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: EARNINGS & LEDGER */}
          {activeTab === 'earnings' && (
            <div className="settings-grid-2">
              <div className="chart-card-modern">
                <div className="card-top-header">
                  <h2 className="card-top-title">Live Payout Breakdown ({earningRows.length})</h2>
                </div>

                <div className="kpi-row" style={{ marginBottom: '18px', gridTemplateColumns: 'repeat(2, 1fr)' }}>
                  <div className="kpi-card-modern">
                    <div className="kpi-body">
                      <span className="kpi-title">Delivered Earnings</span>
                      <span className="kpi-main-number">{formatInr(metrics.earnedDelivered)}</span>
                    </div>
                  </div>
                  <div className="kpi-card-modern">
                    <div className="kpi-body">
                      <span className="kpi-title">Pending Settlement</span>
                      <span className="kpi-main-number">{formatInr(metrics.pendingPayoutInr)}</span>
                    </div>
                  </div>
                </div>

                {earningRows.length === 0 ? (
                  <div className="empty-state-box">
                    <h4>No Courier Payouts Yet</h4>
                    <p>Accept and complete pickups to populate your live Firestore payout ledger.</p>
                  </div>
                ) : (
                  <div className="data-table-container">
                    <table className="modern-data-table">
                      <thead>
                        <tr>
                          <th>Booking ID</th>
                          <th>Route</th>
                          <th>Courier Payout</th>
                          <th>Settlement Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {earningRows.map(({ order, amountInr, settled, delivered }) => (
                          <tr key={order.id}>
                            <td><strong>{order.orderNumber}</strong></td>
                            <td>{order.smallLabName} → {order.targetLabName}</td>
                            <td><strong>{formatInr(amountInr)}</strong></td>
                            <td>
                              <span
                                className={
                                  settled
                                    ? 'status-pill-green'
                                    : delivered
                                    ? 'status-pill-amber'
                                    : 'status-pill-blue'
                                }
                              >
                                {settled ? 'SETTLED' : delivered ? 'PENDING PAYOUT' : 'IN PROGRESS'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="chart-card-modern">
                <div className="card-top-header">
                  <h2 className="card-top-title">7-Day Pickup Activity (Live)</h2>
                </div>
                <div
                  style={{
                    padding: '24px 0',
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: '16px',
                    height: '220px',
                    borderBottom: '1px solid #E2E8F0',
                  }}
                >
                  {metrics.weeklyBars.map((bar) => {
                    const maxC = Math.max(1, ...metrics.weeklyBars.map((b) => b.count));
                    return (
                      <div
                        key={bar.day}
                        style={{
                          flex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{bar.count}</span>
                        <div
                          style={{
                            width: '100%',
                            maxWidth: '38px',
                            height: `${Math.max(6, (bar.count / maxC) * 145)}px`,
                            background: '#0D9488',
                            borderRadius: '6px 6px 0 0',
                          }}
                        />
                        <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{bar.day}</span>
                      </div>
                    );
                  })}
                </div>
                <p style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '12px' }}>
                  Calculated live from your assigned `orders` and `settlements` collections in Cloud
                  Firestore.
                </p>
              </div>
            </div>
          )}

          {/* TAB 6: SHIFT & COLD-CHAIN KIT */}
          {activeTab === 'profile' && (
            <div className="settings-grid-2">
              <div className="chart-card-modern">
                <div className="card-top-header">
                  <h2 className="card-top-title">Shift Duty Controls &amp; Cold-Chain Kit</h2>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                  {(['ONLINE', 'BREAK', 'OFFLINE'] as PhlebotomistShiftStatus[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      disabled={updatingShift}
                      className={currentShift === st ? 'btn-primary' : 'btn-secondary'}
                      onClick={() => void handleShiftChange(st)}
                    >
                      {st === 'ONLINE' ? '🟢 Online' : st === 'BREAK' ? '🟡 Break' : '🔴 Offline'}
                    </button>
                  ))}
                </div>

                <div className="network-list-item">
                  <span>Phlebotomist ID</span>
                  <strong>{myPhleboId || 'Unassigned'}</strong>
                </div>
                <div className="network-list-item">
                  <span>Account Email</span>
                  <strong>{session.profile.email}</strong>
                </div>
                <div className="network-list-item">
                  <span>Assigned Zone</span>
                  <strong>{myPhleboProfile?.currentLocation || 'Awaiting Admin Zone Config'}</strong>
                </div>
                <div className="network-list-item">
                  <span>Smart Cooler Box</span>
                  <strong>
                    {myPhleboProfile?.coolerBoxId
                      ? `${myPhleboProfile.coolerBoxId} (${myPhleboProfile.chillerTempCelsius}°C)`
                      : 'Awaiting Chiller Telemetry Assignment'}
                  </strong>
                </div>
                <div className="network-list-item">
                  <span>Vehicle Unit</span>
                  <strong>{myPhleboProfile?.vehicleInfo || 'Awaiting Vehicle Assignment'}</strong>
                </div>
                <div className="network-list-item">
                  <span>Fleet Verification</span>
                  <span className={myPhleboProfile?.verified ? 'status-pill-green' : 'status-pill-amber'}>
                    {myPhleboProfile?.verified ? 'VERIFIED' : 'PENDING ADMIN INIT'}
                  </span>
                </div>
              </div>

              <div className="chart-card-modern">
                <div className="card-top-header">
                  <h2 className="card-top-title">Emergency Cold-Chain Escalation</h2>
                </div>
                <p style={{ fontSize: '0.86rem', color: '#64748B', lineHeight: 1.6, marginBottom: '18px' }}>
                  If cooler temperatures drift outside <strong>2°C – 8°C</strong> or your vehicle
                  experiences an incident during transit, dispatch an instant SOS alert + email to
                  Platform Admin ({ADMIN_LOGIN_EMAIL}).
                </p>

                <button
                  type="button"
                  className="labsetu-alert-btn-danger"
                  style={{ width: '100%', padding: '12px 16px' }}
                  onClick={handleTriggerSos}
                >
                  🚨 Trigger Emergency Cold-Chain SOS
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* MODAL: COLLECT SAMPLE & SCAN BARCODE */}
      {collectOrder && (
        <div className="modal-overlay" onClick={() => setCollectOrder(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Collect Specimen • {collectOrder.orderNumber}</h3>
              <button type="button" className="btn-secondary" onClick={() => setCollectOrder(null)}>
                ✕
              </button>
            </div>
            <form onSubmit={(e) => void handleCollectSampleSubmit(e)}>
              <div className="modal-body">
                <p style={{ fontSize: '0.84rem', color: '#475569', marginBottom: '14px' }}>
                  Pickup Lab: <strong>{collectOrder.smallLabName}</strong> → Target Hub:{' '}
                  <strong>{collectOrder.targetLabName}</strong>
                </p>
                <div className="form-group">
                  <label className="form-label">Scanned Tube Barcode</label>
                  <input
                    className="form-input"
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    placeholder="e.g. SMP-104561-CBC"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Chiller Box Temperature (°C)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="form-input"
                    value={pickupTempInput}
                    onChange={(e) => setPickupTempInput(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setCollectOrder(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submittingCollect}>
                  {submittingCollect ? 'Logging Custody...' : 'Confirm Sample Collected →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DROP SAMPLE & VERIFY 5-DIGIT OTP */}
      {deliverOrder && (
        <div className="modal-overlay" onClick={() => setDeliverOrder(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Drop Handover OTP • {deliverOrder.orderNumber}</h3>
              <button type="button" className="btn-secondary" onClick={() => setDeliverOrder(null)}>
                ✕
              </button>
            </div>
            <form onSubmit={(e) => void handleDeliverOtpSubmit(e)}>
              <div className="modal-body">
                <p style={{ fontSize: '0.84rem', color: '#475569', marginBottom: '14px' }}>
                  Confirm specimen handover at <strong>{deliverOrder.targetLabName}</strong> using
                  the booking&apos;s 5-digit Handover OTP.
                </p>
                <div className="form-group">
                  <label className="form-label">5-Digit Receiving Handover OTP</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    className="form-input otp-code-input"
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="•••••"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Arrival Chiller Temperature (°C)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="form-input"
                    value={dropTempInput}
                    onChange={(e) => setDropTempInput(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setDeliverOrder(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submittingDeliver}>
                  {submittingDeliver ? 'Verifying...' : 'Verify OTP & Complete Delivery ✓'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
