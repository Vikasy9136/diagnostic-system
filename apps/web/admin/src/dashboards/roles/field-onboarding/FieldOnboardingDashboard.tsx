import { AdminDashboard, type AdminRoleScopeConfig } from '../../AdminDashboard';
import { type VerifiedPortalSession } from '../../../components/AuthGateScreen';
import { type AlertTriggerFn } from '../../types';
import { FieldOnboardingOverviewTab } from './FieldOnboardingOverviewTab';

export interface RoleScopedDashboardProps {
  session: VerifiedPortalSession;
  onSignOut: () => void;
  onShowAlert: AlertTriggerFn;
}

const FIELD_ONBOARDING_SCOPE: AdminRoleScopeConfig = {
  brandSubtitle: 'Field Onboarding & Partner Hub',
  defaultTab: 'dashboard',
  allowAdminRoleCreation: false,
  allowedTabs: [
    'dashboard',
    'labs',
    'labs-small',
    'labs-large',
    'labs-verify',
    'phlebotomists',
    'zones',
    'agreements',
    'support-sop-faq',
  ],
  renderCustomOverview: ({ labs, phlebotomists, onSelectTab, onOpenAddUserModal }) => (
    <FieldOnboardingOverviewTab
      labs={labs}
      phlebotomists={phlebotomists}
      onSelectTab={onSelectTab}
      onOpenAddUserModal={onOpenAddUserModal}
    />
  ),
};

export function FieldOnboardingDashboard(props: RoleScopedDashboardProps) {
  return <AdminDashboard {...props} roleScope={FIELD_ONBOARDING_SCOPE} />;
}
