import React, { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  TextInput,
} from 'react-native';
import {
  computeDailyVolumeBars,
  type CustodyEvent,
  CustodyEventType,
  formatInr,
  formatOrderStatus,
  isOrderCompleted,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  OrderStatus,
  type PhlebotomistProfile,
  type PhlebotomistShiftStatus,
  type PickupOrder,
  type SettlementRecord,
  UserRole,
} from '@diagnostic/shared';
import { signOut } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { ADMIN_LOGIN_EMAIL, auth, db } from './firebase';
import {
  DynamicAlertModal,
  type DynamicAlertState,
  type DynamicAlertVariant,
  INITIAL_DYNAMIC_ALERT,
} from './components/DynamicAlertModal';
import {
  PhleboAuthGate,
  type VerifiedPhleboSession,
} from './components/PhleboAuthGate';

const COLORS = {
  primaryTeal: '#0D9488',
  primaryDark: '#0F766E',
  accentBlue: '#2563EB',
  successGreen: '#16A34A',
  warningAmber: '#F59E0B',
  errorRed: '#DC2626',
  background: '#F8FAFC',
  surfaceCard: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  borderLight: '#E2E8F0',
};

type ScreenType =
  | 'BOOKING_REQUESTS'
  | 'BOOKING_DETAILS'
  | 'COLLECT_SAMPLE'
  | 'DROP_SAMPLE'
  | 'COMPLETED';

function formatLabel(value?: string | null): string {
  if (!value) return '—';
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .replace(/\bEdta\b/g, 'EDTA')
    .replace(/\bStat\b/g, 'STAT');
}

interface CompletedReceipt {
  orderNumber: string;
  targetLabName: string;
  feeInr: number;
  tempCelsius: number;
  completedAt: string;
}

export default function App() {
  const [session, setSession] = useState<VerifiedPhleboSession | null>(null);
  const [alertState, setAlertState] = useState<DynamicAlertState>(INITIAL_DYNAMIC_ALERT);
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('BOOKING_REQUESTS');
  const [requestTab, setRequestTab] = useState<'new' | 'active' | 'completed'>('new');
  const [bottomTab, setBottomTab] = useState<'home' | 'bookings' | 'earnings' | 'profile'>('home');

  // Live Cloud Firestore Data States (ZERO hardcoded or dummy data)
  const [orders, setOrders] = useState<PickupOrder[]>([]);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [myPhleboProfile, setMyPhleboProfile] = useState<PhlebotomistProfile | null>(null);

  // Selected trip & workflow form state
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [otpValue, setOtpValue] = useState<string[]>(['', '', '', '', '']);
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [pickupTempInput, setPickupTempInput] = useState('4.2');
  const [dropTempInput, setDropTempInput] = useState('4.2');
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [submittingAction, setSubmittingAction] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<CompletedReceipt | null>(null);

  // History filter state
  const [bookingHistoryFilter, setBookingHistoryFilter] = useState<
    'all' | 'active' | 'completed' | 'scheduled'
  >('all');
  const [bookingSearchQuery, setBookingSearchQuery] = useState('');

  const showDynamicAlert = (opts: {
    variant: DynamicAlertVariant;
    title: string;
    message: string;
    detail?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm?: () => void;
  }) => {
    setAlertState({
      isOpen: true,
      variant: opts.variant,
      title: opts.title,
      message: opts.message,
      detail: opts.detail,
      confirmLabel: opts.confirmLabel,
      cancelLabel: opts.cancelLabel,
      onConfirm: opts.onConfirm,
    });
  };

  const handleSignOut = () => {
    showDynamicAlert({
      variant: 'confirm',
      title: 'Sign Out of LabSetu?',
      message: `End current shift session for ${session?.profile.email || 'this account'}?`,
      confirmLabel: 'Sign Out',
      cancelLabel: 'Stay Signed In',
      onConfirm: () => {
        void (async () => {
          if (auth.currentUser) {
            await signOut(auth);
          }
          setSession(null);
          setOrders([]);
          setSettlements([]);
          setMyPhleboProfile(null);
          setSelectedOrderId(null);
          setBottomTab('home');
          setCurrentScreen('BOOKING_REQUESTS');
        })();
      },
    });
  };

  const myPhleboId = session?.profile.phlebotomistId?.trim() || '';
  const phleboName = session?.profile.displayName || '';
  const phleboFirstName = phleboName.split(' ')[0] || 'Courier';
  const phleboInitial = phleboName.charAt(0).toUpperCase() || 'P';
  const phleboEmail = session?.profile.email || '';

  // Subscribe live to Cloud Firestore (`orders`, `phlebotomists`, `settlements`)
  useEffect(() => {
    if (!session?.firebaseUser) {
      setOrders([]);
      setSettlements([]);
      setMyPhleboProfile(null);
      return;
    }

    const unsubs: Unsubscribe[] = [];
    const orderMap = new Map<string, PickupOrder>();
    const emitOrders = () => {
      setOrders(
        Array.from(orderMap.values()).sort((a, b) =>
          (b.createdAt || '').localeCompare(a.createdAt || '')
        )
      );
    };

    // 1. Open dispatch pool (READY_FOR_PICKUP with no assigned phlebo)
    unsubs.push(
      onSnapshot(
        query(
          collection(db, 'orders'),
          where('status', '==', OrderStatus.READY_FOR_PICKUP),
          where('phlebotomistId', '==', '')
        ),
        (snap) => {
          for (const [k, v] of orderMap.entries()) {
            if (v.status === OrderStatus.READY_FOR_PICKUP && !v.phlebotomistId) {
              orderMap.delete(k);
            }
          }
          snap.docs.forEach((d) => {
            orderMap.set(d.id, { id: d.id, ...(d.data() as Omit<PickupOrder, 'id'>) });
          });
          emitOrders();
        }
      )
    );

    // 2. Assigned bookings for this phlebotomist
    if (myPhleboId) {
      unsubs.push(
        onSnapshot(
          query(collection(db, 'orders'), where('phlebotomistId', '==', myPhleboId)),
          (snap) => {
            for (const [k, v] of orderMap.entries()) {
              if (v.phlebotomistId === myPhleboId) {
                orderMap.delete(k);
              }
            }
            snap.docs.forEach((d) => {
              orderMap.set(d.id, { id: d.id, ...(d.data() as Omit<PickupOrder, 'id'>) });
            });
            emitOrders();
          }
        )
      );

      // 3. Phlebotomist fleet profile doc
      unsubs.push(
        onSnapshot(doc(db, 'phlebotomists', myPhleboId), (snap) => {
          if (snap.exists()) {
            setMyPhleboProfile({
              id: snap.id,
              ...(snap.data() as Omit<PhlebotomistProfile, 'id'>),
            });
          } else {
            setMyPhleboProfile(null);
          }
        })
      );

      // 4. Live settlements for this phlebotomist
      unsubs.push(
        onSnapshot(
          query(collection(db, 'settlements'), where('phlebotomistId', '==', myPhleboId)),
          (snap) => {
            const list = snap.docs
              .map((d) => ({ id: d.id, ...(d.data() as Omit<SettlementRecord, 'id'>) }))
              .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
            setSettlements(list);
          }
        )
      );
    } else if (phleboEmail) {
      unsubs.push(
        onSnapshot(
          query(
            collection(db, 'phlebotomists'),
            where('email', '==', phleboEmail.toLowerCase())
          ),
          (snap) => {
            if (!snap.empty) {
              const first = snap.docs[0];
              setMyPhleboProfile({
                id: first.id,
                ...(first.data() as Omit<PhlebotomistProfile, 'id'>),
              });
            }
          }
        )
      );
    }

    return () => unsubs.forEach((u) => u());
  }, [session?.firebaseUser, myPhleboId, phleboEmail]);

  const effectivePhleboId = myPhleboId || myPhleboProfile?.id || '';
  const dutyStatus: PhlebotomistShiftStatus = myPhleboProfile?.status || 'ONLINE';
  const isOnline = dutyStatus === 'ONLINE';

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
        (o) => Boolean(effectivePhleboId) && o.phlebotomistId === effectivePhleboId
      ),
    [orders, effectivePhleboId]
  );

  const activeAssignedOrders = useMemo(
    () =>
      myAssignedOrders.filter(
        (o) =>
          o.status === OrderStatus.ASSIGNED_TO_PHLEBO ||
          o.status === OrderStatus.PICKED_UP ||
          o.status === OrderStatus.IN_TRANSIT
      ),
    [myAssignedOrders]
  );

  const completedAssignedOrders = useMemo(
    () =>
      myAssignedOrders.filter(
        (o) =>
          o.status === OrderStatus.DELIVERED_TO_LAB ||
          o.status === OrderStatus.UNDER_ANALYSIS ||
          isOrderCompleted(o.status)
      ),
    [myAssignedOrders]
  );

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) || null,
    [orders, selectedOrderId]
  );

  // Merge live settlements with handled orders for accurate earnings computation
  const earningRows = useMemo(() => {
    const stlMap = new Map(settlements.map((s) => [s.orderId, s]));
    return myAssignedOrders
      .filter((o) => o.status !== OrderStatus.CANCELLED && o.status !== OrderStatus.REJECTED)
      .map((order) => {
        const stl = stlMap.get(order.id);
        const amountInr = stl?.phleboPayoutInr ?? order.courierFeeInr ?? 0;
        const settled = stl?.status === 'SETTLED';
        const delivered =
          order.status === OrderStatus.DELIVERED_TO_LAB ||
          order.status === OrderStatus.UNDER_ANALYSIS ||
          isOrderCompleted(order.status);
        return { order, stl, amountInr, settled, delivered };
      });
  }, [myAssignedOrders, settlements]);

  const metrics = useMemo(() => {
    const now = new Date();
    const todayStr = now.toDateString();
    const weekAgoMs = now.getTime() - 7 * 86400000;
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const todayEarnings = earningRows
      .filter((r) => new Date(r.order.updatedAt || r.order.createdAt).toDateString() === todayStr && r.delivered)
      .reduce((sum, r) => sum + r.amountInr, 0);

    const todayOrdersCount = myAssignedOrders.filter(
      (o) => new Date(o.updatedAt || o.createdAt).toDateString() === todayStr
    ).length;

    const todayCompletedCount = completedAssignedOrders.filter(
      (o) => new Date(o.updatedAt || o.createdAt).toDateString() === todayStr
    ).length;

    const weeklyEarnings = earningRows
      .filter(
        (r) =>
          r.delivered &&
          new Date(r.order.updatedAt || r.order.createdAt).getTime() >= weekAgoMs
      )
      .reduce((sum, r) => sum + r.amountInr, 0);

    const monthlyEarnings = earningRows
      .filter(
        (r) =>
          r.delivered &&
          (r.order.updatedAt || r.order.createdAt || '').startsWith(monthPrefix)
      )
      .reduce((sum, r) => sum + r.amountInr, 0);

    const totalEarnedDelivered = earningRows
      .filter((r) => r.delivered)
      .reduce((sum, r) => sum + r.amountInr, 0);

    const settledInr = earningRows
      .filter((r) => r.settled)
      .reduce((sum, r) => sum + r.amountInr, 0);

    const pendingPayoutInr = Math.max(0, totalEarnedDelivered - settledInr);

    const weeklyBars = computeDailyVolumeBars(myAssignedOrders);

    return {
      todayEarnings,
      todayOrdersCount,
      todayCompletedCount,
      weeklyEarnings,
      monthlyEarnings,
      totalEarnedDelivered,
      settledInr,
      pendingPayoutInr,
      weeklyBars,
    };
  }, [earningRows, myAssignedOrders, completedAssignedOrders]);

  const updateOtpDigit = (index: number, value: string) => {
    const clean = value.replace(/\D/g, '').slice(-1);
    const updated = [...otpValue];
    updated[index] = clean;
    setOtpValue(updated);
  };

  function openOrderWorkflow(order: PickupOrder) {
    setSelectedOrderId(order.id);
    setScannedBarcode(order.specimens[0]?.barcode || '');
    setPickupTempInput(String(myPhleboProfile?.chillerTempCelsius ?? 4.2));
    setDropTempInput(
      String(order.arrivalTemperatureCelsius ?? myPhleboProfile?.chillerTempCelsius ?? 4.2)
    );
    setOtpValue(['', '', '', '', '']);

    if (
      order.status === OrderStatus.PICKED_UP ||
      order.status === OrderStatus.IN_TRANSIT
    ) {
      setCurrentScreen('DROP_SAMPLE');
    } else {
      setCurrentScreen('BOOKING_DETAILS');
    }
  }

  async function handleAcceptPoolOrder(order: PickupOrder) {
    if (!session?.firebaseUser) return;
    if (!effectivePhleboId) {
      showDynamicAlert({
        variant: 'warning',
        title: 'Courier Profile Needed',
        message: `Ask Platform Admin (${ADMIN_LOGIN_EMAIL}) to assign a Courier ID to ${phleboEmail} under Team & Partner Accounts.`,
      });
      return;
    }

    setSubmittingAction(true);
    try {
      const now = new Date().toISOString();
      const evt: CustodyEvent = {
        id: `EVT-${Date.now()}`,
        orderId: order.id,
        eventType: CustodyEventType.COLD_CHAIN_CHECK,
        timestamp: now,
        operatorId: session.firebaseUser.uid,
        operatorName: phleboName,
        operatorRole: UserRole.PHLEBOTOMIST,
        notes: `Claimed from open pool by ${phleboName} (${effectivePhleboId})`,
      };

      await updateDoc(doc(db, 'orders', order.id), {
        phlebotomistId: effectivePhleboId,
        phlebotomistName: phleboName,
        status: OrderStatus.ASSIGNED_TO_PHLEBO,
        custodyHistory: [...(order.custodyHistory || []), evt],
        updatedAt: now,
      });

      await addDoc(collection(db, 'custody_events'), evt);

      await addDoc(collection(db, 'notifications'), {
        title: `Pickup Assigned: ${order.orderNumber}`,
        message: `${phleboName} (${effectivePhleboId}) accepted sample collection from ${order.smallLabName}.`,
        category: NotificationCategory.PICKUP_ASSIGNED,
        priority: NotificationPriority.NORMAL,
        recipientRole: UserRole.SMALL_LAB,
        orderId: order.id,
        channels: [NotificationChannel.IN_APP],
        read: false,
        emailSent: false,
        pushSent: false,
        createdAt: now,
      });

      openOrderWorkflow({
        ...order,
        phlebotomistId: effectivePhleboId,
        phlebotomistName: phleboName,
        status: OrderStatus.ASSIGNED_TO_PHLEBO,
      });
    } catch (err) {
      showDynamicAlert({
        variant: 'error',
        title: 'Claim Failed',
        message: (err as Error).message || 'Could not claim this booking right now. Please try again.',
      });
    } finally {
      setSubmittingAction(false);
    }
  }

  function handleDeclineAssignedOrder(order: PickupOrder) {
    if (!session?.firebaseUser) return;
    showDynamicAlert({
      variant: 'confirm',
      title: `Release Booking ${order.orderNumber}?`,
      message: 'This returns the sample pickup request back to the Open Dispatch Pool.',
      confirmLabel: 'Release Booking',
      cancelLabel: 'Keep Trip',
      onConfirm: () => {
        if (!session?.firebaseUser) return;
        void (async () => {
          try {
            const now = new Date().toISOString();
            const evt: CustodyEvent = {
              id: `EVT-${Date.now()}`,
              orderId: order.id,
              eventType: CustodyEventType.COLD_CHAIN_CHECK,
              timestamp: now,
              operatorId: session.firebaseUser!.uid,
              operatorName: phleboName,
              operatorRole: UserRole.PHLEBOTOMIST,
              notes: `Released back to open dispatch pool by ${phleboName}`,
            };

            await updateDoc(doc(db, 'orders', order.id), {
              phlebotomistId: '',
              phlebotomistName: '',
              status: OrderStatus.READY_FOR_PICKUP,
              custodyHistory: [...(order.custodyHistory || []), evt],
              updatedAt: now,
            });
            await addDoc(collection(db, 'custody_events'), evt);
            if (selectedOrderId === order.id) {
              setSelectedOrderId(null);
              setCurrentScreen('BOOKING_REQUESTS');
            }
            showDynamicAlert({
              variant: 'info',
              title: 'Booking Returned to Pool',
              message: `${order.orderNumber} is back in Open Dispatch Pool.`,
            });
          } catch (err) {
            showDynamicAlert({
              variant: 'error',
              title: 'Release Failed',
              message: (err as Error).message || 'Unable to release booking.',
            });
          }
        })();
      },
    });
  }

  async function handleConfirmCollection(order: PickupOrder) {
    if (!session?.firebaseUser) return;
    const cleanBarcode = scannedBarcode.trim();
    const numericTemp = Number.parseFloat(pickupTempInput);

    if (!cleanBarcode) {
      showDynamicAlert({
        variant: 'warning',
        title: 'Specimen Barcode Required',
        message: 'Scan or enter the specimen tube barcode before marking pickup complete.',
      });
      return;
    }
    if (Number.isNaN(numericTemp)) {
      showDynamicAlert({
        variant: 'warning',
        title: 'Temperature Required',
        message: 'Enter a numeric chiller temperature in °C.',
      });
      return;
    }

    setSubmittingAction(true);
    try {
      const now = new Date().toISOString();
      const evt: CustodyEvent = {
        id: `EVT-${Date.now()}`,
        orderId: order.id,
        eventType: CustodyEventType.PICKED_UP_BY_PHLEBO,
        timestamp: now,
        operatorId: session.firebaseUser.uid,
        operatorName: phleboName,
        operatorRole: UserRole.PHLEBOTOMIST,
        temperatureCelsius: numericTemp,
        notes: `Barcode ${cleanBarcode} scanned at ${numericTemp}°C by ${phleboName}`,
      };

      await updateDoc(doc(db, 'orders', order.id), {
        status: OrderStatus.PICKED_UP,
        actualPickupAt: now,
        arrivalTemperatureCelsius: numericTemp,
        custodyHistory: [...(order.custodyHistory || []), evt],
        updatedAt: now,
      });
      await addDoc(collection(db, 'custody_events'), evt);

      await addDoc(collection(db, 'notifications'), {
        title: `Sample Collected: ${order.orderNumber}`,
        message: `${phleboName} collected barcode ${cleanBarcode} (${numericTemp}°C) en route to ${order.targetLabName}.`,
        category: NotificationCategory.SAMPLE_COLLECTED,
        priority: NotificationPriority.NORMAL,
        recipientRole: UserRole.SMALL_LAB,
        orderId: order.id,
        channels: [NotificationChannel.IN_APP],
        read: false,
        emailSent: false,
        pushSent: false,
        createdAt: now,
      });

      if (numericTemp < 2 || numericTemp > 8) {
        await addDoc(collection(db, 'notifications'), {
          title: `Cold-Chain Excursion Alert — ${order.orderNumber}`,
          message: `Specimen temp logged at ${numericTemp}°C (outside 2°C–8°C safe band) by ${phleboName}.`,
          category: NotificationCategory.TEMPERATURE_ALERT,
          priority: NotificationPriority.CRITICAL,
          recipientEmail: ADMIN_LOGIN_EMAIL,
          recipientRole: UserRole.ADMIN,
          orderId: order.id,
          channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
          read: false,
          emailSent: false,
          pushSent: false,
          createdAt: now,
        });
      }

      setOtpValue(['', '', '', '', '']);
      setDropTempInput(String(numericTemp));
      setCurrentScreen('DROP_SAMPLE');

      showDynamicAlert({
        variant: numericTemp < 2 || numericTemp > 8 ? 'warning' : 'success',
        title: 'Barcode Verified & Collected',
        message: `Specimen ${cleanBarcode} marked Picked Up at ${numericTemp}°C.`,
        detail: `Proceed to ${order.targetLabName} for 5-digit Handover OTP.`,
      });
    } catch (err) {
      showDynamicAlert({
        variant: 'error',
        title: 'Collection Update Failed',
        message: (err as Error).message || 'Could not save pickup update. Please try again.',
      });
    } finally {
      setSubmittingAction(false);
    }
  }

  async function handleConfirmDropOtp(order: PickupOrder) {
    if (!session?.firebaseUser) return;
    const enteredOtp = otpValue.join('').replace(/\D/g, '');
    const numericTemp = Number.parseFloat(dropTempInput);

    if (enteredOtp.length < 5) {
      showDynamicAlert({
        variant: 'warning',
        title: '5-Digit Handover OTP Required',
        message: 'Ask the receiving lab / Small Lab coordinator for the 5-digit Handover OTP.',
      });
      return;
    }

    if (order.handoverOtp && enteredOtp !== order.handoverOtp) {
      showDynamicAlert({
        variant: 'error',
        title: 'Handover OTP Mismatch',
        message: `Entered code "${enteredOtp}" does not match booking ${order.orderNumber}. Verify directly with receiving desk.`,
      });
      return;
    }

    if (Number.isNaN(numericTemp)) {
      showDynamicAlert({
        variant: 'warning',
        title: 'Arrival Temperature Required',
        message: 'Enter numeric chiller drop temperature in °C.',
      });
      return;
    }

    setSubmittingAction(true);
    try {
      const now = new Date().toISOString();
      const evt: CustodyEvent = {
        id: `EVT-${Date.now()}`,
        orderId: order.id,
        eventType: CustodyEventType.DELIVERED_TO_PARTNER_LAB,
        timestamp: now,
        operatorId: session.firebaseUser.uid,
        operatorName: phleboName,
        operatorRole: UserRole.PHLEBOTOMIST,
        temperatureCelsius: numericTemp,
        notes: `Handover OTP verified & delivered to ${order.targetLabName} at ${numericTemp}°C`,
      };

      await updateDoc(doc(db, 'orders', order.id), {
        status: OrderStatus.DELIVERED_TO_LAB,
        actualDeliveredAt: now,
        arrivalTemperatureCelsius: numericTemp,
        custodyHistory: [...(order.custodyHistory || []), evt],
        updatedAt: now,
      });
      await addDoc(collection(db, 'custody_events'), evt);

      await addDoc(collection(db, 'notifications'), {
        title: `Specimen Arrived: ${order.orderNumber}`,
        message: `${phleboName} delivered ${order.specimens.map((s) => s.testCode).join(', ')} at ${numericTemp}°C. Ready for QC.`,
        category: NotificationCategory.SAMPLE_COLLECTED,
        priority: NotificationPriority.HIGH,
        recipientRole: UserRole.LARGE_LAB,
        orderId: order.id,
        channels: [NotificationChannel.IN_APP],
        read: false,
        emailSent: false,
        pushSent: false,
        createdAt: now,
      });

      setLastReceipt({
        orderNumber: order.orderNumber,
        targetLabName: order.targetLabName,
        feeInr: order.courierFeeInr || 0,
        tempCelsius: numericTemp,
        completedAt: new Date(now).toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      });
      setOtpValue(['', '', '', '', '']);
      setCurrentScreen('COMPLETED');
    } catch (err) {
      showDynamicAlert({
        variant: 'error',
        title: 'Drop Verification Failed',
        message: (err as Error).message || 'Could not save delivery update. Please try again.',
      });
    } finally {
      setSubmittingAction(false);
    }
  }

  async function handleShiftUpdate(nextStatus: PhlebotomistShiftStatus) {
    if (!effectivePhleboId) {
      showDynamicAlert({
        variant: 'warning',
        title: 'Courier Profile Needed',
        message: `Ask Platform Admin (${ADMIN_LOGIN_EMAIL}) to assign your Courier ID before changing your duty status.`,
      });
      return;
    }

    try {
      await updateDoc(doc(db, 'phlebotomists', effectivePhleboId), {
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      });
      showDynamicAlert({
        variant: 'success',
        title: 'Duty Status Updated',
        message: `Live duty status updated to ${
          nextStatus === 'ONLINE' ? 'On Duty' : nextStatus === 'BREAK' ? 'On Break' : 'Off Duty'
        }.`,
      });
    } catch (err) {
      showDynamicAlert({
        variant: 'warning',
        title: 'Status Update Blocked',
        message:
          (err as Error).message ||
          'Please ask Platform Admin to finish setting up your courier profile.',
      });
    }
  }

  function handleTriggerSos() {
    showDynamicAlert({
      variant: 'confirm',
      title: 'Trigger Cold-Chain Emergency SOS?',
      message:
        'This sends an urgent alert and email directly to the Platform Operations Desk for backup courier dispatch.',
      confirmLabel: 'Dispatch SOS',
      cancelLabel: 'Cancel',
      onConfirm: () => {
        void (async () => {
          try {
            const now = new Date().toISOString();
            const alertTitle = `EMERGENCY SOS — ${effectivePhleboId || phleboName}`;
            const alertMessage = `Field Phlebotomist ${phleboName} (${phleboEmail}) triggered an Emergency Cold-Chain SOS.`;

            await addDoc(collection(db, 'notifications'), {
              title: alertTitle,
              message: alertMessage,
              category: NotificationCategory.TEMPERATURE_ALERT,
              priority: NotificationPriority.CRITICAL,
              recipientEmail: ADMIN_LOGIN_EMAIL,
              recipientRole: UserRole.ADMIN,
              channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
              read: false,
              emailSent: false,
              pushSent: false,
              createdAt: now,
            });

            await addDoc(collection(db, 'mail'), {
              to: [ADMIN_LOGIN_EMAIL],
              message: {
                subject: `[LabSetu SOS] ${alertTitle}`,
                text: alertMessage,
              },
              createdAt: now,
            });

            showDynamicAlert({
              variant: 'error',
              title: 'Emergency SOS Sent to Admin',
              message: `Urgent alert and email sent to ${ADMIN_LOGIN_EMAIL}.`,
              detail: `Courier ID: ${effectivePhleboId || phleboEmail}`,
            });
          } catch (err) {
            showDynamicAlert({
              variant: 'error',
              title: 'SOS Dispatch Failed',
              message: (err as Error).message || 'Could not queue SOS alert.',
            });
          }
        })();
      },
    });
  }

  /* =========================================================================
   * 1. SCREEN 1: BOOKING REQUESTS (LIVE POOL / ACTIVE / COMPLETED)
   * ========================================================================= */
  const renderBookingRequestsScreen = () => {
    const displayedOrders =
      requestTab === 'new'
        ? openPoolOrders
        : requestTab === 'active'
        ? activeAssignedOrders
        : completedAssignedOrders;

    return (
      <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
        <View style={styles.heroHeader}>
          <View style={styles.heroRow}>
            <View style={styles.profileSection}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>{phleboInitial}</Text>
              </View>
              <View>
                <Text style={styles.greetingTitle}>Hello, {phleboFirstName}</Text>
                <Text style={styles.greetingSubtitle}>
                  Field Phlebotomist • {effectivePhleboId || 'ID Pending'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.onlinePill,
                {
                  backgroundColor: isOnline
                    ? '#16A34A'
                    : dutyStatus === 'BREAK'
                    ? '#D97706'
                    : '#64748B',
                },
              ]}
              onPress={() => void handleShiftUpdate(isOnline ? 'OFFLINE' : 'ONLINE')}
            >
              <Text style={styles.onlinePillText}>
                {dutyStatus === 'ONLINE'
                  ? 'On Duty'
                  : dutyStatus === 'BREAK'
                  ? 'On Break'
                  : 'Off Duty'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Today&apos;s Live Summary</Text>
            <View style={styles.summaryMetricsRow}>
              <View style={styles.summaryMetricCol}>
                <Text style={styles.metricNumber}>{metrics.todayOrdersCount}</Text>
                <Text style={styles.metricLabel}>Assigned Today</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryMetricCol}>
                <Text style={styles.metricNumber}>{metrics.todayCompletedCount}</Text>
                <Text style={styles.metricLabel}>Delivered</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryMetricCol}>
                <Text style={[styles.metricNumber, { color: COLORS.primaryTeal }]}>
                  {formatInr(metrics.todayEarnings)}
                </Text>
                <Text style={styles.metricLabel}>Earned Today</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.bodyContainer}>
          {!effectivePhleboId ? (
            <View style={styles.warningBox}>
              <Text style={styles.warningBoxText}>
                Your account does not have a Courier ID yet. Ask Platform Admin (
                {ADMIN_LOGIN_EMAIL}) to assign one under Team &amp; Partner Accounts so you
                can claim bookings.
              </Text>
            </View>
          ) : null}

          <View style={styles.requestTabsRow}>
            <TouchableOpacity
              style={[styles.tabButton, requestTab === 'new' && styles.tabButtonActive]}
              onPress={() => setRequestTab('new')}
            >
              <Text
                style={[styles.tabButtonText, requestTab === 'new' && styles.tabButtonTextActive]}
              >
                Pool ({openPoolOrders.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, requestTab === 'active' && styles.tabButtonActive]}
              onPress={() => setRequestTab('active')}
            >
              <Text
                style={[
                  styles.tabButtonText,
                  requestTab === 'active' && styles.tabButtonTextActive,
                ]}
              >
                Active ({activeAssignedOrders.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, requestTab === 'completed' && styles.tabButtonActive]}
              onPress={() => setRequestTab('completed')}
            >
              <Text
                style={[
                  styles.tabButtonText,
                  requestTab === 'completed' && styles.tabButtonTextActive,
                ]}
              >
                Completed ({completedAssignedOrders.length})
              </Text>
            </TouchableOpacity>
          </View>

          {displayedOrders.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>
                {requestTab === 'new'
                  ? 'No Unassigned Pool Bookings'
                  : requestTab === 'active'
                  ? 'No Active Trips Right Now'
                  : 'No Completed Deliveries Yet'}
              </Text>
              <Text style={styles.emptySub}>
                Live pickup orders created by Small Collection Labs sync here automatically.
              </Text>
            </View>
          ) : (
            displayedOrders.map((order) => {
              const isOpenPool = requestTab === 'new';
              const isInTransit =
                order.status === OrderStatus.PICKED_UP ||
                order.status === OrderStatus.IN_TRANSIT;
              return (
                <View key={order.id} style={styles.bookingCard}>
                  <View style={styles.bookingCardTop}>
                    <View>
                      <Text style={styles.bookingTitle}>
                        {isOpenPool ? 'Open Pickup Request' : formatOrderStatus(order.status)}
                      </Text>
                      <Text style={styles.bookingId}>
                        ID: {order.orderNumber} • {order.patient.pseudonym}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <View style={styles.pickupTimeBadge}>
                        <Text style={styles.pickupTimeText}>
                          {formatLabel(order.priority)}
                        </Text>
                      </View>
                      <Text style={styles.bookingPrice}>
                        {formatInr(order.courierFeeInr || 0)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.routeContainer}>
                    <View style={styles.routeRow}>
                      <View style={[styles.dotMarker, { backgroundColor: COLORS.primaryTeal }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.routePlaceTitle}>{order.smallLabName}</Text>
                        <Text style={styles.routePlaceSubtitle}>{order.pickupLocation.address}</Text>
                      </View>
                    </View>

                    <View style={styles.routeConnectingLine} />

                    <View style={styles.routeRow}>
                      <View style={[styles.dotMarker, { backgroundColor: COLORS.errorRed }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.routePlaceTitle}>{order.targetLabName}</Text>
                        <Text style={styles.routePlaceSubtitle}>
                          {order.deliveryLocation.address}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <Text style={styles.testsPreview}>
                    Specimens: {order.specimens.map((s) => `${s.testCode} (${s.barcode})`).join(', ')}
                  </Text>

                  {isOpenPool ? (
                    <View style={styles.actionsRow}>
                      <TouchableOpacity
                        style={[styles.btnPrimary, submittingAction && { opacity: 0.65 }]}
                        disabled={submittingAction}
                        onPress={() => void handleAcceptPoolOrder(order)}
                      >
                        <Text style={styles.btnPrimaryText}>Accept &amp; Claim Pickup →</Text>
                      </TouchableOpacity>
                    </View>
                  ) : requestTab === 'active' ? (
                    <View style={styles.actionsRow}>
                      {order.status === OrderStatus.ASSIGNED_TO_PHLEBO ? (
                        <TouchableOpacity
                          style={styles.btnSecondary}
                          onPress={() => handleDeclineAssignedOrder(order)}
                        >
                          <Text style={styles.btnSecondaryText}>Release</Text>
                        </TouchableOpacity>
                      ) : null}

                      <TouchableOpacity
                        style={styles.btnPrimary}
                        onPress={() => openOrderWorkflow(order)}
                      >
                        <Text style={styles.btnPrimaryText}>
                          {isInTransit ? 'Drop & Verify OTP →' : 'Start Pickup →'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.historyCardFooter}>
                      <Text style={styles.historyCardTemp}>
                        Delivered {order.arrivalTemperatureCelsius ?? '—'}°C
                      </Text>
                      <Text style={styles.historyCardTests}>
                        {formatOrderStatus(order.status)}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    );
  };

  /* =========================================================================
   * 2. SCREEN 2: BOOKING DETAILS & ROUTE
   * ========================================================================= */
  const renderBookingDetailsScreen = () => {
    if (!selectedOrder) {
      return renderBookingRequestsScreen();
    }
    return (
      <ScrollView style={styles.scrollArea}>
        <View style={styles.navBarHeader}>
          <TouchableOpacity onPress={() => setCurrentScreen('BOOKING_REQUESTS')}>
            <Text style={styles.navBarBackArrow}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.navBarTitle}>Booking Details</Text>
            <Text style={styles.navBarSubtitle}>{selectedOrder.orderNumber}</Text>
          </View>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.bodyContainer}>
          <View style={styles.timelineCard}>
            <View style={styles.timelineItem}>
              <View style={[styles.dotMarker, { backgroundColor: COLORS.primaryTeal }]} />
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={styles.timelineLabel}>Pickup Source Lab</Text>
                <Text style={styles.timelineTitle}>{selectedOrder.smallLabName}</Text>
                <Text style={styles.timelineSub}>{selectedOrder.pickupLocation.address}</Text>
              </View>
            </View>

            <View style={styles.timelineLine} />

            <View style={styles.timelineItem}>
              <View style={[styles.dotMarker, { backgroundColor: COLORS.accentBlue }]} />
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={styles.timelineLabel}>Patient Case</Text>
                <Text style={styles.timelineTitle}>{selectedOrder.patient.pseudonym}</Text>
                <Text style={styles.timelineSub}>
                  {selectedOrder.patient.age} yrs • {formatLabel(selectedOrder.patient.gender)}
                </Text>
              </View>
              {selectedOrder.pickupLocation.contactPhone ? (
                <TouchableOpacity
                  style={styles.callCircleBtn}
                  onPress={() =>
                    showDynamicAlert({
                      variant: 'info',
                      title: 'Collection Lab Contact',
                      message: `Contact ${selectedOrder.smallLabName} desk before pickup arrival.`,
                      detail: selectedOrder.pickupLocation.contactPhone,
                    })
                  }
                >
                  <Text style={{ color: 'white', fontWeight: 'bold' }}>📞</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.timelineLine} />

            <View style={styles.timelineItem}>
              <View style={[styles.dotMarker, { backgroundColor: COLORS.successGreen }]} />
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={styles.timelineLabel}>Drop Reference Hub</Text>
                <Text style={styles.timelineTitle}>{selectedOrder.targetLabName}</Text>
                <Text style={styles.timelineSub}>{selectedOrder.deliveryLocation.address}</Text>
              </View>
            </View>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoCardLabel}>Required Diagnostic Specimens</Text>
            <Text style={styles.infoCardValue}>
              {selectedOrder.specimens
                .map((s) => `${s.testCode} (${formatLabel(s.tubeType)}) [${s.barcode}]`)
                .join('\n')}
            </Text>
            <View style={{ height: 1, backgroundColor: COLORS.borderLight, marginVertical: 12 }} />
            <Text style={styles.infoCardLabel}>Courier Fee • Priority</Text>
            <Text style={[styles.infoCardValue, { color: COLORS.primaryTeal }]}>
              {formatInr(selectedOrder.courierFeeInr || 0)} • {formatLabel(selectedOrder.priority)}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => setCurrentScreen('COLLECT_SAMPLE')}
          >
            <Text style={styles.ctaButtonText}>Proceed to Barcode Scan &amp; Collect</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  /* =========================================================================
   * 3. SCREEN 3: SAMPLE COLLECTION & BARCODE ENTRY
   * ========================================================================= */
  const renderCollectSampleScreen = () => {
    if (!selectedOrder) {
      return renderBookingRequestsScreen();
    }
    return (
      <ScrollView style={styles.scrollArea}>
        <View style={styles.navBarHeader}>
          <TouchableOpacity onPress={() => setCurrentScreen('BOOKING_DETAILS')}>
            <Text style={styles.navBarBackArrow}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.navBarTitle}>Collect Sample</Text>
            <Text style={styles.navBarSubtitle}>{selectedOrder.orderNumber}</Text>
          </View>
          <View style={{ width: 24 }} />
        </View>

        <View style={[styles.bodyContainer, { alignItems: 'center' }]}>
          <View style={styles.vialGraphicFrame}>
            <Text style={{ fontSize: 44, marginBottom: 8 }}>🧪</Text>
            <View style={styles.barcodeReticle} />
            <Text style={styles.scannedBarcodePill}>
              {scannedBarcode || selectedOrder.specimens[0]?.barcode || 'No Barcode'}
            </Text>
          </View>

          <Text style={styles.collectTitle}>Verify Specimen Barcode &amp; Temp</Text>
          <Text style={styles.collectSubtitle}>
            Confirm vial barcode from {selectedOrder.smallLabName} and log chiller box reading.
          </Text>

          <View style={{ width: '100%', marginBottom: 14 }}>
            <Text style={styles.inputLabelSm}>Specimen Tube Barcode</Text>
            <TextInput
              style={styles.fieldInput}
              value={scannedBarcode}
              onChangeText={setScannedBarcode}
              placeholder={selectedOrder.specimens[0]?.barcode || 'Enter vial barcode'}
              editable={showManualEntry || !selectedOrder.specimens[0]?.barcode}
            />
          </View>

          <View style={{ width: '100%', marginBottom: 20 }}>
            <Text style={styles.inputLabelSm}>Chiller Box Temperature (°C)</Text>
            <TextInput
              style={styles.fieldInput}
              value={pickupTempInput}
              onChangeText={setPickupTempInput}
              keyboardType="numeric"
              placeholder="4.2"
            />
          </View>

          <TouchableOpacity
            style={[styles.ctaButton, submittingAction && { opacity: 0.65 }]}
            disabled={submittingAction}
            onPress={() => void handleConfirmCollection(selectedOrder)}
          >
            <Text style={styles.ctaButtonText}>
              {submittingAction ? 'Saving Update...' : 'Confirm Pickup & Log Custody ✓'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{ marginTop: 14 }}
            onPress={() => setShowManualEntry(!showManualEntry)}
          >
            <Text style={{ color: COLORS.primaryTeal, fontWeight: '600', fontSize: 14 }}>
              {showManualEntry ? 'Lock Expected Specimen Barcode' : 'Override Barcode Manually'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  /* =========================================================================
   * 4. SCREEN 4: DROP SAMPLE & 5-DIGIT OTP VERIFICATION
   * ========================================================================= */
  const renderDropSampleScreen = () => {
    if (!selectedOrder) {
      return renderBookingRequestsScreen();
    }
    return (
      <ScrollView style={styles.scrollArea}>
        <View style={styles.navBarHeader}>
          <TouchableOpacity onPress={() => setCurrentScreen('BOOKING_REQUESTS')}>
            <Text style={styles.navBarBackArrow}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.navBarTitle}>Drop Sample &amp; OTP</Text>
            <Text style={styles.navBarSubtitle}>{selectedOrder.orderNumber}</Text>
          </View>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.bodyContainer}>
          <View style={styles.dropLabCard}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>🏢</Text>
            <Text style={styles.dropLabTitle}>{selectedOrder.targetLabName}</Text>
            <Text style={styles.dropLabSub}>{selectedOrder.deliveryLocation.address}</Text>
          </View>

          <View style={styles.handoverBanner}>
            <Text style={styles.handoverCheck}>🔐 Chain-of-Custody Handover</Text>
            <Text style={styles.handoverSub}>
              Verify the 5-digit Handover OTP provided for {selectedOrder.orderNumber}
            </Text>
          </View>

          <View style={styles.otpBoxesRow}>
            {otpValue.map((digit, idx) => (
              <View key={idx} style={styles.otpBox}>
                <TextInput
                  style={styles.otpDigit}
                  value={digit}
                  maxLength={1}
                  keyboardType="numeric"
                  textAlign="center"
                  onChangeText={(val) => updateOtpDigit(idx, val)}
                />
              </View>
            ))}
          </View>

          <View style={{ marginTop: 22 }}>
            <Text style={styles.inputLabelSm}>Arrival Chiller Temperature (°C)</Text>
            <TextInput
              style={styles.fieldInput}
              value={dropTempInput}
              onChangeText={setDropTempInput}
              keyboardType="numeric"
              placeholder="4.2"
            />
          </View>

          <TouchableOpacity
            style={[styles.ctaButton, { marginTop: 22 }, submittingAction && { opacity: 0.65 }]}
            disabled={submittingAction}
            onPress={() => void handleConfirmDropOtp(selectedOrder)}
          >
            <Text style={styles.ctaButtonText}>
              {submittingAction ? 'Verifying Handover...' : 'Verify OTP & Confirm Drop ✓'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  /* =========================================================================
   * 5. SCREEN 5: BOOKING COMPLETED RECEIPT
   * ========================================================================= */
  const renderCompletedScreen = () => (
    <View style={styles.fullscreenContainer}>
      <View style={styles.navBarHeader}>
        <TouchableOpacity onPress={() => setCurrentScreen('BOOKING_REQUESTS')}>
          <Text style={styles.navBarBackArrow}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.navBarTitle}>Delivery Logged</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <View style={[styles.bodyContainer, { flex: 1, justifyContent: 'center' }]}>
        <View style={styles.successCheckCircle}>
          <Text style={styles.successCheckSymbol}>✓</Text>
        </View>

        <Text style={styles.successTitle}>Sample Delivered Successfully</Text>

        <View style={styles.receiptCard}>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptKey}>Booking ID</Text>
            <Text style={styles.receiptVal}>{lastReceipt?.orderNumber || '—'}</Text>
          </View>
          <View style={styles.receiptDivider} />
          <View style={styles.receiptRow}>
            <Text style={styles.receiptKey}>Destination Hub</Text>
            <Text style={styles.receiptVal}>{lastReceipt?.targetLabName || '—'}</Text>
          </View>
          <View style={styles.receiptDivider} />
          <View style={styles.receiptRow}>
            <Text style={styles.receiptKey}>Arrival Temp</Text>
            <Text style={styles.receiptVal}>
              {lastReceipt ? `${lastReceipt.tempCelsius}°C` : '—'}
            </Text>
          </View>
          <View style={styles.receiptDivider} />
          <View style={styles.receiptRow}>
            <Text style={styles.receiptKey}>Courier Payout</Text>
            <Text style={[styles.receiptVal, { color: COLORS.primaryTeal }]}>
              {formatInr(lastReceipt?.feeInr || 0)}
            </Text>
          </View>
          <View style={styles.receiptDivider} />
          <View style={styles.receiptRow}>
            <Text style={styles.receiptKey}>Completed At</Text>
            <Text style={styles.receiptVal}>{lastReceipt?.completedAt || '—'}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.ctaButton, { marginTop: 28 }]}
          onPress={() => {
            setBottomTab('earnings');
            setCurrentScreen('BOOKING_REQUESTS');
          }}
        >
          <Text style={styles.ctaButtonText}>View Live Earnings</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  /* =========================================================================
   * TAB 2: MY BOOKINGS HISTORY (100% LIVE FIRESTORE)
   * ========================================================================= */
  const renderBookingsHistoryScreen = () => {
    const q = bookingSearchQuery.trim().toLowerCase();
    const filtered = myAssignedOrders.filter((b) => {
      const isActive =
        b.status === OrderStatus.PICKED_UP ||
        b.status === OrderStatus.IN_TRANSIT;
      const isDone =
        b.status === OrderStatus.DELIVERED_TO_LAB ||
        b.status === OrderStatus.UNDER_ANALYSIS ||
        isOrderCompleted(b.status);
      const isScheduled = b.status === OrderStatus.ASSIGNED_TO_PHLEBO;

      const matchFilter =
        bookingHistoryFilter === 'all' ||
        (bookingHistoryFilter === 'active' && isActive) ||
        (bookingHistoryFilter === 'completed' && isDone) ||
        (bookingHistoryFilter === 'scheduled' && isScheduled);

      const matchQuery =
        !q ||
        b.orderNumber.toLowerCase().includes(q) ||
        b.patient.pseudonym.toLowerCase().includes(q) ||
        b.smallLabName.toLowerCase().includes(q) ||
        b.specimens.some((s) => s.testCode.toLowerCase().includes(q));

      return matchFilter && matchQuery;
    });

    const activeCount = myAssignedOrders.filter(
      (b) => b.status === OrderStatus.PICKED_UP || b.status === OrderStatus.IN_TRANSIT
    ).length;
    const completedCount = completedAssignedOrders.length;
    const scheduledCount = myAssignedOrders.filter(
      (b) => b.status === OrderStatus.ASSIGNED_TO_PHLEBO
    ).length;

    return (
      <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
        <View style={styles.appHeaderBar}>
          <Text style={styles.appHeaderTitle}>My Bookings</Text>
          <Text style={styles.appHeaderSubtitle}>
            Live collection &amp; handover history
          </Text>
        </View>

        <View style={styles.bodyContainer}>
          <View style={styles.searchBox}>
            <Text style={{ fontSize: 16, marginRight: 8 }}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by ID, patient, lab, test..."
              placeholderTextColor={COLORS.textSecondary}
              value={bookingSearchQuery}
              onChangeText={setBookingSearchQuery}
            />
            {bookingSearchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setBookingSearchQuery('')}>
                <Text style={{ color: COLORS.textSecondary, fontSize: 14 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.requestTabsRow}>
            {(['all', 'active', 'completed', 'scheduled'] as const).map((key) => (
              <TouchableOpacity
                key={key}
                style={[styles.tabButton, bookingHistoryFilter === key && styles.tabButtonActive]}
                onPress={() => setBookingHistoryFilter(key)}
              >
                <Text
                  style={[
                    styles.tabButtonText,
                    bookingHistoryFilter === key && styles.tabButtonTextActive,
                  ]}
                >
                  {key === 'all'
                    ? `All (${myAssignedOrders.length})`
                    : key === 'active'
                    ? `Transit (${activeCount})`
                    : key === 'completed'
                    ? `Done (${completedCount})`
                    : `Assigned (${scheduledCount})`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {filtered.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No Matching Bookings</Text>
              <Text style={styles.emptySub}>
                Claim an open booking from Home or adjust filters.
              </Text>
            </View>
          ) : (
            filtered.map((item) => {
              const isTransit =
                item.status === OrderStatus.PICKED_UP ||
                item.status === OrderStatus.IN_TRANSIT;
              const isAssigned = item.status === OrderStatus.ASSIGNED_TO_PHLEBO;
              return (
                <View key={item.id} style={styles.historyCard}>
                  <View style={styles.historyCardHeader}>
                    <View>
                      <Text style={styles.historyCardId}>{item.orderNumber}</Text>
                      <Text style={styles.historyCardPatient}>{item.patient.pseudonym}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.historyCardFee}>
                        {formatInr(item.courierFeeInr || 0)}
                      </Text>
                      <View
                        style={[
                          styles.statusPillBadge,
                          {
                            backgroundColor: isTransit
                              ? '#DBEAFE'
                              : isAssigned
                              ? '#FEF3C7'
                              : '#DCFCE7',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusPillText,
                            {
                              color: isTransit
                                ? '#2563EB'
                                : isAssigned
                                ? '#D97706'
                                : '#16A34A',
                            },
                          ]}
                        >
                          ● {formatOrderStatus(item.status)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.routeItemRow}>
                    <View style={[styles.dotMarker, { backgroundColor: COLORS.primaryTeal }]} />
                    <Text style={styles.routeTextSm}>{item.smallLabName}</Text>
                  </View>
                  <View style={[styles.routeItemRow, { marginTop: 4 }]}>
                    <View style={[styles.dotMarker, { backgroundColor: COLORS.accentBlue }]} />
                    <Text style={styles.routeTextSm}>{item.targetLabName}</Text>
                  </View>

                  <View style={styles.historyCardFooter}>
                    <Text style={styles.historyCardTests}>
                      🧪 {item.specimens.map((s) => s.testCode).join(', ')}
                    </Text>
                    <Text style={styles.historyCardTemp}>
                      ❄️{' '}
                      {item.arrivalTemperatureCelsius !== undefined
                        ? `${item.arrivalTemperatureCelsius}°C`
                        : 'Awaiting Scan'}
                    </Text>
                  </View>

                  {(isTransit || isAssigned) && (
                    <TouchableOpacity
                      style={[styles.btnPrimary, { marginTop: 12, paddingVertical: 8 }]}
                      onPress={() => {
                        setBottomTab('home');
                        openOrderWorkflow(item);
                      }}
                    >
                      <Text style={styles.btnPrimaryText}>
                        {isTransit ? 'Open OTP Handover' : 'Open Collection Workflow'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    );
  };

  /* =========================================================================
   * TAB 3: EARNINGS & PAYOUTS (100% LIVE FIRESTORE SETTLEMENTS + ORDERS)
   * ========================================================================= */
  const renderEarningsScreen = () => {
    const maxCount = Math.max(1, ...metrics.weeklyBars.map((b) => b.count));

    return (
      <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
        <View style={styles.heroHeader}>
          <Text style={styles.greetingTitle}>Earnings &amp; Settlements</Text>
          <Text style={styles.greetingSubtitle}>
            Live trip payouts &amp; settled statements
          </Text>

          <View style={[styles.summaryCard, { marginTop: 16 }]}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <View>
                <Text style={styles.summaryTitle}>PENDING COURIER PAYOUT</Text>
                <Text style={[styles.metricNumber, { fontSize: 28, color: COLORS.primaryDark }]}>
                  {formatInr(metrics.pendingPayoutInr)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.metricLabel}>Settled Total</Text>
                <Text style={[styles.metricNumber, { fontSize: 16, color: COLORS.successGreen }]}>
                  {formatInr(metrics.settledInr)}
                </Text>
              </View>
            </View>

            <View
              style={[styles.summaryDivider, { width: '100%', height: 1, marginVertical: 14 }]}
            />

            <View style={styles.summaryMetricsRow}>
              <View style={styles.summaryMetricCol}>
                <Text style={styles.metricNumber}>{formatInr(metrics.todayEarnings)}</Text>
                <Text style={styles.metricLabel}>Today</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryMetricCol}>
                <Text style={styles.metricNumber}>{formatInr(metrics.weeklyEarnings)}</Text>
                <Text style={styles.metricLabel}>7 Days</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryMetricCol}>
                <Text style={styles.metricNumber}>{formatInr(metrics.monthlyEarnings)}</Text>
                <Text style={styles.metricLabel}>This Month</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={[styles.bodyContainer, { paddingTop: 48 }]}>
          <View style={styles.chartCard}>
            <Text style={styles.sectionHeaderTitle}>Weekly Pickup Volume (Live)</Text>
            <View style={styles.barChartContainer}>
              {metrics.weeklyBars.map((bar) => {
                const heightPct = Math.max(8, Math.round((bar.count / maxCount) * 100));
                return (
                  <View key={bar.day} style={styles.chartBarCol}>
                    <Text style={styles.chartBarAmount}>{bar.count}</Text>
                    <View style={styles.chartBarTrack}>
                      <View
                        style={[
                          styles.chartBarFill,
                          {
                            height: `${heightPct}%`,
                            backgroundColor: bar.count > 0 ? COLORS.primaryTeal : '#CBD5E1',
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.chartBarDay}>{bar.day}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          <Text style={[styles.sectionHeaderTitle, { marginTop: 12, marginBottom: 10 }]}>
            Trip Settlement Ledger ({earningRows.length})
          </Text>

          {earningRows.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No Courier Payouts Yet</Text>
              <Text style={styles.emptySub}>
                Claim and deliver sample orders to see live settlement rows.
              </Text>
            </View>
          ) : (
            earningRows.map(({ order, amountInr, settled, delivered }) => (
              <View key={order.id} style={styles.tripLedgerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tripLedgerId}>{order.orderNumber}</Text>
                  <Text style={styles.tripLedgerLab}>
                    {order.smallLabName} → {order.targetLabName}
                  </Text>
                  <Text style={styles.tripLedgerBase}>
                    {settled
                      ? 'Settled by Admin'
                      : delivered
                      ? 'Delivered • Pending Payout'
                      : formatOrderStatus(order.status)}
                  </Text>
                </View>
                <Text style={styles.tripLedgerFee}>{formatInr(amountInr)}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    );
  };

  /* =========================================================================
   * TAB 4: PROFILE & SHIFT / COLD-CHAIN EQUIPMENT (ZERO MOCK DATA)
   * ========================================================================= */
  const renderProfileScreen = () => {
    return (
      <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
        <View style={styles.heroHeader}>
          <View style={{ alignItems: 'center', paddingVertical: 10 }}>
            <View style={[styles.avatarCircle, { width: 68, height: 68, borderRadius: 34 }]}>
              <Text style={[styles.avatarText, { fontSize: 26 }]}>{phleboInitial}</Text>
            </View>
            <Text style={[styles.greetingTitle, { fontSize: 20, marginTop: 8 }]}>
              {phleboName}
            </Text>
            <Text style={styles.greetingSubtitle}>
              Courier ID: {effectivePhleboId || 'Not Assigned'} • {phleboEmail}
            </Text>
            <View style={[styles.onlinePill, { backgroundColor: '#064E3B', marginTop: 10 }]}>
              <Text style={styles.onlinePillText}>
                {myPhleboProfile
                  ? `★ ${myPhleboProfile.rating.toFixed(1)} (${completedAssignedOrders.length} Delivered)`
                  : 'Waiting for Courier Profile Setup'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.bodyContainer}>
          <Text style={styles.sectionHeaderTitle}>Duty Status</Text>
          <View style={styles.shiftSelectorRow}>
            {(
              [
                { status: 'ONLINE', label: '🟢 On Duty', bg: '#DCFCE7', text: '#16A34A' },
                { status: 'BREAK', label: '🟡 On Break', bg: '#FEF3C7', text: '#D97706' },
                { status: 'OFFLINE', label: '🔴 Off Duty', bg: '#FEE2E2', text: '#DC2626' },
              ] as const
            ).map((s) => (
              <TouchableOpacity
                key={s.status}
                style={[
                  styles.shiftButton,
                  dutyStatus === s.status && {
                    backgroundColor: s.bg,
                    borderColor: s.text,
                    borderWidth: 1.5,
                  },
                ]}
                onPress={() => void handleShiftUpdate(s.status)}
              >
                <Text
                  style={[
                    styles.shiftButtonText,
                    dutyStatus === s.status && { color: s.text, fontWeight: '700' },
                  ]}
                >
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.sectionHeaderTitle, { marginTop: 20 }]}>
            Assigned Cold-Chain Equipment
          </Text>
          <View style={styles.equipmentCard}>
            <View style={styles.equipmentRow}>
              <Text style={{ fontSize: 20 }}>🧊</Text>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.equipmentTitle}>
                  {myPhleboProfile?.coolerBoxId
                    ? `Smart Chiller Box #${myPhleboProfile.coolerBoxId}`
                    : 'Cooler Box Not Assigned'}
                </Text>
                <Text style={styles.equipmentSub}>
                  {myPhleboProfile
                    ? `Temp: ${myPhleboProfile.chillerTempCelsius}°C • Battery: ${myPhleboProfile.batteryPct}%`
                    : 'Ask Platform Admin to assign equipment under Field Phlebotomists'}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.equipmentRow,
                { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderColor: COLORS.borderLight },
              ]}
            >
              <Text style={{ fontSize: 20 }}>🏍️</Text>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.equipmentTitle}>Assigned Vehicle</Text>
                <Text style={styles.equipmentSub}>
                  {myPhleboProfile?.vehicleInfo || 'Waiting for Vehicle Assignment'}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.equipmentRow,
                { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderColor: COLORS.borderLight },
              ]}
            >
              <Text style={{ fontSize: 20 }}>📍</Text>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.equipmentTitle}>Coverage Zone &amp; Verification</Text>
                <Text style={styles.equipmentSub}>
                  {myPhleboProfile?.currentLocation || 'Unassigned Zone'} •{' '}
                  {myPhleboProfile?.verified ? 'Verified' : 'Pending Review'}
                </Text>
              </View>
            </View>
          </View>

          <View style={{ marginTop: 24, gap: 10 }}>
            <TouchableOpacity style={styles.sosButton} onPress={handleTriggerSos}>
              <Text style={styles.sosButtonText}>🚨 EMERGENCY COLD-CHAIN SOS</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
              <Text style={styles.signOutButtonText}>Sign Out ({phleboEmail})</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.versionFootnote}>
            LabSetu Phlebotomist App • Live Field Operations
          </Text>
        </View>
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />

      <DynamicAlertModal
        alertState={alertState}
        onClose={() => setAlertState(INITIAL_DYNAMIC_ALERT)}
      />

      {!session ? (
        <PhleboAuthGate
          onShowAlert={(opts) => showDynamicAlert(opts)}
          onAuthenticated={(verified) => setSession(verified)}
        />
      ) : (
        <>
          <View style={{ flex: 1 }}>
            {bottomTab === 'home' && (
              <>
                {currentScreen === 'BOOKING_REQUESTS' && renderBookingRequestsScreen()}
                {currentScreen === 'BOOKING_DETAILS' && renderBookingDetailsScreen()}
                {currentScreen === 'COLLECT_SAMPLE' && renderCollectSampleScreen()}
                {currentScreen === 'DROP_SAMPLE' && renderDropSampleScreen()}
                {currentScreen === 'COMPLETED' && renderCompletedScreen()}
              </>
            )}
            {bottomTab === 'bookings' && renderBookingsHistoryScreen()}
            {bottomTab === 'earnings' && renderEarningsScreen()}
            {bottomTab === 'profile' && renderProfileScreen()}
          </View>

          <View style={styles.bottomTabBar}>
            <TouchableOpacity
              style={styles.bottomTabItem}
              onPress={() => {
                setBottomTab('home');
                setCurrentScreen('BOOKING_REQUESTS');
              }}
            >
              <Text style={{ fontSize: 18 }}>🏠</Text>
              <Text
                style={[
                  styles.bottomTabText,
                  bottomTab === 'home' && { color: COLORS.primaryTeal, fontWeight: '700' },
                ]}
              >
                Home
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bottomTabItem}
              onPress={() => setBottomTab('bookings')}
            >
              <Text style={{ fontSize: 18 }}>📋</Text>
              <Text
                style={[
                  styles.bottomTabText,
                  bottomTab === 'bookings' && { color: COLORS.primaryTeal, fontWeight: '700' },
                ]}
              >
                Bookings
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bottomTabItem}
              onPress={() => setBottomTab('earnings')}
            >
              <Text style={{ fontSize: 18 }}>💰</Text>
              <Text
                style={[
                  styles.bottomTabText,
                  bottomTab === 'earnings' && { color: COLORS.primaryTeal, fontWeight: '700' },
                ]}
              >
                Earnings
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bottomTabItem}
              onPress={() => setBottomTab('profile')}
            >
              <Text style={{ fontSize: 18 }}>👤</Text>
              <Text
                style={[
                  styles.bottomTabText,
                  bottomTab === 'profile' && { color: COLORS.primaryTeal, fontWeight: '700' },
                ]}
              >
                Profile
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  heroHeader: {
    backgroundColor: COLORS.primaryDark,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 48,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#064E3B',
    borderWidth: 2,
    borderColor: '#34D399',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 18,
  },
  greetingTitle: {
    color: 'white',
    fontSize: 17,
    fontWeight: '700',
  },
  greetingSubtitle: {
    color: '#A7F3D0',
    fontSize: 13,
  },
  onlinePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  onlinePillText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  summaryCard: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 14,
    padding: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
    marginBottom: -32,
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 10,
  },
  summaryMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryMetricCol: {
    alignItems: 'center',
    flex: 1,
  },
  metricNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  metricLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    height: 28,
    backgroundColor: COLORS.borderLight,
  },
  bodyContainer: {
    paddingHorizontal: 20,
    paddingTop: 38,
    paddingBottom: 24,
  },
  warningBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  warningBoxText: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  emptyBox: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  requestTabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  tabButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  tabButtonActive: {
    backgroundColor: COLORS.primaryTeal,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabButtonTextActive: {
    color: 'white',
  },
  bookingCard: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginBottom: 14,
  },
  bookingCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  bookingTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  bookingId: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  pickupTimeBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginBottom: 4,
  },
  pickupTimeText: {
    color: '#B45309',
    fontSize: 11,
    fontWeight: '700',
  },
  bookingPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  routeContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginVertical: 10,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dotMarker: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routePlaceTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  routePlaceSubtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  routeConnectingLine: {
    width: 2,
    height: 14,
    backgroundColor: '#CBD5E1',
    marginLeft: 4,
    marginVertical: 2,
  },
  testsPreview: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 14,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  btnSecondary: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnSecondaryText: {
    color: COLORS.textPrimary,
    fontWeight: '600',
    fontSize: 13,
  },
  btnPrimary: {
    flex: 1,
    backgroundColor: COLORS.primaryTeal,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnPrimaryText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 13,
  },
  navBarHeader: {
    backgroundColor: COLORS.primaryDark,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  navBarBackArrow: {
    color: 'white',
    fontSize: 22,
    fontWeight: 'bold',
  },
  navBarTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  navBarSubtitle: {
    color: '#A7F3D0',
    fontSize: 12,
  },
  timelineCard: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginBottom: 16,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timelineLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  timelineTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  timelineSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  timelineLine: {
    width: 2,
    height: 20,
    backgroundColor: '#CBD5E1',
    marginLeft: 4,
    marginVertical: 4,
  },
  callCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primaryTeal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCard: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginBottom: 24,
  },
  infoCardLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  infoCardValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  ctaButton: {
    backgroundColor: COLORS.primaryTeal,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    width: '100%',
  },
  ctaButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '700',
  },
  vialGraphicFrame: {
    width: 170,
    height: 150,
    borderRadius: 20,
    backgroundColor: '#F0FDFA',
    borderWidth: 2,
    borderColor: '#99F6E4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  barcodeReticle: {
    width: 100,
    height: 3,
    backgroundColor: COLORS.errorRed,
    marginBottom: 10,
  },
  scannedBarcodePill: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primaryDark,
    backgroundColor: 'white',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  collectTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  collectSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  inputLabelSm: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  fieldInput: {
    backgroundColor: 'white',
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  dropLabCard: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 14,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginBottom: 18,
  },
  dropLabTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  dropLabSub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  handoverBanner: {
    alignItems: 'center',
    marginBottom: 18,
  },
  handoverCheck: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  handoverSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  otpBoxesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  otpBox: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: COLORS.primaryTeal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpDigit: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    width: '100%',
  },
  successCheckCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.successGreen,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  successCheckSymbol: {
    color: 'white',
    fontSize: 44,
    fontWeight: 'bold',
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 24,
  },
  receiptCard: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  receiptKey: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  receiptVal: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  receiptDivider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
  },
  bottomTabBar: {
    height: 60,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  bottomTabItem: {
    alignItems: 'center',
  },
  bottomTabText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  appHeaderBar: {
    backgroundColor: COLORS.primaryDark,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  appHeaderTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
  },
  appHeaderSubtitle: {
    color: '#A7F3D0',
    fontSize: 13,
    marginTop: 4,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceCard,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  historyCard: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginBottom: 12,
  },
  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  historyCardId: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  historyCardPatient: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  historyCardFee: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  statusPillBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginTop: 3,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  routeItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeTextSm: {
    fontSize: 12,
    color: COLORS.textPrimary,
    flex: 1,
  },
  historyCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderColor: COLORS.borderLight,
    paddingTop: 8,
    marginTop: 10,
  },
  historyCardTests: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  historyCardTemp: {
    fontSize: 12,
    color: COLORS.successGreen,
    fontWeight: '600',
  },
  sectionHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 10,
  },
  chartCard: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginBottom: 14,
  },
  barChartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 140,
    paddingTop: 16,
  },
  chartBarCol: {
    alignItems: 'center',
    flex: 1,
  },
  chartBarAmount: {
    fontSize: 11,
    color: COLORS.textPrimary,
    fontWeight: '700',
    marginBottom: 4,
  },
  chartBarTrack: {
    width: 20,
    height: 90,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  chartBarFill: {
    width: '100%',
    borderRadius: 6,
  },
  chartBarDay: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 6,
    fontWeight: '500',
  },
  tripLedgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceCard,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginBottom: 8,
  },
  tripLedgerId: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  tripLedgerLab: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  tripLedgerBase: {
    fontSize: 11,
    color: COLORS.primaryTeal,
    marginTop: 2,
    fontWeight: '600',
  },
  tripLedgerFee: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.successGreen,
  },
  shiftSelectorRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  shiftButton: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  shiftButtonText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  equipmentCard: {
    backgroundColor: COLORS.surfaceCard,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 14,
    padding: 14,
  },
  equipmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  equipmentTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  equipmentSub: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  sosButton: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: COLORS.errorRed,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  sosButtonText: {
    color: COLORS.errorRed,
    fontSize: 13,
    fontWeight: '700',
  },
  signOutButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  signOutButtonText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
  },
  versionFootnote: {
    textAlign: 'center',
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 18,
    marginBottom: 10,
  },
});
