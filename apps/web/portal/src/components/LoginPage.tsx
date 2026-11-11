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

const WEB_ROLE_META: {
  role: UserRole;
  icon: string;
  tagline: string;
}[] = [
  { role: UserRole.ADMIN, icon: '🛡️', tagline: 'Manage partners, live pickups & billing' },
  { role: UserRole.SMALL_LAB, icon: '🏥', tagline: 'Book sample pickups, patients & reports' },
  { role: UserRole.LARGE_LAB, icon: '🔬', tagline: 'Sample checks, testing & PDF reports' },
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

  async function verifySignedInUserAgainstSelectedRole(
    user: User,
    targetRole: UserRole
  ): Promise<void> {
    const email = user.email?.trim().toLowerCase() || '';
    if (!email) {
      await signOut(auth);
      onShowAlert({
        variant: 'error',
        title: 'Email Required',
        message: 'Your sign-in account does not include an email address.',
      });
      return;
    }

    if (targetRole === UserRole.PHLEBOTOMIST) {
      await signOut(auth);
      const msg =
        'Field Phlebotomist accounts can only sign in using the LabSetu Mobile App, not on the website.';
      setInlineError(msg);
      onShowAlert({ variant: 'error', title: 'Mobile App Only', message: msg });
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
          'X-Client-Platform': 'web',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          requiredRole: targetRole,
          email,
          clientType: 'WEB',
        }),
      });

      const json = await res.json().catch(() => null);
      if (res.ok && json?.data) {
        apiProfile = json.data as UserProfile;
      } else if (res.status === 403 && json?.error?.code === 'MOBILE_APP_ONLY') {
        await signOut(auth);
        setSuggestedCorrectRole(null);
        const msg =
          json.error?.message ||
          'Field Phlebotomist accounts can only sign in using the LabSetu Mobile App, not on the website.';
        setInlineError(msg);
        onShowAlert({
          variant: 'error',
          title: 'Mobile App Only',
          message: msg,
        });
        return;
      } else if (res.status === 403 && json?.error?.code === 'ROLE_MISMATCH') {
        const assignedRole = (json.error?.details?.assignedRole as UserRole) || UserRole.SMALL_LAB;
        await signOut(auth);
        if (assignedRole === UserRole.PHLEBOTOMIST) {
          setSuggestedCorrectRole(null);
          const msg =
            'Field Phlebotomist accounts can only sign in using the LabSetu Mobile App, not on the website.';
          setInlineError(msg);
          onShowAlert({ variant: 'error', title: 'Mobile App Only', message: msg });
          return;
        }
        setSuggestedCorrectRole(assignedRole);
        const msg = `${email} is assigned to "${ROLE_LABELS[assignedRole]}" and cannot sign in to "${ROLE_LABELS[targetRole]}".`;
        setInlineError(msg);
        onShowAlert({
          variant: 'error',
          title: 'Wrong Portal Selected',
          message: msg,
          detail: `Your Account Role: ${ROLE_LABELS[assignedRole]} • Selected Portal: ${ROLE_LABELS[targetRole]}`,
        });
        return;
      } else if (res.status === 403 && json?.error?.code === 'ACCOUNT_SUSPENDED') {
        await signOut(auth);
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
      // Fall through to direct account record check
    }

    if (apiProfile) {
      if (apiProfile.role === UserRole.PHLEBOTOMIST) {
        await signOut(auth);
        setSuggestedCorrectRole(null);
        const msg =
          'Field Phlebotomist accounts can only sign in using the LabSetu Mobile App, not on the website.';
        setInlineError(msg);
        onShowAlert({ variant: 'error', title: 'Mobile App Only', message: msg });
        return;
      }
      if (!apiProfile.isActive) {
        await signOut(auth);
        onShowAlert({
          variant: 'error',
          title: 'Account Paused',
          message: `Account ${email} is currently inactive.`,
        });
        return;
      }
      if (apiProfile.role !== targetRole) {
        await signOut(auth);
        setSuggestedCorrectRole(apiProfile.role);
        const msg = `${email} is registered as "${ROLE_LABELS[apiProfile.role]}". Please choose that role before signing in.`;
        setInlineError(msg);
        onShowAlert({
          variant: 'error',
          title: 'Wrong Portal Selected',
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

    // 2. Direct account lookup fallback
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
      await signOut(auth);
      setSuggestedCorrectRole(null);
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

    if (resolvedRole !== targetRole) {
      await signOut(auth);
      setSuggestedCorrectRole(resolvedRole);
      const msg = `${email} is assigned to "${ROLE_LABELS[resolvedRole]}" — not "${ROLE_LABELS[targetRole]}". You cannot open another role's dashboard.`;
      setInlineError(msg);
      onShowAlert({
        variant: 'error',
        title: 'Wrong Portal Selected',
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
        await verifySignedInUserAgainstSelectedRole(user, selectedRole);
      } catch (err) {
        await signOut(auth);
        onShowAlert({
          variant: 'error',
          title: 'Account Check Failed',
          message: (err as Error).message || 'Could not verify your account role.',
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
        setInlineError('Google sign-in window was closed before finishing.');
      } else if (
        fbErr.code === 'auth/configuration-not-found' ||
        fbErr.code === 'auth/operation-not-allowed'
      ) {
        const msg =
          'Google Sign-In is temporarily unavailable. Please sign in with Email & Password or Email OTP.';
        setInlineError(msg);
        onShowAlert({ variant: 'warning', title: 'Google Sign-In Unavailable', message: msg });
      } else {
        const msg = fbErr.message || 'Could not complete Google sign-in.';
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
      let msg = fbErr.message || 'Could not sign in with that email and password.';
      if (
        fbErr.code === 'auth/configuration-not-found' ||
        fbErr.code === 'auth/operation-not-allowed'
      ) {
        msg = 'Password sign-in is not available right now. Please sign in using Google or Email OTP.';
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
    setSuggestedCorrectRole(null);
    const normalized = otpEmail.trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
      setInlineError('Please enter your registered email address.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/otp/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Platform': 'web',
        },
        body: JSON.stringify({
          email: normalized,
          portalRole: selectedRole,
          clientType: 'WEB',
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const errCode = json?.error?.code;
        if (errCode === 'MOBILE_APP_ONLY') {
          setSuggestedCorrectRole(null);
          const msg =
            json?.error?.message ||
            'Field Phlebotomist accounts can only sign in using the LabSetu Mobile App, not on the website.';
          setInlineError(msg);
          onShowAlert({ variant: 'error', title: 'Mobile App Only', message: msg });
          return;
        }
        if (errCode === 'ROLE_MISMATCH' && json?.error?.details?.assignedRole) {
          const assigned = json.error.details.assignedRole as UserRole;
          if (assigned === UserRole.PHLEBOTOMIST) {
            setSuggestedCorrectRole(null);
            const msg =
              'Field Phlebotomist accounts can only sign in using the LabSetu Mobile App, not on the website.';
            setInlineError(msg);
            onShowAlert({ variant: 'error', title: 'Mobile App Only', message: msg });
            return;
          }
          setSuggestedCorrectRole(assigned);
          const msg = `${normalized} is registered as "${ROLE_LABELS[assigned]}" and cannot sign in under "${ROLE_LABELS[selectedRole]}".`;
          setInlineError(msg);
          onShowAlert({
            variant: 'error',
            title: 'Wrong Portal Selected',
            message: msg,
          });
          return;
        }
        const errMsg = json?.error?.message || 'Unable to send the verification email.';
        setInlineError(errMsg);
        onShowAlert({
          variant: 'error',
          title: errCode === 'USER_NOT_PROVISIONED' ? 'Email Not Added Yet' : 'Could Not Send OTP',
          message: errMsg,
        });
        return;
      }

      setOtpSent(true);
      setOtpCooldown(60);
      const deliveryNote = `A 6-digit verification OTP has been sent to ${normalized}. Please check your inbox and spam folder.`;
      setInlineSuccess(deliveryNote);
      onShowAlert({ variant: 'success', title: 'OTP Sent to Email', message: deliveryNote });
    } catch {
      const msg =
        'Unable to send the verification code right now. Please check your internet connection or try Google / Password sign-in.';
      setInlineError(msg);
      onShowAlert({ variant: 'warning', title: 'Email Service Unavailable', message: msg });
    } finally {
      setSubmitting(false);
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

    setSubmitting(true);
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
          portalRole: selectedRole,
          clientType: 'WEB',
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const errCode = json?.error?.code;
        if (errCode === 'MOBILE_APP_ONLY') {
          setSuggestedCorrectRole(null);
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
        message: 'Email OTP verified, but we could not finish signing you in. Please try signing in with Google or your password.',
      });
    } catch {
      onShowAlert({
        variant: 'error',
        title: 'Verification Error',
        message: 'Could not reach the sign-in service. Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingExisting) {
    return (
      <div className="portal-login-shell" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="admin-login-card" style={{ maxWidth: '420px', padding: '40px', textAlign: 'center' }}>
          <h3 style={{ color: '#0F172A' }}>{LABSETU_THEME.brand.name} Sign-In</h3>
          <p style={{ color: '#64748B', fontSize: '0.86rem', marginTop: '8px' }}>
            Checking your account access...
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
          LabSetu Partner Access
        </div>
      </div>

      {/* Main Split Grid */}
      <div className="portal-login-grid">
        {/* Left Role Picker Panel */}
        <div className="role-selector-panel">
          <div>
            <div className="landing-eyebrow" style={{ marginBottom: '12px' }}>
              Step 1 • Choose Your Portal
            </div>
            <h1 style={{ fontSize: '1.85rem', fontWeight: 800, lineHeight: 1.2 }}>
              Sign In to Your Assigned Workspace
            </h1>
            <p style={{ fontSize: '0.9rem', color: '#CBD5E1', marginTop: '8px', lineHeight: 1.55 }}>
              Select the exact role assigned to your email by Platform Admin (
              <strong style={{ color: '#FFFFFF' }}>{ADMIN_LOGIN_EMAIL}</strong>). Choosing another
              role will not grant access to a different dashboard.
            </p>

            <div className="role-select-cards">
              {WEB_ROLE_META.map((item) => {
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
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '1.3rem' }}>{item.icon}</span>
                        <span style={{ fontWeight: 700, fontSize: '0.96rem' }}>
                          {ROLE_LABELS[item.role]}
                        </span>
                      </div>
                      {active && (
                        <span style={{ fontSize: '0.68rem', background: '#14B8A6', color: '#042F2E', fontWeight: 800, padding: '2px 8px', borderRadius: '999px' }}>
                          SELECTED
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#CBD5E1' }}>
                      {item.tagline}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="phlebo-mobile-notice">
              <strong>🏍️ Field Phlebotomists:</strong> Courier accounts can only sign in using the{' '}
              <strong>LabSetu Mobile App</strong> and cannot log in through this website.
            </div>
          </div>

          <div style={{ background: 'rgba(6, 34, 38, 0.55)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', padding: '14px 16px', fontSize: '0.8rem', color: '#CBD5E1', lineHeight: 1.5 }}>
            <strong style={{ color: '#5EEAD4' }}>Protected Login:</strong> Selecting a role here
            chooses the portal you wish to enter. Your registered account role is always verified
            before opening any dashboard.
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
                Step 2 • Sign in with Google, Password, or Email OTP
              </div>
            </div>
          </div>

          <div className="admin-login-body">
            <div className="role-requirement-banner">
              <span>Selected Portal:</span>
              <strong>{ROLE_LABELS[selectedRole]}</strong>
            </div>

            {inlineError && (
              <div className="admin-auth-alert error">
                <div>{inlineError}</div>
                {suggestedCorrectRole && suggestedCorrectRole !== UserRole.PHLEBOTOMIST && (
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
                    Switch Portal to {ROLE_LABELS[suggestedCorrectRole]} →
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
                    ? 'Checking Account...'
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
                    placeholder="Enter your registered email"
                    disabled={otpSent}
                    required
                  />
                </div>

                {otpSent && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="otp-code">
                      6-Digit Email OTP
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
                    ? 'Please Wait...'
                    : otpSent
                    ? `Verify Code & Enter ${ROLE_LABELS[selectedRole]}`
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
