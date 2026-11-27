import { AdminDashboard, type AdminRoleScopeConfig } from '../../AdminDashboard';
import { type RoleScopedDashboardProps } from '../field-onboarding/FieldOnboardingDashboard';

const FINANCE_SCOPE: AdminRoleScopeConfig = {
  brandSubtitle: 'Finance, Settlements & Billing',
  defaultTab: 'finance-ops',
  allowAdminRoleCreation: false,
  allowedTabs: [
    'finance-ops',
    'payments',
    'commission',
    'analytics',
    'agreements',
    'support-sop-faq',
  ],
};

export function FinanceDashboard(props: RoleScopedDashboardProps) {
  return <AdminDashboard {...props} roleScope={FINANCE_SCOPE} />;
}
