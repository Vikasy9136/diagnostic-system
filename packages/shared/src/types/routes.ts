export type SmallLabTab =
  | 'dashboard'
  | 'new-booking'
  | 'patients'
  | 'catalogue'
  | 'partners'
  | 'bookings'
  | 'reports'
  | 'payments'
  | 'support';

export type AdminTab =
  | 'dashboard'
  | 'org-structure'
  | 'employees'
  | 'finance-ops'
  | 'ops-command'
  | 'urgent-reports'
  | 'marketing-growth'
  | 'product-tech'
  | 'audit-logs'
  | 'users'
  | 'bookings'
  | 'labs'
  | 'labs-small'
  | 'labs-large'
  | 'labs-verify'
  | 'phlebotomists'
  | 'inventory-kits'
  | 'samples'
  | 'reports'
  | 'payments'
  | 'commission'
  | 'analytics'
  | 'zones'
  | 'agreements'
  | 'master-data'
  | 'support-sop-faq'
  | 'settings';

export type LargeLabTab =
  | 'dashboard'
  | 'incoming'
  | 'testing'
  | 'reports'
  | 'urgent-reports'
  | 'rates'
  | 'centres'
  | 'settlements'
  | 'wallet'
  | 'analytics'
  | 'settings';

export interface DashboardRouteMeta<TTab extends string = string> {
  tab: TTab;
  path: string;
  aliases?: string[];
  title: string;
  navLabel: string;
}

