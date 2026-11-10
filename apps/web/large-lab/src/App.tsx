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
import { LargeLabDashboard } from './dashboards/LargeLabDashboard';

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
      title: 'Sign Out of Reference Hub Portal?',
      message: `End active Partner Reference Lab session for ${session?.profile.email || 'this account'}?`,
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
          requiredRole={UserRole.LARGE_LAB}
          portalTitle="Partner Reference Lab"
          portalSubtitle="QC Specimen Accessioning, Analyzers & Verified Report Publishing"
          onShowAlert={(opts) => showDynamicAlert(opts)}
          onAuthenticated={(verified) => setSession(verified)}
        />
      ) : (
        <LargeLabDashboard
          session={session}
          onSignOut={handleSignOut}
          onShowAlert={showDynamicAlert}
        />
      )}
    </>
  );
}
