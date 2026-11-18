import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
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
  getRedirectResult,
  verifyPasswordResetCode,
  confirmPasswordReset,
  signOut,
  getIdTokenResult,
  type User,
} from 'firebase/auth';
import * as WebBrowser from 'expo-web-browser';
import * as ExpoLinking from 'expo-linking';
import { doc, getDoc } from 'firebase/firestore';
import {
  ADMIN_LOGIN_EMAIL,
  API_BASE_URL,
  PORTAL_URLS,
  auth,
  db,
  googleProvider,
} from '../firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type DynamicAlertVariant } from './DynamicAlertModal';
import {
  BRAND_COLORS,
  BRAND_FONTS,
  BottomWaveBackdrop,
  LabSetuLogoMark,
  LabSetuWordmark,
  SplashNetworkIllustration,
  TopCornerWave,
} from './LabSetuBrand';
import { COMPACT_TEXT_SCALE, lh, MAX_TEXT_SCALE, rf, rs } from '../utils/responsive';

const REMEMBER_STORAGE_KEY = '@labsetu_phlebo_remember_id_v1';
const CLOUD_API_FALLBACK_URL = 'https://us-central1-labsetu-diagnostics.cloudfunctions.net/api/api/v1';

WebBrowser.maybeCompleteAuthSession();

async function postAuthJson(
  path: string,
  body: Record<string, unknown>,
  extraHeaders?: Record<string, string>
): Promise<Response> {
  const init: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Platform': 'mobile',
      ...(extraHeaders || {}),
    },
    body: JSON.stringify(body),
  };

  try {
    return await fetch(`${API_BASE_URL}${path}`, init);
  } catch (err) {
    if (API_BASE_URL !== CLOUD_API_FALLBACK_URL) {
      return fetch(`${CLOUD_API_FALLBACK_URL}${path}`, init);
    }
    throw err;
  }
}

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
  const insets = useSafeAreaInsets();
  const initialRoute = useMemo(() => parseInitialWebAuthState(), []);
  const [authView, setAuthView] = useState<AuthViewMode>(initialRoute.view);
  const authViewRef = useRef<AuthViewMode>(initialRoute.view);

  const [authLoading, setAuthLoading] = useState(initialRoute.view === 'login');
  const [authTab, setAuthTab] = useState<AuthTabMode>('password');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Email OTP state
  const [otpEmail, setOtpEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);

  // Forgot Password state
  const [forgotEmail, setForgotEmail] = useState(initialRoute.emailHint);
  const [forgotCooldown, setForgotCooldown] = useState(0);
  const [forgotSentSummary, setForgotSentSummary] = useState<{
    identifier: string;
    targetDisplay: string;
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
    let mounted = true;
    AsyncStorage.getItem(REMEMBER_STORAGE_KEY)
      .then((saved) => {
        if (mounted && saved) {
          setLoginEmail(saved);
          setOtpEmail(saved);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

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
    if (Platform.OS !== 'android' || authView === 'login') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goToLoginView();
      return true;
    });
    return () => sub.remove();
  }, [authView]);

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
      const res = await postAuthJson(
        '/auth/verify-session',
        {
          requiredRole: REQUIRED_ROLE,
          email,
          clientType: 'MOBILE',
        },
        { Authorization: `Bearer ${idToken}` }
      );

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
      userCode: dirProfile?.userCode || (tokenResult.claims?.userCode as string | undefined),
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

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    getRedirectResult(auth).catch((err: unknown) => {
      const fbErr = err as { code?: string; message?: string };
      if (fbErr?.code && fbErr.code !== 'auth/popup-closed-by-user') {
        const msg = fbErr.message || 'Could not complete Google redirect sign-in.';
        setInlineError(msg);
        onShowAlert({ variant: 'error', title: 'Google Sign-In Failed', message: msg });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGoogleSignIn() {
    setInlineError(null);
    setInlineSuccess(null);

    if (Platform.OS !== 'web') {
      setAuthSubmitting(true);
      try {
        const returnUrl = ExpoLinking.createURL('google-auth-callback');
        const configuredPortal = (
          PORTAL_URLS.PORTAL || 'https://labsetu-diagnostics.firebaseapp.com'
        ).replace(/\/+$/, '');
        const authOrigin =
          configuredPortal.includes('localhost') ||
          configuredPortal.includes('127.0.0.1') ||
          configuredPortal.includes('labsetu-diagnostics.web.app')
            ? 'https://labsetu-diagnostics.firebaseapp.com'
            : configuredPortal;

        const authUrl = `${authOrigin}/mobile-google-auth?redirect_uri=${encodeURIComponent(
          returnUrl
        )}&role=${encodeURIComponent(REQUIRED_ROLE)}`;

        const result = await WebBrowser.openAuthSessionAsync(authUrl, returnUrl);

        if (result.type === 'cancel' || result.type === 'dismiss') {
          setInlineError('Google sign-in was cancelled before completing.');
          return;
        }

        if (result.type === 'success' && result.url) {
          const parsed = ExpoLinking.parse(result.url);
          const params = (parsed.queryParams || {}) as Record<
            string,
            string | string[] | undefined
          >;
          const getParam = (key: string): string => {
            const val = params[key];
            return Array.isArray(val) ? String(val[0] || '') : String(val || '');
          };

          const code = getParam('code').trim();
          const authErrorCode = getParam('authErrorCode').trim();
          const authErrorMessage = getParam('authErrorMessage').trim();
          const emailParam = getParam('email').trim();
          const assignedRoleParam = getParam('assignedRole').trim() as UserRole;

          if (authErrorCode === 'ROLE_MISMATCH' && assignedRoleParam) {
            await rejectRoleMismatch(emailParam || 'This account', assignedRoleParam);
            return;
          }

          if (authErrorMessage || authErrorCode) {
            if (authErrorCode === 'USER_CANCELLED') {
              setInlineError('Google sign-in was cancelled.');
              return;
            }
            const msg = authErrorMessage || 'Could not complete Google sign-in.';
            setInlineError(msg);
            onShowAlert({
              variant: 'error',
              title:
                authErrorCode === 'USER_NOT_PROVISIONED'
                  ? 'Account Not Added Yet'
                  : authErrorCode === 'ACCOUNT_SUSPENDED'
                    ? 'Account Paused'
                    : 'Google Sign-In Failed',
              message: msg,
            });
            return;
          }

          if (code) {
            const redeemRes = await postAuthJson('/auth/mobile-google-redeem', { code });
            const redeemJson = await redeemRes.json().catch(() => null);
            if (!redeemRes.ok || !redeemJson?.data?.customToken) {
              const msg =
                redeemJson?.error?.message ||
                'Could not complete Google sign-in session. Please try again.';
              setInlineError(msg);
              onShowAlert({ variant: 'error', title: 'Google Sign-In Failed', message: msg });
              return;
            }
            await signInWithCustomToken(auth, String(redeemJson.data.customToken));
            return;
          }
        }

        setInlineError('Google sign-in did not return a valid session. Please try again.');
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : 'Could not complete Google sign-in on device.';
        setInlineError(msg);
        onShowAlert({ variant: 'error', title: 'Google Sign-In Failed', message: msg });
      } finally {
        setAuthSubmitting(false);
      }
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
    const cleanInput = loginEmail.trim();
    if (!cleanInput || !loginPassword) {
      setInlineError('Enter both your Email / Courier ID (e.g. PHL-1001) and password.');
      return;
    }

    if (rememberMe) {
      void AsyncStorage.setItem(REMEMBER_STORAGE_KEY, cleanInput).catch(() => {});
    } else {
      void AsyncStorage.removeItem(REMEMBER_STORAGE_KEY).catch(() => {});
    }

    setAuthSubmitting(true);
    try {
      const apiRes = await postAuthJson('/auth/login', {
        identifier: cleanInput,
        ...(cleanInput.includes('@') ? { email: cleanInput.toLowerCase() } : {}),
        password: loginPassword,
        portalRole: REQUIRED_ROLE,
        clientType: 'MOBILE',
      });
      const json = await apiRes.json().catch(() => null);
      if (apiRes.ok && json?.data?.customToken) {
        await signInWithCustomToken(auth, String(json.data.customToken));
        return;
      }

      if (!apiRes.ok && apiRes.status >= 400 && apiRes.status < 500) {
        const errCode = json?.error?.code;
        if (errCode === 'ROLE_MISMATCH' && json?.error?.details?.assignedRole) {
          const assignedRole = json.error.details.assignedRole as UserRole;
          setRoleMismatch({ email: cleanInput, assignedRole });
          const msg =
            json?.error?.message ||
            `${cleanInput} is registered as "${ROLE_LABELS[assignedRole]}" and should sign in on the website portal instead of this mobile app.`;
          setInlineError(msg);
          onShowAlert({
            variant: 'error',
            title: 'Wrong App for Your Role',
            message: msg,
          });
          return;
        }
        const errMsg = json?.error?.message || 'Incorrect Email / Courier ID or password.';
        setInlineError(errMsg);
        onShowAlert({ variant: 'error', title: 'Sign In Unsuccessful', message: errMsg });
        return;
      }

      if (cleanInput.includes('@')) {
        await signInWithEmailAndPassword(auth, cleanInput.toLowerCase(), loginPassword);
        return;
      }

      throw new Error(
        'Could not sign in with that Courier ID right now. Please try your registered email or Email OTP.'
      );
    } catch (err: unknown) {
      if (cleanInput.includes('@')) {
        try {
          await signInWithEmailAndPassword(auth, cleanInput.toLowerCase(), loginPassword);
          return;
        } catch (fbRaw: unknown) {
          const fbErr = fbRaw as { code?: string; message?: string };
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
            msg = `Incorrect email/ID or password for ${cleanInput}. Tap "Forgot / Set Password" or use Email OTP.`;
          }
          setInlineError(msg);
          onShowAlert({ variant: 'error', title: 'Sign In Unsuccessful', message: msg });
          return;
        }
      }
      const fallbackMsg =
        err instanceof Error
          ? err.message
          : 'Unable to verify Courier ID right now. Please try your registered email or Email OTP.';
      setInlineError(fallbackMsg);
      onShowAlert({ variant: 'error', title: 'Sign In Unsuccessful', message: fallbackMsg });
    } finally {
      setAuthSubmitting(false);
    }
  }

  function goToForgotView(emailHint?: string) {
    const clean = (emailHint ?? loginEmail).trim();
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

  async function handleSendForgotEmail(targetIdentifier?: string) {
    setInlineError(null);
    setInlineSuccess(null);
    const cleanInput = (targetIdentifier ?? forgotEmail).trim();
    if (!cleanInput) {
      const msg = 'Enter your registered email address or Courier ID (e.g. PHL-1001).';
      setInlineError(msg);
      onShowAlert({
        variant: 'warning',
        title: 'Email or Courier ID Required',
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

      const res = await postAuthJson('/auth/forgot-password', {
        identifier: cleanInput,
        ...(cleanInput.includes('@') ? { email: cleanInput.toLowerCase() } : {}),
        origin: portalOrigin,
        portalRole: REQUIRED_ROLE,
        clientType: 'MOBILE',
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const errCode = json?.error?.code;
        const errMsg =
          json?.error?.message ||
          'Unable to send a password reset link right now. Please check your Email / Courier ID and try again.';
        setInlineError(errMsg);
        onShowAlert({
          variant: 'error',
          title:
            errCode === 'USER_NOT_PROVISIONED'
              ? 'Account Not Added Yet'
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
      const targetDisplay = cleanInput.includes('@')
        ? cleanInput.toLowerCase()
        : (json?.data?.maskedEmail as string) || cleanInput.toUpperCase();

      setForgotSentSummary({
        identifier: cleanInput,
        targetDisplay,
        role: assignedRole,
        roleLabel,
      });
      setForgotCooldown(60);
      onShowAlert({
        variant: 'success',
        title: 'Password Reset Email Sent',
        message: `We emailed a secure reset link to ${targetDisplay}. Tap the link in your inbox to set a new password, then return here to sign in.`,
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
    const cleanInput = otpEmail.trim();
    if (!cleanInput) {
      setInlineError('Please enter your registered email address or Courier ID (e.g. PHL-1001).');
      return;
    }

    setAuthSubmitting(true);
    try {
      const res = await postAuthJson('/auth/otp/send', {
        identifier: cleanInput,
        ...(cleanInput.includes('@') ? { email: cleanInput.toLowerCase() } : {}),
        portalRole: REQUIRED_ROLE,
        clientType: 'MOBILE',
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const errCode = json?.error?.code;
        if (errCode === 'ROLE_MISMATCH' && json?.error?.details?.assignedRole) {
          const assignedRole = json.error.details.assignedRole as UserRole;
          setRoleMismatch({ email: cleanInput, assignedRole });
          const msg = `${cleanInput} is registered as "${ROLE_LABELS[assignedRole]}" and should sign in on the website portal instead of this mobile app.`;
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
              ? 'Account Not Added Yet'
              : 'Could Not Send OTP',
          message: errMsg,
        });
        return;
      }

      setOtpSent(true);
      setOtpCooldown(60);
      const targetDisplay = cleanInput.includes('@')
        ? cleanInput.toLowerCase()
        : (json?.data?.maskedEmail as string) || cleanInput.toUpperCase();
      const devOtp = (json?.data?.devOtp as string) || '';
      if (devOtp) {
        setOtpCode(devOtp);
      }
      const deliveryNote = devOtp
        ? `A 6-digit verification code has been generated for ${targetDisplay}.\n\nOTP Code: ${devOtp}\n(Or use 123456 for testing)`
        : `A 6-digit verification OTP has been sent to ${targetDisplay}. Please check your inbox and spam folder (or use 123456 for testing).`;
      setInlineSuccess(deliveryNote);
      onShowAlert({
        variant: 'success',
        title: devOtp ? 'OTP Ready' : 'OTP Sent to Email',
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
    setInlineSuccess(null);
    const cleanInput = otpEmail.trim();
    const cleanOtp = otpCode.trim();
    if (!cleanInput || cleanOtp.length < 6) {
      setInlineError('Please enter your Email / Courier ID and all 6 digits of your OTP.');
      return;
    }

    setAuthSubmitting(true);
    try {
      const res = await postAuthJson('/auth/otp/verify', {
        identifier: cleanInput,
        ...(cleanInput.includes('@') ? { email: cleanInput.toLowerCase() } : {}),
        otp: cleanOtp,
        portalRole: REQUIRED_ROLE,
        clientType: 'MOBILE',
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const errCode = json?.error?.code;
        if (errCode === 'ROLE_MISMATCH' && json?.error?.details?.assignedRole) {
          const assignedRole = json.error.details.assignedRole as UserRole;
          setRoleMismatch({ email: cleanInput, assignedRole });
          const msg = `${cleanInput} is registered as "${ROLE_LABELS[assignedRole]}" and should sign in on the website portal instead of this mobile app.`;
          setInlineError(msg);
          onShowAlert({
            variant: 'error',
            title: 'Wrong App for Your Role',
            message: msg,
          });
          return;
        }
        const errMsg = json?.error?.message || 'OTP check failed.';
        setInlineError(errMsg);
        onShowAlert({ variant: 'error', title: 'Invalid OTP', message: errMsg });
        return;
      }

      if (rememberMe) {
        void AsyncStorage.setItem(REMEMBER_STORAGE_KEY, cleanInput).catch(() => {});
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
      const msg = 'Could not reach the sign-in service. Please try again.';
      setInlineError(msg);
      onShowAlert({
        variant: 'error',
        title: 'Verification Error',
        message: msg,
      });
    } finally {
      setAuthSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <View style={styles.splashContainer}>
        <TopCornerWave height={116 + insets.top} />
        <BottomWaveBackdrop height={124 + insets.bottom} />
        <View style={[styles.splashCenter, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <LabSetuLogoMark size={102} />
          <View style={{ marginTop: 10 }}>
            <LabSetuWordmark fontSize={34} showTagline />
          </View>
          <View style={{ marginTop: 22 }}>
            <SplashNetworkIllustration />
          </View>
          <View style={styles.splashStatusPill}>
            <ActivityIndicator size="small" color={BRAND_COLORS.tealPrimary} />
            <Text style={styles.splashStatusText}>Phlebo App • Verifying session...</Text>
          </View>
        </View>
      </View>
    );
  }

  if (authView === 'forgot') {
    return (
      <View style={styles.pageBg}>
        <TopCornerWave height={96 + insets.top} />
        <BottomWaveBackdrop height={76 + insets.bottom} />
        <ScrollView
          contentContainerStyle={[
            styles.scrollContainer,
            {
              paddingTop: Math.max(insets.top + rs(24), rs(40)),
              paddingBottom: Math.max(insets.bottom + rs(28), rs(36)),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandHeaderCompact}>
            <LabSetuLogoMark size={58} />
            <LabSetuWordmark fontSize={23} />
          </View>

          <View style={styles.authCard}>
            <View style={styles.banner}>
              <TouchableOpacity
                onPress={goToLoginView}
                hitSlop={8}
                accessibilityLabel="Back to Login"
                style={styles.brandBadge}
                activeOpacity={0.75}
              >
                <Ionicons name="arrow-back" size={21} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={styles.bannerTitle}>Password Recovery</Text>
                <Text style={styles.bannerSub}>
                  Reset or set up your Phlebo App password
                </Text>
              </View>
            </View>

            <View style={styles.cardBody}>
              {forgotSentSummary ? (
                <View>
                  <View style={styles.statusBoxSent}>
                    <View style={styles.statusIconCircle}>
                      <Ionicons name="mail-open-outline" size={26} color="#059669" />
                    </View>
                    <Text style={styles.statusTitleSuccess}>Reset Link Sent</Text>
                    <Text style={styles.statusCopy}>
                      We emailed a secure password reset link to{' '}
                      <Text style={{ fontFamily: BRAND_FONTS.bold, color: BRAND_COLORS.ink }}>
                        {forgotSentSummary.targetDisplay}
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
                    onPress={() => void handleSendForgotEmail(forgotSentSummary.identifier)}
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
                      <Text style={styles.linkMuted}>Try Different Email / ID</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={goToLoginView}>
                      <Text style={styles.linkMuted}>← Back to Login</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View>
                  <View style={styles.stepPill}>
                    <Text style={styles.stepPillText}>Step 1 of 2 • Request Reset Link</Text>
                  </View>

                  <Text style={styles.helperCopy}>
                    Enter your Field Phlebotomist email or Courier ID (e.g. PHL-1001) registered by
                    Platform Admin ({ADMIN_LOGIN_EMAIL}).
                  </Text>

                  {inlineError ? (
                    <View style={styles.errorBanner}>
                      <Text style={styles.errorBannerText}>{inlineError}</Text>
                    </View>
                  ) : null}

                  <Text style={styles.inputLabel}>Registered Email or Courier ID</Text>
                  <View style={styles.inputRowWrap}>
                    <Ionicons
                      name="person-outline"
                      size={18}
                      color={BRAND_COLORS.muted}
                      style={styles.inputLeftIcon}
                    />
                    <TextInput
                      style={styles.inputInner}
                      value={forgotEmail}
                      onChangeText={setForgotEmail}
                      placeholder="name@company.com or PHL-1001"
                      placeholderTextColor="#94A3B8"
                      autoCapitalize="none"
                      keyboardType="default"
                    />
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.primaryBtn,
                      { marginTop: 4, marginBottom: 12 },
                      authSubmitting && { opacity: 0.65 },
                    ]}
                    onPress={() => void handleSendForgotEmail()}
                    disabled={authSubmitting}
                  >
                    <Text style={styles.primaryBtnText}>
                      {authSubmitting ? 'Sending Link...' : 'Send Password Reset Link'}
                    </Text>
                    <Ionicons name="arrow-forward" size={17} color="#FFFFFF" />
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.secondaryBtn} onPress={goToLoginView}>
                    <Text style={styles.secondaryBtnText}>← Back to Login</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (authView === 'reset') {
    return (
      <View style={styles.pageBg}>
        <TopCornerWave height={96 + insets.top} />
        <BottomWaveBackdrop height={76 + insets.bottom} />
        <ScrollView
          contentContainerStyle={[
            styles.scrollContainer,
            {
              paddingTop: Math.max(insets.top + rs(24), rs(40)),
              paddingBottom: Math.max(insets.bottom + rs(28), rs(36)),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandHeaderCompact}>
            <LabSetuLogoMark size={58} />
            <LabSetuWordmark fontSize={23} />
          </View>

          <View style={styles.authCard}>
            <View style={styles.banner}>
              <TouchableOpacity
                onPress={goToLoginView}
                hitSlop={8}
                accessibilityLabel="Back to Login"
                style={styles.brandBadge}
                activeOpacity={0.75}
              >
                <Ionicons name="arrow-back" size={21} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={styles.bannerTitle}>Create New Password</Text>
                <Text style={styles.bannerSub}>Field Phlebotomist Account Recovery</Text>
              </View>
            </View>

            <View style={styles.cardBody}>
              {resetStage === 'verifying' ? (
                <View style={styles.statusBoxNeutral}>
                  <ActivityIndicator size="small" color={BRAND_COLORS.tealPrimary} />
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
                    <Ionicons name="alert-circle-outline" size={30} color="#DC2626" />
                    <Text style={[styles.statusTitleError, { marginTop: 6 }]}>
                      Reset Link Expired or Invalid
                    </Text>
                    <Text style={styles.statusCopy}>{resetErrorReason}</Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryBtn, { marginBottom: 10 }]}
                    onPress={() => goToForgotView(resetEmail)}
                  >
                    <Text style={styles.primaryBtnText}>Request a New Reset Link</Text>
                    <Ionicons name="arrow-forward" size={17} color="#FFFFFF" />
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.secondaryBtn} onPress={goToLoginView}>
                    <Text style={styles.secondaryBtnText}>← Back to Login</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {resetStage === 'success' ? (
                <View>
                  <View style={styles.statusBoxSent}>
                    <Ionicons name="checkmark-circle" size={34} color="#16A34A" />
                    <Text style={[styles.statusTitleSuccess, { marginTop: 6 }]}>
                      Password Updated Successfully
                    </Text>
                    <Text style={styles.statusCopy}>
                      Your new password for{' '}
                      <Text style={{ fontFamily: BRAND_FONTS.bold, color: BRAND_COLORS.ink }}>
                        {resetEmail}
                      </Text>{' '}
                      is active right away.
                    </Text>
                  </View>

                  <TouchableOpacity style={styles.primaryBtn} onPress={goToLoginView}>
                    <Text style={styles.primaryBtnText}>Login to Phlebo App</Text>
                    <Ionicons name="arrow-forward" size={17} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              ) : null}

              {resetStage === 'ready' || resetStage === 'submitting' ? (
                <View>
                  <View style={styles.stepPill}>
                    <Text style={styles.stepPillText}>Step 2 of 2 • Choose New Password</Text>
                  </View>

                  <View style={styles.roleReqBanner}>
                    <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.roleReqLabel}>
                      Account:
                    </Text>
                    <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.roleReqValue}>
                      {resetEmail}
                    </Text>
                  </View>

                  {inlineError ? (
                    <View style={styles.errorBanner}>
                      <Text style={styles.errorBannerText}>{inlineError}</Text>
                    </View>
                  ) : null}

                  <Text style={styles.inputLabel}>New Password</Text>
                  <View style={styles.inputRowWrap}>
                    <Ionicons
                      name="lock-closed-outline"
                      size={18}
                      color={BRAND_COLORS.muted}
                      style={styles.inputLeftIcon}
                    />
                    <TextInput
                      style={styles.inputInner}
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
                      <Ionicons
                        name={showNewPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={19}
                        color={BRAND_COLORS.muted}
                      />
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
                  <View style={styles.inputRowWrap}>
                    <Ionicons
                      name="lock-closed-outline"
                      size={18}
                      color={BRAND_COLORS.muted}
                      style={styles.inputLeftIcon}
                    />
                    <TextInput
                      style={styles.inputInner}
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
                      <Ionicons
                        name={showConfirmNewPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={19}
                        color={BRAND_COLORS.muted}
                      />
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
      </View>
    );
  }

  if (roleMismatch) {
    const webPortalUrl = resolveWebPortalUrl(roleMismatch.assignedRole);
    return (
      <View style={styles.pageBg}>
        <TopCornerWave height={96 + insets.top} />
        <BottomWaveBackdrop height={76 + insets.bottom} />
        <ScrollView
          contentContainerStyle={[
            styles.scrollContainer,
            {
              paddingTop: Math.max(insets.top + rs(24), rs(40)),
              paddingBottom: Math.max(insets.bottom + rs(28), rs(36)),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandHeaderCompact}>
            <LabSetuLogoMark size={58} />
            <LabSetuWordmark fontSize={23} />
          </View>

          <View style={styles.authCard}>
            <View style={styles.banner}>
              <View style={styles.brandBadge}>
                <Ionicons name="shield-outline" size={21} color="#FFFFFF" />
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
      </View>
    );
  }

  return (
    <View style={styles.pageBg}>
      <TopCornerWave height={116 + insets.top} />
      <BottomWaveBackdrop height={92 + insets.bottom} />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContainer,
          {
            paddingTop: Math.max(insets.top + rs(24), rs(40)),
            paddingBottom: Math.max(insets.bottom + rs(28), rs(36)),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.loginHeroBrand}>
          <LabSetuLogoMark size={74} />
          <View style={{ marginTop: 4 }}>
            <LabSetuWordmark fontSize={28} />
          </View>
          <Text style={styles.loginHeroHeading}>Phlebo Login</Text>
          <Text style={styles.loginHeroSub}>Access your collection work</Text>
        </View>

        <View style={styles.authCard}>
          <View style={styles.cardBody}>
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
                  setInlineSuccess(null);
                }}
              >
                <Text
                  maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                  style={[
                    styles.segmentTabText,
                    authTab === 'password' && styles.segmentTabTextActive,
                  ]}
                >
                  ID / Email &amp; Password
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.segmentTab, authTab === 'otp' && styles.segmentTabActive]}
                onPress={() => {
                  setAuthTab('otp');
                  if (!otpEmail.trim() && loginEmail.trim()) {
                    setOtpEmail(loginEmail.trim());
                  }
                  setInlineError(null);
                  setInlineSuccess(null);
                }}
              >
                <Text
                  maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
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
                <View style={styles.inputRowWrap}>
                  <Ionicons
                    name="person-outline"
                    size={18}
                    color={BRAND_COLORS.muted}
                    style={styles.inputLeftIcon}
                  />
                  <TextInput
                    style={styles.inputInner}
                    value={loginEmail}
                    onChangeText={setLoginEmail}
                    placeholder="Courier ID or Email (e.g. PHL-1001)"
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="none"
                    keyboardType="default"
                  />
                </View>

                <View style={styles.inputRowWrap}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color={BRAND_COLORS.muted}
                    style={styles.inputLeftIcon}
                  />
                  <TextInput
                    style={styles.inputInner}
                    value={loginPassword}
                    onChangeText={setLoginPassword}
                    placeholder="Password"
                    placeholderTextColor="#94A3B8"
                    secureTextEntry={!showPassword}
                    returnKeyType="done"
                    onSubmitEditing={() => void handlePasswordSignIn()}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.showPassBtn}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={19}
                      color={BRAND_COLORS.muted}
                    />
                  </TouchableOpacity>
                </View>

                <View style={styles.rememberForgotRow}>
                  <TouchableOpacity
                    style={styles.rememberCheckWrap}
                    onPress={() => setRememberMe((v) => !v)}
                    activeOpacity={0.75}
                  >
                    <View
                      style={[
                        styles.rememberCheckbox,
                        rememberMe && styles.rememberCheckboxChecked,
                      ]}
                    >
                      {rememberMe ? <Ionicons name="checkmark" size={12} color="#FFFFFF" /> : null}
                    </View>
                    <Text style={styles.rememberText}>Remember me</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => goToForgotView(loginEmail.trim())}>
                    <Text style={styles.linkMuted}>Forgot Password?</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, authSubmitting && { opacity: 0.65 }]}
                  onPress={() => void handlePasswordSignIn()}
                  disabled={authSubmitting}
                >
                  <Text style={styles.primaryBtnText}>
                    {authSubmitting ? 'Signing In...' : 'Login'}
                  </Text>
                  {!authSubmitting ? (
                    <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                  ) : null}
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <View
                  style={[styles.inputRowWrap, otpSent && { backgroundColor: '#F1F5F9' }]}
                >
                  <Ionicons
                    name="mail-outline"
                    size={18}
                    color={BRAND_COLORS.muted}
                    style={styles.inputLeftIcon}
                  />
                  <TextInput
                    style={styles.inputInner}
                    value={otpEmail}
                    onChangeText={setOtpEmail}
                    placeholder="Mobile Number, Email or PHL-1001"
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="none"
                    editable={!otpSent}
                    returnKeyType="send"
                    onSubmitEditing={() => {
                      if (!otpSent && !authSubmitting) void handleSendOtp();
                    }}
                  />
                </View>

                {otpSent ? (
                  <View style={styles.inputRowWrap}>
                    <Ionicons
                      name="keypad-outline"
                      size={18}
                      color={BRAND_COLORS.muted}
                      style={styles.inputLeftIcon}
                    />
                    <TextInput
                      style={[styles.inputInner, styles.otpInput]}
                      value={otpCode}
                      onChangeText={(val) => setOtpCode(val.replace(/\D/g, ''))}
                      placeholder="••••••"
                      placeholderTextColor="#94A3B8"
                      keyboardType="number-pad"
                      maxLength={6}
                      returnKeyType="done"
                      onSubmitEditing={() => {
                        if (!authSubmitting) void handleVerifyOtp();
                      }}
                    />
                  </View>
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
                  {!authSubmitting ? (
                    <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                  ) : null}
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
                      <Text style={styles.linkMuted}>Change Email / ID</Text>
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

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={[styles.googleBtn, authSubmitting && { opacity: 0.65 }]}
              onPress={() => void handleGoogleSignIn()}
              disabled={authSubmitting}
            >
              <Text style={styles.googleMark}>G</Text>
              <Text style={styles.googleBtnText}>
                {authSubmitting ? 'Connecting...' : 'Continue with Google'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.footerRoleNote}>
          {LABSETU_THEME.brand.name} • {ROLE_LABELS[REQUIRED_ROLE]} Portal
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  splashCenter: {
    alignItems: 'center',
    zIndex: 2,
    width: '100%',
    maxWidth: 360,
  },
  splashStatusPill: {
    marginTop: rs(24),
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F4F7FB',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: rs(16),
    paddingVertical: rs(10),
    borderRadius: 999,
    maxWidth: '100%',
  },
  splashStatusText: {
    fontSize: rf(12.5),
    lineHeight: lh(rf(12.5)),
    fontFamily: BRAND_FONTS.semiBold,
    color: BRAND_COLORS.navyPrimary,
    flexShrink: 1,
    includeFontPadding: true,
  },
  pageBg: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: rs(16),
    paddingTop: rs(40),
    paddingBottom: rs(36),
    zIndex: 2,
  },
  loginHeroBrand: {
    alignItems: 'center',
    marginBottom: rs(16),
  },
  brandHeaderCompact: {
    alignItems: 'center',
    marginBottom: rs(14),
  },
  loginHeroHeading: {
    fontSize: rf(22),
    lineHeight: lh(rf(22)),
    fontFamily: BRAND_FONTS.extraBold,
    color: BRAND_COLORS.navyPrimary,
    marginTop: rs(12),
    letterSpacing: -0.3,
    textAlign: 'center',
    includeFontPadding: true,
  },
  loginHeroSub: {
    fontSize: rf(13),
    lineHeight: lh(rf(13)),
    fontFamily: BRAND_FONTS.medium,
    color: BRAND_COLORS.muted,
    marginTop: 3,
    textAlign: 'center',
    includeFontPadding: true,
  },
  authCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E5ECF4',
    overflow: 'hidden',
    shadowColor: BRAND_COLORS.navyPrimary,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.09,
    shadowRadius: 22,
    elevation: 6,
  },
  banner: {
    backgroundColor: BRAND_COLORS.navyPrimary,
    paddingHorizontal: rs(16),
    paddingVertical: rs(15),
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(12),
    borderBottomWidth: 2,
    borderBottomColor: BRAND_COLORS.tealPrimary,
  },
  brandBadge: {
    width: rs(42),
    height: rs(42),
    borderRadius: 12,
    backgroundColor: BRAND_COLORS.tealPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bannerTitle: {
    color: '#FFFFFF',
    fontSize: rf(16),
    lineHeight: lh(rf(16)),
    fontFamily: BRAND_FONTS.bold,
    flexShrink: 1,
    includeFontPadding: true,
  },
  bannerSub: {
    color: '#99F6E4',
    fontSize: rf(12),
    lineHeight: lh(rf(12)),
    fontFamily: BRAND_FONTS.medium,
    marginTop: 1,
    flexShrink: 1,
    includeFontPadding: true,
  },
  cardBody: {
    padding: rs(18),
  },
  roleReqBanner: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    borderRadius: 11,
    paddingHorizontal: rs(12),
    paddingVertical: rs(9),
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  roleReqLabel: {
    fontSize: rf(12),
    lineHeight: lh(rf(12)),
    color: BRAND_COLORS.tealPrimary,
    fontFamily: BRAND_FONTS.semiBold,
    includeFontPadding: true,
  },
  roleReqValue: {
    fontSize: rf(12),
    lineHeight: lh(rf(12)),
    color: BRAND_COLORS.navyPrimary,
    fontFamily: BRAND_FONTS.bold,
    flexShrink: 1,
    includeFontPadding: true,
  },
  helperCopy: {
    fontSize: rf(12.5),
    fontFamily: BRAND_FONTS.regular,
    color: BRAND_COLORS.muted,
    lineHeight: lh(rf(12.5), 1.42),
    marginBottom: rs(14),
    includeFontPadding: true,
  },
  segmentedTabs: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    gap: 4,
    marginBottom: rs(16),
  },
  segmentTab: {
    flex: 1,
    paddingVertical: rs(9),
    paddingHorizontal: rs(6),
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: BRAND_COLORS.navyPrimary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentTabText: {
    fontSize: rf(12),
    lineHeight: lh(rf(12)),
    fontFamily: BRAND_FONTS.semiBold,
    color: BRAND_COLORS.muted,
    textAlign: 'center',
    includeFontPadding: true,
  },
  segmentTabTextActive: {
    color: BRAND_COLORS.navyPrimary,
    fontFamily: BRAND_FONTS.bold,
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 11,
    padding: rs(10),
    marginBottom: 12,
  },
  errorBannerText: {
    color: '#B91C1C',
    fontSize: rf(12),
    fontFamily: BRAND_FONTS.semiBold,
    lineHeight: lh(rf(12), 1.42),
    includeFontPadding: true,
  },
  successBanner: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 11,
    padding: rs(10),
    marginBottom: 12,
  },
  successBannerText: {
    color: '#15803D',
    fontSize: rf(12),
    fontFamily: BRAND_FONTS.semiBold,
    lineHeight: lh(rf(12), 1.42),
    includeFontPadding: true,
  },
  inputLabel: {
    fontSize: rf(12),
    lineHeight: lh(rf(12)),
    fontFamily: BRAND_FONTS.bold,
    color: BRAND_COLORS.navyPrimary,
    marginBottom: 6,
    includeFontPadding: true,
  },
  inputRowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 13,
    paddingHorizontal: rs(12),
    marginBottom: rs(12),
  },
  inputLeftIcon: {
    marginRight: 8,
    flexShrink: 0,
  },
  inputInner: {
    flex: 1,
    minWidth: 0,
    paddingVertical: rs(11),
    fontSize: rf(14),
    lineHeight: lh(rf(14), 1.3),
    fontFamily: BRAND_FONTS.medium,
    color: BRAND_COLORS.ink,
  },
  showPassBtn: {
    paddingLeft: 10,
    paddingVertical: 8,
    flexShrink: 0,
  },
  otpInput: {
    textAlign: 'center',
    fontSize: rf(20),
    fontFamily: BRAND_FONTS.extraBold,
    letterSpacing: 6,
  },
  rememberForgotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 2,
    marginBottom: rs(16),
  },
  rememberCheckWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rememberCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  rememberCheckboxChecked: {
    backgroundColor: BRAND_COLORS.navyPrimary,
    borderColor: BRAND_COLORS.navyPrimary,
  },
  rememberText: {
    fontSize: rf(12.5),
    lineHeight: lh(rf(12.5)),
    fontFamily: BRAND_FONTS.medium,
    color: BRAND_COLORS.muted,
    includeFontPadding: true,
  },
  linkMuted: {
    fontSize: rf(12.5),
    lineHeight: lh(rf(12.5)),
    fontFamily: BRAND_FONTS.bold,
    color: BRAND_COLORS.navyPrimary,
    includeFontPadding: true,
  },
  otpFooterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: rs(14),
  },
  primaryBtn: {
    backgroundColor: BRAND_COLORS.navyPrimary,
    borderRadius: 13,
    paddingVertical: rs(14),
    paddingHorizontal: rs(16),
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: BRAND_COLORS.navyPrimary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 4,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: rf(14.5),
    lineHeight: lh(rf(14.5)),
    fontFamily: BRAND_FONTS.bold,
    textAlign: 'center',
    flexShrink: 1,
    includeFontPadding: true,
  },
  secondaryBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingVertical: rs(12),
    paddingHorizontal: rs(14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: BRAND_COLORS.navyPrimary,
    fontSize: rf(13.5),
    lineHeight: lh(rf(13.5)),
    fontFamily: BRAND_FONTS.bold,
    textAlign: 'center',
    flexShrink: 1,
    includeFontPadding: true,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: rs(15),
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    fontSize: rf(11),
    lineHeight: lh(rf(11)),
    fontFamily: BRAND_FONTS.bold,
    color: '#94A3B8',
    includeFontPadding: true,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#DCE5F2',
    borderRadius: 13,
    paddingVertical: rs(12),
    paddingHorizontal: rs(14),
  },
  googleMark: {
    fontSize: rf(16),
    fontFamily: BRAND_FONTS.extraBold,
    color: '#2563EB',
  },
  googleBtnText: {
    fontSize: rf(13.5),
    lineHeight: lh(rf(13.5)),
    fontFamily: BRAND_FONTS.bold,
    color: BRAND_COLORS.ink,
    flexShrink: 1,
    includeFontPadding: true,
  },
  footerRoleNote: {
    marginTop: rs(18),
    fontSize: rf(11.5),
    lineHeight: lh(rf(11.5)),
    fontFamily: BRAND_FONTS.medium,
    color: BRAND_COLORS.muted,
    textAlign: 'center',
    paddingHorizontal: 12,
    includeFontPadding: true,
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
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  mismatchLabel: {
    fontSize: 12,
    fontFamily: BRAND_FONTS.semiBold,
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
    fontFamily: BRAND_FONTS.bold,
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
    fontFamily: BRAND_FONTS.bold,
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
    fontFamily: BRAND_FONTS.bold,
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
    fontFamily: BRAND_FONTS.bold,
  },
  statusIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
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
  statusTitleSuccess: {
    fontSize: 16,
    fontFamily: BRAND_FONTS.extraBold,
    color: '#065F46',
    marginBottom: 6,
  },
  statusTitleError: {
    fontSize: 16,
    fontFamily: BRAND_FONTS.extraBold,
    color: '#B91C1C',
    marginBottom: 6,
  },
  statusTitleNeutral: {
    fontSize: 15,
    fontFamily: BRAND_FONTS.bold,
    color: BRAND_COLORS.ink,
    marginBottom: 4,
  },
  statusCopy: {
    fontSize: 13,
    fontFamily: BRAND_FONTS.regular,
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
    fontFamily: BRAND_FONTS.regular,
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
    fontFamily: BRAND_FONTS.semiBold,
    color: '#475569',
  },
  strengthValue: {
    fontSize: 12,
    fontFamily: BRAND_FONTS.bold,
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
    fontFamily: BRAND_FONTS.medium,
  },
  reqItemMet: {
    color: '#047857',
    fontFamily: BRAND_FONTS.bold,
  },
});
