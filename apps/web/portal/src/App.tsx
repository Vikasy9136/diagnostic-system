import { useCallback, useEffect, useState } from 'react';
import { ROLE_LABELS, UserRole } from '@diagnostic/shared';
import { signOut } from 'firebase/auth';
import { auth } from './firebase';
import { LandingPage } from './components/LandingPage';
import { LoginPage, type VerifiedPortalSession } from './components/LoginPage';
import { ForgotPasswordPage } from './components/ForgotPasswordPage';
import { ResetPasswordPage } from './components/ResetPasswordPage';
import { MobileGoogleAuthPage } from './components/MobileGoogleAuthPage';
import { MobileScannerPage } from './components/MobileScannerPage';
import { PrivacyPolicyPage } from './components/PrivacyPolicyPage';
import { TermsConditionsPage } from './components/TermsConditionsPage';
import {
  DynamicAlertModal,
  INITIAL_DYNAMIC_ALERT,
  type DynamicAlertState,
  type DynamicAlertVariant,
} from './components/DynamicAlertModal';
import { AdminDashboard } from './dashboards/AdminDashboard';
import { SmallLabDashboard } from './dashboards/SmallLabDashboard';
import { LargeLabDashboard } from './dashboards/LargeLabDashboard';

type RouteView =
  | 'landing'
  | 'login'
  | 'forgot-password'
  | 'reset-password'
  | 'mobile-google-auth'
  | 'mobile-scanner'
  | 'dashboard'
  | 'privacy'
  | 'terms';

const ACTIVE_ROLE_STORAGE_KEY = 'labsetu_active_role';

function isValidWebRole(value: string | null | undefined): value is UserRole {
  return (
    value === UserRole.ADMIN ||
    value === UserRole.SMALL_LAB ||
    value === UserRole.LARGE_LAB
  );
}

function parseBrowserRoute(): {
  view: RouteView;
  role: UserRole;
  blockedPhleboParam: boolean;
  initialEmail: string;
} {
  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const queryRole = params.get('role');
  const hasOobCode = params.has('oobCode') || params.get('mode') === 'resetPassword';
  const initialEmail = params.get('email')?.trim() || '';
  const storedRole = (() => {
    try {
      return window.sessionStorage.getItem(ACTIVE_ROLE_STORAGE_KEY);
    } catch {
      return null;
    }
  })();

  const resolvedRole: UserRole = isValidWebRole(queryRole)
    ? queryRole
    : isValidWebRole(storedRole)
    ? storedRole
    : UserRole.SMALL_LAB;

  if (path.startsWith('/mobile-google-auth')) {
    return {
      view: 'mobile-google-auth',
      role: UserRole.PHLEBOTOMIST,
      blockedPhleboParam: false,
      initialEmail,
    };
  }
  if (path.startsWith('/mobile-scanner') || path.startsWith('/scan')) {
    return {
      view: 'mobile-scanner',
      role: UserRole.ADMIN,
      blockedPhleboParam: false,
      initialEmail,
    };
  }
  if (path.startsWith('/reset-password') || hasOobCode) {
    return {
      view: 'reset-password',
      role: resolvedRole,
      blockedPhleboParam: false,
      initialEmail,
    };
  }
  if (path.startsWith('/forgot-password')) {
    return {
      view: 'forgot-password',
      role: resolvedRole,
      blockedPhleboParam: false,
      initialEmail,
    };
  }

  const pageParam = params.get('page')?.toLowerCase();
  if (
    path.startsWith('/privacy') ||
    path.startsWith('/privacy-policy') ||
    pageParam === 'privacy' ||
    pageParam === 'privacy-policy'
  ) {
    return {
      view: 'privacy',
      role: resolvedRole,
      blockedPhleboParam: false,
      initialEmail,
    };
  }
  if (
    path.startsWith('/terms') ||
    path.startsWith('/terms-and-conditions') ||
    path.startsWith('/terms-of-service') ||
    pageParam === 'terms' ||
    pageParam === 'terms-and-conditions'
  ) {
    return {
      view: 'terms',
      role: resolvedRole,
      blockedPhleboParam: false,
      initialEmail,
    };
  }

  const blockedPhleboParam = queryRole === UserRole.PHLEBOTOMIST;

  const isKnownDashboardSubRoute =
    path.startsWith('/dashboard') ||
    path.startsWith('/new-booking') ||
    path.startsWith('/patients') ||
    path.startsWith('/catalogue') ||
    path.startsWith('/partner-labs') ||
    path.startsWith('/bookings') ||
    path.startsWith('/reports') ||
    path.startsWith('/payments') ||
    path.startsWith('/support') ||
    path.startsWith('/live-ops') ||
    path.startsWith('/labs') ||
    path.startsWith('/phlebotomists') ||
    path.startsWith('/samples') ||
    path.startsWith('/commission') ||
    path.startsWith('/zones') ||
    path.startsWith('/users') ||
    path.startsWith('/employees') ||
    path.startsWith('/org-structure') ||
    path.startsWith('/finance-ops') ||
    path.startsWith('/marketing-growth') ||
    path.startsWith('/product-tech') ||
    path.startsWith('/audit-logs') ||
    path.startsWith('/analytics') ||
    path.startsWith('/settings') ||
    path.startsWith('/incoming') ||
    path.startsWith('/testing') ||
    path.startsWith('/rates') ||
    path.startsWith('/settlements');

  if (isKnownDashboardSubRoute) {
    return { view: 'dashboard', role: resolvedRole, blockedPhleboParam, initialEmail };
  }
  if (path.startsWith('/login')) {
    return { view: 'login', role: resolvedRole, blockedPhleboParam, initialEmail };
  }
  return { view: 'landing', role: resolvedRole, blockedPhleboParam, initialEmail };
}

export function App() {
  const initialRoute = parseBrowserRoute();
  const [routeView, setRouteView] = useState<RouteView>(initialRoute.view);
  const [selectedRole, setSelectedRole] = useState<UserRole>(initialRoute.role);
  const [forgotEmailHint, setForgotEmailHint] = useState<string>(initialRoute.initialEmail);
  const [session, setSession] = useState<VerifiedPortalSession | null>(null);
  const [alertState, setAlertState] = useState<DynamicAlertState>(INITIAL_DYNAMIC_ALERT);

  const closeAlert = useCallback(() => setAlertState(INITIAL_DYNAMIC_ALERT), []);

  const showAlert = useCallback(
    (opts: {
      variant: DynamicAlertVariant;
      title: string;
      message: string;
      detail?: string;
      confirmLabel?: string;
      cancelLabel?: string;
      onConfirm?: () => void;
    }) => {
      setAlertState({
        isOpen: true,
        variant: opts.variant,
        title: opts.title,
        message: opts.message,
        detail: opts.detail,
        confirmLabel: opts.confirmLabel,
        cancelLabel: opts.cancelLabel,
        onConfirm: opts.onConfirm,
      });
    },
    []
  );

  useEffect(() => {
    if (initialRoute.blockedPhleboParam) {
      window.history.replaceState({}, '', `/login?role=${initialRoute.role}`);
      showAlert({
        variant: 'info',
        title: 'Mobile App Only',
        message:
          'Field Phlebotomist accounts can only sign in using the LabSetu Mobile App, not on the website.',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigate = useCallback((nextPath: string, replace = false) => {
    if (replace) {
      window.history.replaceState({}, '', nextPath);
    } else {
      window.history.pushState({}, '', nextPath);
    }
    const parsed = parseBrowserRoute();
    setRouteView(parsed.view);
    setSelectedRole(parsed.role);
    if (parsed.initialEmail) {
      setForgotEmailHint(parsed.initialEmail);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const parsed = parseBrowserRoute();
      setRouteView(parsed.view);
      setSelectedRole(parsed.role);
      setForgotEmailHint(parsed.initialEmail);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleGoToLogin = useCallback(
    (role?: UserRole) => {
      if (role === UserRole.PHLEBOTOMIST) {
        showAlert({
          variant: 'info',
          title: 'Mobile App Only',
          message:
            'Field Phlebotomist accounts can only sign in using the LabSetu Mobile App, not on the website.',
        });
        return;
      }
      if (!auth.currentUser) {
        setSession(null);
      }
      const targetRole = role && isValidWebRole(role) ? role : selectedRole;
      setSelectedRole(targetRole);
      navigate(`/login?role=${targetRole}`);
    },
    [navigate, selectedRole, showAlert]
  );

  const handleGoToForgotPassword = useCallback(
    (email?: string) => {
      const cleanEmail = email?.trim() || '';
      setForgotEmailHint(cleanEmail);
      const query = new URLSearchParams();
      query.set('role', selectedRole);
      if (cleanEmail) query.set('email', cleanEmail);
      navigate(`/forgot-password?${query.toString()}`);
    },
    [navigate, selectedRole]
  );

  const handleSelectRoleOnLogin = useCallback(
    (role: UserRole) => {
      if (!isValidWebRole(role)) {
        showAlert({
          variant: 'info',
          title: 'Mobile App Only',
          message:
            'Field Phlebotomist accounts can only sign in using the LabSetu Mobile App, not on the website.',
        });
        return;
      }
      setSelectedRole(role);
      window.history.replaceState({}, '', `/login?role=${role}`);
    },
    [showAlert]
  );

  const handleAuthenticated = useCallback(
    (verifiedSession: VerifiedPortalSession) => {
      if (verifiedSession.profile.role === UserRole.PHLEBOTOMIST) {
        void signOut(auth).catch(() => {});
        showAlert({
          variant: 'error',
          title: 'Mobile App Only',
          message:
            'Field Phlebotomist accounts can only sign in using the LabSetu Mobile App, not on the website.',
        });
        return;
      }
      try {
        window.sessionStorage.setItem(ACTIVE_ROLE_STORAGE_KEY, verifiedSession.profile.role);
      } catch {
        // Non-fatal in private browsing
      }
      setSession(verifiedSession);
      setSelectedRole(verifiedSession.profile.role);
      const currentPath = window.location.pathname;
      const targetPath =
        currentPath.startsWith('/dashboard') && currentPath !== '/'
          ? currentPath
          : `/dashboard`;
      navigate(`${targetPath}?role=${verifiedSession.profile.role}`, true);
    },
    [navigate, showAlert]
  );

  const handleSignOut = useCallback(() => {
    if (!session) return;
    const activeRoleLabel = ROLE_LABELS[session.profile.role];
    const activeEmail = session.profile.email;

    showAlert({
      variant: 'confirm',
      title: 'Sign Out of LabSetu?',
      message: `End active ${activeRoleLabel} session for ${activeEmail}?`,
      confirmLabel: 'Sign Out',
      cancelLabel: 'Stay Signed In',
      onConfirm: () => {
        void (async () => {
          try {
            if (auth.currentUser) {
              await signOut(auth);
            }
          } finally {
            try {
              window.sessionStorage.removeItem(ACTIVE_ROLE_STORAGE_KEY);
            } catch {
              // Ignore storage cleanup error
            }
            setSession(null);
            navigate('/login', true);
          }
        })();
      },
    });
  }, [session, showAlert, navigate]);

  const renderDashboardByRole = () => {
    if (!session) {
      return (
        <LoginPage
          selectedRole={selectedRole}
          onSelectRole={handleSelectRoleOnLogin}
          onBackToLanding={() => navigate('/')}
          onForgotPassword={handleGoToForgotPassword}
          onShowAlert={showAlert}
          onAuthenticated={handleAuthenticated}
        />
      );
    }

    switch (session.profile.role) {
      case UserRole.ADMIN:
        return (
          <AdminDashboard
            session={session}
            onSignOut={handleSignOut}
            onShowAlert={showAlert}
          />
        );
      case UserRole.SMALL_LAB:
        return (
          <SmallLabDashboard
            session={session}
            onSignOut={handleSignOut}
            onShowAlert={showAlert}
          />
        );
      case UserRole.LARGE_LAB:
        return (
          <LargeLabDashboard
            session={session}
            onSignOut={handleSignOut}
            onShowAlert={showAlert}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <DynamicAlertModal alertState={alertState} onClose={closeAlert} />

      {routeView === 'mobile-google-auth' && <MobileGoogleAuthPage />}

      {routeView === 'mobile-scanner' && <MobileScannerPage />}

      {routeView === 'landing' && (
        <LandingPage
          onGoToLogin={handleGoToLogin}
          onGoToPrivacy={() => navigate('/privacy')}
          onGoToTerms={() => navigate('/terms')}
        />
      )}

      {routeView === 'privacy' && (
        <PrivacyPolicyPage
          onBackToHome={() => navigate('/')}
          onGoToLogin={handleGoToLogin}
          onGoToTerms={() => navigate('/terms')}
        />
      )}

      {routeView === 'terms' && (
        <TermsConditionsPage
          onBackToHome={() => navigate('/')}
          onGoToLogin={handleGoToLogin}
          onGoToPrivacy={() => navigate('/privacy')}
        />
      )}

      {routeView === 'forgot-password' && (
        <ForgotPasswordPage
          initialEmail={forgotEmailHint}
          selectedRole={selectedRole}
          onBackToLogin={() => handleGoToLogin(selectedRole)}
          onBackToLanding={() => navigate('/')}
          onShowAlert={showAlert}
        />
      )}

      {routeView === 'reset-password' && (
        <ResetPasswordPage
          onGoToLogin={handleGoToLogin}
          onGoToForgotPassword={handleGoToForgotPassword}
          onBackToLanding={() => navigate('/')}
          onShowAlert={showAlert}
        />
      )}

      {routeView === 'login' && !session && (
        <LoginPage
          selectedRole={selectedRole}
          onSelectRole={handleSelectRoleOnLogin}
          onBackToLanding={() => navigate('/')}
          onForgotPassword={handleGoToForgotPassword}
          onGoToPrivacy={() => navigate('/privacy')}
          onGoToTerms={() => navigate('/terms')}
          onShowAlert={showAlert}
          onAuthenticated={handleAuthenticated}
        />
      )}

      {(routeView === 'dashboard' || (routeView === 'login' && Boolean(session))) &&
        renderDashboardByRole()}
    </>
  );
}

export default App;

