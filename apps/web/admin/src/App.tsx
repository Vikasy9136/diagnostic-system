import { useState, useEffect, type FormEvent } from 'react';
import {
  LABSETU_THEME,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  type EmailDeliverySettings,
  type PlatformNotification,
  UserRole,
} from '@diagnostic/shared';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  getIdTokenResult,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import {
  ADMIN_LOGIN_EMAIL,
  auth,
  db,
  uploadDiagnosticDocument,
} from './firebase';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

const FALLBACK_NOTIFICATIONS: PlatformNotification[] = [
  {
    id: 'notif-local-1',
    title: 'Firebase Project Linked (labsetu-diagnostics)',
    message:
      'Admin login credential lab.setu.admin@gmail.com, Firestore database, storage rules, and email alert pipeline configured.',
    category: NotificationCategory.SYSTEM_ALERT,
    priority: NotificationPriority.NORMAL,
    recipientEmail: ADMIN_LOGIN_EMAIL,
    recipientRole: UserRole.ADMIN,
    channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    read: false,
    emailSent: false,
    pushSent: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'notif-local-2',
    title: 'STAT Pickup Alert — BK-10456',
    message:
      'Rahul Yadav picked up CBC + LFT specimen from Bhandup Care Lab (Cold-chain cooler 4.2°C).',
    category: NotificationCategory.PICKUP_ASSIGNED,
    priority: NotificationPriority.HIGH,
    recipientEmail: ADMIN_LOGIN_EMAIL,
    recipientRole: UserRole.ADMIN,
    orderId: 'BK-10456',
    channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    read: false,
    emailSent: false,
    pushSent: false,
    createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
];

interface ActiveCourier {
  id: string;
  name: string;
  phone: string;
  activeOrders: number;
  currentLocation: string;
  battery: string;
  tempStatus: string;
  status: 'Online' | 'Offline';
  rating: string;
}

const ACTIVE_COURIERS: ActiveCourier[] = [
  {
    id: 'PHL-204',
    name: 'Rahul Yadav',
    phone: '+91 98000 00000',
    activeOrders: 3,
    currentLocation: 'Mulund West Link Rd',
    battery: '88%',
    tempStatus: 'Normal (4.2°C)',
    status: 'Online',
    rating: '4.95 ★',
  },
  {
    id: 'PHL-188',
    name: 'Amit Salunkhe',
    phone: '+91 98111 22233',
    activeOrders: 2,
    currentLocation: 'Thane Station Area',
    battery: '74%',
    tempStatus: 'Normal (4.8°C)',
    status: 'Online',
    rating: '4.88 ★',
  },
  {
    id: 'PHL-312',
    name: 'Vikram Shinde',
    phone: '+91 98222 33344',
    activeOrders: 4,
    currentLocation: 'Ghatkopar East',
    battery: '92%',
    tempStatus: 'Normal (3.9°C)',
    status: 'Online',
    rating: '4.92 ★',
  },
  {
    id: 'PHL-205',
    name: 'Deepak More',
    phone: '+91 98333 44455',
    activeOrders: 0,
    currentLocation: 'Kalyan Hub (Depot)',
    battery: '100%',
    tempStatus: 'Normal (4.1°C)',
    status: 'Offline',
    rating: '4.78 ★',
  },
];

const MOCK_LAB_DIRECTORY = [
  { id: 'LAB-SM-001', name: 'Bhandup Care Lab', type: 'Small Collection Center', city: 'Mumbai', ordersMTD: 184, status: 'Active Verified', nabl: 'Yes' },
  { id: 'LAB-SM-002', name: 'City Health Lab', type: 'Small Collection Center', city: 'Thane', ordersMTD: 142, status: 'Active Verified', nabl: 'Yes' },
  { id: 'LAB-SM-003', name: 'LifeCare Clinic', type: 'Local Center', city: 'Ghatkopar', ordersMTD: 96, status: 'Active Verified', nabl: 'No' },
  { id: 'LAB-LG-100', name: 'Metro Diagnostics Core Lab', type: 'Partner Reference Testing Hub', city: 'Mumbai', ordersMTD: 648, status: 'Active Verified', nabl: 'NABL ISO15189' },
  { id: 'LAB-LG-101', name: 'Apex Reference Center', type: 'Partner Reference Testing Hub', city: 'Thane', ordersMTD: 420, status: 'Active Verified', nabl: 'NABL Certified' },
];

const RECENT_BOOKINGS = [
  { id: 'BK-10456', lab: 'Bhandup Care Lab', tests: 'CBC, LFT, KFT', phlebo: 'Rahul Yadav', status: 'In Progress', statusClass: 'status-pill-blue', time: '10:24 AM' },
  { id: 'BK-10455', lab: 'City Health Lab', tests: 'TSH, FT4', phlebo: 'Priya Desai', status: 'Sample Picked', statusClass: 'status-pill-green', time: '10:16 AM' },
  { id: 'BK-10454', lab: 'LifeCare Lab', tests: 'KFT, Electrolytes', phlebo: 'Ajay Mehta', status: 'Report Ready', statusClass: 'status-pill-purple', time: '09:58 AM' },
  { id: 'BK-10453', lab: 'Sharma Diagnostics', tests: 'CBC, Lipid', phlebo: 'Sneha Patil', status: 'Completed', statusClass: 'status-pill-green', time: '09:41 AM' },
  { id: 'BK-10452', lab: 'Metro Health Lab', tests: 'HbA1c', phlebo: 'Rohit Kumar', status: 'Assigned', statusClass: 'status-pill-amber', time: '09:27 AM' },
];

type AdminTab =
  | 'dashboard'
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

export function App() {
  // Authentication & Admin Session State
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [devPreviewSession, setDevPreviewSession] = useState(false);
  const [loginEmail, setLoginEmail] = useState(ADMIN_LOGIN_EMAIL);
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Dashboard UI State
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [labsMenuOpen, setLabsMenuOpen] = useState(true);
  const [selectedCourier, setSelectedCourier] = useState<ActiveCourier | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState('Last 30 Days');
  const [quickActionModal, setQuickActionModal] = useState<string | null>(null);

  // Notifications & Settings State
  const [notifications, setNotifications] = useState<PlatformNotification[]>(FALLBACK_NOTIFICATIONS);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifStatusMsg, setNotifStatusMsg] = useState<string | null>(null);
  const [statSlaMinutes, setStatSlaMinutes] = useState(45);
  const [delayThresholdMinutes, setDelayThresholdMinutes] = useState(15);
  const [settingsStatusMsg, setSettingsStatusMsg] = useState<string | null>(null);
  const [storageStatusMsg, setStorageStatusMsg] = useState<string | null>(null);
  const [emailSettings, setEmailSettings] = useState<EmailDeliverySettings>({
    adminEmail: ADMIN_LOGIN_EMAIL,
    enableBookingEmails: true,
    enableColdChainAlerts: true,
    enableReportReadyEmails: true,
    enableDailySummaryEmails: true,
  });

  // Listen to Firebase Auth state & enforce ADMIN role
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setCurrentUser(null);
        setAuthLoading(false);
        return;
      }

      try {
        const tokenResult = await getIdTokenResult(user);
        const claimRole = tokenResult.claims?.role as string | undefined;
        let firestoreRole: string | undefined;

        try {
          const userSnap = await getDoc(doc(db, 'users', user.uid));
          if (userSnap.exists()) {
            firestoreRole = userSnap.data()?.role as string | undefined;
          }
        } catch {
          // Firestore offline/rules fallback checked below
        }

        const isAdminEmail = user.email?.toLowerCase() === ADMIN_LOGIN_EMAIL.toLowerCase();
        if (claimRole === UserRole.ADMIN || firestoreRole === UserRole.ADMIN || isAdminEmail) {
          setCurrentUser(user);
          setAuthError(null);
        } else {
          await signOut(auth);
          setCurrentUser(null);
          setAuthError(`Access denied: ${user.email} is not authorized as a Platform Admin.`);
        }
      } catch (err) {
        console.error('Admin auth verification error:', err);
        setCurrentUser(user);
      } finally {
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Subscribe to real-time Firestore notifications when authenticated
  useEffect(() => {
    if (!currentUser) return;

    const notifQuery = query(
      collection(db, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(25)
    );

    const unsubscribe = onSnapshot(
      notifQuery,
      (snapshot) => {
        if (!snapshot.empty) {
          const liveItems = snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<PlatformNotification, 'id'>),
          }));
          setNotifications(liveItems);
        }
      },
      (err) => {
        console.warn('Firestore notifications listener skipped:', err.message);
      }
    );

    // Load saved notification & platform settings if present
    getDoc(doc(db, 'settings', 'notifications'))
      .then((snap) => {
        if (snap.exists()) {
          setEmailSettings((prev) => ({
            ...prev,
            ...(snap.data() as Partial<EmailDeliverySettings>),
          }));
        }
      })
      .catch(() => {});

    return () => unsubscribe();
  }, [currentUser]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  async function handleAdminSignIn(e: FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setAuthNotice(null);
    setAuthSubmitting(true);

    try {
      await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword);
    } catch (err: unknown) {
      const fbErr = err as { code?: string; message?: string };
      if (fbErr.code === 'auth/configuration-not-found' || fbErr.code === 'auth/operation-not-allowed') {
        setAuthError(
          'Firebase Email/Password authentication needs to be enabled in Firebase Console (Authentication -> Sign-in method -> Email/Password).'
        );
      } else if (fbErr.code === 'auth/invalid-credential' || fbErr.code === 'auth/wrong-password' || fbErr.code === 'auth/user-not-found') {
        setAuthError(
          `Invalid email or password for ${loginEmail.trim()}. If you haven't set a password yet, click "Reset / Set Password via Email" below.`
        );
      } else {
        setAuthError(fbErr.message || 'Sign in failed. Please check credentials.');
      }
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handlePasswordReset() {
    setAuthError(null);
    setAuthNotice(null);
    const email = loginEmail.trim();
    if (!email) {
      setAuthError('Enter your admin email address first.');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      setAuthNotice(`Password reset link sent to ${email}. Check your Gmail inbox.`);
    } catch (err: unknown) {
      const fbErr = err as { code?: string; message?: string };
      if (fbErr.code === 'auth/configuration-not-found') {
        setAuthError(
          'Enable Email/Password sign-in in Firebase Console (Authentication -> Get Started) before sending reset emails.'
        );
      } else {
        setAuthError(fbErr.message || 'Could not send password reset email.');
      }
    }
  }

  async function handleSignOut() {
    setDevPreviewSession(false);
    if (currentUser) {
      await signOut(auth);
    }
    setNotifOpen(false);
  }

  async function handleMarkNotificationRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    if (currentUser && !id.startsWith('notif-local-')) {
      try {
        await updateDoc(doc(db, 'notifications', id), { read: true });
      } catch {
        // fallback ignored
      }
    }
  }

  async function handleSendTestNotificationAndEmail() {
    setNotifStatusMsg('Dispatching notification & email check...');
    const now = new Date().toISOString();

    try {
      let authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (currentUser) {
        const token = await currentUser.getIdToken();
        authHeaders.Authorization = `Bearer ${token}`;
      } else if (import.meta.env.DEV) {
        authHeaders['x-mock-role'] = UserRole.ADMIN;
      }

      const res = await fetch(`${API_BASE_URL}/notifications/test-email`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ recipientEmail: emailSettings.adminEmail || ADMIN_LOGIN_EMAIL }),
      });

      if (res.ok) {
        const json = await res.json();
        setNotifStatusMsg(json.message || 'Test notification dispatched cleanly.');
        if (json.data) {
          setNotifications((prev) => [json.data, ...prev]);
        }
        return;
      }
    } catch {
      // Backend API may not be running locally; fallback to direct Firestore write when signed in
    }

    if (currentUser) {
      try {
        const notifPayload: Omit<PlatformNotification, 'id'> = {
          title: 'Admin Test Email & Firestore Alert',
          message: `Verification alert queued for ${emailSettings.adminEmail} at ${new Date(now).toLocaleTimeString('en-IN')}.`,
          category: NotificationCategory.SYSTEM_ALERT,
          priority: NotificationPriority.NORMAL,
          recipientUid: currentUser.uid,
          recipientEmail: emailSettings.adminEmail,
          recipientRole: UserRole.ADMIN,
          channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
          read: false,
          emailSent: false,
          emailStatus: 'QUEUED_IN_FIRESTORE_MAIL',
          pushSent: false,
          createdAt: now,
        };

        await addDoc(collection(db, 'notifications'), notifPayload);
        await addDoc(collection(db, 'mail'), {
          to: [emailSettings.adminEmail],
          message: {
            subject: `[LabSetu] ${notifPayload.title}`,
            text: notifPayload.message,
          },
          createdAt: now,
        });
        setNotifStatusMsg(`Queued notification + email document in Firestore for ${emailSettings.adminEmail}.`);
        return;
      } catch (fsErr) {
        setNotifStatusMsg(`Firestore write skipped: ${(fsErr as Error).message}`);
        return;
      }
    }

    setNotifications((prev) => [
      {
        id: `notif-local-${Date.now()}`,
        title: 'Local Test Notification Dispatched',
        message: `Simulated alert for ${emailSettings.adminEmail}. Start API or sign in with live Firebase Auth to deliver via Firestore/SMTP.`,
        category: NotificationCategory.SYSTEM_ALERT,
        priority: NotificationPriority.NORMAL,
        recipientEmail: emailSettings.adminEmail,
        recipientRole: UserRole.ADMIN,
        channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
        read: false,
        emailSent: false,
        pushSent: false,
        createdAt: now,
      },
      ...prev,
    ]);
    setNotifStatusMsg('Preview notification added (sign in with Firebase Auth + run API for live email delivery).');
  }

  async function handleSavePlatformSettings() {
    setSettingsStatusMsg('Saving settings...');
    const now = new Date().toISOString();

    if (currentUser) {
      try {
        await setDoc(
          doc(db, 'settings', 'platform'),
          {
            statPickupSlaMinutes: statSlaMinutes,
            autoReassignDelayMinutes: delayThresholdMinutes,
            updatedBy: currentUser.email,
            updatedAt: now,
          },
          { merge: true }
        );
        await setDoc(
          doc(db, 'settings', 'notifications'),
          {
            ...emailSettings,
            updatedAt: now,
          },
          { merge: true }
        );
        setSettingsStatusMsg('Saved platform & email notification settings to Cloud Firestore.');
        return;
      } catch (err) {
        setSettingsStatusMsg(`Firestore save note: ${(err as Error).message}`);
        return;
      }
    }

    setSettingsStatusMsg('Settings updated in local preview session.');
  }

  async function handleStorageUploadTest(file: File | undefined) {
    if (!file) return;
    setStorageStatusMsg('Uploading file to Firebase Storage...');
    try {
      const url = await uploadDiagnosticDocument(`documents/admin/${Date.now()}-${file.name}`, file);
      setStorageStatusMsg(`Uploaded to Firebase Storage: ${url}`);
    } catch (err) {
      setStorageStatusMsg(
        `Storage upload error: ${(err as Error).message}. Make sure Firebase Storage is initialized ("Get Started") in Console.`
      );
    }
  }

  if (authLoading) {
    return (
      <div className="admin-login-shell">
        <div className="admin-login-card" style={{ padding: '40px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0F172A' }}>LabSetu Admin Console</div>
          <p style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '8px' }}>
            Verifying Firebase Authentication session...
          </p>
        </div>
      </div>
    );
  }

  if (!currentUser && !devPreviewSession) {
    return (
      <div className="admin-login-shell">
        <div className="admin-login-card">
          <div className="admin-login-banner">
            <div className="brand-logo-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 2v7.31M14 2v7.31M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                {LABSETU_THEME.brand.name} Admin
              </div>
              <div style={{ fontSize: '0.75rem', color: '#7DD3FC', fontWeight: 500 }}>
                Firebase Command &amp; Logistics Control
              </div>
            </div>
          </div>

          <form className="admin-login-body" onSubmit={handleAdminSignIn}>
            <h1 className="admin-login-title">Admin Sign In</h1>
            <p className="admin-login-subtitle">
              Sign in with your verified platform admin account (<strong>{ADMIN_LOGIN_EMAIL}</strong>) on project{' '}
              <code>labsetu-diagnostics</code>.
            </p>

            {authError && <div className="admin-auth-alert error">{authError}</div>}
            {authNotice && <div className="admin-auth-alert success">{authNotice}</div>}

            <div className="form-group">
              <label className="form-label" htmlFor="admin-email">
                Admin Email Address
              </label>
              <input
                id="admin-email"
                type="email"
                className="form-input"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="lab.setu.admin@gmail.com"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="admin-password">
                Password
              </label>
              <div className="admin-password-wrap">
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter Firebase Admin password"
                  style={{ paddingRight: '58px' }}
                  required
                />
                <button
                  type="button"
                  className="admin-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <button type="button" className="btn-link-muted" onClick={() => setLoginEmail(ADMIN_LOGIN_EMAIL)}>
                Fill {ADMIN_LOGIN_EMAIL}
              </button>
              <button type="button" className="btn-link-muted" onClick={handlePasswordReset}>
                Reset / Set Password
              </button>
            </div>

            <button type="submit" className="btn-primary btn-full" disabled={authSubmitting}>
              {authSubmitting ? 'Authenticating...' : 'Sign In to Admin Dashboard'}
            </button>

            {import.meta.env.DEV && (
              <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #E2E8F0', textAlign: 'center' }}>
                <button
                  type="button"
                  className="btn-secondary btn-full"
                  onClick={() => setDevPreviewSession(true)}
                >
                  Enter Local Dev Preview (Offline UI Mode)
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* -------------------------------------------------------------
       * 1. LEFT SIDEBAR (Dark Slate Teal - Matching Reference Image)
       * ------------------------------------------------------------- */}
      <aside className="sidebar-dark">
        {/* Brand Header */}
        <div className="brand-header">
          <div className="brand-logo-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 2v7.31M14 2v7.31M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0" />
            </svg>
          </div>
          <div className="brand-title-wrap">
            <span className="brand-title">{LABSETU_THEME.brand.name}</span>
            <span className="brand-subtitle">Diagnostics Network Platform</span>
          </div>
        </div>

        {/* Navigation Menu List */}
        <ul className="sidebar-nav">
          <li
            className={`sidebar-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
            </svg>
            <span>Admin Dashboard</span>
          </li>

          <li
            className={`sidebar-nav-item ${activeTab === 'bookings' ? 'active' : ''}`}
            onClick={() => setActiveTab('bookings')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
            <span>Bookings</span>
            <span className="nav-badge-red">24</span>
          </li>

          {/* Labs & Partners Dropdown */}
          <li
            className={`sidebar-nav-item ${activeTab.startsWith('labs') ? 'active' : ''}`}
            onClick={() => {
              setLabsMenuOpen(!labsMenuOpen);
              setActiveTab('labs');
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 21h18M3 7v14M21 7v14M6 11h4M6 15h4M14 11h4M14 15h4M9 3l3-2 3 2v4H9V3z" />
            </svg>
            <span>Labs & Partners</span>
            <span className="chevron-icon">{labsMenuOpen ? '▴' : '▾'}</span>
          </li>

          {labsMenuOpen && (
            <ul className="sidebar-submenu">
              <li
                className={`sidebar-subitem ${activeTab === 'labs-small' ? 'active' : ''}`}
                onClick={() => setActiveTab('labs-small')}
              >
                <span>• Small Labs</span>
              </li>
              <li
                className={`sidebar-subitem ${activeTab === 'labs-large' ? 'active' : ''}`}
                onClick={() => setActiveTab('labs-large')}
              >
                <span>• Large Labs</span>
              </li>
              <li
                className={`sidebar-subitem ${activeTab === 'labs-verify' ? 'active' : ''}`}
                onClick={() => setActiveTab('labs-verify')}
              >
                <span>• Verification</span>
                <span className="nav-badge-green">8</span>
              </li>
            </ul>
          )}

          <li
            className={`sidebar-nav-item ${activeTab === 'phlebotomists' ? 'active' : ''}`}
            onClick={() => setActiveTab('phlebotomists')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>Phlebotomists</span>
            <span className="chevron-icon">▾</span>
          </li>

          <li
            className={`sidebar-nav-item ${activeTab === 'samples' ? 'active' : ''}`}
            onClick={() => setActiveTab('samples')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 2v7.31M14 2v7.31M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0" />
            </svg>
            <span>Samples</span>
          </li>

          <li
            className={`sidebar-nav-item ${activeTab === 'reports' ? 'active' : ''}`}
            onClick={() => setActiveTab('reports')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <span>Reports</span>
          </li>

          <li
            className={`sidebar-nav-item ${activeTab === 'payments' ? 'active' : ''}`}
            onClick={() => setActiveTab('payments')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
            <span>Payments & Settlements</span>
          </li>

          <li
            className={`sidebar-nav-item ${activeTab === 'commission' ? 'active' : ''}`}
            onClick={() => setActiveTab('commission')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="19" y1="5" x2="5" y2="19" />
              <circle cx="6.5" cy="6.5" r="2.5" />
              <circle cx="17.5" cy="17.5" r="2.5" />
            </svg>
            <span>% Commissions</span>
          </li>

          <li
            className={`sidebar-nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            <span>Analytics</span>
          </li>

          <li
            className={`sidebar-nav-item ${activeTab === 'master-data' ? 'active' : ''}`}
            onClick={() => setActiveTab('master-data')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
            </svg>
            <span>Master Data</span>
            <span className="chevron-icon">▾</span>
          </li>

          <li
            className={`sidebar-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Settings</span>
          </li>
        </ul>

        {/* Sidebar Footer Help Card */}
        <div
          className="sidebar-footer-card"
          onClick={() => alert('LabSetu Admin 24x7 Support Desk opened.')}
        >
          <div className="sidebar-footer-icon">🎧</div>
          <div>
            <div className="sidebar-footer-title">Help & Support</div>
            <div className="sidebar-footer-subtitle">Need assistance? We're here.</div>
          </div>
        </div>
      </aside>

      {/* -------------------------------------------------------------
       * 2. MAIN CONTENT AREA
       * ------------------------------------------------------------- */}
      <div className="main-wrapper">
        {/* Top Navbar Header */}
        <header className="top-navbar">
          {/* Rounded Search Pill */}
          <div className="top-search-pill">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search booking ID, lab, phlebotomist, patient, or sample..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Right Action Icons & Profile */}
          <div className="top-nav-right">
            {/* Live Notification Bell Popover */}
            <div className="notif-wrapper">
              <div
                className="nav-icon-circle"
                title="Notifications & Email Alerts"
                onClick={() => setNotifOpen(!notifOpen)}
                style={{ cursor: 'pointer', position: 'relative' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {unreadCount > 0 && <span className="notif-count-badge">{unreadCount}</span>}
              </div>

              {notifOpen && (
                <div className="notif-popover">
                  <div className="notif-popover-header">
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A' }}>
                        Notifications &amp; Email Alerts
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                        Target: {emailSettings.adminEmail}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-link-muted"
                      onClick={() => {
                        void handleSendTestNotificationAndEmail();
                      }}
                    >
                      + Test Email Alert
                    </button>
                  </div>

                  {notifStatusMsg && (
                    <div style={{ padding: '8px 14px', background: '#F0FDFA', color: '#0F766E', fontSize: '0.75rem', borderBottom: '1px solid #CCFBF1' }}>
                      {notifStatusMsg}
                    </div>
                  )}

                  <div className="notif-list">
                    {notifications.map((notif) => (
                      <div
                        key={notif.id}
                        className={`notif-item ${!notif.read ? 'unread' : ''}`}
                        onClick={() => {
                          void handleMarkNotificationRead(notif.id);
                        }}
                      >
                        <div className="notif-item-title">{notif.title}</div>
                        <div className="notif-item-msg">{notif.message}</div>
                        <div className="notif-item-meta">
                          <span>{notif.category}</span>
                          <span>
                            {notif.emailSent ? '✓ Email Sent' : '● In-App'} •{' '}
                            {new Date(notif.createdAt).toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Help Question Icon */}
            <div
              className="nav-icon-circle"
              title="Open Firebase & Notification Settings"
              style={{ cursor: 'pointer' }}
              onClick={() => setActiveTab('settings')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>

            {/* Admin User Profile + Sign Out */}
            <div className="user-profile-badge">
              <div className="user-photo-avatar">AD</div>
              <div className="user-profile-info">
                <span className="user-profile-name">
                  {currentUser?.displayName || 'Admin'}
                </span>
                <span className="user-profile-role">
                  {currentUser?.email || (devPreviewSession ? 'Local Preview Mode' : 'Platform Owner')}
                </span>
              </div>
              <button
                type="button"
                className="signout-btn"
                onClick={() => {
                  void handleSignOut();
                }}
              >
                Sign Out
              </button>
            </div>
          </div>
        </header>

        {/* Dashboard Content Container */}
        <main className="dashboard-content">
          {/* TAB 1: MAIN ADMIN DASHBOARD (MATCHING SCREENSHOT) */}
          {activeTab === 'dashboard' && (
            <>
              {/* Page Title & Date Range Header */}
              <div className="page-header-row">
                <div className="page-title-group">
                  <h1>Admin Dashboard</h1>
                  <p>Welcome back! Here's the complete overview of your diagnostic network.</p>
                </div>

                <div
                  className="date-range-pill"
                  onClick={() => {
                    const next = dateRange === 'Last 30 Days' ? 'Last 7 Days' : 'Last 30 Days';
                    setDateRange(next);
                  }}
                >
                  <span>📅</span>
                  <span>{dateRange}</span>
                  <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>▾</span>
                </div>
              </div>

              {/* 5 KPI Metric Cards Row */}
              <section className="kpi-5-row">
                {/* 1. Total Bookings */}
                <div className="kpi-card-modern">
                  <div className="kpi-icon-box-mint">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </div>
                  <div className="kpi-body">
                    <span className="kpi-title">Total Bookings</span>
                    <span className="kpi-main-number">4,826</span>
                    <span className="kpi-trend-text">
                      ↑ +18.4% <span className="kpi-trend-muted">vs. previous 30 days</span>
                    </span>
                  </div>
                </div>

                {/* 2. Total Samples */}
                <div className="kpi-card-modern">
                  <div className="kpi-icon-box-blue">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M10 2v7.31M14 2v7.31M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0" />
                    </svg>
                  </div>
                  <div className="kpi-body">
                    <span className="kpi-title">Total Samples</span>
                    <span className="kpi-main-number">4,692</span>
                    <span className="kpi-trend-text">↑ +17.9%</span>
                  </div>
                </div>

                {/* 3. Active Labs */}
                <div className="kpi-card-modern">
                  <div className="kpi-icon-box-indigo">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 21h18M3 7v14M21 7v14M6 11h4M6 15h4M14 11h4M14 15h4M9 3l3-2 3 2v4H9V3z" />
                    </svg>
                  </div>
                  <div className="kpi-body">
                    <span className="kpi-title">Active Labs</span>
                    <span className="kpi-main-number">124</span>
                    <span className="kpi-sub-split">98 Small &nbsp;|&nbsp; 26 Large</span>
                  </div>
                </div>

                {/* 4. Active Phlebotomists */}
                <div className="kpi-card-modern">
                  <div className="kpi-icon-box-purple">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <div className="kpi-body">
                    <span className="kpi-title">Active Phlebotomists</span>
                    <span className="kpi-main-number">312</span>
                    <span className="kpi-trend-text">↑ +12.3%</span>
                  </div>
                </div>

                {/* 5. Platform Revenue */}
                <div className="kpi-card-modern">
                  <div className="kpi-icon-box-mint">
                    <span style={{ fontSize: '1.3rem', fontWeight: 800 }}>₹</span>
                  </div>
                  <div className="kpi-body">
                    <span className="kpi-title">Platform Revenue</span>
                    <span className="kpi-main-number">₹8,64,500</span>
                    <span className="kpi-trend-text">↑ +21.8%</span>
                  </div>
                </div>
              </section>

              {/* Middle Analytics Row (3 Columns) */}
              <section className="analytics-3-row">
                {/* 1. Bookings Trend Dual Line Chart */}
                <div className="chart-card-modern">
                  <div className="card-top-header">
                    <span className="card-top-title">Bookings Trend</span>
                    <div className="chart-legend-row">
                      <span><span className="legend-dot-teal" /> Bookings</span>
                      <span><span className="legend-dot-blue" /> Completed</span>
                    </div>
                  </div>

                  <div style={{ height: '170px', position: 'relative' }}>
                    <svg width="100%" height="100%" viewBox="0 0 460 170" preserveAspectRatio="none">
                      {/* Grid Lines */}
                      <line x1="30" y1="20" x2="450" y2="20" stroke="#F1F5F9" strokeWidth="1" />
                      <line x1="30" y1="55" x2="450" y2="55" stroke="#F1F5F9" strokeWidth="1" />
                      <line x1="30" y1="90" x2="450" y2="90" stroke="#F1F5F9" strokeWidth="1" />
                      <line x1="30" y1="125" x2="450" y2="125" stroke="#F1F5F9" strokeWidth="1" />
                      <line x1="30" y1="150" x2="450" y2="150" stroke="#E2E8F0" strokeWidth="1" />

                      {/* Y-Axis Labels */}
                      <text x="5" y="24" fontSize="10" fill="#94A3B8">300</text>
                      <text x="5" y="59" fontSize="10" fill="#94A3B8">200</text>
                      <text x="5" y="94" fontSize="10" fill="#94A3B8">100</text>
                      <text x="5" y="129" fontSize="10" fill="#94A3B8">50</text>
                      <text x="12" y="153" fontSize="10" fill="#94A3B8">0</text>

                      {/* Bookings Line (Teal) */}
                      <path
                        d="M 35 125 C 70 115 110 80 150 95 C 190 110 230 85 270 90 C 310 95 350 70 390 65 L 435 50"
                        fill="none"
                        stroke="#0D9488"
                        strokeWidth="2.5"
                      />
                      <circle cx="35" cy="125" r="3.5" fill="#0D9488" />
                      <circle cx="150" cy="95" r="3.5" fill="#0D9488" />
                      <circle cx="270" cy="90" r="3.5" fill="#0D9488" />
                      <circle cx="390" cy="65" r="3.5" fill="#0D9488" />
                      <circle cx="435" cy="50" r="3.5" fill="#0D9488" />

                      {/* Completed Line (Blue) */}
                      <path
                        d="M 35 140 C 70 130 110 100 150 115 C 190 130 230 105 270 110 C 310 115 350 90 390 85 L 435 68"
                        fill="none"
                        stroke="#2563EB"
                        strokeWidth="2.5"
                      />
                      <circle cx="35" cy="140" r="3.5" fill="#2563EB" />
                      <circle cx="150" cy="115" r="3.5" fill="#2563EB" />
                      <circle cx="270" cy="110" r="3.5" fill="#2563EB" />
                      <circle cx="390" cy="85" r="3.5" fill="#2563EB" />
                      <circle cx="435" cy="68" r="3.5" fill="#2563EB" />
                    </svg>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '30px', fontSize: '10px', color: '#94A3B8', marginTop: '6px' }}>
                    <span>1 Jan</span>
                    <span>4 Jan</span>
                    <span>7 Jan</span>
                    <span>10 Jan</span>
                    <span>13 Jan</span>
                    <span>16 Jan</span>
                    <span>19 Jan</span>
                    <span>22 Jan</span>
                    <span>25 Jan</span>
                    <span>28 Jan</span>
                  </div>
                </div>

                {/* 2. Booking Status Donut Chart */}
                <div className="chart-card-modern">
                  <div className="card-top-header">
                    <span className="card-top-title">Booking Status</span>
                  </div>

                  <div className="donut-chart-layout">
                    {/* SVG Donut */}
                    <div className="donut-svg-wrap">
                      <svg width="120" height="120" viewBox="0 0 120 120">
                        {/* Background ring */}
                        <circle cx="60" cy="60" r="48" fill="none" stroke="#F1F5F9" strokeWidth="18" />
                        {/* Green slice (82.5%) */}
                        <circle
                          cx="60"
                          cy="60"
                          r="48"
                          fill="none"
                          stroke="#10B981"
                          strokeWidth="18"
                          strokeDasharray="248 301"
                          strokeDashoffset="75"
                        />
                        {/* Blue slice (10.1%) */}
                        <circle
                          cx="60"
                          cy="60"
                          r="48"
                          fill="none"
                          stroke="#2563EB"
                          strokeWidth="18"
                          strokeDasharray="30 301"
                          strokeDashoffset="-173"
                        />
                        {/* Amber slice (4.4%) */}
                        <circle
                          cx="60"
                          cy="60"
                          r="48"
                          fill="none"
                          stroke="#F59E0B"
                          strokeWidth="18"
                          strokeDasharray="14 301"
                          strokeDashoffset="-203"
                        />
                        {/* Red slice (1.9%) */}
                        <circle
                          cx="60"
                          cy="60"
                          r="48"
                          fill="none"
                          stroke="#EF4444"
                          strokeWidth="18"
                          strokeDasharray="6 301"
                          strokeDashoffset="-217"
                        />
                      </svg>
                      <div className="donut-center-label">
                        <div className="donut-center-number">4,826</div>
                        <div className="donut-center-sub">Total</div>
                      </div>
                    </div>

                    {/* Donut Legend List */}
                    <div className="donut-legend-list">
                      <div className="donut-legend-item">
                        <span className="donut-label-group">
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
                          Completed
                        </span>
                        <span className="donut-val-group">
                          3,982 <span className="donut-pct-text">82.5%</span>
                        </span>
                      </div>

                      <div className="donut-legend-item">
                        <span className="donut-label-group">
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2563EB', display: 'inline-block' }} />
                          In Progress
                        </span>
                        <span className="donut-val-group">
                          486 <span className="donut-pct-text">10.1%</span>
                        </span>
                      </div>

                      <div className="donut-legend-item">
                        <span className="donut-label-group">
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#F59E0B', display: 'inline-block' }} />
                          Assigned
                        </span>
                        <span className="donut-val-group">
                          214 <span className="donut-pct-text">4.4%</span>
                        </span>
                      </div>

                      <div className="donut-legend-item">
                        <span className="donut-label-group">
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444', display: 'inline-block' }} />
                          Delayed
                        </span>
                        <span className="donut-val-group">
                          92 <span className="donut-pct-text">1.9%</span>
                        </span>
                      </div>

                      <div className="donut-legend-item">
                        <span className="donut-label-group">
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#94A3B8', display: 'inline-block' }} />
                          Cancelled
                        </span>
                        <span className="donut-val-group">
                          52 <span className="donut-pct-text">1.1%</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Live Operations Card */}
                <div className="chart-card-modern">
                  <div className="card-top-header">
                    <span className="card-top-title">Live Operations</span>
                  </div>

                  <div className="live-ops-split">
                    {/* Mini SVG Radar Map */}
                    <div className="mini-map-canvas">
                      <svg width="100%" height="100%" viewBox="0 0 180 160" preserveAspectRatio="none">
                        {/* City road vectors */}
                        <path d="M 10 30 L 170 30 M 10 70 L 170 70 M 10 110 L 170 110 M 10 145 L 170 145" stroke="#E2E8F0" strokeWidth="1.5" />
                        <path d="M 40 10 L 40 150 M 90 10 L 90 150 M 140 10 L 140 150" stroke="#E2E8F0" strokeWidth="1.5" />
                        <path d="M 30 130 Q 90 100 135 60" fill="none" stroke="#0D9488" strokeWidth="2.5" strokeDasharray="4 3" />

                        {/* Pulsing Radar Hub */}
                        <circle cx="90" cy="70" r="18" fill="#2563EB" fillOpacity="0.15" />
                        <circle cx="90" cy="70" r="9" fill="#2563EB" />
                        <circle cx="90" cy="70" r="4" fill="#FFFFFF" />

                        {/* Courier Markers */}
                        <circle cx="40" cy="110" r="5" fill="#10B981" />
                        <circle cx="140" cy="40" r="5" fill="#10B981" />
                        <circle cx="135" cy="60" r="5" fill="#10B981" />
                        <circle cx="50" cy="30" r="5" fill="#10B981" />
                      </svg>
                    </div>

                    {/* Metrics List */}
                    <div className="live-ops-metrics-list">
                      <div className="ops-metric-item">
                        <div className="ops-icon-circle" style={{ background: '#EFF6FF', color: '#2563EB' }}>👤</div>
                        <div>
                          <div className="ops-metric-val">312</div>
                          <div className="ops-metric-label">Online Phlebotomists</div>
                        </div>
                      </div>

                      <div className="ops-metric-item">
                        <div className="ops-icon-circle" style={{ background: '#ECFDF5', color: '#059669' }}>📦</div>
                        <div>
                          <div className="ops-metric-val">486</div>
                          <div className="ops-metric-label">Active Pickups</div>
                        </div>
                      </div>

                      <div className="ops-metric-item">
                        <div className="ops-icon-circle" style={{ background: '#FEF3C7', color: '#D97706' }}>⚠️</div>
                        <div>
                          <div className="ops-metric-val">214</div>
                          <div className="ops-metric-label">In Transit</div>
                        </div>
                      </div>

                      <div className="ops-metric-item">
                        <div className="ops-icon-circle" style={{ background: '#ECFDF5', color: '#16A34A' }}>✅</div>
                        <div>
                          <div className="ops-metric-val">3,982</div>
                          <div className="ops-metric-label">Completed Today</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Quick Actions Shortcuts Bar (6 Cards) */}
              <section className="quick-actions-bar">
                <button
                  type="button"
                  className="action-card-btn"
                  onClick={() => setQuickActionModal('Verify Lab')}
                >
                  <span className="action-btn-icon">🔬</span>
                  <span className="action-btn-text">Verify Lab</span>
                </button>

                <button
                  type="button"
                  className="action-card-btn"
                  onClick={() => setQuickActionModal('Verify Phlebotomist')}
                >
                  <span className="action-btn-icon">👤+</span>
                  <span className="action-btn-text">Verify Phlebotomist</span>
                </button>

                <button
                  type="button"
                  className="action-card-btn"
                  onClick={() => setQuickActionModal('Assign Booking')}
                >
                  <span className="action-btn-icon">📅+</span>
                  <span className="action-btn-text">Assign Booking</span>
                </button>

                <button
                  type="button"
                  className="action-card-btn"
                  onClick={() => setQuickActionModal('Track Sample')}
                >
                  <span className="action-btn-icon">📍</span>
                  <span className="action-btn-text">Track Sample</span>
                </button>

                <button
                  type="button"
                  className="action-card-btn"
                  onClick={() => setQuickActionModal('Reconciliation')}
                >
                  <span className="action-btn-icon">₹</span>
                  <span className="action-btn-text">Reconciliation</span>
                </button>

                <button
                  type="button"
                  className="action-card-btn"
                  onClick={() => setQuickActionModal('Download Reports')}
                >
                  <span className="action-btn-icon">📥</span>
                  <span className="action-btn-text">Download Reports</span>
                </button>
              </section>

              {/* Bottom Row (3 Columns: Recent Bookings, Network Overview, Today's Highlights) */}
              <section className="bottom-3-row">
                {/* 1. Recent Bookings Table */}
                <div className="chart-card-modern">
                  <div className="card-top-header">
                    <span className="card-top-title">Recent Bookings</span>
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', color: '#2563EB', fontWeight: 600, fontSize: '0.825rem', cursor: 'pointer' }}
                      onClick={() => setActiveTab('bookings')}
                    >
                      View All →
                    </button>
                  </div>

                  <div className="data-table-container">
                    <table className="modern-data-table">
                      <thead>
                        <tr>
                          <th>Booking ID</th>
                          <th>Lab (Source)</th>
                          <th>Test(s)</th>
                          <th>Phlebotomist</th>
                          <th>Status</th>
                          <th>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {RECENT_BOOKINGS.map((row) => (
                          <tr key={row.id}>
                            <td><strong>{row.id}</strong></td>
                            <td>{row.lab}</td>
                            <td style={{ color: '#64748B' }}>{row.tests}</td>
                            <td>{row.phlebo}</td>
                            <td>
                              <span className={row.statusClass}>
                                {row.status}
                              </span>
                            </td>
                            <td style={{ color: '#64748B' }}>{row.time}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 2. Network Overview */}
                <div className="chart-card-modern">
                  <div className="card-top-header">
                    <span className="card-top-title">Network Overview</span>
                  </div>

                  <div>
                    <div className="network-list-item">
                      <span className="network-item-label">
                        <span>🏢</span> Small Labs
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span className="network-item-number">98</span>
                        <span className="growth-pill-green">↑ +6</span>
                      </div>
                    </div>

                    <div className="network-list-item">
                      <span className="network-item-label">
                        <span>🏥</span> Large Partner Labs
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span className="network-item-number">26</span>
                        <span className="growth-pill-green">↑ +2</span>
                      </div>
                    </div>

                    <div className="network-list-item">
                      <span className="network-item-label">
                        <span>👥</span> Phlebotomists
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span className="network-item-number">312</span>
                        <span className="growth-pill-green">↑ +34</span>
                      </div>
                    </div>

                    <div className="network-list-item">
                      <span className="network-item-label">
                        <span>📍</span> Service Locations
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span className="network-item-number">48</span>
                        <span className="growth-pill-green">↑ +4</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Today's Highlights */}
                <div className="chart-card-modern">
                  <div className="card-top-header">
                    <span className="card-top-title">Today's Highlights</span>
                  </div>

                  <div>
                    <div className="highlight-row-item">
                      <div className="highlight-icon-circle" style={{ background: '#ECFDF5', color: '#16A34A' }}>✓</div>
                      <div>
                        <span className="highlight-metric-val">680</span>
                        <span className="highlight-metric-desc">Bookings Completed</span>
                      </div>
                    </div>

                    <div className="highlight-row-item">
                      <div className="highlight-icon-circle" style={{ background: '#ECFDF5', color: '#059669' }}>₹</div>
                      <div>
                        <span className="highlight-metric-val">₹1,52,300</span>
                        <span className="highlight-metric-desc">Revenue (Today)</span>
                      </div>
                    </div>

                    <div className="highlight-row-item">
                      <div className="highlight-icon-circle" style={{ background: '#EFF6FF', color: '#2563EB' }}>🧪</div>
                      <div>
                        <span className="highlight-metric-val">702</span>
                        <span className="highlight-metric-desc">Samples Processed</span>
                      </div>
                    </div>

                    <div className="highlight-row-item">
                      <div className="highlight-icon-circle" style={{ background: '#FEF3C7', color: '#D97706' }}>🚚</div>
                      <div>
                        <span className="highlight-metric-val">214</span>
                        <span className="highlight-metric-desc">Samples In Transit</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* TAB 2: BOOKINGS MASTER LEDGER */}
          {activeTab === 'bookings' && (
            <div className="chart-card-modern">
              <div className="card-top-header">
                <div>
                  <h2 className="card-top-title">Global Bookings Master Ledger</h2>
                  <p style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '2px' }}>
                    Real-time status of all patient specimen pickups across metropolitan hubs
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => alert('Exporting all bookings to CSV...')}
                >
                  Export CSV
                </button>
              </div>

              <div className="data-table-container">
                <table className="modern-data-table">
                  <thead>
                    <tr>
                      <th>Booking ID</th>
                      <th>Collection Center</th>
                      <th>Target Hub</th>
                      <th>Phlebotomist</th>
                      <th>Tests</th>
                      <th>Scheduled Slot</th>
                      <th>Priority</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {RECENT_BOOKINGS.map((b) => (
                      <tr key={b.id}>
                        <td><strong>{b.id}</strong></td>
                        <td>{b.lab}</td>
                        <td>Metro Diagnostics Core Lab</td>
                        <td>{b.phlebo}</td>
                        <td style={{ color: '#64748B' }}>{b.tests}</td>
                        <td>{b.time}</td>
                        <td>
                          <span style={{ fontWeight: 700, color: '#2563EB' }}>Routine</span>
                        </td>
                        <td>
                          <span className={b.statusClass}>{b.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: LABS & PARTNERS */}
          {(activeTab === 'labs' || activeTab === 'labs-small' || activeTab === 'labs-large' || activeTab === 'labs-verify') && (
            <div className="chart-card-modern">
              <div className="card-top-header">
                <div>
                  <h2 className="card-top-title">
                    {activeTab === 'labs-small'
                      ? 'Small Lab Collection Centers (98)'
                      : activeTab === 'labs-large'
                      ? 'Large Partner Reference Labs (26)'
                      : activeTab === 'labs-verify'
                      ? 'Pending Lab Verifications (8)'
                      : 'All Laboratories & Testing Partners'}
                  </h2>
                  <p style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '2px' }}>
                    Accredited diagnostic facilities connected to cold-chain logistics routing
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => alert('Onboard laboratory modal opened.')}
                >
                  + Onboard Lab
                </button>
              </div>

              <div className="data-table-container">
                <table className="modern-data-table">
                  <thead>
                    <tr>
                      <th>Lab ID</th>
                      <th>Facility Name</th>
                      <th>Facility Tier</th>
                      <th>City Hub</th>
                      <th>Monthly Samples</th>
                      <th>Accreditation</th>
                      <th>Verification Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MOCK_LAB_DIRECTORY.map((lab) => (
                      <tr key={lab.id}>
                        <td><strong>{lab.id}</strong></td>
                        <td>{lab.name}</td>
                        <td>{lab.type}</td>
                        <td>{lab.city}</td>
                        <td><strong>{lab.ordersMTD}</strong></td>
                        <td>
                          <span style={{ background: '#F1F5F9', padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>
                            {lab.nabl}
                          </span>
                        </td>
                        <td>
                          <span className="status-pill-green">● {lab.status}</span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => alert(`Inspecting audit profile for ${lab.name}`)}
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: PHLEBOTOMISTS FLEET */}
          {activeTab === 'phlebotomists' && (
            <div className="chart-card-modern">
              <div className="card-top-header">
                <div>
                  <h2 className="card-top-title">Active Phlebotomist Fleet (312)</h2>
                  <p style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '2px' }}>
                    Certified cold-chain sample couriers, battery status, and telemetry tracking
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => alert('Register phlebotomist modal opened.')}
                >
                  + Add Phlebotomist
                </button>
              </div>

              <div className="data-table-container">
                <table className="modern-data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Name</th>
                      <th>Contact</th>
                      <th>Shift Status</th>
                      <th>Active Pickups</th>
                      <th>Battery</th>
                      <th>Chiller Temp</th>
                      <th>Rating</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ACTIVE_COURIERS.map((phlebo) => (
                      <tr key={phlebo.id}>
                        <td><strong>{phlebo.id}</strong></td>
                        <td>{phlebo.name}</td>
                        <td style={{ color: '#64748B' }}>{phlebo.phone}</td>
                        <td>
                          <span className={phlebo.status === 'Online' ? 'status-pill-green' : 'status-pill-red'}>
                            ● {phlebo.status}
                          </span>
                        </td>
                        <td>{phlebo.activeOrders} active</td>
                        <td>{phlebo.battery}</td>
                        <td>
                          <span style={{ color: '#10B981', fontWeight: 600 }}>{phlebo.tempStatus}</span>
                        </td>
                        <td>
                          <span style={{ fontWeight: 700, color: '#D97706' }}>{phlebo.rating}</span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setSelectedCourier(phlebo)}
                          >
                            View Telemetry
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: SAMPLES & COLD CHAIN */}
          {activeTab === 'samples' && (
            <div className="chart-card-modern">
              <div className="card-top-header">
                <div>
                  <h2 className="card-top-title">Specimen Chain-of-Custody & Cold-Chain Telemetry</h2>
                  <p style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '2px' }}>
                    Immutable barcode scans, handover timestamps, and real-time cooler box data
                  </p>
                </div>
              </div>

              <div className="data-table-container">
                <table className="modern-data-table">
                  <thead>
                    <tr>
                      <th>Barcode ID</th>
                      <th>Associated Booking</th>
                      <th>Specimen / Tube</th>
                      <th>Logged Temp</th>
                      <th>Cold-Chain Compliance</th>
                      <th>Last Handover Operator</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong style={{ color: '#0D9488' }}>SMP-10456-1</strong></td>
                      <td>BK-10456</td>
                      <td>EDTA Lavender (Blood)</td>
                      <td>4.2°C</td>
                      <td><span className="status-pill-green">✓ Compliant (2°C - 8°C)</span></td>
                      <td>Rahul Yadav (PHL-204)</td>
                    </tr>
                    <tr>
                      <td><strong style={{ color: '#0D9488' }}>SMP-10456-2</strong></td>
                      <td>BK-10456</td>
                      <td>Serum Red/Gold (Serum)</td>
                      <td>4.3°C</td>
                      <td><span className="status-pill-green">✓ Compliant (2°C - 8°C)</span></td>
                      <td>Rahul Yadav (PHL-204)</td>
                    </tr>
                    <tr>
                      <td><strong style={{ color: '#0D9488' }}>SMP-10455-1</strong></td>
                      <td>BK-10455</td>
                      <td>Serum Red/Gold</td>
                      <td>4.5°C</td>
                      <td><span className="status-pill-green">✓ Compliant (2°C - 8°C)</span></td>
                      <td>Priya Desai (PHL-188)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: REPORTS AUDIT */}
          {activeTab === 'reports' && (
            <div className="chart-card-modern">
              <div className="card-top-header">
                <div>
                  <h2 className="card-top-title">Diagnostic Reports Archive & Audit Trail</h2>
                  <p style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '2px' }}>
                    All completed PDF diagnostic test results uploaded by partner reference laboratories
                  </p>
                </div>
              </div>

              <div className="data-table-container">
                <table className="modern-data-table">
                  <thead>
                    <tr>
                      <th>Report ID</th>
                      <th>Booking Ref</th>
                      <th>Testing Hub</th>
                      <th>Collection Center</th>
                      <th>Turnaround Duration</th>
                      <th>Verification Date</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong style={{ color: '#0D9488' }}>RPT-10454</strong></td>
                      <td>BK-10454</td>
                      <td>Metro Diagnostics Core Lab</td>
                      <td>Bhandup Care Lab</td>
                      <td>3 hours 45 mins</td>
                      <td>Today, 11:15 AM</td>
                      <td>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => alert('Downloading verified PDF report...')}
                        >
                          📄 Download PDF
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 7: PAYMENTS & SETTLEMENTS */}
          {activeTab === 'payments' && (
            <div className="chart-card-modern">
              <div className="card-top-header">
                <div>
                  <h2 className="card-top-title">Platform Payment Gateway & Settlements</h2>
                  <p style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '2px' }}>
                    Automated splits between collection centers, phlebotomists, and reference testing centers
                  </p>
                </div>
              </div>

              <div className="kpi-5-row" style={{ marginTop: '16px' }}>
                <div className="kpi-card-modern">
                  <div className="kpi-body">
                    <span className="kpi-title">Gross Platform GMV</span>
                    <span className="kpi-main-number">₹8,64,500</span>
                  </div>
                </div>
                <div className="kpi-card-modern">
                  <div className="kpi-body">
                    <span className="kpi-title">Platform Take Rate (15%)</span>
                    <span className="kpi-main-number">₹1,29,675</span>
                  </div>
                </div>
                <div className="kpi-card-modern">
                  <div className="kpi-body">
                    <span className="kpi-title">Lab Payouts</span>
                    <span className="kpi-main-number">₹5,18,700</span>
                  </div>
                </div>
                <div className="kpi-card-modern">
                  <div className="kpi-body">
                    <span className="kpi-title">Courier Payouts</span>
                    <span className="kpi-main-number">₹2,16,125</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: COMMISSION SPLIT */}
          {activeTab === 'commission' && (
            <div className="chart-card-modern" style={{ maxWidth: '640px' }}>
              <div className="card-top-header">
                <div>
                  <h2 className="card-top-title">Platform Commission & Split Rules</h2>
                  <p style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '2px' }}>
                    Default transaction split across routine and urgent bookings
                  </p>
                </div>
              </div>

              <div style={{ marginTop: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Platform Commission Fee (%)</label>
                  <input type="number" className="form-input" defaultValue={15} />
                </div>
                <div className="form-group">
                  <label className="form-label">Phlebotomist Per-Pickup Base (₹)</label>
                  <input type="number" className="form-input" defaultValue={250} />
                </div>
                <div className="form-group">
                  <label className="form-label">Urgent / STAT Priority Surcharge (₹)</label>
                  <input type="number" className="form-input" defaultValue={150} />
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => alert('Commission rules updated.')}
                >
                  Update Split Rules
                </button>
              </div>
            </div>
          )}

          {/* TAB 9: ANALYTICS */}
          {activeTab === 'analytics' && (
            <div className="chart-card-modern">
              <div className="card-top-header">
                <div>
                  <h2 className="card-top-title">Network Volume & Latency Analytics</h2>
                  <p style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '2px' }}>
                    Logistics SLA performance, pickup duration metrics, and peak volume insights
                  </p>
                </div>
              </div>

              <div className="kpi-5-row" style={{ marginTop: '16px' }}>
                <div className="kpi-card-modern">
                  <div className="kpi-body">
                    <span className="kpi-title">Average Pickup Latency</span>
                    <span className="kpi-main-number">11.8 mins</span>
                    <span className="kpi-trend-text">Within 15 min SLA target</span>
                  </div>
                </div>
                <div className="kpi-card-modern">
                  <div className="kpi-body">
                    <span className="kpi-title">Cold-Chain Adherence</span>
                    <span className="kpi-main-number">99.8%</span>
                    <span className="kpi-trend-text">2 alerts resolved</span>
                  </div>
                </div>
                <div className="kpi-card-modern">
                  <div className="kpi-body">
                    <span className="kpi-title">Daily Sample Peak</span>
                    <span className="kpi-main-number">1,840</span>
                    <span className="kpi-sub-split">Saturday Peak Hours</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 10: SETTINGS */}
          {activeTab === 'settings' && (
            <div className="settings-grid-2">
              <div className="chart-card-modern">
                <div className="card-top-header">
                  <div>
                    <h2 className="card-top-title">Platform Global Configuration</h2>
                    <p style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '2px' }}>
                      Temperature thresholds, SLA timeout triggers &amp; Firestore settings
                    </p>
                  </div>
                </div>

                {settingsStatusMsg && (
                  <div className="admin-auth-alert success" style={{ marginTop: '12px' }}>
                    {settingsStatusMsg}
                  </div>
                )}

                <div style={{ marginTop: '16px' }}>
                  <div className="form-group">
                    <label className="form-label">Connected Firebase Project</label>
                    <input type="text" className="form-input" value="labsetu-diagnostics (Mumbai / Asia-South)" disabled />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Default Cold-Chain Temperature Range</label>
                    <input type="text" className="form-input" value="2.0°C to 8.0°C (Refrigerated)" disabled />
                  </div>
                  <div className="form-group">
                    <label className="form-label">STAT Emergency Pickup SLA (Minutes)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={statSlaMinutes}
                      onChange={(e) => setStatSlaMinutes(Number(e.target.value))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Auto-Reassign Courier Delay Threshold (Minutes)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={delayThresholdMinutes}
                      onChange={(e) => setDelayThresholdMinutes(Number(e.target.value))}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      void handleSavePlatformSettings();
                    }}
                  >
                    Save Platform Settings
                  </button>
                </div>
              </div>

              <div className="chart-card-modern">
                <div className="card-top-header">
                  <div>
                    <h2 className="card-top-title">Email Notifications &amp; Cloud Storage</h2>
                    <p style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '2px' }}>
                      Automated Gmail SMTP alerts, Firestore mail queue &amp; diagnostic document bucket
                    </p>
                  </div>
                </div>

                {notifStatusMsg && (
                  <div className="admin-auth-alert success" style={{ marginTop: '12px' }}>
                    {notifStatusMsg}
                  </div>
                )}

                <div style={{ marginTop: '16px' }}>
                  <div className="form-group">
                    <label className="form-label">Admin Alert Email Address</label>
                    <input
                      type="email"
                      className="form-input"
                      value={emailSettings.adminEmail}
                      onChange={(e) => setEmailSettings({ ...emailSettings, adminEmail: e.target.value })}
                    />
                  </div>

                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={emailSettings.enableBookingEmails}
                      onChange={(e) =>
                        setEmailSettings({ ...emailSettings, enableBookingEmails: e.target.checked })
                      }
                    />
                    <span>Send email alerts on New STAT / Pickup Bookings</span>
                  </label>

                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={emailSettings.enableColdChainAlerts}
                      onChange={(e) =>
                        setEmailSettings({ ...emailSettings, enableColdChainAlerts: e.target.checked })
                      }
                    />
                    <span>Send urgent email alerts on Cold-Chain Temp Excursion (&gt; 8°C)</span>
                  </label>

                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={emailSettings.enableReportReadyEmails}
                      onChange={(e) =>
                        setEmailSettings({ ...emailSettings, enableReportReadyEmails: e.target.checked })
                      }
                    />
                    <span>Notify small labs via email when Partner Reports upload</span>
                  </label>

                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '14px' }}>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        void handleSendTestNotificationAndEmail();
                      }}
                    >
                      Send Test Email &amp; Push Notification
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        void handleSavePlatformSettings();
                      }}
                    >
                      Save Email Rules
                    </button>
                  </div>

                  <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #E2E8F0' }}>
                    <label className="form-label">
                      Firebase Storage Bucket Test (<code>labsetu-diagnostics.firebasestorage.app</code>)
                    </label>
                    <input
                      type="file"
                      className="form-input"
                      onChange={(e) => {
                        void handleStorageUploadTest(e.target.files?.[0]);
                      }}
                    />
                    {storageStatusMsg && (
                      <p style={{ fontSize: '0.78rem', color: '#475569', marginTop: '8px', wordBreak: 'break-all' }}>
                        {storageStatusMsg}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Quick Action Modal */}
      {quickActionModal && (
        <div className="modal-overlay" onClick={() => setQuickActionModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>{quickActionModal} Action</h3>
              <button
                type="button"
                onClick={() => setQuickActionModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.9rem', color: '#64748B' }}>
                Executing automated platform command for <strong>{quickActionModal}</strong> across connected network nodes.
              </p>
              <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '8px', marginTop: '14px' }}>
                <span style={{ color: '#0D9488', fontWeight: 600, fontSize: '0.85rem' }}>
                  ✓ System Connected: All 98 Small Labs & 26 Large Testing Partners Synchronized.
                </span>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setQuickActionModal(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  alert(`Action completed: ${quickActionModal}`);
                  setQuickActionModal(null);
                }}
              >
                Proceed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Courier Telemetry Modal */}
      {selectedCourier && (
        <div className="modal-overlay" onClick={() => setSelectedCourier(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
                Courier Telemetry: {selectedCourier.name} ({selectedCourier.id})
              </h3>
              <button
                type="button"
                onClick={() => setSelectedCourier(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Device Battery</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0F172A' }}>{selectedCourier.battery}</div>
                </div>
                <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Cooler Box Sensor</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#10B981' }}>{selectedCourier.tempStatus}</div>
                </div>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#64748B' }}>
                Current Road: <strong>{selectedCourier.currentLocation}</strong>
              </p>
              <p style={{ fontSize: '0.85rem', color: '#64748B' }}>
                SLA Status: <strong>On-Time (Next Stop ETA 12 mins)</strong>
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelectedCourier(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  alert(`Direct Dispatch Radio opened for ${selectedCourier.name}`);
                  setSelectedCourier(null);
                }}
              >
                Dispatch Command Radio
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
