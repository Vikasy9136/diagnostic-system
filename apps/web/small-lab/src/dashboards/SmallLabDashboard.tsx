import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  calculateHaversineDistanceKm,
  computeBookingTrendPoints,
  computeDailyVolumeBars,
  computeOrderPricingSplit,
  computeStatusBreakdown,
  CustodyEventType,
  DiagnosticReportRecord,
  DiagnosticTestItem,
  type DropDestinationType,
  evaluateLargeLabQuotesForSelection,
  formatInr,
  formatOrderStatus,
  inferRequiredTubeForTestCode,
  isOrderCompleted,
  LABSETU_THEME,
  LabFacility,
  LOCALITY_GPS_PRESETS,
  OrderPriority,
  OrderStatus,
  PatientRecord,
  PhlebotomistProfile,
  PickupOrder,
  PlatformNotification,
  ROLE_LABELS,
  SettlementRecord,
  SpecimenQualityStatus,
  SpecimenType,
  StorageTemperature,
  TUBE_METADATA,
  TubeType,
  UserRole,
  type CommissionConfig,
} from '@diagnostic/shared';
import { type VerifiedPortalSession } from '../components/AuthGateScreen';
import { type DynamicAlertVariant } from '../components/DynamicAlertModal';
import {
  cancelSmallLabOrder,
  createLiveBooking,
  DEFAULT_COMMISSION_CONFIG,
  markNotificationRead,
  publishDiagnosticReport,
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
  updateOrderCustodyTransition,
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

  // Live Data States (ZERO dummy data)
  const [labs, setLabs] = useState<LabFacility[]>([]);
  const [phlebotomists, setPhlebotomists] = useState<PhlebotomistProfile[]>([]);
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [testCatalog, setTestCatalog] = useState<DiagnosticTestItem[]>([]);
  const [orders, setOrders] = useState<PickupOrder[]>([]);
  const [reports, setReports] = useState<DiagnosticReportRecord[]>([]);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [notifications, setNotifications] = useState<PlatformNotification[]>([]);
  const [commConfig, setCommConfig] = useState<CommissionConfig>(DEFAULT_COMMISSION_CONFIG);

  // Booking filters, Custody & Report Modals
  const [orderFilter, setOrderFilter] = useState<string>('ALL');
  const [custodyModalOrder, setCustodyModalOrder] = useState<PickupOrder | null>(null);
  const [printingReport, setPrintingReport] = useState<DiagnosticReportRecord | null>(null);

  // Self-Drop Lab QC & Report Modals (when dropType === 'SELF_DROP')
  const [selfQcOrder, setSelfQcOrder] = useState<PickupOrder | null>(null);
  const [selfQcTemp, setSelfQcTemp] = useState('4.2');
  const [selfQcQuality, setSelfQcQuality] = useState<SpecimenQualityStatus>(SpecimenQualityStatus.INTACT);
  const [submittingSelfQc, setSubmittingSelfQc] = useState(false);
  const [selfReportOrder, setSelfReportOrder] = useState<PickupOrder | null>(null);
  const [selfPathologistName, setSelfPathologistName] = useState(
    session.profile.displayName ? `${session.profile.displayName} (Pathology Desk)` : ''
  );
  const [selfReportFile, setSelfReportFile] = useState<File | null>(null);
  const [uploadingSelfReport, setUploadingSelfReport] = useState(false);

  // Patient CRUD modal
  const [showAddPatientModal, setShowAddPatientModal] = useState(false);
  const [ptName, setPtName] = useState('');
  const [ptAge, setPtAge] = useState(32);
  const [ptGender, setPtGender] = useState<'MALE' | 'FEMALE' | 'OTHER'>('MALE');
  const [ptPhone, setPtPhone] = useState('');
  const [ptAddress, setPtAddress] = useState('');
  const [savingPatient, setSavingPatient] = useState(false);

  // New Booking & Smart Matching State
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [adhocPatientName, setAdhocPatientName] = useState('');
  const [adhocPatientAge, setAdhocPatientAge] = useState(35);
  const [adhocPatientGender, setAdhocPatientGender] = useState<'MALE' | 'FEMALE' | 'OTHER'>('MALE');
  const [testSearchQuery, setTestSearchQuery] = useState('');
  const [selectedTestCodes, setSelectedTestCodes] = useState<string[]>([]);
  const [selectedOrgLabId, setSelectedOrgLabId] = useState<string>('');
  const [selectedCenterLabId, setSelectedCenterLabId] = useState<string>('');
  const [dropMode, setDropMode] = useState<DropDestinationType>('LARGE_LAB');
  const [pickupAddress, setPickupAddress] = useState<string>('');
  const [pickupLat, setPickupLat] = useState<number>(LOCALITY_GPS_PRESETS[0].latitude);
  const [pickupLng, setPickupLng] = useState<number>(LOCALITY_GPS_PRESETS[0].longitude);
  const [pickupLocationInitialized, setPickupLocationInitialized] = useState(false);
  const [customDropName, setCustomDropName] = useState<string>('');
  const [customDropAddress, setCustomDropAddress] = useState<string>('');
  const [customDropLat, setCustomDropLat] = useState<number>(LOCALITY_GPS_PRESETS[1].latitude);
  const [customDropLng, setCustomDropLng] = useState<number>(LOCALITY_GPS_PRESETS[1].longitude);
  const [broadcastRadiusKm, setBroadcastRadiusKm] = useState<number>(5);
  const [selectedPhleboId, setSelectedPhleboId] = useState<string>('');
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
        (cfg) => {
          setCommConfig(cfg);
          if (cfg.defaultBroadcastRadiusKm) {
            setBroadcastRadiusKm(cfg.defaultBroadcastRadiusKm);
          }
        },
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
      city: 'Mumbai',
      address: `${session.profile.displayName} Collection Point`,
      latitude: LOCALITY_GPS_PRESETS[0].latitude,
      longitude: LOCALITY_GPS_PRESETS[0].longitude,
      phone: session.profile.phoneNumber || '',
      email: session.profile.email,
      verified: true,
      verificationStatus: 'VERIFIED' as const,
      createdAt: session.profile.createdAt,
      updatedAt: session.profile.updatedAt,
    };
  }, [labs, session.profile]);

  useEffect(() => {
    if (!pickupLocationInitialized && myLabFacility) {
      setPickupAddress(myLabFacility.address || `${myLabFacility.name}, ${myLabFacility.city}`);
      if (typeof myLabFacility.latitude === 'number') setPickupLat(myLabFacility.latitude);
      if (typeof myLabFacility.longitude === 'number') setPickupLng(myLabFacility.longitude);
      setPickupLocationInitialized(true);
    }
  }, [myLabFacility, pickupLocationInitialized]);

  const verifiedLargeLabs = useMemo(
    () => labs.filter((l) => l.type === 'LARGE_LAB' && l.verificationStatus === 'VERIFIED'),
    [labs]
  );

  const onlinePhlebos = useMemo(
    () => phlebotomists.filter((p) => p.status === 'ONLINE'),
    [phlebotomists]
  );

  // Deduplicated Tests & Packages list for clean multi-selection across all partner catalogs
  const selectableCatalogEntries = useMemo(() => {
    const byCode = new Map<
      string,
      {
        code: string;
        name: string;
        itemType: 'TEST' | 'PACKAGE';
        includedTestCodes?: string[];
        department: string;
        tubeType: TubeType;
        minPrice: number;
      }
    >();

    for (const item of testCatalog.filter((t) => t.isActive !== false)) {
      const code = item.code.trim().toUpperCase();
      if (!code) continue;
      const existing = byCode.get(code);
      if (!existing) {
        byCode.set(code, {
          code,
          name: item.name,
          itemType: item.itemType || 'TEST',
          includedTestCodes: item.includedTestCodes,
          department: item.department,
          tubeType: item.tubeType,
          minPrice: item.b2bPriceInr || 0,
        });
      } else {
        existing.minPrice = Math.min(existing.minPrice, item.b2bPriceInr || existing.minPrice);
        if (item.itemType === 'PACKAGE' && item.includedTestCodes?.length) {
          existing.itemType = 'PACKAGE';
          existing.includedTestCodes = item.includedTestCodes;
        }
      }
    }

    return Array.from(byCode.values()).sort((a, b) => {
      if (a.itemType !== b.itemType) return a.itemType === 'PACKAGE' ? -1 : 1;
      return a.code.localeCompare(b.code);
    });
  }, [testCatalog]);

  // Expand any selected PACKAGE into its constituent test codes for accurate quote matching & tube generation
  const expandedRequestedCodes = useMemo(() => {
    const expanded = new Set<string>();
    const entryMap = new Map(selectableCatalogEntries.map((e) => [e.code, e]));
    for (const code of selectedTestCodes) {
      const entry = entryMap.get(code);
      if (entry?.itemType === 'PACKAGE' && entry.includedTestCodes?.length) {
        for (const inc of entry.includedTestCodes) {
          if (inc.trim()) expanded.add(inc.trim().toUpperCase());
        }
      } else {
        expanded.add(code);
      }
    }
    return Array.from(expanded);
  }, [selectedTestCodes, selectableCatalogEntries]);

  // Smart Large Lab Comparison Quotes: auto-matches packages & sorts lowest payable price #1!
  const rankedLargeLabQuotes = useMemo(() => {
    const reqCodes =
      expandedRequestedCodes.length > 0
        ? expandedRequestedCodes
        : [];
    if (reqCodes.length === 0) return [];
    return evaluateLargeLabQuotesForSelection({
      requestedTestCodes: reqCodes,
      catalog: testCatalog,
      labs,
      commissionConfig: commConfig,
      priority: bookingPriority,
      pickupCoords: { latitude: pickupLat, longitude: pickupLng },
    });
  }, [expandedRequestedCodes, testCatalog, labs, commConfig, bookingPriority, pickupLat, pickupLng]);

  const activeQuote = useMemo(() => {
    if (rankedLargeLabQuotes.length === 0) return null;
    return (
      rankedLargeLabQuotes.find((q) => q.orgLabId === selectedOrgLabId) ||
      rankedLargeLabQuotes[0]
    );
  }, [rankedLargeLabQuotes, selectedOrgLabId]);

  // Auto-select #1 lowest price Large Lab + nearest center when quotes update
  useEffect(() => {
    if (rankedLargeLabQuotes.length > 0) {
      const currentValid = rankedLargeLabQuotes.find((q) => q.orgLabId === selectedOrgLabId);
      const best = currentValid || rankedLargeLabQuotes[0];
      if (best.orgLabId !== selectedOrgLabId) {
        setSelectedOrgLabId(best.orgLabId);
        setSelectedCenterLabId(best.nearestCenter.id);
      } else if (
        !best.centers.some((c) => c.lab.id === selectedCenterLabId)
      ) {
        setSelectedCenterLabId(best.nearestCenter.id);
      }
    } else if (!selectedCenterLabId && verifiedLargeLabs.length > 0) {
      setSelectedCenterLabId(verifiedLargeLabs[0].id);
    }
  }, [rankedLargeLabQuotes, selectedOrgLabId, selectedCenterLabId, verifiedLargeLabs]);

  const selectedCenterOption = useMemo(() => {
    if (activeQuote) {
      return (
        activeQuote.centers.find((c) => c.lab.id === selectedCenterLabId) ||
        activeQuote.centers[0]
      );
    }
    const fallbackLab =
      verifiedLargeLabs.find((l) => l.id === selectedCenterLabId) ||
      verifiedLargeLabs[0];
    if (!fallbackLab) return null;
    const distanceKm =
      typeof fallbackLab.latitude === 'number' && typeof fallbackLab.longitude === 'number'
        ? calculateHaversineDistanceKm(pickupLat, pickupLng, fallbackLab.latitude, fallbackLab.longitude)
        : 3.5;
    return {
      lab: fallbackLab,
      distanceKm,
      estimatedEtaMins: Math.max(12, Math.round(distanceKm * 4 + 10)),
    };
  }, [activeQuote, selectedCenterLabId, verifiedLargeLabs, pickupLat, pickupLng]);

  const resolvedDropInfo = useMemo(() => {
    if (dropMode === 'SELF_DROP') {
      const distKm = calculateHaversineDistanceKm(
        pickupLat,
        pickupLng,
        myLabFacility.latitude ?? pickupLat,
        myLabFacility.longitude ?? pickupLng
      );
      const split = computeOrderPricingSplit({
        smallLabTestTotalInr: 0,
        commissionConfig: commConfig,
        priority: bookingPriority,
        distanceKm: distKm,
        dropType: 'SELF_DROP',
      });
      return {
        targetLabId: myLabFacility.id,
        targetParentLabId: undefined,
        targetLabName: `${myLabFacility.name} (Self Lab Return)`,
        deliveryAddress: myLabFacility.address || `${myLabFacility.name}, ${myLabFacility.city}`,
        deliveryLat: myLabFacility.latitude ?? pickupLat,
        deliveryLng: myLabFacility.longitude ?? pickupLng,
        distanceKm: distKm,
        split,
      };
    }

    if (dropMode === 'CUSTOM_ADDRESS') {
      const distKm = calculateHaversineDistanceKm(
        pickupLat,
        pickupLng,
        customDropLat,
        customDropLng
      );
      const split = computeOrderPricingSplit({
        smallLabTestTotalInr: 0,
        commissionConfig: commConfig,
        priority: bookingPriority,
        distanceKm: distKm,
        dropType: 'CUSTOM_ADDRESS',
      });
      return {
        targetLabId: myLabFacility.id,
        targetParentLabId: undefined,
        targetLabName: customDropName.trim() || 'Custom Drop Destination',
        deliveryAddress: customDropAddress.trim() || 'Custom Drop Address',
        deliveryLat: customDropLat,
        deliveryLng: customDropLng,
        distanceKm: distKm,
        split,
      };
    }

    // LARGE_LAB mode
    const center = selectedCenterOption?.lab;
    const distKm = selectedCenterOption?.distanceKm ?? 3.5;
    const testTotal = activeQuote?.smallLabTestTotalInr ?? 0;
    const largeB2bTotal = activeQuote?.largeLabB2bTotalInr;
    const split = computeOrderPricingSplit({
      smallLabTestTotalInr: testTotal,
      largeLabB2bTotalInr: largeB2bTotal,
      commissionConfig: commConfig,
      targetLabId: activeQuote?.orgLabId || center?.parentLabId || center?.id,
      priority: bookingPriority,
      distanceKm: distKm,
      dropType: 'LARGE_LAB',
    });
    return {
      targetLabId: center?.id || '',
      targetParentLabId: center?.parentLabId || (activeQuote?.orgLabId !== center?.id ? activeQuote?.orgLabId : undefined),
      targetLabName: center?.name || activeQuote?.orgLabName || 'Partner Reference Hub',
      deliveryAddress: center?.address || `${center?.name || ''}, ${center?.city || ''}`,
      deliveryLat: center?.latitude ?? LOCALITY_GPS_PRESETS[2].latitude,
      deliveryLng: center?.longitude ?? LOCALITY_GPS_PRESETS[2].longitude,
      distanceKm: distKm,
      split,
    };
  }, [
    dropMode,
    pickupLat,
    pickupLng,
    myLabFacility,
    commConfig,
    bookingPriority,
    customDropLat,
    customDropLng,
    customDropName,
    customDropAddress,
    selectedCenterOption,
    activeQuote,
  ]);

  // Individual Specimen Items created for the expanded test codes (each carries correct tubeType!)
  const resolvedSpecimensForOrder = useMemo<DiagnosticTestItem[]>(() => {
    const orgId = activeQuote?.orgLabId || selectedCenterOption?.lab.parentLabId || selectedCenterOption?.lab.id;
    const catalogSingle = testCatalog.filter((t) => (t.itemType || 'TEST') === 'TEST');

    return expandedRequestedCodes.map((code) => {
      const orgMatch = orgId
        ? catalogSingle.find((t) => (t.ownerOrgId === orgId || t.labId === orgId) && t.code.toUpperCase() === code)
        : undefined;
      const globalMatch = catalogSingle.find((t) => t.code.toUpperCase() === code);
      const found = orgMatch || globalMatch;
      if (found) return found;

      const inferredTube = inferRequiredTubeForTestCode(code);
      return {
        id: code,
        code,
        name: code,
        department: 'Pathology',
        specimenType: SpecimenType.BLOOD,
        tubeType: inferredTube,
        temperatureRequirement: StorageTemperature.REFRIGERATED,
        tatHours: 6,
        b2bPriceInr: 0,
        mrpInr: 0,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
  }, [expandedRequestedCodes, testCatalog, activeQuote, selectedCenterOption]);

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

  function handleDetectPickupGps() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      onShowAlert({
        variant: 'info',
        title: 'Location Unavailable',
        message: 'Browser GPS is unavailable. Select a locality preset or enter coordinates directly.',
      });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPickupLat(Number(pos.coords.latitude.toFixed(5)));
        setPickupLng(Number(pos.coords.longitude.toFixed(5)));
        onShowAlert({
          variant: 'success',
          title: 'GPS Updated',
          message: `Collection location locked to ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}. Center distances & rider broadcast updated.`,
        });
      },
      () => {
        onShowAlert({
          variant: 'warning',
          title: 'Location Permission Needed',
          message: 'Allow location permission in your browser or choose a nearby locality preset.',
        });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

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

    if (resolvedSpecimensForOrder.length === 0) {
      onShowAlert({
        variant: 'warning',
        title: 'Diagnostic Tests Required',
        message: 'Select at least one diagnostic test or package.',
      });
      return;
    }

    if (dropMode === 'LARGE_LAB' && !resolvedDropInfo.targetLabId) {
      onShowAlert({
        variant: 'warning',
        title: 'Partner Center Required',
        message: 'Select a Large Reference Lab hub or collection center (or choose Self / Custom Drop).',
      });
      return;
    }

    if (dropMode === 'CUSTOM_ADDRESS' && !customDropAddress.trim()) {
      onShowAlert({
        variant: 'warning',
        title: 'Custom Drop Address Required',
        message: 'Enter the exact drop-off address where the phlebotomist should deliver the samples.',
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
          address: pickupAddress.trim() || myLabFacility.address || `${myLabFacility.name}, ${myLabFacility.city}`,
          phone: myLabFacility.phone,
        },
        targetLab: {
          id: resolvedDropInfo.targetLabId,
          name: resolvedDropInfo.targetLabName,
          address: resolvedDropInfo.deliveryAddress,
          parentLabId: resolvedDropInfo.targetParentLabId,
        },
        dropType: dropMode,
        pickupLocation: {
          address: pickupAddress.trim() || myLabFacility.address || myLabFacility.name,
          latitude: pickupLat,
          longitude: pickupLng,
          contactName: myLabFacility.name,
          contactPhone: myLabFacility.phone,
        },
        deliveryLocation: {
          address: resolvedDropInfo.deliveryAddress,
          latitude: resolvedDropInfo.deliveryLat,
          longitude: resolvedDropInfo.deliveryLng,
          contactName: resolvedDropInfo.targetLabName,
        },
        phlebotomist: chosenPhlebo ? { id: chosenPhlebo.id, name: chosenPhlebo.name } : null,
        selectedTests: resolvedSpecimensForOrder,
        smallLabPayableTestTotalInr: resolvedDropInfo.split.smallLabTestTotalInr,
        largeLabB2bTotalInr:
          dropMode === 'LARGE_LAB' ? resolvedDropInfo.split.labPayoutInr : 0,
        matchedPackageNames:
          dropMode === 'LARGE_LAB' && activeQuote?.matchedPackages.length
            ? activeQuote.matchedPackages.map((p) => `${p.name} (${p.code})`)
            : undefined,
        packageSavingsInr:
          dropMode === 'LARGE_LAB' ? activeQuote?.packageSavingsInr : undefined,
        distanceKm: resolvedDropInfo.distanceKm,
        broadcastRadiusKm,
        priority: bookingPriority,
        scheduledPickupAt: pickupSlot,
        commissionConfig: commConfig,
      });

      setSelectedTestCodes([]);
      setAdhocPatientName('');

      const settlementId = `STL-${created.orderNumber.replace('BK-', '')}`;
      if (payImmediatelyOnBook && (created.totalAmountInr || 0) >= 1) {
        try {
          const checkoutRes = await startRazorpayBookingCheckout({
            amountInr: created.totalAmountInr || resolvedDropInfo.split.grossAmountInr,
            bookingId: created.id,
            settlementId,
            description: `LabSetu Pickup ${created.orderNumber} (${resolvedDropInfo.targetLabName})`,
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
              message: `Online payment (${checkoutRes.result.paymentId}) confirmed. Live broadcast triggered within ${broadcastRadiusKm} km!`,
              detail: `Handover Receiving OTP: ${created.handoverOtp} • Destination: ${resolvedDropInfo.targetLabName}`,
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
          message: `Live pickup broadcasted within ${broadcastRadiusKm} km -> Drop at ${resolvedDropInfo.targetLabName}.`,
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

  async function handleSelfDropQcSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selfQcOrder || !session.firebaseUser) return;
    const numericTemp = Number.parseFloat(selfQcTemp);
    if (Number.isNaN(numericTemp)) {
      onShowAlert({ variant: 'warning', title: 'Valid Temperature Required', message: 'Enter arrival temperature in °C.' });
      return;
    }
    setSubmittingSelfQc(true);
    try {
      await updateOrderCustodyTransition({
        order: selfQcOrder,
        nextStatus: OrderStatus.DELIVERED_TO_LAB,
        eventType: CustodyEventType.ACCESSIONED_BY_PARTNER_LAB,
        operatorUid: session.firebaseUser.uid,
        operatorName: session.profile.displayName,
        operatorRole: UserRole.SMALL_LAB,
        temperatureCelsius: numericTemp,
        qualityStatus: selfQcQuality,
        notes: `Self-Drop Sample Marked Received & QC Passed (${formatLabel(selfQcQuality)}) at ${numericTemp}°C`,
      });
      setSelfQcOrder(null);
      onShowAlert({
        variant: 'success',
        title: 'Sample Marked Received',
        message: `${selfQcOrder.orderNumber} received at ${myLabFacility.name} (${numericTemp}°C). You can now start analysis or upload the final report.`,
      });
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Update Failed',
        message: (err as Error).message || 'Could not update receiving QC.',
      });
    } finally {
      setSubmittingSelfQc(false);
    }
  }

  async function handleSelfStartRun(order: PickupOrder) {
    if (!session.firebaseUser) return;
    await updateOrderCustodyTransition({
      order,
      nextStatus: OrderStatus.UNDER_ANALYSIS,
      eventType: CustodyEventType.ACCESSIONED_BY_PARTNER_LAB,
      operatorUid: session.firebaseUser.uid,
      operatorName: session.profile.displayName,
      operatorRole: UserRole.SMALL_LAB,
      notes: `In-house testing started at ${myLabFacility.name}`,
    });
    onShowAlert({
      variant: 'success',
      title: 'Analysis Started',
      message: `${order.orderNumber} is now marked Under Analysis.`,
    });
  }

  async function handleSelfPublishReport(e: FormEvent) {
    e.preventDefault();
    if (!selfReportOrder || !session.firebaseUser) return;
    setUploadingSelfReport(true);
    try {
      const rec = await publishDiagnosticReport({
        order: selfReportOrder,
        pathologistName: selfPathologistName,
        file: selfReportFile,
        operatorUid: session.firebaseUser.uid,
        operatorName: session.profile.displayName,
        operatorRole: UserRole.SMALL_LAB,
      });
      setSelfReportOrder(null);
      setSelfReportFile(null);
      onShowAlert({
        variant: 'success',
        title: `Report ${rec.id} Published`,
        message: `Report saved and ready to download or print in the Reports tab.`,
      });
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Upload Failed',
        message: (err as Error).message || 'Could not upload report.',
      });
    } finally {
      setUploadingSelfReport(false);
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

  function toggleTestCodeSelection(code: string) {
    const clean = code.trim().toUpperCase();
    setSelectedTestCodes((prev) =>
      prev.includes(clean) ? prev.filter((c) => c !== clean) : [...prev, clean]
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

          {/* TAB 2: NEW BOOKING (SMART PACKAGE MATCHING, LOWEST PRICE #1 & 3-WAY DROP) */}
          {activeTab === 'new-booking' && (
            <div className="settings-grid-2">
              <form className="chart-card-modern" onSubmit={(e) => void handleCreateBooking(e)}>
                <div className="card-top-header">
                  <div>
                    <h2 className="card-top-title">Create Cold-Chain Pickup Booking</h2>
                    <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
                      Select tests or packages — Partner labs &amp; combo deals are ranked lowest price #1 automatically
                    </p>
                  </div>
                </div>

                {/* STEP 1: PATIENT */}
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>1. Select Registered Patient</label>
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

                {/* STEP 2: PICKUP LOCATION & GPS */}
                <div className="form-group" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>2. Collection Address &amp; Live GPS</label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <select
                        className="form-select"
                        style={{ padding: '4px 8px', fontSize: '0.76rem', width: 'auto' }}
                        defaultValue=""
                        onChange={(e) => {
                          const preset = LOCALITY_GPS_PRESETS.find((p) => p.label === e.target.value);
                          if (preset) {
                            setPickupAddress(`${myLabFacility.name}, ${preset.label}`);
                            setPickupLat(preset.latitude);
                            setPickupLng(preset.longitude);
                          }
                        }}
                      >
                        <option value="">Locality GPS Preset...</option>
                        {LOCALITY_GPS_PRESETS.map((p) => (
                          <option key={p.label} value={p.label}>{p.label}</option>
                        ))}
                      </select>
                      <button type="button" className="btn-secondary" style={{ padding: '5px 10px', fontSize: '0.76rem' }} onClick={handleDetectPickupGps}>
                        📍 Detect GPS
                      </button>
                    </div>
                  </div>
                  <input
                    className="form-input"
                    placeholder="Enter pickup address for sample collection..."
                    value={pickupAddress}
                    onChange={(e) => setPickupAddress(e.target.value)}
                    required
                    style={{ marginBottom: '8px' }}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <input
                      type="number"
                      step="0.0001"
                      className="form-input"
                      aria-label="Pickup Latitude"
                      value={pickupLat}
                      onChange={(e) => setPickupLat(Number(e.target.value))}
                    />
                    <input
                      type="number"
                      step="0.0001"
                      className="form-input"
                      aria-label="Pickup Longitude"
                      value={pickupLng}
                      onChange={(e) => setPickupLng(Number(e.target.value))}
                    />
                  </div>
                </div>

                {/* STEP 3: TESTS & COMBO PACKAGES SELECTOR */}
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>
                      3. Select Tests &amp; Packages ({selectedTestCodes.length} selected &rarr; {expandedRequestedCodes.length} unique test{expandedRequestedCodes.length === 1 ? '' : 's'})
                    </label>
                    {selectedTestCodes.length > 0 && (
                      <button type="button" className="btn-link-muted" onClick={() => setSelectedTestCodes([])}>
                        Clear Selection
                      </button>
                    )}
                  </div>
                  <input
                    className="form-input"
                    placeholder="Search test code, panel name, or package..."
                    value={testSearchQuery}
                    onChange={(e) => setTestSearchQuery(e.target.value)}
                    style={{ marginBottom: '8px' }}
                  />
                  {selectableCatalogEntries.length === 0 ? (
                    <div className="empty-state-box">
                      <h4>Test Catalogue Is Empty</h4>
                      <p>Ask Admin or a Reference Lab to add tests and combo packages to the test catalogue.</p>
                    </div>
                  ) : (
                    <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '8px' }}>
                      {selectableCatalogEntries
                        .filter((entry) => {
                          const tq = testSearchQuery.trim().toLowerCase();
                          if (!tq) return true;
                          return (
                            entry.code.toLowerCase().includes(tq) ||
                            entry.name.toLowerCase().includes(tq) ||
                            entry.department.toLowerCase().includes(tq)
                          );
                        })
                        .map((entry) => {
                          const checked = selectedTestCodes.includes(entry.code);
                          const tm = TUBE_METADATA[entry.tubeType] || TUBE_METADATA[TubeType.SERUM_RED_GOLD];
                          return (
                            <label key={entry.code} className="checkbox-row" style={{ marginBottom: '6px' }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleTestCodeSelection(entry.code)}
                              />
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <strong>{entry.code}</strong>
                                  <span>— {entry.name}</span>
                                  {entry.itemType === 'PACKAGE' && (
                                    <span className="package-match-pill" style={{ padding: '1px 7px', fontSize: '0.68rem' }}>
                                      📦 PACKAGE
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: '0.73rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
                                  <span>{entry.department}</span>
                                  <span className="tube-cap-pill" style={{ background: tm.bgHex, color: tm.colorHex, padding: '1px 7px', fontSize: '0.68rem' }}>
                                    <span className="tube-cap-dot" style={{ background: tm.colorHex }} />
                                    {tm.capColorName}
                                  </span>
                                  {entry.includedTestCodes?.length ? (
                                    <span style={{ color: '#1D4ED8' }}>Includes: {entry.includedTestCodes.join(', ')}</span>
                                  ) : null}
                                </div>
                              </div>
                              <strong>From {formatInr(entry.minPrice)}</strong>
                            </label>
                          );
                        })}
                    </div>
                  )}
                </div>

                {/* STEP 4: DROP DESTINATION & SMART LAB COMPARISON */}
                <div className="form-group">
                  <label className="form-label">4. Sample Drop Destination</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
                    <button
                      type="button"
                      className={`center-option-card ${dropMode === 'LARGE_LAB' ? 'active' : ''}`}
                      onClick={() => setDropMode('LARGE_LAB')}
                    >
                      <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>🏥 Partner Large Lab</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>Auto-ranked lowest price &amp; nearby center</div>
                    </button>
                    <button
                      type="button"
                      className={`center-option-card ${dropMode === 'SELF_DROP' ? 'active' : ''}`}
                      onClick={() => setDropMode('SELF_DROP')}
                    >
                      <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>🏠 Drop at Own Lab</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>Return sample to {myLabFacility.name}</div>
                    </button>
                    <button
                      type="button"
                      className={`center-option-card ${dropMode === 'CUSTOM_ADDRESS' ? 'active' : ''}`}
                      onClick={() => setDropMode('CUSTOM_ADDRESS')}
                    >
                      <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>📍 Custom Drop</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>Drop at any external address</div>
                    </button>
                  </div>

                  {dropMode === 'LARGE_LAB' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {expandedRequestedCodes.length === 0 ? (
                        <div className="empty-state-box" style={{ padding: '16px' }}>
                          <h4>Compare Partner Large Labs &amp; Combo Deals</h4>
                          <p>Select one or more tests above to match combo packages and rank the lowest total cost #1.</p>
                        </div>
                      ) : rankedLargeLabQuotes.length === 0 ? (
                        <div className="empty-state-box" style={{ padding: '16px' }}>
                          <h4>No Verified Partner Labs Match Selected Codes</h4>
                          <p>Ask Admin or Large Labs to add these test codes, or choose &ldquo;Drop at Own Lab&rdquo; / &ldquo;Custom Drop&rdquo;.</p>
                        </div>
                      ) : (
                        <>
                          <div className="quote-cards-stack">
                            {rankedLargeLabQuotes.map((quote, idx) => {
                              const isSelected = activeQuote?.orgLabId === quote.orgLabId;
                              return (
                                <div
                                  key={quote.orgLabId}
                                  className={`quote-lab-card ${isSelected ? 'selected' : ''}`}
                                  onClick={() => {
                                    setSelectedOrgLabId(quote.orgLabId);
                                    setSelectedCenterLabId(quote.nearestCenter.id);
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
                                    <div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <span className="quote-rank-badge">
                                          {idx === 0 ? '★ #1 Lowest Price' : `#${idx + 1}`}
                                        </span>
                                        <strong style={{ fontSize: '0.94rem' }}>{quote.orgLabName}</strong>
                                        {quote.nablNumber && (
                                          <span style={{ fontSize: '0.72rem', color: '#64748B' }}>{quote.nablNumber}</span>
                                        )}
                                      </div>
                                      <div style={{ fontSize: '0.76rem', color: '#475569', marginTop: '4px' }}>
                                        Nearest center: <strong>{quote.nearestCenter.name}</strong> ({quote.nearestDistanceKm} km • ~{quote.centers[0]?.estimatedEtaMins || 15} mins) • Covered {quote.coveredCodes.length}/{quote.requestedCodes.length} tests
                                      </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0D9488' }}>
                                        {formatInr(quote.totalPayableInr)}
                                      </div>
                                      <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                        Tests {formatInr(quote.smallLabTestTotalInr)} + Courier {formatInr(quote.pricingSplit.courierFeeInr)}
                                      </div>
                                    </div>
                                  </div>

                                  {quote.matchedPackages.length > 0 && (
                                    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                      <span className="package-match-pill">
                                        🎁 Package Auto-Matched: {quote.matchedPackages.map((p) => `${p.name} (${p.code})`).join(' + ')}
                                        {quote.packageSavingsInr > 0 ? ` • Save ${formatInr(quote.packageSavingsInr)}` : ''}
                                      </span>
                                    </div>
                                  )}

                                  {quote.missingCodes.length > 0 && (
                                    <div style={{ marginTop: '6px', fontSize: '0.73rem', color: '#DC2626', fontWeight: 600 }}>
                                      Not in this partner catalog: {quote.missingCodes.join(', ')}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {activeQuote && (
                            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px' }}>
                              <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                                Select Nearest Drop Center / Hub for {activeQuote.orgLabName} ({activeQuote.centers.length} available)
                              </div>
                              <div className="center-picker-grid">
                                {activeQuote.centers.map((c) => {
                                  const chosen = selectedCenterLabId === c.lab.id;
                                  return (
                                    <button
                                      key={c.lab.id}
                                      type="button"
                                      className={`center-option-card ${chosen ? 'active' : ''}`}
                                      onClick={() => setSelectedCenterLabId(c.lab.id)}
                                    >
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                                        <strong style={{ fontSize: '0.82rem' }}>{c.lab.name}</strong>
                                        <span className="status-pill-green" style={{ fontSize: '0.68rem', padding: '2px 7px' }}>
                                          {c.distanceKm} km
                                        </span>
                                      </div>
                                      <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px' }}>
                                        {c.lab.centerType === 'COLLECTION_CENTER' ? 'Branch Collection Center' : 'Main Reference Hub'} • ~{c.estimatedEtaMins} min
                                      </div>
                                      <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '2px' }}>
                                        {c.lab.address || c.lab.city} {c.lab.pincode || ''}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {dropMode === 'SELF_DROP' && (
                    <div style={{ background: '#F0FDFA', border: '1px solid #99F6E4', borderRadius: '12px', padding: '12px', fontSize: '0.82rem', color: '#115E59' }}>
                      <strong>Self Lab Return Activated:</strong> Sample will be collected from pickup location and delivered back to <strong>{myLabFacility.name}</strong> ({myLabFacility.address || myLabFacility.city}). You can mark received, start analysis, and upload the report directly from Bookings.
                    </div>
                  )}

                  {dropMode === 'CUSTOM_ADDRESS' && (
                    <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <input
                          className="form-input"
                          placeholder="Drop Contact / Clinic Name"
                          value={customDropName}
                          onChange={(e) => setCustomDropName(e.target.value)}
                          required
                        />
                        <select
                          className="form-select"
                          defaultValue=""
                          onChange={(e) => {
                            const preset = LOCALITY_GPS_PRESETS.find((p) => p.label === e.target.value);
                            if (preset) {
                              if (!customDropAddress.trim()) setCustomDropAddress(preset.label);
                              setCustomDropLat(preset.latitude);
                              setCustomDropLng(preset.longitude);
                            }
                          }}
                        >
                          <option value="">Drop Locality Preset...</option>
                          {LOCALITY_GPS_PRESETS.map((p) => (
                            <option key={p.label} value={p.label}>{p.label}</option>
                          ))}
                        </select>
                      </div>
                      <input
                        className="form-input"
                        placeholder="Full Custom Drop Address"
                        value={customDropAddress}
                        onChange={(e) => setCustomDropAddress(e.target.value)}
                        required
                      />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <input
                          type="number"
                          step="0.0001"
                          className="form-input"
                          aria-label="Custom Drop Latitude"
                          value={customDropLat}
                          onChange={(e) => setCustomDropLat(Number(e.target.value))}
                        />
                        <input
                          type="number"
                          step="0.0001"
                          className="form-input"
                          aria-label="Custom Drop Longitude"
                          value={customDropLng}
                          onChange={(e) => setCustomDropLng(Number(e.target.value))}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* STEP 5: PRIORITY, DISPATCH POOL & RADIUS */}
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
                  <label className="form-label">Dispatch Mode (Live 1–5 km Radius Pool or Direct Phlebotomist)</label>
                  <select
                    className="form-select"
                    value={selectedPhleboId}
                    onChange={(e) => setSelectedPhleboId(e.target.value)}
                  >
                    <option value="">Open Live Broadcast Pool (Riders within {broadcastRadiusKm} km accept live)</option>
                    {phlebotomists.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.id}) — {formatLabel(p.status)} • {p.currentLocation}
                      </option>
                    ))}
                  </select>
                </div>

                {!selectedPhleboId && (
                  <div className="form-group" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label className="form-label" style={{ marginBottom: 0 }}>Live Pickup Broadcast Radius</label>
                      <strong style={{ color: '#0D9488', fontSize: '0.88rem' }}>{broadcastRadiusKm} km</strong>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      step={0.5}
                      value={broadcastRadiusKm}
                      onChange={(e) => setBroadcastRadiusKm(Number(e.target.value))}
                      style={{ width: '100%' }}
                    />
                    <div style={{ fontSize: '0.73rem', color: '#64748B', marginTop: '4px' }}>
                      Triggers real-time popup on nearby phlebotomists within {broadcastRadiusKm} km; locks instantly on first accept.
                    </div>
                  </div>
                )}

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
                  disabled={
                    submittingBooking ||
                    resolvedSpecimensForOrder.length === 0 ||
                    (dropMode === 'LARGE_LAB' && !resolvedDropInfo.targetLabId)
                  }
                >
                  {submittingBooking
                    ? payImmediatelyOnBook
                      ? 'Opening Checkout...'
                      : 'Creating Booking...'
                    : payImmediatelyOnBook && resolvedDropInfo.split.grossAmountInr >= 1
                    ? `Pay ${formatInr(resolvedDropInfo.split.grossAmountInr)} & Dispatch Booking →`
                    : 'Dispatch Pickup Booking →'}
                </button>
              </form>

              <div className="chart-card-modern" style={{ alignSelf: 'start', position: 'sticky', top: '20px' }}>
                <h3 className="card-top-title">Booking Summary &amp; Tube Manifest</h3>
                <div style={{ marginTop: '16px' }}>
                  <div className="network-list-item">
                    <span className="network-item-label">Pickup Origin</span>
                    <strong>{myLabFacility.name}</strong>
                  </div>
                  <div className="network-list-item">
                    <span className="network-item-label">Drop Destination</span>
                    <div style={{ textAlign: 'right' }}>
                      <strong>{resolvedDropInfo.targetLabName}</strong>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                        {formatLabel(dropMode)} • {resolvedDropInfo.distanceKm} km
                      </div>
                    </div>
                  </div>
                  <div className="network-list-item">
                    <span className="network-item-label">Specimens / Tubes Required</span>
                    <strong>{resolvedSpecimensForOrder.length}</strong>
                  </div>
                  {resolvedSpecimensForOrder.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '8px 0 12px' }}>
                      {resolvedSpecimensForOrder.map((spec) => {
                        const tm = TUBE_METADATA[spec.tubeType] || TUBE_METADATA[TubeType.SERUM_RED_GOLD];
                        return (
                          <span key={spec.code} className="tube-cap-pill" style={{ background: tm.bgHex, color: tm.colorHex }}>
                            <span className="tube-cap-dot" style={{ background: tm.colorHex }} />
                            {spec.code} ({tm.shortTag})
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {dropMode === 'LARGE_LAB' && activeQuote && activeQuote.matchedPackages.length > 0 && (
                    <div style={{ marginBottom: '10px' }}>
                      <span className="package-match-pill">
                        🎁 Matched: {activeQuote.matchedPackages.map((p) => p.code).join(', ')}
                      </span>
                    </div>
                  )}
                  <div className="network-list-item">
                    <span className="network-item-label">Tests / Package Tariff</span>
                    <strong>{formatInr(resolvedDropInfo.split.smallLabTestTotalInr)}</strong>
                  </div>
                  <div className="network-list-item">
                    <span className="network-item-label">
                      Cold-Chain Courier ({resolvedDropInfo.distanceKm} km)
                    </span>
                    <strong>{formatInr(resolvedDropInfo.split.courierFeeInr)}</strong>
                  </div>
                  {dropMode === 'LARGE_LAB' && (activeQuote?.packageSavingsInr || 0) > 0 && (
                    <div className="network-list-item">
                      <span className="network-item-label">Combo Package Savings</span>
                      <strong style={{ color: '#059669' }}>−{formatInr(activeQuote?.packageSavingsInr || 0)}</strong>
                    </div>
                  )}
                  <div className="network-list-item" style={{ borderTop: '2px solid #E2E8F0', paddingTop: '14px' }}>
                    <span style={{ fontWeight: 700 }}>Total Payable Settlement</span>
                    <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0D9488' }}>
                      {formatInr(resolvedDropInfo.split.grossAmountInr)}
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
                <h2 className="card-top-title">Live B2B Test &amp; Package Catalogue ({testCatalog.length})</h2>
              </div>
              {testCatalog.length === 0 ? (
                <div className="empty-state-box">
                  <h4>No Tests Published Yet</h4>
                  <p>Tests and combo packages appear here as soon as Admin or Reference Labs add them.</p>
                </div>
              ) : (
                <div className="data-table-container">
                  <table className="modern-data-table">
                    <thead>
                      <tr>
                        <th>Code &amp; Type</th>
                        <th>Test / Package Name</th>
                        <th>Partner Lab</th>
                        <th>Tube &amp; Specimen</th>
                        <th>Cold-Chain</th>
                        <th>TAT</th>
                        <th>Small Lab Rate</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {testCatalog.map((t) => {
                        const tubeMeta = TUBE_METADATA[t.tubeType] || TUBE_METADATA[TubeType.SERUM_RED_GOLD];
                        const cleanCode = t.code.trim().toUpperCase();
                        return (
                          <tr key={t.id}>
                            <td>
                              <strong>{cleanCode}</strong>
                              <div style={{ marginTop: '4px' }}>
                                <span className={t.itemType === 'PACKAGE' ? 'package-match-pill' : 'status-pill-blue'}>
                                  {t.itemType === 'PACKAGE' ? '📦 PACKAGE' : '🧪 TEST'}
                                </span>
                              </div>
                            </td>
                            <td>
                              <div><strong>{t.name}</strong></div>
                              <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{t.department}</div>
                              {t.itemType === 'PACKAGE' && t.includedTestCodes?.length ? (
                                <div style={{ fontSize: '0.72rem', color: '#1D4ED8', marginTop: '2px' }}>
                                  Includes: {t.includedTestCodes.join(', ')}
                                </div>
                              ) : null}
                            </td>
                            <td>{t.labName || 'All Partner Hubs'}</td>
                            <td>
                              <span className="tube-cap-pill" style={{ background: tubeMeta.bgHex, color: tubeMeta.colorHex }}>
                                <span className="tube-cap-dot" style={{ background: tubeMeta.colorHex }} />
                                {tubeMeta.capColorName}
                              </span>
                            </td>
                            <td><span className="status-pill-blue">{formatLabel(t.temperatureRequirement)}</span></td>
                            <td>{t.tatHours} hrs</td>
                            <td><strong>{formatInr(t.b2bPriceInr)}</strong></td>
                            <td>
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => {
                                  if (!selectedTestCodes.includes(cleanCode)) {
                                    setSelectedTestCodes((prev) => [...prev, cleanCode]);
                                  }
                                  if (t.ownerOrgId || t.labId) {
                                    setDropMode('LARGE_LAB');
                                    setSelectedOrgLabId(t.ownerOrgId || t.labId || '');
                                  }
                                  setActiveTab('new-booking');
                                }}
                              >
                                Add to Booking
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

          {/* TAB 5: PARTNER LABS */}
          {activeTab === 'partners' && (
            <div className="chart-card-modern">
              <div className="card-top-header">
                <h2 className="card-top-title">Verified Reference Hubs &amp; Collection Centers ({verifiedLargeLabs.length})</h2>
              </div>
              {verifiedLargeLabs.length === 0 ? (
                <div className="empty-state-box">
                  <h4>No Verified Large Reference Labs Yet</h4>
                  <p>Partner reference labs and branch centers appear here once added and verified by Platform Admin.</p>
                </div>
              ) : (
                <div className="data-table-container">
                  <table className="modern-data-table">
                    <thead>
                      <tr>
                        <th>Center ID</th>
                        <th>Facility Name &amp; Hierarchy</th>
                        <th>City, Pincode &amp; Distance</th>
                        <th>NABL / Accreditation</th>
                        <th>Cutoff Window</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {verifiedLargeLabs.map((l) => {
                        const distKm =
                          typeof l.latitude === 'number' && typeof l.longitude === 'number'
                            ? calculateHaversineDistanceKm(pickupLat, pickupLng, l.latitude, l.longitude)
                            : null;
                        return (
                          <tr key={l.id}>
                            <td><strong>{l.id}</strong></td>
                            <td>
                              <div><strong>{l.name}</strong></div>
                              <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                {l.centerType === 'COLLECTION_CENTER'
                                  ? `Branch of ${l.parentLabName || l.parentLabId}`
                                  : 'Main Reference Hub HQ'}
                              </div>
                            </td>
                            <td>
                              <div>{l.city} {l.pincode ? `• ${l.pincode}` : ''}</div>
                              <div style={{ fontSize: '0.72rem', color: '#0D9488' }}>
                                {l.address || 'Main Hub'} {distKm !== null ? `• ${distKm} km away` : ''}
                              </div>
                            </td>
                            <td>{l.nablNumber || 'NABL ISO 15189'}</td>
                            <td>{l.cutoffWindow || '08:30 PM Daily'}</td>
                            <td>
                              <button
                                type="button"
                                className="btn-primary"
                                onClick={() => {
                                  setDropMode('LARGE_LAB');
                                  setSelectedOrgLabId(l.parentLabId || l.id);
                                  setSelectedCenterLabId(l.id);
                                  setActiveTab('new-booking');
                                }}
                              >
                                Send Sample →
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

          {/* TAB 6: BOOKINGS & CUSTODY */}
          {activeTab === 'bookings' && (
            <div className="chart-card-modern">
              <div className="card-top-header">
                <div>
                  <h2 className="card-top-title">All Dispatch Bookings ({filteredOrders.length})</h2>
                  <p style={{ fontSize: '0.8rem', color: '#64748B' }}>Real-time tracking, live rider GPS, payment &amp; self-drop lab actions</p>
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
                        <th>Patient &amp; Tests</th>
                        <th>Drop Destination</th>
                        <th>Courier &amp; Live Proof</th>
                        <th>OTP / Payment</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((o) => {
                        const stl = settlements.find((s) => s.orderId === o.id);
                        const isSelfDrop = o.dropType === 'SELF_DROP' || o.targetLabId === myLabFacility.id;
                        const cancellable =
                          o.status === OrderStatus.CREATED ||
                          o.status === OrderStatus.READY_FOR_PICKUP ||
                          o.status === OrderStatus.ASSIGNED_TO_PHLEBO;
                        const canProcessSelf =
                          isSelfDrop &&
                          !isOrderCompleted(o.status) &&
                          o.status !== OrderStatus.CANCELLED &&
                          o.status !== OrderStatus.REJECTED;
                        const needsOnlinePay =
                          stl && stl.paymentStatus !== 'PAID' && stl.grossAmountInr >= 1 && o.paymentStatus !== 'PAID';

                        return (
                          <tr key={o.id}>
                            <td>
                              <strong>{o.orderNumber}</strong>
                              <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                {o.distanceKm ? `${o.distanceKm} km` : ''} {o.broadcastRadiusKm ? `• ${o.broadcastRadiusKm}km pool` : ''}
                              </div>
                            </td>
                            <td>
                              <div><strong>{o.patient.pseudonym}</strong></div>
                              <div style={{ fontSize: '0.74rem', color: '#475569' }}>
                                {o.specimens.map((s) => s.testCode).join(', ')}
                              </div>
                              {o.matchedPackageNames?.length ? (
                                <span className="package-match-pill" style={{ padding: '1px 6px', fontSize: '0.68rem', marginTop: '3px' }}>
                                  🎁 {o.matchedPackageNames[0]}
                                </span>
                              ) : null}
                            </td>
                            <td>
                              <div><strong>{o.targetLabName}</strong></div>
                              <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                {isSelfDrop ? 'Self Lab Return' : o.dropType === 'CUSTOM_ADDRESS' ? 'Custom Address' : 'Partner Large Lab'}
                              </div>
                            </td>
                            <td>
                              <div><strong>{o.phlebotomistName || 'Open Broadcast Pool'}</strong></div>
                              <div style={{ fontSize: '0.72rem', color: '#0D9488', display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
                                {o.phleboLiveLocation && <span>📍 Live GPS</span>}
                                {o.sampleCollectionPhotoUrl && <span>📷 Sample Photo</span>}
                              </div>
                            </td>
                            <td>
                              <div><code>{o.handoverOtp || '—'}</code></div>
                              <div style={{ marginTop: '4px' }}>
                                <span className={o.paymentStatus === 'PAID' || stl?.paymentStatus === 'PAID' ? 'status-pill-green' : 'status-pill-amber'}>
                                  {o.paymentStatus === 'PAID' || stl?.paymentStatus === 'PAID'
                                    ? `Paid ${formatInr(stl?.grossAmountInr || o.totalAmountInr || 0)}`
                                    : `Due ${formatInr(stl?.grossAmountInr || o.totalAmountInr || 0)}`}
                                </span>
                              </div>
                            </td>
                            <td><span className="status-pill-blue">{formatOrderStatus(o.status)}</span></td>
                            <td>
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                <button type="button" className="btn-secondary" onClick={() => setCustodyModalOrder(o)}>
                                  {o.phleboLiveLocation ? '📍 Live / Custody' : 'Track Custody'}
                                </button>
                                {needsOnlinePay && stl && (
                                  <button
                                    type="button"
                                    className="btn-primary"
                                    disabled={payingSettlementId === stl.id}
                                    onClick={() => void handlePaySettlement(stl)}
                                  >
                                    {payingSettlementId === stl.id ? 'Opening...' : 'Pay Now'}
                                  </button>
                                )}
                                {canProcessSelf && (
                                  <>
                                    <button
                                      type="button"
                                      className="btn-secondary"
                                      onClick={() => {
                                        setSelfQcOrder(o);
                                        setSelfQcTemp(String(o.arrivalTemperatureCelsius ?? '4.2'));
                                        setSelfQcQuality(o.qualityStatus || SpecimenQualityStatus.INTACT);
                                      }}
                                    >
                                      Perform QC
                                    </button>
                                    {o.status === OrderStatus.DELIVERED_TO_LAB && (
                                      <button type="button" className="btn-secondary" onClick={() => void handleSelfStartRun(o)}>
                                        Start Run
                                      </button>
                                    )}
                                    <button type="button" className="btn-primary" onClick={() => setSelfReportOrder(o)}>
                                      Upload Report
                                    </button>
                                  </>
                                )}
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
                              </div>
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
                <h2 className="card-top-title">Diagnostic Reports Ready for Download &amp; Print ({reports.length})</h2>
              </div>
              {reports.length === 0 ? (
                <div className="empty-state-box">
                  <h4>No Verified Reports Available Yet</h4>
                  <p>Once your Partner Reference Lab (or your Self-Drop Lab desk) uploads a pathologist-verified report, it appears here immediately.</p>
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
                        <th>Processing Lab</th>
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
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              <button type="button" className="btn-secondary" onClick={() => setPrintingReport(r)}>
                                🖨️ View &amp; Print
                              </button>
                              <a href={r.downloadUrl} target="_blank" rel="noreferrer" className="btn-primary" style={{ textDecoration: 'none' }}>
                                Download PDF
                              </a>
                            </div>
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
                  <div><strong>1. Vacutainer Cap Match:</strong> Match every test vial color (EDTA Purple, SST Red/Gold, Fluoride Grey) before sealing chiller pouch.</div>
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

      {/* MODAL: CUSTODY TIMELINE, LIVE GPS & BARCODE AUDIT */}
      {custodyModalOrder && (() => {
        const liveOrder = orders.find((o) => o.id === custodyModalOrder.id) || custodyModalOrder;
        return (
          <div className="modal-overlay" onClick={() => setCustodyModalOrder(null)}>
            <div className="modal-card" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Live Tracking &amp; Custody • {liveOrder.orderNumber}</h3>
                <button type="button" className="btn-secondary" onClick={() => setCustodyModalOrder(null)}>✕</button>
              </div>
              <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
                <div className="live-route-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A' }}>
                        🏍️ {liveOrder.phlebotomistName || 'Broadcasting in 1–5 km Pool'}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                        Status: <strong>{formatOrderStatus(liveOrder.status)}</strong> • Handover OTP: <code>{liveOrder.handoverOtp || '—'}</code>
                      </div>
                      <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: '2px' }}>
                        Patient: <strong>{liveOrder.patient.pseudonym}</strong> &rarr; Drop: <strong>{liveOrder.targetLabName}</strong>
                      </div>
                      {liveOrder.phleboLiveLocation && (
                        <div style={{ fontSize: '0.75rem', color: '#0F766E', marginTop: '4px' }}>
                          Live GPS: {liveOrder.phleboLiveLocation.latitude.toFixed(5)}, {liveOrder.phleboLiveLocation.longitude.toFixed(5)}
                          {liveOrder.phleboLiveLocation.updatedAt
                            ? ` • Updated ${new Date(liveOrder.phleboLiveLocation.updatedAt).toLocaleTimeString('en-IN')}`
                            : ''}
                        </div>
                      )}
                    </div>
                    {liveOrder.phleboLiveLocation && (
                      <a
                        className="btn-primary"
                        style={{ textDecoration: 'none', fontSize: '0.78rem' }}
                        href={`https://www.google.com/maps/dir/?api=1&origin=${liveOrder.phleboLiveLocation.latitude},${liveOrder.phleboLiveLocation.longitude}&destination=${
                          liveOrder.deliveryLocation?.latitude || pickupLat
                        },${liveOrder.deliveryLocation?.longitude || pickupLng}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        🗺️ Open Live Route Map
                      </a>
                    )}
                  </div>
                </div>

                {liveOrder.sampleCollectionPhotoUrl && (
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>Phlebotomist Sample Collection Photo</div>
                    <a href={liveOrder.sampleCollectionPhotoUrl} target="_blank" rel="noreferrer">
                      <img src={liveOrder.sampleCollectionPhotoUrl} alt="Collected sample proof" className="sample-proof-thumb" />
                    </a>
                  </div>
                )}

                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: '8px' }}>Tube &amp; Barcode Validation</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {liveOrder.specimens.map((s) => {
                      const tm = TUBE_METADATA[s.tubeType] || TUBE_METADATA[TubeType.SERUM_RED_GOLD];
                      return (
                        <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0', fontSize: '0.78rem', flexWrap: 'wrap', gap: '6px' }}>
                          <div>
                            <span className="tube-cap-pill" style={{ background: tm.bgHex, color: tm.colorHex, marginRight: '8px' }}>
                              <span className="tube-cap-dot" style={{ background: tm.colorHex }} />
                              {tm.capColorName}
                            </span>
                            <strong>{s.testCode}</strong> — <code>{s.scannedBarcode || s.barcode}</code>
                          </div>
                          <span className={s.validationStatus === 'VERIFIED' ? 'status-pill-green' : s.validationStatus === 'MISMATCH' ? 'status-pill-red' : 'status-pill-amber'}>
                            {s.validationStatus === 'VERIFIED' ? 'Matched ✓' : s.validationStatus === 'MISMATCH' ? 'Tube Mismatch' : 'Pending Scan'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: '8px' }}>Chain of Custody History</div>
                {(liveOrder.custodyHistory || []).length === 0 ? (
                  <p style={{ color: '#64748B', fontSize: '0.84rem' }}>No custody scan events yet.</p>
                ) : (
                  liveOrder.custodyHistory.map((ev) => (
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
        );
      })()}

      {/* MODAL: SELF-DROP RECEIVING QC */}
      {selfQcOrder && (
        <div className="modal-overlay" onClick={() => setSelfQcOrder(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Mark Self-Drop Sample Received • {selfQcOrder.orderNumber}</h3>
              <button type="button" className="btn-secondary" onClick={() => setSelfQcOrder(null)}>✕</button>
            </div>
            <form onSubmit={(e) => void handleSelfDropQcSubmit(e)}>
              <div className="modal-body">
                <p style={{ fontSize: '0.82rem', color: '#475569', marginBottom: '12px' }}>
                  Confirm receipt at <strong>{myLabFacility.name}</strong> and log cold-chain cooler check.
                </p>
                <div className="form-group">
                  <label className="form-label">Arrival Temperature (°C)</label>
                  <input type="number" step="0.1" className="form-input" value={selfQcTemp} onChange={(e) => setSelfQcTemp(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Specimen Integrity Status</label>
                  <select className="form-select" value={selfQcQuality} onChange={(e) => setSelfQcQuality(e.target.value as SpecimenQualityStatus)}>
                    {Object.values(SpecimenQualityStatus).map((st) => (
                      <option key={st} value={st}>{formatLabel(st)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setSelfQcOrder(null)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={submittingSelfQc}>
                  {submittingSelfQc ? 'Saving...' : 'Mark Received & Passed QC'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SELF-DROP UPLOAD REPORT */}
      {selfReportOrder && (
        <div className="modal-overlay" onClick={() => setSelfReportOrder(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Upload In-House Report • {selfReportOrder.orderNumber}</h3>
              <button type="button" className="btn-secondary" onClick={() => setSelfReportOrder(null)}>✕</button>
            </div>
            <form onSubmit={(e) => void handleSelfPublishReport(e)}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Signing Pathologist / Lab Signatory</label>
                  <input className="form-input" value={selfPathologistName} onChange={(e) => setSelfPathologistName(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Verified Report File (PDF / Document)</label>
                  <input type="file" accept=".pdf,.png,.jpg,.txt" className="form-input" onChange={(e) => setSelfReportFile(e.target.files?.[0] || null)} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setSelfReportOrder(null)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={uploadingSelfReport}>
                  {uploadingSelfReport ? 'Uploading...' : 'Publish Verified Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PRINTABLE DIAGNOSTIC REPORT SHEET */}
      {printingReport && (
        <div className="modal-overlay" onClick={() => setPrintingReport(null)}>
          <div className="modal-card" style={{ maxWidth: '720px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header no-print">
              <h3>Diagnostic Report Preview • {printingReport.orderNumber}</h3>
              <button type="button" className="btn-secondary" onClick={() => setPrintingReport(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '78vh', overflowY: 'auto' }}>
              <div className="printable-report-sheet">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0F172A', paddingBottom: '14px', marginBottom: '16px' }}>
                  <div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>{printingReport.targetLabName}</div>
                    <div style={{ fontSize: '0.8rem', color: '#475569' }}>Diagnostic Processing Facility • LabSetu Partner Network</div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '0.78rem', color: '#475569' }}>
                    <div><strong>Report ID:</strong> {printingReport.id}</div>
                    <div><strong>Booking Ref:</strong> {printingReport.orderNumber}</div>
                    <div><strong>Verified:</strong> {new Date(printingReport.verifiedAt || printingReport.createdAt).toLocaleString('en-IN')}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '0.84rem' }}>
                  <div><strong>Patient:</strong> {printingReport.patientName}</div>
                  <div><strong>Patient ID:</strong> {printingReport.patientId}</div>
                  <div><strong>Referring Collection Center:</strong> {printingReport.smallLabName}</div>
                  <div><strong>Specimen Quality:</strong> {formatLabel(printingReport.qualityStatus || SpecimenQualityStatus.INTACT)}</div>
                </div>

                <div style={{ marginBottom: '18px' }}>
                  <div style={{ fontSize: '0.86rem', fontWeight: 700, marginBottom: '8px', color: '#0F172A' }}>
                    Authorized Diagnostic Panels / Tests Performed
                  </div>
                  <div style={{ padding: '12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '0.86rem', lineHeight: 1.6 }}>
                    {printingReport.testsSummary}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid #CBD5E1', paddingTop: '16px', marginTop: '24px', fontSize: '0.82rem' }}>
                  <div style={{ color: '#64748B' }}>
                    File Attachment: <strong>{printingReport.fileName}</strong>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, color: '#0F172A' }}>{printingReport.pathologistName}</div>
                    <div style={{ fontSize: '0.74rem', color: '#64748B' }}>Authorized Signatory / MD Pathologist</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer no-print">
              <a href={printingReport.downloadUrl} target="_blank" rel="noreferrer" className="btn-secondary" style={{ textDecoration: 'none' }}>
                ⬇️ Download Attached PDF
              </a>
              <button type="button" className="btn-primary" onClick={() => window.print()}>
                🖨️ Print Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
