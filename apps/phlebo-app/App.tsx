import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  BackHandler,
  DeviceEventEmitter,
  Linking,
  Modal,
  Platform,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import * as Updates from 'expo-updates';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import {
  checkAppUpdateAvailability,
  applyAppUpdate,
  CURRENT_APP_VERSION,
  type AppUpdateCheckResult,
} from './services/appUpdateService';
import { AppUpdateModal } from './components/AppUpdateModal';
import { OrderChatModal } from './components/OrderChatModal';
import { purgeExpiredOrderMedia, cleanupCompletedOrderChats } from './services/orderChatService';
import * as TaskManager from 'expo-task-manager';
import {
  calculateHaversineDistanceKm,
  type CommissionConfig,
  computeDailyVolumeBars,
  type CustodyEvent,
  CustodyEventType,
  deepCleanFirestorePayload,
  DEFAULT_COMMISSION_CONFIG,
  DEFAULT_SUPPORT_CONTACTS,
  evaluatePointServiceCoverage,
  formatInr,
  isOrderCompleted,
  type KitAllocationRecord,
  type LiveGeoCoordinate,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  OrderStatus,
  type PayoutProfile,
  type PayoutRecord,
  type PhlebotomistProfile,
  type PhlebotomistShiftStatus,
  type PickupOrder,
  type PlatformNotification,
  type PlatformSopDocument,
  type PlatformFaqDocument,
  type ServiceZoneRecord,
  type SettlementRecord,
  type SpecimenItem,
  type SupportContactsConfig,
  type PlatformFeaturesConfig,
  DEFAULT_PLATFORM_FEATURES,
  TubeType,
  UserRole,
  validateTubeBarcodeScan,
} from '@diagnostic/shared';
import { signOut } from 'firebase/auth';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  ADMIN_LOGIN_EMAIL,
  auth,
  db,
  requestKitRestock,
  subscribeMyKitAllocations,
  uploadPhleboSampleFile,
} from './firebase';
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
import { FloatingDispatchOverlay } from './components/FloatingDispatchOverlay';
import { PhleboDrawer } from './components/PhleboDrawer';
import { FloatingIconSettingsModal } from './components/FloatingIconSettingsModal';
import { BRAND_COLORS, BRAND_FONTS, LabSetuLogoMark } from './components/LabSetuBrand';
import { COMPACT_TEXT_SCALE, rs } from './utils/responsive';
import {
  dismissIncomingPickupOverlay,
  ensureDutyNotificationChannel,
  getOverlayEnvironmentInfo,
  getPendingIncomingOrderAction,
  isNativeSystemOverlayAvailable,
  openSystemOverlayPermissionSettings,
  syncFloatingOverlayRuntime,
  triggerIncomingPickupOverlay,
  URGENT_DISPATCH_CHANNEL_ID,
} from './services/floatingOverlayService';
import {
  INITIAL_TOAST_BANNER,
  type ToastBannerState,
  type ToastBannerVariant,
  ToastNotificationBanner,
} from './components/ToastNotificationBanner';
import {
  BroadcastDispatchModal,
  CameraScannerModal,
  LocationPickerModal,
  PaymentLinkModal,
  PhleboKitInventoryModal,
  PhleboNotificationsModal,
  PhleboQuickActionsModal,
} from './components/PhleboModals';
import {
  BookingDetailsScreen,
  BookingRequestsScreen,
  BookingsHistoryScreen,
  CollectSampleScreen,
  CompletedReceiptScreen,
  DropSampleScreen,
  EarningsScreen,
  HelpSupportScreen,
  KitsAndSuppliesScreen,
  ProfileScreen,
  TodayCollectionsScreen,
  TrainingSopScreen,
} from './screens';
import {
  checkPhleboPaymentLinkStatus,
  createPhleboMobilePaymentLink,
  startPhleboWebCheckout,
} from './services/razorpayMobile';
import {
  captureSampleProofPhoto,
  pickSampleProofFromLibrary,
} from './services/cameraPhotoService';
import { COLORS, styles } from './styles/phleboStyles';
import {
  type ActivePaymentLinkState,
  type BookingHistoryFilter,
  type BottomTab,
  type CameraModalState,
  type CompletedReceipt,
  DEFAULT_FLOATING_ICON_SETTINGS,
  type EarningRow,
  type FloatingIconSettings,
  type OpenPoolEntry,
  type PhleboMetrics,
  type RequestTab,
  type ScreenType,
  type SpecimenDraftMap,
  type WebNotificationPermissionState,
} from './types/phleboTypes';

const FLOATING_SETTINGS_STORAGE_KEY = '@labsetu_floating_icon_settings_v1';
const DUTY_STATUS_STORAGE_KEY = '@labsetu_phlebo_duty_status_v1';
import {
  playPickupAlertChime,
  startContinuousPickupAlert,
  stopContinuousPickupAlert,
} from './utils/phleboHelpers';

const PHLEBO_BG_LOCATION_TASK = 'labsetu-phlebo-bg-location';

let activeBgLocationSink:
  | ((lat: number, lng: number, speedKmph?: number, accuracyMeters?: number) => void)
  | null = null;

if (Platform.OS !== 'web') {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch {
    // Ignore notification handler init failures on unsupported runtimes
  }

  try {
    if (!TaskManager.isTaskDefined(PHLEBO_BG_LOCATION_TASK)) {
      TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(
        PHLEBO_BG_LOCATION_TASK,
        async ({ data, error }) => {
          if (error || !data?.locations || data.locations.length === 0) return;
          const latest = data.locations[data.locations.length - 1];
          if (!latest?.coords) return;
          const speedKmph =
            typeof latest.coords.speed === 'number' && latest.coords.speed >= 0
              ? Math.round(latest.coords.speed * 3.6)
              : undefined;
          const accuracyMeters =
            typeof latest.coords.accuracy === 'number'
              ? Math.round(latest.coords.accuracy)
              : undefined;
          activeBgLocationSink?.(
            latest.coords.latitude,
            latest.coords.longitude,
            speedKmph,
            accuracyMeters
          );
        }
      );
    }
  } catch {
    // Ignore TaskManager registration failures outside native task runtimes
  }
}

interface PhleboErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class PhleboErrorBoundary extends React.Component<
  { children: React.ReactNode },
  PhleboErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): PhleboErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Unexpected mobile rendering error.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={[styles.root, { justifyContent: 'center', padding: 24 }]}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#E2E8F0' }}>
            <Text style={{ fontSize: 18, fontFamily: BRAND_FONTS.extraBold, color: '#0F172A', marginBottom: 8, includeFontPadding: true }}>
              LabSetu Partner Recovery
            </Text>
            <Text style={{ fontSize: 13, fontFamily: BRAND_FONTS.regular, color: '#475569', marginBottom: 14, includeFontPadding: true }}>
              {this.state.message}
            </Text>
            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={() => this.setState({ hasError: false, message: '' })}
            >
              <Text style={styles.btnPrimaryText}>Retry Loading App</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <SafeAreaProvider>
      <PhleboErrorBoundary>
        <PhleboAppContent />
      </PhleboErrorBoundary>
    </SafeAreaProvider>
  );
}

function PhleboAppContent() {
  const insets = useSafeAreaInsets();
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  const [fontWaitExpired, setFontWaitExpired] = useState(false);

  useEffect(() => {
    if (fontsLoaded || fontError) return;
    const timer = setTimeout(() => setFontWaitExpired(true), 1600);
    return () => clearTimeout(timer);
  }, [fontsLoaded, fontError]);

  const [session, setSession] = useState<VerifiedPhleboSession | null>(null);
  const [alertState, setAlertState] = useState<DynamicAlertState>(INITIAL_DYNAMIC_ALERT);
  const [toastState, setToastState] = useState<ToastBannerState>(INITIAL_TOAST_BANNER);
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('BOOKING_REQUESTS');
  const [detailsReturnScreen, setDetailsReturnScreen] = useState<'BOOKING_REQUESTS' | 'TODAYS_COLLECTIONS'>('BOOKING_REQUESTS');
  const [requestTab, setRequestTab] = useState<RequestTab>('active');
  const [bottomTab, setBottomTab] = useState<BottomTab>('home');
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [floatingSettingsVisible, setFloatingSettingsVisible] = useState(false);
  const [floatingResetNonce, setFloatingResetNonce] = useState(0);
  const [floatingSettings, setFloatingSettings] = useState<FloatingIconSettings>(
    DEFAULT_FLOATING_ICON_SETTINGS
  );
  const [localDutyStatus, setLocalDutyStatus] = useState<PhlebotomistShiftStatus>('ONLINE');
  const lastUserShiftToggleMsRef = useRef<number>(0);
  const [appState, setAppState] = useState<AppStateStatus>(
    (AppState.currentState as AppStateStatus) || 'active'
  );

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(FLOATING_SETTINGS_STORAGE_KEY)
      .then((raw) => {
        if (!mounted || !raw) return;
        const parsed = JSON.parse(raw) as Partial<FloatingIconSettings>;
        setFloatingSettings({ ...DEFAULT_FLOATING_ICON_SETTINGS, ...parsed });
      })
      .catch(() => { });

    AsyncStorage.getItem(DUTY_STATUS_STORAGE_KEY)
      .then((raw) => {
        if (!mounted || !raw) return;
        if (raw === 'ONLINE' || raw === 'BREAK' || raw === 'OFFLINE') {
          setLocalDutyStatus(raw);
        }
      })
      .catch(() => { });

    return () => {
      mounted = false;
    };
  }, []);

  // Pre-register Android notification channels and request notification permissions on startup
  useEffect(() => {
    if (Platform.OS !== 'web') {
      void ensureDutyNotificationChannel();
      void Notifications.requestPermissionsAsync().catch(() => { });
    }
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState);
    });
    return () => {
      sub.remove();
    };
  }, []);

  const handleNavigateBackHome = useCallback(() => {
    setBottomTab('home');
    setCurrentScreen('BOOKING_REQUESTS');
    setRequestTab('active');
  }, []);

  const updateFloatingSettings = useCallback((patch: Partial<FloatingIconSettings>) => {
    setFloatingSettings((prev) => {
      const next = { ...prev, ...patch };
      void AsyncStorage.setItem(FLOATING_SETTINGS_STORAGE_KEY, JSON.stringify(next)).catch(
        () => { }
      );
      return next;
    });
  }, []);

  // Live Database States
  const [orders, setOrders] = useState<PickupOrder[]>([]);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [serviceZones, setServiceZones] = useState<ServiceZoneRecord[]>([]);
  const [zonesLoaded, setZonesLoaded] = useState(false);
  const [commissionConfig, setCommissionConfig] = useState<CommissionConfig>(DEFAULT_COMMISSION_CONFIG);
  const [myPhleboProfile, setMyPhleboProfile] = useState<PhlebotomistProfile | null>(null);
  const [activeChatOrder, setActiveChatOrder] = useState<PickupOrder | null>(null);
  const [kitAllocations, setKitAllocations] = useState<KitAllocationRecord[]>([]);
  const [showMySuppliesModal, setShowMySuppliesModal] = useState(false);
  const [notifications, setNotifications] = useState<PlatformNotification[]>([]);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [supportContacts, setSupportContacts] = useState<SupportContactsConfig>(DEFAULT_SUPPORT_CONTACTS);
  const [platformSops, setPlatformSops] = useState<PlatformSopDocument[]>([]);
  const [platformFaqs, setPlatformFaqs] = useState<PlatformFaqDocument[]>([]);
  const [platformFeatures, setPlatformFeatures] = useState<PlatformFeaturesConfig>(DEFAULT_PLATFORM_FEATURES);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  // Payment collection & partner payout profile states
  const [collectingOrderId, setCollectingOrderId] = useState<string | null>(null);
  const [activePaymentLink, setActivePaymentLink] = useState<ActivePaymentLinkState | null>(null);
  const [verifyingLinkPayment, setVerifyingLinkPayment] = useState(false);

  const [payoutMethod, setPayoutMethod] = useState<'UPI' | 'BANK_TRANSFER'>('UPI');
  const [payoutBankName, setPayoutBankName] = useState('');
  const [payoutAccountName, setPayoutAccountName] = useState('');
  const [payoutUpiId, setPayoutUpiId] = useState('');
  const [payoutBankAccount, setPayoutBankAccount] = useState('');
  const [payoutIfsc, setPayoutIfsc] = useState('');
  const [savingPayoutProfile, setSavingPayoutProfile] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileDob, setProfileDob] = useState('1996-08-15');
  const [profileGender, setProfileGender] = useState<'MALE' | 'FEMALE' | 'OTHER'>('MALE');
  const [profilePhotoUrl, setProfilePhotoUrl] = useState('');

  // Selected trip & workflow form state
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [otpValue, setOtpValue] = useState<string[]>(['', '', '', '', '']);
  const [specimenDrafts, setSpecimenDrafts] = useState<SpecimenDraftMap>({});
  const [samplePhotoUrl, setSamplePhotoUrl] = useState('');
  const [selfiePhotoUrl, setSelfiePhotoUrl] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingSelfie, setUploadingSelfie] = useState(false);
  const [cameraModal, setCameraModal] = useState<CameraModalState | null>(null);
  const [cameraStatusText, setCameraStatusText] = useState('Starting camera...');
  const [pickupTempInput, setPickupTempInput] = useState('4.2');
  const [dropTempInput, setDropTempInput] = useState('4.2');
  const [submittingAction, setSubmittingAction] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<CompletedReceipt | null>(null);

  // Live Rider GPS + Admin-Assigned Zone + Live Broadcast State
  const [riderLocation, setRiderLocation] = useState<LiveGeoCoordinate>({
    latitude: 19.124,
    longitude: 72.866,
    updatedAt: new Date().toISOString(),
  });
  const [gpsSourceLabel, setGpsSourceLabel] = useState('Syncing Admin Zone...');
  const [riderFullAddress, setRiderFullAddress] = useState<string>('');
  const [showQuickActionsModal, setShowQuickActionsModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [pendingAppUpdate, setPendingAppUpdate] = useState<AppUpdateCheckResult | null>(null);
  const [systemModulesConfig, setSystemModulesConfig] = useState<{ kitModuleEnabled?: boolean }>({});
  const [showLocationPickerModal, setShowLocationPickerModal] = useState(false);
  const [hasOverlayPermission, setHasOverlayPermission] = useState<boolean>(true);
  const manualLiveGpsSyncedRef = useRef(false);
  const [dismissedBroadcastIds, setDismissedBroadcastIds] = useState<string[]>([]);
  const [declinedOrderIds, setDeclinedOrderIds] = useState<string[]>([]);
  const [broadcastForceOpen, setBroadcastForceOpen] = useState(false);
  const [radiusOnlyFilter, setRadiusOnlyFilter] = useState(false);
  const [webNotifPerm, setWebNotifPerm] = useState<WebNotificationPermissionState>(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
      return window.Notification.permission;
    }
    return Platform.OS === 'web' ? 'unsupported' : 'default';
  });
  const alertedBroadcastIdsRef = useRef<Set<string>>(new Set());
  const activeRingingOrderIdRef = useRef<string | null>(null);
  const seenHikeMapRef = useRef<Map<string, number>>(new Map());
  const seenRetryMapRef = useRef<Map<string, number>>(new Map());
  const seenUpdatedMapRef = useRef<Map<string, number>>(new Map());
  const lastBarcodeToastRef = useRef<Record<string, string>>({});
  const seenNotificationDocIdsRef = useRef<Set<string>>(new Set());
  const myAssignedOrderIdsRef = useRef<Set<string>>(new Set());
  const initialNotifLoadRef = useRef(true);

  // History filter state
  const [bookingHistoryFilter, setBookingHistoryFilter] = useState<BookingHistoryFilter>('all');
  const [bookingSearchQuery, setBookingSearchQuery] = useState('');

  const showToast = useCallback(
    (opts: {
      variant: ToastBannerVariant;
      title: string;
      subtitle?: string;
      actionLabel?: string;
      onAction?: () => void;
    }) => {
      if (opts.variant === 'ALERT' || opts.variant === 'SUCCESS') {
        playPickupAlertChime();
      }
      setToastState({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        visible: true,
        variant: opts.variant,
        title: opts.title,
        subtitle: opts.subtitle,
        actionLabel: opts.actionLabel,
        onAction: opts.onAction,
      });
    },
    []
  );

  const handleDismissToast = useCallback(() => {
    setToastState((prev) => ({ ...prev, visible: false }));
  }, []);

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

  const handleCheckForUpdates = useCallback(
    async (interactive = false) => {
      try {
        if (interactive) {
          showToast({
            variant: 'INFO',
            title: 'Checking for updates...',
            subtitle: 'Checking for the latest app version.',
          });
        }

        const result = await checkAppUpdateAvailability();

        if (result.hasUpdate) {
          setPendingAppUpdate(result);
          setShowUpdateModal(true);
        } else if (interactive) {
          showToast({
            variant: 'SUCCESS',
            title: 'App is Up to Date',
            subtitle: `You are running the latest version (${CURRENT_APP_VERSION}).`,
          });
        }
      } catch (err: any) {
        if (interactive) {
          showToast({
            variant: 'WARNING',
            title: 'Update Check Incomplete',
            subtitle: err?.message || 'Could not verify updates. Check internet connection.',
          });
        }
      }
    },
    [showToast]
  );

  // Background auto-check for updates on app startup
  useEffect(() => {
    const timer = setTimeout(() => {
      void handleCheckForUpdates(false);
    }, 4000);
    return () => clearTimeout(timer);
  }, [handleCheckForUpdates]);

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
          alertedBroadcastIdsRef.current.clear();
          lastBarcodeToastRef.current = {};
          setBroadcastForceOpen(false);
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

  const handleRequestKitRestock = async (kitCode?: string, kitName?: string) => {
    if (!session?.firebaseUser) return;
    try {
      await requestKitRestock({
        phleboId: effectivePhleboId || session.firebaseUser.uid,
        phleboName,
        kitCode,
        kitName,
        requestedQuantity: 10,
        notes: `Urgent field kit restock requested by courier ${phleboName} (${displayCourierId})`,
      });
      showToast({
        variant: 'SUCCESS',
        title: '📢 Restock Request Sent',
        subtitle: `Central Supply notified to dispatch ${kitName || 'collection kits'}.`,
      });
    } catch (err) {
      showDynamicAlert({
        variant: 'error',
        title: 'Request Failed',
        message: (err as Error).message || 'Could not send restock request.',
      });
    }
  };

  const myPhleboId = session?.profile.phlebotomistId?.trim() || '';
  const phleboName = session?.profile.displayName || '';
  const phleboFirstName = phleboName.split(' ')[0] || 'Courier';
  const phleboInitial = phleboName.charAt(0).toUpperCase() || 'P';
  const phleboEmail = session?.profile.email || '';

  // Subscribe live to orders, phlebotomist profile, service zones & payout settings
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

    // 1. Open dispatch pool (READY_FOR_PICKUP)
    unsubs.push(
      onSnapshot(
        query(
          collection(db, 'orders'),
          where('status', '==', OrderStatus.READY_FOR_PICKUP)
        ),
        (snap) => {
          for (const [k, v] of orderMap.entries()) {
            if (v.status === OrderStatus.READY_FOR_PICKUP && (!v.phlebotomistId || v.phlebotomistId === myPhleboId)) {
              orderMap.delete(k);
            }
          }
          snap.docs.forEach((d) => {
            const data = d.data() as Omit<PickupOrder, 'id'>;
            // Include order if unassigned or assigned to current rider
            if (!data.phlebotomistId || data.phlebotomistId === '' || (myPhleboId && data.phlebotomistId === myPhleboId)) {
              orderMap.set(d.id, { id: d.id, ...data });
            }
          });
          emitOrders();
        },
        (err) => {
          console.warn('Orders dispatch pool query warning:', err);
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
          },
          (err) => {
            console.warn('Assigned orders query warning:', err);
          }
        )
      );

      // 3. Phlebotomist fleet profile doc
      unsubs.push(
        onSnapshot(
          doc(db, 'phlebotomists', myPhleboId),
          (snap) => {
            if (snap.exists()) {
              setMyPhleboProfile({
                id: snap.id,
                ...(snap.data() as Omit<PhlebotomistProfile, 'id'>),
              });
            } else {
              setMyPhleboProfile(null);
            }
          },
          (err) => {
            console.warn('Phlebo profile doc warning:', err);
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
          },
          (err) => {
            console.warn('Phlebo email query warning:', err);
          }
        )
      );
    }

    // 4. Active operational service zones (100% dynamic from Admin)
    unsubs.push(
      onSnapshot(
        collection(db, 'service_zones'),
        (snap) => {
          setZonesLoaded(true);
          if (snap.empty) {
            setServiceZones([]);
            return;
          }
          setServiceZones(
            snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<ServiceZoneRecord, 'id'>),
            }))
          );
        },
        () => {
          setZonesLoaded(true);
        }
      )
    );

    // 5. Instant 30-min payout & broadcast radius settings
    unsubs.push(
      onSnapshot(
        doc(db, 'settings', 'commission'),
        (snap) => {
          if (snap.exists()) {
            setCommissionConfig({
              ...DEFAULT_COMMISSION_CONFIG,
              ...(snap.data() as Partial<CommissionConfig>),
            });
          }
        },
        () => {
          setCommissionConfig(DEFAULT_COMMISSION_CONFIG);
        }
      )
    );

    // 6. Live Platform Emergency & Dispatch Support Desk Settings
    unsubs.push(
      onSnapshot(
        doc(db, 'settings', 'support'),
        (snap) => {
          if (snap.exists()) {
            setSupportContacts({
              ...DEFAULT_SUPPORT_CONTACTS,
              ...(snap.data() as Partial<SupportContactsConfig>),
            });
          }
        },
        () => {
          setSupportContacts(DEFAULT_SUPPORT_CONTACTS);
        }
      )
    );

    // 7. Live Platform Feature Toggles (Barcode Scanner, etc.)
    unsubs.push(
      onSnapshot(
        doc(db, 'settings', 'features'),
        (snap) => {
          if (snap.exists()) {
            setPlatformFeatures({
              ...DEFAULT_PLATFORM_FEATURES,
              ...(snap.data() as Partial<PlatformFeaturesConfig>),
            });
          }
        },
        () => {
          setPlatformFeatures(DEFAULT_PLATFORM_FEATURES);
        }
      )
    );

    // Live Dynamic Standard Operating Procedures (SOPs)
    unsubs.push(
      onSnapshot(
        collection(db, 'platform_sops'),
        (snap) => {
          if (!snap.empty) {
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PlatformSopDocument));
            list.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
            setPlatformSops(list);
          }
        },
        () => { }
      )
    );

    // Live Dynamic FAQs
    unsubs.push(
      onSnapshot(
        collection(db, 'platform_faqs'),
        (snap) => {
          if (!snap.empty) {
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PlatformFaqDocument));
            list.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
            setPlatformFaqs(list);
          }
        },
        () => { }
      )
    );

    // 7. Live Phlebotomist In-App Notifications & Real System Drawer Alerts
    unsubs.push(
      onSnapshot(
        collection(db, 'notifications'),
        (snap) => {
          const all = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<PlatformNotification, 'id'>),
          }));
          const filtered = all
            .filter((n) => {
              // 1. If notification is tied to an order, ONLY show if this phlebo has accepted/is assigned to that order
              if (n.orderId) {
                return myAssignedOrderIdsRef.current.has(n.orderId);
              }

              // 2. Direct notification targeted to this phlebotomist (e.g. from Admin / Support / Staff)
              if (
                n.recipientUid &&
                (n.recipientUid === session?.firebaseUser?.uid ||
                  n.recipientUid === effectivePhleboId ||
                  n.recipientUid === myPhleboProfile?.id)
              ) {
                return true;
              }

              // 3. Official Admin staff broadcasts or platform alerts (system notices, payouts, emergencies)
              const isAdminOrSystemAlert =
                n.category === NotificationCategory.SYSTEM_ALERT ||
                n.category === NotificationCategory.PAYOUT_SETTLED ||
                n.category === NotificationCategory.LAB_VERIFICATION ||
                Boolean(n.title && n.title.toLowerCase().includes('admin'));

              if (
                isAdminOrSystemAlert &&
                (n.recipientRole === UserRole.PHLEBOTOMIST || n.recipientRole === 'ALL')
              ) {
                return true;
              }

              return false;
            })
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
          setNotifications(filtered);

          if (initialNotifLoadRef.current) {
            filtered.forEach((n) => seenNotificationDocIdsRef.current.add(n.id));
            initialNotifLoadRef.current = false;
          } else {
            filtered.forEach((n) => {
              if (!seenNotificationDocIdsRef.current.has(n.id) && !n.read) {
                seenNotificationDocIdsRef.current.add(n.id);

                // If phlebotomist has an active ongoing task, suppress generic booking/pickup broadcast popups & sounds
                const isGenericBroadcast =
                  n.category === NotificationCategory.BOOKING_CREATED ||
                  n.category === NotificationCategory.PICKUP_ASSIGNED ||
                  n.recipientRole === UserRole.PHLEBOTOMIST ||
                  n.recipientRole === 'ALL';

                if (activeAssignedOrdersRef.current > 0 && isGenericBroadcast) {
                  return;
                }

                if (Platform.OS !== 'web') {
                  void Notifications.scheduleNotificationAsync({
                    content: {
                      title: n.title || 'LabSetu Platform Alert',
                      body: n.message || 'New logistics update received.',
                      data: { notificationId: n.id, orderId: n.orderId, action: 'OPEN_NOTIF' },
                      sound: 'default',
                      priority: Notifications.AndroidNotificationPriority.HIGH,
                    },
                    trigger: null,
                  }).catch(() => { });
                }
                playPickupAlertChime();
                showToast({
                  variant: 'INFO',
                  title: n.title || 'New Notification',
                  subtitle: n.message || '',
                  actionLabel: 'View',
                  onAction: () => setShowNotificationsModal(true),
                });
              }
            });
          }
        },
        (err) => {
          console.warn('Notifications live subscription skipped:', err);
        }
      )
    );

    // 8. Live System Modules Feature Flags (e.g. kitModuleEnabled)
    unsubs.push(
      onSnapshot(
        doc(db, 'system_config', 'modules'),
        (snap) => {
          if (snap.exists()) {
            setSystemModulesConfig(snap.data() as any);
          }
        },
        () => {
          setSystemModulesConfig({});
        }
      )
    );

    return () => unsubs.forEach((u) => u());
  }, [session?.firebaseUser, myPhleboId, phleboEmail]);

  const effectivePhleboId = myPhleboId || myPhleboProfile?.id || session?.firebaseUser?.uid || '';
  const displayCourierId =
    myPhleboProfile?.userCode || session?.profile.userCode || effectivePhleboId || 'ID Pending';
  const unreadNotifCount = notifications.filter((n) => !n.read).length;

  const isKitModuleActive = Boolean(
    systemModulesConfig?.kitModuleEnabled ||
    (myPhleboProfile as any)?.kitModuleEnabled ||
    kitAllocations.length > 0
  );

  const handleMarkNotificationRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch (err) {
      console.warn('Failed to mark read:', err);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      const unread = notifications.filter((n) => !n.read);
      if (unread.length === 0) return;
      const batch = writeBatch(db);
      unread.forEach((n) => {
        batch.update(doc(db, 'notifications', n.id), { read: true, readAt: new Date().toISOString() });
      });
      await batch.commit();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err) {
      console.warn('Failed to mark all read:', err);
    }
  };

  const handleClearAllNotifications = async () => {
    try {
      if (notifications.length === 0) return;
      const batch = writeBatch(db);
      notifications.forEach((n) => {
        batch.delete(doc(db, 'notifications', n.id));
      });
      await batch.commit();
      setNotifications([]);
    } catch (err) {
      console.warn('Failed to clear notifications:', err);
    }
  };

  // Load persisted declined/rejected bookings for this phlebotomist
  useEffect(() => {
    if (!effectivePhleboId) return;
    void AsyncStorage.getItem(`labsetu_declined_orders_${effectivePhleboId}`).then((raw) => {
      if (raw) {
        try {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            setDeclinedOrderIds(list);
            list.forEach((id) => alertedBroadcastIdsRef.current.add(id));
          }
        } catch { }
      }
    });
  }, [effectivePhleboId]);

  const handleDeclineOrder = useCallback(
    async (orderId: string) => {
      stopContinuousPickupAlert();
      void dismissIncomingPickupOverlay();
      setBroadcastForceOpen(false);
      setDeclinedOrderIds((prev) => {
        const next = prev.includes(orderId) ? prev : [...prev, orderId];
        if (effectivePhleboId) {
          void AsyncStorage.setItem(
            `labsetu_declined_orders_${effectivePhleboId}`,
            JSON.stringify(next)
          ).catch(() => { });
        }
        return next;
      });
      setDismissedBroadcastIds((prev) =>
        prev.includes(orderId) ? prev : [...prev, orderId]
      );
      alertedBroadcastIdsRef.current.add(orderId);

      try {
        await updateDoc(doc(db, 'orders', orderId), {
          declinedPhleboIds: arrayUnion(effectivePhleboId || 'declined'),
        });
      } catch {
        // Continue gracefully even if offline
      }

      showToast({
        variant: 'INFO',
        title: 'Booking Request Passed',
        subtitle: 'You will not receive alerts for this pickup order.',
      });
    },
    [effectivePhleboId, showToast]
  );

  // Keep live ticker: 1-second cadence when unassigned orders exist or alert is active, 15-second cadence otherwise
  useEffect(() => {
    if (!session) return;
    const hasActivePoolOrder = orders.some(
      (o) => o.status === OrderStatus.READY_FOR_PICKUP && (!o.phlebotomistId || o.phlebotomistId === '')
    );
    const tickIntervalMs = hasActivePoolOrder || activeRingingOrderIdRef.current ? 1000 : 15000;
    const timer = setInterval(() => setNowTick(Date.now()), tickIntervalMs);
    return () => clearInterval(timer);
  }, [session, orders]);

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

    const unsubKits = subscribeMyKitAllocations(effectivePhleboId, (list) => {
      setKitAllocations(list);
    });

    return () => {
      unsubSettlements();
      unsubPayouts();
      unsubKits();
    };
  }, [session?.firebaseUser, effectivePhleboId]);

  // Populate payout account & personal settings whenever fleet profile updates
  useEffect(() => {
    const pp = myPhleboProfile?.payoutProfile;
    if (myPhleboProfile?.name) setProfileName(myPhleboProfile.name);
    const customDoc = myPhleboProfile as unknown as Record<string, unknown> | undefined;
    if (customDoc?.dob && typeof customDoc.dob === 'string') setProfileDob(customDoc.dob);
    if (customDoc?.gender && (customDoc.gender === 'MALE' || customDoc.gender === 'FEMALE' || customDoc.gender === 'OTHER')) {
      setProfileGender(customDoc.gender);
    }
    if (myPhleboProfile?.livePhotoUrl) setProfilePhotoUrl(myPhleboProfile.livePhotoUrl);
    const customPp = pp as unknown as Record<string, unknown> | undefined;
    if (customPp?.bankName && typeof customPp.bankName === 'string') setPayoutBankName(customPp.bankName);

    if (!pp) {
      setPayoutAccountName((prev) => prev || phleboName);
      return;
    }
    setPayoutMethod(pp.preferredMethod || (pp.bankAccountLast4 && !pp.upiId ? 'BANK_TRANSFER' : 'UPI'));
    setPayoutAccountName(pp.accountHolderName || phleboName);
    setPayoutUpiId(pp.upiId || '');
    setPayoutBankAccount(pp.bankAccountLast4 ? `••••${pp.bankAccountLast4}` : '');
    setPayoutIfsc(pp.ifscCode || '');
  }, [myPhleboProfile, phleboName]);

  // Sync optimistic local duty status whenever Firestore fleet profile updates (unless user recently toggled)
  useEffect(() => {
    if (myPhleboProfile?.status) {
      if (Date.now() - lastUserShiftToggleMsRef.current < 8000) return;
      setLocalDutyStatus(myPhleboProfile.status);
      void AsyncStorage.setItem(DUTY_STATUS_STORAGE_KEY, myPhleboProfile.status).catch(() => { });
    }
  }, [myPhleboProfile?.status]);

  const dutyStatus: PhlebotomistShiftStatus = localDutyStatus;
  const isOnline = dutyStatus === 'ONLINE';

  const isSuspendedForUnsettledFees = useMemo(() => {
    const due = Number(myPhleboProfile?.pendingPlatformFeeDueInr) || 0;
    if (due <= 0 || !myPhleboProfile?.unsettledCashSince) return false;
    const daysSince =
      (Date.now() - new Date(myPhleboProfile.unsettledCashSince).getTime()) / 86400000;
    return daysSince >= 15;
  }, [myPhleboProfile]);

  const openPoolOrders = useMemo(() => {
    return orders.filter((o) => {
      if (o.status !== OrderStatus.READY_FOR_PICKUP || Boolean(o.phlebotomistId)) {
        return false;
      }
      return true;
    });
  }, [orders]);

  const activeAssignedOrdersRef = useRef<number>(0);

  const myAssignedOrders = useMemo(() => {
    const validIds = new Set<string>();
    if (effectivePhleboId) validIds.add(effectivePhleboId.trim().toLowerCase());
    if (myPhleboProfile?.id) validIds.add(myPhleboProfile.id.trim().toLowerCase());
    if (myPhleboProfile?.userCode) validIds.add(myPhleboProfile.userCode.trim().toLowerCase());
    if (session?.firebaseUser?.uid) validIds.add(session.firebaseUser.uid.trim().toLowerCase());
    if (myPhleboId) validIds.add(myPhleboId.trim().toLowerCase());

    if (validIds.size === 0) return [];

    return orders.filter((o) => {
      if (!o.phlebotomistId) return false;
      return validIds.has(o.phlebotomistId.trim().toLowerCase());
    });
  }, [orders, effectivePhleboId, myPhleboProfile?.id, myPhleboProfile?.userCode, session?.firebaseUser?.uid, myPhleboId]);

  const activeAssignedOrders = useMemo(
    () =>
      myAssignedOrders.filter(
        (o) =>
          o.status !== OrderStatus.DELIVERED_TO_LAB &&
          o.status !== OrderStatus.UNDER_ANALYSIS &&
          o.status !== OrderStatus.REPORT_UPLOADED &&
          o.status !== OrderStatus.COMPLETED &&
          o.status !== OrderStatus.CANCELLED &&
          o.status !== OrderStatus.REJECTED &&
          !isOrderCompleted(o.status)
      ),
    [myAssignedOrders]
  );

  useEffect(() => {
    activeAssignedOrdersRef.current = activeAssignedOrders.length;
    myAssignedOrderIdsRef.current = new Set(myAssignedOrders.map((o) => o.id));
  }, [activeAssignedOrders.length, myAssignedOrders]);

  // Periodic background cleanup of expired order chats (>1.5h) and sample media proof (>7 days)
  useEffect(() => {
    if (!orders.length) return;
    orders.forEach((o) => {
      if (isOrderCompleted(o.status)) {
        void cleanupCompletedOrderChats(o).catch(() => { });
      }
      void purgeExpiredOrderMedia(o).catch(() => { });
    });
  }, [orders]);

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

  // Active real-time document listener on selected order & settlement for instant payment/status sync
  useEffect(() => {
    if (!selectedOrderId) return;
    const unsubOrder = onSnapshot(
      doc(db, 'orders', selectedOrderId),
      (snap) => {
        if (snap.exists()) {
          const latestOrder = { id: snap.id, ...(snap.data() as Omit<PickupOrder, 'id'>) };
          setOrders((prev) => {
            const idx = prev.findIndex((o) => o.id === selectedOrderId);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = latestOrder;
              return next;
            }
            return [latestOrder, ...prev];
          });
        }
      },
      (err) => {
        console.warn('Selected order doc subscription warning:', err);
      }
    );

    const stlId = `STL-${selectedOrderId.replace('BK-', '')}`;
    const unsubStl = onSnapshot(
      doc(db, 'settlements', stlId),
      (snap) => {
        if (snap.exists()) {
          const latestStl = { id: snap.id, ...(snap.data() as Omit<SettlementRecord, 'id'>) };
          setSettlements((prev) => {
            const idx = prev.findIndex((s) => s.id === latestStl.id || s.orderId === selectedOrderId);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = latestStl;
              return next;
            }
            return [latestStl, ...prev];
          });
        }
      },
      (err) => {
        console.warn('Selected settlement doc subscription warning:', err);
      }
    );

    return () => {
      unsubOrder();
      unsubStl();
    };
  }, [selectedOrderId]);

  const assignedAdminZone = useMemo(() => {
    if (serviceZones.length === 0) return null;
    if (myPhleboProfile?.assignedZoneId) {
      const byId = serviceZones.find((z) => z.id === myPhleboProfile.assignedZoneId);
      if (byId) return byId;
    }
    if (myPhleboProfile?.assignedZoneCode) {
      const codeUpper = myPhleboProfile.assignedZoneCode.trim().toUpperCase();
      const byCode = serviceZones.find((z) => z.zoneCode.trim().toUpperCase() === codeUpper);
      if (byCode) return byCode;
    }
    const assignedText = (
      myPhleboProfile?.assignedZoneName ||
      session?.profile.assignedZone ||
      ''
    )
      .trim()
      .toLowerCase();
    if (assignedText) {
      const byName = serviceZones.find(
        (z) =>
          z.name.trim().toLowerCase() === assignedText ||
          assignedText.includes(z.zoneCode.trim().toLowerCase()) ||
          assignedText.includes(z.name.trim().toLowerCase())
      );
      if (byName) return byName;
    }
    return null;
  }, [
    serviceZones,
    myPhleboProfile?.assignedZoneId,
    myPhleboProfile?.assignedZoneCode,
    myPhleboProfile?.assignedZoneName,
    session?.profile.assignedZone,
  ]);

  // Sync Admin-assigned zone label & initial base coordinates automatically
  useEffect(() => {
    const resolvedLabel = assignedAdminZone
      ? `${assignedAdminZone.zoneCode} • ${assignedAdminZone.name}`
      : myPhleboProfile?.assignedZoneName
        ? `${myPhleboProfile.assignedZoneCode ? `${myPhleboProfile.assignedZoneCode} • ` : ''
        }${myPhleboProfile.assignedZoneName}`
        : myPhleboProfile?.currentLocation ||
        (zonesLoaded ? 'Zone Pending (Admin)' : 'Syncing Admin Zone...');

    setGpsSourceLabel(resolvedLabel);

    if (manualLiveGpsSyncedRef.current) return;

    if (
      typeof myPhleboProfile?.latitude === 'number' &&
      typeof myPhleboProfile?.longitude === 'number'
    ) {
      setRiderLocation({
        latitude: myPhleboProfile.latitude,
        longitude: myPhleboProfile.longitude,
        updatedAt: myPhleboProfile.updatedAt || new Date().toISOString(),
      });
    } else if (assignedAdminZone) {
      setRiderLocation({
        latitude: assignedAdminZone.centerLatitude,
        longitude: assignedAdminZone.centerLongitude,
        updatedAt: assignedAdminZone.updatedAt || new Date().toISOString(),
      });
    }
  }, [
    assignedAdminZone,
    myPhleboProfile?.assignedZoneCode,
    myPhleboProfile?.assignedZoneName,
    myPhleboProfile?.currentLocation,
    myPhleboProfile?.latitude,
    myPhleboProfile?.longitude,
    myPhleboProfile?.updatedAt,
    zonesLoaded,
  ]);

  // Real-time GPS watch while On Duty (Native Android/iOS + Web)
  useEffect(() => {
    if (!session || !isOnline) return;

    let isCancelled = false;
    let nativeWatchSub: Location.LocationSubscription | null = null;
    let webWatchId: number | null = null;

    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        webWatchId = navigator.geolocation.watchPosition(
          (pos) => {
            if (isCancelled) return;
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
            setGpsSourceLabel('Device GPS Live');
          },
          () => {
            // Keep manual / profile coordinates gracefully if GPS denied
          },
          { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
        );
      }
    } else {
      // Native Android / iOS Device GPS
      void (async () => {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted' || isCancelled) return;

          // 1. Immediate position fix
          const instant = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }).catch(() => null);

          if (instant?.coords && !isCancelled) {
            setRiderLocation({
              latitude: Number(instant.coords.latitude.toFixed(5)),
              longitude: Number(instant.coords.longitude.toFixed(5)),
              speedKmph:
                typeof instant.coords.speed === 'number' && instant.coords.speed >= 0
                  ? Math.round(instant.coords.speed * 3.6)
                  : undefined,
              accuracyMeters: Math.round(instant.coords.accuracy || 0),
              updatedAt: new Date().toISOString(),
            });
            setGpsSourceLabel('Device GPS Live');
          }

          // 2. Continuous position watch
          nativeWatchSub = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: 4000,
              distanceInterval: 5,
            },
            (loc) => {
              if (isCancelled || !loc?.coords) return;
              setRiderLocation({
                latitude: Number(loc.coords.latitude.toFixed(5)),
                longitude: Number(loc.coords.longitude.toFixed(5)),
                speedKmph:
                  typeof loc.coords.speed === 'number' && loc.coords.speed >= 0
                    ? Math.round(loc.coords.speed * 3.6)
                    : undefined,
                accuracyMeters: Math.round(loc.coords.accuracy || 0),
                updatedAt: new Date().toISOString(),
              });
              setGpsSourceLabel('Device GPS Live');
            }
          );
        } catch (err) {
          console.warn('Native GPS watcher error:', err);
        }
      })();
    }

    return () => {
      isCancelled = true;
      if (webWatchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(webWatchId);
      }
      if (nativeWatchSub) {
        nativeWatchSub.remove();
      }
    };
  }, [session, isOnline]);

  // Reverse geocode rider location to full proper address (never show raw coordinates)
  useEffect(() => {
    let active = true;
    const resolveAddr = async () => {
      if (assignedAdminZone?.name) {
        setRiderFullAddress(`${assignedAdminZone.name}, ${assignedAdminZone.city || 'Diagnostic Zone'}`);
      }
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${riderLocation.latitude}&lon=${riderLocation.longitude}&format=json&addressdetails=1`,
          { headers: { 'Accept-Language': 'en' } }
        );
        if (res.ok && active) {
          const data = await res.json();
          if (data?.address) {
            const a = data.address;
            const parts = [
              a.suburb || a.neighbourhood || a.road,
              a.city || a.town || a.county,
              a.state,
              a.postcode ? `PIN: ${a.postcode}` : '',
            ].filter(Boolean);
            if (parts.length > 0) {
              setRiderFullAddress(parts.join(', '));
            }
          }
        }
      } catch {
        // Fallback to zone
      }
    };
    void resolveAddr();
    return () => {
      active = false;
    };
  }, [riderLocation.latitude, riderLocation.longitude, assignedAdminZone]);

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

  // Register Web Service Worker & native background location tracking while On Duty
  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
      void navigator.serviceWorker.register('/sw.js').catch(() => { });

      const onSwMessage = (event: MessageEvent) => {
        const data = event.data as { type?: string; orderId?: string } | undefined;
        if (data?.type === 'OPEN_BROADCAST_ORDER') {
          if (data.orderId) {
            setDismissedBroadcastIds((prev) => prev.filter((id) => id !== data.orderId));
          }
          setBroadcastForceOpen(true);
          setBottomTab('home');
          setSelectedOrderId(null);
          setCurrentScreen('BOOKING_REQUESTS');
          setRequestTab('new');
        }
      };

      navigator.serviceWorker.addEventListener('message', onSwMessage);
      return () => {
        navigator.serviceWorker.removeEventListener('message', onSwMessage);
      };
    }

    activeBgLocationSink = (lat, lng, speedKmph, accuracyMeters) => {
      setRiderLocation({
        latitude: Number(lat.toFixed(5)),
        longitude: Number(lng.toFixed(5)),
        speedKmph,
        accuracyMeters,
        updatedAt: new Date().toISOString(),
      });
      setGpsSourceLabel('GPS Live (Background)');
    };

    let cancelled = false;
    const syncNativeBgTracking = async () => {
      try {
        const started = await Location.hasStartedLocationUpdatesAsync(PHLEBO_BG_LOCATION_TASK);
        if (!session || !isOnline) {
          if (started) {
            await Location.stopLocationUpdatesAsync(PHLEBO_BG_LOCATION_TASK);
          }
          return;
        }
        const fg = await Location.requestForegroundPermissionsAsync();
        if (fg.status !== 'granted' || cancelled) return;
        await Location.requestBackgroundPermissionsAsync().catch(() => { });
        if (cancelled) return;
        const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(
          PHLEBO_BG_LOCATION_TASK
        );
        if (!alreadyStarted) {
          await Location.startLocationUpdatesAsync(PHLEBO_BG_LOCATION_TASK, {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 15000,
            distanceInterval: 25,
            foregroundService: {
              notificationTitle: 'LabSetu Partner • On Duty',
              notificationBody: 'Live 1–5 km pickup radar active for sample bookings.',
              notificationColor: '#0F766E',
            },
          });
        }
      } catch {
        // Ignore if native background permission is restricted on emulator/device
      }
    };

    void syncNativeBgTracking();

    return () => {
      cancelled = true;
      activeBgLocationSink = null;
      void Location.hasStartedLocationUpdatesAsync(PHLEBO_BG_LOCATION_TASK)
        .then((running) => (running ? Location.stopLocationUpdatesAsync(PHLEBO_BG_LOCATION_TASK) : undefined))
        .catch(() => { });
    };
  }, [session, isOnline]);

  // Check and sync real Android system overlay permission
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const checkOverlayPerm = async () => {
      try {
        const env = await getOverlayEnvironmentInfo();
        setHasOverlayPermission(env.canDrawOverlays);
      } catch {
        // ignore
      }
    };
    void checkOverlayPerm();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void checkOverlayPerm();
      }
    });
    return () => sub.remove();
  }, [session]);

  async function handleRequestBackgroundAlertPermission() {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        setWebNotifPerm('unsupported');
        showToast({
          variant: 'WARNING',
          title: 'Browser Notifications Unavailable',
          subtitle: 'In-app toast alerts and floating radar popup remain active while open.',
        });
        return;
      }
      try {
        const perm = await window.Notification.requestPermission();
        setWebNotifPerm(perm);
        if (perm === 'granted') {
          showToast({
            variant: 'SUCCESS',
            title: 'Background Pickup Alerts Enabled',
            subtitle: 'You will get pickup alerts even when this window is minimized.',
          });
        } else {
          showToast({
            variant: 'WARNING',
            title: 'Browser Alerts Blocked',
            subtitle: 'Allow notifications in browser settings to receive background pickup popups.',
          });
        }
      } catch {
        showToast({
          variant: 'WARNING',
          title: 'Permission Prompt Dismissed',
          subtitle: 'You can re-enable browser pickup notifications from site settings.',
        });
      }
      return;
    }

    try {
      await ensureDutyNotificationChannel();
      await Notifications.requestPermissionsAsync();
      if (Platform.OS === 'android') {
        const env = await getOverlayEnvironmentInfo();
        setHasOverlayPermission(env.canDrawOverlays);
        if (!env.canDrawOverlays) {
          showDynamicAlert({
            variant: 'info',
            title: 'Enable Floating System Icon',
            message:
              'Allow "Display over other apps" in Android settings so the LabSetu floating bubble stays visible over Google Maps, WhatsApp, and your phone home screen.',
            confirmLabel: 'Open Permission Settings',
            cancelLabel: 'Later',
            onConfirm: () => {
              void openSystemOverlayPermissionSettings();
            },
          });
        } else {
          showToast({
            variant: 'SUCCESS',
            title: 'System Floating Icon Active',
            subtitle: 'The LabSetu floating bubble is active across all apps and home screen.',
          });
        }
      }
    } catch {
      // Ignore unsupported simulator prompt error
    }
  }

  // Camera status text synchronization when Camera Modal is opened
  useEffect(() => {
    if (!cameraModal) return;
    if (cameraModal.mode === 'PHOTO') {
      setCameraStatusText('Center all specimen vials clearly and tap Capture Photo.');
    } else {
      setCameraStatusText('Align specimen tube barcode within frame to scan.');
    }
  }, [cameraModal]);

  const defaultBroadcastKm = Math.min(
    50,
    Math.max(15, assignedAdminZone?.radiusKm || commissionConfig.defaultBroadcastRadiusKm || 15)
  );

  // Open pool orders annotated with live Haversine distance from rider & Admin zone radar match
  const openPoolWithDistance = useMemo<OpenPoolEntry[]>(() => {
    return openPoolOrders
      .map((order) => {
        const hasOrderCoords =
          typeof order.pickupLocation?.latitude === 'number' &&
          typeof order.pickupLocation?.longitude === 'number' &&
          (Math.abs(order.pickupLocation.latitude) > 0.01 || Math.abs(order.pickupLocation.longitude) > 0.01);

        const distFromRiderKm = hasOrderCoords
          ? calculateHaversineDistanceKm(
            riderLocation.latitude,
            riderLocation.longitude,
            order.pickupLocation.latitude,
            order.pickupLocation.longitude
          )
          : 0;

        const maxRadiusKm = Math.max(order.broadcastRadiusKm || 0, defaultBroadcastKm, 25);

        // Fallback checks: If rider is in the same zone or pincode matches, consider in radius
        const isPinMatch = Boolean(
          order.pickupLocation?.pincode &&
          assignedAdminZone?.pincodes?.includes(order.pickupLocation.pincode)
        );
        const isZoneMatch = Boolean(
          order.serviceZoneId &&
          (order.serviceZoneId === assignedAdminZone?.id || order.serviceZoneId === 'ZONE-PILOT-EXPANSION')
        );

        const inBroadcastRadius = !hasOrderCoords || distFromRiderKm <= maxRadiusKm || isPinMatch || isZoneMatch;

        return {
          order,
          distFromRiderKm: Number(distFromRiderKm.toFixed(1)),
          inBroadcastRadius,
          maxRadiusKm,
        };
      })
      .sort((a, b) => (a.distFromRiderKm ?? 999) - (b.distFromRiderKm ?? 999));
  }, [openPoolOrders, riderLocation.latitude, riderLocation.longitude, defaultBroadcastKm, assignedAdminZone]);

  const riderCoverage = useMemo(
    () =>
      evaluatePointServiceCoverage(
        serviceZones,
        riderLocation.latitude,
        riderLocation.longitude
      ),
    [serviceZones, riderLocation.latitude, riderLocation.longitude]
  );

  // Real-time incoming 1-5km pickup alert watcher (Direct Screen Alert + Continuous Ringing + Background Push)
  useEffect(() => {
    const currentPoolIds = new Set([
      ...openPoolWithDistance.map((x) => x.order.id),
      ...activeAssignedOrders.filter((o) => o.status === OrderStatus.ASSIGNED_TO_PHLEBO).map((o) => o.id),
    ]);

    // 1. Immediate sound & modal suppression if the active ringing pickup was claimed by another rider, cancelled, or expired
    if (activeRingingOrderIdRef.current && !currentPoolIds.has(activeRingingOrderIdRef.current)) {
      const vanishedId = activeRingingOrderIdRef.current;
      activeRingingOrderIdRef.current = null;
      stopContinuousPickupAlert();
      void dismissIncomingPickupOverlay();
      setBroadcastForceOpen(false);

      const targetOrder = orders.find((o) => o.id === vanishedId);
      const isExpired = targetOrder?.broadcastExpiresAt
        ? new Date(targetOrder.broadcastExpiresAt).getTime() <= Date.now()
        : targetOrder?.createdAt
          ? Date.now() - new Date(targetOrder.createdAt).getTime() >= 45000
          : false;

      if (isExpired) {
        showToast({
          variant: 'INFO',
          title: 'Dispatch Window Ended',
          subtitle: `Pickup request ${vanishedId} dispatch window ended.`,
        });
      } else {
        showToast({
          variant: 'INFO',
          title: 'Pickup Claimed by Another Courier',
          subtitle: `Booking ${vanishedId} was accepted by another rider. Alert dismissed.`,
        });
      }
    }

    for (const seenId of Array.from(alertedBroadcastIdsRef.current)) {
      if (!currentPoolIds.has(seenId)) {
        alertedBroadcastIdsRef.current.delete(seenId);
        seenHikeMapRef.current.delete(seenId);
        seenRetryMapRef.current.delete(seenId);
        seenUpdatedMapRef.current.delete(seenId);
      }
    }

    if (!session || !isOnline) return;

    // Strict Single-Task Exclusivity:
    // If the phlebotomist already has an active ongoing task (assigned, picked up, or in transit),
    // they MUST NOT receive any incoming booking alerts, sound chimes, notifications, or overlays!
    // As soon as drop/delivery is confirmed in the system, activeAssignedOrders becomes 0 and alerts resume immediately.
    if (activeAssignedOrders.length > 0) {
      if (activeRingingOrderIdRef.current) {
        activeRingingOrderIdRef.current = null;
        stopContinuousPickupAlert();
        void dismissIncomingPickupOverlay();
        setBroadcastForceOpen(false);
      }
      return;
    }

    const nearby = openPoolWithDistance.filter((x) => x.inBroadcastRadius);

    // Also include direct assigned orders awaiting acceptance
    const unacknowledgedAssigned = activeAssignedOrders
      .filter((o) => o.status === OrderStatus.ASSIGNED_TO_PHLEBO)
      .map((order) => ({
        order,
        distFromRiderKm: calculateHaversineDistanceKm(
          riderLocation.latitude,
          riderLocation.longitude,
          order.pickupLocation?.latitude ?? riderLocation.latitude,
          order.pickupLocation?.longitude ?? riderLocation.longitude
        ),
        inBroadcastRadius: true,
        maxRadiusKm: 50,
      }));

    const allCandidates = [...nearby, ...unacknowledgedAssigned];

    // 2. Price Hike or Search Retry detection: if lab bumped incentive, retried search, or updated order, re-arm alert
    for (const x of allCandidates) {
      const oId = x.order.id;
      const prevHike = seenHikeMapRef.current.get(oId) ?? 0;
      const currHike = x.order.surgeIncentiveInr ?? 0;
      const prevRetry = seenRetryMapRef.current.get(oId) ?? 0;
      const currRetry = x.order.searchRetryCount ?? 0;
      const prevUpdated = seenUpdatedMapRef.current.get(oId) ?? 0;
      const currUpdated = x.order.updatedAt ? new Date(x.order.updatedAt).getTime() : 0;

      if (
        currHike > prevHike ||
        currRetry > prevRetry ||
        (currUpdated > prevUpdated && Date.now() - currUpdated < 90000)
      ) {
        alertedBroadcastIdsRef.current.delete(oId);
        setDismissedBroadcastIds((prev) => prev.filter((id) => id !== oId));
        setDeclinedOrderIds((prev) => prev.filter((id) => id !== oId));
        seenHikeMapRef.current.set(oId, currHike);
        seenRetryMapRef.current.set(oId, currRetry);
        seenUpdatedMapRef.current.set(oId, currUpdated);
      }
    }

    const newlyArrived = allCandidates.filter(
      (x) =>
        !alertedBroadcastIdsRef.current.has(x.order.id) &&
        !declinedOrderIds.includes(x.order.id) &&
        (!effectivePhleboId || !x.order.declinedPhleboIds?.includes(effectivePhleboId))
    );
    if (newlyArrived.length === 0) return;

    newlyArrived.forEach((x) => {
      alertedBroadcastIdsRef.current.add(x.order.id);
      seenHikeMapRef.current.set(x.order.id, x.order.surgeIncentiveInr ?? 0);
      seenRetryMapRef.current.set(x.order.id, x.order.searchRetryCount ?? 0);
      seenUpdatedMapRef.current.set(
        x.order.id,
        x.order.updatedAt ? new Date(x.order.updatedAt).getTime() : Date.now()
      );
    });
    const lead = newlyArrived[0];
    activeRingingOrderIdRef.current = lead.order.id;

    // Continuous alert chime & device vibration (45-second window matching lab radar timeout)
    startContinuousPickupAlert(45);
    setBroadcastForceOpen(true);
    setRequestTab('new');

    const basePay = lead.order.baseCourierFeeInr || (lead.order.courierFeeInr ? (lead.order.courierFeeInr - (lead.order.surgeIncentiveInr || 0)) : 100);
    const payoutLabel = lead.order.surgeIncentiveInr
      ? `Earn ${formatInr(lead.order.courierFeeInr || 100)} (${formatInr(basePay)} + ₹${lead.order.surgeIncentiveInr} Surge)`
      : `Earn ${formatInr(lead.order.courierFeeInr || 100)}`;

    // Trigger outside-app floating pickup modal over other apps (Rapido style)
    void triggerIncomingPickupOverlay({
      orderId: lead.order.id,
      orderNumber: lead.order.orderNumber || lead.order.id,
      pickupLab: lead.order.smallLabName || 'Pickup Lab',
      pickupAddress:
        lead.order.pickupLocation?.address ||
        lead.order.pickupLocation?.pincode ||
        'Sample Collection Address',
      targetLab: lead.order.targetLabName || 'Testing Lab',
      targetAddress:
        lead.order.deliveryLocation?.address ||
        lead.order.targetLabName ||
        'Testing Reference Lab',
      distance: `${lead.distFromRiderKm} km away`,
      payout: payoutLabel,
      specimens: `${lead.order.specimens?.length || 1} Specimens • Sample Collection`,
      timeoutSec: 45,
      surgeIncentive: lead.order.surgeIncentiveInr || 0,
    });

    showToast({
      variant: 'ALERT',
      title:
        lead.order.surgeIncentiveInr
          ? `⚡ SURGE +₹${lead.order.surgeIncentiveInr} ADD-ON: ${lead.order.orderNumber}`
          : newlyArrived.length > 1
            ? `⚡ ${newlyArrived.length} Live Sample Pickups Nearby`
            : `⚡ Pickup Request ${lead.distFromRiderKm} km Away • ${lead.order.orderNumber}`,
      subtitle: `${lead.order.smallLabName} → ${lead.order.targetLabName} • ${payoutLabel}`,
      actionLabel: 'Open Popup',
      onAction: () => {
        stopContinuousPickupAlert();
        void dismissIncomingPickupOverlay();
        setDismissedBroadcastIds((prev) => prev.filter((id) => id !== lead.order.id));
        setBroadcastForceOpen(true);
        setBottomTab('home');
        setSelectedOrderId(null);
        setCurrentScreen('BOOKING_REQUESTS');
        setRequestTab('new');
      },
    });

    const notifTitle = lead.order.surgeIncentiveInr
      ? `⚡ SURGE +₹${lead.order.surgeIncentiveInr} PICKUP • ${lead.order.orderNumber}`
      : `⚡ INSTANT PICKUP DISPATCH • ${lead.order.orderNumber}`;
    const notifBody = `${lead.order.smallLabName} (${lead.distFromRiderKm} km away) → ${lead.order.targetLabName} • ${payoutLabel}`;

    if (Platform.OS === 'web') {
      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        window.Notification.permission === 'granted'
      ) {
        if ('serviceWorker' in navigator) {
          void navigator.serviceWorker
            .getRegistration()
            .then((reg) => {
              const targetWorker = navigator.serviceWorker.controller || reg?.active;
              if (targetWorker) {
                targetWorker.postMessage({
                  type: 'SHOW_PICKUP_NOTIFICATION',
                  title: notifTitle,
                  body: notifBody,
                  tag: `pickup-${lead.order.id}`,
                  orderId: lead.order.id,
                });
                return;
              }
              const nativeNotice = new window.Notification(notifTitle, {
                body: notifBody,
                tag: `pickup-${lead.order.id}`,
              });
              nativeNotice.onclick = () => {
                window.focus();
                stopContinuousPickupAlert();
                void dismissIncomingPickupOverlay();
                setDismissedBroadcastIds((prev) => prev.filter((id) => id !== lead.order.id));
                setBroadcastForceOpen(true);
              };
            })
            .catch(() => { });
        } else {
          const nativeNotice = new window.Notification(notifTitle, {
            body: notifBody,
            tag: `pickup-${lead.order.id}`,
          });
          nativeNotice.onclick = () => {
            window.focus();
            stopContinuousPickupAlert();
            void dismissIncomingPickupOverlay();
            setDismissedBroadcastIds((prev) => prev.filter((id) => id !== lead.order.id));
            setBroadcastForceOpen(true);
          };
        }
      }
      return;
    }

    void Notifications.scheduleNotificationAsync({
      content: {
        title: notifTitle,
        body: notifBody,
        data: { orderId: lead.order.id, action: 'OPEN_ORDER' },
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
        vibrate: [0, 800, 300, 800, 300, 800],
        color: '#0D9488',
      },
      trigger: Platform.OS === 'android' ? { channelId: URGENT_DISPATCH_CHANNEL_ID } : null,
    }).catch((err) => {
      console.warn('Urgent pickup notification schedule failed:', err);
    });
  }, [session, isOnline, effectivePhleboId, openPoolWithDistance, declinedOrderIds, showToast]);

  // Handle tapping sticky duty notification or pickup alert to jump straight into Quick Radar
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | { orderId?: string; action?: string }
        | undefined;
      stopContinuousPickupAlert();
      void dismissIncomingPickupOverlay();
      if (data?.orderId) {
        // Tapping the notification in the Android system tray opens the app and displays the order modal for review
        setDismissedBroadcastIds((prev) => prev.filter((id) => id !== data.orderId));
        setBroadcastForceOpen(true);
        setBottomTab('home');
        setSelectedOrderId(null);
        setCurrentScreen('BOOKING_REQUESTS');
        setRequestTab('new');
      } else if (data?.action === 'OPEN_RADAR') {
        setBottomTab('home');
        setSelectedOrderId(null);
        setCurrentScreen('BOOKING_REQUESTS');
      } else if (data?.action === 'OPEN_COLLECTIONS') {
        setBottomTab('home');
        setCurrentScreen('TODAYS_COLLECTIONS');
      } else if (data?.action === 'OPEN_NOTIF') {
        setShowNotificationsModal(true);
      }
    });
    return () => {
      sub.remove();
    };
  }, [openPoolWithDistance]);

  // Listen to Outside-App Floating Modal Actions (ACCEPT / DECLINE)
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const sub = DeviceEventEmitter.addListener(
      'onIncomingOrderAction',
      (event: { action?: string; orderId?: string }) => {
        stopContinuousPickupAlert();
        void dismissIncomingPickupOverlay();

        if (event?.action === 'ACCEPT' && event.orderId) {
          const target = openPoolWithDistance.find((x) => x.order.id === event.orderId);
          if (target) {
            void handleAcceptPoolOrder(target.order);
          } else {
            const found = orders.find((x) => x.id === event.orderId);
            if (found) {
              void handleAcceptPoolOrder(found);
            }
          }
        } else if (event?.action === 'DECLINE' && event.orderId) {
          void handleDeclineOrder(event.orderId);
        }
      }
    );

    // Also check if an action was queued before JS context was ready
    void getPendingIncomingOrderAction().then((pending) => {
      if (pending?.action === 'ACCEPT' && pending.orderId) {
        stopContinuousPickupAlert();
        void dismissIncomingPickupOverlay();
        const target = openPoolWithDistance.find((x) => x.order.id === pending.orderId);
        if (target) {
          void handleAcceptPoolOrder(target.order);
        } else {
          const found = orders.find((x) => x.id === pending.orderId);
          if (found) {
            void handleAcceptPoolOrder(found);
          }
        }
      } else if (pending?.action === 'DECLINE' && pending.orderId) {
        void handleDeclineOrder(pending.orderId);
      }
    });

    return () => {
      sub.remove();
    };
  }, [openPoolWithDistance, orders, handleDeclineOrder]);

  // Listen to Outside-App Floating Quick Action Menu Duty Status Toggles
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const sub = DeviceEventEmitter.addListener(
      'onOverlayDutyChange',
      (event: { dutyStatus?: 'ONLINE' | 'OFFLINE' | 'BREAK' }) => {
        const next = event?.dutyStatus;
        if (next === 'ONLINE' || next === 'OFFLINE' || next === 'BREAK') {
          void handleShiftUpdate(next);
          showToast({
            variant: next === 'ONLINE' ? 'SUCCESS' : next === 'BREAK' ? 'WARNING' : 'INFO',
            title:
              next === 'ONLINE'
                ? '🟢 Shift Set to Online'
                : next === 'BREAK'
                  ? '☕ Shift Set to Break'
                  : '⚪ Shift Set to Offline',
            subtitle: 'Duty status updated from outside-app floating quick menu.',
          });
        }
      }
    );
    return () => {
      sub.remove();
    };
  }, [handleShiftUpdate, showToast]);

  // Handle deep link actions from System-Level Native Floating Menu
  useEffect(() => {
    const handleDeepLink = (url?: string | null) => {
      if (!url) return;
      if (url.includes('open-collections') || url.includes('OPEN_COLLECTIONS')) {
        setBottomTab('tasks');
        setCurrentScreen('TODAYS_COLLECTIONS');
      } else if (url.includes('open-requests') || url.includes('OPEN_REQUESTS')) {
        setBottomTab('home');
        setRequestTab('new');
        setCurrentScreen('BOOKING_REQUESTS');
      } else if (url.includes('open-history') || url.includes('OPEN_HISTORY')) {
        setBottomTab('earnings');
        setCurrentScreen('BOOKING_REQUESTS');
      } else if (url.includes('open-support') || url.includes('OPEN_SUPPORT')) {
        setBottomTab('home');
        setCurrentScreen('HELP_AND_SUPPORT');
      } else if (url.includes('open-home') || url.includes('OPEN_HOME')) {
        setBottomTab('home');
        setCurrentScreen('BOOKING_REQUESTS');
      }
    };

    void Linking.getInitialURL().then(handleDeepLink);
    const sub = Linking.addEventListener('url', (e) => handleDeepLink(e.url));
    return () => {
      sub.remove();
    };
  }, []);

  const activeBroadcastMatch = useMemo(() => {
    if (
      !session ||
      !isOnline ||
      !effectivePhleboId ||
      submittingAction ||
      Boolean(cameraModal) ||
      Boolean(activePaymentLink) ||
      showLocationPickerModal ||
      alertState.isOpen ||
      activeAssignedOrders.length > 0 // Strict Single-Task Exclusivity: never show broadcast modal if courier has an active delivery
    ) {
      return null;
    }

    const midTaskOnHome =
      bottomTab === 'home' &&
      (currentScreen === 'COLLECT_SAMPLE' || currentScreen === 'DROP_SAMPLE');

    if (midTaskOnHome && !broadcastForceOpen) {
      return null;
    }

    const undismissed = openPoolWithDistance.find(
      (x) =>
        x.inBroadcastRadius &&
        !dismissedBroadcastIds.includes(x.order.id) &&
        !declinedOrderIds.includes(x.order.id) &&
        !x.order.declinedPhleboIds?.includes(effectivePhleboId)
    );
    if (undismissed) return undismissed;

    if (broadcastForceOpen) {
      return (
        openPoolWithDistance.find(
          (x) =>
            x.inBroadcastRadius &&
            !declinedOrderIds.includes(x.order.id) &&
            !x.order.declinedPhleboIds?.includes(effectivePhleboId)
        ) || null
      );
    }

    return null;
  }, [
    session,
    isOnline,
    effectivePhleboId,
    submittingAction,
    cameraModal,
    activePaymentLink,
    showLocationPickerModal,
    alertState.isOpen,
    bottomTab,
    currentScreen,
    broadcastForceOpen,
    openPoolWithDistance,
    dismissedBroadcastIds,
    declinedOrderIds,
  ]);

  // Merge live settlements & payouts with handled orders for accurate earnings computation
  const earningRows = useMemo<EarningRow[]>(() => {
    const stlMap = new Map(settlements.map((s) => [s.orderId, s]));
    const payoutMap = new Map(payouts.map((p) => [p.orderId, p]));
    return myAssignedOrders
      .filter((o) => o.status !== OrderStatus.CANCELLED && o.status !== OrderStatus.REJECTED)
      .map((order) => {
        const stl =
          stlMap.get(order.id) ||
          stlMap.get(order.orderNumber) ||
          settlements.find((s) => s.orderId === order.id || s.orderNumber === order.orderNumber);
        const payout =
          payoutMap.get(order.id) ||
          payoutMap.get(order.orderNumber) ||
          payouts.find((p) => p.orderId === order.id || p.orderNumber === order.orderNumber);
        const amountInr = stl?.phleboPayoutInr ?? payout?.amountInr ?? order.courierFeeInr ?? 0;
        const customerPaid =
          order.paymentStatus === 'PAID' ||
          stl?.paymentStatus === 'PAID' ||
          order.paymentMethod === 'CASH' ||
          order.paymentMethod === 'DIRECT_LAB_SETTLEMENT' ||
          order.collectedByRole === 'PHLEBOTOMIST';
        const settled =
          stl?.phleboPayoutStatus === 'PAID' ||
          stl?.status === 'SETTLED' ||
          order.paymentMethod === 'CASH' ||
          order.paymentMethod === 'DIRECT_LAB_SETTLEMENT' ||
          order.collectedByRole === 'PHLEBOTOMIST' ||
          customerPaid ||
          Boolean(payout);
        const payoutRef =
          stl?.phleboPayoutRef ||
          payout?.referenceId ||
          (order.paymentMethod === 'CASH' ? 'CASH' : undefined);
        const delivered =
          order.status === OrderStatus.DELIVERED_TO_LAB ||
          order.status === OrderStatus.UNDER_ANALYSIS ||
          isOrderCompleted(order.status);
        return { order, stl, payout, payoutRef, customerPaid, amountInr, settled, delivered };
      });
  }, [myAssignedOrders, settlements, payouts]);

  const isSameLocalDay = useCallback((iso: string | undefined, todayStr: string): boolean => {
    if (!iso) return false;
    const d = new Date(iso);
    return !Number.isNaN(d.getTime()) && d.toDateString() === todayStr;
  }, []);

  const todayOrders = useMemo(() => {
    const todayStr = new Date().toDateString();
    return myAssignedOrders.filter(
      (o) =>
        o.status !== OrderStatus.CANCELLED &&
        o.status !== OrderStatus.REJECTED &&
        (isSameLocalDay(o.scheduledPickupAt, todayStr) ||
          isSameLocalDay(o.updatedAt, todayStr) ||
          isSameLocalDay(o.createdAt, todayStr))
    );
  }, [myAssignedOrders, isSameLocalDay]);

  const todayPendingOrders = useMemo(
    () =>
      todayOrders.filter(
        (o) =>
          !o.actualDeliveredAt &&
          (o.status === OrderStatus.ASSIGNED_TO_PHLEBO ||
            o.status === OrderStatus.PICKED_UP ||
            o.status === OrderStatus.IN_TRANSIT)
      ),
    [todayOrders]
  );

  // Floating icon pending count strictly shows only active pending orders (assigned, collected, or in-transit tasks)
  const floatingPendingCount = useMemo(
    () => Math.max(activeAssignedOrders.length, todayPendingOrders.length),
    [activeAssignedOrders.length, todayPendingOrders.length]
  );

  useEffect(() => {
    void syncFloatingOverlayRuntime({
      signedIn: Boolean(session),
      settings: floatingSettings,
      isOnline,
      nearbyCount: floatingPendingCount,
      courierId: displayCourierId,
      appState,
    });
  }, [session, floatingSettings, isOnline, floatingPendingCount, displayCourierId, appState]);

  const metrics = useMemo<PhleboMetrics>(() => {
    const now = new Date();
    const todayStr = now.toDateString();
    const weekAgoMs = now.getTime() - 7 * 86400000;
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const todayEarnings = earningRows
      .filter((r) => isSameLocalDay(r.order.updatedAt || r.order.createdAt, todayStr) && r.delivered)
      .reduce((sum, r) => sum + r.amountInr, 0);

    const todayOrdersCount = todayOrders.length;

    const todayCompletedCount = todayOrders.filter(
      (o) =>
        o.status === OrderStatus.DELIVERED_TO_LAB ||
        o.status === OrderStatus.UNDER_ANALYSIS ||
        isOrderCompleted(o.status)
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
  }, [earningRows, myAssignedOrders, todayOrders, isSameLocalDay]);

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

  async function syncDeviceLiveGps(lat: number, lng: number) {
    const now = new Date().toISOString();
    const cleanLat = Number(lat.toFixed(5));
    const cleanLng = Number(lng.toFixed(5));
    const cov = evaluatePointServiceCoverage(serviceZones, cleanLat, cleanLng);

    manualLiveGpsSyncedRef.current = true;
    setRiderLocation({
      latitude: cleanLat,
      longitude: cleanLng,
      updatedAt: now,
    });
    setShowLocationPickerModal(false);

    showToast({
      variant: cov.covered ? 'INFO' : 'WARNING',
      title: '🛰️ Live Device GPS Synced',
      subtitle: assignedAdminZone
        ? `Admin Zone: ${assignedAdminZone.zoneCode} (${assignedAdminZone.name}) • Coordinates updated.`
        : cov.covered
          ? `Active Zone ${cov.matchedZone?.zoneCode || ''} • Pickup radar synced.`
          : cov.message,
    });

    if (effectivePhleboId) {
      try {
        await updateDoc(doc(db, 'phlebotomists', effectivePhleboId), {
          latitude: cleanLat,
          longitude: cleanLng,
          updatedAt: now,
        });
      } catch {
        // Best-effort GPS telemetry sync
      }
    }
  }

  function handleQuickScanBarcode(code: string) {
    setCameraModal(null);
    const trimmed = code.trim();
    if (!trimmed) return;

    // Check 1: Does it match an assigned order or open booking?
    const matchedOrder = orders.find(
      (o) =>
        o.orderNumber.toUpperCase() === trimmed.toUpperCase() ||
        o.id.toUpperCase() === trimmed.toUpperCase() ||
        (o.specimens || []).some((s) => (s.barcode || '').toUpperCase() === trimmed.toUpperCase())
    );

    if (matchedOrder) {
      setSelectedOrderId(matchedOrder.id);
      if (
        matchedOrder.status === OrderStatus.ASSIGNED_TO_PHLEBO ||
        matchedOrder.status === OrderStatus.READY_FOR_PICKUP
      ) {
        setCurrentScreen('COLLECT_SAMPLE');
      } else {
        setCurrentScreen('BOOKING_DETAILS');
      }
      showDynamicAlert({
        variant: 'success',
        title: 'Booking Identified',
        message: `Matched ${matchedOrder.orderNumber} for patient ${matchedOrder.patient.pseudonym}. Collection task opened.`,
      });
      return;
    }

    // Check 2: Pre-Assembled Kit Barcode (LS-KIT-XXXXXX)
    if (trimmed.toUpperCase().startsWith('LS-KIT') || trimmed.toUpperCase().includes('KIT')) {
      const kitAlloc = kitAllocations.find(
        (a) =>
          a.kitCode.toUpperCase() === trimmed.toUpperCase() ||
          a.id.toUpperCase() === trimmed.toUpperCase() ||
          a.kitName.toUpperCase().includes(trimmed.toUpperCase())
      );
      showDynamicAlert({
        variant: 'info',
        title: 'Pre-Assembled Kit Verified',
        message: `Kit Serial: ${trimmed}\nSealed Central Warehouse Assembly.\nAllocated to your phlebotomy bag for field collections.`,
        detail: kitAlloc
          ? `Kit Type: ${kitAlloc.kitName} (${kitAlloc.kitCode}) • On Hand: ${kitAlloc.quantityOnHand}`
          : 'Ready for use in upcoming sample collection.',
      });
      return;
    }

    // Check 3: Individual Specimen Tube Barcode (LS-TUBE-XXXXXX)
    if (trimmed.toUpperCase().startsWith('LS-TUBE') || trimmed.toUpperCase().includes('TUBE')) {
      showDynamicAlert({
        variant: 'info',
        title: 'Vacutainer Tube Serial Verified',
        message: `Serial: ${trimmed}\nUnique immutable LabSetu Tube tracking serial.`,
        detail: 'Tube is ready to be linked to test specimen collection.',
      });
      return;
    }

    // Check 4: General diagnostic barcode
    showDynamicAlert({
      variant: 'info',
      title: 'Diagnostic Barcode Scanned',
      message: `Scanned Code: ${trimmed}\nSymbology: Code 128 / QR Payload`,
      detail: 'Timestamp: ' + new Date().toLocaleTimeString('en-IN'),
    });
  }

  function updateSpecimenDraft(
    specimenId: string,
    patch: Partial<{ barcode: string; usedTube: TubeType }>
  ) {
    if (specimenId === 'QUICK_SCAN') {
      const code = (patch.barcode || '').trim();
      if (!code) return;
      handleQuickScanBarcode(code);
      return;
    }

    const curr = specimenDrafts[specimenId] || {
      barcode: '',
      usedTube: TubeType.SERUM_RED_GOLD,
    };
    const nextEntry = {
      barcode: patch.barcode !== undefined ? patch.barcode : curr.barcode,
      usedTube: patch.usedTube !== undefined ? patch.usedTube : curr.usedTube,
    };
    const nextDraftsMap = {
      ...specimenDrafts,
      [specimenId]: nextEntry,
    };
    setSpecimenDrafts(nextDraftsMap);

    const spec = selectedOrder?.specimens.find((s) => s.id === specimenId);
    if (spec && selectedOrder) {
      const siblingList = selectedOrder.specimens.map((s) => {
        const d = nextDraftsMap[s.id];
        return {
          ...s,
          scannedBarcode: d?.barcode?.trim() || '',
          scannedTubeType: d?.usedTube || s.tubeType,
        };
      });
      const res = validateTubeBarcodeScan({
        scannedBarcode: nextEntry.barcode,
        expectedSpecimen: spec,
        selectedTubeUsed: nextEntry.usedTube,
        siblingSpecimens: siblingList,
      });

      const prevStatus = lastBarcodeToastRef.current[specimenId];
      if (res.status === 'PENDING') {
        lastBarcodeToastRef.current[specimenId] = 'PENDING';
      } else if (res.status !== prevStatus) {
        lastBarcodeToastRef.current[specimenId] = res.status;
        if (res.status === 'VERIFIED') {
          showToast({
            variant: 'SUCCESS',
            title: `✓ Tube Matched • ${spec.testCode}`,
            subtitle: res.message,
          });
        } else if (res.status === 'MISMATCH') {
          showToast({
            variant: 'ALERT',
            title: `⚠ Tube / Barcode Mismatch • ${spec.testCode}`,
            subtitle: res.message,
          });
        }
      }
    }
  }

  async function handleTakePhotoProofWithCamera(orderId: string, target: 'SAMPLE' | 'SELFIE' = 'SELFIE') {
    setUploadingSelfie(true);
    setUploadingPhoto(true);

    try {
      const res = await captureSampleProofPhoto(
        orderId,
        (localUri) => {
          setSelfiePhotoUrl(localUri);
          setSamplePhotoUrl(localUri);
        },
        { captureMode: 'user', prefix: 'selfie' }
      );

      if (res.success && (res.photoUrl || res.localUri)) {
        const finalUrl = res.photoUrl || res.localUri || '';
        setSelfiePhotoUrl(finalUrl);
        setSamplePhotoUrl(finalUrl);

        if (res.photoUrl) {
          try {
            const now = new Date().toISOString();
            await updateDoc(doc(db, 'orders', orderId), {
              phleboSelfieUrl: res.photoUrl,
              phleboSelfieCapturedAt: now,
              sampleCollectionPhotoUrl: res.photoUrl,
              sampleProofCapturedAt: now,
            });
          } catch {
            // Non-fatal
          }
        }
        showToast({
          variant: 'SUCCESS',
          title: '🤳 Phlebo Photo Attached',
          subtitle: 'Phlebotomist attendance & presence photo saved.',
        });
      } else if (!res.canceled && res.error) {
        showDynamicAlert({
          variant: 'error',
          title: 'Camera Capture Failed',
          message: res.error,
        });
      }
    } catch (err) {
      showDynamicAlert({
        variant: 'error',
        title: 'Camera Error',
        message: (err as Error).message || 'Unable to open camera.',
      });
    } finally {
      setUploadingSelfie(false);
      setUploadingPhoto(false);
    }
  }

  async function handleUploadSamplePhotoFromFile(
    orderId: string,
    directFile?: unknown,
    target: 'SAMPLE' | 'SELFIE' = 'SAMPLE'
  ) {
    setUploadingSelfie(true);
    setUploadingPhoto(true);

    if (directFile && typeof directFile === 'object') {
      const file = directFile as File;
      try {
        if (typeof FileReader !== 'undefined') {
          const reader = new FileReader();
          reader.onload = () => {
            if (reader.result && typeof reader.result === 'string') {
              setSelfiePhotoUrl(reader.result);
              setSamplePhotoUrl(reader.result);
            }
          };
          reader.readAsDataURL(file);
        }
        const storagePath = `samples/${orderId}/selfie-${Date.now()}-${file.name || 'proof.jpg'}`;
        const url = await uploadPhleboSampleFile(storagePath, file);
        setSelfiePhotoUrl(url);
        setSamplePhotoUrl(url);
        try {
          const now = new Date().toISOString();
          await updateDoc(doc(db, 'orders', orderId), {
            phleboSelfieUrl: url,
            phleboSelfieCapturedAt: now,
            sampleCollectionPhotoUrl: url,
            sampleProofCapturedAt: now,
          });
        } catch {
          // Non-fatal
        }
        showToast({
          variant: 'SUCCESS',
          title: '🤳 Phlebo Photo Attached',
          subtitle: 'Phlebotomist attendance photo saved.',
        });
      } catch (err) {
        showDynamicAlert({
          variant: 'error',
          title: 'Photo Upload Failed',
          message: (err as Error).message || 'Could not upload photo.',
        });
      } finally {
        setUploadingSelfie(false);
        setUploadingPhoto(false);
      }
      return;
    }

    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      try {
        const res = await pickSampleProofFromLibrary(orderId, (localUri) => {
          setSelfiePhotoUrl(localUri);
          setSamplePhotoUrl(localUri);
        });
        if (res.success && (res.photoUrl || res.localUri)) {
          const finalUrl = res.photoUrl || res.localUri || '';
          setSelfiePhotoUrl(finalUrl);
          setSamplePhotoUrl(finalUrl);
          if (res.photoUrl) {
            try {
              const now = new Date().toISOString();
              await updateDoc(doc(db, 'orders', orderId), {
                phleboSelfieUrl: res.photoUrl,
                phleboSelfieCapturedAt: now,
                sampleCollectionPhotoUrl: res.photoUrl,
                sampleProofCapturedAt: now,
              });
            } catch {
              // Non-fatal
            }
          }
          showToast({
            variant: 'SUCCESS',
            title: '🤳 Phlebo Photo Uploaded',
            subtitle: 'Phlebotomist attendance photo attached successfully.',
          });
        } else if (!res.canceled && res.error) {
          showDynamicAlert({
            variant: 'error',
            title: 'File Selection Failed',
            message: res.error,
          });
        }
      } catch (err) {
        showDynamicAlert({
          variant: 'error',
          title: 'Photo Selection Error',
          message: (err as Error).message || 'Unable to open file library.',
        });
      } finally {
        setUploadingSelfie(false);
        setUploadingPhoto(false);
      }
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'user');
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      if (typeof FileReader !== 'undefined') {
        const reader = new FileReader();
        reader.onload = () => {
          if (reader.result && typeof reader.result === 'string') {
            setSelfiePhotoUrl(reader.result);
            setSamplePhotoUrl(reader.result);
          }
        };
        reader.readAsDataURL(file);
      }
      void (async () => {
        setUploadingSelfie(true);
        setUploadingPhoto(true);
        let finalUrl = '';
        try {
          const url = await uploadPhleboSampleFile(
            `samples/${orderId}/selfie-${Date.now()}-${file.name}`,
            file
          );
          if (url) {
            finalUrl = url;
            setSelfiePhotoUrl(url);
            setSamplePhotoUrl(url);
          }
        } catch (uploadErr) {
          console.warn('Direct storage upload failed, keeping local preview:', uploadErr);
        } finally {
          setUploadingSelfie(false);
          setUploadingPhoto(false);
        }

        if (finalUrl) {
          try {
            const now = new Date().toISOString();
            await updateDoc(doc(db, 'orders', orderId), {
              phleboSelfieUrl: finalUrl,
              phleboSelfieCapturedAt: now,
              sampleCollectionPhotoUrl: finalUrl,
              sampleProofCapturedAt: now,
            });
          } catch {
            // Non-fatal
          }
        }
        showToast({
          variant: 'SUCCESS',
          title: '🤳 Phlebo Photo Attached',
          subtitle: 'Phlebotomist attendance & presence photo attached.',
        });
      })();
    };
    input.click();
  }

  function handleCaptureSnapshotFromCam(orderId: string, photoUri?: string) {
    if (photoUri) {
      setSamplePhotoUrl(photoUri);
      setCameraModal(null);
      void (async () => {
        setUploadingPhoto(true);
        let finalUrl = photoUri;
        try {
          const resp = await fetch(photoUri);
          const blob = await resp.blob();
          const filename = `snap-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}.jpg`;
          const url = await uploadPhleboSampleFile(
            `samples/${orderId}/${filename}`,
            blob
          );
          if (url) {
            finalUrl = url;
            setSamplePhotoUrl(url);
          }
        } catch (uploadErr) {
          console.warn('Storage upload fallback to data URI:', uploadErr);
        } finally {
          setUploadingPhoto(false);
        }

        try {
          await updateDoc(doc(db, 'orders', orderId), {
            sampleCollectionPhotoUrl: finalUrl,
            sampleProofCapturedAt: new Date().toISOString(),
          });
        } catch {
          // Non-fatal
        }

        showToast({
          variant: 'SUCCESS',
          title: '📸 Sample Photo Captured',
          subtitle: 'Collection photo proof saved and linked to this trip.',
        });
      })();
      return;
    }
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      void handleTakePhotoProofWithCamera(orderId);
      return;
    }
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
    const dataUri = canvas.toDataURL('image/jpeg', 0.85);
    setSamplePhotoUrl(dataUri);
    setCameraModal(null);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        void (async () => {
          setUploadingPhoto(true);
          let finalUrl = dataUri;
          try {
            const url = await uploadPhleboSampleFile(
              `samples/${orderId}/snap-${Date.now()}.jpg`,
              blob
            );
            if (url) {
              finalUrl = url;
              setSamplePhotoUrl(url);
            }
          } catch (uploadErr) {
            console.warn('Cloud storage error, using base64 preview:', uploadErr);
          } finally {
            setUploadingPhoto(false);
          }

          try {
            await updateDoc(doc(db, 'orders', orderId), {
              sampleCollectionPhotoUrl: finalUrl,
              sampleProofCapturedAt: new Date().toISOString(),
            });
          } catch {
            // Non-fatal
          }

          showToast({
            variant: 'SUCCESS',
            title: '📸 Camera Photo Saved',
            subtitle: 'Sample collection proof image captured and uploaded.',
          });
        })();
      },
      'image/jpeg',
      0.86
    );
  }

  function openOrderWorkflow(
    order: PickupOrder,
    returnTo: 'BOOKING_REQUESTS' | 'TODAYS_COLLECTIONS' = 'BOOKING_REQUESTS'
  ) {
    lastBarcodeToastRef.current = {};
    setDetailsReturnScreen(returnTo);
    setSelectedOrderId(order.id);
    const nextDrafts: SpecimenDraftMap = {};
    for (const spec of order.specimens || []) {
      nextDrafts[spec.id] = {
        barcode: spec.scannedBarcode || '',
        usedTube: spec.scannedTubeType || spec.tubeType || TubeType.SERUM_RED_GOLD,
      };
    }
    setSpecimenDrafts(nextDrafts);
    setSamplePhotoUrl(order.sampleCollectionPhotoUrl || '');
    setSelfiePhotoUrl(order.phleboSelfieUrl || '');
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
    stopContinuousPickupAlert();
    void dismissIncomingPickupOverlay();
    if (!session?.firebaseUser) return;
    if (!effectivePhleboId) {
      showDynamicAlert({
        variant: 'warning',
        title: 'Courier Profile Needed',
        message: `Ask Platform Admin (${ADMIN_LOGIN_EMAIL}) to assign a Courier ID to ${phleboEmail} under Team & Partner Accounts.`,
      });
      return;
    }

    // Strict Single-Task Exclusivity Guard
    if (activeAssignedOrders.length > 0) {
      showDynamicAlert({
        variant: 'warning',
        title: 'Active Task in Progress',
        message:
          'You already have an active collection/delivery task. Please complete and drop your current sample before accepting a new pickup.',
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
        notes: `Accepted live broadcast by ${phleboName} (${displayCourierId})`,
      };

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

      // Synchronously link courier to settlement record so payouts and ledger sync
      try {
        const stlId = `STL-${order.orderNumber.replace('BK-', '')}`;
        await setDoc(doc(db, 'settlements', stlId), {
          phlebotomistId: effectivePhleboId,
          phlebotomistName: phleboName,
          updatedAt: now,
        }, { merge: true });
      } catch {
        // Non-fatal fallback
      }

      await addDoc(collection(db, 'custody_events'), evt);

      await addDoc(collection(db, 'notifications'), {
        title: `Rider Assigned: ${order.orderNumber}`,
        message: `${phleboName} (${displayCourierId}) accepted pickup at ${order.smallLabName} — live GPS enabled.`,
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
          message: `${phleboName} (${displayCourierId}) claimed pickup from ${order.smallLabName} -> ${order.targetLabName}.`,
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

      setBroadcastForceOpen(false);
      setBottomTab('home');
      openOrderWorkflow({
        ...order,
        phlebotomistId: effectivePhleboId,
        phlebotomistName: phleboName,
        status: OrderStatus.ASSIGNED_TO_PHLEBO,
      });
      showToast({
        variant: 'SUCCESS',
        title: `⚡ Pickup Claimed • ${order.orderNumber}`,
        subtitle: `Head to ${order.smallLabName}. Earn ${formatInr(order.courierFeeInr || 0)} on delivery.`,
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
            showToast({
              variant: 'INFO',
              title: `Booking Released • ${order.orderNumber}`,
              subtitle: 'Returned to the Open Dispatch Pool for nearby riders.',
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

    let verifiedSpecimens: SpecimenItem[] = [];

    if (platformFeatures.enableBarcodeScanner) {
      const siblingList = order.specimens.map((s) => {
        const draft = specimenDrafts[s.id];
        return {
          ...s,
          scannedBarcode: draft?.barcode?.trim() || '',
          scannedTubeType: draft?.usedTube || s.tubeType,
        };
      });

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
    } else {
      verifiedSpecimens = order.specimens.map((s) => ({
        ...s,
        scannedBarcode: s.scannedBarcode || '',
        scannedTubeType: s.tubeType || TubeType.SERUM_RED_GOLD,
        validationStatus: 'VERIFIED',
        collectedAt: new Date().toISOString(),
      }));
    }

    const finalPhoto = selfiePhotoUrl.trim() || samplePhotoUrl.trim();
    if (!finalPhoto) {
      showDynamicAlert({
        variant: 'warning',
        title: 'Phlebotomist Photo Required',
        message: 'Take a quick photo or selfie of the phlebotomist at the collection site before confirming collection.',
      });
      return;
    }

    const finalTemp = Number.isNaN(numericTemp) ? 4.0 : numericTemp;

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
        temperatureCelsius: finalTemp,
        notes: platformFeatures.enableBarcodeScanner
          ? `All ${verifiedSpecimens.length} tubes barcode-verified (${barcodeSummary}) + phlebo photo proof verified at ${finalTemp}°C by ${phleboName}`
          : `Collected ${verifiedSpecimens.length} specimen tubes + phlebo photo proof at ${finalTemp}°C by ${phleboName}`,
      };

      await updateDoc(doc(db, 'orders', order.id), {
        status: OrderStatus.PICKED_UP,
        specimens: verifiedSpecimens,
        sampleCollectionPhotoUrl: finalPhoto,
        phleboSelfieUrl: finalPhoto,
        phleboLiveLocation: {
          latitude: riderLocation.latitude,
          longitude: riderLocation.longitude,
          updatedAt: now,
        },
        actualPickupAt: now,
        arrivalTemperatureCelsius: finalTemp,
        custodyHistory: [...(order.custodyHistory || []), evt],
        updatedAt: now,
      });
      await addDoc(collection(db, 'custody_events'), evt);

      await addDoc(collection(db, 'notifications'), {
        title: `Sample Collected & Photo Proof: ${order.orderNumber}`,
        message: `${phleboName} verified ${verifiedSpecimens.length} tube barcode(s) (${finalTemp}°C) en route to ${order.targetLabName}.`,
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
          message: `${phleboName} picked up ${verifiedSpecimens.length} barcode-verified specimen(s) (${finalTemp}°C) heading to ${order.targetLabName}.`,
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

      showToast({
        variant: numericTemp < 2 || numericTemp > 8 ? 'WARNING' : 'SUCCESS',
        title: `✓ Tubes Verified • ${order.orderNumber}`,
        subtitle: `${verifiedSpecimens.length} tube(s) at ${numericTemp}°C. Navigate to ${order.targetLabName}.`,
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
        message: 'Ask the receiving lab / Collection Centre coordinator for the 5-digit Handover OTP.',
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
      showToast({
        variant: 'SUCCESS',
        title: `⚡ Delivered • ${order.orderNumber}`,
        subtitle: `${formatInr(order.courierFeeInr || 0)} queued under ${commissionConfig.instantPayoutWindowMinutes || 30
          }-min instant payout SLA.`,
      });
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
    lastUserShiftToggleMsRef.current = Date.now();
    setLocalDutyStatus(nextStatus);
    setMyPhleboProfile((prev) => (prev ? { ...prev, status: nextStatus } : prev));
    void AsyncStorage.setItem(DUTY_STATUS_STORAGE_KEY, nextStatus).catch(() => { });

    if (
      nextStatus === 'ONLINE' &&
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      window.Notification.permission === 'default'
    ) {
      void window.Notification.requestPermission()
        .then((perm) => setWebNotifPerm(perm))
        .catch(() => { });
    }

    const showShiftToast = (syncedRemote: boolean) => {
      showToast({
        variant: nextStatus === 'ONLINE' ? 'SUCCESS' : nextStatus === 'BREAK' ? 'WARNING' : 'INFO',
        title:
          nextStatus === 'ONLINE'
            ? '🟢 You are Now Online'
            : nextStatus === 'BREAK'
              ? '🟡 Break Mode Enabled'
              : '⚫ You are Now Offline',
        subtitle:
          nextStatus === 'ONLINE'
            ? syncedRemote
              ? 'Floating pickup radar & 1–5 km live booking popups active.'
              : 'Online on device • Live 1–5 km broadcast radar active.'
            : 'Floating radar and live pickup popups paused.',
      });
    };

    const targetDocId =
      effectivePhleboId ||
      myPhleboProfile?.id ||
      session?.profile?.phlebotomistId ||
      session?.firebaseUser?.uid ||
      '';

    try {
      const now = new Date().toISOString();
      let docUpdated = false;

      // 1. Direct update on targetDocId if provided
      if (targetDocId) {
        try {
          const directRef = doc(db, 'phlebotomists', targetDocId);
          await updateDoc(directRef, {
            status: nextStatus,
            latitude: riderLocation.latitude,
            longitude: riderLocation.longitude,
            updatedAt: now,
          });
          docUpdated = true;
        } catch {
          // Fall through to query by email or create
        }
      }

      // 2. If direct update failed, locate by phleboEmail
      if (!docUpdated && phleboEmail) {
        try {
          const q = query(
            collection(db, 'phlebotomists'),
            where('email', '==', phleboEmail.toLowerCase()),
            limit(1)
          );
          const snap = await getDocs(q);
          if (!snap.empty) {
            const foundDoc = snap.docs[0];
            await updateDoc(foundDoc.ref, {
              status: nextStatus,
              latitude: riderLocation.latitude,
              longitude: riderLocation.longitude,
              updatedAt: now,
            });
            docUpdated = true;
          }
        } catch { }
      }

      // 3. Fallback: create/merge on session.firebaseUser.uid (permitted by firestore rules)
      if (!docUpdated && session?.firebaseUser?.uid) {
        try {
          const fallbackRef = doc(db, 'phlebotomists', session.firebaseUser.uid);
          await setDoc(
            fallbackRef,
            {
              id: session.firebaseUser.uid,
              email: phleboEmail ? phleboEmail.toLowerCase() : '',
              name: phleboName || 'Field Phlebotomist',
              status: nextStatus,
              latitude: riderLocation.latitude,
              longitude: riderLocation.longitude,
              updatedAt: now,
            },
            { merge: true }
          );
          docUpdated = true;
        } catch { }
      }

      showShiftToast(docUpdated);
    } catch {
      // Keep local duty toggle working seamlessly even if courier Firestore doc is not provisioned yet
      showShiftToast(false);
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
      // Create mobile payment link for on-screen QR Code display (Google Pay, PhonePe, Paytm, BHIM, UPI)
      let linkShortUrl = '';
      let paymentLinkId = `plink_${Date.now()}`;
      try {
        const link = await createPhleboMobilePaymentLink({
          amountInr: payableInr,
          bookingId: order.id,
          settlementId,
          description: `LabSetu Booking ${order.orderNumber} - ${order.patient?.pseudonym || order.smallLabName}`,
          customerName: order.patient?.pseudonym || order.smallLabName,
          customerEmail: phleboEmail,
          customerPhone: order.patient?.phone || order.pickupLocation.contactPhone,
        });
        linkShortUrl = link.short_url;
        paymentLinkId = link.payment_link_id;
      } catch {
        // Fallback UPI short link
        linkShortUrl = `https://rzp.io/l/labsetu-${order.orderNumber}`;
      }

      setActivePaymentLink({
        orderId: order.id,
        orderNumber: order.orderNumber,
        settlementId,
        paymentLinkId,
        shortUrl: linkShortUrl,
        amountInr: payableInr,
      });
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

  async function handleConfirmCashPayment(orderId: string, amountInr: number) {
    if (!session?.firebaseUser) return;
    try {
      const now = new Date().toISOString();
      const orderRef = doc(db, 'orders', orderId);
      const stlId = `STL-${orderId.replace(/^BK-/, '')}`;
      const stlRef = doc(db, 'settlements', stlId);

      const patch = deepCleanFirestorePayload({
        paymentStatus: 'PAID',
        paymentMethod: 'CASH_COLLECTED_BY_PHLEBO',
        collectedByRole: 'PHLEBOTOMIST',
        paidAmountInr: amountInr,
        cashSettledDirectly: true,
        cashPlatformFeePendingInr: Math.round(amountInr * 0.1),
        cashPlatformFeeStatus: 'DUE',
        paidAt: now,
        updatedAt: now,
      });

      await updateDoc(orderRef, patch);
      try {
        await updateDoc(stlRef, patch);
      } catch {
        // Non-fatal if settlement document does not exist yet
      }

      if (effectivePhleboId) {
        try {
          const phRef = doc(db, 'phlebotomists', effectivePhleboId);
          const phSnap = await getDoc(phRef);
          const phData = phSnap.exists() ? (phSnap.data() as Record<string, unknown>) : {};
          const currentDue = Number(phData.pendingPlatformFeeDueInr) || 0;
          await updateDoc(phRef, {
            pendingPlatformFeeDueInr: currentDue + Math.round(amountInr * 0.1),
            ...(!phData.unsettledCashSince ? { unsettledCashSince: now } : {}),
            updatedAt: now,
          });
        } catch {
          // Non-fatal
        }
      }

      // Record custody event
      try {
        const evt = deepCleanFirestorePayload({
          id: `CUST-CASH-${Date.now()}`,
          orderId,
          timestamp: now,
          stage: 'PAYMENT_COLLECTED',
          handledByUserId: effectivePhleboId || 'phlebo',
          handledByUserName: phleboName || 'Phlebotomist',
          handledByUserRole: 'PHLEBOTOMIST',
          action: `Collected ${formatInr(amountInr)} cash payment from patient for ${activePaymentLink?.orderNumber || orderId}`,
          notes: `Cash custody taken by rider ${phleboName}. Order marked PAID.`,
        });
        await addDoc(collection(db, 'custody_events'), evt);
      } catch {
        // Non-fatal
      }

      const orderNo = activePaymentLink?.orderNumber || orderId;
      setActivePaymentLink(null);

      showToast({
        variant: 'SUCCESS',
        title: `✓ Cash Payment Cleared • ${orderNo}`,
        subtitle: `${formatInr(amountInr)} cash collected and registered.`,
      });
      showDynamicAlert({
        variant: 'success',
        title: 'Cash Payment Recorded',
        message: `${formatInr(amountInr)} cash received from patient for ${orderNo}. Custody and settlement updated.`,
      });
    } catch (err) {
      showDynamicAlert({
        variant: 'error',
        title: 'Cash Confirmation Failed',
        message: (err as Error).message || 'Could not record cash payment.',
      });
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
        showToast({
          variant: 'SUCCESS',
          title: `💳 Payment Confirmed • ${paidOrderNo}`,
          subtitle: `${formatInr(paidAmt)} received online via Razorpay.`,
        });
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

  function handleMarkDirectPayment(
    order: PickupOrder,
    method: 'DIRECT_TO_LAB' | 'CASH' | 'UPI_PHLEBO'
  ) {
    if (!session?.firebaseUser) return;
    const payableInr = order.totalAmountInr || order.courierFeeInr || 0;

    let confirmTitle = 'Mark as Paid Directly to Lab?';
    let confirmMsg = `Confirm that the patient has paid or will pay directly to ${order.smallLabName}? Payment collection will be marked complete for your route and you can proceed with sample collection.`;

    if (method === 'CASH') {
      confirmTitle = `Confirm Cash Collection (${formatInr(payableInr)})`;
      confirmMsg = `Confirm that you received ${formatInr(payableInr)} in cash from the patient at ${order.smallLabName}?`;
    } else if (method === 'UPI_PHLEBO') {
      confirmTitle = `Confirm UPI Payment (${formatInr(payableInr)})`;
      confirmMsg = `Confirm that ${formatInr(payableInr)} was received on your UPI QR code for booking ${order.orderNumber}?`;
    }

    showDynamicAlert({
      variant: 'confirm',
      title: confirmTitle,
      message: confirmMsg,
      onConfirm: async () => {
        try {
          const now = new Date().toISOString();
          const orderRef = doc(db, 'orders', order.id);
          const stlId = `STL-${order.id.replace(/^BK-/, '')}`;
          const stlRef = doc(db, 'settlements', stlId);

          const methodLabel =
            method === 'DIRECT_TO_LAB'
              ? 'DIRECT_TO_LAB'
              : method === 'CASH'
                ? 'CASH_COLLECTED_BY_PHLEBO'
                : 'UPI_COLLECTED_BY_PHLEBO';

          const roleLabel = method === 'DIRECT_TO_LAB' ? 'PATIENT_DIRECT_LAB' : 'PHLEBOTOMIST';

          const patch = deepCleanFirestorePayload({
            paymentStatus: 'PAID',
            paymentMethod: methodLabel,
            collectedByRole: roleLabel,
            ...(method === 'CASH'
              ? {
                cashSettledDirectly: true,
                cashPlatformFeePendingInr: 20,
                cashPlatformFeeStatus: 'DUE',
              }
              : {}),
            paidAt: now,
            updatedAt: now,
          });

          await updateDoc(orderRef, patch);
          try {
            await updateDoc(stlRef, patch);
          } catch {
            // Non-fatal
          }

          if (method === 'CASH' && effectivePhleboId) {
            try {
              const phRef = doc(db, 'phlebotomists', effectivePhleboId);
              const phSnap = await getDoc(phRef);
              const phData = phSnap.exists() ? (phSnap.data() as Record<string, unknown>) : {};
              const currentDue = Number(phData.pendingPlatformFeeDueInr) || 0;
              await updateDoc(phRef, {
                pendingPlatformFeeDueInr: currentDue + 20,
                ...(!phData.unsettledCashSince ? { unsettledCashSince: now } : {}),
                updatedAt: now,
              });
            } catch {
              // Non-fatal
            }
          }

          showToast({
            variant: 'SUCCESS',
            title: `✓ Payment Cleared • ${order.orderNumber}`,
            subtitle:
              method === 'DIRECT_TO_LAB'
                ? 'Patient settled directly with lab'
                : `${formatInr(payableInr)} collected via ${method}`,
          });

          showDynamicAlert({
            variant: 'success',
            title: 'Payment Recorded',
            message:
              method === 'DIRECT_TO_LAB'
                ? `Booking marked as paid directly to ${order.smallLabName}. You can now proceed to collect the sample.`
                : `${formatInr(payableInr)} recorded as collected. You can now proceed to collect the sample.`,
          });
        } catch (err) {
          showDynamicAlert({
            variant: 'error',
            title: 'Update Error',
            message: (err as Error).message || 'Could not update payment status.',
          });
        }
      },
    });
  }

  async function handlePickProfilePhoto() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showToast({
          variant: 'WARNING',
          title: 'Storage Permission Required',
          subtitle: 'Please grant gallery access to select a profile photo.',
        });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        const pickedUri = result.assets[0].uri;
        setProfilePhotoUrl(pickedUri);
        if (effectivePhleboId) {
          await updateDoc(doc(db, 'phlebotomists', effectivePhleboId), {
            livePhotoUrl: pickedUri,
            updatedAt: new Date().toISOString(),
          });
          showToast({
            variant: 'SUCCESS',
            title: 'Avatar Photo Updated',
            subtitle: 'New profile photo saved in cloud.',
          });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gallery error';
      showToast({
        variant: 'WARNING',
        title: 'Could Not Pick Photo',
        subtitle: msg,
      });
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

    const holder = payoutAccountName.trim() || profileName || phleboName;
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
      const nextProfile: PayoutProfile & { bankName?: string } = {
        preferredMethod: payoutMethod,
        accountHolderName: holder,
        ...(payoutBankName ? { bankName: payoutBankName.trim() } : {}),
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
        ...(profileName ? { name: profileName.trim() } : {}),
        dob: profileDob,
        gender: profileGender,
        ...(profilePhotoUrl ? { livePhotoUrl: profilePhotoUrl } : {}),
        payoutProfile: nextProfile,
        updatedAt: now,
      });

      showToast({
        variant: 'SUCCESS',
        title: '⚡ Profile & Bank Details Saved',
        subtitle:
          payoutMethod === 'UPI'
            ? `Payouts linked to UPI ${upi}. Details saved in cloud.`
            : `Payouts linked to Bank ••••${last4} (${ifsc}). Details saved in cloud.`,
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

  const handleOpenTrainingSops = useCallback(() => {
    setCurrentScreen('TRAINING_SOPS');
  }, []);

  const handleOpenHelpSupport = useCallback(() => {
    setCurrentScreen('HELP_AND_SUPPORT');
  }, []);

  const handleOpenMySupplies = useCallback(() => {
    setCurrentScreen('KITS_AND_SUPPLIES');
  }, []);

  const handleOpenTodayCollections = useCallback(() => {
    setBottomTab('tasks');
    setSelectedOrderId(null);
    setCurrentScreen('TODAYS_COLLECTIONS');
  }, []);

  const handleOpenTodayRoute = useCallback(() => {
    if (activeAssignedOrders.length > 0) {
      openOrderWorkflow(activeAssignedOrders[0], 'TODAYS_COLLECTIONS');
      return;
    }
    if (todayOrders.length > 0) {
      handleOpenTodayCollections();
      return;
    }
    setShowLocationPickerModal(true);
  }, [activeAssignedOrders, todayOrders.length, handleOpenTodayCollections]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !session) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (alertState.isOpen) {
        setAlertState(INITIAL_DYNAMIC_ALERT);
        return true;
      }
      if (activePaymentLink) {
        setActivePaymentLink(null);
        return true;
      }
      if (floatingSettingsVisible) {
        setFloatingSettingsVisible(false);
        return true;
      }
      if (showLocationPickerModal) {
        setShowLocationPickerModal(false);
        return true;
      }
      if (showQuickActionsModal) {
        setShowQuickActionsModal(false);
        return true;
      }
      if (cameraModal) {
        setCameraModal(null);
        return true;
      }
      if (drawerVisible) {
        setDrawerVisible(false);
        return true;
      }
      if (broadcastForceOpen) {
        setBroadcastForceOpen(false);
        return true;
      }
      if (bottomTab !== 'home') {
        handleNavigateBackHome();
        return true;
      }
      if (currentScreen === 'COLLECT_SAMPLE') {
        setCurrentScreen('BOOKING_DETAILS');
        return true;
      }
      if (currentScreen === 'BOOKING_DETAILS') {
        setCurrentScreen(detailsReturnScreen);
        return true;
      }
      if (
        currentScreen === 'DROP_SAMPLE' ||
        currentScreen === 'TODAYS_COLLECTIONS' ||
        currentScreen === 'COMPLETED' ||
        currentScreen === 'KITS_AND_SUPPLIES' ||
        currentScreen === 'HELP_AND_SUPPORT' ||
        currentScreen === 'TRAINING_SOPS'
      ) {
        setCurrentScreen('BOOKING_REQUESTS');
        setBottomTab('home');
        return true;
      }
      if (currentScreen === 'BOOKING_REQUESTS' && requestTab !== 'new') {
        setRequestTab('new');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [
    session,
    alertState.isOpen,
    activePaymentLink,
    floatingSettingsVisible,
    showLocationPickerModal,
    cameraModal,
    drawerVisible,
    broadcastForceOpen,
    bottomTab,
    currentScreen,
    detailsReturnScreen,
    requestTab,
    handleNavigateBackHome,
  ]);

  const showHomeRequestsFallback =
    currentScreen === 'BOOKING_REQUESTS' ||
    (!selectedOrder &&
      (currentScreen === 'BOOKING_DETAILS' ||
        currentScreen === 'COLLECT_SAMPLE' ||
        currentScreen === 'DROP_SAMPLE'));

  const usesDeepHeroTop =
    (bottomTab === 'home' && currentScreen === 'BOOKING_REQUESTS') ||
    bottomTab === 'earnings' ||
    bottomTab === 'profile';

  const topSafeBg = !session
    ? '#FFFFFF'
    : usesDeepHeroTop
      ? BRAND_COLORS.navyDeep
      : BRAND_COLORS.navyPrimary;

  if (!fontsLoaded && !fontError && !fontWaitExpired) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 24,
        }}
      >
        <StatusBar barStyle="dark-content" />
        <LabSetuLogoMark size={84} />
        <ActivityIndicator
          size="small"
          color={BRAND_COLORS.tealPrimary}
          style={{ marginTop: 18 }}
        />
      </View>
    );
  }

  return (
    <SafeAreaView
      edges={session ? ['left', 'right'] : []}
      style={[
        styles.root,
        {
          backgroundColor: !session ? '#FFFFFF' : COLORS.background,
        },
      ]}
    >
      <StatusBar barStyle={!session ? 'dark-content' : 'light-content'} />
      {session && insets.top > 0 ? (
        <View style={{ height: insets.top, backgroundColor: topSafeBg }} />
      ) : null}

      <DynamicAlertModal
        alertState={alertState}
        onClose={() => setAlertState(INITIAL_DYNAMIC_ALERT)}
      />

      <PaymentLinkModal
        activePaymentLink={activePaymentLink}
        verifyingLinkPayment={verifyingLinkPayment}
        onClose={() => setActivePaymentLink(null)}
        onVerify={() => void handleVerifyActivePaymentLink()}
        onReopenLink={(url) => void Linking.openURL(url)}
        onConfirmCash={(orderId, amountInr) => void handleConfirmCashPayment(orderId, amountInr)}
      />

      <BroadcastDispatchModal
        activeBroadcastMatch={activeBroadcastMatch}
        riderLocation={riderLocation}
        submittingAction={submittingAction}
        onDismissBroadcast={(orderId, isExplicitDecline) => {
          if (isExplicitDecline) {
            void handleDeclineOrder(orderId);
          } else {
            setDismissedBroadcastIds((prev) => [...prev, orderId]);
            activeRingingOrderIdRef.current = null;
            stopContinuousPickupAlert();
            void dismissIncomingPickupOverlay();
            setBroadcastForceOpen(false);
          }
        }}
        onAcceptPoolOrder={(order) => void handleAcceptPoolOrder(order)}
        onOpenDirectionsMap={openDirectionsMap}
      />

      <LocationPickerModal
        visible={showLocationPickerModal}
        riderLocation={riderLocation}
        assignedAdminZone={assignedAdminZone}
        myPhleboProfile={myPhleboProfile}
        serviceZones={serviceZones}
        zonesLoaded={zonesLoaded}
        riderCoverage={riderCoverage}
        onClose={() => setShowLocationPickerModal(false)}
        onSyncDeviceGps={(lat, lng) => void syncDeviceLiveGps(lat, lng)}
        onShowAlert={showDynamicAlert}
      />

      <CameraScannerModal
        cameraModal={cameraModal}
        cameraStatusText={cameraStatusText}
        selectedOrder={selectedOrder}
        specimenDrafts={specimenDrafts}
        uploadingPhoto={uploadingPhoto}
        onClose={() => setCameraModal(null)}
        onCaptureSnapshot={handleCaptureSnapshotFromCam}
        onUploadPhotoFile={handleUploadSamplePhotoFromFile}
        onUpdateSpecimenDraft={updateSpecimenDraft}
      />

      <Modal visible={isSuspendedForUnsettledFees} transparent animationType="fade">
        <View style={[styles.modalBackdrop, { padding: 20 }]}>
          <View style={[styles.modalCard, { alignItems: 'center', padding: 24 }]}>
            <Ionicons name="warning-outline" size={54} color="#EF4444" style={{ marginBottom: 12 }} />
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#991B1B', textAlign: 'center', marginBottom: 8 }}>
              Account Services Restricted
            </Text>
            <Text style={{ fontSize: 13, color: '#475569', textAlign: 'center', lineHeight: 20, marginBottom: 14 }}>
              You have overdue platform fees of {formatInr(myPhleboProfile?.pendingPlatformFeeDueInr || 0)} pending for more than 15 days from cash collections.
            </Text>
            <Text style={{ fontSize: 12, color: '#991B1B', backgroundColor: '#FEF2F2', padding: 12, borderRadius: 8, textAlign: 'center', marginBottom: 16 }}>
              Route acceptance and sample collection are paused until overdue fees are adjusted against payouts or cleared.
            </Text>
            <TouchableOpacity
              style={[styles.ctaButton, { width: '100%' }]}
              onPress={() => setBottomTab('profile')}
            >
              <Text style={styles.ctaButtonText}>View Bank Account &amp; Payouts</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {!session ? (
        <PhleboAuthGate
          onShowAlert={(opts) => showDynamicAlert(opts)}
          onAuthenticated={(verified) => setSession(verified)}
        />
      ) : (
        <>
          <View style={{ flex: 1 }}>
            {currentScreen === 'KITS_AND_SUPPLIES' ? (
              <KitsAndSuppliesScreen
                allocations={kitAllocations}
                phleboName={phleboName}
                courierId={displayCourierId}
                onBack={handleNavigateBackHome}
                onRequestRestock={async (kitCode, kitName) => {
                  await handleRequestKitRestock(kitCode, kitName);
                }}
                onOpenScanner={() => {
                  setCameraStatusText('Align kit or tube barcode within frame');
                  setCameraModal({ mode: 'BARCODE', specimenId: 'KIT_INSPECTION' });
                }}
              />
            ) : currentScreen === 'HELP_AND_SUPPORT' ? (
              <HelpSupportScreen
                phleboName={phleboName}
                courierId={displayCourierId}
                phleboPhone={myPhleboProfile?.phone}
                phleboEmail={myPhleboProfile?.email}
                activeZoneName={
                  riderFullAddress ||
                  (assignedAdminZone
                    ? `${assignedAdminZone.name} (${assignedAdminZone.city})`
                    : undefined)
                }
                supportContacts={supportContacts}
                dynamicFaqs={platformFaqs}
                onBack={handleNavigateBackHome}
                onOpenTrainingSops={handleOpenTrainingSops}
              />
            ) : currentScreen === 'TRAINING_SOPS' ? (
              <TrainingSopScreen
                onBack={handleNavigateBackHome}
                dynamicSops={platformSops}
                onOpenSupplies={handleOpenMySupplies}
                onOpenHelpSupport={handleOpenHelpSupport}
              />
            ) : currentScreen === 'TODAYS_COLLECTIONS' || bottomTab === 'tasks' ? (
              <TodayCollectionsScreen
                todayOrders={todayOrders}
                assignedAdminZone={assignedAdminZone}
                gpsSourceLabel={gpsSourceLabel}
                riderFullAddress={riderFullAddress}
                collectingOrderId={collectingOrderId}
                onBack={handleNavigateBackHome}
                onOpenLocationModal={() => setShowLocationPickerModal(true)}
                onOpenOrderChat={(order) => setActiveChatOrder(order)}
                onViewOrderDetails={(order) => {
                  setDetailsReturnScreen('TODAYS_COLLECTIONS');
                  setSelectedOrderId(order.id);
                  setCurrentScreen('BOOKING_DETAILS');
                }}
                onOpenOrderWorkflow={(order) =>
                  openOrderWorkflow(order, 'TODAYS_COLLECTIONS')
                }
                onCollectBookingPayment={(order) => void handleCollectBookingPayment(order)}
              />
            ) : currentScreen === 'BOOKING_DETAILS' && selectedOrder ? (
              <BookingDetailsScreen
                order={selectedOrder}
                riderLocation={riderLocation}
                collectingOrderId={collectingOrderId}
                supportContacts={supportContacts}
                onBack={() => setCurrentScreen(detailsReturnScreen)}
                onShowAlert={showDynamicAlert}
                onOpenDirectionsMap={openDirectionsMap}
                onOpenOrderChat={(order) => setActiveChatOrder(order)}
                onCollectBookingPayment={(order) => void handleCollectBookingPayment(order)}
                onMarkDirectPayment={(order, method) => handleMarkDirectPayment(order, method)}
                onProceedToCollect={() => setCurrentScreen('COLLECT_SAMPLE')}
                onProceedToDrop={() => setCurrentScreen('DROP_SAMPLE')}
              />
            ) : currentScreen === 'COLLECT_SAMPLE' && selectedOrder ? (
              <CollectSampleScreen
                order={selectedOrder}
                specimenDrafts={specimenDrafts}
                samplePhotoUrl={samplePhotoUrl}
                selfiePhotoUrl={selfiePhotoUrl}
                pickupTempInput={pickupTempInput}
                uploadingPhoto={uploadingPhoto}
                uploadingSelfie={uploadingSelfie}
                submittingAction={submittingAction}
                onOpenOrderChat={(order) => setActiveChatOrder(order)}
                onBack={() => setCurrentScreen('BOOKING_DETAILS')}
                onUpdateSpecimenDraft={updateSpecimenDraft}
                onOpenCameraModal={(modal) => {
                  if (modal.mode === 'PHOTO') {
                    setCameraStatusText('Center all specimen vials clearly and tap Capture Photo.');
                  } else {
                    setCameraStatusText('Align barcode within the green frame to scan.');
                  }
                  setCameraModal(modal);
                }}
                onClearSamplePhoto={() => setSamplePhotoUrl('')}
                onClearSelfiePhoto={() => setSelfiePhotoUrl('')}
                onTakePhotoWithCamera={handleTakePhotoProofWithCamera}
                onUploadPhotoFile={handleUploadSamplePhotoFromFile}
                onChangePickupTemp={setPickupTempInput}
                onConfirmCollection={(order) => void handleConfirmCollection(order)}
                onMarkDirectPayment={(order, method) => handleMarkDirectPayment(order, method)}
                onCollectBookingPayment={(order) => void handleCollectBookingPayment(order)}
                enableBarcodeScanner={platformFeatures.enableBarcodeScanner}
              />
            ) : currentScreen === 'DROP_SAMPLE' && selectedOrder ? (
              <DropSampleScreen
                order={selectedOrder}
                riderLocation={riderLocation}
                collectingOrderId={collectingOrderId}
                otpValue={otpValue}
                dropTempInput={dropTempInput}
                submittingAction={submittingAction}
                onOpenOrderChat={(order) => setActiveChatOrder(order)}
                onBack={() => setCurrentScreen('BOOKING_REQUESTS')}
                onOpenDirectionsMap={openDirectionsMap}
                onCollectBookingPayment={(order) => void handleCollectBookingPayment(order)}
                onUpdateOtpDigit={updateOtpDigit}
                onChangeDropTemp={setDropTempInput}
                onConfirmDropOtp={(order) => void handleConfirmDropOtp(order)}
              />
            ) : currentScreen === 'COMPLETED' ? (
              <CompletedReceiptScreen
                lastReceipt={lastReceipt}
                instantPayoutWindowMinutes={commissionConfig.instantPayoutWindowMinutes || 30}
                onBackToRequests={() => setCurrentScreen('BOOKING_REQUESTS')}
                onOpenEarnings={() => {
                  setBottomTab('earnings');
                  setCurrentScreen('BOOKING_REQUESTS');
                }}
              />
            ) : bottomTab === 'bookings' ? (
              <BookingsHistoryScreen
                myAssignedOrders={myAssignedOrders}
                completedAssignedOrders={completedAssignedOrders}
                bookingSearchQuery={bookingSearchQuery}
                bookingHistoryFilter={bookingHistoryFilter}
                onBack={handleNavigateBackHome}
                onChangeSearchQuery={setBookingSearchQuery}
                onSelectHistoryFilter={setBookingHistoryFilter}
                onOpenOrderWorkflow={(item) => {
                  setBottomTab('home');
                  openOrderWorkflow(item);
                }}
              />
            ) : bottomTab === 'earnings' ? (
              <EarningsScreen
                metrics={metrics}
                instantPayoutWindowMinutes={commissionConfig.instantPayoutWindowMinutes || 30}
                myPhleboProfile={myPhleboProfile}
                earningRows={earningRows}
                payouts={payouts}
                nowTick={nowTick}
                onBack={handleNavigateBackHome}
                onGoToProfile={() => setBottomTab('profile')}
              />
            ) : bottomTab === 'profile' ? (
              <ProfileScreen
                phleboInitial={phleboInitial}
                phleboName={profileName || phleboName}
                displayCourierId={displayCourierId}
                phleboEmail={phleboEmail}
                phleboPhone={myPhleboProfile?.phone}
                phleboDob={profileDob}
                phleboGender={profileGender}
                profilePhotoUrl={profilePhotoUrl || myPhleboProfile?.livePhotoUrl}
                myPhleboProfile={myPhleboProfile}
                completedDeliveriesCount={completedAssignedOrders.length}
                dutyStatus={dutyStatus}
                isOnline={isOnline}
                riderCoverage={riderCoverage}
                webNotifPerm={webNotifPerm}
                floatingSettings={floatingSettings}
                payoutMethod={payoutMethod}
                payoutBankName={payoutBankName}
                payoutAccountName={payoutAccountName}
                payoutUpiId={payoutUpiId}
                payoutBankAccount={payoutBankAccount}
                payoutIfsc={payoutIfsc}
                savingPayoutProfile={savingPayoutProfile}
                isKitModuleActive={isKitModuleActive}
                onBack={handleNavigateBackHome}
                onShiftUpdate={(next) => void handleShiftUpdate(next)}
                onRequestBackgroundAlertPermission={() =>
                  void handleRequestBackgroundAlertPermission()
                }
                onOpenFloatingSettings={() => setFloatingSettingsVisible(true)}
                onOpenTrainingSops={handleOpenTrainingSops}
                onOpenMySupplies={handleOpenMySupplies}
                kitAllocationsCount={kitAllocations.length}
                onOpenHelpSupport={handleOpenHelpSupport}
                onCheckForUpdates={() => void handleCheckForUpdates(true)}
                onChangeName={setProfileName}
                onChangeDob={setProfileDob}
                onChangeGender={setProfileGender}
                onChangePayoutMethod={setPayoutMethod}
                onChangePayoutBankName={setPayoutBankName}
                onChangePayoutAccountName={setPayoutAccountName}
                onChangePayoutUpiId={setPayoutUpiId}
                onChangePayoutBankAccount={setPayoutBankAccount}
                onChangePayoutIfsc={setPayoutIfsc}
                onPickProfilePhoto={handlePickProfilePhoto}
                onSaveProfile={() => void handleSavePayoutProfile()}
                onTriggerSos={handleTriggerSos}
                onSignOut={handleSignOut}
              />
            ) : (
              <BookingRequestsScreen
                phleboInitial={phleboInitial}
                phleboFirstName={phleboFirstName}
                displayCourierId={displayCourierId}
                isOnline={isOnline}
                dutyStatus={dutyStatus}
                metrics={metrics}
                gpsSourceLabel={gpsSourceLabel}
                riderLocation={riderLocation}
                riderFullAddress={riderFullAddress}
                assignedAdminZone={assignedAdminZone}
                riderCoverage={riderCoverage}
                todayPendingCount={todayPendingOrders.length}
                webNotifPerm={webNotifPerm}
                hasOverlayPermission={hasOverlayPermission}
                effectivePhleboId={effectivePhleboId}
                adminLoginEmail={ADMIN_LOGIN_EMAIL}
                requestTab={requestTab}
                radiusOnlyFilter={radiusOnlyFilter}
                openPoolOrdersCount={
                  openPoolOrders.filter(
                    (o) =>
                      !declinedOrderIds.includes(o.id) &&
                      !o.declinedPhleboIds?.includes(effectivePhleboId)
                  ).length
                }
                openPoolWithDistance={openPoolWithDistance.filter(
                  (x) =>
                    !declinedOrderIds.includes(x.order.id) &&
                    !x.order.declinedPhleboIds?.includes(effectivePhleboId)
                )}
                activeAssignedOrders={activeAssignedOrders}
                completedAssignedOrders={completedAssignedOrders}
                submittingAction={submittingAction}
                collectingOrderId={collectingOrderId}
                onShiftUpdate={(next) => void handleShiftUpdate(next)}
                onOpenLocationPicker={() => setShowLocationPickerModal(true)}
                onRequestBackgroundAlertPermission={() =>
                  void handleRequestBackgroundAlertPermission()
                }
                onSelectRequestTab={setRequestTab}
                onSelectRadiusOnlyFilter={setRadiusOnlyFilter}
                onAcceptPoolOrder={(order) => void handleAcceptPoolOrder(order)}
                onDeclineAssignedOrder={handleDeclineAssignedOrder}
                onCollectBookingPayment={(order) => void handleCollectBookingPayment(order)}
                onOpenOrderWorkflow={(order) => openOrderWorkflow(order, 'BOOKING_REQUESTS')}
                onOpenDrawer={() => setDrawerVisible(true)}
                onOpenNotifications={() => {
                  setShowNotificationsModal(true);
                }}
                unreadNotifCount={unreadNotifCount}
                onOpenTodayCollections={handleOpenTodayCollections}
                onOpenHistoryTab={() => setBottomTab('bookings')}
                onOpenTrainingSops={handleOpenTrainingSops}
                onOpenHelpSupport={handleOpenHelpSupport}
                onOpenTodayRoute={handleOpenTodayRoute}
              />
            )}
          </View>

          <View
            style={[
              styles.bottomTabBar,
              {
                paddingBottom: Math.max(insets.bottom, rs(10)),
              },
            ]}
          >
            <TouchableOpacity
              style={styles.bottomTabItem}
              onPress={() => {
                setBottomTab('home');
                setCurrentScreen('BOOKING_REQUESTS');
                setRequestTab('new');
              }}
            >
              <Ionicons
                name={bottomTab === 'home' && currentScreen === 'BOOKING_REQUESTS' ? 'home' : 'home-outline'}
                size={21}
                color={
                  bottomTab === 'home' && currentScreen === 'BOOKING_REQUESTS'
                    ? BRAND_COLORS.navyPrimary
                    : COLORS.textSecondary
                }
              />
              <Text
                maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                style={[
                  styles.bottomTabText,
                  bottomTab === 'home' &&
                  currentScreen === 'BOOKING_REQUESTS' && {
                    color: BRAND_COLORS.navyPrimary,
                    fontFamily: BRAND_FONTS.bold,
                  },
                ]}
              >
                Home
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bottomTabItem}
              onPress={() => {
                setBottomTab('tasks');
                setSelectedOrderId(null);
                setCurrentScreen('TODAYS_COLLECTIONS');
              }}
            >
              <Ionicons
                name={
                  bottomTab === 'tasks' || currentScreen === 'TODAYS_COLLECTIONS'
                    ? 'clipboard'
                    : 'clipboard-outline'
                }
                size={21}
                color={
                  bottomTab === 'tasks' || currentScreen === 'TODAYS_COLLECTIONS'
                    ? BRAND_COLORS.navyPrimary
                    : COLORS.textSecondary
                }
              />
              <Text
                maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                style={[
                  styles.bottomTabText,
                  (bottomTab === 'tasks' || currentScreen === 'TODAYS_COLLECTIONS') && {
                    color: BRAND_COLORS.navyPrimary,
                    fontFamily: BRAND_FONTS.bold,
                  },
                ]}
              >
                Tasks
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.centerFabButton,
                {
                  backgroundColor: '#061D42',
                  borderWidth: 2,
                  borderColor: '#2DD4BF',
                  shadowColor: '#0D9488',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.35,
                  shadowRadius: 8,
                  elevation: 6,
                },
              ]}
              activeOpacity={0.85}
              onPress={() => setShowQuickActionsModal(true)}
              accessibilityLabel="Quick Field Actions"
            >
              <Ionicons name="flash" size={24} color="#2DD4BF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bottomTabItem}
              onPress={() => {
                setBottomTab('bookings');
                setCurrentScreen('BOOKING_REQUESTS');
              }}
            >
              <Ionicons
                name={bottomTab === 'bookings' ? 'time' : 'time-outline'}
                size={22}
                color={
                  bottomTab === 'bookings'
                    ? BRAND_COLORS.navyPrimary
                    : COLORS.textSecondary
                }
              />
              <Text
                maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                style={[
                  styles.bottomTabText,
                  bottomTab === 'bookings' && {
                    color: BRAND_COLORS.navyPrimary,
                    fontFamily: BRAND_FONTS.bold,
                  },
                ]}
              >
                History
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bottomTabItem}
              onPress={() => {
                setBottomTab('profile');
                setCurrentScreen('BOOKING_REQUESTS');
              }}
            >
              <Ionicons
                name={bottomTab === 'profile' ? 'person' : 'person-outline'}
                size={21}
                color={
                  bottomTab === 'profile'
                    ? BRAND_COLORS.navyPrimary
                    : COLORS.textSecondary
                }
              />
              <Text
                maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                style={[
                  styles.bottomTabText,
                  bottomTab === 'profile' && {
                    color: BRAND_COLORS.navyPrimary,
                    fontFamily: BRAND_FONTS.bold,
                  },
                ]}
              >
                Profile
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <PhleboDrawer
        visible={Boolean(session && drawerVisible)}
        phleboName={phleboName || 'Phlebotomist'}
        courierId={displayCourierId}
        isOnline={isOnline}
        activeTab={bottomTab}
        currentScreen={currentScreen}
        pendingCount={activeAssignedOrders.length + openPoolOrders.length}
        todayPendingCount={todayPendingOrders.length}
        onClose={() => setDrawerVisible(false)}
        onNavigateTab={(tab, resetScreen) => {
          setBottomTab(tab);
          if (resetScreen) {
            setSelectedOrderId(null);
            setCurrentScreen('BOOKING_REQUESTS');
          }
        }}
        onOpenTodayCollections={handleOpenTodayCollections}
        onOpenFloatingSettings={() => setFloatingSettingsVisible(true)}
        onOpenTrainingSops={handleOpenTrainingSops}
        onOpenMySupplies={handleOpenMySupplies}
        isKitModuleActive={isKitModuleActive}
        onOpenHelpSupport={handleOpenHelpSupport}
        onLogout={handleSignOut}
      />

      <PhleboQuickActionsModal
        visible={showQuickActionsModal}
        onClose={() => setShowQuickActionsModal(false)}
        dutyStatus={dutyStatus}
        onShiftUpdate={(next) => void handleShiftUpdate(next)}
        onOpenScanner={() => {
          setCameraStatusText('Align kit or tube barcode within green frame');
          setCameraModal({ mode: 'BARCODE', specimenId: 'QUICK_SCAN' });
        }}
        onOpenKitsAndSupplies={handleOpenMySupplies}
        isKitModuleActive={isKitModuleActive}
        onOpenTrainingSops={handleOpenTrainingSops}
        onOpenHelpSupport={handleOpenHelpSupport}
        onOpenTodayCollections={handleOpenTodayCollections}
        onOpenEarnings={() => setBottomTab('earnings')}
        onRefreshBroadcasts={() => {
          const firstNearby = openPoolWithDistance.find((x) => x.inBroadcastRadius);
          if (firstNearby) {
            setDismissedBroadcastIds((prev) =>
              prev.filter((id) => id !== firstNearby.order.id)
            );
          }
          setBroadcastForceOpen(true);
          setBottomTab('home');
          setCurrentScreen('BOOKING_REQUESTS');
          setRequestTab('new');
        }}
      />

      <PhleboKitInventoryModal
        visible={showMySuppliesModal}
        allocations={kitAllocations}
        phleboName={phleboName || 'Field Phlebotomist'}
        courierId={displayCourierId}
        onClose={() => setShowMySuppliesModal(false)}
        onRequestRestock={handleRequestKitRestock}
      />

      <PhleboNotificationsModal
        visible={showNotificationsModal}
        notifications={notifications}
        onClose={() => setShowNotificationsModal(false)}
        onMarkRead={handleMarkNotificationRead}
        onMarkAllRead={handleMarkAllNotificationsRead}
        onClearAll={handleClearAllNotifications}
        onSelectOrder={(orderId) => {
          setSelectedOrderId(orderId);
          setCurrentScreen('BOOKING_DETAILS');
        }}
      />

      <FloatingIconSettingsModal
        visible={floatingSettingsVisible}
        settings={floatingSettings}
        isOnline={isOnline}
        webNotifPerm={webNotifPerm}
        onUpdateSettings={updateFloatingSettings}
        onResetPosition={() => setFloatingResetNonce((n) => n + 1)}
        onRequestOverlayPermission={() => void handleRequestBackgroundAlertPermission()}
        onClose={() => setFloatingSettingsVisible(false)}
      />

      {/* In-App Floating Widget: Rendered ONLY on Web where native Android WindowManager overlay does not exist */}
      {Platform.OS === 'web' && (
        <FloatingDispatchOverlay
          visible={Boolean(
            session &&
            floatingSettings.enabled &&
            (floatingSettings.visibilityMode === 'ALWAYS' || isOnline)
          )}
          isOnline={isOnline}
          nearbyOpenCount={floatingPendingCount}
          gpsLabel={gpsSourceLabel}
          settings={floatingSettings}
          resetNonce={floatingResetNonce}
          onOpenNearbyPool={() => {
            if (floatingPendingCount > 0) {
              handleOpenTodayCollections();
            } else {
              setBottomTab('home');
              setSelectedOrderId(null);
              setCurrentScreen('BOOKING_REQUESTS');
              setRequestTab('new');
              const firstNearby = openPoolWithDistance.find((x) => x.inBroadcastRadius);
              if (firstNearby) {
                setDismissedBroadcastIds((prev) =>
                  prev.filter((id) => id !== firstNearby.order.id)
                );
                setBroadcastForceOpen(true);
              }
            }
          }}
          onOpenTodayCollections={handleOpenTodayCollections}
          onOpenBroadcastPopup={() => {
            if (floatingPendingCount > 0) {
              handleOpenTodayCollections();
            } else {
              const firstNearby = openPoolWithDistance.find((x) => x.inBroadcastRadius);
              if (firstNearby) {
                setDismissedBroadcastIds((prev) =>
                  prev.filter((id) => id !== firstNearby.order.id)
                );
              }
              setBroadcastForceOpen(true);
            }
          }}
          onOpenLocationPicker={() => setShowLocationPickerModal(true)}
          onOpenFloatingSettings={() => setFloatingSettingsVisible(true)}
          onChangeDuty={(nextStatus) => void handleShiftUpdate(nextStatus)}
        />
      )}

      <ToastNotificationBanner toast={toastState} onDismiss={handleDismissToast} />

      <AppUpdateModal
        visible={showUpdateModal}
        updateData={pendingAppUpdate}
        onClose={() => setShowUpdateModal(false)}
        onStartUpdate={async (onProgress) => {
          if (pendingAppUpdate) {
            await applyAppUpdate(pendingAppUpdate, onProgress);
          }
        }}
      />

      <OrderChatModal
        visible={Boolean(activeChatOrder)}
        order={activeChatOrder}
        phleboId={effectivePhleboId}
        phleboName={profileName || phleboName || 'Phlebotomist'}
        onClose={() => setActiveChatOrder(null)}
      />
    </SafeAreaView>
  );
}
