import { isEffectiveSuperAdmin, type UserProfile } from '@diagnostic/shared';
import { AdminDashboard } from '../AdminDashboard';
import {
  FieldOnboardingDashboard,
  type RoleScopedDashboardProps,
} from './field-onboarding/FieldOnboardingDashboard';
import { OpsDispatchDashboard } from './ops-dispatch/OpsDispatchDashboard';
import { FinanceDashboard } from './finance/FinanceDashboard';
import { MarketingDashboard } from './marketing/MarketingDashboard';
import { ProductTechDashboard } from './product-tech/ProductTechDashboard';

export {
  FieldOnboardingDashboard,
  OpsDispatchDashboard,
  FinanceDashboard,
  MarketingDashboard,
  ProductTechDashboard,
  type RoleScopedDashboardProps,
};

/**
 * Selects the dedicated folder-based workspace for an ADMIN-role staff account
 * so Super Admin's Executive Dashboard & Settings are never exposed to scoped staff.
 */
export function resolveAdminRoleDashboard(
  profile: UserProfile,
  rootAdminEmail: string
) {
  if (isEffectiveSuperAdmin(profile, rootAdminEmail)) {
    return AdminDashboard;
  }

  switch (profile.adminSubRole) {
    case 'FIELD_ONBOARDING_OFFICER':
      return FieldOnboardingDashboard;
    case 'FINANCE_BUSINESS_HEAD':
    case 'FINANCE_B2B':
      return FinanceDashboard;
    case 'OPS_DISPATCH':
    case 'OPERATIONS_PARTNERSHIPS_HEAD':
      return OpsDispatchDashboard;
    case 'MARKETING_GROWTH_HEAD':
    case 'MARKETING_EXECUTIVE':
      return MarketingDashboard;
    case 'PRODUCT_TECHNOLOGY_HEAD':
      return ProductTechDashboard;
    default:
      return AdminDashboard;
  }
}
