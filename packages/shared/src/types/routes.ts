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
  | 'rates'
  | 'settlements'
  | 'analytics'
  | 'settings';

export interface DashboardRouteMeta<TTab extends string = string> {
  tab: TTab;
  path: string;
  aliases?: string[];
  title: string;
  navLabel: string;
}

