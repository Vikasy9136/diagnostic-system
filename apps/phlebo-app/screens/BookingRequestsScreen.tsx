import React from 'react';
import { Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  evaluatePointServiceCoverage,
  formatInr,
  formatOrderStatus,
  isOrderCompleted,
  type LiveGeoCoordinate,
  OrderStatus,
  type PhlebotomistShiftStatus,
  type PickupOrder,
  type ServiceZoneRecord,
  TUBE_METADATA,
  TubeType,
} from '@diagnostic/shared';
import {
  BRAND_COLORS,
  BRAND_FONTS,
  LabSetuLogoMark,
  LabSetuWordmark,
} from '../components/LabSetuBrand';
import { COLORS, FONTS, styles } from '../styles/phleboStyles';
import { formatFullProperAddress } from '../utils/addressUtils';
import {
  type OpenPoolEntry,
  type PhleboMetrics,
  type RequestTab,
  type WebNotificationPermissionState,
} from '../types/phleboTypes';
import { formatLabel } from '../utils/phleboHelpers';
import { COMPACT_TEXT_SCALE, MAX_TEXT_SCALE, rf, rs, useResponsive } from '../utils/responsive';

export interface BookingRequestsScreenProps {
  phleboInitial: string;
  phleboFirstName: string;
  displayCourierId: string;
  isOnline: boolean;
  dutyStatus: PhlebotomistShiftStatus;
  metrics: PhleboMetrics;
  gpsSourceLabel: string;
  riderLocation: LiveGeoCoordinate;
  riderFullAddress?: string;
  assignedAdminZone?: ServiceZoneRecord | null;
  riderCoverage: ReturnType<typeof evaluatePointServiceCoverage>;
  todayPendingCount?: number;
  webNotifPerm: WebNotificationPermissionState;
  effectivePhleboId: string;
  adminLoginEmail: string;
  requestTab: RequestTab;
  radiusOnlyFilter: boolean;
  openPoolOrdersCount: number;
  openPoolWithDistance: OpenPoolEntry[];
  activeAssignedOrders: PickupOrder[];
  completedAssignedOrders: PickupOrder[];
  submittingAction: boolean;
  collectingOrderId: string | null;
  onShiftUpdate: (nextStatus: PhlebotomistShiftStatus) => void;
  onOpenLocationPicker: () => void;
  onRequestBackgroundAlertPermission: () => void;
  onSelectRequestTab: (tab: RequestTab) => void;
  onSelectRadiusOnlyFilter: (radiusOnly: boolean) => void;
  onAcceptPoolOrder: (order: PickupOrder) => void;
  onDeclineAssignedOrder: (order: PickupOrder) => void;
  onCollectBookingPayment: (order: PickupOrder) => void;
  onOpenOrderWorkflow: (order: PickupOrder) => void;
  onOpenDrawer?: () => void;
  onOpenNotifications?: () => void;
  unreadNotifCount?: number;
  onOpenTodayCollections?: () => void;
  onOpenHistoryTab?: () => void;
  onOpenTrainingSops?: () => void;
  onOpenHelpSupport?: () => void;
  onOpenTodayRoute?: () => void;
}

function getTimeGreeting(): string {
  const hr = new Date().getHours();
  if (hr < 12) return 'Good Morning,';
  if (hr < 17) return 'Good Afternoon,';
  return 'Good Evening,';
}

export function BookingRequestsScreen({
  phleboInitial,
  phleboFirstName,
  displayCourierId,
  isOnline,
  dutyStatus,
  metrics,
  gpsSourceLabel,
  riderLocation,
  riderFullAddress,
  assignedAdminZone,
  riderCoverage,
  todayPendingCount,
  webNotifPerm,
  effectivePhleboId,
  adminLoginEmail,
  requestTab,
  radiusOnlyFilter,
  openPoolOrdersCount,
  openPoolWithDistance,
  activeAssignedOrders,
  completedAssignedOrders,
  submittingAction,
  collectingOrderId,
  onShiftUpdate,
  onOpenLocationPicker,
  onRequestBackgroundAlertPermission,
  onSelectRequestTab,
  onSelectRadiusOnlyFilter,
  onAcceptPoolOrder,
  onDeclineAssignedOrder,
  onCollectBookingPayment,
  onOpenOrderWorkflow,
  onOpenDrawer,
  onOpenNotifications,
  unreadNotifCount = 0,
  onOpenTodayCollections,
  onOpenHistoryTab,
  onOpenTrainingSops,
  onOpenHelpSupport,
  onOpenTodayRoute,
}: BookingRequestsScreenProps) {
  const { width: winWidth } = useResponsive();
  const quickTileWidth = Math.floor((winWidth - rs(32) - rs(10)) / 2);

  const inRadiusCount = openPoolWithDistance.filter((x) => x.inBroadcastRadius).length;
  const pendingCount = activeAssignedOrders.length;
  const displayedEntries: OpenPoolEntry[] =
    requestTab === 'new'
      ? (radiusOnlyFilter
          ? openPoolWithDistance.filter((x) => x.inBroadcastRadius)
          : openPoolWithDistance)
      : requestTab === 'completed'
      ? completedAssignedOrders.map((order) => ({
          order,
          distFromRiderKm: undefined,
          inBroadcastRadius: false,
          maxRadiusKm: order.broadcastRadiusKm || 5,
        }))
      : activeAssignedOrders.map((order) => ({
          order,
          distFromRiderKm: undefined,
          inBroadcastRadius: false,
          maxRadiusKm: order.broadcastRadiusKm || 5,
        }));

  return (
    <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
      <LinearGradient
        colors={['#061D42', '#0A2A5E', '#0D5E6B']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroHeader}
      >
        {/* Top Chrome: Back (on Done sub-view) or Hamburger Menu (Home root), Brand, Notification Bell */}
        <View style={styles.topChromeRow}>
          {requestTab === 'completed' ? (
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => onSelectRequestTab('active')}
              hitSlop={8}
              accessibilityLabel="Back to Assigned Tasks"
              activeOpacity={0.75}
            >
              <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={onOpenDrawer}
              accessibilityLabel="Open Navigation Menu"
              activeOpacity={0.75}
            >
              <Ionicons name="menu" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 }}>
            <LabSetuLogoMark size={30} />
            <LabSetuWordmark darkBg fontSize={rf(18.5)} subtitle="Phlebo App" />
          </View>

          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={onOpenNotifications}
            activeOpacity={0.75}
          >
            <Ionicons name="notifications-outline" size={21} color="#FFFFFF" />
            {unreadNotifCount > 0 ? (
              <View
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  backgroundColor: '#EF4444',
                  borderRadius: 999,
                  minWidth: 16,
                  height: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 3,
                  borderWidth: 1.5,
                  borderColor: '#0F172A',
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '800', lineHeight: 10 }}>
                  {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                </Text>
              </View>
            ) : openPoolOrdersCount > 0 ? (
              <View style={styles.bellDot} />
            ) : null}
          </TouchableOpacity>
        </View>

        {/* Avatar, Time Greeting & Duty Pill */}
        <View style={styles.heroRow}>
          <View style={styles.profileSection}>
            <View style={styles.avatarCircle}>
              <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.avatarText}>
                {phleboInitial}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.greetingSubtitle}>
                {getTimeGreeting()}
              </Text>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.greetingTitle}>
                {phleboFirstName} ({displayCourierId})
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.onlinePill,
              {
                backgroundColor: isOnline
                  ? '#16A34A'
                  : dutyStatus === 'BREAK'
                  ? '#D97706'
                  : '#334155',
                borderWidth: 1.5,
                borderColor: isOnline
                  ? 'rgba(255,255,255,0.45)'
                  : dutyStatus === 'BREAK'
                  ? '#FCD34D'
                  : 'rgba(255,255,255,0.28)',
              },
            ]}
            onPress={() => onShiftUpdate(isOnline ? 'OFFLINE' : 'ONLINE')}
            activeOpacity={0.82}
            accessibilityRole="switch"
            accessibilityState={{ checked: isOnline }}
            accessibilityLabel={
              isOnline ? 'Duty status Online, tap to go Offline' : 'Duty status Offline, tap to go Online'
            }
          >
            <View
              style={{
                width: 30,
                height: 18,
                borderRadius: 9,
                backgroundColor: isOnline ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.18)',
                padding: 2,
                flexDirection: 'row',
                justifyContent: isOnline ? 'flex-end' : 'flex-start',
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  backgroundColor: '#FFFFFF',
                }}
              />
            </View>
            <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.onlinePillText}>
              {dutyStatus === 'ONLINE'
                ? 'Online'
                : dutyStatus === 'BREAK'
                ? 'Break'
                : 'Offline'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Overlapping 3-Column Summary Card (tap opens Today's Collections) */}
        <TouchableOpacity
          style={styles.summaryCard}
          activeOpacity={0.88}
          onPress={onOpenTodayCollections}
        >
          <View style={styles.summaryMetricsRow}>
            <View style={styles.summaryMetricCol}>
              <View style={[styles.summaryIconBadge, { backgroundColor: '#EFF6FF' }]}>
                <Ionicons name="calendar-outline" size={18} color="#2563EB" />
              </View>
              <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.metricLabel}>
                Today&apos;s Tasks
              </Text>
              <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.metricNumber}>
                {metrics.todayOrdersCount}
              </Text>
            </View>

            <View style={styles.summaryDivider} />

            <View style={styles.summaryMetricCol}>
              <View style={[styles.summaryIconBadge, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="clipboard-outline" size={18} color="#D97706" />
              </View>
              <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.metricLabel}>
                Pending
              </Text>
              <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.metricNumber}>
                {typeof todayPendingCount === 'number'
                  ? todayPendingCount
                  : activeAssignedOrders.length}
              </Text>
            </View>

            <View style={styles.summaryDivider} />

            <View style={styles.summaryMetricCol}>
              <View style={[styles.summaryIconBadge, { backgroundColor: '#DCFCE7' }]}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#16A34A" />
              </View>
              <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.metricLabel}>
                Completed
              </Text>
              <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.metricNumber}>
                {metrics.todayCompletedCount}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </LinearGradient>

      <View style={[styles.bodyContainer, { paddingTop: rs(52) }]}>
        {/* 2x2 Quick Action Tiles Grid matching screenshot */}
        <View style={styles.quickTilesGrid}>
          <TouchableOpacity
            style={[styles.quickTileCard, { width: quickTileWidth, flexGrow: 0 }]}
            onPress={() => onSelectRequestTab('active')}
            activeOpacity={0.8}
          >
            <View style={{ position: 'relative' }}>
              <Ionicons name="clipboard-outline" size={28} color={BRAND_COLORS.navyPrimary} />
              {pendingCount > 0 ? (
                <View style={styles.quickTileBadge}>
                  <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.quickTileBadgeText}>
                    {pendingCount}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.quickTileTitle}>
              Assigned Tasks
            </Text>
            <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.quickTileSub}>
              {formatInr(metrics.todayEarnings)} today
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickTileCard, { width: quickTileWidth, flexGrow: 0 }]}
            onPress={() => (onOpenHistoryTab ? onOpenHistoryTab() : onSelectRequestTab('completed'))}
            activeOpacity={0.8}
          >
            <Ionicons name="time-outline" size={28} color={BRAND_COLORS.tealPrimary} />
            <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.quickTileTitle}>
              History
            </Text>
            <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.quickTileSub}>
              {completedAssignedOrders.length} completed
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickTileCard, { width: quickTileWidth, flexGrow: 0 }]}
            onPress={onOpenTrainingSops}
            activeOpacity={0.8}
          >
            <Ionicons name="book-outline" size={28} color={BRAND_COLORS.tealPrimary} />
            <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.quickTileTitle}>
              Training
            </Text>
            <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.quickTileSub}>
              Cold-chain SOPs
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickTileCard, { width: quickTileWidth, flexGrow: 0 }]}
            onPress={onOpenHelpSupport}
            activeOpacity={0.8}
          >
            <Ionicons name="headset-outline" size={28} color={BRAND_COLORS.navyPrimary} />
            <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.quickTileTitle}>
              Support
            </Text>
            <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.quickTileSub}>
              Live Admin Desk
            </Text>
          </TouchableOpacity>
        </View>

        {/* Dedicated Today's Collections Card matching reference UI */}
        {onOpenTodayCollections ? (
          <TouchableOpacity
            style={[
              styles.gpsTelemetryBar,
              {
                marginBottom: rs(12),
                paddingVertical: rs(13),
                backgroundColor: '#FFFFFF',
                borderColor: '#DCE5F2',
              },
            ]}
            onPress={onOpenTodayCollections}
            activeOpacity={0.85}
          >
            <View
              style={[
                styles.summaryIconBadge,
                { backgroundColor: '#EEF2FF', marginBottom: 0, width: rs(38), height: rs(38) },
              ]}
            >
              <Ionicons name="calendar-outline" size={20} color={BRAND_COLORS.navyPrimary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                maxFontSizeMultiplier={MAX_TEXT_SCALE}
                style={[styles.quickTileTitle, { marginTop: 0, textAlign: 'left', fontSize: rf(14) }]}
              >
                Today&apos;s Collections
              </Text>
              <Text
                maxFontSizeMultiplier={MAX_TEXT_SCALE}
                style={[styles.quickTileSub, { textAlign: 'left' }]}
              >
                {metrics.todayOrdersCount} scheduled • {metrics.todayCompletedCount} done today
              </Text>
            </View>
            {(typeof todayPendingCount === 'number'
              ? todayPendingCount
              : activeAssignedOrders.length) > 0 ? (
              <View
                style={{
                  backgroundColor: '#FEE2E2',
                  paddingHorizontal: rs(9),
                  paddingVertical: rs(4),
                  borderRadius: 999,
                }}
              >
                <Text
                  maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                  style={{
                    color: '#DC2626',
                    fontFamily: FONTS.bold,
                    fontSize: rf(11),
                  }}
                >
                  {typeof todayPendingCount === 'number'
                    ? todayPendingCount
                    : activeAssignedOrders.length}{' '}
                  Pending
                </Text>
              </View>
            ) : null}
            <Ionicons name="chevron-forward" size={18} color={BRAND_COLORS.muted} />
          </TouchableOpacity>
        ) : null}

        {/* Teal Primary Route CTA matching screenshot */}
        <TouchableOpacity
          style={styles.routeHeroBtn}
          onPress={onOpenTodayRoute || onOpenLocationPicker}
          activeOpacity={0.85}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <Ionicons name="navigate" size={19} color="#FFFFFF" />
            <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.routeHeroBtnText}>
              View Today&apos;s Route
            </Text>
          </View>
          <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
        </TouchableOpacity>

        {/* Admin-Assigned Zone & Live GPS Telemetry Bar (Read-Only Zone + Live GPS Sync) */}
        <View style={styles.gpsTelemetryBar}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.gpsTelemetryTitle} numberOfLines={1}>
              📍 {riderFullAddress || (assignedAdminZone ? `${assignedAdminZone.name} (${assignedAdminZone.zoneCode})` : 'Active Service Zone')}
            </Text>
            <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.gpsTelemetrySub}>
              {isOnline
                ? `Live GPS Active • ${assignedAdminZone?.radiusKm || 5} km radar coverage • ${inRadiusCount} nearby open request(s)`
                : 'Offline • Switch Online to receive live nearby pickup popups'}
            </Text>
            <View
              style={[
                styles.zoneCoveragePill,
                {
                  backgroundColor:
                    assignedAdminZone && !assignedAdminZone.isActive
                      ? '#FEE2E2'
                      : riderCoverage.covered || assignedAdminZone?.isActive
                      ? '#DCFCE7'
                      : '#FEF3C7',
                },
              ]}
            >
              <Text
                maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                style={[
                  styles.zoneCoverageText,
                  {
                    color:
                      assignedAdminZone && !assignedAdminZone.isActive
                        ? '#B91C1C'
                        : riderCoverage.covered || assignedAdminZone?.isActive
                        ? '#15803D'
                        : '#B45309',
                  },
                ]}
              >
                {assignedAdminZone
                  ? assignedAdminZone.isActive
                    ? `Admin Zone: ${assignedAdminZone.zoneCode} (${assignedAdminZone.city})`
                    : `Admin Zone Paused: ${assignedAdminZone.zoneCode}`
                  : riderCoverage.covered
                  ? `Active Area: ${riderCoverage.matchedZone?.zoneCode || ''} (${riderCoverage.matchedZone?.city || 'Live'})`
                  : `Outside Pilot Zone (${riderCoverage.distanceToNearestKm} km away)`}
              </Text>
            </View>
          </View>
          <TouchableOpacity style={styles.gpsPickerBtn} onPress={onOpenLocationPicker}>
            <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.gpsPickerBtnText}>
              Zone &amp; GPS
            </Text>
          </TouchableOpacity>
        </View>

        {Platform.OS === 'web' && webNotifPerm !== 'granted' && webNotifPerm !== 'unsupported' ? (
          <TouchableOpacity
            style={styles.notifBannerBtn}
            onPress={onRequestBackgroundAlertPermission}
          >
            <Text style={styles.notifBannerBtnText}>
              Enable Background Pickup Popups (Alerts when tab is minimized)
            </Text>
          </TouchableOpacity>
        ) : null}

        {!effectivePhleboId ? (
          <View style={styles.warningBox}>
            <Text style={styles.warningBoxText}>
              Your account does not have a Courier ID yet. Ask Platform Admin (
              {adminLoginEmail}) to assign one under Team &amp; Partner Accounts so you can claim
              bookings.
            </Text>
          </View>
        ) : null}

        {/* Incoming live dispatch banner (if any pickup is available in radar) */}
        {inRadiusCount > 0 && onOpenNotifications ? (
          <TouchableOpacity
            style={{
              backgroundColor: '#0F766E',
              borderColor: '#14B8A6',
              borderWidth: 1,
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
            onPress={onOpenNotifications}
            activeOpacity={0.85}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
              <Ionicons name="radio" size={20} color="#34D399" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>
                  ⚡ {inRadiusCount} Incoming Pickup Request{inRadiusCount > 1 ? 's' : ''} Nearby
                </Text>
                <Text style={{ color: '#CCFBF1', fontSize: 11 }}>
                  Tap to view and accept incoming sample pickup
                </Text>
              </View>
            </View>
            <View
              style={{
                backgroundColor: '#134E4A',
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 8,
              }}
            >
              <Text style={{ color: '#5EEAD4', fontSize: 12, fontWeight: '700' }}>Review Alert →</Text>
            </View>
          </TouchableOpacity>
        ) : null}

        {/* Filter Tabs Row: New Requests, Assigned Tasks, Completed */}
        <View style={styles.requestTabsRow}>
          <TouchableOpacity
            style={[
              styles.tabButton,
              requestTab === 'new' && styles.tabButtonActive,
              openPoolWithDistance.length > 0 && requestTab !== 'new' && { backgroundColor: '#FEF3C7' },
            ]}
            onPress={() => onSelectRequestTab('new')}
          >
            <Text
              style={[
                styles.tabButtonText,
                requestTab === 'new' && styles.tabButtonTextActive,
                openPoolWithDistance.length > 0 && requestTab !== 'new' && { color: '#B45309', fontWeight: '800' },
              ]}
            >
              {openPoolWithDistance.length > 0 ? `⚡ New (${openPoolWithDistance.length})` : 'New Requests'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, requestTab === 'active' && styles.tabButtonActive]}
            onPress={() => onSelectRequestTab('active')}
          >
            <Text
              style={[
                styles.tabButtonText,
                requestTab === 'active' && styles.tabButtonTextActive,
              ]}
            >
              Assigned ({activeAssignedOrders.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, requestTab === 'completed' && styles.tabButtonActive]}
            onPress={() => onSelectRequestTab('completed')}
          >
            <Text
              style={[
                styles.tabButtonText,
                requestTab === 'completed' && styles.tabButtonTextActive,
              ]}
            >
              Done ({completedAssignedOrders.length})
            </Text>
          </TouchableOpacity>
        </View>

        {displayedEntries.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="clipboard-outline" size={32} color={BRAND_COLORS.tealPrimary} />
            <Text style={[styles.emptyTitle, { marginTop: 8 }]}>
              {requestTab === 'new'
                ? 'No Open Pickup Requests Right Now'
                : requestTab === 'active'
                ? 'No Pickups Assigned'
                : 'No Completed Collections Yet'}
            </Text>
            <Text style={styles.emptySub}>
              {requestTab === 'new'
                ? 'Stay Online. When partner labs create new sample pickups, they will appear here with distance and payout for you to accept.'
                : requestTab === 'active'
                ? 'Check the "New" tab above to accept open pickups, or wait for direct lab assignments.'
                : 'Completed pickups and sample delivery history will show here.'}
            </Text>
          </View>
        ) : (
          displayedEntries.map(({ order, distFromRiderKm, inBroadcastRadius, maxRadiusKm }) => {
            const isOpenPool = requestTab === 'new';
            const stUpper = String(order.status || '').toUpperCase();
            const isDone =
              stUpper.includes('DELIVER') ||
              stUpper.includes('ANALYS') ||
              stUpper.includes('REPORT') ||
              stUpper.includes('COMPLET') ||
              stUpper.includes('CANCEL') ||
              stUpper.includes('REJECT') ||
              Boolean(order.actualDeliveredAt) ||
              Boolean(order.arrivalTemperatureCelsius) ||
              isOrderCompleted(order.status);
            const isInTransit =
              order.status === OrderStatus.PICKED_UP ||
              order.status === OrderStatus.IN_TRANSIT;
            const isPaidOrder = order.paymentStatus === 'PAID';
            const collectableInr = order.totalAmountInr || order.courierFeeInr || 0;
            const specimens = order.specimens || [];
            const dropBadge =
              order.dropType === 'SELF_DROP'
                ? 'Return to Collection Centre'
                : order.dropType === 'CUSTOM_ADDRESS'
                ? 'Custom Drop'
                : 'Reference Hub';

            return (
              <View key={order.id} style={styles.bookingCard}>
                <View style={styles.bookingCardTop}>
                  <View style={styles.vialIconBadge}>
                    <MaterialCommunityIcons
                      name="test-tube"
                      size={22}
                      color={BRAND_COLORS.tealPrimary}
                    />
                  </View>

                  <View style={{ flex: 1, minWidth: 0, paddingRight: 4 }}>
                    <View style={styles.labIdPill}>
                      <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.labIdPillText}>
                        {order.orderNumber}
                      </Text>
                    </View>
                    <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.bookingTitle}>
                      {order.patient.pseudonym}
                    </Text>
                    <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.bookingId}>
                      {isOpenPool ? 'Open Pickup Request' : formatOrderStatus(order.status)}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                    <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.bookingPrice}>
                      {formatInr(order.courierFeeInr || 0)}
                    </Text>
                    <View style={[styles.pickupTimeBadge, { marginTop: 4, marginBottom: 0, alignSelf: 'flex-end' }]}>
                      <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.pickupTimeText}>
                        {formatLabel(order.priority)}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.badgeWrapRow}>
                  <View
                    style={[
                      styles.distanceBadge,
                      {
                        backgroundColor: isPaidOrder ? '#DCFCE7' : '#DBEAFE',
                      },
                    ]}
                  >
                    <Text
                      maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                      style={[
                        styles.distanceBadgeText,
                        { fontFamily: FONTS.bold, color: isPaidOrder ? '#15803D' : '#1D4ED8' },
                      ]}
                    >
                      {isPaidOrder ? 'Paid Online' : `Collect ${formatInr(collectableInr)}`}
                    </Text>
                  </View>

                  {isOpenPool && distFromRiderKm !== undefined ? (
                    <View
                      style={[
                        styles.distanceBadge,
                        inBroadcastRadius && styles.distanceBadgeHot,
                      ]}
                    >
                      <Text
                        maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                        style={[
                          styles.distanceBadgeText,
                          inBroadcastRadius && styles.distanceBadgeTextHot,
                        ]}
                      >
                        {inBroadcastRadius
                          ? `LIVE IN ${maxRadiusKm} KM (${distFromRiderKm} km)`
                          : `${distFromRiderKm} km away`}
                      </Text>
                    </View>
                  ) : null}

                  {typeof order.distanceKm === 'number' && order.distanceKm > 0 ? (
                    <View style={styles.distanceBadge}>
                      <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.distanceBadgeText}>
                        Route {order.distanceKm} km
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.distanceBadge}>
                    <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.distanceBadgeText}>
                      {dropBadge}
                    </Text>
                  </View>
                </View>

                <View style={styles.routeContainer}>
                  <View style={styles.routeRow}>
                    <View style={[styles.dotMarker, { backgroundColor: COLORS.primaryTeal }]} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.routePlaceTitle}>
                        {order.smallLabName}
                      </Text>
                      <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={[styles.routePlaceSubtitle, { color: '#0F172A', fontWeight: '500' }]}>
                        {formatFullProperAddress(order.pickupLocation, order.smallLabName)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.routeConnectingLine} />

                  <View style={styles.routeRow}>
                    <View style={[styles.dotMarker, { backgroundColor: COLORS.primaryNavy }]} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.routePlaceTitle}>
                        {order.targetLabName}
                      </Text>
                      <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={[styles.routePlaceSubtitle, { color: '#0F172A', fontWeight: '500' }]}>
                        {formatFullProperAddress(order.deliveryLocation, order.targetLabName)}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.tubePillRow}>
                  {specimens.map((s) => {
                    const meta = TUBE_METADATA[s.tubeType] || TUBE_METADATA[TubeType.SERUM_RED_GOLD];
                    return (
                      <View
                        key={s.id}
                        style={[styles.specimenTagPill, { backgroundColor: meta.bgHex }]}
                      >
                        <View style={[styles.tubeColorDot, { backgroundColor: meta.colorHex }]} />
                        <Text style={[styles.specimenTagText, { color: meta.colorHex }]}>
                          {s.testCode} • {meta.shortTag}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                {isOpenPool ? (
                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={[styles.btnPrimary, submittingAction && { opacity: 0.65 }]}
                      disabled={submittingAction}
                      onPress={() => onAcceptPoolOrder(order)}
                    >
                      <Text style={styles.btnPrimaryText}>Accept &amp; Claim Pickup →</Text>
                    </TouchableOpacity>
                  </View>
                ) : requestTab === 'active' && !isDone ? (
                  <View style={styles.actionsRow}>
                    {order.status === OrderStatus.ASSIGNED_TO_PHLEBO ? (
                      <TouchableOpacity
                        style={styles.btnSecondary}
                        onPress={() => onDeclineAssignedOrder(order)}
                      >
                        <Text style={styles.btnSecondaryText}>Release</Text>
                      </TouchableOpacity>
                    ) : null}

                    {!isPaidOrder && collectableInr >= 1 ? (
                      <TouchableOpacity
                        style={[
                          styles.btnSecondary,
                          { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
                          collectingOrderId === order.id && { opacity: 0.65 },
                        ]}
                        disabled={collectingOrderId === order.id}
                        onPress={() => onCollectBookingPayment(order)}
                      >
                        <Text style={[styles.btnSecondaryText, { color: '#1D4ED8' }]}>
                          {collectingOrderId === order.id ? 'Opening...' : 'Collect'}
                        </Text>
                      </TouchableOpacity>
                    ) : null}

                    <TouchableOpacity
                      style={styles.btnPrimary}
                      onPress={() => onOpenOrderWorkflow(order)}
                    >
                      <Text style={styles.btnPrimaryText}>
                        {isInTransit ? 'Handover OTP →' : 'Start Collection →'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.historyCardFooter}>
                    <Text style={[styles.historyCardTemp, { fontFamily: FONTS.bold, color: '#15803D' }]}>
                      ✓ Delivered {order.arrivalTemperatureCelsius ? `${order.arrivalTemperatureCelsius}°C` : ''} • {formatOrderStatus(order.status)}
                    </Text>
                    <TouchableOpacity
                      style={styles.btnSecondary}
                      onPress={() => onOpenOrderWorkflow(order)}
                    >
                      <Text style={styles.btnSecondaryText}>View Details</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}
