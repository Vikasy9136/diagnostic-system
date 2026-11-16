import {
  type DiagnosticTestItem,
  type OrderStatusBreakdown,
} from '@diagnostic/shared';
import { type WeeklyVolumeBarItem } from '../types';

export type LargeLabTab =
  | 'dashboard'
  | 'incoming'
  | 'testing'
  | 'reports'
  | 'rates'
  | 'settlements'
  | 'analytics'
  | 'settings';

export interface LargeLabMetrics {
  incomingCount: number;
  inTestingCount: number;
  completedCount: number;
  totalReceivable: number;
  paidReceivable: number;
  pendingReceivable: number;
  statusBreakdown: OrderStatusBreakdown;
  weeklyBars: WeeklyVolumeBarItem[];
  avgTatMins: number;
}

export interface LargeLabOrgCatalogItems {
  owned: DiagnosticTestItem[];
  globalFallback: DiagnosticTestItem[];
  singleTests: DiagnosticTestItem[];
}
