import { AdminDashboard, type AdminRoleScopeConfig } from '../../AdminDashboard';
import { type RoleScopedDashboardProps } from '../field-onboarding/FieldOnboardingDashboard';

const MARKETING_SCOPE: AdminRoleScopeConfig = {
  brandSubtitle: 'Marketing, Leads & Partner Growth',
  defaultTab: 'marketing-growth',
  allowAdminRoleCreation: false,
  allowedTabs: [
    'marketing-growth',
    'labs',
    'labs-small',
    'labs-large',
    'support-sop-faq',
  ],
};

export function MarketingDashboard(props: RoleScopedDashboardProps) {
  return <AdminDashboard {...props} roleScope={MARKETING_SCOPE} />;
}
