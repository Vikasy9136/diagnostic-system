import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  calculateHaversineDistanceKm,
  type CommissionConfig,
  computeBookingTrendPoints,
  computeDailyVolumeBars,
  computeOrderPricingSplit,
  computeStatusBreakdown,
  CustodyEventType,
  type DiagnosticReportRecord,
  type DiagnosticTestItem,
  type DropDestinationType,
  evaluateLargeLabQuotesForSelection,
  evaluatePointServiceCoverage,
  formatInr,
  inferRequiredTubeForTestCode,
  isOrderCompleted,
  type LabFacility,
  LOCALITY_GPS_PRESETS,
  OrderPriority,
  OrderStatus,
  type PatientRecord,
  type PaymentSlipData,
  type PhlebotomistProfile,
  type PickupOrder,
  type PlatformNotification,
  DEFAULT_SUPPORT_CONTACTS,
  type SupportContactsConfig,
  type PlatformSopDocument,
  type PlatformFaqDocument,
  ROLE_LABELS,
  type ServiceZoneRecord,
  type SettlementRecord,
  SpecimenQualityStatus,
  SpecimenType,
  StorageTemperature,
  UserRole,
  getSmallLabPath,
  getSmallLabTitle,
  resolveSmallLabTab,
} from '@diagnostic/shared';
import { type VerifiedPortalSession } from '../components/LoginPage';
import { DashboardShell, OrderLiveTrackingModal, PaymentSlipModal } from '../components/shared';
import { useDashboardPageRouter } from './useDashboardPageRouter';
import {
  cancelSmallLabOrder,
  createLiveBooking,
  DEFAULT_COMMISSION_CONFIG,
  markOrderPaidByLab,
  retryOrderBroadcast,
  savePatientRecord,
  subscribeLabs,
  subscribeNotifications,
  subscribeOrders,
  subscribePatients,
  subscribePhlebotomists,
  subscribePlatformFaqs,
  subscribePlatformSops,
  subscribeReports,
  subscribeServiceZones,
  subscribeSettings,
  subscribeSettlements,
  subscribeSupportContacts,
  subscribeTestCatalog,
  updateOrderCustodyTransition,
} from '../services/firestoreService';
import { startRazorpayBookingCheckout } from '../services/razorpayCheckout';
import {
  type ResolvedDropInfo,
  type SelectableCatalogEntry,
  SmallLabAddPatientModal,
  SmallLabBookingsTab,
  SmallLabCatalogueTab,
  type SmallLabMetrics,
  SmallLabNewBookingTab,
  SmallLabOverviewTab,
  SmallLabPartnersTab,
  SmallLabPatientsTab,
  SmallLabPaymentsTab,
  SmallLabPrintBarcodesModal,
  SmallLabPrintReportModal,
  SmallLabReportsTab,
  SmallLabSelfQcModal,
  SmallLabSupportTab,
  type SmallLabTab,
} from './small-lab';
import {
  type AlertTriggerFn,
  formatDashboardLabel,
  type SidebarNavItem,
} from './types';

export type { AlertTriggerFn };

interface SmallLabDashboardProps {
  session: VerifiedPortalSession;
  onSignOut: () => void;
  onShowAlert: AlertTriggerFn;
}

export function SmallLabDashboard({
  session,
  onSignOut,
  onShowAlert,
}: SmallLabDashboardProps) {
  const { activeTab, setActiveTab, getPathForTab } = useDashboardPageRouter<SmallLabTab>({
    resolveTabFromPath: resolveSmallLabTab,
    resolvePathForTab: getSmallLabPath,
    resolveTitleForTab: getSmallLabTitle,
    defaultTab: 'dashboard',
    baseRoleQuery: session.profile.role,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [trendDays, setTrendDays] = useState<7 | 30>(30);

  // Live Data States (ZERO dummy data)
  const [labs, setLabs] = useState<LabFacility[]>([]);
  const [phlebotomists, setPhlebotomists] = useState<PhlebotomistProfile[]>([]);
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [testCatalog, setTestCatalog] = useState<DiagnosticTestItem[]>([]);
  const [orders, setOrders] = useState<PickupOrder[]>([]);
  const [reports, setReports] = useState<DiagnosticReportRecord[]>([]);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [notifications, setNotifications] = useState<PlatformNotification[]>([]);
  const [serviceZones, setServiceZones] = useState<ServiceZoneRecord[]>([]);
  const [commConfig, setCommConfig] = useState<CommissionConfig>(DEFAULT_COMMISSION_CONFIG);

  // Booking filters, Custody & Report Modals
  const [orderFilter, setOrderFilter] = useState<string>('ALL');
  const [custodyModalOrder, setCustodyModalOrder] = useState<PickupOrder | null>(null);
  const [printingReport, setPrintingReport] = useState<DiagnosticReportRecord | null>(null);
  const [barcodeOrderToPrint, setBarcodeOrderToPrint] = useState<PickupOrder | null>(null);

  // Self-Drop Lab QC & Report Modals (when dropType === 'SELF_DROP')
  const [selfQcOrder, setSelfQcOrder] = useState<PickupOrder | null>(null);
  const [selfQcTemp, setSelfQcTemp] = useState('4.2');
  const [selfQcQuality, setSelfQcQuality] = useState<SpecimenQualityStatus>(SpecimenQualityStatus.INTACT);
  const [submittingSelfQc, setSubmittingSelfQc] = useState(false);

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
  const [adhocPatientPhone, setAdhocPatientPhone] = useState('');
  const [adhocPatientAlternatePhone, setAdhocPatientAlternatePhone] = useState('');
  const [clinicalNote, setClinicalNote] = useState('');
  const [testSearchQuery, setTestSearchQuery] = useState('');
  const [selectedTestCodes, setSelectedTestCodes] = useState<string[]>([]);
  const [selectedOrgLabId, setSelectedOrgLabId] = useState<string>('');
  const [selectedCenterLabId, setSelectedCenterLabId] = useState<string>('');
  const [dropMode, setDropMode] = useState<DropDestinationType>('LARGE_LAB');
  const [pickupAddress, setPickupAddress] = useState<string>('');
  const [pickupPincode, setPickupPincode] = useState<string>('');
  const [pickupLat, setPickupLat] = useState<number>(LOCALITY_GPS_PRESETS[0].latitude);
  const [pickupLng, setPickupLng] = useState<number>(LOCALITY_GPS_PRESETS[0].longitude);
  const [pickupLocationInitialized, setPickupLocationInitialized] = useState(false);
  const [customDropName, setCustomDropName] = useState<string>('');
  const [customDropAddress, setCustomDropAddress] = useState<string>('');
  const [customDropPincode, setCustomDropPincode] = useState<string>('');
  const [customDropLat, setCustomDropLat] = useState<number>(LOCALITY_GPS_PRESETS[1].latitude);
  const [customDropLng, setCustomDropLng] = useState<number>(LOCALITY_GPS_PRESETS[1].longitude);
  const [broadcastRadiusKm, setBroadcastRadiusKm] = useState<number>(5);
  const [selectedPhleboId, setSelectedPhleboId] = useState<string>('');
  const [bookingPriority, setBookingPriority] = useState<OrderPriority>(OrderPriority.ROUTINE);
  const [pickupSlot, setPickupSlot] = useState<string>('Within 45 Mins (Express)');
  const [payImmediatelyOnBook, setPayImmediatelyOnBook] = useState(true);
  const [payingSettlementId, setPayingSettlementId] = useState<string | null>(null);
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [bookingStep, setBookingStep] = useState<1 | 2 | 3 | 4>(1);
  const [currentPaymentSlip, setCurrentPaymentSlip] = useState<PaymentSlipData | null>(null);
  const [supportContacts, setSupportContacts] = useState<SupportContactsConfig>(DEFAULT_SUPPORT_CONTACTS);
  const [platformSops, setPlatformSops] = useState<PlatformSopDocument[]>([]);
  const [platformFaqs, setPlatformFaqs] = useState<PlatformFaqDocument[]>([]);

  useEffect(() => {
    if (!session.firebaseUser) return;
    const noop = () => {};
    const unsubs = [
      subscribeLabs(setLabs),
      subscribePhlebotomists(setPhlebotomists),
      subscribePatients(session.profile, setPatients, undefined, session.profile.labId),
      subscribeTestCatalog(setTestCatalog),
      subscribeOrders(session.profile, setOrders),
      subscribeReports(session.profile, setReports),
      subscribeSettlements(session.profile, setSettlements),
      subscribeNotifications(session.profile, setNotifications),
      subscribeServiceZones(setServiceZones),
      subscribeSupportContacts(setSupportContacts, noop),
      subscribePlatformSops(setPlatformSops, noop),
      subscribePlatformFaqs(setPlatformFaqs, noop),
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

  const myLabFacility = useMemo<LabFacility>(() => {
    if (session.profile.labId) {
      const exact = labs.find((l) => l.id === session.profile.labId);
      if (exact) return exact;
    }
    return {
      id: session.profile.labId || `LAB-SM-${session.profile.id.slice(0, 6)}`,
      name: session.profile.displayName || 'Small Collection Center',
      type: 'SMALL_LAB',
      city: 'Mumbai',
      address: `${session.profile.displayName} Collection Point`,
      latitude: LOCALITY_GPS_PRESETS[0].latitude,
      longitude: LOCALITY_GPS_PRESETS[0].longitude,
      phone: session.profile.phoneNumber || '',
      email: session.profile.email,
      verified: true,
      verificationStatus: 'VERIFIED',
      createdAt: session.profile.createdAt,
      updatedAt: session.profile.updatedAt,
    };
  }, [labs, session.profile]);

  useEffect(() => {
    if (!pickupLocationInitialized && myLabFacility) {
      setPickupAddress(myLabFacility.address || `${myLabFacility.name}, ${myLabFacility.city}`);
      if (myLabFacility.pincode) setPickupPincode(myLabFacility.pincode);
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

  const isSuspendedForUnsettledFees = useMemo(() => {
    const due = Number(myLabFacility.pendingPlatformFeeDueInr) || 0;
    if (due <= 0 || !myLabFacility.unsettledCashSince) return false;
    const daysSince = (Date.now() - new Date(myLabFacility.unsettledCashSince).getTime()) / 86400000;
    return daysSince >= 15;
  }, [myLabFacility]);

  const selectableCatalogEntries = useMemo<SelectableCatalogEntry[]>(() => {
    const byCode = new Map<string, SelectableCatalogEntry>();

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

  const rankedLargeLabQuotes = useMemo(() => {
    if (expandedRequestedCodes.length === 0) return [];
    return evaluateLargeLabQuotesForSelection({
      requestedTestCodes: expandedRequestedCodes,
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

  useEffect(() => {
    if (rankedLargeLabQuotes.length > 0) {
      const currentValid = rankedLargeLabQuotes.find((q) => q.orgLabId === selectedOrgLabId);
      const best = currentValid || rankedLargeLabQuotes[0];
      if (best.orgLabId !== selectedOrgLabId) {
        setSelectedOrgLabId(best.orgLabId);
        setSelectedCenterLabId(best.nearestCenter.id);
      } else if (!best.centers.some((c) => c.lab.id === selectedCenterLabId)) {
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

  const resolvedDropInfo = useMemo<ResolvedDropInfo>(() => {
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
      const distKm = calculateHaversineDistanceKm(pickupLat, pickupLng, customDropLat, customDropLng);
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
      targetParentLabId:
        center?.parentLabId || (activeQuote?.orgLabId !== center?.id ? activeQuote?.orgLabId : undefined),
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

  const pickupCoverage = useMemo(
    () =>
      evaluatePointServiceCoverage(
        serviceZones,
        pickupLat,
        pickupLng,
        pickupPincode.trim() || undefined
      ),
    [serviceZones, pickupLat, pickupLng, pickupPincode]
  );

  const metrics: SmallLabMetrics = useMemo(() => {
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

  const myLabPatients = useMemo(
    () => patients.filter((p) => p.smallLabId === myLabFacility.id),
    [patients, myLabFacility.id]
  );

  const filteredPatients = myLabPatients.filter(
    (p) =>
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      p.phone.toLowerCase().includes(q)
  );

  async function handleRetryBroadcast(orderId: string, hikeInr: number = 0) {
    try {
      const updated = await retryOrderBroadcast(orderId, hikeInr);
      setCustodyModalOrder(updated);
      onShowAlert({
        variant: 'success',
        title: hikeInr > 0 ? `Price Hike +₹${hikeInr} Dispatched` : 'Pickup Broadcast Retried',
        message: hikeInr > 0
          ? `Rider payout boosted to ₹${updated.courierFeeInr}. Alert re-sent to nearby phlebotomists!`
          : 'Search restarted for 45 seconds with nearby phlebotomists.',
      });
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Retry Failed',
        message: (err as Error).message || 'Could not retry broadcast.',
      });
    }
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

    const chosenPatient = myLabPatients.find((p) => p.id === selectedPatientId);
    const resolvedPhone = (chosenPatient?.phone || adhocPatientPhone.trim()) || '';
    const resolvedAltPhone = adhocPatientAlternatePhone.trim();
    const resolvedNote = clinicalNote.trim();

    const patientPayload = {
      id: chosenPatient ? chosenPatient.id : `PT-ADHOC-${Date.now().toString().slice(-4)}`,
      pseudonym: chosenPatient ? chosenPatient.name : adhocPatientName.trim(),
      age: chosenPatient ? chosenPatient.age : (Number(adhocPatientAge) || 35),
      gender: chosenPatient ? chosenPatient.gender : adhocPatientGender,
      ...(resolvedPhone ? { phone: resolvedPhone } : {}),
      ...(resolvedAltPhone ? { alternatePhone: resolvedAltPhone } : {}),
      ...(resolvedNote ? { clinicalNote: resolvedNote } : {}),
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

    // If outside standard pre-enrolled service zones, proceed via Flexible Pilot Dispatch to nearby riders
    if (!pickupCoverage.covered) {
      onShowAlert({
        variant: 'info',
        title: 'Flexible Fleet Radar Dispatch',
        message: `Pincode ${pickupPincode || 'entered'} is in expansion mode. Request will be broadcast to all nearby online phlebotomists within ${broadcastRadiusKm} km!`,
      });
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
          pincode: pickupPincode.trim() || undefined,
          latitude: pickupLat,
          longitude: pickupLng,
          contactName: myLabFacility.name,
          contactPhone: myLabFacility.phone,
        },
        deliveryLocation: {
          address: resolvedDropInfo.deliveryAddress,
          ...(dropMode === 'CUSTOM_ADDRESS' && customDropPincode.trim()
            ? { pincode: customDropPincode.trim() }
            : {}),
          latitude: resolvedDropInfo.deliveryLat,
          longitude: resolvedDropInfo.deliveryLng,
          contactName: resolvedDropInfo.targetLabName,
        },
        serviceZones,
        phlebotomist: chosenPhlebo ? { id: chosenPhlebo.id, name: chosenPhlebo.name } : null,
        selectedTests: resolvedSpecimensForOrder,
        smallLabPayableTestTotalInr: resolvedDropInfo.split.smallLabTestTotalInr,
        largeLabB2bTotalInr: dropMode === 'LARGE_LAB' ? resolvedDropInfo.split.labPayoutInr : 0,
        matchedPackageNames:
          dropMode === 'LARGE_LAB' && activeQuote?.matchedPackages.length
            ? activeQuote.matchedPackages.map((p) => `${p.name} (${p.code})`)
            : undefined,
        packageSavingsInr: dropMode === 'LARGE_LAB' ? activeQuote?.packageSavingsInr : undefined,
        distanceKm: resolvedDropInfo.distanceKm,
        broadcastRadiusKm,
        priority: bookingPriority,
        scheduledPickupAt: pickupSlot,
        commissionConfig: commConfig,
      });

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
            // Payment succeeded: now safely clear booking inputs
            setSelectedTestCodes([]);
            setAdhocPatientName('');
            setAdhocPatientPhone('');
            setAdhocPatientAlternatePhone('');
            setClinicalNote('');
            setBookingStep(1);

            try {
              await markOrderPaidByLab({
                orderId: created.id,
                actorEmail: session.profile.email,
                actorName: session.profile.displayName,
                paymentMethod: 'UPI_AT_LAB',
                notes: `Razorpay Online #${checkoutRes.result.paymentId}`,
              });
            } catch (markErr) {
              console.warn('Failed to auto-mark order paid:', markErr);
            }

            const grossInr = created.totalAmountInr || resolvedDropInfo.split.grossAmountInr;
            const phleboFeeInr = created.courierFeeInr || resolvedDropInfo.split.courierFeeInr || 0;
            const slipData: PaymentSlipData = {
              receiptNumber: `RCP-${created.orderNumber.replace('BK-', '')}-${Date.now().toString().slice(-4)}`,
              paymentId: checkoutRes.result.paymentId,
              orderId: created.id,
              orderNumber: created.orderNumber,
              paidAt: new Date().toISOString(),
              paymentMethod: 'Razorpay Online (UPI/Card/NetBanking)',
              amountInr: grossInr,
              payerName: myLabFacility.name,
              payerRole: 'Referring Diagnostic Center',
              payerId: myLabFacility.id,
              payerPhone: myLabFacility.phone,
              payerAddress: `${myLabFacility.address}, ${myLabFacility.pincode}`,
              receiverName: resolvedDropInfo.targetLabName,
              receiverRole: dropMode === 'LARGE_LAB' ? 'Testing Hub Lab' : 'Own Facility Processing',
              receiverId: resolvedDropInfo.targetLabId,
              receiverAddress: resolvedDropInfo.deliveryAddress,
              patientName: created.patient?.pseudonym || 'Patient',
              patientAge: created.patient?.age,
              patientGender: created.patient?.gender,
              patientId: created.patient?.id,
              items: (created.specimens || []).map((s) => ({
                code: s.testCode,
                name: s.testName,
                specimenType: s.specimenType,
                rateInr: 0,
              })),
              logisticsFeeInr: phleboFeeInr,
              subtotalInr: Math.max(0, grossInr - phleboFeeInr),
              totalAmountInr: grossInr,
              status: 'PAID',
              notes: `Broadcast Radius: ${broadcastRadiusKm} km • Handover Receiving OTP: ${created.handoverOtp}`,
            };

            setCurrentPaymentSlip(slipData);
            setActiveTab('bookings');
            setCustodyModalOrder(created);
            onShowAlert({
              variant: 'success',
              title: `Payment Confirmed & Booking ${created.orderNumber} Dispatched`,
              message: `Razorpay payment (${checkoutRes.result.paymentId}) verified. Official digital receipt generated!`,
              detail: `Handover Receiving OTP: ${created.handoverOtp} • Destination: ${resolvedDropInfo.targetLabName}`,
            });
          } else {
            // Payment was cancelled or dismissed by user!
            // CRITICAL: DO NOT CLEAR FORM STATE. Stay on Step 4 so user can retry or switch payment mode!
            setActiveTab('new-booking');
            setBookingStep(4);
            onShowAlert({
              variant: 'warning',
              title: `Payment Cancelled — Booking Details Preserved`,
              message:
                checkoutRes.message ||
                'Payment window was closed or cancelled. All patient details, selected tests, and quotes are preserved on Step 4.',
              detail: `Booking ${created.orderNumber} is registered. You can retry paying now or switch to Pay on Invoice.`,
            });
          }
        } catch (payErr) {
          // Keep form on Step 4
          setActiveTab('new-booking');
          setBookingStep(4);
          onShowAlert({
            variant: 'error',
            title: `Payment Incomplete (${created.orderNumber})`,
            message:
              payErr instanceof Error
                ? payErr.message
                : 'Payment checkout encountered an issue. Your booking details are preserved on Step 4.',
            detail: `You can retry checkout or switch to Pay Later / Invoicing.`,
          });
        }
      } else {
        // Pay on Invoice / Pay Later
        setSelectedTestCodes([]);
        setAdhocPatientName('');
        setAdhocPatientPhone('');
        setAdhocPatientAlternatePhone('');
        setClinicalNote('');
        setBookingStep(1);

        setActiveTab('bookings');
        setCustodyModalOrder(created);
        onShowAlert({
          variant: 'success',
          title: `Booking ${created.orderNumber} Dispatched (Pay on Invoice)`,
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
        notes: `Self-Drop Sample Marked Received & QC Passed (${formatDashboardLabel(selfQcQuality)}) at ${numericTemp}°C`,
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

  function handleMarkPaidByLab(order: PickupOrder) {
    onShowAlert({
      variant: 'confirm',
      title: `Mark Booking ${order.orderNumber} as Paid?`,
      message: `Confirm that patient or lab settled ${formatInr(order.totalAmountInr || 0)} directly with your lab. The phlebotomist will not be asked to collect payment from the patient.`,
      onConfirm: async () => {
        try {
          await markOrderPaidByLab({
            orderId: order.id,
            actorEmail: session.profile.email,
            actorName: session.profile.displayName,
            paymentMethod: 'DIRECT_LAB_SETTLEMENT',
          });
          onShowAlert({
            variant: 'success',
            title: `Booking ${order.orderNumber} Marked as Paid`,
            message: 'Payment status updated to PAID. Phlebotomist app will reflect this live and will not prompt for payment.',
          });
        } catch (err) {
          onShowAlert({
            variant: 'error',
            title: 'Update Failed',
            message: (err as Error).message || 'Could not update payment status.',
          });
        }
      },
    });
  }

  function toggleTestCodeSelection(code: string) {
    const clean = code.trim().toUpperCase();
    setSelectedTestCodes((prev) =>
      prev.includes(clean) ? prev.filter((c) => c !== clean) : [...prev, clean]
    );
  }

  function handleViewOrderPaymentSlip(order: PickupOrder) {
    if (order.paymentStatus !== 'PAID') {
      onShowAlert({
        variant: 'info',
        title: 'Payment Pending',
        message: 'Official digital payment receipt can only be generated after payment has been completed and verified.',
      });
      return;
    }
    const grossInr = order.totalAmountInr || 0;
    const phleboFeeInr = order.courierFeeInr || 0;
    const slipData: PaymentSlipData = {
      receiptNumber: `RCP-${order.orderNumber.replace('BK-', '')}`,
      paymentId: order.paymentStatus === 'PAID' ? 'ONLINE-VERIFIED' : 'INV-SETTLED',
      orderId: order.id,
      orderNumber: order.orderNumber,
      paidAt: order.updatedAt || order.createdAt,
      paymentMethod: order.paymentStatus === 'PAID' ? 'Razorpay Online' : 'Consolidated Lab Invoicing',
      amountInr: grossInr,
      payerName: order.smallLabName || myLabFacility.name,
      payerRole: 'Referring Diagnostic Center',
      payerId: order.smallLabId || myLabFacility.id,
      payerAddress: `${myLabFacility.address}, ${myLabFacility.pincode}`,
      receiverName: order.targetLabName,
      receiverRole: order.dropType === 'LARGE_LAB' ? 'Testing Hub Lab' : 'Own Facility Processing',
      receiverId: order.targetLabId,
      patientName: order.patient?.pseudonym || 'Patient',
      patientAge: order.patient?.age,
      patientGender: order.patient?.gender,
      patientId: order.patient?.id,
      items: (order.specimens || []).map((s) => ({
        code: s.testCode,
        name: s.testName,
        specimenType: s.specimenType,
        rateInr: 0,
      })),
      logisticsFeeInr: phleboFeeInr,
      subtotalInr: Math.max(0, grossInr - phleboFeeInr),
      totalAmountInr: grossInr,
      status: 'PAID',
      notes: `Handover OTP: ${order.handoverOtp}`,
    };
    setCurrentPaymentSlip(slipData);
  }

  function handleViewSettlementPaymentSlip(settlement: SettlementRecord) {
    const matchingOrder = orders.find((o) => o.id === settlement.orderId);
    const grossInr = settlement.grossAmountInr || 0;
    const phleboFeeInr = settlement.phleboPayoutInr || 0;
    const slipData: PaymentSlipData = {
      receiptNumber: `RCP-${settlement.id.replace('STL-', '')}`,
      paymentId: settlement.razorpayPaymentId || 'SETTLEMENT-VERIFIED',
      orderId: settlement.orderId,
      orderNumber: settlement.orderNumber,
      paidAt: settlement.createdAt,
      paymentMethod: settlement.paymentMethod || 'Razorpay Gateway',
      amountInr: grossInr,
      payerName: settlement.smallLabName || myLabFacility.name,
      payerRole: 'Referring Diagnostic Center',
      payerId: settlement.smallLabId || myLabFacility.id,
      payerAddress: `${myLabFacility.address}, ${myLabFacility.pincode}`,
      receiverName: settlement.targetLabName || 'Reference Testing Hub',
      receiverRole: 'Partner Reference Testing Hub',
      receiverId: settlement.targetLabId,
      patientName: matchingOrder?.patient?.pseudonym || 'Registered Patient',
      patientAge: matchingOrder?.patient?.age,
      patientGender: matchingOrder?.patient?.gender,
      patientId: matchingOrder?.patient?.id,
      items:
        matchingOrder?.specimens?.map((s) => ({
          code: s.testCode,
          name: s.testName,
          specimenType: s.specimenType,
          rateInr: 0,
        })) || [],
      logisticsFeeInr: phleboFeeInr,
      subtotalInr: Math.max(0, grossInr - phleboFeeInr),
      totalAmountInr: grossInr,
      status: 'PAID',
      notes: `Settlement Ref: ${settlement.id} • Order: ${settlement.orderNumber}`,
    };
    setCurrentPaymentSlip(slipData);
  }

  const navItems: SidebarNavItem<SmallLabTab>[] = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard', path: getPathForTab('dashboard') },
    { id: 'new-booking', icon: '➕', label: 'New Booking', path: getPathForTab('new-booking') },
    { id: 'patients', icon: '👥', label: 'Patients', badgeCount: patients.length, badgeVariant: 'green', path: getPathForTab('patients') },
    { id: 'catalogue', icon: '🧪', label: 'Test Catalogue', badgeCount: testCatalog.length, badgeVariant: 'teal', path: getPathForTab('catalogue') },
    { id: 'partners', icon: '🔬', label: 'Partner Labs', path: getPathForTab('partners') },
    { id: 'bookings', icon: '📦', label: 'Bookings & Custody', badgeCount: orders.length, badgeVariant: 'red', path: getPathForTab('bookings') },
    { id: 'reports', icon: '📄', label: 'Reports', badgeCount: reports.length, badgeVariant: 'teal', path: getPathForTab('reports') },
    { id: 'payments', icon: '💳', label: 'Payments', path: getPathForTab('payments') },
    { id: 'support', icon: '🎧', label: 'Help & Support', path: getPathForTab('support') },
  ];

  const initials = (session.profile.displayName || 'SL')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const liveCustodyOrder = custodyModalOrder
    ? orders.find((o) => o.id === custodyModalOrder.id) || custodyModalOrder
    : null;

  return (
    <>
      <DashboardShell<SmallLabTab>
        brandSubtitle="Small Collection Lab"
        navItems={navItems}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        footerCard={{
          icon: '🏥',
          title: myLabFacility.name,
          subtitle: `ID: ${myLabFacility.userCode || session.profile.userCode || myLabFacility.id}`,
          onClick: () => setActiveTab('support'),
        }}
        searchPlaceholder="Search patient, booking ID, test code, or reference lab..."
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        notifications={notifications}
        notifTitle="Lab Alerts"
        notifSubtitle={ROLE_LABELS[session.profile.role]}
        notifEmptyText="No alerts yet."
        formatLabel={formatDashboardLabel}
        profile={{
          initials,
          displayName: session.profile.displayName,
          userCode: session.profile.userCode || myLabFacility.userCode || myLabFacility.id,
          roleSummary: session.profile.email,
        }}
        onSignOut={onSignOut}
      >
        {activeTab === 'dashboard' && (
          <SmallLabOverviewTab
            myLabFacility={myLabFacility}
            profileUserCode={session.profile.userCode}
            trendDays={trendDays}
            onToggleTrendDays={() => setTrendDays((d) => (d === 30 ? 7 : 30))}
            onSelectTab={setActiveTab}
            onOpenAddPatient={() => setShowAddPatientModal(true)}
            metrics={metrics}
            orders={orders}
            reports={reports}
            patients={patients}
            onlinePhlebos={onlinePhlebos}
            verifiedLargeLabs={verifiedLargeLabs}
          />
        )}

        {activeTab === 'new-booking' && (
          <SmallLabNewBookingTab
            myLabFacility={myLabFacility}
            patients={myLabPatients}
            phlebotomists={onlinePhlebos}
            commConfig={commConfig}
            selectableCatalogEntries={selectableCatalogEntries}
            expandedRequestedCodes={expandedRequestedCodes}
            rankedLargeLabQuotes={rankedLargeLabQuotes}
            activeQuote={activeQuote}
            resolvedDropInfo={resolvedDropInfo}
            resolvedSpecimensForOrder={resolvedSpecimensForOrder}
            pickupCoverage={pickupCoverage}
            formatLabel={formatDashboardLabel}
            onOpenAddPatient={() => setShowAddPatientModal(true)}
            selectedPatientId={selectedPatientId}
            onSelectPatientId={setSelectedPatientId}
            adhocPatientName={adhocPatientName}
            onAdhocPatientNameChange={setAdhocPatientName}
            adhocPatientAge={adhocPatientAge}
            onAdhocPatientAgeChange={setAdhocPatientAge}
            adhocPatientGender={adhocPatientGender}
            onAdhocPatientGenderChange={setAdhocPatientGender}
            adhocPatientPhone={adhocPatientPhone}
            onAdhocPatientPhoneChange={setAdhocPatientPhone}
            adhocPatientAlternatePhone={adhocPatientAlternatePhone}
            onAdhocPatientAlternatePhoneChange={setAdhocPatientAlternatePhone}
            clinicalNote={clinicalNote}
            onClinicalNoteChange={setClinicalNote}
            pickupLat={pickupLat}
            pickupLng={pickupLng}
            pickupAddress={pickupAddress}
            onPickupAddressChange={setPickupAddress}
            pickupPincode={pickupPincode}
            onPickupPincodeChange={setPickupPincode}
            onPickupLocationChange={(loc) => {
              setPickupLat(loc.latitude);
              setPickupLng(loc.longitude);
              if (loc.address) setPickupAddress(loc.address);
              if (loc.pincode) setPickupPincode(loc.pincode);
            }}
            testSearchQuery={testSearchQuery}
            onTestSearchQueryChange={setTestSearchQuery}
            selectedTestCodes={selectedTestCodes}
            onClearSelectedTestCodes={() => setSelectedTestCodes([])}
            onToggleTestCodeSelection={toggleTestCodeSelection}
            dropMode={dropMode}
            onDropModeChange={setDropMode}
            onSelectOrgAndCenter={(orgIdVal, centerIdVal) => {
              setSelectedOrgLabId(orgIdVal);
              setSelectedCenterLabId(centerIdVal);
            }}
            selectedCenterLabId={selectedCenterLabId}
            onSelectCenterLabId={setSelectedCenterLabId}
            customDropLat={customDropLat}
            customDropLng={customDropLng}
            onCustomDropLocationChange={(loc) => {
              setCustomDropLat(loc.latitude);
              setCustomDropLng(loc.longitude);
              if (loc.address) setCustomDropAddress(loc.address);
              if (loc.pincode) setCustomDropPincode(loc.pincode);
            }}
            customDropName={customDropName}
            onCustomDropNameChange={setCustomDropName}
            customDropPincode={customDropPincode}
            onCustomDropPincodeChange={setCustomDropPincode}
            customDropAddress={customDropAddress}
            onCustomDropAddressChange={setCustomDropAddress}
            bookingPriority={bookingPriority}
            onBookingPriorityChange={setBookingPriority}
            pickupSlot={pickupSlot}
            onPickupSlotChange={setPickupSlot}
            selectedPhleboId={selectedPhleboId}
            onSelectedPhleboIdChange={setSelectedPhleboId}
            broadcastRadiusKm={broadcastRadiusKm}
            onBroadcastRadiusKmChange={setBroadcastRadiusKm}
            payImmediatelyOnBook={payImmediatelyOnBook}
            onPayImmediatelyOnBookChange={setPayImmediatelyOnBook}
            bookingStep={bookingStep}
            onBookingStepChange={setBookingStep}
            submittingBooking={submittingBooking}
            onSubmitBooking={handleCreateBooking}
            onShowAlert={onShowAlert}
          />
        )}

        {activeTab === 'patients' && (
          <SmallLabPatientsTab
            facilityName={myLabFacility.name}
            filteredPatients={filteredPatients}
            onOpenAddPatient={() => setShowAddPatientModal(true)}
            onBookForPatient={(ptId) => {
              setSelectedPatientId(ptId);
              setActiveTab('new-booking');
            }}
          />
        )}

        {activeTab === 'catalogue' && (
          <SmallLabCatalogueTab
            testCatalog={testCatalog}
            formatLabel={formatDashboardLabel}
            onAddToBooking={(cleanCode, ownerOrgId) => {
              if (!selectedTestCodes.includes(cleanCode)) {
                setSelectedTestCodes((prev) => [...prev, cleanCode]);
              }
              if (ownerOrgId) {
                setDropMode('LARGE_LAB');
                setSelectedOrgLabId(ownerOrgId);
              }
              setActiveTab('new-booking');
            }}
          />
        )}

        {activeTab === 'partners' && (
          <SmallLabPartnersTab
            verifiedLargeLabs={verifiedLargeLabs}
            pickupLat={pickupLat}
            pickupLng={pickupLng}
            onSelectPartnerForBooking={(orgLabIdVal, centerIdVal) => {
              setDropMode('LARGE_LAB');
              setSelectedOrgLabId(orgLabIdVal);
              setSelectedCenterLabId(centerIdVal);
              setActiveTab('new-booking');
            }}
          />
        )}

        {activeTab === 'bookings' && (
          <SmallLabBookingsTab
            myLabId={myLabFacility.id}
            filteredOrders={filteredOrders}
            settlements={settlements}
            orderFilter={orderFilter}
            onOrderFilterChange={setOrderFilter}
            payingSettlementId={payingSettlementId}
            onCreateNewBooking={() => setActiveTab('new-booking')}
            onTrackCustody={setCustodyModalOrder}
            onRetryBroadcast={handleRetryBroadcast}
            onPaySettlement={handlePaySettlement}
            onMarkPaidByLab={handleMarkPaidByLab}
            onPrintBarcodes={setBarcodeOrderToPrint}
            onViewPaymentSlip={handleViewOrderPaymentSlip}
            onOpenSelfQc={(o) => {
              setSelfQcOrder(o);
              setSelfQcTemp(String(o.arrivalTemperatureCelsius ?? '4.2'));
              setSelfQcQuality(o.qualityStatus || SpecimenQualityStatus.INTACT);
            }}
            onSelfStartRun={handleSelfStartRun}
            onCancelOrder={(o) =>
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
          />
        )}

        {activeTab === 'reports' && (
          <SmallLabReportsTab reports={reports} onPreviewPrintReport={setPrintingReport} />
        )}

        {activeTab === 'payments' && (
          <SmallLabPaymentsTab
            commConfig={commConfig}
            metrics={metrics}
            settlements={settlements}
            payingSettlementId={payingSettlementId}
            onPaySettlement={handlePaySettlement}
            onMarkSettlementPaidByLab={(stl) => {
              const matchingOrder = orders.find((o) => o.id === stl.orderId);
              handleMarkPaidByLab(
                matchingOrder ||
                  ({
                    id: stl.orderId,
                    orderNumber: stl.orderNumber,
                    totalAmountInr: stl.grossAmountInr,
                  } as PickupOrder)
              );
              return Promise.resolve();
            }}
            onViewPaymentSlip={handleViewSettlementPaymentSlip}
          />
        )}

        {activeTab === 'support' && (
          <SmallLabSupportTab
            facilityName={myLabFacility.name}
            facilityId={myLabFacility.id}
            accountEmail={session.profile.email}
            supportContacts={supportContacts}
            platformSops={platformSops}
            platformFaqs={platformFaqs}
          />
        )}
      </DashboardShell>

      <SmallLabAddPatientModal
        open={showAddPatientModal}
        onClose={() => setShowAddPatientModal(false)}
        ptName={ptName}
        onPtNameChange={setPtName}
        ptAge={ptAge}
        onPtAgeChange={setPtAge}
        ptGender={ptGender}
        onPtGenderChange={setPtGender}
        ptPhone={ptPhone}
        onPtPhoneChange={setPtPhone}
        ptAddress={ptAddress}
        onPtAddressChange={setPtAddress}
        savingPatient={savingPatient}
        onSubmit={handleSavePatient}
      />

      <OrderLiveTrackingModal
        order={liveCustodyOrder}
        onClose={() => setCustodyModalOrder(null)}
        titlePrefix="Live Tracking & Custody"
        nearbyPhlebos={onlinePhlebos}
        fallbackDropLat={pickupLat}
        fallbackDropLng={pickupLng}
        custodyTimeline={liveCustodyOrder ? liveCustodyOrder.custodyHistory || [] : undefined}
        formatLabel={formatDashboardLabel}
        onRetryBroadcast={handleRetryBroadcast}
      />

      <SmallLabSelfQcModal
        order={selfQcOrder}
        facilityName={myLabFacility.name}
        onClose={() => setSelfQcOrder(null)}
        temp={selfQcTemp}
        onTempChange={setSelfQcTemp}
        quality={selfQcQuality}
        onQualityChange={setSelfQcQuality}
        submitting={submittingSelfQc}
        onSubmit={handleSelfDropQcSubmit}
        formatLabel={formatDashboardLabel}
      />

      <SmallLabPrintReportModal
        report={printingReport}
        onClose={() => setPrintingReport(null)}
        formatLabel={formatDashboardLabel}
      />

      <SmallLabPrintBarcodesModal
        order={barcodeOrderToPrint}
        onClose={() => setBarcodeOrderToPrint(null)}
      />

      <PaymentSlipModal
        slip={currentPaymentSlip}
        onClose={() => setCurrentPaymentSlip(null)}
      />

      {isSuspendedForUnsettledFees && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.88)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '480px',
              width: '100%',
              padding: '28px 24px',
              textAlign: 'center',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>⚠️</div>
            <h2 style={{ fontSize: '1.25rem', color: '#991B1B', fontWeight: 800, margin: '0 0 8px' }}>
              Services Temporarily Suspended
            </h2>
            <p style={{ fontSize: '0.88rem', color: '#475569', lineHeight: 1.6, margin: '0 0 16px' }}>
              Your collection center has overdue platform fees of <strong>{formatInr(myLabFacility.pendingPlatformFeeDueInr || 0)}</strong> pending for more than 15 days from cash bookings.
            </p>
            <div
              style={{
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: '10px',
                padding: '12px',
                marginBottom: '20px',
                fontSize: '0.82rem',
                color: '#991B1B',
              }}
            >
              Per LabSetu operating policy, dispatch creation and courier requests are restricted until outstanding fees are cleared. Services resume immediately upon settlement.
            </div>
            <button
              type="button"
              className="btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: '0.92rem' }}
              onClick={() => setActiveTab('payments')}
            >
              View Outstanding Ledger &amp; Settle
            </button>
          </div>
        </div>
      )}
    </>
  );
}
