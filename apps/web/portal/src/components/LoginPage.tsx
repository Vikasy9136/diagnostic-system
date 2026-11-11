import { useState, useEffect, type FormEvent } from 'react';
import {
  LABSETU_THEME,
  ROLE_LABELS,
  type UserProfile,
  UserRole,
} from '@diagnostic/shared';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signInWithCustomToken,
  sendPasswordResetEmail,
  signOut,
  getIdTokenResult,
  type User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import {
  ADMIN_LOGIN_EMAIL,
  API_BASE_URL,
  auth,
  db,
  googleProvider,
} from '../firebase';
import { type DynamicAlertVariant } from './DynamicAlertModal';
import { ensureRootAdminInitialized } from '../services/firestoreService';

export interface VerifiedPortalSession {
  firebaseUser: User | null;
  profile: UserProfile;
  authSource: 'firebase';
  bearerToken: string;
}

interface LoginPageProps {
  selectedRole: UserRole;
  onSelectRole: (role: UserRole) => void;
  onBackToLanding: () => void;
  onShowAlert: (opts: {
    variant: DynamicAlertVariant;
    title: string;
    message: string;
    detail?: string;
    confirmLabel?: string;
  }) => void;
  onAuthenticated: (session: VerifiedPortalSession) => void;
}

type AuthTabMode = 'password' | 'otp';

const ROLE_META: {
  role: UserRole;
  icon: string;
  tagline: string;
}[] = [
  { role: UserRole.ADMIN, icon: '🛡️', tagline: 'Network control & provisioning' },
  { role: UserRole.SMALL_LAB, icon: '🏥', tagline: 'Bookings, patients & reports' },
  { role: UserRole.LARGE_LAB, icon: '🔬', tagline: 'QC accessioning & analyzer worklist' },
  { role: UserRole.PHLEBOTOMIST, icon: '🏍️', tagline: 'Pickups, barcodes, OTP & earnings' },
];

export function LoginPage({
  selectedRole,
  onSelectRole,
  onBackToLanding,
  onShowAlert,
  onAuthenticated,
}: LoginPageProps) {
  const [checkingExisting, setCheckingExisting] = useState(true);
  const [authTab, setAuthTab] = useState<AuthTabMode>('password');
  const [loginEmail, setLoginEmail] = useState(
    selectedRole === UserRole.ADMIN ? ADMIN_LOGIN_EMAIL : ''
  );
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [otpEmail, setOtpEmail] = useState(
    selectedRole === UserRole.ADMIN ? ADMIN_LOGIN_EMAIL : ''
  );
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [inlineSuccess, setInlineSuccess] = useState<string | null>(null);
  const [suggestedCorrectRole, setSuggestedCorrectRole] = useState<UserRole | null>(null);

  useEffect(() => {
    if (selectedRole === UserRole.ADMIN && !loginEmail) {
      setLoginEmail(ADMIN_LOGIN_EMAIL);
    }
    if (selectedRole === UserRole.ADMIN && !otpEmail) {
      setOtpEmail(ADMIN_LOGIN_EMAIL);
    }
  }, [selectedRole, loginEmail, otpEmail]);

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const t = setInterval(() => {
      setOtpCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [otpCooldown]);

  async function verifyFirebaseUserAgainstSelectedRole(
    user: User,
    targetRole: UserRole
  ): Promise<void> {
    const email = user.email?.trim().toLowerCase() || '';
    if (!email) {
      await signOut(auth);
      onShowAlert({
        variant: 'error',
        title: 'Verified Email Required',
        message: 'Signed-in Firebase account does not contain an email address.',
      });
      return;
    }

    const tokenResult = await getIdTokenResult(user);
    const idToken = await user.getIdToken();
    const claimRole = tokenResult.claims?.role as UserRole | undefined;

    // 1. Check authoritative backend verification API if reachable
    let apiProfile: UserProfile | null = null;
    try {
      const res = await fetch(`${API_BASE_URL}/auth/verify-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ requiredRole: targetRole, email }),
      });

      const json = await res.json().catch(() => null);
      if (res.ok && json?.data) {
        apiProfile = json.data as UserProfile;
      } else if (res.status === 403 && json?.error?.code === 'ROLE_MISMATCH') {
        const assignedRole = (json.error?.details?.assignedRole as UserRole) || UserRole.SMALL_LAB;
        await signOut(auth);
        setSuggestedCorrectRole(assignedRole);
        const msg = `${email} is provisioned ONLY for "${ROLE_LABELS[assignedRole]}" and cannot log in as "${ROLE_LABELS[targetRole]}".`;
        setInlineError(msg);
        onShowAlert({
          variant: 'error',
          title: 'Strict Role Lock: Access Denied',
          message: msg,
          detail: `Assigned Role: ${ROLE_LABELS[assignedRole]} • Selected Role: ${ROLE_LABELS[targetRole]}`,
        });
        return;
      } else if (res.status === 403 && json?.error?.code === 'ACCOUNT_SUSPENDED') {
        await signOut(auth);
        const msg =
          json.error?.message ||
          `Access for ${email} has been suspended by Platform Admin.`;
        setInlineError(msg);
        onShowAlert({
          variant: 'error',
          title: 'Account Suspended',
          message: msg,
        });
        return;
      }
    } catch {
      // Backend API optional; proceed with direct Firestore user_directory & Auth claims check
    }

    if (apiProfile) {
      if (!apiProfile.isActive) {
        await signOut(auth);
        onShowAlert({
          variant: 'error',
          title: 'Account Inactive',
          message: `Account ${email} is currently deactivated.`,
        });
        return;
      }
      if (apiProfile.role !== targetRole) {
        await signOut(auth);
        setSuggestedCorrectRole(apiProfile.role);
        const msg = `${email} is restricted to "${ROLE_LABELS[apiProfile.role]}". Select your assigned role card before signing in.`;
        setInlineError(msg);
        onShowAlert({
          variant: 'error',
          title: 'Strict Role Lock: Access Denied',
          message: msg,
        });
        return;
      }

      if (apiProfile.role === UserRole.ADMIN) {
        await ensureRootAdminInitialized(user.uid, apiProfile).catch(() => {});
      }

      const freshToken = claimRole ? idToken : await user.getIdToken(true);
      onAuthenticated({
        firebaseUser: user,
        profile: apiProfile,
        authSource: 'firebase',
        bearerToken: freshToken,
      });
      return;
    }

    // 2. Direct Cloud Firestore user_directory + Custom Claims check
    let dirProfile: Partial<UserProfile> | null = null;
    try {
      const dirSnap = await getDoc(doc(db, 'user_directory', email));
      if (dirSnap.exists()) {
        dirProfile = dirSnap.data() as Partial<UserProfile>;
      } else {
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        if (userSnap.exists()) {
          dirProfile = userSnap.data() as Partial<UserProfile>;
        }
      }
    } catch {
      // Rules/offline fallback checked below
    }

    const isRootAdmin = email === ADMIN_LOGIN_EMAIL.toLowerCase();
    const resolvedRole: UserRole | undefined =
      dirProfile?.role || claimRole || (isRootAdmin ? UserRole.ADMIN : undefined);

    if (dirProfile && dirProfile.isActive === false) {
      await signOut(auth);
      const msg = `Account ${email} has been suspended. Contact Platform Admin (${ADMIN_LOGIN_EMAIL}).`;
      setInlineError(msg);
      onShowAlert({
        variant: 'error',
        title: 'Account Suspended',
        message: msg,
      });
      return;
    }

    if (!resolvedRole) {
      await signOut(auth);
      const msg = `Account (${email}) is not registered by Platform Admin. Only Admin-provisioned emails can access LabSetu dashboards.`;
      setInlineError(msg);
      onShowAlert({
        variant: 'error',
        title: 'Account Not Provisioned',
        message: msg,
        detail: `Ask ${ADMIN_LOGIN_EMAIL} to add ${email} in Admin -> Users & Roles.`,
      });
      return;
    }

    if (resolvedRole !== targetRole) {
      await signOut(auth);
      setSuggestedCorrectRole(resolvedRole);
      const msg = `${email} is assigned role "${ROLE_LABELS[resolvedRole]}" — NOT "${ROLE_LABELS[targetRole]}". You cannot open another role's dashboard.`;
      setInlineError(msg);
      onShowAlert({
        variant: 'error',
        title: 'Strict Role Lock: Access Denied',
        message: msg,
        detail: `Please select "${ROLE_LABELS[resolvedRole]}" and sign in again.`,
      });
      return;
    }

    const now = new Date().toISOString();
    const finalProfile: UserProfile = {
      id: user.uid,
      email,
      displayName:
        dirProfile?.displayName ||
        user.displayName ||
        (isRootAdmin ? 'LabSetu Platform Admin' : email.split('@')[0]),
      role: resolvedRole,
      labId: dirProfile?.labId || (tokenResult.claims?.labId as string | undefined),
      phlebotomistId:
        dirProfile?.phlebotomistId ||
        (tokenResult.claims?.phlebotomistId as string | undefined),
      phoneNumber: dirProfile?.phoneNumber,
      isActive: true,
      createdByAdmin: true,
      createdAt: dirProfile?.createdAt || now,
      updatedAt: now,
    };

    if (finalProfile.role === UserRole.ADMIN) {
      await ensureRootAdminInitialized(user.uid, finalProfile).catch(() => {});
    }

    onAuthenticated({
      firebaseUser: user,
      profile: finalProfile,
      authSource: 'firebase',
      bearerToken: idToken,
    });
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setCheckingExisting(false);
        return;
      }
      try {
        await verifyFirebaseUserAgainstSelectedRole(user, selectedRole);
      } catch (err) {
        await signOut(auth);
        onShowAlert({
          variant: 'error',
          title: 'Role Verification Error',
          message: (err as Error).message || 'Could not verify assigned portal role.',
        });
      } finally {
        setCheckingExisting(false);
      }
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRole]);

  async function handleGoogleSignIn() {
    setInlineError(null);
    setInlineSuccess(null);
    setSuggestedCorrectRole(null);
    setSubmitting(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const fbErr = err as { code?: string; message?: string };
      if (fbErr.code === 'auth/popup-blocked') {
        await signInWithRedirect(auth, googleProvider);
      } else if (fbErr.code === 'auth/popup-closed-by-user') {
        setInlineError('Google sign-in popup was closed before completing.');
      } else if (
        fbErr.code === 'auth/configuration-not-found' ||
        fbErr.code === 'auth/operation-not-allowed'
      ) {
        const msg =
          'Enable Google Sign-In in Firebase Console -> Authentication -> Sign-in method -> Google.';
        setInlineError(msg);
        onShowAlert({ variant: 'warning', title: 'Google Sign-In Setup Required', message: msg });
      } else {
        const msg = fbErr.message || 'Google sign-in failed.';
        setInlineError(msg);
        onShowAlert({ variant: 'error', title: 'Google Sign-In Failed', message: msg });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasswordSignIn(e: FormEvent) {
    e.preventDefault();
    setInlineError(null);
    setInlineSuccess(null);
    setSuggestedCorrectRole(null);
    setSubmitting(true);

    try {
      await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword);
    } catch (err: unknown) {
      const fbErr = err as { code?: string; message?: string };
      let msg = fbErr.message || 'Password sign-in failed.';
      if (
        fbErr.code === 'auth/configuration-not-found' ||
        fbErr.code === 'auth/operation-not-allowed'
      ) {
        msg = 'Enable Email/Password sign-in in Firebase Console Authentication settings.';
      } else if (
        fbErr.code === 'auth/invalid-credential' ||
        fbErr.code === 'auth/wrong-password' ||
        fbErr.code === 'auth/user-not-found'
      ) {
        msg = `Invalid credentials for ${loginEmail.trim()}. Use "Forgot / Set Password" or sign in with Google / Email OTP.`;
      }
      setInlineError(msg);
      onShowAlert({ variant: 'error', title: 'Sign In Unsuccessful', message: msg });
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasswordReset() {
    setInlineError(null);
    setInlineSuccess(null);
    const email = loginEmail.trim();
    if (!email) {
      onShowAlert({
        variant: 'warning',
        title: 'Email Required',
        message: 'Enter your registered email address before requesting password setup.',
      });
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      const msg = `Password setup / reset link dispatched to ${email}.`;
      setInlineSuccess(msg);
      onShowAlert({
        variant: 'success',
        title: 'Password Email Dispatched',
        message: msg,
      });
    } catch (err: unknown) {
      const msg = (err as Error).message || 'Could not send password reset email.';
      setInlineError(msg);
      onShowAlert({ variant: 'error', title: 'Password Reset Failed', message: msg });
    }
  }

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    setInlineError(null);
    setInlineSuccess(null);
    setSuggestedCorrectRole(null);
    const normalized = otpEmail.trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
      setInlineError('Enter a valid Admin-provisioned email address.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalized, portalRole: selectedRole }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const errCode = json?.error?.code;
        if (errCode === 'ROLE_MISMATCH' && json?.error?.details?.assignedRole) {
          const assigned = json.error.details.assignedRole as UserRole;
          setSuggestedCorrectRole(assigned);
          const msg = `${normalized} is assigned "${ROLE_LABELS[assigned]}" and cannot sign in under "${ROLE_LABELS[selectedRole]}".`;
          setInlineError(msg);
          onShowAlert({
            variant: 'error',
            title: 'Strict Role Lock: Access Denied',
            message: msg,
          });
          return;
        }
        const errMsg = json?.error?.message || 'Unable to send Email OTP.';
        setInlineError(errMsg);
        onShowAlert({
          variant: 'error',
          title: errCode === 'USER_NOT_PROVISIONED' ? 'Email Not Added by Admin' : 'OTP Request Rejected',
          message: errMsg,
        });
        return;
      }

      setOtpSent(true);
      setOtpCooldown(60);
      const deliveryNote =
        json?.data?.deliveryMode === 'SMTP'
          ? `6-digit verification OTP sent via email to ${normalized}.`
          : `6-digit OTP issued for ${normalized}. Check the API server terminal or configure SMTP_PASS in .env for Gmail delivery.`;
      setInlineSuccess(deliveryNote);
      onShowAlert({ variant: 'success', title: 'OTP Dispatched', message: deliveryNote });
    } catch {
      const msg =
        'Email OTP backend (/api/v1) is offline. Run `npm run dev` locally or deploy Firebase Cloud Functions, or sign in directly via Google or Email & Password.';
      setInlineError(msg);
      onShowAlert({ variant: 'warning', title: 'OTP Backend Offline', message: msg });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    setInlineError(null);
    const normalized = otpEmail.trim().toLowerCase();
    if (otpCode.trim().length < 6) {
      setInlineError('Enter all 6 digits of your Email OTP.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalized,
          otp: otpCode.trim(),
          portalRole: selectedRole,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const errMsg = json?.error?.message || 'OTP verification failed.';
        setInlineError(errMsg);
        onShowAlert({ variant: 'error', title: 'Invalid OTP', message: errMsg });
        return;
      }

      const customToken = json?.data?.customToken as string | null;
      const devSessionToken = json?.data?.devSessionToken as string | undefined;
      const profile = json?.data?.userProfile as UserProfile | undefined;

      if (customToken) {
        await signInWithCustomToken(auth, customToken);
        return;
      }

      if (profile && devSessionToken && profile.role === selectedRole) {
        onShowAlert({
          variant: 'warning',
          title: 'Direct Firestore Requires Firebase Auth',
          message:
            'OTP verified against API dev mode, but Firebase Admin serviceAccountKey.json is not configured yet for Custom Tokens. Use Google Sign-In or Email & Password so live Cloud Firestore reads/writes succeed!',
        });
        return;
      }

      onShowAlert({
        variant: 'error',
        title: 'Firebase Custom Token Missing',
        message: 'Add serviceAccountKey.json to diagnostic-platform/ or sign in with Google / Password.',
      });
    } catch {
      onShowAlert({
        variant: 'error',
        title: 'Verification Error',
        message: 'Unable to reach OTP verification endpoint.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingExisting) {
    return (
      <div className="portal-login-shell" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="admin-login-card" style={{ maxWidth: '420px', padding: '40px', textAlign: 'center' }}>
          <h3 style={{ color: '#0F172A' }}>{LABSETU_THEME.brand.name} Role Gate</h3>
          <p style={{ color: '#64748B', fontSize: '0.86rem', marginTop: '8px' }}>
            Verifying Firebase authentication &amp; strict role assignment...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-login-shell">
      {/* Top Bar */}
      <div className="portal-login-topbar">
        <button
          type="button"
          className="btn-hero-secondary"
          style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          onClick={onBackToLanding}
        >
          ← Back to LabSetu Home
        </button>

        <div style={{ color: '#99F6E4', fontSize: '0.8rem', fontWeight: 600 }}>
          Firebase Project: <code>labsetu-diagnostics</code>
        </div>
      </div>

      {/* Main Split Grid */}
      <div className="portal-login-grid">
        {/* Left Role Picker Panel */}
        <div className="role-selector-panel">
          <div>
            <div className="landing-eyebrow" style={{ marginBottom: '12px' }}>
              Step 1 • Select Your Dashboard Role
            </div>
            <h1 style={{ fontSize: '1.85rem', fontWeight: 800, lineHeight: 1.2 }}>
              Strict Role-Locked Portal Access
            </h1>
            <p style={{ fontSize: '0.9rem', color: '#CBD5E1', marginTop: '8px', lineHeight: 1.55 }}>
              Choose the exact dashboard role provisioned for your email by Platform Admin (
              <strong style={{ color: '#FFFFFF' }}>{ADMIN_LOGIN_EMAIL}</strong>). Selecting an
              unassigned role will deny access and immediately sign you out.
            </p>

            <div className="role-select-cards">
              {ROLE_META.map((item) => {
                const active = selectedRole === item.role;
                return (
                  <button
                    key={item.role}
                    type="button"
                    className={`role-select-card ${active ? 'active' : ''}`}
                    onClick={() => {
                      onSelectRole(item.role);
                      setInlineError(null);
                      setInlineSuccess(null);
                      setSuggestedCorrectRole(null);
                      setOtpSent(false);
                      if (item.role === UserRole.ADMIN) {
                        setLoginEmail(ADMIN_LOGIN_EMAIL);
                        setOtpEmail(ADMIN_LOGIN_EMAIL);
                      } else {
                        if (loginEmail === ADMIN_LOGIN_EMAIL) setLoginEmail('');
                        if (otpEmail === ADMIN_LOGIN_EMAIL) setOtpEmail('');
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '1.35rem' }}>{item.icon}</span>
                      {active && (
                        <span style={{ fontSize: '0.68rem', background: '#14B8A6', color: '#042F2E', fontWeight: 800, padding: '2px 8px', borderRadius: '999px' }}>
                          SELECTED
                        </span>
                      )}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '4px' }}>
                      {ROLE_LABELS[item.role]}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#CBD5E1' }}>
                      {item.tagline}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ background: 'rgba(6, 34, 38, 0.55)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', padding: '14px 16px', fontSize: '0.8rem', color: '#CBD5E1', lineHeight: 1.5 }}>
            <strong style={{ color: '#5EEAD4' }}>Security Guarantee:</strong> Client-side selection
            only sets the target portal filter. True authorization is enforced against Firestore{' '}
            <code>user_directory</code> and Firebase Security Rules on every query.
          </div>
        </div>

        {/* Right Sign-In Card */}
        <div className="admin-login-card">
          <div className="admin-login-banner">
            <div className="brand-logo-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M10 2v7.31M14 2v7.31M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800 }}>
                Sign In • {ROLE_LABELS[selectedRole]}
              </div>
              <div style={{ fontSize: '0.74rem', color: '#7DD3FC' }}>
                Step 2 • Verify Identity (Google, Password, or Email OTP)
              </div>
            </div>
          </div>

          <div className="admin-login-body">
            <div className="role-requirement-banner">
              <span>Locked Role Target:</span>
              <strong>{ROLE_LABELS[selectedRole]}</strong>
            </div>

            {inlineError && (
              <div className="admin-auth-alert error">
                <div>{inlineError}</div>
                {suggestedCorrectRole && (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ marginTop: '10px', width: '100%', justifyContent: 'center' }}
                    onClick={() => {
                      onSelectRole(suggestedCorrectRole);
                      setSuggestedCorrectRole(null);
                      setInlineError(null);
                    }}
                  >
                    Switch Role Card to {ROLE_LABELS[suggestedCorrectRole]} →
                  </button>
                )}
              </div>
            )}

            {inlineSuccess && <div className="admin-auth-alert success">{inlineSuccess}</div>}

            <button
              type="button"
              className="btn-google-signin"
              onClick={() => void handleGoogleSignIn()}
              disabled={submitting}
            >
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.223 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
                <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
                <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
                <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
              </svg>
              <span>Continue with Google</span>
            </button>

            <div className="auth-divider">
              <span>OR SIGN IN WITH EMAIL</span>
            </div>

            <div className="labsetu-auth-tabs">
              <button
                type="button"
                className={`labsetu-auth-tab ${authTab === 'password' ? 'active' : ''}`}
                onClick={() => {
                  setAuthTab('password');
                  setInlineError(null);
                }}
              >
                Email &amp; Password
              </button>
              <button
                type="button"
                className={`labsetu-auth-tab ${authTab === 'otp' ? 'active' : ''}`}
                onClick={() => {
                  setAuthTab('otp');
                  setInlineError(null);
                }}
              >
                Email OTP
              </button>
            </div>

            {authTab === 'password' ? (
              <form onSubmit={(e) => void handlePasswordSignIn(e)}>
                <div className="form-group">
                  <label className="form-label" htmlFor="portal-email">
                    Email Address
                  </label>
                  <input
                    id="portal-email"
                    type="email"
                    className="form-input"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="Enter Admin-provisioned email"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="portal-password">
                    Password
                  </label>
                  <div className="admin-password-wrap">
                    <input
                      id="portal-password"
                      type={showPassword ? 'text' : 'password'}
                      className="form-input"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Enter your password"
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

                <div
                  style={{
                    display: 'flex',
                    justifyContent:
                      selectedRole === UserRole.ADMIN ? 'space-between' : 'flex-end',
                    alignItems: 'center',
                    marginBottom: '16px',
                  }}
                >
                  {selectedRole === UserRole.ADMIN && (
                    <button
                      type="button"
                      className="btn-link-muted"
                      onClick={() => setLoginEmail(ADMIN_LOGIN_EMAIL)}
                    >
                      Use Admin Email
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-link-muted"
                    onClick={() => void handlePasswordReset()}
                  >
                    Forgot / Set Password
                  </button>
                </div>

                <button
                  type="submit"
                  className="btn-primary btn-full"
                  disabled={submitting}
                >
                  {submitting
                    ? 'Verifying Role...'
                    : `Sign In to ${ROLE_LABELS[selectedRole]}`}
                </button>
              </form>
            ) : (
              <form
                onSubmit={(e) =>
                  void (otpSent ? handleVerifyOtp(e) : handleSendOtp(e))
                }
              >
                <div className="form-group">
                  <label className="form-label" htmlFor="otp-email">
                    Registered Email Address
                  </label>
                  <input
                    id="otp-email"
                    type="email"
                    className="form-input"
                    value={otpEmail}
                    onChange={(e) => setOtpEmail(e.target.value)}
                    placeholder="Enter Admin-provisioned email"
                    disabled={otpSent}
                    required
                  />
                </div>

                {otpSent && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="otp-code">
                      6-Digit Verification OTP
                    </label>
                    <input
                      id="otp-code"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      className="form-input otp-code-input"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••••"
                      required
                    />
                  </div>
                )}

                <button
                  type="submit"
                  className="btn-primary btn-full"
                  disabled={submitting}
                >
                  {submitting
                    ? 'Processing...'
                    : otpSent
                    ? `Verify OTP & Enter ${ROLE_LABELS[selectedRole]}`
                    : 'Send 6-Digit Email OTP'}
                </button>

                {otpSent && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
                    <button
                      type="button"
                      className="btn-link-muted"
                      onClick={() => {
                        setOtpSent(false);
                        setOtpCode('');
                      }}
                    >
                      Change Email
                    </button>
                    <button
                      type="button"
                      className="btn-link-muted"
                      disabled={otpCooldown > 0}
                      onClick={(e) => void handleSendOtp(e)}
                    >
                      {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : 'Resend OTP'}
                    </button>
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
