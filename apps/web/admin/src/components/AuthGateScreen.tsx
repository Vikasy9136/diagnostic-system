import { useState, useEffect, useRef, type FormEvent } from 'react';
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
  PORTAL_URLS,
  auth,
  db,
  googleProvider,
} from '../firebase';
import { ensureRootAdminInitialized } from '../services/firestoreService';
import { type DynamicAlertVariant } from './DynamicAlertModal';

export interface VerifiedPortalSession {
  firebaseUser: User | null;
  profile: UserProfile;
  authSource: 'firebase';
  bearerToken: string;
}

interface AuthGateScreenProps {
  requiredRole: UserRole;
  portalTitle: string;
  portalSubtitle: string;
  onShowAlert: (opts: {
    variant: DynamicAlertVariant;
    title: string;
    message: string;
    detail?: string;
    confirmLabel?: string;
  }) => void;
  onAuthenticated: (session: VerifiedPortalSession | null) => void;
}

type AuthTabMode = 'google' | 'password' | 'otp';

function isWebRole(role: UserRole): boolean {
  return (
    role === UserRole.ADMIN ||
    role === UserRole.SMALL_LAB ||
    role === UserRole.LARGE_LAB
  );
}

export function AuthGateScreen({
  requiredRole,
  portalTitle,
  portalSubtitle,
  onShowAlert,
  onAuthenticated,
}: AuthGateScreenProps) {
  const [authLoading, setAuthLoading] = useState(true);
  const [authTab, setAuthTab] = useState<AuthTabMode>('password');
  const [loginEmail, setLoginEmail] = useState(
    requiredRole === UserRole.ADMIN ? ADMIN_LOGIN_EMAIL : ''
  );
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Email OTP state
  const [otpEmail, setOtpEmail] = useState(
    requiredRole === UserRole.ADMIN ? ADMIN_LOGIN_EMAIL : ''
  );
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);

  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [inlineSuccess, setInlineSuccess] = useState<string | null>(null);

  // Holds signed-out user details when their Admin-assigned role belongs to a different portal or mobile app
  const [roleMismatch, setRoleMismatch] = useState<{
    email: string;
    assignedRole: UserRole;
  } | null>(null);
  const mismatchTriggeredRef = useRef(false);

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setInterval(() => {
      setOtpCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCooldown]);

  const resolvePortalUrl = (role: UserRole): string => {
    if (role === UserRole.ADMIN) return PORTAL_URLS.ADMIN;
    if (role === UserRole.SMALL_LAB) return PORTAL_URLS.SMALL_LAB;
    if (role === UserRole.LARGE_LAB) return PORTAL_URLS.LARGE_LAB;
    return PORTAL_URLS.PORTAL;
  };

  async function rejectMobileOnlyPhlebo(email: string) {
    mismatchTriggeredRef.current = true;
    setRoleMismatch({ email, assignedRole: UserRole.PHLEBOTOMIST });
    if (auth.currentUser) {
      await signOut(auth);
    }
    onAuthenticated(null);
    const msg =
      'Field Phlebotomist accounts can only sign in using the LabSetu Mobile App, not on the website.';
    setInlineError(msg);
    onShowAlert({
      variant: 'error',
      title: 'Mobile App Only',
      message: msg,
    });
  }

  async function rejectRoleMismatch(email: string, assignedRole: UserRole) {
    if (assignedRole === UserRole.PHLEBOTOMIST) {
      await rejectMobileOnlyPhlebo(email);
      return;
    }
    mismatchTriggeredRef.current = true;
    setRoleMismatch({ email, assignedRole });
    if (auth.currentUser) {
      await signOut(auth);
    }
    onAuthenticated(null);
    const msg = `${email} is registered as "${ROLE_LABELS[assignedRole]}" and cannot open ${portalTitle} (${ROLE_LABELS[requiredRole]}).`;
    setInlineError(msg);
    onShowAlert({
      variant: 'error',
      title: 'Wrong Portal Selected',
      message: msg,
      detail: `Your Account Role: ${ROLE_LABELS[assignedRole]} • Signed Out Automatically`,
    });
  }

  async function verifyFirebaseUserRole(user: User): Promise<void> {
    const email = user.email?.trim().toLowerCase() || '';
    if (!email) {
      await signOut(auth);
      onAuthenticated(null);
      onShowAlert({
        variant: 'error',
        title: 'Email Required',
        message: 'Your sign-in account does not include an email address.',
      });
      return;
    }

    if (!isWebRole(requiredRole)) {
      await rejectMobileOnlyPhlebo(email);
      return;
    }

    const tokenResult = await getIdTokenResult(user);
    const idToken = await user.getIdToken();
    const claimRole = tokenResult.claims?.role as UserRole | undefined;

    // 1. Check authoritative backend verification API first
    let apiProfile: UserProfile | null = null;
    try {
      const res = await fetch(`${API_BASE_URL}/auth/verify-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Platform': 'web',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          requiredRole,
          email,
          clientType: 'WEB',
        }),
      });

      const json = await res.json().catch(() => null);

      if (res.ok && json?.data) {
        apiProfile = json.data as UserProfile;
      } else if (res.status === 403 && json?.error?.code === 'MOBILE_APP_ONLY') {
        await rejectMobileOnlyPhlebo(email);
        return;
      } else if (res.status === 403 && json?.error?.code === 'ROLE_MISMATCH') {
        const assignedRole =
          (json.error?.details?.assignedRole as UserRole) || UserRole.SMALL_LAB;
        await rejectRoleMismatch(email, assignedRole);
        return;
      } else if (res.status === 403 && json?.error?.code === 'ACCOUNT_SUSPENDED') {
        await signOut(auth);
        onAuthenticated(null);
        const msg =
          json.error?.message ||
          `Your account (${email}) has been paused by Platform Admin.`;
        setInlineError(msg);
        onShowAlert({
          variant: 'error',
          title: 'Account Paused',
          message: msg,
        });
        return;
      } else if (res.status === 403 && json?.error?.code === 'USER_NOT_PROVISIONED') {
        await signOut(auth);
        onAuthenticated(null);
        const msg =
          json.error?.message ||
          `Your email (${email}) has not been added yet. Please ask Platform Admin (${ADMIN_LOGIN_EMAIL}) to add your account first.`;
        setInlineError(msg);
        onShowAlert({
          variant: 'error',
          title: 'Account Not Added Yet',
          message: msg,
        });
        return;
      }
    } catch {
      // Backend API unreachable; fall through to direct account record check
    }

    if (apiProfile) {
      if (apiProfile.role === UserRole.PHLEBOTOMIST) {
        await rejectMobileOnlyPhlebo(email);
        return;
      }
      if (!apiProfile.isActive) {
        await signOut(auth);
        onAuthenticated(null);
        onShowAlert({
          variant: 'error',
          title: 'Account Paused',
          message: `Account ${email} is currently inactive.`,
        });
        return;
      }
      if (apiProfile.role !== requiredRole) {
        await rejectRoleMismatch(email, apiProfile.role);
        return;
      }

      if (apiProfile.role === UserRole.ADMIN) {
        await ensureRootAdminInitialized(user.uid, apiProfile).catch(() => {});
      }

      setRoleMismatch(null);
      setInlineError(null);
      const freshToken = claimRole ? idToken : await user.getIdToken(true);
      onAuthenticated({
        firebaseUser: user,
        profile: apiProfile,
        authSource: 'firebase',
        bearerToken: freshToken,
      });
      return;
    }

    // 2. Fallback: Direct directory & token claim lookup
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
      // Rules/offline fallback checked against claims + root admin below
    }

    const isRootAdmin = email === ADMIN_LOGIN_EMAIL.toLowerCase();
    const resolvedRole: UserRole | undefined =
      dirProfile?.role || claimRole || (isRootAdmin ? UserRole.ADMIN : undefined);

    if (dirProfile && dirProfile.isActive === false) {
      await signOut(auth);
      onAuthenticated(null);
      const msg = `Your account (${email}) is currently paused. Please contact Platform Admin (${ADMIN_LOGIN_EMAIL}).`;
      setInlineError(msg);
      onShowAlert({
        variant: 'error',
        title: 'Account Paused',
        message: msg,
      });
      return;
    }

    if (!resolvedRole) {
      await signOut(auth);
      onAuthenticated(null);
      const msg = `Your email (${email}) has not been added yet. Please ask Platform Admin (${ADMIN_LOGIN_EMAIL}) to create your account first.`;
      setInlineError(msg);
      onShowAlert({
        variant: 'error',
        title: 'Account Not Added Yet',
        message: msg,
        detail: `Contact ${ADMIN_LOGIN_EMAIL} to add ${email} under Team & Partner Accounts.`,
      });
      return;
    }

    if (resolvedRole === UserRole.PHLEBOTOMIST) {
      await rejectMobileOnlyPhlebo(email);
      return;
    }

    if (resolvedRole !== requiredRole) {
      await rejectRoleMismatch(email, resolvedRole);
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

    setRoleMismatch(null);
    setInlineError(null);
    onAuthenticated({
      firebaseUser: user,
      profile: finalProfile,
      authSource: 'firebase',
      bearerToken: idToken,
    });
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        if (!mismatchTriggeredRef.current) {
          setRoleMismatch(null);
        }
        mismatchTriggeredRef.current = false;
        onAuthenticated(null);
        setAuthLoading(false);
        return;
      }

      try {
        await verifyFirebaseUserRole(user);
      } catch (err) {
        await signOut(auth);
        onAuthenticated(null);
        onShowAlert({
          variant: 'error',
          title: 'Account Check Failed',
          message: (err as Error).message || 'Could not verify your assigned portal role.',
        });
      } finally {
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requiredRole]);

  async function handleGoogleSignIn() {
    setInlineError(null);
    setInlineSuccess(null);
    setAuthSubmitting(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const fbErr = err as { code?: string; message?: string };
      if (fbErr.code === 'auth/popup-blocked') {
        await signInWithRedirect(auth, googleProvider);
      } else if (fbErr.code === 'auth/popup-closed-by-user') {
        setInlineError('Google sign-in window was closed before finishing.');
      } else if (
        fbErr.code === 'auth/configuration-not-found' ||
        fbErr.code === 'auth/operation-not-allowed'
      ) {
        const msg =
          'Google Sign-In is temporarily unavailable. Please sign in with Email & Password or Email OTP.';
        setInlineError(msg);
        onShowAlert({
          variant: 'warning',
          title: 'Google Sign-In Unavailable',
          message: msg,
        });
      } else {
        const msg = fbErr.message || 'Could not complete Google sign-in.';
        setInlineError(msg);
        onShowAlert({ variant: 'error', title: 'Google Sign-In Failed', message: msg });
      }
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handlePasswordSignIn(e: FormEvent) {
    e.preventDefault();
    setInlineError(null);
    setInlineSuccess(null);
    setAuthSubmitting(true);

    try {
      await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword);
    } catch (err: unknown) {
      const fbErr = err as { code?: string; message?: string };
      let msg = fbErr.message || 'Could not sign in with that email and password.';
      if (
        fbErr.code === 'auth/configuration-not-found' ||
        fbErr.code === 'auth/operation-not-allowed'
      ) {
        msg =
          'Password sign-in is not available right now. Please sign in using Google or Email OTP.';
      } else if (
        fbErr.code === 'auth/invalid-credential' ||
        fbErr.code === 'auth/wrong-password' ||
        fbErr.code === 'auth/user-not-found'
      ) {
        msg = `Incorrect email or password for ${loginEmail.trim()}. Tap "Forgot / Set Password" or sign in with Google / Email OTP.`;
      }
      setInlineError(msg);
      onShowAlert({ variant: 'error', title: 'Sign In Unsuccessful', message: msg });
    } finally {
      setAuthSubmitting(false);
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
        message: 'Please enter your registered email address first.',
      });
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      const msg = `We sent a password setup / reset link to ${email}. Please check your inbox and spam folder.`;
      setInlineSuccess(msg);
      onShowAlert({
        variant: 'success',
        title: 'Password Link Sent',
        message: msg,
      });
    } catch (err: unknown) {
      const msg = (err as Error).message || 'Could not send password reset email.';
      setInlineError(msg);
      onShowAlert({ variant: 'error', title: 'Unable to Send Reset Link', message: msg });
    }
  }

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    setInlineError(null);
    setInlineSuccess(null);
    const normalized = otpEmail.trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
      setInlineError('Please enter your registered email address.');
      return;
    }

    setAuthSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/otp/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Platform': 'web',
        },
        body: JSON.stringify({
          email: normalized,
          portalRole: requiredRole,
          clientType: 'WEB',
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const errCode = json?.error?.code;
        if (errCode === 'MOBILE_APP_ONLY') {
          setRoleMismatch({ email: normalized, assignedRole: UserRole.PHLEBOTOMIST });
          const msg =
            json?.error?.message ||
            'Field Phlebotomist accounts can only sign in using the LabSetu Mobile App, not on the website.';
          setInlineError(msg);
          onShowAlert({
            variant: 'error',
            title: 'Mobile App Only',
            message: msg,
          });
          return;
        }
        if (errCode === 'ROLE_MISMATCH' && json?.error?.details?.assignedRole) {
          const assignedRole = json.error.details.assignedRole as UserRole;
          setRoleMismatch({ email: normalized, assignedRole });
          if (assignedRole === UserRole.PHLEBOTOMIST) {
            const msg =
              'Field Phlebotomist accounts can only sign in using the LabSetu Mobile App, not on the website.';
            setInlineError(msg);
            onShowAlert({
              variant: 'error',
              title: 'Mobile App Only',
              message: msg,
            });
            return;
          }
          const msg = `${normalized} is registered as "${ROLE_LABELS[assignedRole]}" and cannot open ${portalTitle}.`;
          setInlineError(msg);
          onShowAlert({
            variant: 'error',
            title: 'Wrong Portal Selected',
            message: msg,
            detail: `Your Account Role: ${ROLE_LABELS[assignedRole]}`,
          });
          return;
        }
        const errMsg = json?.error?.message || 'Unable to send the verification email.';
        setInlineError(errMsg);
        onShowAlert({
          variant: 'error',
          title:
            errCode === 'USER_NOT_PROVISIONED'
              ? 'Email Not Added Yet'
              : 'Could Not Send OTP',
          message: errMsg,
        });
        return;
      }

      setOtpSent(true);
      setOtpCooldown(60);
      const deliveryNote = `A 6-digit verification OTP has been sent to ${normalized}. Please check your inbox and spam folder.`;
      setInlineSuccess(deliveryNote);
      onShowAlert({
        variant: 'success',
        title: 'OTP Sent to Email',
        message: deliveryNote,
      });
    } catch {
      const msg =
        'Unable to send the verification code right now. Please check your internet connection or try Google / Password sign-in.';
      setInlineError(msg);
      onShowAlert({ variant: 'warning', title: 'Email Service Unavailable', message: msg });
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    setInlineError(null);
    const normalized = otpEmail.trim().toLowerCase();
    if (otpCode.trim().length < 6) {
      setInlineError('Please enter all 6 digits of your OTP.');
      return;
    }

    setAuthSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/otp/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Platform': 'web',
        },
        body: JSON.stringify({
          email: normalized,
          otp: otpCode.trim(),
          portalRole: requiredRole,
          clientType: 'WEB',
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const errCode = json?.error?.code;
        if (errCode === 'MOBILE_APP_ONLY') {
          setRoleMismatch({ email: normalized, assignedRole: UserRole.PHLEBOTOMIST });
        }
        const errMsg = json?.error?.message || 'OTP check failed.';
        setInlineError(errMsg);
        onShowAlert({
          variant: 'error',
          title: errCode === 'MOBILE_APP_ONLY' ? 'Mobile App Only' : 'Invalid OTP',
          message: errMsg,
        });
        return;
      }

      const customToken = json?.data?.customToken as string | null;
      if (customToken) {
        await signInWithCustomToken(auth, customToken);
        return;
      }

      onShowAlert({
        variant: 'error',
        title: 'Sign-In Incomplete',
        message:
          'Email OTP verified, but we could not finish signing you in. Please try signing in with Google or your password.',
      });
    } catch {
      onShowAlert({
        variant: 'error',
        title: 'Verification Error',
        message: 'Could not reach the sign-in service. Please try again.',
      });
    } finally {
      setAuthSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <div className="admin-login-shell">
        <div className="admin-login-card" style={{ padding: '42px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0F172A' }}>
            {portalTitle}
          </div>
          <p style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '8px' }}>
            Checking your account access...
          </p>
        </div>
      </div>
    );
  }

  if (roleMismatch) {
    const isPhleboMismatch = roleMismatch.assignedRole === UserRole.PHLEBOTOMIST;
    const correctUrl = resolvePortalUrl(roleMismatch.assignedRole);
    return (
      <div className="admin-login-shell">
        <div className="admin-login-card">
          <div className="admin-login-banner">
            <div className="brand-logo-icon">{isPhleboMismatch ? '📱' : '🛡️'}</div>
            <div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>
                {isPhleboMismatch ? 'Mobile App Only' : 'Wrong Portal Selected'}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#7DD3FC' }}>
                {isPhleboMismatch
                  ? 'Signed Out • Use LabSetu Mobile App'
                  : 'Signed Out Automatically • Role Check'}
              </div>
            </div>
          </div>

          <div className="admin-login-body">
            <div className="admin-auth-alert error">
              {isPhleboMismatch ? (
                <>
                  <strong>{roleMismatch.email}</strong> is a Field Phlebotomist account and
                  cannot sign in on the website.
                </>
              ) : (
                <>
                  <strong>{roleMismatch.email}</strong> cannot open{' '}
                  <strong>{portalTitle}</strong> ({ROLE_LABELS[requiredRole]} only).
                </>
              )}
            </div>

            <div className="role-mismatch-summary">
              <div className="role-mismatch-row">
                <span>Account Role:</span>
                <span className="status-pill-blue">
                  {ROLE_LABELS[roleMismatch.assignedRole]}
                </span>
              </div>
              <div className="role-mismatch-row">
                <span>Requested Portal:</span>
                <span className="status-pill-red">{ROLE_LABELS[requiredRole]}</span>
              </div>
            </div>

            {isPhleboMismatch ? (
              <div className="phlebo-mobile-notice light" style={{ marginBottom: '12px' }}>
                <strong>🏍️ Field Phlebotomists:</strong> Please open the{' '}
                <strong>LabSetu Mobile App</strong> on your phone and sign in with your
                registered email and password or Email OTP.
              </div>
            ) : (
              <a
                href={correctUrl}
                className="btn-primary btn-full"
                style={{ textDecoration: 'none', marginBottom: '10px', justifyContent: 'center' }}
              >
                Open {ROLE_LABELS[roleMismatch.assignedRole]} Dashboard →
              </a>
            )}

            <a
              href={PORTAL_URLS.PORTAL}
              className="btn-secondary btn-full"
              style={{ textDecoration: 'none', marginBottom: '10px', justifyContent: 'center' }}
            >
              ← Open LabSetu Main Portal
            </a>

            <button
              type="button"
              className="btn-secondary btn-full"
              style={{ justifyContent: 'center' }}
              onClick={async () => {
                setRoleMismatch(null);
                setOtpSent(false);
                setInlineError(null);
                if (auth.currentUser) await signOut(auth);
              }}
            >
              Use Different Account
            </button>
          </div>
        </div>
      </div>
    );
  }

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
            <div style={{ fontSize: '1.22rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
              {LABSETU_THEME.brand.name} • {portalTitle}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#7DD3FC', fontWeight: 500 }}>
              {portalSubtitle}
            </div>
          </div>
        </div>

        <div className="admin-login-body">
          <div className="role-requirement-banner">
            <span>Selected Portal:</span>
            <strong>{ROLE_LABELS[requiredRole]}</strong>
          </div>

          <p className="admin-login-subtitle" style={{ marginBottom: '14px' }}>
            Only accounts added by Platform Admin (<strong>{ADMIN_LOGIN_EMAIL}</strong>) with
            access for <strong>{ROLE_LABELS[requiredRole]}</strong> can open this dashboard.
          </p>

          <button
            type="button"
            className="btn-google-signin"
            onClick={() => void handleGoogleSignIn()}
            disabled={authSubmitting}
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
              className={`labsetu-auth-tab ${authTab === 'password' || authTab === 'google' ? 'active' : ''}`}
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

          {inlineError && <div className="admin-auth-alert error">{inlineError}</div>}
          {inlineSuccess && <div className="admin-auth-alert success">{inlineSuccess}</div>}

          {authTab !== 'otp' ? (
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
                  placeholder="Enter your registered email"
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
                  justifyContent: requiredRole === UserRole.ADMIN ? 'space-between' : 'flex-end',
                  alignItems: 'center',
                  marginBottom: '16px',
                }}
              >
                {requiredRole === UserRole.ADMIN && (
                  <button
                    type="button"
                    className="btn-link-muted"
                    onClick={() => setLoginEmail(ADMIN_LOGIN_EMAIL)}
                  >
                    Fill Admin Email
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
                style={{ justifyContent: 'center' }}
                disabled={authSubmitting}
              >
                {authSubmitting ? 'Verifying...' : `Sign In to ${portalTitle}`}
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
                  placeholder="Enter your registered email"
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
                style={{ justifyContent: 'center' }}
                disabled={authSubmitting}
              >
                {authSubmitting
                  ? 'Please wait...'
                  : otpSent
                  ? `Verify OTP & Open ${portalTitle}`
                  : 'Send 6-Digit Email OTP'}
              </button>

              {otpSent && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: '12px',
                  }}
                >
                  <button
                    type="button"
                    className="btn-link-muted"
                    onClick={() => {
                      setOtpSent(false);
                      setOtpCode('');
                      setInlineSuccess(null);
                    }}
                  >
                    Change Email
                  </button>
                  <button
                    type="button"
                    className="btn-link-muted"
                    disabled={otpCooldown > 0 || authSubmitting}
                    onClick={(e) => void handleSendOtp(e)}
                  >
                    {otpCooldown > 0
                      ? `Resend in ${otpCooldown}s`
                      : 'Resend OTP'}
                  </button>
                </div>
              )}
            </form>
          )}

          <div className="phlebo-mobile-notice light" style={{ marginTop: '16px', marginBottom: '0' }}>
            <strong>🏍️ Field Phlebotomists:</strong> Courier accounts can only sign in
            using the <strong>LabSetu Mobile App</strong> and cannot log in through the website.
          </div>

          <div
            style={{
              marginTop: '16px',
              paddingTop: '14px',
              borderTop: '1px solid #E2E8F0',
              textAlign: 'center',
            }}
          >
            <a href={PORTAL_URLS.PORTAL} className="btn-link-muted" style={{ textDecoration: 'none' }}>
              ← Open LabSetu Main Portal
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
