import { useState, useCallback } from 'react';
import { UserRole } from '@diagnostic/shared';
import { signOut } from 'firebase/auth';
import { auth } from './firebase';
import {
  AuthGateScreen,
  type VerifiedPortalSession,
} from './components/AuthGateScreen';
import {
  DynamicAlertModal,
  INITIAL_DYNAMIC_ALERT,
  type DynamicAlertState,
  type DynamicAlertVariant,
} from './components/DynamicAlertModal';
import { AdminDashboard } from './dashboards/AdminDashboard';

export default function App() {
  const [session, setSession] = useState<VerifiedPortalSession | null>(null);
  const [alertState, setAlertState] = useState<DynamicAlertState>(INITIAL_DYNAMIC_ALERT);

  const showDynamicAlert = useCallback(
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

  const handleSignOut = () => {
    showDynamicAlert({
      variant: 'confirm',
      title: 'Sign Out of Admin Control Tower?',
      message: `End active Platform Admin session for ${session?.profile.email || 'this account'}?`,
      confirmLabel: 'Sign Out',
      cancelLabel: 'Stay Signed In',
      onConfirm: () => {
        void (async () => {
          if (auth.currentUser) {
            await signOut(auth);
          }
          setSession(null);
        })();
      },
    });
  };

  return (
    <>
      <DynamicAlertModal
        alertState={alertState}
        onClose={() => setAlertState(INITIAL_DYNAMIC_ALERT)}
      />

      {!session ? (
        <AuthGateScreen
          requiredRole={UserRole.ADMIN}
          portalTitle="Admin Control Tower"
          portalSubtitle="Central Operations & Account Management"
          onShowAlert={(opts) => showDynamicAlert(opts)}
          onAuthenticated={(verified) => setSession(verified)}
        />
      ) : (
        <AdminDashboard
          session={session}
          onSignOut={handleSignOut}
          onShowAlert={showDynamicAlert}
        />
      )}
    </>
  );
}
