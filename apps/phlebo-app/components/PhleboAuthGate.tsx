import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
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
import { type DynamicAlertVariant } from './DynamicAlertModal';

export interface VerifiedPhleboSession {
  firebaseUser: User | null;
  profile: UserProfile;
  authSource: 'firebase';
  bearerToken: string;
}

interface PhleboAuthGateProps {
  onShowAlert: (opts: {
    variant: DynamicAlertVariant;
    title: string;
    message: string;
    detail?: string;
  }) => void;
  onAuthenticated: (session: VerifiedPhleboSession | null) => void;
}

type AuthTabMode = 'password' | 'otp';
type AuthViewMode = 'login' | 'forgot' | 'reset';
type ResetStage = 'verifying' | 'ready' | 'submitting' | 'success' | 'invalid';

const REQUIRED_ROLE = UserRole.PHLEBOTOMIST;

function parseInitialWebAuthState(): {
  view: AuthViewMode;
  oobCode: string;
  emailHint: string;
} {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return { view: 'login', oobCode: '', emailHint: '' };
  }
  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const oobCode = params.get('oobCode')?.trim() || '';
  const hasReset =
    path.startsWith('/reset-password') ||
    Boolean(oobCode) ||
    params.get('mode') === 'resetPassword';
  const emailHint = params.get('email')?.trim().toLowerCase() || '';

  if (hasReset) {
    return { view: 'reset', oobCode, emailHint };
  }
  if (path.startsWith('/forgot-password')) {
    return { view: 'forgot', oobCode: '', emailHint };
  }
  return { view: 'login', oobCode: '', emailHint: '' };
}

export function PhleboAuthGate({ onShowAlert, onAuthenticated }: PhleboAuthGateProps) {
  const initialRoute = useMemo(() => parseInitialWebAuthState(), []);
  const [authView, setAuthView] = useState<AuthViewMode>(initialRoute.view);
  const authViewRef = useRef<AuthViewMode>(initialRoute.view);

  const [authLoading, setAuthLoading] = useState(initialRoute.view === 'login');
  const [authTab, setAuthTab] = useState<AuthTabMode>('password');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Email OTP state
  const [otpEmail, setOtpEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);

  // Forgot Password state
  const [forgotEmail, setForgotEmail] = useState(initialRoute.emailHint);
  const [forgotCooldown, setForgotCooldown] = useState(0);
  const [forgotSentSummary, setForgotSentSummary] = useState<{
    email: string;
    role: UserRole;
    roleLabel: string;
  } | null>(null);

  // Reset Password state
  const [resetStage, setResetStage] = useState<ResetStage>('verifying');
  const [resetEmail, setResetEmail] = useState(initialRoute.emailHint);
  const [resetErrorReason, setResetErrorReason] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);

  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [inlineSuccess, setInlineSuccess] = useState<string | null>(null);

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
    if (authView !== 'reset') return;
    let cancelled = false;

    async function validateCode() {
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
        if (!cancelled) {
          setResetEmail(accountEmail.trim().toLowerCase());
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

    void validateCode();
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
    let color = '#EF4444';
    if (score >= 4) {
      label = 'Strong';
      color = '#10B981';
    } else if (score === 3) {
      label = 'Good';
      color = '#0EA5E9';
    } else if (score === 2) {
      label = 'Fair';
      color = '#F59E0B';
    } else if (newPassword.length > 0) {
      label = 'Weak';
      color = '#EF4444';
    }

    return {
      hasLength,
      hasUpper,
      hasLower,
      hasNumber,
      matches,
      score: newPassword.length === 0 ? 0 : Math.max(1, score),
      label,
      color,
    };
  }, [newPassword, confirmNewPassword]);

  const resolveWebPortalUrl = (role: UserRole): string => {
    if (role === UserRole.ADMIN) return PORTAL_URLS.ADMIN;
    if (role === UserRole.SMALL_LAB) return PORTAL_URLS.SMALL_LAB;
    if (role === UserRole.LARGE_LAB) return PORTAL_URLS.LARGE_LAB;
    return PORTAL_URLS.PORTAL;
  };

  async function rejectRoleMismatch(email: string, assignedRole: UserRole): Promise<void> {
    mismatchTriggeredRef.current = true;
    setRoleMismatch({ email, assignedRole });
    if (auth.currentUser) {
      await signOut(auth);
    }
    onAuthenticated(null);
    onShowAlert({
      variant: 'error',
      title: 'Wrong App for Your Role',
      message: `${email} is registered as "${ROLE_LABELS[assignedRole]}". Please sign in on the website portal instead of the Field Phlebotomist app.`,
      detail: `Account Role: ${ROLE_LABELS[assignedRole]} • Signed Out Automatically`,
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

    const tokenResult = await getIdTokenResult(user);
    const idToken = await user.getIdToken();
    const claimRole = tokenResult.claims?.role as UserRole | undefined;

    // 1. Authoritative backend API verification
    let apiProfile: UserProfile | null = null;
    try {
      const res = await fetch(`${API_BASE_URL}/auth/verify-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Platform': 'mobile',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          requiredRole: REQUIRED_ROLE,
          email,
          clientType: 'MOBILE',
        }),
      });

      const json = await res.json().catch(() => null);

      if (res.ok && json?.data) {
        apiProfile = json.data as UserProfile;
      } else if (res.status === 403 && json?.error?.code === 'ROLE_MISMATCH') {
        const assignedRole =
          (json.error?.details?.assignedRole as UserRole) || UserRole.SMALL_LAB;
        await rejectRoleMismatch(email, assignedRole);
        return;
      } else if (res.status === 403 && json?.error?.code === 'ACCOUNT_SUSPENDED') {
        await signOut(auth);
        onAuthenticated(null);
        onShowAlert({
          variant: 'error',
          title: 'Account Paused',
          message:
            json.error?.message ||
            `Your account (${email}) has been paused by Platform Admin.`,
        });
        return;
      } else if (res.status === 403 && json?.error?.code === 'USER_NOT_PROVISIONED') {
        await signOut(auth);
        onAuthenticated(null);
        const msg =
          json.error?.message ||
          `Your email (${email}) has not been added yet. Please ask Platform Admin (${ADMIN_LOGIN_EMAIL}) to create your Field Phlebotomist account first.`;
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
      if (apiProfile.role !== REQUIRED_ROLE) {
        await rejectRoleMismatch(email, apiProfile.role);
        return;
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

    // 2. Fallback: Direct directory + token claim lookup
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
      // Offline/rules fallback checked against claims below
    }

    if (dirProfile && dirProfile.isActive === false) {
      await signOut(auth);
      onAuthenticated(null);
      onShowAlert({
        variant: 'error',
        title: 'Account Paused',
        message: `Your account (${email}) is currently paused. Contact ${ADMIN_LOGIN_EMAIL}.`,
      });
      return;
    }

    const isRootAdmin = email === ADMIN_LOGIN_EMAIL.toLowerCase();
    const resolvedRole: UserRole | undefined =
      dirProfile?.role || claimRole || (isRootAdmin ? UserRole.ADMIN : undefined);

    if (!resolvedRole) {
      await signOut(auth);
      onAuthenticated(null);
      const msg = `Your email (${email}) has not been added yet. Please ask Platform Admin (${ADMIN_LOGIN_EMAIL}) to add your email for ${ROLE_LABELS[REQUIRED_ROLE]}.`;
      setInlineError(msg);
      onShowAlert({
        variant: 'error',
        title: 'Account Not Added Yet',
        message: msg,
        detail: `Required App Role: ${ROLE_LABELS[REQUIRED_ROLE]}`,
      });
      return;
    }

    if (resolvedRole !== REQUIRED_ROLE) {
      await rejectRoleMismatch(email, resolvedRole);
      return;
    }

    const now = new Date().toISOString();
    const finalProfile: UserProfile = {
      id: user.uid,
      email,
      displayName: dirProfile?.displayName || user.displayName || email.split('@')[0],
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
          message: (err as Error).message || 'Could not verify your Field Phlebotomist role.',
        });
      } finally {
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGoogleSignIn() {
    setInlineError(null);
    setInlineSuccess(null);

    if (Platform.OS !== 'web') {
      onShowAlert({
        variant: 'info',
        title: 'Use Email & Password or OTP on Phone',
        message:
          'Use your registered email with Password or 6-Digit Email OTP directly on your phone. Google quick sign-in works when opening the companion in a web browser.',
        detail: `Ask Platform Admin (${ADMIN_LOGIN_EMAIL}) if you need your login details.`,
      });
      return;
    }

    setAuthSubmitting(true);
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

  async function handlePasswordSignIn() {
    setInlineError(null);
    setInlineSuccess(null);
    if (!loginEmail.trim() || !loginPassword) {
      setInlineError('Enter both your registered email and password.');
      return;
    }

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
        msg = 'Password sign-in is not available right now. Please sign in using Email OTP.';
      } else if (
        fbErr.code === 'auth/invalid-credential' ||
        fbErr.code === 'auth/wrong-password' ||
        fbErr.code === 'auth/user-not-found'
      ) {
        msg = `Incorrect email or password for ${loginEmail.trim()}. Tap "Forgot / Set Password" or use Email OTP.`;
      }
      setInlineError(msg);
      onShowAlert({ variant: 'error', title: 'Sign In Unsuccessful', message: msg });
    } finally {
      setAuthSubmitting(false);
    }
  }

  function goToForgotView(emailHint?: string) {
    const clean = (emailHint ?? loginEmail).trim().toLowerCase();
    setForgotEmail(clean);
    setForgotSentSummary(null);
    setInlineError(null);
    setInlineSuccess(null);
    authViewRef.current = 'forgot';
    setAuthView('forgot');
  }

  function goToLoginView() {
    setInlineError(null);
    setInlineSuccess(null);
    setForgotSentSummary(null);
    authViewRef.current = 'login';
    setAuthView('login');
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.location.pathname !== '/' || window.location.search) {
        window.history.replaceState({}, '', '/');
      }
    }
    if (auth.currentUser) {
      setAuthLoading(true);
      void verifyFirebaseUserRole(auth.currentUser).finally(() => setAuthLoading(false));
    }
  }

  async function handleSendForgotEmail(targetEmail?: string) {
    setInlineError(null);
    setInlineSuccess(null);
    const normalized = (targetEmail ?? forgotEmail).trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
      const msg = 'Enter your registered Field Phlebotomist email address.';
      setInlineError(msg);
      onShowAlert({
        variant: 'warning',
        title: 'Email Required',
        message: msg,
      });
      return;
    }

    setAuthSubmitting(true);
    try {
      const portalOrigin =
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? window.location.origin
          : PORTAL_URLS.PORTAL;

      const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Platform': 'mobile',
        },
        body: JSON.stringify({
          email: normalized,
          origin: portalOrigin,
          portalRole: REQUIRED_ROLE,
          clientType: 'MOBILE',
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const errCode = json?.error?.code;
        const errMsg =
          json?.error?.message ||
          'Unable to send a password reset link right now. Please check your email and try again.';
        setInlineError(errMsg);
        onShowAlert({
          variant: 'error',
          title:
            errCode === 'USER_NOT_PROVISIONED'
              ? 'Email Not Added Yet'
              : errCode === 'ACCOUNT_SUSPENDED'
                ? 'Account Paused'
                : 'Unable to Send Reset Link',
          message: errMsg,
        });
        return;
      }

      const assignedRole = (json?.data?.role as UserRole) || REQUIRED_ROLE;
      const roleLabel =
        (json?.data?.roleLabel as string) || ROLE_LABELS[assignedRole] || 'Field Phlebotomist';

      setForgotSentSummary({ email: normalized, role: assignedRole, roleLabel });
      setForgotCooldown(60);
      onShowAlert({
        variant: 'success',
        title: 'Password Reset Email Sent',
        message: `We emailed a secure reset link to ${normalized}. Tap the link in your inbox to set a new password, then return here to sign in.`,
      });
    } catch {
      const msg =
        'Unable to reach the password recovery service right now. Please check your internet connection or use Email OTP.';
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

  async function handleConfirmNewPassword() {
    setInlineError(null);
    if (!passwordRules.hasLength) {
      setInlineError('Your new password must be at least 8 characters long.');
      return;
    }
    if (!passwordRules.hasUpper || !passwordRules.hasLower || !passwordRules.hasNumber) {
      setInlineError(
        'Include at least one uppercase letter, one lowercase letter, and one number.'
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
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/reset-password?role=PHLEBOTOMIST&status=done');
      }
      setResetStage('success');
      onShowAlert({
        variant: 'success',
        title: 'Password Updated',
        message: `Your password for ${resetEmail} has been updated. You can sign in now.`,
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

  async function handleSendOtp() {
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
          'X-Client-Platform': 'mobile',
        },
        body: JSON.stringify({
          email: normalized,
          portalRole: REQUIRED_ROLE,
          clientType: 'MOBILE',
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const errCode = json?.error?.code;
        if (errCode === 'ROLE_MISMATCH' && json?.error?.details?.assignedRole) {
          const assignedRole = json.error.details.assignedRole as UserRole;
          setRoleMismatch({ email: normalized, assignedRole });
          const msg = `${normalized} is registered as "${ROLE_LABELS[assignedRole]}" and should sign in on the website portal instead of this mobile app.`;
          setInlineError(msg);
          onShowAlert({
            variant: 'error',
            title: 'Wrong App for Your Role',
            message: msg,
            detail: `Account Role: ${ROLE_LABELS[assignedRole]}`,
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
        'Unable to send the verification code right now. Please check your internet connection or try Password sign-in.';
      setInlineError(msg);
      onShowAlert({ variant: 'warning', title: 'Email Service Unavailable', message: msg });
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleVerifyOtp() {
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
          'X-Client-Platform': 'mobile',
        },
        body: JSON.stringify({
          email: normalized,
          otp: otpCode.trim(),
          portalRole: REQUIRED_ROLE,
          clientType: 'MOBILE',
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const errMsg = json?.error?.message || 'OTP check failed.';
        setInlineError(errMsg);
        onShowAlert({ variant: 'error', title: 'Invalid OTP', message: errMsg });
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
          'Email OTP verified, but we could not finish signing you in. Please try signing in with your password.',
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
      <View style={styles.loadingWrap}>
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color="#0D9488" />
          <Text style={styles.loadingTitle}>{LABSETU_THEME.brand.name} Mobile App</Text>
          <Text style={styles.loadingSub}>
            Checking your Field Phlebotomist access...
          </Text>
        </View>
      </View>
    );
  }

  if (authView === 'forgot') {
    return (
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.authCard}>
          <View style={styles.banner}>
            <View style={styles.brandBadge}>
              <Text style={styles.brandIcon}>🔑</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>
                {LABSETU_THEME.brand.name} • Password Recovery
              </Text>
              <Text style={styles.bannerSub}>
                Reset or set up your Phlebo App password
              </Text>
            </View>
          </View>

          <View style={styles.cardBody}>
            {forgotSentSummary ? (
              <View>
                <View style={styles.statusBoxSent}>
                  <Text style={styles.statusEmoji}>✉️</Text>
                  <Text style={styles.statusTitleSuccess}>Reset Link Sent</Text>
                  <Text style={styles.statusCopy}>
                    We emailed a secure password reset link to{' '}
                    <Text style={{ fontWeight: '800', color: '#0F172A' }}>
                      {forgotSentSummary.email}
                    </Text>
                    . Tap the link inside your inbox to set a new password, then return here to sign
                    in.
                  </Text>
                  <View style={styles.rolePill}>
                    <Text style={styles.rolePillText}>
                      Registered Role: {forgotSentSummary.roleLabel}
                    </Text>
                  </View>
                </View>

                <View style={styles.tipBox}>
                  <Text style={styles.tipText}>
                    Didn&apos;t see it? Check Spam or Promotions for an email titled &ldquo;Reset
                    Your LabSetu Password&rdquo;. Links remain active for 60 minutes.
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    { marginBottom: 10 },
                    (forgotCooldown > 0 || authSubmitting) && { opacity: 0.6 },
                  ]}
                  disabled={forgotCooldown > 0 || authSubmitting}
                  onPress={() => void handleSendForgotEmail(forgotSentSummary.email)}
                >
                  <Text style={styles.primaryBtnText}>
                    {authSubmitting
                      ? 'Sending Again...'
                      : forgotCooldown > 0
                        ? `Resend Link in ${forgotCooldown}s`
                        : 'Resend Reset Link'}
                  </Text>
                </TouchableOpacity>

                <View style={styles.otpFooterRow}>
                  <TouchableOpacity
                    onPress={() => {
                      setForgotSentSummary(null);
                      setInlineError(null);
                    }}
                  >
                    <Text style={styles.linkMuted}>Try Different Email</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={goToLoginView}>
                    <Text style={styles.linkMuted}>← Back to Sign In</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View>
                <View style={styles.stepPill}>
                  <Text style={styles.stepPillText}>Step 1 of 2 • Request Reset Link</Text>
                </View>

                <Text style={styles.helperCopy}>
                  Enter your Field Phlebotomist email added by Platform Admin ({ADMIN_LOGIN_EMAIL}).
                  We will send a secure password setup link to your inbox.
                </Text>

                {inlineError ? (
                  <View style={styles.errorBanner}>
                    <Text style={styles.errorBannerText}>{inlineError}</Text>
                  </View>
                ) : null}

                <Text style={styles.inputLabel}>Registered Email Address</Text>
                <TextInput
                  style={styles.input}
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                  placeholder="Enter your registered email"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                  keyboardType="email-address"
                />

                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    { marginBottom: 12 },
                    authSubmitting && { opacity: 0.65 },
                  ]}
                  onPress={() => void handleSendForgotEmail()}
                  disabled={authSubmitting}
                >
                  <Text style={styles.primaryBtnText}>
                    {authSubmitting ? 'Sending Link...' : 'Send Password Reset Link →'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.secondaryBtn} onPress={goToLoginView}>
                  <Text style={styles.secondaryBtnText}>← Back to Sign In</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    );
  }

  if (authView === 'reset') {
    return (
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.authCard}>
          <View style={styles.banner}>
            <View style={styles.brandBadge}>
              <Text style={styles.brandIcon}>🔐</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>
                {LABSETU_THEME.brand.name} • Create New Password
              </Text>
              <Text style={styles.bannerSub}>Field Phlebotomist Account Recovery</Text>
            </View>
          </View>

          <View style={styles.cardBody}>
            {resetStage === 'verifying' ? (
              <View style={styles.statusBoxNeutral}>
                <ActivityIndicator size="small" color="#0D9488" />
                <Text style={[styles.statusTitleNeutral, { marginTop: 10 }]}>
                  Checking Your Security Link...
                </Text>
                <Text style={styles.statusCopy}>
                  Please wait while we verify your reset link.
                </Text>
              </View>
            ) : null}

            {resetStage === 'invalid' ? (
              <View>
                <View style={styles.statusBoxError}>
                  <Text style={styles.statusEmoji}>⚠️</Text>
                  <Text style={styles.statusTitleError}>Reset Link Expired or Invalid</Text>
                  <Text style={styles.statusCopy}>{resetErrorReason}</Text>
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, { marginBottom: 10 }]}
                  onPress={() => goToForgotView(resetEmail)}
                >
                  <Text style={styles.primaryBtnText}>Request a New Reset Link →</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.secondaryBtn} onPress={goToLoginView}>
                  <Text style={styles.secondaryBtnText}>← Back to Sign In</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {resetStage === 'success' ? (
              <View>
                <View style={styles.statusBoxSent}>
                  <Text style={styles.statusEmoji}>✓</Text>
                  <Text style={styles.statusTitleSuccess}>Password Updated Successfully</Text>
                  <Text style={styles.statusCopy}>
                    Your new password for{' '}
                    <Text style={{ fontWeight: '800', color: '#0F172A' }}>{resetEmail}</Text> is
                    active right away.
                  </Text>
                </View>

                <TouchableOpacity style={styles.primaryBtn} onPress={goToLoginView}>
                  <Text style={styles.primaryBtnText}>Sign In to Phlebo App →</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {resetStage === 'ready' || resetStage === 'submitting' ? (
              <View>
                <View style={styles.stepPill}>
                  <Text style={styles.stepPillText}>Step 2 of 2 • Choose New Password</Text>
                </View>

                <View style={styles.roleReqBanner}>
                  <Text style={styles.roleReqLabel}>Account:</Text>
                  <Text style={styles.roleReqValue} numberOfLines={1}>
                    {resetEmail}
                  </Text>
                </View>

                {inlineError ? (
                  <View style={styles.errorBanner}>
                    <Text style={styles.errorBannerText}>{inlineError}</Text>
                  </View>
                ) : null}

                <Text style={styles.inputLabel}>New Password</Text>
                <View style={styles.passwordWrap}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0, borderWidth: 0 }]}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Create a strong password"
                    placeholderTextColor="#94A3B8"
                    secureTextEntry={!showNewPassword}
                  />
                  <TouchableOpacity
                    onPress={() => setShowNewPassword(!showNewPassword)}
                    style={styles.showPassBtn}
                  >
                    <Text style={styles.showPassText}>
                      {showNewPassword ? 'Hide' : 'Show'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.strengthWrap}>
                  <View style={styles.strengthHeader}>
                    <Text style={styles.strengthLabel}>Password Strength</Text>
                    <Text style={[styles.strengthValue, { color: passwordRules.color }]}>
                      {passwordRules.label}
                    </Text>
                  </View>
                  <View style={styles.strengthBars}>
                    {[1, 2, 3, 4].map((slot) => (
                      <View
                        key={slot}
                        style={[
                          styles.strengthSegment,
                          passwordRules.score >= slot && { backgroundColor: passwordRules.color },
                        ]}
                      />
                    ))}
                  </View>
                </View>

                <Text style={styles.inputLabel}>Confirm New Password</Text>
                <View style={styles.passwordWrap}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0, borderWidth: 0 }]}
                    value={confirmNewPassword}
                    onChangeText={setConfirmNewPassword}
                    placeholder="Re-enter your new password"
                    placeholderTextColor="#94A3B8"
                    secureTextEntry={!showConfirmNewPassword}
                  />
                  <TouchableOpacity
                    onPress={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                    style={styles.showPassBtn}
                  >
                    <Text style={styles.showPassText}>
                      {showConfirmNewPassword ? 'Hide' : 'Show'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.reqBox}>
                  {[
                    { ok: passwordRules.hasLength, text: 'At least 8 characters' },
                    { ok: passwordRules.hasUpper, text: 'One uppercase letter (A-Z)' },
                    { ok: passwordRules.hasLower, text: 'One lowercase letter (a-z)' },
                    { ok: passwordRules.hasNumber, text: 'One number (0-9)' },
                    { ok: passwordRules.matches, text: 'Passwords match' },
                  ].map((item) => (
                    <Text
                      key={item.text}
                      style={[styles.reqItem, item.ok && styles.reqItemMet]}
                    >
                      {item.ok ? '✓' : '•'} {item.text}
                    </Text>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, resetStage === 'submitting' && { opacity: 0.65 }]}
                  disabled={resetStage === 'submitting'}
                  onPress={() => void handleConfirmNewPassword()}
                >
                  <Text style={styles.primaryBtnText}>
                    {resetStage === 'submitting' ? 'Saving Password...' : 'Save New Password'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
    );
  }

  if (roleMismatch) {
    const webPortalUrl = resolveWebPortalUrl(roleMismatch.assignedRole);
    return (
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.authCard}>
          <View style={styles.banner}>
            <View style={styles.brandBadge}>
              <Text style={styles.brandIcon}>🛡️</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>Wrong App Selected</Text>
              <Text style={styles.bannerSub}>Signed Out • Use Website Portal</Text>
            </View>
          </View>

          <View style={styles.cardBody}>
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>
                {roleMismatch.email} is not registered as a {ROLE_LABELS[REQUIRED_ROLE]}.
              </Text>
            </View>

            <View style={styles.mismatchBox}>
              <View style={styles.mismatchRow}>
                <Text style={styles.mismatchLabel}>Account Role:</Text>
                <View style={styles.pillBlue}>
                  <Text style={styles.pillBlueText}>
                    {ROLE_LABELS[roleMismatch.assignedRole]}
                  </Text>
                </View>
              </View>
              <View style={styles.mismatchRow}>
                <Text style={styles.mismatchLabel}>Required Here:</Text>
                <View style={styles.pillRed}>
                  <Text style={styles.pillRedText}>{ROLE_LABELS[REQUIRED_ROLE]}</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, { marginBottom: 10 }]}
              onPress={() => void Linking.openURL(webPortalUrl)}
            >
              <Text style={styles.primaryBtnText}>
                Open {ROLE_LABELS[roleMismatch.assignedRole]} Portal →
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryBtn, { marginBottom: 10 }]}
              onPress={() => void Linking.openURL(PORTAL_URLS.PORTAL)}
            >
              <Text style={styles.secondaryBtnText}>← Open LabSetu Website</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={async () => {
                setRoleMismatch(null);
                setOtpSent(false);
                if (auth.currentUser) await signOut(auth);
              }}
            >
              <Text style={styles.secondaryBtnText}>Use Different Account</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContainer}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.authCard}>
        {/* Dark Spruce Top Brand Banner */}
        <View style={styles.banner}>
          <View style={styles.brandBadge}>
            <Text style={styles.brandIcon}>🧪</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>{LABSETU_THEME.brand.name} • Phlebo App</Text>
            <Text style={styles.bannerSub}>Field Collection &amp; Cold-Chain Logistics</Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.roleReqBanner}>
            <Text style={styles.roleReqLabel}>App Role:</Text>
            <Text style={styles.roleReqValue}>{ROLE_LABELS[REQUIRED_ROLE]}</Text>
          </View>

          <Text style={styles.helperCopy}>
            Only Field Phlebotomist accounts added by Platform Admin ({ADMIN_LOGIN_EMAIL})
            can sign in to this mobile app.
          </Text>

          {/* Method 1: Google Sign-In */}
          <TouchableOpacity
            style={styles.googleBtn}
            onPress={() => void handleGoogleSignIn()}
            disabled={authSubmitting}
          >
            <Text style={styles.googleMark}>G</Text>
            <Text style={styles.googleBtnText}>Continue with Google</Text>
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR SIGN IN WITH EMAIL</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Segmented Tabs: Password vs Email OTP */}
          <View style={styles.segmentedTabs}>
            <TouchableOpacity
              style={[
                styles.segmentTab,
                authTab === 'password' && styles.segmentTabActive,
              ]}
              onPress={() => {
                setAuthTab('password');
                setInlineError(null);
              }}
            >
              <Text
                style={[
                  styles.segmentTabText,
                  authTab === 'password' && styles.segmentTabTextActive,
                ]}
              >
                Email &amp; Password
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.segmentTab, authTab === 'otp' && styles.segmentTabActive]}
              onPress={() => {
                setAuthTab('otp');
                setInlineError(null);
              }}
            >
              <Text
                style={[
                  styles.segmentTabText,
                  authTab === 'otp' && styles.segmentTabTextActive,
                ]}
              >
                Email OTP
              </Text>
            </TouchableOpacity>
          </View>

          {inlineError ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{inlineError}</Text>
            </View>
          ) : null}

          {inlineSuccess ? (
            <View style={styles.successBanner}>
              <Text style={styles.successBannerText}>{inlineSuccess}</Text>
            </View>
          ) : null}

          {authTab === 'password' ? (
            <View>
              <Text style={styles.inputLabel}>Email Address</Text>
              <TextInput
                style={styles.input}
                value={loginEmail}
                onChangeText={setLoginEmail}
                placeholder="Enter your registered email"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <Text style={styles.inputLabel}>Password</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0, borderWidth: 0 }]}
                  value={loginPassword}
                  onChangeText={setLoginPassword}
                  placeholder="Enter your password"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.showPassBtn}
                >
                  <Text style={styles.showPassText}>{showPassword ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.linkRow}>
                <TouchableOpacity onPress={() => goToForgotView(loginEmail.trim())}>
                  <Text style={styles.linkMuted}>Forgot / Set Password</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, authSubmitting && { opacity: 0.65 }]}
                onPress={() => void handlePasswordSignIn()}
                disabled={authSubmitting}
              >
                <Text style={styles.primaryBtnText}>
                  {authSubmitting ? 'Verifying...' : 'Sign In as Field Phlebotomist'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <Text style={styles.inputLabel}>Registered Email Address</Text>
              <TextInput
                style={[styles.input, otpSent && { backgroundColor: '#F1F5F9' }]}
                value={otpEmail}
                onChangeText={setOtpEmail}
                placeholder="Enter your registered email"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!otpSent}
              />

              {otpSent ? (
                <>
                  <Text style={styles.inputLabel}>6-Digit Verification OTP</Text>
                  <TextInput
                    style={[styles.input, styles.otpInput]}
                    value={otpCode}
                    onChangeText={(val) => setOtpCode(val.replace(/\D/g, ''))}
                    placeholder="••••••"
                    placeholderTextColor="#94A3B8"
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </>
              ) : null}

              <TouchableOpacity
                style={[styles.primaryBtn, authSubmitting && { opacity: 0.65 }]}
                onPress={() => void (otpSent ? handleVerifyOtp() : handleSendOtp())}
                disabled={authSubmitting}
              >
                <Text style={styles.primaryBtnText}>
                  {authSubmitting
                    ? 'Please wait...'
                    : otpSent
                      ? 'Verify OTP & Open App'
                      : 'Send 6-Digit Email OTP'}
                </Text>
              </TouchableOpacity>

              {otpSent ? (
                <View style={styles.otpFooterRow}>
                  <TouchableOpacity
                    onPress={() => {
                      setOtpSent(false);
                      setOtpCode('');
                      setInlineSuccess(null);
                    }}
                  >
                    <Text style={styles.linkMuted}>Change Email</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    disabled={otpCooldown > 0 || authSubmitting}
                    onPress={() => void handleSendOtp()}
                  >
                    <Text style={styles.linkMuted}>
                      {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : 'Resend OTP'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    backgroundColor: '#062226',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 36,
    alignItems: 'center',
  },
  loadingTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 14,
  },
  loadingSub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
  },
  scrollContainer: {
    flexGrow: 1,
    backgroundColor: '#062226',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  authCard: {
    width: '100%',
    maxWidth: 430,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 10,
  },
  banner: {
    backgroundColor: '#062226',
    paddingHorizontal: 20,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#0D9488',
  },
  brandBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandIcon: {
    fontSize: 22,
  },
  bannerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  bannerSub: {
    color: '#7DD3FC',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  cardBody: {
    padding: 20,
  },
  roleReqBanner: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  roleReqLabel: {
    fontSize: 12,
    color: '#0F766E',
    fontWeight: '600',
  },
  roleReqValue: {
    fontSize: 12,
    color: '#062226',
    fontWeight: '800',
  },
  helperCopy: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
    marginBottom: 14,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 11,
    paddingVertical: 12,
  },
  googleMark: {
    fontSize: 16,
    fontWeight: '800',
    color: '#2563EB',
  },
  googleBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  segmentedTabs: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 11,
    padding: 4,
    marginBottom: 14,
  },
  segmentTab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  segmentTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  segmentTabTextActive: {
    color: '#0F766E',
    fontWeight: '700',
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  errorBannerText: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  successBanner: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  successBannerText: {
    color: '#15803D',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: '#0F172A',
    marginBottom: 12,
  },
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  showPassBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  showPassText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0D9488',
  },
  otpInput: {
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 6,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 14,
  },
  linkMuted: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0D9488',
  },
  otpFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  primaryBtn: {
    backgroundColor: '#0D9488',
    borderRadius: 11,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 11,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },
  mismatchBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    gap: 10,
    marginBottom: 16,
  },
  mismatchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mismatchLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  pillBlue: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pillBlueText: {
    color: '#1D4ED8',
    fontSize: 11,
    fontWeight: '700',
  },
  pillRed: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pillRedText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '700',
  },
  stepPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 12,
  },
  stepPillText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '700',
  },
  rolePill: {
    marginTop: 10,
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  rolePillText: {
    color: '#0F766E',
    fontSize: 12,
    fontWeight: '700',
  },
  statusBoxSent: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginBottom: 14,
  },
  statusBoxError: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginBottom: 14,
  },
  statusBoxNeutral: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
  },
  statusEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  statusTitleSuccess: {
    fontSize: 16,
    fontWeight: '800',
    color: '#065F46',
    marginBottom: 6,
  },
  statusTitleError: {
    fontSize: 16,
    fontWeight: '800',
    color: '#B91C1C',
    marginBottom: 6,
  },
  statusTitleNeutral: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  statusCopy: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 19,
    textAlign: 'center',
  },
  tipBox: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    padding: 11,
    marginBottom: 14,
  },
  tipText: {
    fontSize: 12,
    color: '#92400E',
    lineHeight: 17,
  },
  strengthWrap: {
    marginBottom: 12,
  },
  strengthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  strengthValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  strengthBars: {
    flexDirection: 'row',
    gap: 6,
  },
  strengthSegment: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
  },
  reqBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    gap: 6,
    marginTop: 4,
    marginBottom: 16,
  },
  reqItem: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  reqItemMet: {
    color: '#047857',
    fontWeight: '700',
  },
});
