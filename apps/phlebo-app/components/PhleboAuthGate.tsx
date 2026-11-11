import React, { useEffect, useRef, useState } from 'react';
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

const REQUIRED_ROLE = UserRole.PHLEBOTOMIST;

export function PhleboAuthGate({ onShowAlert, onAuthenticated }: PhleboAuthGateProps) {
  const [authLoading, setAuthLoading] = useState(true);
  const [authTab, setAuthTab] = useState<AuthTabMode>('password');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Email OTP state
  const [otpEmail, setOtpEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);

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

  async function handlePasswordReset() {
    setInlineError(null);
    setInlineSuccess(null);
    const email = loginEmail.trim();
    if (!email) {
      onShowAlert({
        variant: 'warning',
        title: 'Email Required',
        message: 'Enter your registered phlebotomist email address first.',
      });
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      const msg = `We sent a password setup / reset link to ${email}. Check your inbox and spam folder.`;
      setInlineSuccess(msg);
      onShowAlert({
        variant: 'success',
        title: 'Password Link Sent',
        message: msg,
      });
    } catch (err: unknown) {
      const fbErr = err as { code?: string; message?: string };
      const msg = fbErr.message || 'Unable to send password reset email.';
      setInlineError(msg);
      onShowAlert({ variant: 'error', title: 'Unable to Send Reset Link', message: msg });
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
                <TouchableOpacity onPress={() => void handlePasswordReset()}>
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
});
