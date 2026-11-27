import { useState, useEffect, useMemo, useRef, type FormEvent } from 'react';
import { LabSetuLogo } from '@diagnostic/shared/web/LabSetuLogo';
import {
  type AdminTeamRole,
  type FounderRoleCode,
  isEffectiveSuperAdmin,
  LABSETU_THEME,
  resolveEffectivePermissions,
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
  verifyPasswordResetCode,
  confirmPasswordReset,
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
import {
  AuthApiRequestError,
  ensureRootAdminInitialized,
  forgotPasswordApi,
  loginWithIdentifierApi,
  sendOtpApi,
  verifyOtpApi,
} from '../services/firestoreService';
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
type AuthViewMode = 'login' | 'forgot-password' | 'reset-password';
type ResetStage = 'verifying' | 'ready' | 'submitting' | 'success' | 'invalid';

function isWebRole(role: UserRole): boolean {
  return (
    role === UserRole.ADMIN ||
    role === UserRole.SMALL_LAB ||
    role === UserRole.LARGE_LAB
  );
}

function isKnownRole(val: string | null | undefined): val is UserRole {
  return (
    val === UserRole.ADMIN ||
    val === UserRole.SMALL_LAB ||
    val === UserRole.LARGE_LAB ||
    val === UserRole.PHLEBOTOMIST
  );
}

function parseInitialAuthState(): {
  view: AuthViewMode;
  oobCode: string;
  emailHint: string;
  roleHint: string | null;
} {
  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const oobCode = params.get('oobCode')?.trim() || '';
  const hasResetParams = Boolean(oobCode) || params.get('mode') === 'resetPassword';
  const emailHint = params.get('email')?.trim().toLowerCase() || '';
  const roleHint = params.get('role');

  if (path.startsWith('/reset-password') || hasResetParams) {
    return { view: 'reset-password', oobCode, emailHint, roleHint };
  }
  if (path.startsWith('/forgot-password')) {
    return { view: 'forgot-password', oobCode: '', emailHint, roleHint };
  }
  return { view: 'login', oobCode: '', emailHint: '', roleHint };
}

export function AuthGateScreen({
  requiredRole,
  portalTitle,
  portalSubtitle,
  onShowAlert,
  onAuthenticated,
}: AuthGateScreenProps) {
  const initialRoute = useMemo(() => parseInitialAuthState(), []);
  const [authView, setAuthView] = useState<AuthViewMode>(initialRoute.view);
  const authViewRef = useRef<AuthViewMode>(initialRoute.view);

  const [authLoading, setAuthLoading] = useState(initialRoute.view === 'login');
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

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState(
    initialRoute.emailHint || (requiredRole === UserRole.ADMIN ? ADMIN_LOGIN_EMAIL : '')
  );
  const [forgotCooldown, setForgotCooldown] = useState(0);
  const [forgotSent, setForgotSent] = useState<{
    identifier: string;
    targetDisplay: string;
    role: UserRole;
    roleLabel: string;
  } | null>(null);

  // Reset password state
  const [resetStage, setResetStage] = useState<ResetStage>('verifying');
  const [resetEmail, setResetEmail] = useState(initialRoute.emailHint);
  const [resetRole, setResetRole] = useState<UserRole>(
    isKnownRole(initialRoute.roleHint) ? initialRoute.roleHint : requiredRole
  );
  const [resetErrorReason, setResetErrorReason] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);

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

  useEffect(() => {
    if (forgotCooldown <= 0) return;
    const timer = setInterval(() => {
      setForgotCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [forgotCooldown]);

  useEffect(() => {
    if (authView !== 'reset-password') return;
    let cancelled = false;

    async function validateResetCode() {
      if (!initialRoute.oobCode) {
        if (!cancelled) {
          setResetErrorReason(
            'This password reset link is missing a valid security code. Please request a new reset link.'
          );
          setResetStage('invalid');
        }
        return;
      }

      setResetStage('verifying');
      try {
        const accountEmail = await verifyPasswordResetCode(auth, initialRoute.oobCode);
        const normalized = accountEmail.trim().toLowerCase();
        if (cancelled) return;
        setResetEmail(normalized);

        if (!isKnownRole(initialRoute.roleHint)) {
          try {
            const roleRes = await fetch(
              `${API_BASE_URL}/auth/role-check?email=${encodeURIComponent(normalized)}`
            );
            const roleJson = await roleRes.json().catch(() => null);
            if (!cancelled && isKnownRole(roleJson?.data?.role)) {
              setResetRole(roleJson.data.role);
            }
          } catch {
            // Optional hint lookup; keep fallback role
          }
        }

        if (!cancelled) {
          setResetStage('ready');
        }
      } catch (err: unknown) {
        const fbErr = err as { code?: string };
        let friendly =
          'This password reset link is invalid or has already been used. Please request a new link.';
        if (fbErr.code === 'auth/expired-action-code') {
          friendly =
            'This password reset link has expired (links stay valid for 60 minutes). Please request a new reset email.';
        } else if (fbErr.code === 'auth/user-disabled') {
          friendly =
            'This account is currently paused. Please contact your LabSetu Platform Admin before resetting your password.';
        }
        if (!cancelled) {
          setResetErrorReason(friendly);
          setResetStage('invalid');
        }
      }
    }

    void validateResetCode();
    return () => {
      cancelled = true;
    };
  }, [authView, initialRoute]);

  const passwordRules = useMemo(() => {
    const hasLength = newPassword.length >= 8;
    const hasUpper = /[A-Z]/.test(newPassword);
    const hasLower = /[a-z]/.test(newPassword);
    const hasNumber = /\d/.test(newPassword);
    const matches = newPassword.length > 0 && newPassword === confirmNewPassword;
    const score = [hasLength, hasUpper && hasLower, hasNumber, newPassword.length >= 12].filter(
      Boolean
    ).length;

    let label = 'Too Short';
    let level: 'weak' | 'fair' | 'good' | 'strong' = 'weak';
    if (score >= 4) {
      label = 'Strong';
      level = 'strong';
    } else if (score === 3) {
      label = 'Good';
      level = 'good';
    } else if (score === 2) {
      label = 'Fair';
      level = 'fair';
    } else if (newPassword.length > 0) {
      label = 'Weak';
      level = 'weak';
    }

    return {
      hasLength,
      hasUpper,
      hasLower,
      hasNumber,
      matches,
      score: newPassword.length === 0 ? 0 : Math.max(1, score),
      label,
      level,
    };
  }, [newPassword, confirmNewPassword]);

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
      } else if (!res.ok && res.status >= 400 && res.status < 500 && res.status !== 404) {
        await signOut(auth);
        onAuthenticated(null);
        const msg =
          json?.error?.message ||
          `Access check rejected your sign-in attempt (${res.status}).`;
        setInlineError(msg);
        onShowAlert({
          variant: 'error',
          title: 'Access Denied',
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

      const hydratedApiProfile: UserProfile = {
        ...apiProfile,
        ...(apiProfile.role === UserRole.ADMIN
          ? {
              isSuperAdmin: isEffectiveSuperAdmin(apiProfile, ADMIN_LOGIN_EMAIL),
              permissions: resolveEffectivePermissions(apiProfile, ADMIN_LOGIN_EMAIL),
            }
          : {}),
      };

      if (hydratedApiProfile.role === UserRole.ADMIN) {
        await ensureRootAdminInitialized(user.uid, hydratedApiProfile).catch(() => {});
      }

      setRoleMismatch(null);
      setInlineError(null);
      const freshToken = claimRole ? idToken : await user.getIdToken(true);
      onAuthenticated({
        firebaseUser: user,
        profile: hydratedApiProfile,
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
    const claimAdminSubRole = tokenResult.claims?.adminSubRole as AdminTeamRole | undefined;
    const claimFounderRoles = Array.isArray(tokenResult.claims?.founderRoles)
      ? (tokenResult.claims.founderRoles as FounderRoleCode[])
      : undefined;
    const claimPrimaryDept = tokenResult.claims?.primaryDepartmentId as string | undefined;
    const claimDeptIds = Array.isArray(tokenResult.claims?.departmentIds)
      ? (tokenResult.claims.departmentIds as string[])
      : undefined;
    const claimDesigId = tokenResult.claims?.designationId as string | undefined;
    const claimIsSuperAdmin =
      typeof tokenResult.claims?.isSuperAdmin === 'boolean'
        ? Boolean(tokenResult.claims.isSuperAdmin)
        : undefined;

    const revoked = Boolean(dirProfile?.revokedSuperAdmin);
    const defaultRootAdmin = isRootAdmin && !revoked;

    const candidateProfile: UserProfile = {
      id: user.uid,
      email,
      displayName:
        dirProfile?.displayName ||
        user.displayName ||
        (defaultRootAdmin ? 'Vikas (Super Admin & Tech Head)' : email.split('@')[0]),
      role: resolvedRole,
      ...(resolvedRole === UserRole.ADMIN
        ? {
            adminSubRole:
              dirProfile?.adminSubRole ||
              claimAdminSubRole ||
              (defaultRootAdmin ? 'SUPER_ADMIN' : 'DEPARTMENT_EMPLOYEE'),
            isSuperAdmin:
              typeof dirProfile?.isSuperAdmin === 'boolean'
                ? dirProfile.isSuperAdmin
                : typeof claimIsSuperAdmin === 'boolean'
                ? claimIsSuperAdmin
                : defaultRootAdmin,
            revokedSuperAdmin: revoked,
            founderRoles:
              dirProfile?.founderRoles ||
              claimFounderRoles ||
              (defaultRootAdmin ? ['SUPER_ADMIN', 'PRODUCT_TECHNOLOGY_HEAD'] : undefined),
            founderSeatKey:
              dirProfile?.founderSeatKey || (defaultRootAdmin ? 'VIKAS' : undefined),
            employeeId: dirProfile?.employeeId,
            primaryDepartmentId:
              dirProfile?.primaryDepartmentId ||
              claimPrimaryDept ||
              (defaultRootAdmin ? 'PRODUCT_TECHNOLOGY' : undefined),
            departmentIds:
              dirProfile?.departmentIds ||
              claimDeptIds ||
              (defaultRootAdmin
                ? [
                    'PRODUCT_TECHNOLOGY',
                    'FINANCE_BUSINESS',
                    'OPERATIONS_PARTNERSHIPS',
                    'MARKETING_GROWTH',
                  ]
                : undefined),
            designationId: dirProfile?.designationId || claimDesigId,
            designationTitle: dirProfile?.designationTitle,
            reportingManagerEmail: dirProfile?.reportingManagerEmail,
            reportingManagerName: dirProfile?.reportingManagerName,
            responsibilities: dirProfile?.responsibilities,
            permissions: dirProfile?.permissions,
          }
        : {}),
      labId: dirProfile?.labId || (tokenResult.claims?.labId as string | undefined),
      parentLabId:
        dirProfile?.parentLabId || (tokenResult.claims?.parentLabId as string | undefined),
      phlebotomistId:
        dirProfile?.phlebotomistId ||
        (tokenResult.claims?.phlebotomistId as string | undefined),
      phoneNumber: dirProfile?.phoneNumber,
      isActive: true,
      createdByAdmin: true,
      createdAt: dirProfile?.createdAt || now,
      updatedAt: now,
    };

    const finalProfile: UserProfile = {
      ...candidateProfile,
      ...(candidateProfile.role === UserRole.ADMIN
        ? {
            isSuperAdmin: isEffectiveSuperAdmin(candidateProfile, ADMIN_LOGIN_EMAIL),
            permissions: resolveEffectivePermissions(candidateProfile, ADMIN_LOGIN_EMAIL),
          }
        : {}),
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
      if (authViewRef.current !== 'login') {
        setAuthLoading(false);
        return;
      }

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
    const rawInput = loginEmail.trim();
    if (!rawInput || !loginPassword) {
      setInlineError('Please enter your Email or Assigned Login ID and password.');
      return;
    }

    setAuthSubmitting(true);
    try {
      const apiRes = await loginWithIdentifierApi({
        identifier: rawInput,
        password: loginPassword,
        portalRole: requiredRole,
        clientType: 'WEB',
      });
      if (apiRes.customToken) {
        await signInWithCustomToken(auth, apiRes.customToken);
        return;
      }
      if (rawInput.includes('@')) {
        await signInWithEmailAndPassword(auth, rawInput.toLowerCase(), loginPassword);
        return;
      }
      throw new Error('Could not establish session token. Please try Email OTP or Google Sign-In.');
    } catch (err: unknown) {
      if (err instanceof AuthApiRequestError) {
        if (err.code === 'MOBILE_APP_ONLY') {
          await rejectMobileOnlyPhlebo(rawInput);
          return;
        }
        if (err.code === 'ROLE_MISMATCH' && err.details?.assignedRole) {
          await rejectRoleMismatch(rawInput, err.details.assignedRole as UserRole);
          return;
        }
        if (err.status >= 400 && err.status < 500) {
          setInlineError(err.message);
          onShowAlert({ variant: 'error', title: 'Sign In Unsuccessful', message: err.message });
          return;
        }
      }

      if (rawInput.includes('@')) {
        try {
          await signInWithEmailAndPassword(auth, rawInput.toLowerCase(), loginPassword);
          return;
        } catch (fbRaw: unknown) {
          const fbErr = fbRaw as { code?: string; message?: string };
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
            msg = `Incorrect email/ID or password for ${rawInput}. Tap "Forgot / Set Password" or sign in with Google / Email OTP.`;
          }
          setInlineError(msg);
          onShowAlert({ variant: 'error', title: 'Sign In Unsuccessful', message: msg });
          return;
        }
      }

      const fallbackMsg =
        err instanceof Error
          ? err.message
          : 'Unable to verify Assigned ID right now. Please try your registered email or Email OTP.';
      setInlineError(fallbackMsg);
      onShowAlert({ variant: 'error', title: 'Sign In Unsuccessful', message: fallbackMsg });
    } finally {
      setAuthSubmitting(false);
    }
  }

  function goToForgotView(emailHint?: string) {
    const clean =
      (emailHint ?? loginEmail).trim() ||
      (requiredRole === UserRole.ADMIN ? ADMIN_LOGIN_EMAIL : '');
    setForgotEmail(clean);
    setForgotSent(null);
    setInlineError(null);
    setInlineSuccess(null);
    authViewRef.current = 'forgot-password';
    setAuthView('forgot-password');
    const sp = new URLSearchParams();
    sp.set('role', requiredRole);
    if (clean) sp.set('email', clean);
    window.history.replaceState({}, '', `/forgot-password?${sp.toString()}`);
  }

  function goToLoginView() {
    setInlineError(null);
    setInlineSuccess(null);
    setForgotSent(null);
    authViewRef.current = 'login';
    setAuthView('login');
    if (window.location.pathname !== '/' || window.location.search) {
      window.history.replaceState({}, '', '/');
    }
    if (auth.currentUser) {
      setAuthLoading(true);
      void verifyFirebaseUserRole(auth.currentUser).finally(() => setAuthLoading(false));
    }
  }

  async function handleSendForgotEmail(targetIdentifier: string) {
    const cleanInput = targetIdentifier.trim();
    setInlineError(null);
    setInlineSuccess(null);
    if (!cleanInput) {
      const msg = 'Please enter your registered email address or Assigned Login ID.';
      setInlineError(msg);
      onShowAlert({
        variant: 'warning',
        title: 'Email or Login ID Required',
        message: msg,
      });
      return;
    }

    setAuthSubmitting(true);
    try {
      const data = await forgotPasswordApi({
        identifier: cleanInput,
        origin: window.location.origin,
        portalRole: requiredRole,
        clientType: 'WEB',
      });
      const assignedRole = data.role || requiredRole;
      const roleLabel = data.roleLabel || ROLE_LABELS[assignedRole] || 'Partner Account';
      const targetDisplay = cleanInput.includes('@') ? cleanInput.toLowerCase() : data.maskedEmail;

      setForgotSent({ identifier: cleanInput, targetDisplay, role: assignedRole, roleLabel });
      setForgotCooldown(60);
      onShowAlert({
        variant: 'success',
        title: 'Password Reset Email Sent',
        message: `We emailed a secure reset link to ${targetDisplay}. Open the link in your inbox to choose a new password.`,
      });
    } catch (err: unknown) {
      if (err instanceof AuthApiRequestError) {
        setInlineError(err.message);
        onShowAlert({
          variant: 'error',
          title:
            err.code === 'USER_NOT_PROVISIONED'
              ? 'Account Not Added Yet'
              : err.code === 'ACCOUNT_SUSPENDED'
              ? 'Account Paused'
              : 'Unable to Send Reset Link',
          message: err.message,
        });
        return;
      }
      const msg =
        'Unable to reach the password recovery service right now. Please check your internet connection and try again.';
      setInlineError(msg);
      onShowAlert({
        variant: 'warning',
        title: 'Service Temporarily Unavailable',
        message: msg,
      });
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleConfirmNewPassword(e: FormEvent) {
    e.preventDefault();
    setInlineError(null);

    if (!passwordRules.hasLength) {
      setInlineError('Your new password must be at least 8 characters long.');
      return;
    }
    if (!passwordRules.hasUpper || !passwordRules.hasLower || !passwordRules.hasNumber) {
      setInlineError(
        'Include at least one uppercase letter, one lowercase letter, and one number for account security.'
      );
      return;
    }
    if (!passwordRules.matches) {
      setInlineError('New Password and Confirm Password do not match.');
      return;
    }

    setResetStage('submitting');
    try {
      await confirmPasswordReset(auth, initialRoute.oobCode, newPassword);
      if (auth.currentUser) {
        await signOut(auth).catch(() => {});
      }
      window.history.replaceState(
        {},
        '',
        `/reset-password?role=${encodeURIComponent(resetRole)}&status=done`
      );
      setResetStage('success');
      onShowAlert({
        variant: 'success',
        title: 'Password Updated',
        message:
          resetRole === UserRole.PHLEBOTOMIST
            ? `Password saved for ${resetEmail}. Open the LabSetu Mobile App to sign in.`
            : `Your password for ${resetEmail} has been updated. You can now sign in.`,
      });
    } catch (err: unknown) {
      const fbErr = err as { code?: string };
      if (
        fbErr.code === 'auth/expired-action-code' ||
        fbErr.code === 'auth/invalid-action-code'
      ) {
        setResetErrorReason(
          'This reset link has expired or was already used. Please request a fresh reset link.'
        );
        setResetStage('invalid');
        return;
      }
      const msg =
        fbErr.code === 'auth/weak-password'
          ? 'Please choose a stronger password with at least 8 characters.'
          : 'Could not save your new password right now. Please try again.';
      setInlineError(msg);
      setResetStage('ready');
      onShowAlert({ variant: 'error', title: 'Update Failed', message: msg });
    }
  }

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    setInlineError(null);
    setInlineSuccess(null);
    const rawInput = otpEmail.trim();
    if (!rawInput) {
      setInlineError('Please enter your registered email address or Assigned Login ID.');
      return;
    }

    setAuthSubmitting(true);
    try {
      const data = await sendOtpApi({
        identifier: rawInput,
        portalRole: requiredRole,
        clientType: 'WEB',
      });
      setOtpSent(true);
      setOtpCooldown(60);
      const targetDisplay = rawInput.includes('@') ? rawInput.toLowerCase() : data.maskedEmail;
      const deliveryNote = `A 6-digit verification OTP has been sent to ${targetDisplay}. Please check your inbox and spam folder.`;
      setInlineSuccess(deliveryNote);
      onShowAlert({
        variant: 'success',
        title: 'OTP Sent to Email',
        message: deliveryNote,
      });
    } catch (err: unknown) {
      if (err instanceof AuthApiRequestError) {
        if (err.code === 'MOBILE_APP_ONLY') {
          setRoleMismatch({ email: rawInput, assignedRole: UserRole.PHLEBOTOMIST });
          setInlineError(err.message);
          onShowAlert({ variant: 'error', title: 'Mobile App Only', message: err.message });
          return;
        }
        if (err.code === 'ROLE_MISMATCH' && err.details?.assignedRole) {
          const assignedRole = err.details.assignedRole as UserRole;
          setRoleMismatch({ email: rawInput, assignedRole });
          setInlineError(err.message);
          onShowAlert({
            variant: 'error',
            title: assignedRole === UserRole.PHLEBOTOMIST ? 'Mobile App Only' : 'Wrong Portal Selected',
            message: err.message,
            detail: `Your Account Role: ${ROLE_LABELS[assignedRole]}`,
          });
          return;
        }
        setInlineError(err.message);
        onShowAlert({
          variant: 'error',
          title: err.code === 'USER_NOT_PROVISIONED' ? 'Account Not Added Yet' : 'Could Not Send OTP',
          message: err.message,
        });
        return;
      }
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
    const rawInput = otpEmail.trim();
    if (!rawInput || otpCode.trim().length < 6) {
      setInlineError('Please enter your Email / Login ID and all 6 digits of your OTP.');
      return;
    }

    setAuthSubmitting(true);
    try {
      const data = await verifyOtpApi({
        identifier: rawInput,
        otp: otpCode.trim(),
        portalRole: requiredRole,
        clientType: 'WEB',
      });
      if (data.customToken) {
        await signInWithCustomToken(auth, data.customToken);
        return;
      }

      onShowAlert({
        variant: 'error',
        title: 'Sign-In Incomplete',
        message:
          'Email OTP verified, but we could not finish signing you in. Please try signing in with Google or your password.',
      });
    } catch (err: unknown) {
      if (err instanceof AuthApiRequestError) {
        if (err.code === 'MOBILE_APP_ONLY') {
          setRoleMismatch({ email: rawInput, assignedRole: UserRole.PHLEBOTOMIST });
        }
        setInlineError(err.message);
        onShowAlert({
          variant: 'error',
          title: err.code === 'MOBILE_APP_ONLY' ? 'Mobile App Only' : 'Invalid OTP',
          message: err.message,
        });
        return;
      }
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

  if (authView === 'forgot-password') {
    return (
      <div className="auth-flow-shell">
        <div className="portal-login-topbar">
          <a
            href={PORTAL_URLS.PORTAL}
            className="btn-hero-secondary"
            style={{ padding: '8px 16px', fontSize: '0.85rem', textDecoration: 'none' }}
          >
            ← LabSetu Main Portal
          </a>

          <button
            type="button"
            className="btn-hero-secondary"
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
            onClick={goToLoginView}
          >
            ← Back to Sign In
          </button>
        </div>

        <div className="auth-flow-center">
          <div className="admin-login-card">
            <div className="admin-login-banner">
              <LabSetuLogo variant="dark" width={38} height={38} alt="LabSetu" />
              <div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800 }}>
                  {LABSETU_THEME.brand.name} • Password Recovery
                </div>
                <div style={{ fontSize: '0.75rem', color: '#7DD3FC' }}>
                  {portalTitle} • Set or reset your account password
                </div>
              </div>
            </div>

            <div className="admin-login-body">
              {forgotSent ? (
                <div>
                  <div className="reset-status-card sent">
                    <div className="reset-status-icon sent">✉️</div>
                    <div style={{ fontSize: '1.08rem', fontWeight: 800, color: '#065F46' }}>
                      Reset Link Delivered
                    </div>
                    <p
                      style={{
                        fontSize: '0.84rem',
                        color: '#334155',
                        marginTop: '6px',
                        lineHeight: 1.55,
                      }}
                    >
                      A secure password setup / reset email has been sent to{' '}
                      <strong>{forgotSent.targetDisplay}</strong>.
                    </p>
                    <div style={{ marginTop: '12px' }}>
                      <span className="role-assigned-pill">
                        Registered Role: {forgotSent.roleLabel}
                      </span>
                    </div>
                  </div>

                  {forgotSent.role === UserRole.PHLEBOTOMIST && (
                    <div className="phlebo-mobile-notice light">
                      <strong>📱 Field Phlebotomist Note:</strong> Open the reset link from your
                      email to set your new password, then sign in inside the{' '}
                      <strong>LabSetu Mobile App</strong>.
                    </div>
                  )}

                  <div className="auth-tip-box">
                    <strong>Didn&apos;t see it yet?</strong> Check your Spam, Promotions, or Updates
                    folder for an email titled <em>&ldquo;Reset Your LabSetu Password&rdquo;</em>.
                    Links stay active for 60 minutes.
                  </div>

                  <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
                    <button
                      type="button"
                      className="btn-primary btn-full"
                      style={{ justifyContent: 'center' }}
                      disabled={forgotCooldown > 0 || authSubmitting}
                      onClick={() => void handleSendForgotEmail(forgotSent.identifier)}
                    >
                      {authSubmitting
                        ? 'Sending Again...'
                        : forgotCooldown > 0
                        ? `Resend Reset Link in ${forgotCooldown}s`
                        : 'Resend Reset Link'}
                    </button>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                      <button
                        type="button"
                        className="btn-link-muted"
                        onClick={() => {
                          setForgotSent(null);
                          setInlineError(null);
                        }}
                      >
                        Try Different Email / ID
                      </button>
                      <button
                        type="button"
                        className="btn-link-muted"
                        onClick={goToLoginView}
                      >
                        Back to Sign In →
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleSendForgotEmail(forgotEmail);
                  }}
                >
                  <div className="step-indicator-pill">
                    <span>🔑 Step 1 of 2</span>
                    <span>•</span>
                    <span>Request Reset Email</span>
                  </div>

                  <p className="admin-login-subtitle" style={{ marginBottom: '16px' }}>
                    Enter your registered email address or Assigned Login ID (e.g. LAB-SM-1001). We will send you a secure, single-use link to set a new password.
                  </p>

                  {inlineError && <div className="admin-auth-alert error">{inlineError}</div>}

                  <div className="form-group">
                    <label className="form-label" htmlFor="portal-forgot-email">
                      Email Address or Assigned Login ID
                    </label>
                    <input
                      id="portal-forgot-email"
                      type="text"
                      className="form-input"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="name@company.com or LAB-SM-1001 / PHL-1001"
                      autoComplete="username"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn-primary btn-full"
                    style={{ justifyContent: 'center' }}
                    disabled={authSubmitting}
                  >
                    {authSubmitting ? 'Sending Secure Link...' : 'Send Password Reset Link →'}
                  </button>

                  <div
                    style={{
                      marginTop: '16px',
                      paddingTop: '14px',
                      borderTop: '1px solid #E2E8F0',
                      textAlign: 'center',
                    }}
                  >
                    <button
                      type="button"
                      className="btn-link-muted"
                      onClick={goToLoginView}
                    >
                      Remembered your password? Back to Sign In
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (authView === 'reset-password') {
    const isPhleboReset = resetRole === UserRole.PHLEBOTOMIST;
    const resetRoleLabel = ROLE_LABELS[resetRole] || portalTitle;
    return (
      <div className="auth-flow-shell">
        <div className="portal-login-topbar">
          <a
            href={PORTAL_URLS.PORTAL}
            className="btn-hero-secondary"
            style={{ padding: '8px 16px', fontSize: '0.85rem', textDecoration: 'none' }}
          >
            ← LabSetu Main Portal
          </a>

          {!isPhleboReset && (
            <button
              type="button"
              className="btn-hero-secondary"
              style={{ padding: '8px 16px', fontSize: '0.85rem' }}
              onClick={goToLoginView}
            >
              Go to Sign In
            </button>
          )}
        </div>

        <div className="auth-flow-center">
          <div className="admin-login-card">
            <div className="admin-login-banner">
              <LabSetuLogo variant="dark" width={38} height={38} alt="LabSetu" />
              <div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800 }}>
                  {LABSETU_THEME.brand.name} • Create New Password
                </div>
                <div style={{ fontSize: '0.75rem', color: '#7DD3FC' }}>
                  Complete your password setup securely
                </div>
              </div>
            </div>

            <div className="admin-login-body">
              {resetStage === 'verifying' && (
                <div className="reset-status-card">
                  <div className="reset-status-icon loading">⏳</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>
                    Checking Your Security Link...
                  </div>
                  <p style={{ fontSize: '0.83rem', color: '#64748B', marginTop: '6px' }}>
                    Please wait a moment while we verify your reset link.
                  </p>
                </div>
              )}

              {resetStage === 'invalid' && (
                <div>
                  <div className="reset-status-card error">
                    <div className="reset-status-icon error">⚠️</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#B91C1C' }}>
                      Reset Link Expired or Invalid
                    </div>
                    <p
                      style={{
                        fontSize: '0.84rem',
                        color: '#334155',
                        marginTop: '8px',
                        lineHeight: 1.55,
                      }}
                    >
                      {resetErrorReason}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="btn-primary btn-full"
                    style={{ justifyContent: 'center' }}
                    onClick={() => goToForgotView(resetEmail)}
                  >
                    Request a New Reset Link →
                  </button>

                  {!isPhleboReset && (
                    <div style={{ textAlign: 'center', marginTop: '14px' }}>
                      <button
                        type="button"
                        className="btn-link-muted"
                        onClick={goToLoginView}
                      >
                        ← Return to Sign In
                      </button>
                    </div>
                  )}
                </div>
              )}

              {resetStage === 'success' && (
                <div>
                  <div className="reset-status-card sent">
                    <div className="reset-status-icon success">✓</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#065F46' }}>
                      Password Updated Successfully
                    </div>
                    <p
                      style={{
                        fontSize: '0.84rem',
                        color: '#334155',
                        marginTop: '6px',
                        lineHeight: 1.55,
                      }}
                    >
                      Your new password for <strong>{resetEmail}</strong> is active right away.
                    </p>
                    <div style={{ marginTop: '10px' }}>
                      <span className="role-assigned-pill">{resetRoleLabel}</span>
                    </div>
                  </div>

                  {isPhleboReset ? (
                    <div className="phlebo-mobile-notice light" style={{ marginBottom: '0' }}>
                      <strong>📱 Open LabSetu Mobile App:</strong> Field Phlebotomist dashboards
                      are only accessible on the mobile app. Open the LabSetu Mobile App on your
                      phone and sign in using <strong>{resetEmail}</strong> and your new password.
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn-primary btn-full"
                      style={{ justifyContent: 'center' }}
                      onClick={goToLoginView}
                    >
                      Sign In to {portalTitle} →
                    </button>
                  )}
                </div>
              )}

              {(resetStage === 'ready' || resetStage === 'submitting') && (
                <form onSubmit={(e) => void handleConfirmNewPassword(e)}>
                  <div className="step-indicator-pill">
                    <span>🔐 Step 2 of 2</span>
                    <span>•</span>
                    <span>Choose New Password</span>
                  </div>

                  <div
                    className="role-requirement-banner"
                    style={{ width: '100%', justifyContent: 'space-between' }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Account: <strong>{resetEmail}</strong>
                    </span>
                    <span className="role-assigned-pill">{resetRoleLabel}</span>
                  </div>

                  {inlineError && <div className="admin-auth-alert error">{inlineError}</div>}

                  <div className="form-group">
                    <label className="form-label" htmlFor="portal-reset-new-pw">
                      New Password
                    </label>
                    <div className="admin-password-wrap">
                      <input
                        id="portal-reset-new-pw"
                        type={showNewPassword ? 'text' : 'password'}
                        className="form-input"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Create a strong password"
                        style={{ paddingRight: '58px' }}
                        autoComplete="new-password"
                        required
                      />
                      <button
                        type="button"
                        className="admin-password-toggle"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                      >
                        {showNewPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>

                    <div className="password-strength-meter">
                      <div className="password-strength-header">
                        <span>Password Strength</span>
                        <span>{passwordRules.label}</span>
                      </div>
                      <div className="password-strength-bars">
                        {[1, 2, 3, 4].map((slot) => (
                          <div
                            key={slot}
                            className={`password-strength-bar ${
                              passwordRules.score >= slot ? `active ${passwordRules.level}` : ''
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="portal-reset-confirm-pw">
                      Confirm New Password
                    </label>
                    <div className="admin-password-wrap">
                      <input
                        id="portal-reset-confirm-pw"
                        type={showConfirmNewPassword ? 'text' : 'password'}
                        className="form-input"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        placeholder="Re-enter your new password"
                        style={{ paddingRight: '58px' }}
                        autoComplete="new-password"
                        required
                      />
                      <button
                        type="button"
                        className="admin-password-toggle"
                        onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                      >
                        {showConfirmNewPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>

                  <ul className="password-requirements-list">
                    <li className={`password-req-item ${passwordRules.hasLength ? 'met' : ''}`}>
                      <span className="req-dot">{passwordRules.hasLength ? '✓' : '•'}</span>
                      <span>At least 8 characters</span>
                    </li>
                    <li className={`password-req-item ${passwordRules.hasUpper ? 'met' : ''}`}>
                      <span className="req-dot">{passwordRules.hasUpper ? '✓' : '•'}</span>
                      <span>One uppercase letter (A-Z)</span>
                    </li>
                    <li className={`password-req-item ${passwordRules.hasLower ? 'met' : ''}`}>
                      <span className="req-dot">{passwordRules.hasLower ? '✓' : '•'}</span>
                      <span>One lowercase letter (a-z)</span>
                    </li>
                    <li className={`password-req-item ${passwordRules.hasNumber ? 'met' : ''}`}>
                      <span className="req-dot">{passwordRules.hasNumber ? '✓' : '•'}</span>
                      <span>One number (0-9)</span>
                    </li>
                    <li className={`password-req-item ${passwordRules.matches ? 'met' : ''}`}>
                      <span className="req-dot">{passwordRules.matches ? '✓' : '•'}</span>
                      <span>Passwords match</span>
                    </li>
                  </ul>

                  <button
                    type="submit"
                    className="btn-primary btn-full"
                    style={{ justifyContent: 'center' }}
                    disabled={resetStage === 'submitting'}
                  >
                    {resetStage === 'submitting' ? 'Saving Password...' : 'Save New Password'}
                  </button>
                </form>
              )}
            </div>
          </div>
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
          <LabSetuLogo variant="dark" width={38} height={38} alt="LabSetu" />
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
            <span>OR SIGN IN WITH EMAIL OR ASSIGNED ID</span>
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
              Email / ID &amp; Password
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
                  Email Address or Assigned Login ID
                </label>
                <input
                  id="portal-email"
                  type="text"
                  className="form-input"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="name@company.com or LAB-SM-1001 / USR-ADM-1001"
                  autoComplete="username"
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
                  onClick={() => goToForgotView(loginEmail.trim())}
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
                  Email Address or Assigned Login ID
                </label>
                <input
                  id="otp-email"
                  type="text"
                  className="form-input"
                  value={otpEmail}
                  onChange={(e) => setOtpEmail(e.target.value)}
                  placeholder="name@company.com or LAB-SM-1001 / USR-ADM-1001"
                  autoComplete="username"
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
