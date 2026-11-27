import {
  type DailyVolumeBar,
  type PayoutRecord,
  type PickupOrder,
  type SettlementRecord,
  type SpecimenItem,
  type TubeType,
} from '@diagnostic/shared';

export type ScreenType =
  | 'BOOKING_REQUESTS'
  | 'TODAYS_COLLECTIONS'
  | 'BOOKING_DETAILS'
  | 'COLLECT_SAMPLE'
  | 'DROP_SAMPLE'
  | 'COMPLETED'
  | 'KITS_AND_SUPPLIES'
  | 'HELP_AND_SUPPORT'
  | 'TRAINING_SOPS'
  | 'PROFILE_PERSONAL_DETAILS'
  | 'PROFILE_BANKING_PAYOUT'
  | 'PROFILE_WALLET'
  | 'PROFILE_KYC_VERIFICATION'
  | 'PROFILE_MY_DOCUMENTS'
  | 'PROFILE_NOTIFICATIONS'
  | 'PROFILE_ABOUT_APP'
  | 'PROFILE_PRIVACY_POLICY'
  | 'PROFILE_TERMS_CONDITIONS';

export type RequestTab = 'new' | 'active' | 'completed';

export type TodayCollectionFilter = 'all' | 'pending' | 'completed';

export type BottomTab = 'home' | 'tasks' | 'bookings' | 'earnings' | 'profile';

export type BookingHistoryFilter = 'all' | 'active' | 'completed' | 'scheduled';

export interface NominatimSearchHit {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

export interface CompletedReceipt {
  orderNumber: string;
  targetLabName: string;
  feeInr: number;
  tempCelsius: number;
  completedAt: string;
}

export interface OpenPoolEntry {
  order: PickupOrder;
  distFromRiderKm?: number;
  inBroadcastRadius: boolean;
  maxRadiusKm: number;
}

export interface EarningRow {
  order: PickupOrder;
  stl?: SettlementRecord;
  payout?: PayoutRecord;
  payoutRef?: string;
  customerPaid: boolean;
  amountInr: number;
  settled: boolean;
  delivered: boolean;
}

export interface PhleboMetrics {
  todayEarnings: number;
  todayOrdersCount: number;
  todayCompletedCount: number;
  weeklyEarnings: number;
  monthlyEarnings: number;
  totalEarnedDelivered: number;
  settledInr: number;
  pendingPayoutInr: number;
  weeklyBars: DailyVolumeBar[];
}

export interface ActivePaymentLinkState {
  orderId: string;
  orderNumber: string;
  settlementId: string;
  paymentLinkId: string;
  shortUrl: string;
  amountInr: number;
}

export interface CameraModalState {
  mode: 'BARCODE' | 'PHOTO';
  specimenId?: string;
  specimen?: SpecimenItem;
}

export type SpecimenDraftMap = Record<string, { barcode: string; usedTube: TubeType }>;

export type WebNotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

export type FloatingIconSize = 'SM' | 'MD' | 'LG';
export type FloatingIconVisibilityMode = 'ONLINE_ONLY' | 'ALWAYS';

export interface FloatingIconSettings {
  enabled: boolean;
  showOutsideApp: boolean;
  visibilityMode: FloatingIconVisibilityMode;
  snapToEdge: boolean;
  showBadgeAndPulse: boolean;
  size: FloatingIconSize;
  opacityPct: 100 | 85 | 70;
}

export const DEFAULT_FLOATING_ICON_SETTINGS: FloatingIconSettings = {
  enabled: true,
  showOutsideApp: true,
  visibilityMode: 'ONLINE_ONLY',
  snapToEdge: true,
  showBadgeAndPulse: true,
  size: 'MD',
  opacityPct: 100,
};
