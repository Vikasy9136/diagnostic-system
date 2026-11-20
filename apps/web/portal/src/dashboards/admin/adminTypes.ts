import {
  type CoreDepartmentId,
  type OrderStatusBreakdown,
  type OrderTrendBucket,
} from '@diagnostic/shared';
import { type CredentialSlipData, type WeeklyVolumeBarItem } from '../types';

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
  | 'master-data'
  | 'support-sop-faq'
  | 'settings';

export type AdminDeptView = 'ALL' | CoreDepartmentId;

export interface AdminMetrics {
  smallLabsCount: number;
  largeLabsCount: number;
  pendingLabsCount: number;
  onlinePhlebosCount: number;
  totalOrders: number;
  totalSpecimens: number;
  completedCount: number;
  activePickupsCount: number;
  inTransitCount: number;
  todayCompletedCount: number;
  todayOrdersCount: number;
  todayRevenue: number;
  totalRevenue: number;
  grossGmv: number;
  collectedOnline: number;
  awaitingCollection: number;
  platformFees: number;
  labPayouts: number;
  labPayoutsPaid: number;
  labPayoutsDue: number;
  phleboPayouts: number;
  phleboPayoutsPaid: number;
  phleboPayoutsDue: number;
  statusBreakdown: OrderStatusBreakdown;
  trendBuckets: OrderTrendBucket[];
  weeklyBars: WeeklyVolumeBarItem[];
  coldChainRate: string;
}

export interface AdminPasswordTarget {
  email: string;
  name: string;
  userCode?: string;
  roleLabel: string;
  hasPassword?: boolean;
}

export type AdminCredentialSlip = CredentialSlipData;

