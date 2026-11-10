import { useCallback, useEffect, useState } from 'react';
import { ROLE_LABELS, UserRole } from '@diagnostic/shared';
import { signOut } from 'firebase/auth';
import { auth } from './firebase';
import { LandingPage } from './components/LandingPage';
import { LoginPage, type VerifiedPortalSession } from './components/LoginPage';
import {
  DynamicAlertModal,
  INITIAL_DYNAMIC_ALERT,
  type DynamicAlertState,
  type DynamicAlertVariant,
} from './components/DynamicAlertModal';
import { AdminDashboard } from './dashboards/AdminDashboard';
import { SmallLabDashboard } from './dashboards/SmallLabDashboard';
import { LargeLabDashboard } from './dashboards/LargeLabDashboard';
import { PhleboDashboard } from './dashboards/PhleboDashboard';

type RouteView = 'landing' | 'login' | 'dashboard';

const ACTIVE_ROLE_STORAGE_KEY = 'labsetu_active_role';

function isValidRole(value: string | null | undefined): value is UserRole {
  return (
    value === UserRole.ADMIN ||
    value === UserRole.SMALL_LAB ||
    value === UserRole.LARGE_LAB ||
    value === UserRole.PHLEBOTOMIST
  );
}

function parseBrowserRoute(): { view: RouteView; role: UserRole } {
  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const queryRole = params.get('role');
  const storedRole = (() => {
    try {
      return window.sessionStorage.getItem(ACTIVE_ROLE_STORAGE_KEY);
    } catch {
      return null;
    }
  })();

  const resolvedRole: UserRole = isValidRole(queryRole)
    ? queryRole
    : isValidRole(storedRole)
    ? storedRole
    : UserRole.ADMIN;

  if (path.startsWith('/dashboard')) {
    return { view: 'dashboard', role: resolvedRole };
  }
  if (path.startsWith('/login')) {
    return { view: 'login', role: resolvedRole };
  }
  return { view: 'landing', role: resolvedRole };
}

export function App() {
  const initialRoute = parseBrowserRoute();
  const [routeView, setRouteView] = useState<RouteView>(initialRoute.view);
  const [selectedRole, setSelectedRole] = useState<UserRole>(initialRoute.role);
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

  const navigate = useCallback((nextPath: string, replace = false) => {
    if (replace) {
      window.history.replaceState({}, '', nextPath);
    } else {
      window.history.pushState({}, '', nextPath);
    }
    const parsed = parseBrowserRoute();
    setRouteView(parsed.view);
    setSelectedRole(parsed.role);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const parsed = parseBrowserRoute();
      setRouteView(parsed.view);
      setSelectedRole(parsed.role);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleGoToLogin = useCallback(
    (role?: UserRole) => {
      const targetRole = role && isValidRole(role) ? role : selectedRole;
      setSelectedRole(targetRole);
      navigate(`/login?role=${targetRole}`);
    },
    [navigate, selectedRole]
  );

  const handleSelectRoleOnLogin = useCallback((role: UserRole) => {
    setSelectedRole(role);
    window.history.replaceState({}, '', `/login?role=${role}`);
  }, []);

  const handleAuthenticated = useCallback(
    (verifiedSession: VerifiedPortalSession) => {
      try {
        window.sessionStorage.setItem(ACTIVE_ROLE_STORAGE_KEY, verifiedSession.profile.role);
      } catch {
        // Non-fatal in private browsing
      }
      setSession(verifiedSession);
      setSelectedRole(verifiedSession.profile.role);
      navigate(`/dashboard?role=${verifiedSession.profile.role}`, true);
    },
    [navigate]
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
      case UserRole.PHLEBOTOMIST:
        return (
          <PhleboDashboard
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

      {routeView === 'landing' && <LandingPage onGoToLogin={handleGoToLogin} />}

      {routeView === 'login' && !session && (
        <LoginPage
          selectedRole={selectedRole}
          onSelectRole={handleSelectRoleOnLogin}
          onBackToLanding={() => navigate('/')}
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
