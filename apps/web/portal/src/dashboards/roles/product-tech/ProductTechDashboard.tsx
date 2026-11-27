import { AdminDashboard, type AdminRoleScopeConfig } from '../../AdminDashboard';
import { type RoleScopedDashboardProps } from '../field-onboarding/FieldOnboardingDashboard';

const PRODUCT_TECH_SCOPE: AdminRoleScopeConfig = {
  brandSubtitle: 'Product, Platform Health & Tech',
  defaultTab: 'product-tech',
  allowAdminRoleCreation: false,
  allowedTabs: [
    'product-tech',
    'audit-logs',
    'support-sop-faq',
  ],
};

export function ProductTechDashboard(props: RoleScopedDashboardProps) {
  return <AdminDashboard {...props} roleScope={PRODUCT_TECH_SCOPE} />;
}
