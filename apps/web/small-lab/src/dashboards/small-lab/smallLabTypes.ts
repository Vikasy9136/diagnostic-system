import {
  type OrderStatusBreakdown,
  type OrderTrendBucket,
  type TubeType,
} from '@diagnostic/shared';
import { type WeeklyVolumeBarItem } from '../types';

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

export interface SmallLabMetrics {
  totalBookings: number;
  activePickupsCount: number;
  inTransitCount: number;
  completedCount: number;
  totalBilled: number;
  paidOnline: number;
  pendingPay: number;
  statusBreakdown: OrderStatusBreakdown;
  trendBuckets: OrderTrendBucket[];
  weeklyBars: WeeklyVolumeBarItem[];
}

export interface SelectableCatalogEntry {
  code: string;
  name: string;
  itemType: 'TEST' | 'PACKAGE';
  includedTestCodes?: string[];
  department: string;
  tubeType: TubeType;
  minPrice: number;
}

export interface ResolvedDropInfo {
  targetLabId: string;
  targetParentLabId?: string;
  targetLabName: string;
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;
  distanceKm: number;
  split: {
    smallLabTestTotalInr: number;
    courierFeeInr: number;
    baseCourierInr: number;
    extraDistanceKm: number;
    distanceFeeInr: number;
    statSurchargeInr: number;
    grossAmountInr: number;
    platformFeeInr: number;
    labPayoutInr: number;
    phleboPayoutInr: number;
    appliedCommissionPct: number;
  };
}
