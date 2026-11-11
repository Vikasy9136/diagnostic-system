import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Linking,
  Modal,
  Platform,
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
  calculateHaversineDistanceKm,
  computeDailyVolumeBars,
  type CustodyEvent,
  CustodyEventType,
  formatInr,
  formatOrderStatus,
  isOrderCompleted,
  type LiveGeoCoordinate,
  LOCALITY_GPS_PRESETS,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  OrderStatus,
  type PayoutProfile,
  type PayoutRecord,
  type PhlebotomistProfile,
  type PhlebotomistShiftStatus,
  type PickupOrder,
  type SettlementRecord,
  type SpecimenItem,
  TUBE_METADATA,
  TubeType,
  UserRole,
  validateTubeBarcodeScan,
} from '@diagnostic/shared';
import { signOut } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { ADMIN_LOGIN_EMAIL, auth, db, uploadPhleboSampleFile } from './firebase';
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
import {
  checkPhleboPaymentLinkStatus,
  createPhleboMobilePaymentLink,
  startPhleboWebCheckout,
} from './services/razorpayMobile';

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
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [myPhleboProfile, setMyPhleboProfile] = useState<PhlebotomistProfile | null>(null);

  // Payment collection & partner payout profile states
  const [collectingOrderId, setCollectingOrderId] = useState<string | null>(null);
  const [activePaymentLink, setActivePaymentLink] = useState<{
    orderId: string;
    orderNumber: string;
    settlementId: string;
    paymentLinkId: string;
    shortUrl: string;
    amountInr: number;
  } | null>(null);
  const [verifyingLinkPayment, setVerifyingLinkPayment] = useState(false);

  const [payoutMethod, setPayoutMethod] = useState<'UPI' | 'BANK_TRANSFER'>('UPI');
  const [payoutAccountName, setPayoutAccountName] = useState('');
  const [payoutUpiId, setPayoutUpiId] = useState('');
  const [payoutBankAccount, setPayoutBankAccount] = useState('');
  const [payoutIfsc, setPayoutIfsc] = useState('');
  const [savingPayoutProfile, setSavingPayoutProfile] = useState(false);

  // Selected trip & workflow form state
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [otpValue, setOtpValue] = useState<string[]>(['', '', '', '', '']);
  const [specimenDrafts, setSpecimenDrafts] = useState<
    Record<string, { barcode: string; usedTube: TubeType }>
  >({});
  const [samplePhotoUrl, setSamplePhotoUrl] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [cameraModal, setCameraModal] = useState<{
    mode: 'BARCODE' | 'PHOTO';
    specimenId?: string;
    specimen?: SpecimenItem;
  } | null>(null);
  const [cameraStatusText, setCameraStatusText] = useState('Starting camera...');
  const [pickupTempInput, setPickupTempInput] = useState('4.2');
  const [dropTempInput, setDropTempInput] = useState('4.2');
  const [submittingAction, setSubmittingAction] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<CompletedReceipt | null>(null);

  // Live Rider GPS + Rapido-Style Broadcast Popup State
  const [riderLocation, setRiderLocation] = useState<LiveGeoCoordinate>({
    latitude: LOCALITY_GPS_PRESETS[0].latitude,
    longitude: LOCALITY_GPS_PRESETS[0].longitude,
    updatedAt: new Date().toISOString(),
  });
  const [gpsSourceLabel, setGpsSourceLabel] = useState('Default Zone');
  const [showLocationPickerModal, setShowLocationPickerModal] = useState(false);
  const [manualLatInput, setManualLatInput] = useState(String(LOCALITY_GPS_PRESETS[0].latitude));
  const [manualLngInput, setManualLngInput] = useState(String(LOCALITY_GPS_PRESETS[0].longitude));
  const [dismissedBroadcastIds, setDismissedBroadcastIds] = useState<string[]>([]);
  const [radiusOnlyFilter, setRadiusOnlyFilter] = useState(false);

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
          setPayouts([]);
          setMyPhleboProfile(null);
          setActivePaymentLink(null);
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
      setPayouts([]);
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

  // Subscribe live to courier settlements & released payouts
  useEffect(() => {
    if (!session?.firebaseUser || !effectivePhleboId) {
      setSettlements([]);
      setPayouts([]);
      return;
    }

    const unsubSettlements = onSnapshot(
      query(collection(db, 'settlements'), where('phlebotomistId', '==', effectivePhleboId)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<SettlementRecord, 'id'>) }))
          .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setSettlements(list);
      },
      () => {
        setSettlements([]);
      }
    );

    const unsubPayouts = onSnapshot(
      query(
        collection(db, 'payouts'),
        where('recipientRole', '==', 'PHLEBOTOMIST'),
        where('recipientId', '==', effectivePhleboId)
      ),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<PayoutRecord, 'id'>) }))
          .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setPayouts(list);
      },
      () => {
        setPayouts([]);
      }
    );

    return () => {
      unsubSettlements();
      unsubPayouts();
    };
  }, [session?.firebaseUser, effectivePhleboId]);

  // Populate payout account settings whenever fleet profile updates
  useEffect(() => {
    const pp = myPhleboProfile?.payoutProfile;
    if (!pp) {
      setPayoutAccountName((prev) => prev || phleboName);
      return;
    }
    setPayoutMethod(pp.preferredMethod || (pp.bankAccountLast4 && !pp.upiId ? 'BANK_TRANSFER' : 'UPI'));
    setPayoutAccountName(pp.accountHolderName || phleboName);
    setPayoutUpiId(pp.upiId || '');
    setPayoutBankAccount(pp.bankAccountLast4 ? `••••${pp.bankAccountLast4}` : '');
    setPayoutIfsc(pp.ifscCode || '');
  }, [myPhleboProfile?.payoutProfile, phleboName]);

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

  // Seed initial GPS coordinates from profile once when loaded
  useEffect(() => {
    if (
      typeof myPhleboProfile?.latitude === 'number' &&
      typeof myPhleboProfile?.longitude === 'number' &&
      gpsSourceLabel === 'Default Zone'
    ) {
      setRiderLocation({
        latitude: myPhleboProfile.latitude,
        longitude: myPhleboProfile.longitude,
        updatedAt: myPhleboProfile.updatedAt || new Date().toISOString(),
      });
      setGpsSourceLabel(myPhleboProfile.currentLocation || 'Assigned Zone');
    }
  }, [myPhleboProfile?.latitude, myPhleboProfile?.longitude, myPhleboProfile?.currentLocation, myPhleboProfile?.updatedAt, gpsSourceLabel]);

  // Real-time browser GPS watch while On Duty
  useEffect(() => {
    if (!session || !isOnline || Platform.OS !== 'web') return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setRiderLocation({
          latitude: Number(pos.coords.latitude.toFixed(5)),
          longitude: Number(pos.coords.longitude.toFixed(5)),
          speedKmph:
            typeof pos.coords.speed === 'number' && pos.coords.speed >= 0
              ? Math.round(pos.coords.speed * 3.6)
              : undefined,
          accuracyMeters: Math.round(pos.coords.accuracy || 0),
          updatedAt: new Date().toISOString(),
        });
        setGpsSourceLabel('GPS Live');
      },
      () => {
        // Keep manual / profile coordinates gracefully if GPS denied
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [session, isOnline]);

  // Periodically sync rider live GPS to phlebotomists/{id} and active assigned orders
  const activeOrderIdsKey = activeAssignedOrders.map((o) => o.id).join(',');
  useEffect(() => {
    if (!session?.firebaseUser || !effectivePhleboId || !isOnline) return;

    const pushGpsUpdate = async () => {
      const now = new Date().toISOString();
      try {
        await updateDoc(doc(db, 'phlebotomists', effectivePhleboId), {
          latitude: riderLocation.latitude,
          longitude: riderLocation.longitude,
          updatedAt: now,
        });
      } catch {
        // Ignore if doc doesn't exist yet
      }

      const activeIds = activeOrderIdsKey ? activeOrderIdsKey.split(',').filter(Boolean) : [];
      for (const orderId of activeIds) {
        try {
          await updateDoc(doc(db, 'orders', orderId), {
            phleboLiveLocation: {
              latitude: riderLocation.latitude,
              longitude: riderLocation.longitude,
              updatedAt: now,
            },
            updatedAt: now,
          });
        } catch {
          // Best-effort live telemetry
        }
      }
    };

    void pushGpsUpdate();
    const timer = setInterval(() => {
      void pushGpsUpdate();
    }, 15000);
    return () => clearInterval(timer);
  }, [
    session?.firebaseUser,
    effectivePhleboId,
    isOnline,
    riderLocation.latitude,
    riderLocation.longitude,
    activeOrderIdsKey,
  ]);

  // Camera live stream & BarcodeDetector effect when Camera Modal is open (Web)
  useEffect(() => {
    if (!cameraModal || Platform.OS !== 'web' || typeof document === 'undefined') return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let rafTimer: ReturnType<typeof setInterval> | null = null;

    const initCam = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setCameraStatusText('Browser camera unavailable — use Manual Input or Quick Test below.');
          return;
        }
        setCameraStatusText('Requesting camera permission...');
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        let host = document.getElementById('phlebo-cam-host');
        if (!host) {
          await new Promise((r) => setTimeout(r, 80));
          host = document.getElementById('phlebo-cam-host');
        }
        if (!host) return;
        host.innerHTML = '';
        const video = document.createElement('video');
        video.id = 'phlebo-cam-video';
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'cover';
        host.appendChild(video);
        await video.play().catch(() => {});

        if (cameraModal.mode === 'PHOTO') {
          setCameraStatusText('Frame all specimen vials clearly and tap Capture Photo.');
          return;
        }

        const BarcodeCtor = (
          window as unknown as {
            BarcodeDetector?: new (opts?: { formats?: string[] }) => {
              detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
            };
          }
        ).BarcodeDetector;

        if (!BarcodeCtor) {
          setCameraStatusText('Live camera active. Enter barcode below if auto-scan is unsupported.');
          return;
        }

        const detector = new BarcodeCtor({
          formats: ['code_128', 'code_39', 'ean_13', 'qr_code', 'codabar'],
        });
        setCameraStatusText('Point camera at specimen tube barcode...');

        rafTimer = setInterval(() => {
          void (async () => {
            try {
              if (cancelled || video.readyState < 2) return;
              const found = await detector.detect(video);
              const val = found?.[0]?.rawValue?.trim();
              if (val && cameraModal.specimenId) {
                const targetId = cameraModal.specimenId;
                setSpecimenDrafts((prev) => ({
                  ...prev,
                  [targetId]: {
                    barcode: val,
                    usedTube:
                      prev[targetId]?.usedTube ||
                      cameraModal.specimen?.tubeType ||
                      TubeType.SERUM_RED_GOLD,
                  },
                }));
                setCameraModal(null);
              }
            } catch {
              // Frame decode skip
            }
          })();
        }, 450);
      } catch {
        if (!cancelled) {
          setCameraStatusText('Camera permission blocked — upload file or type barcode below.');
        }
      }
    };

    void initCam();

    return () => {
      cancelled = true;
      if (rafTimer) clearInterval(rafTimer);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      const host = document.getElementById('phlebo-cam-host');
      if (host) host.innerHTML = '';
    };
  }, [cameraModal]);

  // Open pool orders annotated with live Haversine distance from rider & 1-5km broadcast match
  const openPoolWithDistance = useMemo(() => {
    return openPoolOrders
      .map((order) => {
        const distFromRiderKm = calculateHaversineDistanceKm(
          riderLocation.latitude,
          riderLocation.longitude,
          order.pickupLocation?.latitude ?? LOCALITY_GPS_PRESETS[0].latitude,
          order.pickupLocation?.longitude ?? LOCALITY_GPS_PRESETS[0].longitude
        );
        const maxRadiusKm = order.broadcastRadiusKm || 5;
        return {
          order,
          distFromRiderKm,
          inBroadcastRadius: distFromRiderKm <= maxRadiusKm,
          maxRadiusKm,
        };
      })
      .sort((a, b) => a.distFromRiderKm - b.distFromRiderKm);
  }, [openPoolOrders, riderLocation.latitude, riderLocation.longitude]);

  const activeBroadcastMatch = useMemo(() => {
    if (
      !session ||
      !isOnline ||
      !effectivePhleboId ||
      bottomTab !== 'home' ||
      currentScreen !== 'BOOKING_REQUESTS' ||
      selectedOrderId ||
      submittingAction
    ) {
      return null;
    }
    return (
      openPoolWithDistance.find(
        (x) => x.inBroadcastRadius && !dismissedBroadcastIds.includes(x.order.id)
      ) || null
    );
  }, [
    session,
    isOnline,
    effectivePhleboId,
    bottomTab,
    currentScreen,
    selectedOrderId,
    submittingAction,
    openPoolWithDistance,
    dismissedBroadcastIds,
  ]);

  // Merge live settlements & payouts with handled orders for accurate earnings computation
  const earningRows = useMemo(() => {
    const stlMap = new Map(settlements.map((s) => [s.orderId, s]));
    const payoutMap = new Map(payouts.map((p) => [p.orderId, p]));
    return myAssignedOrders
      .filter((o) => o.status !== OrderStatus.CANCELLED && o.status !== OrderStatus.REJECTED)
      .map((order) => {
        const stl = stlMap.get(order.id);
        const payout = payoutMap.get(order.id);
        const amountInr = stl?.phleboPayoutInr ?? payout?.amountInr ?? order.courierFeeInr ?? 0;
        const settled =
          stl?.phleboPayoutStatus === 'PAID' ||
          stl?.status === 'SETTLED' ||
          Boolean(payout);
        const payoutRef = stl?.phleboPayoutRef || payout?.referenceId;
        const customerPaid = order.paymentStatus === 'PAID' || stl?.paymentStatus === 'PAID';
        const delivered =
          order.status === OrderStatus.DELIVERED_TO_LAB ||
          order.status === OrderStatus.UNDER_ANALYSIS ||
          isOrderCompleted(order.status);
        return { order, stl, payout, payoutRef, customerPaid, amountInr, settled, delivered };
      });
  }, [myAssignedOrders, settlements, payouts]);

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

    const pendingPayoutInr = earningRows
      .filter((r) => r.delivered && !r.settled)
      .reduce((sum, r) => sum + r.amountInr, 0);

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

  function openDirectionsMap(destLat?: number, destLng?: number, fallbackAddr?: string) {
    const hasDestCoords =
      typeof destLat === 'number' &&
      typeof destLng === 'number' &&
      Number.isFinite(destLat) &&
      Number.isFinite(destLng) &&
      destLat !== 0 &&
      destLng !== 0;
    const destination = hasDestCoords
      ? `${destLat},${destLng}`
      : encodeURIComponent(fallbackAddr || 'Mumbai');
    const origin = `${riderLocation.latitude},${riderLocation.longitude}`;
    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    void Linking.openURL(url);
  }

  async function applyRiderLocation(lat: number, lng: number, label: string) {
    const now = new Date().toISOString();
    const cleanLat = Number(lat.toFixed(5));
    const cleanLng = Number(lng.toFixed(5));
    setRiderLocation({
      latitude: cleanLat,
      longitude: cleanLng,
      updatedAt: now,
    });
    setGpsSourceLabel(label);
    setManualLatInput(String(cleanLat));
    setManualLngInput(String(cleanLng));
    setShowLocationPickerModal(false);

    if (effectivePhleboId) {
      try {
        await updateDoc(doc(db, 'phlebotomists', effectivePhleboId), {
          latitude: cleanLat,
          longitude: cleanLng,
          currentLocation: label,
          updatedAt: now,
        });
      } catch {
        // Best-effort zone sync
      }
    }
  }

  function updateSpecimenDraft(
    specimenId: string,
    patch: Partial<{ barcode: string; usedTube: TubeType }>
  ) {
    setSpecimenDrafts((prev) => {
      const curr = prev[specimenId] || { barcode: '', usedTube: TubeType.SERUM_RED_GOLD };
      return {
        ...prev,
        [specimenId]: {
          barcode: patch.barcode !== undefined ? patch.barcode : curr.barcode,
          usedTube: patch.usedTube !== undefined ? patch.usedTube : curr.usedTube,
        },
      };
    });
  }

  function handleUploadSamplePhotoFromFile(orderId: string) {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      showDynamicAlert({
        variant: 'info',
        title: 'Upload From Device',
        message: 'Choose a photo using the camera button on mobile web or paste a proof image.',
      });
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      void (async () => {
        setUploadingPhoto(true);
        try {
          const url = await uploadPhleboSampleFile(
            `samples/${orderId}/photo-${Date.now()}-${file.name}`,
            file
          );
          setSamplePhotoUrl(url);
          showDynamicAlert({
            variant: 'success',
            title: 'Sample Photo Uploaded',
            message: 'Specimen tube collection photo saved and linked to this order.',
          });
        } catch (err) {
          showDynamicAlert({
            variant: 'error',
            title: 'Photo Upload Failed',
            message: (err as Error).message || 'Could not upload sample photo.',
          });
        } finally {
          setUploadingPhoto(false);
        }
      })();
    };
    input.click();
  }

  function handleCaptureSnapshotFromCam(orderId: string) {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const video = document.getElementById('phlebo-cam-video') as HTMLVideoElement | null;
    if (!video || video.videoWidth === 0) {
      handleUploadSamplePhotoFromFile(orderId);
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        void (async () => {
          setUploadingPhoto(true);
          try {
            const url = await uploadPhleboSampleFile(
              `samples/${orderId}/snap-${Date.now()}.jpg`,
              blob
            );
            setSamplePhotoUrl(url);
            setCameraModal(null);
            showDynamicAlert({
              variant: 'success',
              title: 'Camera Photo Saved',
              message: 'Sample collection proof image captured and uploaded.',
            });
          } catch (err) {
            showDynamicAlert({
              variant: 'error',
              title: 'Upload Failed',
              message: (err as Error).message || 'Could not upload camera photo.',
            });
          } finally {
            setUploadingPhoto(false);
          }
        })();
      },
      'image/jpeg',
      0.86
    );
  }

  function openOrderWorkflow(order: PickupOrder) {
    setSelectedOrderId(order.id);
    const nextDrafts: Record<string, { barcode: string; usedTube: TubeType }> = {};
    for (const spec of order.specimens || []) {
      nextDrafts[spec.id] = {
        barcode: spec.scannedBarcode || '',
        usedTube: spec.scannedTubeType || spec.tubeType || TubeType.SERUM_RED_GOLD,
      };
    }
    setSpecimenDrafts(nextDrafts);
    setSamplePhotoUrl(order.sampleCollectionPhotoUrl || '');
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
        notes: `Accepted live broadcast by ${phleboName} (${effectivePhleboId})`,
      };

      // Atomic Firestore Transaction prevents race conditions across concurrent riders!
      await runTransaction(db, async (tx) => {
        const orderRef = doc(db, 'orders', order.id);
        const snap = await tx.get(orderRef);
        if (!snap.exists()) {
          throw new Error('This pickup booking no longer exists.');
        }
        const latest = snap.data() as PickupOrder;
        if (latest.status !== OrderStatus.READY_FOR_PICKUP || Boolean(latest.phlebotomistId)) {
          throw new Error('Already accepted by another nearby phlebotomist!');
        }
        tx.update(orderRef, {
          phlebotomistId: effectivePhleboId,
          phlebotomistName: phleboName,
          status: OrderStatus.ASSIGNED_TO_PHLEBO,
          phleboLiveLocation: {
            latitude: riderLocation.latitude,
            longitude: riderLocation.longitude,
            updatedAt: now,
          },
          custodyHistory: [...(latest.custodyHistory || []), evt],
          updatedAt: now,
        });
      });

      await addDoc(collection(db, 'custody_events'), evt);

      // Notify both Small Lab and Target Reference Lab in real time
      await addDoc(collection(db, 'notifications'), {
        title: `Rider Assigned: ${order.orderNumber}`,
        message: `${phleboName} (${effectivePhleboId}) accepted pickup at ${order.smallLabName} — live GPS enabled.`,
        category: NotificationCategory.PICKUP_ASSIGNED,
        priority: NotificationPriority.HIGH,
        recipientRole: UserRole.SMALL_LAB,
        labId: order.smallLabId,
        orderId: order.id,
        channels: [NotificationChannel.IN_APP],
        read: false,
        emailSent: false,
        pushSent: false,
        createdAt: now,
      });

      if (order.dropType !== 'SELF_DROP' && order.dropType !== 'CUSTOM_ADDRESS' && order.targetLabId) {
        await addDoc(collection(db, 'notifications'), {
          title: `Courier En Route for Collection: ${order.orderNumber}`,
          message: `${phleboName} (${effectivePhleboId}) claimed pickup from ${order.smallLabName} -> ${order.targetLabName}.`,
          category: NotificationCategory.PICKUP_ASSIGNED,
          priority: NotificationPriority.NORMAL,
          recipientRole: UserRole.LARGE_LAB,
          labId: order.targetLabId,
          orderId: order.id,
          channels: [NotificationChannel.IN_APP],
          read: false,
          emailSent: false,
          pushSent: false,
          createdAt: now,
        });
      }

      openOrderWorkflow({
        ...order,
        phlebotomistId: effectivePhleboId,
        phlebotomistName: phleboName,
        status: OrderStatus.ASSIGNED_TO_PHLEBO,
      });
    } catch (err) {
      showDynamicAlert({
        variant: 'error',
        title: 'Broadcast Already Claimed',
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
            setDismissedBroadcastIds((prev) =>
              prev.includes(order.id) ? prev : [...prev, order.id]
            );
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
    const numericTemp = Number.parseFloat(pickupTempInput);

    // Build sibling specimens state for complete duplicate / tube mismatch checks
    const siblingList = order.specimens.map((s) => {
      const draft = specimenDrafts[s.id];
      return {
        ...s,
        scannedBarcode: draft?.barcode?.trim() || '',
        scannedTubeType: draft?.usedTube || s.tubeType,
      };
    });

    const verifiedSpecimens: SpecimenItem[] = [];
    for (const s of order.specimens) {
      const draft = specimenDrafts[s.id] || {
        barcode: s.scannedBarcode || '',
        usedTube: s.tubeType,
      };
      const check = validateTubeBarcodeScan({
        scannedBarcode: draft.barcode,
        expectedSpecimen: s,
        selectedTubeUsed: draft.usedTube,
        siblingSpecimens: siblingList,
      });

      if (!check.valid) {
        showDynamicAlert({
          variant: check.status === 'MISMATCH' ? 'error' : 'warning',
          title:
            check.status === 'MISMATCH'
              ? `Wrong Tube / Barcode for ${s.testCode}`
              : `Scan Barcode for ${s.testCode}`,
          message: check.message,
        });
        return;
      }

      verifiedSpecimens.push({
        ...s,
        scannedBarcode: draft.barcode.trim(),
        scannedTubeType: check.detectedTube,
        validationStatus: 'VERIFIED',
        collectedAt: new Date().toISOString(),
      });
    }

    if (!samplePhotoUrl.trim()) {
      showDynamicAlert({
        variant: 'warning',
        title: 'Sample Photo Required',
        message: 'Capture or upload a clear photo of all collected specimen tubes before confirming pickup.',
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
      const barcodeSummary = verifiedSpecimens
        .map((s) => `${s.testCode}:${s.scannedBarcode}`)
        .join(', ');
      const evt: CustodyEvent = {
        id: `EVT-${Date.now()}`,
        orderId: order.id,
        eventType: CustodyEventType.PICKED_UP_BY_PHLEBO,
        timestamp: now,
        operatorId: session.firebaseUser.uid,
        operatorName: phleboName,
        operatorRole: UserRole.PHLEBOTOMIST,
        temperatureCelsius: numericTemp,
        notes: `All ${verifiedSpecimens.length} tubes barcode-verified (${barcodeSummary}) + photo uploaded at ${numericTemp}°C by ${phleboName}`,
      };

      await updateDoc(doc(db, 'orders', order.id), {
        status: OrderStatus.PICKED_UP,
        specimens: verifiedSpecimens,
        sampleCollectionPhotoUrl: samplePhotoUrl.trim(),
        phleboLiveLocation: {
          latitude: riderLocation.latitude,
          longitude: riderLocation.longitude,
          updatedAt: now,
        },
        actualPickupAt: now,
        arrivalTemperatureCelsius: numericTemp,
        custodyHistory: [...(order.custodyHistory || []), evt],
        updatedAt: now,
      });
      await addDoc(collection(db, 'custody_events'), evt);

      await addDoc(collection(db, 'notifications'), {
        title: `Sample Collected & Photo Proof: ${order.orderNumber}`,
        message: `${phleboName} verified ${verifiedSpecimens.length} tube barcode(s) (${numericTemp}°C) en route to ${order.targetLabName}.`,
        category: NotificationCategory.SAMPLE_COLLECTED,
        priority: NotificationPriority.NORMAL,
        recipientRole: UserRole.SMALL_LAB,
        labId: order.smallLabId,
        orderId: order.id,
        channels: [NotificationChannel.IN_APP],
        read: false,
        emailSent: false,
        pushSent: false,
        createdAt: now,
      });

      if (order.dropType !== 'SELF_DROP' && order.dropType !== 'CUSTOM_ADDRESS' && order.targetLabId) {
        await addDoc(collection(db, 'notifications'), {
          title: `Samples Picked Up En Route: ${order.orderNumber}`,
          message: `${phleboName} picked up ${verifiedSpecimens.length} barcode-verified specimen(s) (${numericTemp}°C) heading to ${order.targetLabName}.`,
          category: NotificationCategory.SAMPLE_COLLECTED,
          priority: NotificationPriority.NORMAL,
          recipientRole: UserRole.LARGE_LAB,
          labId: order.targetLabId,
          orderId: order.id,
          channels: [NotificationChannel.IN_APP],
          read: false,
          emailSent: false,
          pushSent: false,
          createdAt: now,
        });
      }

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

        await addDoc(collection(db, 'mail'), {
          to: [ADMIN_LOGIN_EMAIL],
          templateType: 'EMERGENCY_ALERT',
          category: NotificationCategory.TEMPERATURE_ALERT,
          priority: NotificationPriority.CRITICAL,
          templateData: {
            title: `Cold-Chain Excursion Alert — ${order.orderNumber}`,
            orderId: order.id,
            orderNumber: order.orderNumber,
            temperatureCelsius: numericTemp,
            smallLabName: order.smallLabName,
            targetLabName: order.targetLabName,
            phleboName,
            recipientRole: UserRole.ADMIN,
          },
          message: {
            subject: `[LabSetu ALERT] Cold-Chain Excursion — ${order.orderNumber}`,
            text: `Specimen temp logged at ${numericTemp}°C (outside 2°C–8°C safe band) by ${phleboName}.`,
          },
          createdAt: now,
        });
      }

      setOtpValue(['', '', '', '', '']);
      setDropTempInput(String(numericTemp));
      setCurrentScreen('DROP_SAMPLE');

      showDynamicAlert({
        variant: numericTemp < 2 || numericTemp > 8 ? 'warning' : 'success',
        title: 'Tubes Verified & Photo Uploaded',
        message: `${verifiedSpecimens.length} tube(s) verified & marked Picked Up at ${numericTemp}°C.`,
        detail: `Navigate to ${order.targetLabName} for 5-digit Handover OTP.`,
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

      if (order.dropType === 'SELF_DROP' || order.dropType === 'CUSTOM_ADDRESS') {
        await addDoc(collection(db, 'notifications'), {
          title: `Sample Dropped: ${order.orderNumber}`,
          message: `${phleboName} delivered ${order.specimens.map((s) => s.testCode).join(', ')} to ${order.targetLabName} at ${numericTemp}°C. Ready to mark received & process.`,
          category: NotificationCategory.SAMPLE_COLLECTED,
          priority: NotificationPriority.HIGH,
          recipientRole: UserRole.SMALL_LAB,
          labId: order.smallLabId,
          orderId: order.id,
          channels: [NotificationChannel.IN_APP],
          read: false,
          emailSent: false,
          pushSent: false,
          createdAt: now,
        });
      } else {
        await addDoc(collection(db, 'notifications'), {
          title: `Specimen Arrived: ${order.orderNumber}`,
          message: `${phleboName} delivered ${order.specimens.map((s) => s.testCode).join(', ')} at ${numericTemp}°C to ${order.targetLabName}. Ready for QC.`,
          category: NotificationCategory.SAMPLE_COLLECTED,
          priority: NotificationPriority.HIGH,
          recipientRole: UserRole.LARGE_LAB,
          labId: order.targetLabId,
          orderId: order.id,
          channels: [NotificationChannel.IN_APP],
          read: false,
          emailSent: false,
          pushSent: false,
          createdAt: now,
        });
      }

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
              templateType: 'EMERGENCY_ALERT',
              category: NotificationCategory.TEMPERATURE_ALERT,
              priority: NotificationPriority.CRITICAL,
              templateData: {
                title: alertTitle,
                phleboName,
                phleboEmail,
                courierId: effectivePhleboId || phleboEmail,
                recipientRole: UserRole.ADMIN,
              },
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

  async function handleCollectBookingPayment(order: PickupOrder) {
    if (!session?.firebaseUser) return;
    if (order.paymentStatus === 'PAID') {
      showDynamicAlert({
        variant: 'info',
        title: 'Already Paid',
        message: `Booking ${order.orderNumber} is already paid online (${order.razorpayPaymentId || 'Verified'}).`,
      });
      return;
    }

    const payableInr = order.totalAmountInr || order.courierFeeInr || 0;
    if (payableInr < 1) {
      showDynamicAlert({
        variant: 'warning',
        title: 'Invalid Amount',
        message: 'Minimum payment collection amount is ₹1.00.',
      });
      return;
    }

    const settlementId = `STL-${order.id.replace(/^BK-/, '')}`;
    setCollectingOrderId(order.id);
    try {
      if (Platform.OS === 'web') {
        const res = await startPhleboWebCheckout({
          amountInr: payableInr,
          bookingId: order.id,
          settlementId,
          description: `Diagnostic Booking ${order.orderNumber} (${order.smallLabName})`,
          customerName: order.smallLabName,
          customerEmail: phleboEmail,
          customerPhone: order.pickupLocation.contactPhone,
        });

        if (res.status === 'PAID') {
          showDynamicAlert({
            variant: 'success',
            title: 'Payment Collected',
            message: `${formatInr(payableInr)} verified via Razorpay for ${order.orderNumber}.`,
            detail: `Payment ID: ${res.paymentId}`,
          });
        } else {
          showDynamicAlert({
            variant: 'info',
            title: 'Checkout Cancelled',
            message: res.message,
          });
        }
      } else {
        const link = await createPhleboMobilePaymentLink({
          amountInr: payableInr,
          bookingId: order.id,
          settlementId,
          description: `LabSetu Booking ${order.orderNumber}`,
          customerName: order.smallLabName,
          customerEmail: phleboEmail,
          customerPhone: order.pickupLocation.contactPhone,
        });

        setActivePaymentLink({
          orderId: order.id,
          orderNumber: order.orderNumber,
          settlementId,
          paymentLinkId: link.payment_link_id,
          shortUrl: link.short_url,
          amountInr: payableInr,
        });

        await Linking.openURL(link.short_url);
      }
    } catch (err) {
      showDynamicAlert({
        variant: 'error',
        title: 'Payment Collection Failed',
        message: (err as Error).message || 'Could not initiate payment checkout.',
      });
    } finally {
      setCollectingOrderId(null);
    }
  }

  async function handleVerifyActivePaymentLink() {
    if (!activePaymentLink) return;
    setVerifyingLinkPayment(true);
    try {
      const status = await checkPhleboPaymentLinkStatus({
        paymentLinkId: activePaymentLink.paymentLinkId,
        bookingId: activePaymentLink.orderId,
        settlementId: activePaymentLink.settlementId,
      });

      if (status.paid) {
        const paidOrderNo = activePaymentLink.orderNumber;
        const paidAmt = activePaymentLink.amountInr;
        setActivePaymentLink(null);
        showDynamicAlert({
          variant: 'success',
          title: 'Mobile Payment Confirmed',
          message: `${formatInr(paidAmt)} received via Razorpay for ${paidOrderNo}.`,
          detail: status.payment_id ? `Payment ID: ${status.payment_id}` : undefined,
        });
      } else {
        showDynamicAlert({
          variant: 'warning',
          title: 'Payment Pending',
          message: `Current link status is "${status.status}". Complete checkout in browser or UPI app, then tap Check & Confirm again.`,
        });
      }
    } catch (err) {
      showDynamicAlert({
        variant: 'error',
        title: 'Verification Error',
        message: (err as Error).message || 'Could not check payment status right now.',
      });
    } finally {
      setVerifyingLinkPayment(false);
    }
  }

  async function handleSavePayoutProfile() {
    if (!effectivePhleboId) {
      showDynamicAlert({
        variant: 'warning',
        title: 'Courier Profile Needed',
        message: `Ask Platform Admin (${ADMIN_LOGIN_EMAIL}) to assign your Courier ID first.`,
      });
      return;
    }

    const holder = payoutAccountName.trim() || phleboName;
    const upi = payoutUpiId.trim();
    const rawAcc = payoutBankAccount.replace(/[^0-9]/g, '');
    const last4 = rawAcc ? rawAcc.slice(-4) : myPhleboProfile?.payoutProfile?.bankAccountLast4 || '';
    const ifsc = payoutIfsc.trim().toUpperCase();

    if (payoutMethod === 'UPI' && (!upi || !upi.includes('@'))) {
      showDynamicAlert({
        variant: 'warning',
        title: 'Valid UPI ID Required',
        message: 'Enter a valid UPI ID (for example: name@okaxis) to receive payouts.',
      });
      return;
    }

    if (payoutMethod === 'BANK_TRANSFER' && (!last4 || ifsc.length < 8)) {
      showDynamicAlert({
        variant: 'warning',
        title: 'Bank & IFSC Required',
        message: 'Enter your bank account number and IFSC code for IMPS/NEFT payouts.',
      });
      return;
    }

    setSavingPayoutProfile(true);
    try {
      const now = new Date().toISOString();
      const nextProfile: PayoutProfile = {
        preferredMethod: payoutMethod,
        accountHolderName: holder,
        ...(upi ? { upiId: upi } : {}),
        ...(rawAcc.length >= 6
          ? { bankAccountNumber: rawAcc }
          : myPhleboProfile?.payoutProfile?.bankAccountNumber
          ? { bankAccountNumber: myPhleboProfile.payoutProfile.bankAccountNumber }
          : {}),
        ...(last4 ? { bankAccountLast4: last4 } : {}),
        ...(ifsc ? { ifscCode: ifsc } : {}),
        updatedAt: now,
      };

      await updateDoc(doc(db, 'phlebotomists', effectivePhleboId), {
        payoutProfile: nextProfile,
        updatedAt: now,
      });

      showDynamicAlert({
        variant: 'success',
        title: 'Payout Account Saved',
        message:
          payoutMethod === 'UPI'
            ? `Payouts will be sent to UPI ${upi}.`
            : `Payouts will be sent to Bank ••••${last4} (${ifsc}).`,
      });
    } catch (err) {
      showDynamicAlert({
        variant: 'error',
        title: 'Could Not Save Payout Details',
        message: (err as Error).message || 'Unable to save payout details right now.',
      });
    } finally {
      setSavingPayoutProfile(false);
    }
  }

  /* =========================================================================
   * 1. SCREEN 1: BOOKING REQUESTS (LIVE POOL / ACTIVE / COMPLETED)
   * ========================================================================= */
  const renderBookingRequestsScreen = () => {
    const poolEntries = openPoolWithDistance.filter(
      (x) => !radiusOnlyFilter || x.inBroadcastRadius
    );
    const inRadiusCount = openPoolWithDistance.filter((x) => x.inBroadcastRadius).length;
    const displayedEntries =
      requestTab === 'new'
        ? poolEntries
        : (requestTab === 'active' ? activeAssignedOrders : completedAssignedOrders).map(
            (order) => ({
              order,
              distFromRiderKm: undefined as number | undefined,
              inBroadcastRadius: false,
              maxRadiusKm: order.broadcastRadiusKm || 5,
            })
          );

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
          <View style={styles.gpsTelemetryBar}>
            <View style={{ flex: 1 }}>
              <Text style={styles.gpsTelemetryTitle}>
                📍 {gpsSourceLabel} ({riderLocation.latitude.toFixed(4)},{' '}
                {riderLocation.longitude.toFixed(4)})
              </Text>
              <Text style={styles.gpsTelemetrySub}>
                {isOnline
                  ? `Live 1–5 km broadcast radar active • ${inRadiusCount} nearby open request(s)`
                  : 'Switch On Duty to receive live nearby pickup popups'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.gpsPickerBtn}
              onPress={() => {
                setManualLatInput(String(riderLocation.latitude));
                setManualLngInput(String(riderLocation.longitude));
                setShowLocationPickerModal(true);
              }}
            >
              <Text style={styles.gpsPickerBtnText}>Set Zone / GPS</Text>
            </TouchableOpacity>
          </View>

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

          {requestTab === 'new' ? (
            <View style={styles.radiusFilterRow}>
              <TouchableOpacity
                style={[styles.radiusFilterChip, !radiusOnlyFilter && styles.radiusFilterChipActive]}
                onPress={() => setRadiusOnlyFilter(false)}
              >
                <Text
                  style={[
                    styles.radiusFilterText,
                    !radiusOnlyFilter && styles.radiusFilterTextActive,
                  ]}
                >
                  All Open Pool ({openPoolWithDistance.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.radiusFilterChip, radiusOnlyFilter && styles.radiusFilterChipActive]}
                onPress={() => setRadiusOnlyFilter(true)}
              >
                <Text
                  style={[
                    styles.radiusFilterText,
                    radiusOnlyFilter && styles.radiusFilterTextActive,
                  ]}
                >
                  🔥 Within 1–5 km Radar ({inRadiusCount})
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {displayedEntries.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>
                {requestTab === 'new'
                  ? radiusOnlyFilter
                    ? 'No Open Bookings Within Broadcast Radius'
                    : 'No Unassigned Pool Bookings'
                  : requestTab === 'active'
                  ? 'No Active Trips Right Now'
                  : 'No Completed Deliveries Yet'}
              </Text>
              <Text style={styles.emptySub}>
                Live pickup orders created by Small Collection Labs sync here automatically.
              </Text>
            </View>
          ) : (
            displayedEntries.map(({ order, distFromRiderKm, inBroadcastRadius, maxRadiusKm }) => {
              const isOpenPool = requestTab === 'new';
              const isInTransit =
                order.status === OrderStatus.PICKED_UP ||
                order.status === OrderStatus.IN_TRANSIT;
              const isPaidOrder = order.paymentStatus === 'PAID';
              const collectableInr = order.totalAmountInr || order.courierFeeInr || 0;
              const specimens = order.specimens || [];
              const dropBadge =
                order.dropType === 'SELF_DROP'
                  ? 'Return to Small Lab'
                  : order.dropType === 'CUSTOM_ADDRESS'
                  ? 'Custom Drop'
                  : 'Reference Hub';

              return (
                <View key={order.id} style={styles.bookingCard}>
                  <View style={styles.bookingCardTop}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.bookingTitle}>
                        {isOpenPool ? 'Open Pickup Request' : formatOrderStatus(order.status)}
                      </Text>
                      <Text style={styles.bookingId}>
                        ID: {order.orderNumber} • {order.patient.pseudonym}
                      </Text>

                      <View style={styles.badgeWrapRow}>
                        {isOpenPool && distFromRiderKm !== undefined ? (
                          <View
                            style={[
                              styles.distanceBadge,
                              inBroadcastRadius && styles.distanceBadgeHot,
                            ]}
                          >
                            <Text
                              style={[
                                styles.distanceBadgeText,
                                inBroadcastRadius && styles.distanceBadgeTextHot,
                              ]}
                            >
                              {inBroadcastRadius
                                ? `🔥 LIVE IN ${maxRadiusKm} KM (${distFromRiderKm} km)`
                                : `${distFromRiderKm} km from you`}
                            </Text>
                          </View>
                        ) : null}

                        {typeof order.distanceKm === 'number' && order.distanceKm > 0 ? (
                          <View style={styles.distanceBadge}>
                            <Text style={styles.distanceBadgeText}>
                              Route {order.distanceKm} km
                            </Text>
                          </View>
                        ) : null}

                        <View style={styles.distanceBadge}>
                          <Text style={styles.distanceBadgeText}>{dropBadge}</Text>
                        </View>
                      </View>
                    </View>

                    <View style={{ alignItems: 'flex-end' }}>
                      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 4 }}>
                        <View
                          style={[
                            styles.pickupTimeBadge,
                            {
                              marginBottom: 0,
                              backgroundColor: isPaidOrder ? '#DCFCE7' : '#FFEDD5',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.pickupTimeText,
                              { color: isPaidOrder ? '#15803D' : '#C2410C' },
                            ]}
                          >
                            {isPaidOrder ? '✓ Paid' : `Collect ${formatInr(collectableInr)}`}
                          </Text>
                        </View>
                        <View style={[styles.pickupTimeBadge, { marginBottom: 0 }]}>
                          <Text style={styles.pickupTimeText}>
                            {formatLabel(order.priority)}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.bookingPrice}>
                        Courier {formatInr(order.courierFeeInr || 0)}
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

                  <View style={styles.tubePillRow}>
                    {specimens.map((s) => {
                      const meta = TUBE_METADATA[s.tubeType] || TUBE_METADATA[TubeType.SERUM_RED_GOLD];
                      return (
                        <View
                          key={s.id}
                          style={[styles.specimenTagPill, { backgroundColor: meta.bgHex }]}
                        >
                          <View style={[styles.tubeColorDot, { backgroundColor: meta.colorHex }]} />
                          <Text style={[styles.specimenTagText, { color: meta.colorHex }]}>
                            {s.testCode} • {meta.shortTag}
                          </Text>
                        </View>
                      );
                    })}
                  </View>

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

                      {!isPaidOrder && collectableInr >= 1 ? (
                        <TouchableOpacity
                          style={[
                            styles.btnSecondary,
                            { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
                            collectingOrderId === order.id && { opacity: 0.65 },
                          ]}
                          disabled={collectingOrderId === order.id}
                          onPress={() => void handleCollectBookingPayment(order)}
                        >
                          <Text style={[styles.btnSecondaryText, { color: '#1D4ED8' }]}>
                            {collectingOrderId === order.id ? 'Opening...' : '💳 Collect'}
                          </Text>
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
    const specimens = selectedOrder.specimens || [];
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
                <Text style={styles.timelineLabel}>
                  {selectedOrder.dropType === 'SELF_DROP'
                    ? 'Return to Small Lab'
                    : selectedOrder.dropType === 'CUSTOM_ADDRESS'
                    ? 'Custom Drop Address'
                    : 'Drop Reference Hub'}
                </Text>
                <Text style={styles.timelineTitle}>{selectedOrder.targetLabName}</Text>
                <Text style={styles.timelineSub}>{selectedOrder.deliveryLocation.address}</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={styles.navMapButton}
                onPress={() =>
                  openDirectionsMap(
                    selectedOrder.pickupLocation?.latitude,
                    selectedOrder.pickupLocation?.longitude,
                    selectedOrder.pickupLocation?.address
                  )
                }
              >
                <Text style={styles.navMapButtonText}>
                  🗺️ Navigate to Pickup Lab (Google Maps)
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoCardLabel}>
              Required Diagnostic Specimens ({specimens.length})
            </Text>
            <View style={{ gap: 8, marginTop: 4 }}>
              {specimens.map((s) => {
                const meta = TUBE_METADATA[s.tubeType] || TUBE_METADATA[TubeType.SERUM_RED_GOLD];
                return (
                  <View key={s.id} style={styles.detailSpecRow}>
                    <View style={[styles.tubeColorDot, { backgroundColor: meta.colorHex }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detailSpecTitle}>
                        {s.testCode} — {s.testName}
                      </Text>
                      <Text style={styles.detailSpecSub}>
                        {meta.label} • Expected Tag: {s.barcode}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
            <View style={{ height: 1, backgroundColor: COLORS.borderLight, marginVertical: 12 }} />
            <Text style={styles.infoCardLabel}>Courier Fee • Route Distance • Priority</Text>
            <Text style={[styles.infoCardValue, { color: COLORS.primaryTeal }]}>
              {formatInr(selectedOrder.courierFeeInr || 0)}
              {typeof selectedOrder.distanceKm === 'number' && selectedOrder.distanceKm > 0
                ? ` • ${selectedOrder.distanceKm} km`
                : ''}
              {' • '}
              {formatLabel(selectedOrder.priority)}
            </Text>
            <View style={{ height: 1, backgroundColor: COLORS.borderLight, marginVertical: 12 }} />
            <Text style={styles.infoCardLabel}>Booking Payment Collection</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.infoCardValue}>
                {formatInr(selectedOrder.totalAmountInr || selectedOrder.courierFeeInr || 0)}
              </Text>
              <View
                style={[
                  styles.pickupTimeBadge,
                  {
                    marginBottom: 0,
                    backgroundColor: selectedOrder.paymentStatus === 'PAID' ? '#DCFCE7' : '#FFEDD5',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.pickupTimeText,
                    { color: selectedOrder.paymentStatus === 'PAID' ? '#15803D' : '#C2410C' },
                  ]}
                >
                  {selectedOrder.paymentStatus === 'PAID'
                    ? `✓ Paid (${selectedOrder.paymentMethod || 'Online'})`
                    : 'Payment Due'}
                </Text>
              </View>
            </View>
          </View>

          {selectedOrder.paymentStatus !== 'PAID' &&
          (selectedOrder.totalAmountInr || selectedOrder.courierFeeInr || 0) >= 1 ? (
            <TouchableOpacity
              style={[
                styles.ctaButton,
                { backgroundColor: COLORS.accentBlue, marginBottom: 12 },
                collectingOrderId === selectedOrder.id && { opacity: 0.65 },
              ]}
              disabled={collectingOrderId === selectedOrder.id}
              onPress={() => void handleCollectBookingPayment(selectedOrder)}
            >
              <Text style={styles.ctaButtonText}>
                {collectingOrderId === selectedOrder.id
                  ? 'Opening Razorpay Checkout...'
                  : `💳 Collect ${formatInr(
                      selectedOrder.totalAmountInr || selectedOrder.courierFeeInr || 0
                    )} via Razorpay`}
              </Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => setCurrentScreen('COLLECT_SAMPLE')}
          >
            <Text style={styles.ctaButtonText}>Proceed to Barcode Scan &amp; Photo ✓</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  /* =========================================================================
   * 3. SCREEN 3: SAMPLE COLLECTION, TUBE VALIDATION & COLLECTION PHOTO PROOF
   * ========================================================================= */
  const renderCollectSampleScreen = () => {
    if (!selectedOrder) {
      return renderBookingRequestsScreen();
    }

    const specimens = selectedOrder.specimens || [];
    const siblingSpecimens = specimens.map((s) => {
      const draft = specimenDrafts[s.id];
      return {
        ...s,
        scannedBarcode: draft?.barcode?.trim() || '',
        scannedTubeType: draft?.usedTube || s.tubeType,
      };
    });

    const verifiedCount = specimens.filter((s) => {
      const draft = specimenDrafts[s.id] || {
        barcode: s.scannedBarcode || '',
        usedTube: s.scannedTubeType || s.tubeType || TubeType.SERUM_RED_GOLD,
      };
      return validateTubeBarcodeScan({
        scannedBarcode: draft.barcode,
        expectedSpecimen: s,
        selectedTubeUsed: draft.usedTube,
        siblingSpecimens,
      }).valid;
    }).length;

    return (
      <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
        <View style={styles.navBarHeader}>
          <TouchableOpacity onPress={() => setCurrentScreen('BOOKING_DETAILS')}>
            <Text style={styles.navBarBackArrow}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.navBarTitle}>Collect Sample &amp; Verify</Text>
            <Text style={styles.navBarSubtitle}>
              {selectedOrder.orderNumber} • {verifiedCount}/{specimens.length} Tubes Verified
            </Text>
          </View>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.bodyContainer}>
          <View style={styles.verifyHintCard}>
            <Text style={styles.verifyHintTitle}>
              🧪 Per-Tube Barcode &amp; Vacutainer Validation
            </Text>
            <Text style={styles.verifyHintText}>
              Scan each specimen tube barcode and confirm the physical tube cap color used. Any
              wrong tube or duplicate barcode conflict is flagged immediately.
            </Text>
          </View>

          {specimens.map((spec, idx) => {
            const draft = specimenDrafts[spec.id] || {
              barcode: spec.scannedBarcode || '',
              usedTube: spec.scannedTubeType || spec.tubeType || TubeType.SERUM_RED_GOLD,
            };
            const validation = validateTubeBarcodeScan({
              scannedBarcode: draft.barcode,
              expectedSpecimen: spec,
              selectedTubeUsed: draft.usedTube,
              siblingSpecimens,
            });
            const expectedMeta =
              TUBE_METADATA[validation.expectedTube] || TUBE_METADATA[TubeType.SERUM_RED_GOLD];

            const cardBorderColor =
              validation.status === 'VERIFIED'
                ? '#16A34A'
                : validation.status === 'MISMATCH'
                ? '#DC2626'
                : COLORS.borderLight;

            const statusBg =
              validation.status === 'VERIFIED'
                ? '#DCFCE7'
                : validation.status === 'MISMATCH'
                ? '#FEE2E2'
                : '#FEF3C7';
            const statusColor =
              validation.status === 'VERIFIED'
                ? '#15803D'
                : validation.status === 'MISMATCH'
                ? '#B91C1C'
                : '#B45309';

            return (
              <View
                key={spec.id}
                style={[styles.specimenVerifyCard, { borderColor: cardBorderColor }]}
              >
                <View style={styles.specimenCardTopRow}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.specimenCardTitle}>
                      #{idx + 1} {spec.testCode} — {spec.testName}
                    </Text>
                    <Text style={styles.specimenCardSub}>
                      Expected: {expectedMeta.label} • Tag: {spec.barcode}
                    </Text>
                  </View>
                  <View style={[styles.pickupTimeBadge, { backgroundColor: statusBg, marginBottom: 0 }]}>
                    <Text style={[styles.pickupTimeText, { color: statusColor }]}>
                      {validation.status === 'VERIFIED'
                        ? '✓ VERIFIED'
                        : validation.status === 'MISMATCH'
                        ? '⚠ MISMATCH'
                        : '⏳ PENDING'}
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.validationBanner,
                    {
                      backgroundColor:
                        validation.status === 'VERIFIED'
                          ? '#F0FDF4'
                          : validation.status === 'MISMATCH'
                          ? '#FEF2F2'
                          : '#F8FAFC',
                      borderColor:
                        validation.status === 'VERIFIED'
                          ? '#BBF7D0'
                          : validation.status === 'MISMATCH'
                          ? '#FECACA'
                          : COLORS.borderLight,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.validationBannerText,
                      {
                        color:
                          validation.status === 'VERIFIED'
                            ? '#166534'
                            : validation.status === 'MISMATCH'
                            ? '#991B1B'
                            : COLORS.textSecondary,
                      },
                    ]}
                  >
                    {validation.message}
                  </Text>
                </View>

                <Text style={styles.inputLabelSm}>Scanned Barcode</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={draft.barcode}
                  onChangeText={(txt) => updateSpecimenDraft(spec.id, { barcode: txt })}
                  placeholder={`Scan or enter ${spec.barcode}`}
                  autoCapitalize="characters"
                />

                <View style={styles.scanActionRow}>
                  <TouchableOpacity
                    style={styles.scanCamButton}
                    onPress={() =>
                      setCameraModal({
                        mode: 'BARCODE',
                        specimenId: spec.id,
                        specimen: spec,
                      })
                    }
                  >
                    <Text style={styles.scanCamButtonText}>📷 Scan Camera</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.matchTagChip}
                    onPress={() =>
                      updateSpecimenDraft(spec.id, {
                        barcode: spec.barcode,
                        usedTube: spec.tubeType || TubeType.SERUM_RED_GOLD,
                      })
                    }
                  >
                    <Text style={styles.matchTagChipText}>Match Barcode ({spec.barcode})</Text>
                  </TouchableOpacity>
                </View>

                <Text style={[styles.inputLabelSm, { marginTop: 12 }]}>
                  Physical Vacutainer / Cap Used
                </Text>
                <View style={styles.tubeChipsWrap}>
                  {(Object.values(TubeType) as TubeType[]).map((t) => {
                    const meta = TUBE_METADATA[t];
                    const selected = draft.usedTube === t;
                    return (
                      <TouchableOpacity
                        key={t}
                        style={[
                          styles.tubeChip,
                          selected && {
                            backgroundColor: meta.bgHex,
                            borderColor: meta.colorHex,
                            borderWidth: 1.5,
                          },
                        ]}
                        onPress={() => updateSpecimenDraft(spec.id, { usedTube: t })}
                      >
                        <View style={[styles.tubeColorDot, { backgroundColor: meta.colorHex }]} />
                        <Text
                          style={[
                            styles.tubeChipText,
                            selected && { color: meta.colorHex, fontWeight: '700' },
                          ]}
                        >
                          {meta.shortTag} ({meta.capColorName.replace(' Cap', '')})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })}

          <View style={styles.photoProofCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.specimenCardTitle}>📸 Collected Sample Photo Proof</Text>
              <View
                style={[
                  styles.pickupTimeBadge,
                  {
                    marginBottom: 0,
                    backgroundColor: samplePhotoUrl ? '#DCFCE7' : '#FFEDD5',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.pickupTimeText,
                    { color: samplePhotoUrl ? '#15803D' : '#C2410C' },
                  ]}
                >
                  {samplePhotoUrl ? '✓ Uploaded' : 'Mandatory'}
                </Text>
              </View>
            </View>
            <Text style={[styles.specimenCardSub, { marginTop: 4, marginBottom: 12 }]}>
              Take or upload a clear photo of all labeled tubes collected at {selectedOrder.smallLabName}.
            </Text>

            {samplePhotoUrl ? (
              <View style={{ marginBottom: 12 }}>
                <Image
                  source={{ uri: samplePhotoUrl }}
                  style={styles.samplePhotoPreview}
                  resizeMode="cover"
                />
                <TouchableOpacity
                  style={{ marginTop: 6, alignSelf: 'flex-end' }}
                  onPress={() => setSamplePhotoUrl('')}
                >
                  <Text style={{ color: COLORS.errorRed, fontSize: 12, fontWeight: '600' }}>
                    Remove Photo
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.scanCamButton, { flex: 1 }, uploadingPhoto && { opacity: 0.65 }]}
                disabled={uploadingPhoto}
                onPress={() => {
                  if (Platform.OS === 'web') {
                    setCameraModal({ mode: 'PHOTO' });
                  } else {
                    handleUploadSamplePhotoFromFile(selectedOrder.id);
                  }
                }}
              >
                <Text style={styles.scanCamButtonText}>
                  {uploadingPhoto ? 'Uploading...' : '📷 Camera Photo'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btnSecondary, uploadingPhoto && { opacity: 0.65 }]}
                disabled={uploadingPhoto}
                onPress={() => handleUploadSamplePhotoFromFile(selectedOrder.id)}
              >
                <Text style={styles.btnSecondaryText}>📁 Upload Photo File</Text>
              </TouchableOpacity>
            </View>
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
            style={[styles.ctaButton, (submittingAction || uploadingPhoto) && { opacity: 0.65 }]}
            disabled={submittingAction || uploadingPhoto}
            onPress={() => void handleConfirmCollection(selectedOrder)}
          >
            <Text style={styles.ctaButtonText}>
              {submittingAction
                ? 'Saving Verified Specimens...'
                : `Confirm Pickup (${verifiedCount}/${specimens.length}) & Log Custody ✓`}
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
    const verifiedSpecCount = (selectedOrder.specimens || []).filter(
      (s) => s.validationStatus === 'VERIFIED'
    ).length;

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
            <Text style={[styles.dropLabSub, { textAlign: 'center' }]}>
              {selectedOrder.deliveryLocation.address}
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, justifyContent: 'center' }}>
              <View style={[styles.distanceBadge, { backgroundColor: '#EFF6FF' }]}>
                <Text style={[styles.distanceBadgeText, { color: '#1D4ED8' }]}>
                  {selectedOrder.dropType === 'SELF_DROP'
                    ? 'Self-Drop to Small Lab'
                    : selectedOrder.dropType === 'CUSTOM_ADDRESS'
                    ? 'Custom Drop Address'
                    : 'Large Lab Reference Hub'}
                </Text>
              </View>
              {selectedOrder.sampleCollectionPhotoUrl ? (
                <View style={[styles.distanceBadge, { backgroundColor: '#DCFCE7' }]}>
                  <Text style={[styles.distanceBadgeText, { color: '#15803D' }]}>
                    ✓ Photo &amp; {verifiedSpecCount}/{(selectedOrder.specimens || []).length} Tubes Verified
                  </Text>
                </View>
              ) : null}
            </View>

            <TouchableOpacity
              style={[styles.navMapButton, { marginTop: 12, width: '100%' }]}
              onPress={() =>
                openDirectionsMap(
                  selectedOrder.deliveryLocation?.latitude,
                  selectedOrder.deliveryLocation?.longitude,
                  selectedOrder.deliveryLocation?.address
                )
              }
            >
              <Text style={styles.navMapButtonText}>
                🗺️ Navigate to Drop Center (Google Maps)
              </Text>
            </TouchableOpacity>

            <View
              style={[
                styles.pickupTimeBadge,
                {
                  marginTop: 12,
                  marginBottom: 0,
                  backgroundColor: selectedOrder.paymentStatus === 'PAID' ? '#DCFCE7' : '#FFEDD5',
                },
              ]}
            >
              <Text
                style={[
                  styles.pickupTimeText,
                  { color: selectedOrder.paymentStatus === 'PAID' ? '#15803D' : '#C2410C' },
                ]}
              >
                {selectedOrder.paymentStatus === 'PAID'
                  ? `✓ Booking Payment Collected (${formatInr(
                      selectedOrder.totalAmountInr || selectedOrder.courierFeeInr || 0
                    )})`
                  : `Payment Pending (${formatInr(
                      selectedOrder.totalAmountInr || selectedOrder.courierFeeInr || 0
                    )})`}
              </Text>
            </View>
            {selectedOrder.paymentStatus !== 'PAID' &&
            (selectedOrder.totalAmountInr || selectedOrder.courierFeeInr || 0) >= 1 ? (
              <TouchableOpacity
                style={[
                  styles.btnSecondary,
                  {
                    marginTop: 10,
                    paddingHorizontal: 14,
                    backgroundColor: '#EFF6FF',
                    borderWidth: 1,
                    borderColor: '#BFDBFE',
                    flex: 0,
                  },
                ]}
                disabled={collectingOrderId === selectedOrder.id}
                onPress={() => void handleCollectBookingPayment(selectedOrder)}
              >
                <Text style={[styles.btnSecondaryText, { color: '#1D4ED8' }]}>
                  {collectingOrderId === selectedOrder.id
                    ? 'Opening Checkout...'
                    : '💳 Collect Payment via Razorpay'}
                </Text>
              </TouchableOpacity>
            ) : null}
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
                <Text style={styles.metricLabel}>Paid Out Total</Text>
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
            earningRows.map(({ order, payoutRef, customerPaid, amountInr, settled, delivered }) => (
              <View key={order.id} style={styles.tripLedgerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tripLedgerId}>{order.orderNumber}</Text>
                  <Text style={styles.tripLedgerLab}>
                    {order.smallLabName} → {order.targetLabName}
                  </Text>
                  <Text style={styles.tripLedgerBase}>
                    {settled
                      ? `Paid Out${payoutRef ? ` • Ref: ${payoutRef}` : ''}`
                      : delivered && customerPaid
                      ? 'Delivered & Paid Online • Ready for Payout'
                      : delivered
                      ? 'Delivered • Awaiting Customer Payment'
                      : formatOrderStatus(order.status)}
                  </Text>
                </View>
                <Text style={styles.tripLedgerFee}>{formatInr(amountInr)}</Text>
              </View>
            ))
          )}

          <Text style={[styles.sectionHeaderTitle, { marginTop: 20, marginBottom: 10 }]}>
            Released Payout Receipts ({payouts.length})
          </Text>

          {payouts.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No Payout Transfers Yet</Text>
              <Text style={styles.emptySub}>
                Once Admin releases payouts to your UPI or bank account, UTR transfer receipts appear here.
              </Text>
            </View>
          ) : (
            payouts.map((p) => (
              <View key={p.id} style={styles.tripLedgerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tripLedgerId}>
                    {p.orderNumber} • {p.mode}
                  </Text>
                  <Text style={styles.tripLedgerLab}>{p.destinationSummary}</Text>
                  <Text style={styles.tripLedgerBase}>
                    Ref: {p.referenceId} • {new Date(p.createdAt).toLocaleDateString('en-IN')}
                  </Text>
                </View>
                <Text style={styles.tripLedgerFee}>{formatInr(p.amountInr)}</Text>
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
            💳 Payout Account Details (UPI / Bank)
          </Text>
          <View style={styles.equipmentCard}>
            <View style={[styles.shiftSelectorRow, { marginBottom: 12 }]}>
              <TouchableOpacity
                style={[
                  styles.shiftButton,
                  payoutMethod === 'UPI' && {
                    backgroundColor: '#CCFBF1',
                    borderColor: COLORS.primaryTeal,
                    borderWidth: 1.5,
                  },
                ]}
                onPress={() => setPayoutMethod('UPI')}
              >
                <Text
                  style={[
                    styles.shiftButtonText,
                    payoutMethod === 'UPI' && { color: COLORS.primaryDark, fontWeight: '700' },
                  ]}
                >
                  UPI ID
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.shiftButton,
                  payoutMethod === 'BANK_TRANSFER' && {
                    backgroundColor: '#CCFBF1',
                    borderColor: COLORS.primaryTeal,
                    borderWidth: 1.5,
                  },
                ]}
                onPress={() => setPayoutMethod('BANK_TRANSFER')}
              >
                <Text
                  style={[
                    styles.shiftButtonText,
                    payoutMethod === 'BANK_TRANSFER' && {
                      color: COLORS.primaryDark,
                      fontWeight: '700',
                    },
                  ]}
                >
                  Bank Account + IFSC
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ marginBottom: 10 }}>
              <Text style={styles.inputLabelSm}>Account Holder Name</Text>
              <TextInput
                style={styles.fieldInput}
                value={payoutAccountName}
                onChangeText={setPayoutAccountName}
                placeholder="Full name on UPI / bank"
              />
            </View>

            {payoutMethod === 'UPI' ? (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.inputLabelSm}>UPI ID</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={payoutUpiId}
                  onChangeText={setPayoutUpiId}
                  autoCapitalize="none"
                  placeholder="courier@okaxis"
                />
              </View>
            ) : (
              <>
                <View style={{ marginBottom: 10 }}>
                  <Text style={styles.inputLabelSm}>Bank Account Number</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={payoutBankAccount}
                    onChangeText={setPayoutBankAccount}
                    keyboardType="numeric"
                    placeholder="Enter account number"
                  />
                </View>
                <View style={{ marginBottom: 12 }}>
                  <Text style={styles.inputLabelSm}>IFSC Code</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={payoutIfsc}
                    onChangeText={(txt) => setPayoutIfsc(txt.toUpperCase())}
                    autoCapitalize="characters"
                    placeholder="HDFC0001234"
                  />
                </View>
              </>
            )}

            <TouchableOpacity
              style={[styles.btnPrimary, savingPayoutProfile && { opacity: 0.65 }]}
              disabled={savingPayoutProfile}
              onPress={() => void handleSavePayoutProfile()}
            >
              <Text style={styles.btnPrimaryText}>
                {savingPayoutProfile ? 'Saving Account...' : 'Save Payout Account'}
              </Text>
            </TouchableOpacity>
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

      <Modal
        visible={Boolean(activePaymentLink)}
        transparent
        animationType="fade"
        onRequestClose={() => setActivePaymentLink(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.58)',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 16,
              padding: 20,
              borderWidth: 1,
              borderColor: COLORS.borderLight,
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: '700', color: COLORS.textPrimary }}>
              💳 Confirm Mobile Payment
            </Text>
            <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 6 }}>
              Booking {activePaymentLink?.orderNumber} • Amount:{' '}
              {formatInr(activePaymentLink?.amountInr || 0)}
            </Text>
            <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 8 }}>
              Complete the Razorpay checkout in the browser/UPI sheet, then tap Verify &amp; Confirm below to mark this order paid.
            </Text>

            <View style={{ marginTop: 16, gap: 10 }}>
              <TouchableOpacity
                style={[styles.ctaButton, verifyingLinkPayment && { opacity: 0.65 }]}
                disabled={verifyingLinkPayment}
                onPress={() => void handleVerifyActivePaymentLink()}
              >
                <Text style={styles.ctaButtonText}>
                  {verifyingLinkPayment ? 'Checking Razorpay Status...' : 'Check & Confirm Payment ✓'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btnSecondary, { flex: 0, paddingVertical: 12 }]}
                onPress={() => {
                  if (activePaymentLink?.shortUrl) {
                    void Linking.openURL(activePaymentLink.shortUrl);
                  }
                }}
              >
                <Text style={styles.btnSecondaryText}>Re-open Razorpay Checkout Link</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btnSecondary, { flex: 0, paddingVertical: 10, backgroundColor: '#F8FAFC' }]}
                onPress={() => setActivePaymentLink(null)}
              >
                <Text style={[styles.btnSecondaryText, { color: COLORS.textSecondary }]}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Rapido-Style 1–5 KM Live Broadcast Dispatch Modal */}
      <Modal
        visible={Boolean(activeBroadcastMatch)}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (activeBroadcastMatch) {
            setDismissedBroadcastIds((prev) =>
              prev.includes(activeBroadcastMatch.order.id)
                ? prev
                : [...prev, activeBroadcastMatch.order.id]
            );
          }
        }}
      >
        {activeBroadcastMatch ? (
          <View style={styles.modalBackdrop}>
            <View style={styles.broadcastCard}>
              <View style={styles.broadcastAlertBadge}>
                <Text style={styles.broadcastAlertBadgeText}>
                  ⚡ LIVE BROADCAST • {activeBroadcastMatch.distFromRiderKm} km away (within{' '}
                  {activeBroadcastMatch.maxRadiusKm} km)
                </Text>
              </View>

              <Text style={styles.broadcastTitle}>
                Pickup Request • {activeBroadcastMatch.order.orderNumber}
              </Text>
              <Text style={styles.broadcastFeeHero}>
                Earn {formatInr(activeBroadcastMatch.order.courierFeeInr || 0)} •{' '}
                {formatLabel(activeBroadcastMatch.order.priority)}
              </Text>

              <View style={styles.routeContainer}>
                <View style={styles.routeRow}>
                  <View style={[styles.dotMarker, { backgroundColor: COLORS.primaryTeal }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.routePlaceTitle}>
                      {activeBroadcastMatch.order.smallLabName}
                    </Text>
                    <Text style={styles.routePlaceSubtitle}>
                      {activeBroadcastMatch.order.pickupLocation.address}
                    </Text>
                  </View>
                </View>

                <View style={styles.routeConnectingLine} />

                <View style={styles.routeRow}>
                  <View style={[styles.dotMarker, { backgroundColor: COLORS.errorRed }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.routePlaceTitle}>
                      {activeBroadcastMatch.order.targetLabName}
                    </Text>
                    <Text style={styles.routePlaceSubtitle}>
                      {activeBroadcastMatch.order.deliveryLocation.address}
                    </Text>
                  </View>
                </View>
              </View>

              <Text style={styles.broadcastSpecsLine}>
                {(activeBroadcastMatch.order.specimens || []).length} Tube(s):{' '}
                {(activeBroadcastMatch.order.specimens || [])
                  .map(
                    (s) =>
                      `${s.testCode} (${(TUBE_METADATA[s.tubeType] || TUBE_METADATA[TubeType.SERUM_RED_GOLD]).shortTag})`
                  )
                  .join(', ')}
                {typeof activeBroadcastMatch.order.distanceKm === 'number' &&
                activeBroadcastMatch.order.distanceKm > 0
                  ? ` • Route ${activeBroadcastMatch.order.distanceKm} km`
                  : ''}
              </Text>

              <View style={[styles.actionsRow, { marginTop: 16 }]}>
                <TouchableOpacity
                  style={styles.btnSecondary}
                  disabled={submittingAction}
                  onPress={() =>
                    setDismissedBroadcastIds((prev) =>
                      prev.includes(activeBroadcastMatch.order.id)
                        ? prev
                        : [...prev, activeBroadcastMatch.order.id]
                    )
                  }
                >
                  <Text style={styles.btnSecondaryText}>Pass</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.btnPrimary, { flex: 2, backgroundColor: '#16A34A' }]}
                  disabled={submittingAction}
                  onPress={() => void handleAcceptPoolOrder(activeBroadcastMatch.order)}
                >
                  <Text style={styles.btnPrimaryText}>
                    {submittingAction ? 'Claiming...' : '⚡ ACCEPT PICKUP NOW'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}
      </Modal>

      {/* GPS & Locality Zone Picker Modal */}
      <Modal
        visible={showLocationPickerModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLocationPickerModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalCardTitle}>📍 Set Live Rider GPS Location</Text>
            <Text style={styles.modalCardSub}>
              Updates 1–5 km broadcast distance checks and Google Maps route origin immediately.
            </Text>

            <TouchableOpacity
              style={[styles.scanCamButton, { marginTop: 12, paddingVertical: 11 }]}
              onPress={() => {
                if (
                  Platform.OS !== 'web' ||
                  typeof navigator === 'undefined' ||
                  !navigator.geolocation
                ) {
                  showDynamicAlert({
                    variant: 'info',
                    title: 'Device GPS Unavailable',
                    message: 'Select a city locality hub or enter coordinates below.',
                  });
                  return;
                }
                navigator.geolocation.getCurrentPosition(
                  (pos) => {
                    void applyRiderLocation(
                      pos.coords.latitude,
                      pos.coords.longitude,
                      'Device Live GPS'
                    );
                  },
                  (err) => {
                    showDynamicAlert({
                      variant: 'warning',
                      title: 'GPS Permission Declined',
                      message: err.message || 'Select a preset hub below instead.',
                    });
                  },
                  { enableHighAccuracy: true, timeout: 8000 }
                );
              }}
            >
              <Text style={styles.scanCamButtonText}>🛰️ Use Device Live GPS</Text>
            </TouchableOpacity>

            <Text style={[styles.inputLabelSm, { marginTop: 14 }]}>Quick Locality Presets</Text>
            <ScrollView style={{ maxHeight: 170 }} showsVerticalScrollIndicator={false}>
              <View style={{ gap: 6 }}>
                {LOCALITY_GPS_PRESETS.map((preset) => (
                  <TouchableOpacity
                    key={preset.label}
                    style={styles.presetLocationRow}
                    onPress={() =>
                      void applyRiderLocation(preset.latitude, preset.longitude, preset.label)
                    }
                  >
                    <Text style={styles.presetLocationName}>{preset.label}</Text>
                    <Text style={styles.presetLocationCoords}>
                      {preset.latitude.toFixed(4)}, {preset.longitude.toFixed(4)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabelSm}>Latitude</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={manualLatInput}
                  onChangeText={setManualLatInput}
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabelSm}>Longitude</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={manualLngInput}
                  onChangeText={setManualLngInput}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={[styles.actionsRow, { marginTop: 14 }]}>
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={() => setShowLocationPickerModal(false)}
              >
                <Text style={styles.btnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={() => {
                  const lat = Number.parseFloat(manualLatInput);
                  const lng = Number.parseFloat(manualLngInput);
                  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                    showDynamicAlert({
                      variant: 'warning',
                      title: 'Invalid Coordinates',
                      message: 'Enter valid numeric latitude and longitude values.',
                    });
                    return;
                  }
                  void applyRiderLocation(lat, lng, 'Custom Coordinates');
                }}
              >
                <Text style={styles.btnPrimaryText}>Save Coordinates</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Camera Barcode Scanner & Sample Collection Photo Proof Modal */}
      <Modal
        visible={Boolean(cameraModal)}
        transparent
        animationType="fade"
        onRequestClose={() => setCameraModal(null)}
      >
        {cameraModal ? (
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalCardTitle}>
                {cameraModal.mode === 'PHOTO'
                  ? '📸 Capture Sample Collection Photo'
                  : `📷 Scan Barcode — ${cameraModal.specimen?.testCode || ''}`}
              </Text>
              <Text style={styles.modalCardSub}>{cameraStatusText}</Text>

              <View nativeID="phlebo-cam-host" style={styles.cameraViewport} />

              {cameraModal.mode === 'PHOTO' ? (
                <View style={{ gap: 10, marginTop: 14 }}>
                  <TouchableOpacity
                    style={[styles.ctaButton, uploadingPhoto && { opacity: 0.65 }]}
                    disabled={uploadingPhoto}
                    onPress={() => {
                      if (selectedOrder) {
                        handleCaptureSnapshotFromCam(selectedOrder.id);
                      }
                    }}
                  >
                    <Text style={styles.ctaButtonText}>
                      {uploadingPhoto ? 'Uploading Photo...' : '📸 Capture Photo & Upload'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.btnSecondary}
                    onPress={() => {
                      const oid = selectedOrder?.id;
                      setCameraModal(null);
                      if (oid) handleUploadSamplePhotoFromFile(oid);
                    }}
                  >
                    <Text style={styles.btnSecondaryText}>📁 Choose Photo File Instead</Text>
                  </TouchableOpacity>
                </View>
              ) : cameraModal.specimenId && cameraModal.specimen ? (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.inputLabelSm}>
                    {(TUBE_METADATA[cameraModal.specimen.tubeType] || TUBE_METADATA[TubeType.SERUM_RED_GOLD]).label}
                  </Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={specimenDrafts[cameraModal.specimenId]?.barcode || ''}
                    onChangeText={(txt) =>
                      updateSpecimenDraft(cameraModal.specimenId!, { barcode: txt })
                    }
                    placeholder={`Expected: ${cameraModal.specimen.barcode}`}
                    autoCapitalize="characters"
                  />
                  <TouchableOpacity
                    style={[styles.ctaButton, { marginTop: 10 }]}
                    onPress={() => {
                      updateSpecimenDraft(cameraModal.specimenId!, {
                        barcode: cameraModal.specimen!.barcode,
                        usedTube: cameraModal.specimen!.tubeType || TubeType.SERUM_RED_GOLD,
                      });
                      setCameraModal(null);
                    }}
                  >
                    <Text style={styles.ctaButtonText}>
                      ✓ Match Expected Barcode ({cameraModal.specimen.barcode})
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.btnSecondary, { flex: 0, marginTop: 12, paddingVertical: 11 }]}
                onPress={() => setCameraModal(null)}
              >
                <Text style={[styles.btnSecondaryText, { color: COLORS.textSecondary }]}>
                  Close Camera
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </Modal>

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
  gpsTelemetryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  gpsTelemetryTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  gpsTelemetrySub: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  gpsPickerBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.primaryTeal,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  gpsPickerBtnText: {
    color: COLORS.primaryDark,
    fontSize: 11,
    fontWeight: '700',
  },
  radiusFilterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  radiusFilterChip: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  radiusFilterChipActive: {
    backgroundColor: '#CCFBF1',
    borderColor: COLORS.primaryTeal,
  },
  radiusFilterText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  radiusFilterTextActive: {
    color: COLORS.primaryDark,
    fontWeight: '700',
  },
  badgeWrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  distanceBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  distanceBadgeHot: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  distanceBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  distanceBadgeTextHot: {
    color: '#B45309',
    fontWeight: '700',
  },
  tubePillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  specimenTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  specimenTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  tubeColorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  navMapButton: {
    flex: 1,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  navMapButtonText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '700',
  },
  detailSpecRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  detailSpecTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  detailSpecSub: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  verifyHintCard: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  verifyHintTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  verifyHintText: {
    fontSize: 12,
    color: '#1E40AF',
    marginTop: 4,
    lineHeight: 17,
  },
  specimenVerifyCard: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    marginBottom: 14,
  },
  specimenCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  specimenCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  specimenCardSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  validationBanner: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  validationBannerText: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  scanActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  scanCamButton: {
    backgroundColor: COLORS.primaryDark,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanCamButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  matchTagChip: {
    flex: 1,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchTagChipText: {
    color: COLORS.primaryDark,
    fontSize: 12,
    fontWeight: '600',
  },
  tubeChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tubeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  tubeChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  photoProofCard: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: 14,
    marginBottom: 14,
  },
  samplePhotoPreview: {
    width: '100%',
    height: 190,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.62)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  modalCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  modalCardSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
    lineHeight: 17,
  },
  broadcastCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 2,
    borderColor: '#16A34A',
  },
  broadcastAlertBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  broadcastAlertBadgeText: {
    color: '#B45309',
    fontSize: 11,
    fontWeight: '700',
  },
  broadcastTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  broadcastFeeHero: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primaryTeal,
    marginTop: 4,
  },
  broadcastSpecsLine: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  presetLocationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  presetLocationName: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  presetLocationCoords: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  cameraViewport: {
    width: '100%',
    height: 220,
    backgroundColor: '#0F172A',
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 12,
  },
});
