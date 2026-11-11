import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  computeBookingTrendPoints,
  computeDailyVolumeBars,
  computeStatusBreakdown,
  CustodyEvent,
  DiagnosticReportRecord,
  DiagnosticTestItem,
  EmailDeliverySettings,
  formatInr,
  formatOrderStatus,
  isOrderCompleted,
  LABSETU_THEME,
  LabFacility,
  NotificationCategory,
  NotificationPriority,
  OrderStatus,
  PayoutRecord,
  PhlebotomistProfile,
  PickupOrder,
  PlatformNotification,
  PlatformSlaConfig,
  ROLE_LABELS,
  SettlementRecord,
  SpecimenType,
  StorageTemperature,
  TubeType,
  UserProfile,
  UserRole,
  type CommissionConfig,
  type CreateManagedUserPayload,
  type DiagnosticDepartment,
  type LabFacilityTier,
} from '@diagnostic/shared';
import {
  EmailAuthProvider,
  linkWithCredential,
  updatePassword,
} from 'firebase/auth';
import {
  ADMIN_LOGIN_EMAIL,
  API_BASE_URL,
  auth,
  uploadDiagnosticDocument,
} from '../firebase';
import { type VerifiedPortalSession } from '../components/AuthGateScreen';
import { type DynamicAlertVariant } from '../components/DynamicAlertModal';
import {
  assignPhlebotomistToOrder,
  DEFAULT_COMMISSION_CONFIG,
  DEFAULT_EMAIL_SETTINGS,
  DEFAULT_PLATFORM_SLA,
  deleteDiagnosticTest,
  dispatchPlatformAlert,
  markNotificationRead,
  markSettlementSettled,
  provisionRoleUser,
  saveAdminSettings,
  saveCommissionSettings,
  saveDiagnosticTest,
  saveLabFacility,
  savePhlebotomist,
  subscribeCustodyEvents,
  subscribeLabs,
  subscribeNotifications,
  subscribeOrders,
  subscribePayouts,
  subscribePhlebotomists,
  subscribeReports,
  subscribeSettings,
  subscribeSettlements,
  subscribeTestCatalog,
  subscribeUserDirectory,
  toggleManagedUserStatus,
  updateLabVerification,
} from '../services/firestoreService';
import { releasePartnerPayoutApi } from '../services/razorpayCheckout';

export type AlertTriggerFn = (opts: {
  variant: DynamicAlertVariant;
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
}) => void;

interface AdminDashboardProps {
  session: VerifiedPortalSession;
  onSignOut: () => void;
  onShowAlert: AlertTriggerFn;
}

type AdminTab =
  | 'dashboard'
  | 'users'
  | 'bookings'
  | 'labs'
  | 'labs-small'
  | 'labs-large'
  | 'labs-verify'
  | 'phlebotomists'
  | 'samples'
  | 'reports'
  | 'payments'
  | 'commission'
  | 'analytics'
  | 'master-data'
  | 'settings';

export function AdminDashboard({
  session,
  onSignOut,
  onShowAlert,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [labsMenuOpen, setLabsMenuOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [trendDays, setTrendDays] = useState<7 | 30>(30);
  const [notifOpen, setNotifOpen] = useState(false);

  // Live Cloud Firestore Data States (ZERO dummy data)
  const [managedUsers, setManagedUsers] = useState<UserProfile[]>([]);
  const [labs, setLabs] = useState<LabFacility[]>([]);
  const [phlebotomists, setPhlebotomists] = useState<PhlebotomistProfile[]>([]);
  const [orders, setOrders] = useState<PickupOrder[]>([]);
  const [custodyEvents, setCustodyEvents] = useState<CustodyEvent[]>([]);
  const [reports, setReports] = useState<DiagnosticReportRecord[]>([]);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [testCatalog, setTestCatalog] = useState<DiagnosticTestItem[]>([]);
  const [notifications, setNotifications] = useState<PlatformNotification[]>([]);

  // Partner Payout Modal State
  const [payoutModalSettlement, setPayoutModalSettlement] = useState<SettlementRecord | null>(null);
  const [payoutRecipientType, setPayoutRecipientType] = useState<'LARGE_LAB' | 'PHLEBOTOMIST' | 'BOTH'>('BOTH');
  const [payoutMode, setPayoutMode] = useState<'UPI' | 'IMPS' | 'NEFT' | 'RAZORPAYX'>('UPI');
  const [payoutReferenceId, setPayoutReferenceId] = useState('');
  const [payoutNotes, setPayoutNotes] = useState('');
  const [forceUnpaidPayout, setForceUnpaidPayout] = useState(false);
  const [submittingPayout, setSubmittingPayout] = useState(false);

  const [slaConfig, setSlaConfig] = useState<PlatformSlaConfig>(DEFAULT_PLATFORM_SLA);
  const [commConfig, setCommConfig] = useState<CommissionConfig>(DEFAULT_COMMISSION_CONFIG);
  const [emailSettings, setEmailSettings] = useState<EmailDeliverySettings>(DEFAULT_EMAIL_SETTINGS);

  // Filters & Modals
  const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole>('ALL');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('ALL');
  const [selectedCourier, setSelectedCourier] = useState<PhlebotomistProfile | null>(null);
  const [assignModalOrder, setAssignModalOrder] = useState<PickupOrder | null>(null);
  const [assignPhleboId, setAssignPhleboId] = useState('');

  // Add Role User Modal State
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>(UserRole.SMALL_LAB);
  const [newUserLabId, setNewUserLabId] = useState('');
  const [newUserPhleboId, setNewUserPhleboId] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserCity, setNewUserCity] = useState('Mumbai');
  const [savingUser, setSavingUser] = useState(false);

  // Add Lab Modal State
  const [showAddLabModal, setShowAddLabModal] = useState(false);
  const [labName, setLabName] = useState('');
  const [labTier, setLabTier] = useState<LabFacilityTier>('SMALL_LAB');
  const [labCity, setLabCity] = useState('Mumbai');
  const [labAddress, setLabAddress] = useState('');
  const [labEmail, setLabEmail] = useState('');
  const [labPhone, setLabPhone] = useState('');
  const [labNabl, setLabNabl] = useState('');

  // Add Phlebo Modal State
  const [showAddPhleboModal, setShowAddPhleboModal] = useState(false);
  const [phleboName, setPhleboName] = useState('');
  const [phleboEmail, setPhleboEmail] = useState('');
  const [phleboPhone, setPhleboPhone] = useState('');
  const [phleboZone, setPhleboZone] = useState('Mumbai Central');
  const [phleboVehicle, setPhleboVehicle] = useState('Cold-Chain Two-Wheeler');

  // Add Test Catalogue Modal State
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

  const [storageStatusMsg, setStorageStatusMsg] = useState<string | null>(null);
  const [notifStatusMsg, setNotifStatusMsg] = useState<string | null>(null);

  // Account Password Setup / Change
  const [newAccountPassword, setNewAccountPassword] = useState('');
  const [confirmAccountPassword, setConfirmAccountPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const formatLabel = (raw: string) =>
    raw
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());

  useEffect(() => {
    if (!session.firebaseUser) return;
    const unsubs = [
      subscribeUserDirectory(setManagedUsers),
      subscribeLabs(setLabs),
      subscribePhlebotomists(setPhlebotomists),
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

  const metrics = useMemo(() => {
    const smallLabs = labs.filter((l) => l.type === 'SMALL_LAB');
    const largeLabs = labs.filter((l) => l.type === 'LARGE_LAB');
    const pendingLabs = labs.filter((l) => l.verificationStatus === 'PENDING');
    const onlinePhlebos = phlebotomists.filter((p) => p.status === 'ONLINE');

    const totalOrders = orders.length;
    const totalSpecimens = orders.reduce((sum, o) => sum + (o.specimens?.length || 0), 0);
    const completedOrders = orders.filter((o) => isOrderCompleted(o.status));
    const activePickups = orders.filter(
      (o) =>
        o.status === OrderStatus.READY_FOR_PICKUP ||
        o.status === OrderStatus.ASSIGNED_TO_PHLEBO ||
        o.status === OrderStatus.PICKED_UP
    );
    const inTransit = orders.filter((o) => o.status === OrderStatus.IN_TRANSIT);

    const todayStr = new Date().toDateString();
    const todayOrders = orders.filter((o) => new Date(o.createdAt).toDateString() === todayStr);
    const todayRevenue = todayOrders.reduce((s, o) => s + (o.totalAmountInr || 0), 0);

    const grossGmv = settlements.reduce((s, x) => s + (x.grossAmountInr || 0), 0);
    const collectedOnline = settlements
      .filter((x) => x.paymentStatus === 'PAID')
      .reduce((s, x) => s + (x.grossAmountInr || 0), 0);
    const awaitingCollection = settlements
      .filter((x) => x.paymentStatus !== 'PAID' && x.status !== 'SETTLED')
      .reduce((s, x) => s + (x.grossAmountInr || 0), 0);
    const platformFees = settlements.reduce((s, x) => s + (x.platformFeeInr || 0), 0);
    const labPayouts = settlements.reduce((s, x) => s + (x.labPayoutInr || 0), 0);
    const labPayoutsPaid = settlements
      .filter((x) => x.labPayoutStatus === 'PAID' || x.status === 'SETTLED')
      .reduce((s, x) => s + (x.labPayoutInr || 0), 0);
    const labPayoutsDue = Math.max(0, labPayouts - labPayoutsPaid);
    const phleboPayouts = settlements.reduce((s, x) => s + (x.phleboPayoutInr || 0), 0);
    const phleboPayoutsPaid = settlements
      .filter((x) => x.phleboPayoutStatus === 'PAID' || x.status === 'SETTLED')
      .reduce((s, x) => s + (x.phleboPayoutInr || 0), 0);
    const phleboPayoutsDue = Math.max(0, phleboPayouts - phleboPayoutsPaid);
    const totalRevenue =
      grossGmv || orders.reduce((s, o) => s + (o.totalAmountInr || 0), 0);

    const statusBreakdown = computeStatusBreakdown(orders);
    const trendBuckets = computeBookingTrendPoints(orders, trendDays === 7 ? 7 : 10);
    const weeklyBars = computeDailyVolumeBars(orders);

    const tempCompliantEvents = custodyEvents.filter(
      (e) => e.temperatureCelsius === undefined || (e.temperatureCelsius >= 2 && e.temperatureCelsius <= 8)
    );
    const coldChainRate = custodyEvents.length
      ? `${((tempCompliantEvents.length / custodyEvents.length) * 100).toFixed(1)}%`
      : '100%';

    return {
      smallLabsCount: smallLabs.length,
      largeLabsCount: largeLabs.length,
      pendingLabsCount: pendingLabs.length,
      onlinePhlebosCount: onlinePhlebos.length,
      totalOrders,
      totalSpecimens,
      completedCount: completedOrders.length,
      activePickupsCount: activePickups.length,
      inTransitCount: inTransit.length,
      todayCompletedCount: todayOrders.filter((o) => isOrderCompleted(o.status)).length,
      todayOrdersCount: todayOrders.length,
      todayRevenue,
      totalRevenue,
      grossGmv,
      collectedOnline,
      awaitingCollection,
      platformFees,
      labPayouts,
      labPayoutsPaid,
      labPayoutsDue,
      phleboPayouts,
      phleboPayoutsPaid,
      phleboPayoutsDue,
      statusBreakdown,
      trendBuckets,
      weeklyBars,
      coldChainRate,
    };
  }, [labs, phlebotomists, orders, settlements, custodyEvents, trendDays]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  function openAddUserModal(presetRole: UserRole = UserRole.SMALL_LAB) {
    setNewUserRole(presetRole);
    setNewUserEmail('');
    setNewUserName('');
    setNewUserPhone('');
    setNewUserPassword('');
    setNewUserCity('Mumbai');
    setNewUserLabId(
      presetRole === UserRole.SMALL_LAB
        ? `LAB-SM-${Date.now().toString().slice(-3)}`
        : presetRole === UserRole.LARGE_LAB
        ? `LAB-LG-${Date.now().toString().slice(-3)}`
        : ''
    );
    setNewUserPhleboId(
      presetRole === UserRole.PHLEBOTOMIST ? `PHL-${Date.now().toString().slice(-3)}` : ''
    );
    setShowAddUserModal(true);
  }

  async function handleProvisionUserSubmit(e: FormEvent) {
    e.preventDefault();
    if (!newUserEmail.trim() || !newUserName.trim()) return;
    setSavingUser(true);
    try {
      const payload: CreateManagedUserPayload = {
        email: newUserEmail.trim().toLowerCase(),
        displayName: newUserName.trim(),
        role: newUserRole,
        phoneNumber: newUserPhone.trim() || undefined,
        labId:
          newUserRole === UserRole.SMALL_LAB || newUserRole === UserRole.LARGE_LAB
            ? newUserLabId.trim()
            : undefined,
        phlebotomistId:
          newUserRole === UserRole.PHLEBOTOMIST ? newUserPhleboId.trim() : undefined,
        password: newUserPassword.trim() || undefined,
        isActive: true,
      };
      const { profile, apiSynced } = await provisionRoleUser(session.bearerToken, payload, {
        createFacilityRecord: true,
        city: newUserCity,
      });
      setShowAddUserModal(false);
      onShowAlert({
        variant: 'success',
        title: 'Account Created',
        message: `${profile.displayName} (${profile.email}) can now sign in as ${ROLE_LABELS[profile.role]}.`,
        detail: `${
          profile.labId
            ? `Lab ID: ${profile.labId}`
            : profile.phlebotomistId
            ? `Courier ID: ${profile.phlebotomistId}`
            : 'Platform Admin'
        } • ${
          profile.role === UserRole.PHLEBOTOMIST
            ? 'Mobile App sign-in enabled'
            : apiSynced
            ? 'Website portal & email login ready'
            : 'Saved to approved directory'
        }`,
      });
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Could Not Save Account',
        message: (err as Error).message || 'Could not create the user account.',
      });
    } finally {
      setSavingUser(false);
    }
  }

  async function handleSaveNewLab(e: FormEvent) {
    e.preventDefault();
    const id = `${labTier === 'SMALL_LAB' ? 'LAB-SM' : 'LAB-LG'}-${Date.now().toString().slice(-4)}`;
    await saveLabFacility({
      id,
      name: labName.trim(),
      type: labTier,
      city: labCity.trim() || 'Mumbai',
      address: labAddress.trim() || `${labName.trim()}, ${labCity.trim()}`,
      email: labEmail.trim().toLowerCase(),
      phone: labPhone.trim(),
      nablNumber: labNabl.trim() || undefined,
      verified: true,
      verificationStatus: 'VERIFIED',
      rating: 5.0,
      courierEtaMins: labTier === 'LARGE_LAB' ? 20 : undefined,
    });
    setShowAddLabModal(false);
    setLabName('');
    setLabAddress('');
    setLabEmail('');
    setLabPhone('');
    onShowAlert({
      variant: 'success',
      title: 'Lab Facility Added',
      message: `${labName.trim()} (${id}) has been saved successfully.`,
    });
  }

  async function handleSaveNewPhlebo(e: FormEvent) {
    e.preventDefault();
    const id = `PHL-${Date.now().toString().slice(-4)}`;
    await savePhlebotomist({
      id,
      name: phleboName.trim(),
      email: phleboEmail.trim().toLowerCase(),
      phone: phleboPhone.trim(),
      status: 'ONLINE',
      currentLocation: phleboZone.trim() || 'Mumbai Zone',
      batteryPct: 100,
      chillerTempCelsius: 4.2,
      coolerBoxId: `CB-${id}`,
      vehicleInfo: phleboVehicle.trim(),
      rating: 5.0,
      totalPickups: 0,
      verified: true,
    });
    setShowAddPhleboModal(false);
    setPhleboName('');
    setPhleboEmail('');
    setPhleboPhone('');
    onShowAlert({
      variant: 'success',
      title: 'Phlebotomist Added',
      message: `${phleboName.trim()} (${id}) has been added to the active fleet.`,
    });
  }

  async function handleSaveTest(e: FormEvent) {
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
    });
    setShowAddTestModal(false);
    setTestCode('');
    setTestName('');
    onShowAlert({
      variant: 'success',
      title: 'Test Panel Saved',
      message: `${cleanCode} (${testName.trim()}) has been added to the test catalogue.`,
    });
  }

  async function handleAssignSubmit(e: FormEvent) {
    e.preventDefault();
    if (!assignModalOrder || !assignPhleboId || !session.firebaseUser) return;
    const phlebo = phlebotomists.find((p) => p.id === assignPhleboId);
    if (!phlebo) return;
    await assignPhlebotomistToOrder({
      order: assignModalOrder,
      phlebo,
      operatorUid: session.firebaseUser.uid,
      operatorName: session.profile.displayName,
      operatorRole: UserRole.ADMIN,
    });
    setAssignModalOrder(null);
    onShowAlert({
      variant: 'success',
      title: 'Booking Assigned',
      message: `${assignModalOrder.orderNumber} assigned to ${phlebo.name} (${phlebo.id}).`,
    });
  }

  async function handleSendTestNotification() {
    setNotifStatusMsg('Sending test alert & email...');
    try {
      const res = await fetch(`${API_BASE_URL}/notifications/test-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.bearerToken}`,
        },
        body: JSON.stringify({ recipientEmail: emailSettings.adminEmail }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.data) {
        setNotifStatusMsg(
          json.data.emailSent
            ? `Test email delivered to ${emailSettings.adminEmail}.`
            : `Notification saved; email delivery to ${emailSettings.adminEmail} queued.`
        );
        return;
      }
    } catch {
      // Fallback below
    }

    await dispatchPlatformAlert({
      title: 'LabSetu Live Alert & Email Check',
      message: `Verified real-time alert for ${emailSettings.adminEmail} triggered at ${new Date().toLocaleTimeString('en-IN')}.`,
      category: NotificationCategory.SYSTEM_ALERT,
      priority: NotificationPriority.NORMAL,
      recipientEmail: emailSettings.adminEmail,
      recipientRole: UserRole.ADMIN,
      queueEmail: true,
    });
    setNotifStatusMsg(`Alert & email queued for ${emailSettings.adminEmail}.`);
  }

  async function handleStorageUploadTest(file: File | undefined) {
    if (!file) return;
    setStorageStatusMsg('Uploading test document...');
    try {
      const url = await uploadDiagnosticDocument(
        `documents/admin/${Date.now()}-${file.name}`,
        file
      );
      setStorageStatusMsg(`Uploaded successfully: ${url}`);
      onShowAlert({
        variant: 'success',
        title: 'Document Upload Verified',
        message: `${file.name} uploaded securely.`,
        detail: url,
      });
    } catch (err) {
      const msg = (err as Error).message;
      setStorageStatusMsg(`Upload failed: ${msg}`);
      onShowAlert({ variant: 'warning', title: 'Upload Error', message: msg });
    }
  }

  async function handleUpdateAccountPassword(e: FormEvent) {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user || !user.email) {
      onShowAlert({
        variant: 'error',
        title: 'Sign-In Required',
        message: 'Please sign in again before updating your password.',
      });
      return;
    }
    if (newAccountPassword.length < 6) {
      onShowAlert({
        variant: 'warning',
        title: 'Password Too Short',
        message: 'Please enter a password of at least 6 characters.',
      });
      return;
    }
    if (newAccountPassword !== confirmAccountPassword) {
      onShowAlert({
        variant: 'warning',
        title: 'Passwords Do Not Match',
        message: 'Both password fields must match exactly.',
      });
      return;
    }

    setSavingPassword(true);
    try {
      const hasPasswordProvider = user.providerData.some((p) => p.providerId === 'password');
      if (hasPasswordProvider) {
        await updatePassword(user, newAccountPassword);
      } else {
        const cred = EmailAuthProvider.credential(user.email, newAccountPassword);
        await linkWithCredential(user, cred);
      }
      setNewAccountPassword('');
      setConfirmAccountPassword('');
      onShowAlert({
        variant: 'success',
        title: 'Sign-In Password Updated',
        message: `You can now sign in to ${user.email} using Email & Password anytime.`,
      });
    } catch (err: unknown) {
      const fbErr = err as { code?: string; message?: string };
      if (fbErr.code === 'auth/requires-recent-login') {
        onShowAlert({
          variant: 'warning',
          title: 'Please Sign In Again',
          message: 'For security reasons, please sign out and sign back in once before changing your password.',
        });
      } else {
        onShowAlert({
          variant: 'error',
          title: 'Password Update Failed',
          message: fbErr.message || 'Could not update your account password.',
        });
      }
    } finally {
      setSavingPassword(false);
    }
  }

  function handleExportCsv() {
    if (orders.length === 0) {
      onShowAlert({
        variant: 'info',
        title: 'No Bookings to Export',
        message: 'Create or receive live bookings before exporting CSV.',
      });
      return;
    }
    const headers = ['Order Number', 'Source Lab', 'Target Hub', 'Patient', 'Tests', 'Phlebotomist', 'Status', 'Total INR', 'Created'];
    const rows = orders.map((o) =>
      [
        o.orderNumber,
        `"${o.smallLabName}"`,
        `"${o.targetLabName}"`,
        `"${o.patient.pseudonym}"`,
        `"${o.specimens.map((s) => s.testCode).join(', ')}"`,
        `"${o.phlebotomistName || 'Unassigned'}"`,
        formatOrderStatus(o.status),
        o.totalAmountInr || 0,
        o.createdAt,
      ].join(',')
    );
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `labsetu-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    onShowAlert({
      variant: 'success',
      title: 'Bookings CSV Exported',
      message: `Exported ${orders.length} live bookings.`,
    });
  }

  // Dynamic SVG Trend Polyline Coordinates
  const trendMax = Math.max(
    4,
    ...metrics.trendBuckets.map((b) => Math.max(b.total, b.completed))
  );
  const totalPolyline = metrics.trendBuckets
    .map((b, idx) => {
      const x =
        36 +
        (idx / Math.max(1, metrics.trendBuckets.length - 1)) * (435 - 36);
      const y = 148 - (b.total / trendMax) * 124;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const completedPolyline = metrics.trendBuckets
    .map((b, idx) => {
      const x =
        36 +
        (idx / Math.max(1, metrics.trendBuckets.length - 1)) * (435 - 36);
      const y = 148 - (b.completed / trendMax) * 124;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  // Dynamic Donut Stroke Dasharrays (r = 48 -> C ≈ 301.59)
  const C = 301.6;
  const totalForDonut = Math.max(1, metrics.statusBreakdown.total);
  const compLen = (metrics.statusBreakdown.completed / totalForDonut) * C;
  const progLen = (metrics.statusBreakdown.inProgress / totalForDonut) * C;
  const assignLen = (metrics.statusBreakdown.assigned / totalForDonut) * C;
  const rejLen = (metrics.statusBreakdown.rejected / totalForDonut) * C;

  const q = searchQuery.trim().toLowerCase();
  const filteredUsers = managedUsers.filter(
    (u) =>
      (roleFilter === 'ALL' || u.role === roleFilter) &&
      (!q ||
        u.email.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q) ||
        (u.labId || '').toLowerCase().includes(q))
  );
  const filteredOrders = orders.filter(
    (o) =>
      (orderStatusFilter === 'ALL' || o.status === orderStatusFilter) &&
      (!q ||
        o.orderNumber.toLowerCase().includes(q) ||
        o.smallLabName.toLowerCase().includes(q) ||
        o.targetLabName.toLowerCase().includes(q) ||
        o.patient.pseudonym.toLowerCase().includes(q))
  );

  const initials = (session.profile.displayName || 'AD')
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
            <span className="brand-subtitle">Admin Command</span>
          </div>
        </div>

        <ul className="sidebar-nav">
          <li className={`sidebar-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            <span>📊</span>
            <span>Admin Dashboard</span>
          </li>
          <li className={`sidebar-nav-item ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
            <span>🛡️</span>
            <span>Users &amp; Roles</span>
            <span className="nav-badge-green">{managedUsers.length}</span>
          </li>
          <li className={`sidebar-nav-item ${activeTab === 'bookings' ? 'active' : ''}`} onClick={() => setActiveTab('bookings')}>
            <span>📦</span>
            <span>Bookings</span>
            <span className="nav-badge-red">{orders.length}</span>
          </li>

          <li
            className={`sidebar-nav-item ${activeTab.startsWith('labs') ? 'active' : ''}`}
            onClick={() => {
              setLabsMenuOpen(!labsMenuOpen);
              setActiveTab('labs');
            }}
          >
            <span>🏥</span>
            <span>Labs &amp; Partners</span>
            <span className="chevron-icon">{labsMenuOpen ? '▴' : '▾'}</span>
          </li>
          {labsMenuOpen && (
            <ul className="sidebar-submenu">
              <li className={`sidebar-subitem ${activeTab === 'labs-small' ? 'active' : ''}`} onClick={() => setActiveTab('labs-small')}>
                • Small Labs ({metrics.smallLabsCount})
              </li>
              <li className={`sidebar-subitem ${activeTab === 'labs-large' ? 'active' : ''}`} onClick={() => setActiveTab('labs-large')}>
                • Large Labs ({metrics.largeLabsCount})
              </li>
              <li className={`sidebar-subitem ${activeTab === 'labs-verify' ? 'active' : ''}`} onClick={() => setActiveTab('labs-verify')}>
                • Verification ({metrics.pendingLabsCount})
              </li>
            </ul>
          )}

          <li className={`sidebar-nav-item ${activeTab === 'phlebotomists' ? 'active' : ''}`} onClick={() => setActiveTab('phlebotomists')}>
            <span>🏍️</span>
            <span>Phlebotomists</span>
            <span className="nav-badge-teal">{phlebotomists.length}</span>
          </li>
          <li className={`sidebar-nav-item ${activeTab === 'samples' ? 'active' : ''}`} onClick={() => setActiveTab('samples')}>
            <span>🧪</span>
            <span>Samples Cold-Chain</span>
          </li>
          <li className={`sidebar-nav-item ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>
            <span>📄</span>
            <span>Reports</span>
          </li>
          <li className={`sidebar-nav-item ${activeTab === 'payments' ? 'active' : ''}`} onClick={() => setActiveTab('payments')}>
            <span>💳</span>
            <span>Payments &amp; Settlements</span>
          </li>
          <li className={`sidebar-nav-item ${activeTab === 'commission' ? 'active' : ''}`} onClick={() => setActiveTab('commission')}>
            <span>%</span>
            <span>Commissions</span>
          </li>
          <li className={`sidebar-nav-item ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>
            <span>📈</span>
            <span>Analytics</span>
          </li>
          <li className={`sidebar-nav-item ${activeTab === 'master-data' ? 'active' : ''}`} onClick={() => setActiveTab('master-data')}>
            <span>🗂️</span>
            <span>Master Test Data</span>
          </li>
          <li className={`sidebar-nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
            <span>⚙️</span>
            <span>Settings</span>
          </li>
        </ul>

        <div
          className="sidebar-footer-card"
          onClick={() =>
            onShowAlert({
              variant: 'info',
              title: 'LabSetu Operations',
              message: `Connected Live Dashboard\nPrimary Admin: ${ADMIN_LOGIN_EMAIL}`,
            })
          }
        >
          <div className="sidebar-footer-icon">🎧</div>
          <div>
            <div className="sidebar-footer-title">Admin Control Desk</div>
            <div className="sidebar-footer-subtitle">Live Auto-Sync Active</div>
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
              placeholder="Search booking ID, email, lab, patient, or phlebotomist..."
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
                      <div style={{ fontSize: '0.88rem', fontWeight: 700 }}>Live Notifications</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{emailSettings.adminEmail}</div>
                    </div>
                    <button type="button" className="btn-link-muted" onClick={() => void handleSendTestNotification()}>
                      + Send Test
                    </button>
                  </div>
                  {notifStatusMsg && (
                    <div style={{ padding: '8px 14px', background: '#F0FDFA', color: '#0F766E', fontSize: '0.75rem' }}>
                      {notifStatusMsg}
                    </div>
                  )}
                  <div className="notif-list">
                    {notifications.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', fontSize: '0.82rem', color: '#64748B' }}>
                        No notifications yet.
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
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'dashboard' && (
            <>
              <div className="page-header-row">
                <div className="page-title-group">
                  <h1>Admin Dashboard</h1>
                  <p>Live overview of bookings, samples, labs, and payouts</p>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setTrendDays(trendDays === 30 ? 7 : 30)}
                >
                  📅 {trendDays === 30 ? 'Last 30 Days View' : 'Last 7 Days View'}
                </button>
              </div>

              <section className="kpi-5-row">
                <div className="kpi-card-modern">
                  <div className="kpi-icon-box-mint">📦</div>
                  <div className="kpi-body">
                    <span className="kpi-title">Total Bookings</span>
                    <span className="kpi-main-number">{metrics.totalOrders}</span>
                    <span className="kpi-sub-split">{metrics.completedCount} completed</span>
                  </div>
                </div>
                <div className="kpi-card-modern">
                  <div className="kpi-icon-box-blue">🧪</div>
                  <div className="kpi-body">
                    <span className="kpi-title">Total Specimens</span>
                    <span className="kpi-main-number">{metrics.totalSpecimens}</span>
                    <span className="kpi-sub-split">Cold-chain {metrics.coldChainRate}</span>
                  </div>
                </div>
                <div className="kpi-card-modern">
                  <div className="kpi-icon-box-indigo">🏥</div>
                  <div className="kpi-body">
                    <span className="kpi-title">Registered Labs</span>
                    <span className="kpi-main-number">{labs.length}</span>
                    <span className="kpi-sub-split">
                      {metrics.smallLabsCount} Small | {metrics.largeLabsCount} Large
                    </span>
                  </div>
                </div>
                <div className="kpi-card-modern">
                  <div className="kpi-icon-box-purple">🏍️</div>
                  <div className="kpi-body">
                    <span className="kpi-title">Phlebotomists</span>
                    <span className="kpi-main-number">{phlebotomists.length}</span>
                    <span className="kpi-sub-split">{metrics.onlinePhlebosCount} Online now</span>
                  </div>
                </div>
                <div className="kpi-card-modern">
                  <div className="kpi-icon-box-mint">₹</div>
                  <div className="kpi-body">
                    <span className="kpi-title">Platform Revenue</span>
                    <span className="kpi-main-number">{formatInr(metrics.totalRevenue)}</span>
                    <span className="kpi-sub-split">Total from partner settlements</span>
                  </div>
                </div>
              </section>

              <section className="analytics-3-row">
                {/* Trend Chart */}
                <div className="chart-card-modern">
                  <div className="card-top-header">
                    <span className="card-top-title">Bookings Trend (Live)</span>
                    <div className="chart-legend-row">
                      <span><span className="legend-dot-teal" />Bookings</span>
                      <span><span className="legend-dot-blue" />Completed</span>
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

                {/* Donut Status */}
                <div className="chart-card-modern">
                  <div className="card-top-header">
                    <span className="card-top-title">Booking Status</span>
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
                        <div className="donut-center-sub">Total</div>
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
                        <span className="donut-label-group">● Assigned/Open</span>
                        <span className="donut-val-group">{metrics.statusBreakdown.assigned} <span className="donut-pct-text">{metrics.statusBreakdown.assignedPct}</span></span>
                      </div>
                      <div className="donut-legend-item">
                        <span className="donut-label-group">● Rejected</span>
                        <span className="donut-val-group">{metrics.statusBreakdown.rejected} <span className="donut-pct-text">{metrics.statusBreakdown.rejectedPct}</span></span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Live Operations */}
                <div className="chart-card-modern">
                  <div className="card-top-header">
                    <span className="card-top-title">Live Operations</span>
                  </div>
                  <div className="live-ops-split">
                    <div className="mini-map-canvas">
                      <svg width="100%" height="100%" viewBox="0 0 180 160" preserveAspectRatio="none">
                        <path d="M 10 40 L 170 40 M 10 90 L 170 90 M 50 10 L 50 150 M 120 10 L 120 150" stroke="#E2E8F0" strokeWidth="1.5" />
                        <circle cx="90" cy="80" r="14" fill="#2563EB" fillOpacity="0.16" />
                        <circle cx="90" cy="80" r="7" fill="#2563EB" />
                        {labs.slice(0, 6).map((l, i) => (
                          <circle
                            key={l.id}
                            cx={30 + ((i * 29) % 120)}
                            cy={28 + ((i * 37) % 105)}
                            r="5"
                            fill={l.type === 'LARGE_LAB' ? '#0D9488' : '#10B981'}
                          />
                        ))}
                      </svg>
                    </div>
                    <div className="live-ops-metrics-list">
                      <div className="ops-metric-item">
                        <div className="ops-icon-circle" style={{ background: '#EFF6FF', color: '#2563EB' }}>👤</div>
                        <div>
                          <div className="ops-metric-val">{metrics.onlinePhlebosCount}</div>
                          <div className="ops-metric-label">Online Couriers</div>
                        </div>
                      </div>
                      <div className="ops-metric-item">
                        <div className="ops-icon-circle" style={{ background: '#ECFDF5', color: '#059669' }}>📦</div>
                        <div>
                          <div className="ops-metric-val">{metrics.activePickupsCount}</div>
                          <div className="ops-metric-label">Active Pickups</div>
                        </div>
                      </div>
                      <div className="ops-metric-item">
                        <div className="ops-icon-circle" style={{ background: '#FEF3C7', color: '#D97706' }}>🚚</div>
                        <div>
                          <div className="ops-metric-val">{metrics.inTransitCount}</div>
                          <div className="ops-metric-label">In Transit</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Quick Actions */}
              <section className="quick-actions-bar">
                <button type="button" className="action-card-btn" onClick={() => openAddUserModal(UserRole.SMALL_LAB)}>
                  <span className="action-btn-icon">🛡️</span>
                  <span className="action-btn-text">+ Add Role User</span>
                </button>
                <button type="button" className="action-card-btn" onClick={() => setShowAddLabModal(true)}>
                  <span className="action-btn-icon">🏥</span>
                  <span className="action-btn-text">+ Add Lab Facility</span>
                </button>
                <button type="button" className="action-card-btn" onClick={() => setShowAddPhleboModal(true)}>
                  <span className="action-btn-icon">🏍️</span>
                  <span className="action-btn-text">+ Add Phlebotomist</span>
                </button>
                <button type="button" className="action-card-btn" onClick={() => setShowAddTestModal(true)}>
                  <span className="action-btn-icon">🧪</span>
                  <span className="action-btn-text">+ Add Test Panel</span>
                </button>
                <button type="button" className="action-card-btn" onClick={() => setActiveTab('bookings')}>
                  <span className="action-btn-icon">📋</span>
                  <span className="action-btn-text">Manage Bookings</span>
                </button>
                <button type="button" className="action-card-btn" onClick={handleExportCsv}>
                  <span className="action-btn-icon">📥</span>
                  <span className="action-btn-text">Export CSV</span>
                </button>
              </section>

              {/* Bottom 3-Column Section */}
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
                      <h4>No Bookings Yet</h4>
                      <p>Once a Collection Lab submits a sample pickup booking, it appears here right away.</p>
                    </div>
                  ) : (
                    <div className="data-table-container">
                      <table className="modern-data-table">
                        <thead>
                          <tr>
                            <th>Booking</th>
                            <th>Source Lab</th>
                            <th>Tests</th>
                            <th>Courier</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orders.slice(0, 6).map((o) => (
                            <tr key={o.id}>
                              <td><strong>{o.orderNumber}</strong></td>
                              <td>{o.smallLabName}</td>
                              <td>{o.specimens.map((s) => s.testCode).join(', ')}</td>
                              <td>{o.phlebotomistName || 'Unassigned'}</td>
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
                    <span className="card-top-title">Network Overview</span>
                  </div>
                  <div className="network-list-item">
                    <span className="network-item-label">🏢 Small Labs</span>
                    <span className="network-item-number">{metrics.smallLabsCount}</span>
                  </div>
                  <div className="network-list-item">
                    <span className="network-item-label">🔬 Reference Labs</span>
                    <span className="network-item-number">{metrics.largeLabsCount}</span>
                  </div>
                  <div className="network-list-item">
                    <span className="network-item-label">🏍️ Phlebotomists</span>
                    <span className="network-item-number">{phlebotomists.length}</span>
                  </div>
                  <div className="network-list-item">
                    <span className="network-item-label">🛡️ Role Accounts</span>
                    <span className="network-item-number">{managedUsers.length}</span>
                  </div>
                </div>

                <div className="chart-card-modern">
                  <div className="card-top-header">
                    <span className="card-top-title">Today&apos;s Highlights</span>
                  </div>
                  <div className="highlight-row-item">
                    <span>✓ Completed Today</span>
                    <strong>{metrics.todayCompletedCount}</strong>
                  </div>
                  <div className="highlight-row-item">
                    <span>📦 Bookings Today</span>
                    <strong>{metrics.todayOrdersCount}</strong>
                  </div>
                  <div className="highlight-row-item">
                    <span>₹ Today&apos;s Volume</span>
                    <strong>{formatInr(metrics.todayRevenue)}</strong>
                  </div>
                  <div className="highlight-row-item">
                    <span>📄 Reports Published</span>
                    <strong>{reports.length}</strong>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* TAB 2: USERS & ROLES */}
          {activeTab === 'users' && (
            <div className="chart-card-modern">
              <div className="card-top-header">
                <div>
                  <h2 className="card-top-title">Role-Based User Directory</h2>
                  <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
                    Only emails added here by Platform Admin can sign in—strictly locked to their assigned role.
                  </p>
                </div>
                <button type="button" className="btn-primary" onClick={() => openAddUserModal(UserRole.SMALL_LAB)}>
                  + Add Role User
                </button>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {(['ALL', UserRole.ADMIN, UserRole.SMALL_LAB, UserRole.LARGE_LAB, UserRole.PHLEBOTOMIST] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={roleFilter === r ? 'btn-primary' : 'btn-secondary'}
                    onClick={() => setRoleFilter(r)}
                  >
                    {r === 'ALL' ? `All (${managedUsers.length})` : ROLE_LABELS[r]}
                  </button>
                ))}
              </div>

              <div className="data-table-container">
                <table className="modern-data-table">
                  <thead>
                    <tr>
                      <th>Name / Facility</th>
                      <th>Email</th>
                      <th>Assigned Role</th>
                      <th>Lab / Courier ID</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <tr key={u.email}>
                        <td><strong>{u.displayName}</strong></td>
                        <td>{u.email}</td>
                        <td><span className="status-pill-blue">{ROLE_LABELS[u.role]}</span></td>
                        <td>{u.labId || u.phlebotomistId || 'Global'}</td>
                        <td>
                          <span className={u.isActive ? 'status-pill-green' : 'status-pill-red'}>
                            {u.isActive ? '● Active' : '● Paused'}
                          </span>
                        </td>
                        <td>
                          {u.email.toLowerCase() === ADMIN_LOGIN_EMAIL.toLowerCase() ? (
                            <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Primary Admin</span>
                          ) : (
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() =>
                                onShowAlert({
                                  variant: 'confirm',
                                  title: u.isActive ? 'Pause Account?' : 'Activate Account?',
                                  message: `${u.isActive ? 'Pause' : 'Restore'} sign-in access for ${u.email}?`,
                                  onConfirm: () => {
                                    void toggleManagedUserStatus(session.bearerToken, u, !u.isActive);
                                  },
                                })
                              }
                            >
                              {u.isActive ? 'Pause' : 'Activate'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: BOOKINGS */}
          {activeTab === 'bookings' && (
            <div className="chart-card-modern">
              <div className="card-top-header">
                <div>
                  <h2 className="card-top-title">Live Specimen Pickup Bookings ({filteredOrders.length})</h2>
                  <p style={{ fontSize: '0.8rem', color: '#64748B' }}>Real-time bookings across all connected labs</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select className="form-select" style={{ width: '210px' }} value={orderStatusFilter} onChange={(e) => setOrderStatusFilter(e.target.value)}>
                    <option value="ALL">All Statuses</option>
                    {Object.values(OrderStatus).map((st) => (
                      <option key={st} value={st}>{formatOrderStatus(st)}</option>
                    ))}
                  </select>
                  <button type="button" className="btn-primary" onClick={handleExportCsv}>
                    Export CSV
                  </button>
                </div>
              </div>

              {filteredOrders.length === 0 ? (
                <div className="empty-state-box">
                  <h4>No Matching Bookings Found</h4>
                  <p>Live orders submitted from Collection Centers will appear here automatically.</p>
                </div>
              ) : (
                <div className="data-table-container">
                  <table className="modern-data-table">
                    <thead>
                      <tr>
                        <th>Booking ID</th>
                        <th>Small Lab</th>
                        <th>Target Hub</th>
                        <th>Patient</th>
                        <th>Tests</th>
                        <th>Phlebotomist</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((o) => (
                        <tr key={o.id}>
                          <td><strong>{o.orderNumber}</strong></td>
                          <td>{o.smallLabName}</td>
                          <td>{o.targetLabName}</td>
                          <td>{o.patient.pseudonym}</td>
                          <td>{o.specimens.map((s) => s.testCode).join(', ')}</td>
                          <td>{o.phlebotomistName || 'Unassigned'}</td>
                          <td>{formatInr(o.totalAmountInr || 0)}</td>
                          <td><span className="status-pill-blue">{formatOrderStatus(o.status)}</span></td>
                          <td>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => {
                                setAssignModalOrder(o);
                                setAssignPhleboId(o.phlebotomistId || phlebotomists[0]?.id || '');
                              }}
                            >
                              Assign Courier
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

          {/* TAB 4: LABS */}
          {(activeTab === 'labs' || activeTab === 'labs-small' || activeTab === 'labs-large' || activeTab === 'labs-verify') && (
            <div className="chart-card-modern">
              <div className="card-top-header">
                <div>
                  <h2 className="card-top-title">Registered Laboratories Directory</h2>
                  <p style={{ fontSize: '0.8rem', color: '#64748B' }}>All Collection Centers and Reference Testing Labs</p>
                </div>
                <button type="button" className="btn-primary" onClick={() => setShowAddLabModal(true)}>
                  + Add Lab Facility
                </button>
              </div>
              {labs.length === 0 ? (
                <div className="empty-state-box">
                  <h4>No Laboratories Added Yet</h4>
                  <p>Add a Collection Center or Reference Lab to start routing sample pickups.</p>
                  <button type="button" className="btn-primary" onClick={() => setShowAddLabModal(true)}>
                    + Register First Lab
                  </button>
                </div>
              ) : (
                <div className="data-table-container">
                  <table className="modern-data-table">
                    <thead>
                      <tr>
                        <th>Lab ID</th>
                        <th>Name</th>
                        <th>Type</th>
                        <th>City</th>
                        <th>Email</th>
                        <th>Verification</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {labs
                        .filter((l) => {
                          if (activeTab === 'labs-small') return l.type === 'SMALL_LAB';
                          if (activeTab === 'labs-large') return l.type === 'LARGE_LAB';
                          if (activeTab === 'labs-verify') return l.verificationStatus === 'PENDING';
                          return true;
                        })
                        .map((lab) => (
                          <tr key={lab.id}>
                            <td><strong>{lab.id}</strong></td>
                            <td>{lab.name}</td>
                            <td>{lab.type === 'SMALL_LAB' ? 'Collection Center' : 'Reference Hub'}</td>
                            <td>{lab.city}</td>
                            <td>{lab.email}</td>
                            <td>
                              <span className={lab.verificationStatus === 'VERIFIED' ? 'status-pill-green' : 'status-pill-amber'}>
                                {formatLabel(lab.verificationStatus)}
                              </span>
                            </td>
                            <td>
                              {lab.verificationStatus !== 'VERIFIED' ? (
                                <button
                                  type="button"
                                  className="btn-primary"
                                  onClick={() => void updateLabVerification(lab.id, 'VERIFIED')}
                                >
                                  Verify Lab
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  onClick={() =>
                                    onShowAlert({
                                      variant: 'info',
                                      title: lab.name,
                                      message: `ID: ${lab.id}\nType: ${lab.type === 'SMALL_LAB' ? 'Collection Center' : 'Reference Hub'}\nCity: ${lab.city}\nAccreditation: ${lab.nablNumber || 'Standard'}`,
                                    })
                                  }
                                >
                                  Inspect
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: PHLEBOTOMISTS */}
          {activeTab === 'phlebotomists' && (
            <div className="chart-card-modern">
              <div className="card-top-header">
                <div>
                  <h2 className="card-top-title">Field Phlebotomist Fleet ({phlebotomists.length})</h2>
                  <p style={{ fontSize: '0.8rem', color: '#64748B' }}>Live rider status &amp; cooling box details (Mobile App accounts)</p>
                </div>
                <button type="button" className="btn-primary" onClick={() => setShowAddPhleboModal(true)}>
                  + Add Phlebotomist
                </button>
              </div>
              {phlebotomists.length === 0 ? (
                <div className="empty-state-box">
                  <h4>No Phlebotomists in Fleet</h4>
                  <p>Add a field phlebotomist here or create a courier account in Users &amp; Roles.</p>
                  <button type="button" className="btn-primary" onClick={() => setShowAddPhleboModal(true)}>
                    + Add Phlebotomist
                  </button>
                </div>
              ) : (
                <div className="data-table-container">
                  <table className="modern-data-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Email / Phone</th>
                        <th>Shift</th>
                        <th>Location</th>
                        <th>Cooler Temp</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {phlebotomists.map((p) => (
                        <tr key={p.id}>
                          <td><strong>{p.id}</strong></td>
                          <td>{p.name}</td>
                          <td>{p.email}</td>
                          <td><span className={p.status === 'ONLINE' ? 'status-pill-green' : 'status-pill-amber'}>{formatLabel(p.status)}</span></td>
                          <td>{p.currentLocation}</td>
                          <td>{p.chillerTempCelsius}°C</td>
                          <td>
                            <button type="button" className="btn-secondary" onClick={() => setSelectedCourier(p)}>
                              Live Details
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

          {/* TAB 6: SAMPLES */}
          {activeTab === 'samples' && (
            <div className="chart-card-modern">
              <div className="card-top-header">
                <h2 className="card-top-title">Sample Handover &amp; Temperature Log ({custodyEvents.length} Events)</h2>
              </div>
              {custodyEvents.length === 0 ? (
                <div className="empty-state-box">
                  <h4>No Custody Events Recorded Yet</h4>
                  <p>Every pickup scan, temperature reading, and handover is logged here.</p>
                </div>
              ) : (
                <div className="data-table-container">
                  <table className="modern-data-table">
                    <thead>
                      <tr>
                        <th>Order ID</th>
                        <th>Event</th>
                        <th>Updated By</th>
                        <th>Role</th>
                        <th>Temp Logged</th>
                        <th>Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {custodyEvents.map((ev) => (
                        <tr key={ev.id}>
                          <td><strong>{ev.orderId}</strong></td>
                          <td><span className="status-pill-blue">{formatLabel(ev.eventType)}</span></td>
                          <td>{ev.operatorName}</td>
                          <td>{ROLE_LABELS[ev.operatorRole] || formatLabel(ev.operatorRole)}</td>
                          <td>{ev.temperatureCelsius !== undefined ? `${ev.temperatureCelsius}°C` : '—'}</td>
                          <td>{new Date(ev.timestamp).toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
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
                <h2 className="card-top-title">Diagnostic Reports Archive ({reports.length})</h2>
              </div>
              {reports.length === 0 ? (
                <div className="empty-state-box">
                  <h4>No Verified Reports Uploaded Yet</h4>
                  <p>Partner reference labs upload signed PDF reports once testing finishes.</p>
                </div>
              ) : (
                <div className="data-table-container">
                  <table className="modern-data-table">
                    <thead>
                      <tr>
                        <th>Report ID</th>
                        <th>Booking</th>
                        <th>Patient</th>
                        <th>Tests</th>
                        <th>Pathologist</th>
                        <th>Download</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.map((r) => (
                        <tr key={r.id}>
                          <td><strong>{r.id}</strong></td>
                          <td>{r.orderNumber}</td>
                          <td>{r.patientName}</td>
                          <td>{r.testsSummary}</td>
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

          {/* TAB 8: PAYMENTS & SETTLEMENTS */}
          {activeTab === 'payments' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="chart-card-modern">
                <div className="card-top-header">
                  <div>
                    <h2 className="card-top-title">Payments &amp; Partner Payouts ({settlements.length})</h2>
                    <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
                      Reconcile online customer collections and release payouts to Reference Labs &amp; Field Phlebotomists
                    </p>
                  </div>
                </div>
                <div className="kpi-row" style={{ marginBottom: '20px' }}>
                  <div className="kpi-card-modern">
                    <div className="kpi-body">
                      <span className="kpi-title">Collected Online</span>
                      <span className="kpi-main-number">{formatInr(metrics.collectedOnline)}</span>
                      <span className="kpi-sub-split">{formatInr(metrics.awaitingCollection)} awaiting payment</span>
                    </div>
                  </div>
                  <div className="kpi-card-modern">
                    <div className="kpi-body">
                      <span className="kpi-title">Platform Commission</span>
                      <span className="kpi-main-number">{formatInr(metrics.platformFees)}</span>
                      <span className="kpi-sub-split">Out of {formatInr(metrics.grossGmv)} billed</span>
                    </div>
                  </div>
                  <div className="kpi-card-modern">
                    <div className="kpi-body">
                      <span className="kpi-title">Reference Lab Payouts</span>
                      <span className="kpi-main-number">{formatInr(metrics.labPayoutsDue)} due</span>
                      <span className="kpi-sub-split">{formatInr(metrics.labPayoutsPaid)} released</span>
                    </div>
                  </div>
                  <div className="kpi-card-modern">
                    <div className="kpi-body">
                      <span className="kpi-title">Courier Payouts</span>
                      <span className="kpi-main-number">{formatInr(metrics.phleboPayoutsDue)} due</span>
                      <span className="kpi-sub-split">{formatInr(metrics.phleboPayoutsPaid)} released</span>
                    </div>
                  </div>
                </div>
                {settlements.length === 0 ? (
                  <div className="empty-state-box"><h4>No Settlement Entries Yet</h4><p>Settlements are created automatically for every booking.</p></div>
                ) : (
                  <div className="data-table-container">
                    <table className="modern-data-table">
                      <thead>
                        <tr>
                          <th>Invoice &amp; Order</th>
                          <th>Collection &rarr; Hub</th>
                          <th>Collection Status</th>
                          <th>Platform Fee</th>
                          <th>Reference Lab Split</th>
                          <th>Phlebotomist Split</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {settlements.map((s) => {
                          const isPaidOnline = s.paymentStatus === 'PAID';
                          const isLabPaid = s.labPayoutStatus === 'PAID' || s.status === 'SETTLED';
                          const isPhleboPaid = s.phleboPayoutStatus === 'PAID' || s.status === 'SETTLED';
                          const linkedOrder = orders.find((o) => o.id === s.orderId);
                          const assignedPhleboId = s.phlebotomistId || linkedOrder?.phlebotomistId;
                          const assignedPhleboName = s.phlebotomistName || linkedOrder?.phlebotomistName;
                          const canReleaseBoth = !isLabPaid || (!isPhleboPaid && Boolean(assignedPhleboId));

                          const openPayout = (recipientType: 'LARGE_LAB' | 'PHLEBOTOMIST' | 'BOTH') => {
                            setPayoutModalSettlement({
                              ...s,
                              phlebotomistId: assignedPhleboId,
                              phlebotomistName: assignedPhleboName,
                            });
                            setPayoutRecipientType(recipientType);
                            setPayoutMode('UPI');
                            setPayoutReferenceId('');
                            setPayoutNotes('');
                            setForceUnpaidPayout(!isPaidOnline);
                          };

                          return (
                            <tr key={s.id}>
                              <td>
                                <strong>{s.id}</strong>
                                <div style={{ fontSize: '0.73rem', color: '#64748B' }}>{s.orderNumber}</div>
                              </td>
                              <td>
                                <div>{s.smallLabName}</div>
                                <div style={{ fontSize: '0.73rem', color: '#64748B' }}>&rarr; {s.targetLabName}</div>
                              </td>
                              <td>
                                <strong>{formatInr(s.grossAmountInr)}</strong>
                                <div style={{ marginTop: '4px' }}>
                                  <span className={isPaidOnline ? 'status-pill-green' : 'status-pill-amber'}>
                                    {isPaidOnline ? 'Paid Online' : 'Unpaid'}
                                  </span>
                                </div>
                                {s.razorpayPaymentId && (
                                  <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '2px' }}>
                                    {s.razorpayPaymentId}
                                  </div>
                                )}
                              </td>
                              <td>{formatInr(s.platformFeeInr)}</td>
                              <td>
                                <strong>{formatInr(s.labPayoutInr)}</strong>
                                <div style={{ marginTop: '4px' }}>
                                  <span className={isLabPaid ? 'status-pill-green' : 'status-pill-amber'}>
                                    {isLabPaid ? 'Paid' : 'Due'}
                                  </span>
                                </div>
                                {s.labPayoutRef && (
                                  <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '2px' }}>{s.labPayoutRef}</div>
                                )}
                              </td>
                              <td>
                                <strong>{formatInr(s.phleboPayoutInr)}</strong>
                                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                  {assignedPhleboName || 'Unassigned'}
                                </div>
                                <div style={{ marginTop: '4px' }}>
                                  <span className={isPhleboPaid ? 'status-pill-green' : 'status-pill-amber'}>
                                    {isPhleboPaid ? 'Paid' : 'Due'}
                                  </span>
                                </div>
                                {s.phleboPayoutRef && (
                                  <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '2px' }}>{s.phleboPayoutRef}</div>
                                )}
                              </td>
                              <td>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                  {!isLabPaid && (
                                    <button type="button" className="btn-secondary" onClick={() => openPayout('LARGE_LAB')}>
                                      Pay Lab
                                    </button>
                                  )}
                                  {!isPhleboPaid && assignedPhleboId && (
                                    <button type="button" className="btn-secondary" onClick={() => openPayout('PHLEBOTOMIST')}>
                                      Pay Courier
                                    </button>
                                  )}
                                  {s.status !== 'SETTLED' && canReleaseBoth ? (
                                    <button type="button" className="btn-primary" onClick={() => openPayout('BOTH')}>
                                      Release Payout
                                    </button>
                                  ) : s.status === 'SETTLED' ? (
                                    <span className="status-pill-green">Settled</span>
                                  ) : (
                                    <button type="button" className="btn-secondary" onClick={() => void markSettlementSettled(s.id)}>
                                      Mark Settled
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

              <div className="chart-card-modern">
                <div className="card-top-header">
                  <h3 className="card-top-title">Released Payout Ledger ({payouts.length})</h3>
                </div>
                {payouts.length === 0 ? (
                  <div className="empty-state-box">
                    <h4>No Payouts Released Yet</h4>
                    <p>Disbursements released to Reference Labs and Field Phlebotomists appear here with UTR references.</p>
                  </div>
                ) : (
                  <div className="data-table-container">
                    <table className="modern-data-table">
                      <thead>
                        <tr>
                          <th>Payout ID</th>
                          <th>Order</th>
                          <th>Recipient</th>
                          <th>Role</th>
                          <th>Mode &amp; Destination</th>
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
                            <td>{p.recipientName}</td>
                            <td>{p.recipientRole === 'LARGE_LAB' ? 'Reference Lab' : 'Phlebotomist'}</td>
                            <td>{p.mode} • {p.destinationSummary}</td>
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

          {/* TAB 9: COMMISSION */}
          {activeTab === 'commission' && (
            <div className="chart-card-modern" style={{ maxWidth: '640px' }}>
              <h2 className="card-top-title">Commission &amp; Service Fee Rules</h2>
              <div style={{ marginTop: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Platform Fee (%)</label>
                  <input type="number" className="form-input" value={commConfig.commissionPct} onChange={(e) => setCommConfig({ ...commConfig, commissionPct: Number(e.target.value) })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Courier Base Fee (₹)</label>
                  <input type="number" className="form-input" value={commConfig.courierBaseFeeInr} onChange={(e) => setCommConfig({ ...commConfig, courierBaseFeeInr: Number(e.target.value) })} />
                </div>
                <div className="form-group">
                  <label className="form-label">STAT Priority Surcharge (₹)</label>
                  <input type="number" className="form-input" value={commConfig.statSurchargeInr} onChange={(e) => setCommConfig({ ...commConfig, statSurchargeInr: Number(e.target.value) })} />
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={async () => {
                    await saveCommissionSettings(commConfig, session.profile.email);
                    onShowAlert({ variant: 'success', title: 'Commission Rules Saved', message: 'Commission and service fee rules have been saved.' });
                  }}
                >
                  Save Commission Rules
                </button>
              </div>
            </div>
          )}

          {/* TAB 10: ANALYTICS */}
          {activeTab === 'analytics' && (
            <div className="chart-card-modern">
              <h2 className="card-top-title">Live Weekday Booking Volume</h2>
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

          {/* TAB 11: MASTER DATA */}
          {activeTab === 'master-data' && (
            <div className="chart-card-modern">
              <div className="card-top-header">
                <div>
                  <h2 className="card-top-title">Master Test Catalogue ({testCatalog.length})</h2>
                  <p style={{ fontSize: '0.8rem', color: '#64748B' }}>Tests, tube types, and partner pricing available for bookings</p>
                </div>
                <button type="button" className="btn-primary" onClick={() => setShowAddTestModal(true)}>
                  + Add Test Panel
                </button>
              </div>
              {testCatalog.length === 0 ? (
                <div className="empty-state-box">
                  <h4>Test Catalogue Is Empty</h4>
                  <p>Add diagnostic tests (e.g., CBC, LFT, TSH) so Collection Labs can book sample pickups.</p>
                  <button type="button" className="btn-primary" onClick={() => setShowAddTestModal(true)}>+ Add First Test Panel</button>
                </div>
              ) : (
                <div className="data-table-container">
                  <table className="modern-data-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Name</th>
                        <th>Department</th>
                        <th>Tube</th>
                        <th>B2B Price</th>
                        <th>TAT</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {testCatalog.map((t) => (
                        <tr key={t.id}>
                          <td><strong>{t.code}</strong></td>
                          <td>{t.name}</td>
                          <td>{t.department}</td>
                          <td>{formatLabel(t.tubeType)}</td>
                          <td>{formatInr(t.b2bPriceInr)}</td>
                          <td>{t.tatHours} hrs</td>
                          <td>
                            <button type="button" className="btn-secondary" onClick={() => void deleteDiagnosticTest(t.id)}>
                              Delete
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

          {/* TAB 12: SETTINGS */}
          {activeTab === 'settings' && (
            <div className="settings-grid-2">
              <div className="chart-card-modern">
                <h2 className="card-top-title">Pickup Targets &amp; Email Preferences</h2>
                <div style={{ marginTop: '16px' }}>
                  <div className="form-group">
                    <label className="form-label">Urgent Pickup Target (Minutes)</label>
                    <input type="number" className="form-input" value={slaConfig.statPickupSlaMinutes} onChange={(e) => setSlaConfig({ ...slaConfig, statPickupSlaMinutes: Number(e.target.value) })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Auto-Reassign Delay (Minutes)</label>
                    <input type="number" className="form-input" value={slaConfig.autoReassignDelayMinutes} onChange={(e) => setSlaConfig({ ...slaConfig, autoReassignDelayMinutes: Number(e.target.value) })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Admin Alert Email</label>
                    <input type="email" className="form-input" value={emailSettings.adminEmail} onChange={(e) => setEmailSettings({ ...emailSettings, adminEmail: e.target.value })} />
                  </div>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={async () => {
                      await saveAdminSettings({ sla: slaConfig, email: emailSettings, adminEmail: session.profile.email });
                      onShowAlert({ variant: 'success', title: 'Settings Saved', message: 'Pickup targets and email notification preferences saved.' });
                    }}
                  >
                    Save Settings
                  </button>
                </div>
              </div>

              <div className="chart-card-modern">
                <h2 className="card-top-title">Account Sign-In Password</h2>
                <p style={{ fontSize: '0.82rem', color: '#64748B', marginTop: '4px' }}>
                  Set or change the password for <strong>{session.profile.email}</strong>.
                </p>
                <form onSubmit={(e) => void handleUpdateAccountPassword(e)} style={{ marginTop: '14px' }}>
                  <div className="form-group">
                    <label className="form-label">New Password</label>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="Minimum 6 characters"
                      value={newAccountPassword}
                      onChange={(e) => setNewAccountPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Confirm Password</label>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="Re-enter password"
                      value={confirmAccountPassword}
                      onChange={(e) => setConfirmAccountPassword(e.target.value)}
                      required
                    />
                  </div>
                  <button type="submit" className="btn-primary" disabled={savingPassword}>
                    {savingPassword ? 'Updating...' : 'Set / Update Password'}
                  </button>
                </form>
              </div>

              <div className="chart-card-modern">
                <h2 className="card-top-title">Document Upload &amp; Email Check</h2>
                <div style={{ marginTop: '16px' }}>
                  <button type="button" className="btn-primary" onClick={() => void handleSendTestNotification()}>
                    Send Live Test Email &amp; Alert
                  </button>
                  {notifStatusMsg && <p style={{ fontSize: '0.8rem', color: '#0F766E', marginTop: '8px' }}>{notifStatusMsg}</p>}
                  <div className="form-group" style={{ marginTop: '20px' }}>
                    <label className="form-label">Test Document Upload</label>
                    <input type="file" className="form-input" onChange={(e) => void handleStorageUploadTest(e.target.files?.[0])} />
                    {storageStatusMsg && <p style={{ fontSize: '0.78rem', marginTop: '8px', wordBreak: 'break-all' }}>{storageStatusMsg}</p>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* MODAL: ADD ROLE USER */}
      {showAddUserModal && (
        <div className="modal-overlay" onClick={() => setShowAddUserModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Team or Partner Account</h3>
              <button type="button" className="btn-secondary" onClick={() => setShowAddUserModal(false)}>✕</button>
            </div>
            <form onSubmit={(e) => void handleProvisionUserSubmit(e)}>
              <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select className="form-select" value={newUserRole} onChange={(e) => setNewUserRole(e.target.value as UserRole)}>
                    <option value={UserRole.SMALL_LAB}>Small Collection Lab</option>
                    <option value={UserRole.LARGE_LAB}>Large Reference Lab</option>
                    <option value={UserRole.PHLEBOTOMIST}>Field Phlebotomist (Mobile App Only)</option>
                    <option value={UserRole.ADMIN}>Platform Admin</option>
                  </select>
                </div>
                {newUserRole === UserRole.PHLEBOTOMIST && (
                  <div className="admin-auth-alert success" style={{ marginBottom: '12px', fontSize: '0.8rem' }}>
                    Field Phlebotomists sign in only on the LabSetu Mobile App.
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Name / Facility</label>
                  <input className="form-input" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input type="email" className="form-input" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} required />
                </div>
                {(newUserRole === UserRole.SMALL_LAB || newUserRole === UserRole.LARGE_LAB) && (
                  <div className="form-group">
                    <label className="form-label">Lab ID (Linked automatically to facility profile)</label>
                    <input className="form-input" value={newUserLabId} onChange={(e) => setNewUserLabId(e.target.value)} />
                  </div>
                )}
                {newUserRole === UserRole.PHLEBOTOMIST && (
                  <div className="form-group">
                    <label className="form-label">Phlebotomist ID</label>
                    <input className="form-input" value={newUserPhleboId} onChange={(e) => setNewUserPhleboId(e.target.value)} />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">City</label>
                  <input className="form-input" value={newUserCity} onChange={(e) => setNewUserCity(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone (Optional)</label>
                  <input className="form-input" value={newUserPhone} onChange={(e) => setNewUserPhone(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Initial Password (Optional)</label>
                  <input type="password" className="form-input" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowAddUserModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={savingUser}>{savingUser ? 'Saving...' : 'Create Account'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD LAB FACILITY */}
      {showAddLabModal && (
        <div className="modal-overlay" onClick={() => setShowAddLabModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Register Lab Facility</h3>
              <button type="button" className="btn-secondary" onClick={() => setShowAddLabModal(false)}>✕</button>
            </div>
            <form onSubmit={(e) => void handleSaveNewLab(e)}>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">Facility Type</label><select className="form-select" value={labTier} onChange={(e) => setLabTier(e.target.value as LabFacilityTier)}><option value="SMALL_LAB">Small Collection Center</option><option value="LARGE_LAB">Large Reference Hub</option></select></div>
                <div className="form-group"><label className="form-label">Lab Name</label><input className="form-input" value={labName} onChange={(e) => setLabName(e.target.value)} required /></div>
                <div className="form-group"><label className="form-label">City</label><input className="form-input" value={labCity} onChange={(e) => setLabCity(e.target.value)} required /></div>
                <div className="form-group"><label className="form-label">Address</label><input className="form-input" value={labAddress} onChange={(e) => setLabAddress(e.target.value)} required /></div>
                <div className="form-group"><label className="form-label">Contact Email</label><input type="email" className="form-input" value={labEmail} onChange={(e) => setLabEmail(e.target.value)} required /></div>
                <div className="form-group"><label className="form-label">Phone</label><input className="form-input" value={labPhone} onChange={(e) => setLabPhone(e.target.value)} /></div>
                <div className="form-group"><label className="form-label">NABL / License ID</label><input className="form-input" value={labNabl} onChange={(e) => setLabNabl(e.target.value)} /></div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowAddLabModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Save Facility</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD PHLEBO */}
      {showAddPhleboModal && (
        <div className="modal-overlay" onClick={() => setShowAddPhleboModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Add Field Phlebotomist</h3><button type="button" className="btn-secondary" onClick={() => setShowAddPhleboModal(false)}>✕</button></div>
            <form onSubmit={(e) => void handleSaveNewPhlebo(e)}>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">Name</label><input className="form-input" value={phleboName} onChange={(e) => setPhleboName(e.target.value)} required /></div>
                <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-input" value={phleboEmail} onChange={(e) => setPhleboEmail(e.target.value)} required /></div>
                <div className="form-group"><label className="form-label">Phone</label><input className="form-input" value={phleboPhone} onChange={(e) => setPhleboPhone(e.target.value)} required /></div>
                <div className="form-group"><label className="form-label">Active Zone</label><input className="form-input" value={phleboZone} onChange={(e) => setPhleboZone(e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Vehicle</label><input className="form-input" value={phleboVehicle} onChange={(e) => setPhleboVehicle(e.target.value)} /></div>
              </div>
              <div className="modal-footer"><button type="button" className="btn-secondary" onClick={() => setShowAddPhleboModal(false)}>Cancel</button><button type="submit" className="btn-primary">Save</button></div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD TEST PANEL */}
      {showAddTestModal && (
        <div className="modal-overlay" onClick={() => setShowAddTestModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Add Master Test Panel</h3><button type="button" className="btn-secondary" onClick={() => setShowAddTestModal(false)}>✕</button></div>
            <form onSubmit={(e) => void handleSaveTest(e)}>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">Test Code</label><input className="form-input" placeholder="e.g. CBC" value={testCode} onChange={(e) => setTestCode(e.target.value)} required /></div>
                <div className="form-group"><label className="form-label">Test Name</label><input className="form-input" placeholder="Complete Blood Count" value={testName} onChange={(e) => setTestName(e.target.value)} required /></div>
                <div className="form-group"><label className="form-label">Department</label><select className="form-select" value={testDept} onChange={(e) => setTestDept(e.target.value as DiagnosticDepartment)}><option value="Hematology">Hematology</option><option value="Biochemistry">Biochemistry</option><option value="Immunology">Immunology</option><option value="Molecular">Molecular</option><option value="Microbiology">Microbiology</option></select></div>
                <div className="form-group"><label className="form-label">Specimen Type</label><select className="form-select" value={testSpecimen} onChange={(e) => setTestSpecimen(e.target.value as SpecimenType)}>{Object.values(SpecimenType).map((s) => <option key={s} value={s}>{formatLabel(s)}</option>)}</select></div>
                <div className="form-group"><label className="form-label">Tube Type</label><select className="form-select" value={testTube} onChange={(e) => setTestTube(e.target.value as TubeType)}>{Object.values(TubeType).map((t) => <option key={t} value={t}>{formatLabel(t)}</option>)}</select></div>
                <div className="form-group"><label className="form-label">Cold-Chain Band</label><select className="form-select" value={testTemp} onChange={(e) => setTestTemp(e.target.value as StorageTemperature)}>{Object.values(StorageTemperature).map((t) => <option key={t} value={t}>{formatLabel(t)}</option>)}</select></div>
                <div className="form-group"><label className="form-label">B2B Rate (₹)</label><input type="number" className="form-input" value={testB2bPrice} onChange={(e) => setTestB2bPrice(Number(e.target.value))} /></div>
                <div className="form-group"><label className="form-label">Retail MRP (₹) &amp; TAT Hours</label><div style={{ display: 'flex', gap: '8px' }}><input type="number" className="form-input" value={testMrp} onChange={(e) => setTestMrp(Number(e.target.value))} /><input type="number" className="form-input" value={testTat} onChange={(e) => setTestTat(Number(e.target.value))} /></div></div>
              </div>
              <div className="modal-footer"><button type="button" className="btn-secondary" onClick={() => setShowAddTestModal(false)}>Cancel</button><button type="submit" className="btn-primary">Save Test</button></div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ASSIGN COURIER */}
      {assignModalOrder && (
        <div className="modal-overlay" onClick={() => setAssignModalOrder(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Assign Phlebotomist • {assignModalOrder.orderNumber}</h3><button type="button" className="btn-secondary" onClick={() => setAssignModalOrder(null)}>✕</button></div>
            <form onSubmit={(e) => void handleAssignSubmit(e)}>
              <div className="modal-body">
                {phlebotomists.length === 0 ? (
                  <p>No phlebotomists registered yet. Add one first in Phlebotomists.</p>
                ) : (
                  <div className="form-group">
                    <label className="form-label">Select Phlebotomist</label>
                    <select className="form-select" value={assignPhleboId} onChange={(e) => setAssignPhleboId(e.target.value)}>
                      {phlebotomists.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({p.id}) — {formatLabel(p.status)}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="modal-footer"><button type="button" className="btn-secondary" onClick={() => setAssignModalOrder(null)}>Cancel</button><button type="submit" className="btn-primary" disabled={!phlebotomists.length}>Confirm Assignment</button></div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: COURIER DETAILS */}
      {selectedCourier && (
        <div className="modal-overlay" onClick={() => setSelectedCourier(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Courier Details: {selectedCourier.name}</h3><button type="button" className="btn-secondary" onClick={() => setSelectedCourier(null)}>✕</button></div>
            <div className="modal-body">
              <p><strong>ID:</strong> {selectedCourier.id}</p>
              <p><strong>Location:</strong> {selectedCourier.currentLocation}</p>
              <p><strong>Cooler Box Temp:</strong> {selectedCourier.chillerTempCelsius}°C</p>
              <p><strong>Battery:</strong> {selectedCourier.batteryPct}%</p>
              <p><strong>Status:</strong> {formatLabel(selectedCourier.status)}</p>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RELEASE PARTNER PAYOUT */}
      {payoutModalSettlement && (
        <div className="modal-overlay" onClick={() => !submittingPayout && setPayoutModalSettlement(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Release Payout • {payoutModalSettlement.orderNumber}</h3>
              <button
                type="button"
                className="btn-secondary"
                disabled={submittingPayout}
                onClick={() => setPayoutModalSettlement(null)}
              >
                ✕
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!payoutModalSettlement) return;
                setSubmittingPayout(true);
                try {
                  const res = await releasePartnerPayoutApi({
                    settlementId: payoutModalSettlement.id,
                    recipientType: payoutRecipientType,
                    mode: payoutMode,
                    referenceId: payoutReferenceId.trim() || undefined,
                    notes: payoutNotes.trim() || undefined,
                    forceWithoutCollection: forceUnpaidPayout,
                  });
                  const count = res?.data?.payouts?.length ?? 1;
                  setPayoutModalSettlement(null);
                  onShowAlert({
                    variant: 'success',
                    title: 'Partner Payout Released',
                    message:
                      res.message ||
                      `Released ${count} payout transfer(s) for ${payoutModalSettlement.orderNumber}.`,
                  });
                } catch (err) {
                  onShowAlert({
                    variant: 'error',
                    title: 'Payout Failed',
                    message:
                      err instanceof Error
                        ? err.message
                        : 'Could not release payout. Please verify details and try again.',
                  });
                } finally {
                  setSubmittingPayout(false);
                }
              }}
            >
              <div className="modal-body">
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px', marginBottom: '14px', fontSize: '0.84rem' }}>
                  <div><strong>Invoice:</strong> {payoutModalSettlement.id} • Gross: {formatInr(payoutModalSettlement.grossAmountInr)}</div>
                  <div><strong>Reference Lab Share:</strong> {payoutModalSettlement.targetLabName} — {formatInr(payoutModalSettlement.labPayoutInr)}</div>
                  <div>
                    <strong>Courier Share:</strong> {payoutModalSettlement.phlebotomistName || 'Unassigned'} — {formatInr(payoutModalSettlement.phleboPayoutInr)}
                  </div>
                  <div style={{ marginTop: '4px' }}>
                    <strong>Customer Collection:</strong>{' '}
                    {payoutModalSettlement.paymentStatus === 'PAID'
                      ? `Paid Online (${payoutModalSettlement.razorpayPaymentId || 'Verified'})`
                      : 'Pending Customer Payment'}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Payout Recipient</label>
                  <select
                    className="form-select"
                    value={payoutRecipientType}
                    onChange={(e) =>
                      setPayoutRecipientType(e.target.value as 'LARGE_LAB' | 'PHLEBOTOMIST' | 'BOTH')
                    }
                  >
                    <option value="BOTH">Both Reference Lab &amp; Field Phlebotomist</option>
                    <option value="LARGE_LAB">Reference Lab Only ({formatInr(payoutModalSettlement.labPayoutInr)})</option>
                    <option value="PHLEBOTOMIST">Field Phlebotomist Only ({formatInr(payoutModalSettlement.phleboPayoutInr)})</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Transfer Method</label>
                  <select
                    className="form-select"
                    value={payoutMode}
                    onChange={(e) =>
                      setPayoutMode(e.target.value as 'UPI' | 'IMPS' | 'NEFT' | 'RAZORPAYX')
                    }
                  >
                    <option value="UPI">UPI Instant Transfer</option>
                    <option value="IMPS">IMPS Bank Transfer</option>
                    <option value="NEFT">NEFT Settlement</option>
                    <option value="RAZORPAYX">Automated Payout (RazorpayX)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">UTR / Transfer Reference (Optional — auto-generated if blank)</label>
                  <input
                    className="form-input"
                    placeholder="e.g. UTR3241984712"
                    value={payoutReferenceId}
                    onChange={(e) => setPayoutReferenceId(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Settlement Notes (Optional)</label>
                  <input
                    className="form-input"
                    placeholder="e.g. Daily partner batch settlement"
                    value={payoutNotes}
                    onChange={(e) => setPayoutNotes(e.target.value)}
                  />
                </div>

                {payoutModalSettlement.paymentStatus !== 'PAID' && (
                  <label className="checkbox-row" style={{ marginTop: '8px', background: '#FEF3C7', padding: '10px', borderRadius: '8px' }}>
                    <input
                      type="checkbox"
                      checked={forceUnpaidPayout}
                      onChange={(e) => setForceUnpaidPayout(e.target.checked)}
                    />
                    <span style={{ fontSize: '0.8rem', color: '#92400E' }}>
                      Customer payment is still marked Unpaid. Approve releasing payout anyway.
                    </span>
                  </label>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={submittingPayout}
                  onClick={() => setPayoutModalSettlement(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submittingPayout}>
                  {submittingPayout ? 'Releasing Payout...' : 'Confirm & Release Payout'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
