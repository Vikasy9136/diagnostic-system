import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getRedirectResult, signInWithPopup, signInWithRedirect, signOut, type User } from 'firebase/auth';
import { ROLE_LABELS, UserRole } from '@diagnostic/shared';
import { API_BASE_URL, auth, googleProvider } from '../firebase';

const STORAGE_STARTED_KEY = 'labsetu_mobile_google_started_v1';
const STORAGE_REDIRECT_KEY = 'labsetu_mobile_google_redirect_uri_v1';
const STORAGE_ROLE_KEY = 'labsetu_mobile_google_role_v1';

function isAllowedMobileRedirectUri(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (
    trimmed.startsWith('exp://') ||
    trimmed.startsWith('exps://') ||
    trimmed.startsWith('labsetu-phlebo://')
  ) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    );
  } catch {
    return false;
  }
}

function appendQueryParams(baseUri: string, params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') {
      qs.set(k, v);
    }
  });
  const encoded = qs.toString();
  if (!encoded) return baseUri;
  return baseUri.includes('?') ? `${baseUri}&${encoded}` : `${baseUri}?${encoded}`;
}

function clearMobileAuthStorage() {
  try {
    window.sessionStorage.removeItem(STORAGE_STARTED_KEY);
    window.sessionStorage.removeItem(STORAGE_REDIRECT_KEY);
    window.sessionStorage.removeItem(STORAGE_ROLE_KEY);
  } catch {
    // Non-fatal in private browsing
  }
}

type BridgeStage = 'starting' | 'waiting_user' | 'verifying' | 'returning' | 'error';

export function MobileGoogleAuthPage() {
  const initialConfig = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const paramRedirect = params.get('redirect_uri')?.trim() || '';
    const paramRole = params.get('role')?.trim().toUpperCase() || '';

    let storedRedirect = '';
    let storedRole = '';
    let startedAt = '';
    try {
      storedRedirect = window.sessionStorage.getItem(STORAGE_REDIRECT_KEY) || '';
      storedRole = window.sessionStorage.getItem(STORAGE_ROLE_KEY) || '';
      startedAt = window.sessionStorage.getItem(STORAGE_STARTED_KEY) || '';
    } catch {
      // Ignore storage access errors
    }

    const candidateRedirect = isAllowedMobileRedirectUri(paramRedirect)
      ? paramRedirect
      : isAllowedMobileRedirectUri(storedRedirect)
      ? storedRedirect
      : '';

    const resolvedRole: UserRole =
      paramRole === UserRole.PHLEBOTOMIST || storedRole === UserRole.PHLEBOTOMIST
        ? UserRole.PHLEBOTOMIST
        : UserRole.PHLEBOTOMIST;

    const isReturning =
      Boolean(startedAt) && Date.now() - Number(startedAt) < 10 * 60 * 1000;

    return {
      redirectUri: candidateRedirect,
      requiredRole: resolvedRole,
      isReturning,
    };
  }, []);

  const [stage, setStage] = useState<BridgeStage>('starting');
  const [statusMessage, setStatusMessage] = useState('Connecting cleanly with Google...');
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [returnDeepLink, setReturnDeepLink] = useState<string | null>(null);
  const handledRef = useRef(false);

  const navigateBackToApp = useCallback(
    (params: Record<string, string | undefined>) => {
      clearMobileAuthStorage();
      if (!initialConfig.redirectUri) {
        setStage('error');
        setErrorDetail(
          params.authErrorMessage ||
            'Missing return link for the Phlebo App. Please close this window and try again from the app.'
        );
        return;
      }
      const targetUrl = appendQueryParams(initialConfig.redirectUri, params);
      setReturnDeepLink(targetUrl);
      setStage('returning');
      setStatusMessage(
        params.code
          ? 'Verified! Returning you to LabSetu Phlebo App...'
          : 'Returning to LabSetu Phlebo App...'
      );
      window.setTimeout(() => {
        window.location.replace(targetUrl);
      }, 120);
    },
    [initialConfig.redirectUri]
  );

  const exchangeUserWithBackend = useCallback(
    async (user: User) => {
      setStage('verifying');
      setErrorDetail(null);
      setStatusMessage(`Checking ${ROLE_LABELS[initialConfig.requiredRole]} access...`);

      try {
        const idToken = await user.getIdToken(true);
        const res = await fetch(`${API_BASE_URL}/auth/mobile-google-exchange`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Platform': 'mobile',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            requiredRole: initialConfig.requiredRole,
          }),
        });

        const json = (await res.json().catch(() => null)) as {
          success?: boolean;
          data?: {
            status: 'OK' | 'ERROR';
            code?: string;
            email?: string;
            errorCode?: string;
            errorMessage?: string;
            assignedRole?: UserRole;
          };
          error?: { code?: string; message?: string };
        } | null;

        await signOut(auth).catch(() => {});

        if (res.ok && json?.data?.status === 'OK' && json.data.code) {
          navigateBackToApp({
            code: json.data.code,
            email: json.data.email || user.email || '',
          });
          return;
        }

        if (res.ok && json?.data?.status === 'ERROR') {
          navigateBackToApp({
            authErrorCode: json.data.errorCode || 'AUTH_REJECTED',
            authErrorMessage:
              json.data.errorMessage || 'Could not sign in with this Google account.',
            email: json.data.email || user.email || '',
            assignedRole: json.data.assignedRole,
          });
          return;
        }

        navigateBackToApp({
          authErrorCode: json?.error?.code || 'EXCHANGE_FAILED',
          authErrorMessage:
            json?.error?.message || 'Unable to verify your Google account right now.',
          email: user.email || '',
        });
      } catch (err: unknown) {
        await signOut(auth).catch(() => {});
        const msg =
          err instanceof Error ? err.message : 'Network error verifying Google account.';
        setStage('error');
        setErrorDetail(msg);
      }
    },
    [initialConfig.requiredRole, navigateBackToApp]
  );

  const startGoogleSignIn = useCallback(async () => {
    if (!initialConfig.redirectUri) {
      setStage('error');
      setErrorDetail(
        'Missing or unsupported return link. Please launch Google Sign-In directly from the LabSetu Phlebo App.'
      );
      return;
    }

    setStage('starting');
    setErrorDetail(null);
    setStatusMessage('Opening Google account picker...');

    try {
      if (auth.currentUser) {
        await signOut(auth).catch(() => {});
      }
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      window.sessionStorage.setItem(STORAGE_STARTED_KEY, String(Date.now()));
      window.sessionStorage.setItem(STORAGE_REDIRECT_KEY, initialConfig.redirectUri);
      window.sessionStorage.setItem(STORAGE_ROLE_KEY, initialConfig.requiredRole);

      // Auto fallback timeout in case browser suspends navigation
      window.setTimeout(() => {
        setStage((prev) => (prev === 'starting' ? 'waiting_user' : prev));
      }, 3000);

      await signInWithRedirect(auth, googleProvider);
    } catch (err: unknown) {
      const fbErr = err as { code?: string; message?: string };
      // Fallback to popup if redirect API reports an issue in embedded contexts
      try {
        const popupResult = await signInWithPopup(auth, googleProvider);
        if (popupResult?.user) {
          await exchangeUserWithBackend(popupResult.user);
          return;
        }
      } catch {
        // Keep primary error below
      }
      clearMobileAuthStorage();
      setStage('waiting_user');
      setErrorDetail(
        fbErr?.message || 'Could not open Google sign-in automatically. Tap the button below.'
      );
    }
  }, [exchangeUserWithBackend, initialConfig.redirectUri, initialConfig.requiredRole]);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    if (!initialConfig.redirectUri) {
      setStage('error');
      setErrorDetail(
        'Invalid or missing app callback URL. Please return to the LabSetu Phlebo App and tap Continue with Google again.'
      );
      return;
    }

    let cancelled = false;

    async function runBridge() {
      try {
        if (typeof auth.authStateReady === 'function') {
          await auth.authStateReady().catch(() => {});
        }
        const redirectResult = await getRedirectResult(auth);
        if (cancelled) return;

        if (redirectResult?.user) {
          await exchangeUserWithBackend(redirectResult.user);
          return;
        }

        if (initialConfig.isReturning && auth.currentUser) {
          await exchangeUserWithBackend(auth.currentUser);
          return;
        }

        if (initialConfig.isReturning) {
          clearMobileAuthStorage();
          setStage('waiting_user');
          setStatusMessage('Tap below to select your Google account for LabSetu Phlebo App.');
          return;
        }

        // Fresh visit from Phlebo App: prompt user to tap button for user gesture activation
        setStage('waiting_user');
        setStatusMessage('Tap below to select your Google account for LabSetu Phlebo App.');
      } catch (err: unknown) {
        if (cancelled) return;
        const fbErr = err as { code?: string; message?: string };
        clearMobileAuthStorage();
        setStage('waiting_user');
        setErrorDetail(
          fbErr?.code === 'auth/popup-closed-by-user'
            ? 'Google sign-in was cancelled. Tap below to try again.'
            : fbErr?.message || 'Tap Continue with Google below to sign in.'
        );
      }
    }

    void runBridge();
    return () => {
      cancelled = true;
    };
  }, [exchangeUserWithBackend, initialConfig, startGoogleSignIn]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background: 'linear-gradient(135deg, #062226 0%, #0A2E5C 55%, #0D9488 100%)',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          backgroundColor: '#FFFFFF',
          borderRadius: '22px',
          padding: '28px 24px',
          boxShadow: '0 24px 60px rgba(6, 34, 38, 0.35)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#F0FDFA',
            border: '1px solid #99F6E4',
            color: '#0F766E',
            padding: '5px 12px',
            borderRadius: '999px',
            fontSize: '12px',
            fontWeight: 700,
            marginBottom: '14px',
          }}
        >
          LabSetu Phlebo App • Google Sign-In
        </div>

        <h1
          style={{
            margin: '0 0 8px 0',
            fontSize: '21px',
            fontWeight: 800,
            color: '#0A2E5C',
          }}
        >
          {stage === 'returning'
            ? 'Returning to Phlebo App'
            : stage === 'verifying'
            ? 'Verifying Account Role'
            : stage === 'error'
            ? 'Google Sign-In Issue'
            : 'Sign in with Google'}
        </h1>

        <p
          style={{
            margin: '0 0 18px 0',
            fontSize: '14px',
            lineHeight: 1.55,
            color: '#475569',
          }}
        >
          {statusMessage}
        </p>

        {errorDetail ? (
          <div
            style={{
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: '12px',
              padding: '12px',
              marginBottom: '16px',
              color: '#B91C1C',
              fontSize: '13px',
              lineHeight: 1.5,
              fontWeight: 600,
            }}
          >
            {errorDetail}
          </div>
        ) : null}

        {stage === 'returning' && returnDeepLink ? (
          <a
            href={returnDeepLink}
            style={{
              display: 'block',
              width: '100%',
              boxSizing: 'border-box',
              backgroundColor: '#0A2E5C',
              color: '#FFFFFF',
              textDecoration: 'none',
              padding: '13px 16px',
              borderRadius: '12px',
              fontSize: '15px',
              fontWeight: 700,
              marginBottom: '10px',
            }}
          >
            Open LabSetu Phlebo App →
          </a>
        ) : null}

        {(stage === 'waiting_user' || stage === 'error' || stage === 'starting') && initialConfig.redirectUri ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              type="button"
              onClick={() => void startGoogleSignIn()}
              style={{
                width: '100%',
                backgroundColor: '#0A2E5C',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '12px',
                padding: '13px 16px',
                fontSize: '15px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>{stage === 'starting' ? 'Opening Google Picker... (Tap to retry)' : 'Select Google Account'}</span>
            </button>
            <button
              type="button"
              onClick={() =>
                navigateBackToApp({
                  authErrorCode: 'USER_CANCELLED',
                  authErrorMessage: 'Google sign-in was cancelled.',
                })
              }
              style={{
                width: '100%',
                backgroundColor: '#F1F5F9',
                color: '#0F172A',
                border: '1px solid #CBD5E1',
                borderRadius: '12px',
                padding: '11px 16px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Back to Phlebo App
            </button>
          </div>
        ) : null}

        {(stage === 'starting' || stage === 'verifying') && (
          <div
            style={{
              marginTop: '6px',
              fontSize: '12px',
              color: '#64748B',
            }}
          >
            Securing your session for Field Phlebotomist access...
          </div>
        )}
      </div>
    </div>
  );
}

