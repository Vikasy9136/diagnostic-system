import { AdminDashboard, type AdminRoleScopeConfig } from '../../AdminDashboard';
import { type RoleScopedDashboardProps } from '../field-onboarding/FieldOnboardingDashboard';

const OPS_DISPATCH_SCOPE: AdminRoleScopeConfig = {
  brandSubtitle: 'Operations & Cold-Chain Dispatch',
  defaultTab: 'ops-command',
  allowAdminRoleCreation: false,
  allowedTabs: [
    'ops-command',
    'bookings',
    'labs',
    'labs-small',
    'labs-large',
    'labs-verify',
    'phlebotomists',
    'inventory-kits',
    'samples',
    'reports',
    'zones',
    'master-data',
    'support-sop-faq',
  ],
};

export function OpsDispatchDashboard(props: RoleScopedDashboardProps) {
  return <AdminDashboard {...props} roleScope={OPS_DISPATCH_SCOPE} />;
}
