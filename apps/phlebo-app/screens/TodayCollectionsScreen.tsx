import React, { useMemo, useState } from 'react';
import { Linking, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  formatInr,
  formatOrderStatus,
  isOrderCompleted,
  OrderStatus,
  type PickupOrder,
  type ServiceZoneRecord,
  TUBE_METADATA,
  TubeType,
} from '@diagnostic/shared';
import { BRAND_COLORS } from '../components/LabSetuBrand';
import { COLORS, FONTS, styles } from '../styles/phleboStyles';
import { type TodayCollectionFilter } from '../types/phleboTypes';
import { formatLabel } from '../utils/phleboHelpers';
import { formatFullProperAddress } from '../utils/addressUtils';
import { COMPACT_TEXT_SCALE, lh, MAX_TEXT_SCALE, rf, rs } from '../utils/responsive';

export interface TodayCollectionsScreenProps {
  todayOrders: PickupOrder[];
  assignedAdminZone: ServiceZoneRecord | null;
  gpsSourceLabel: string;
  riderFullAddress?: string;
  collectingOrderId: string | null;
  onBack: () => void;
  onOpenLocationModal: () => void;
  onViewOrderDetails: (order: PickupOrder) => void;
  onOpenOrderWorkflow: (order: PickupOrder) => void;
  onCollectBookingPayment: (order: PickupOrder) => void;
}

function formatSlotWindow(iso?: string): string {
  if (!iso) return 'Immediate Slot';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatTodayHeading(): string {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

export function TodayCollectionsScreen({
  todayOrders,
  assignedAdminZone,
  gpsSourceLabel,
  riderFullAddress,
  collectingOrderId,
  onBack,
  onOpenLocationModal,
  onViewOrderDetails,
  onOpenOrderWorkflow,
  onCollectBookingPayment,
}: TodayCollectionsScreenProps) {
  const [filter, setFilter] = useState<TodayCollectionFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const isOrderTerminalOrDelivered = (o: PickupOrder): boolean => {
    const stUpper = String(o.status || '').toUpperCase();
    const hasDeliveryEvent = Boolean(
      o.actualDeliveredAt ||
      o.custodyHistory?.some(
        (c) =>
          String(c.eventType || '').toUpperCase().includes('DELIVER') ||
          String(c.eventType || '').toUpperCase().includes('ACCESSION')
      )
    );
    return (
      stUpper.includes('DELIVER') ||
      stUpper.includes('ANALYS') ||
      stUpper.includes('REPORT') ||
      stUpper.includes('COMPLET') ||
      stUpper.includes('CANCEL') ||
      stUpper.includes('REJECT') ||
      hasDeliveryEvent ||
      isOrderCompleted(o.status)
    );
  };

  const pendingOrders = useMemo(
    () =>
      todayOrders.filter((o) => !isOrderTerminalOrDelivered(o)),
    [todayOrders]
  );

  const completedOrders = useMemo(
    () =>
      todayOrders.filter((o) => isOrderTerminalOrDelivered(o)),
    [todayOrders]
  );

  const earnedTodayInr = useMemo(
    () =>
      completedOrders.reduce((sum, o) => sum + (o.courierFeeInr || 0), 0),
    [completedOrders]
  );

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const pool =
      filter === 'pending'
        ? pendingOrders
        : filter === 'completed'
        ? completedOrders
        : todayOrders;

    if (!q) return pool;
    return pool.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.patient.pseudonym.toLowerCase().includes(q) ||
        o.smallLabName.toLowerCase().includes(q) ||
        o.targetLabName.toLowerCase().includes(q) ||
        (o.pickupLocation?.address || '').toLowerCase().includes(q) ||
        (o.specimens || []).some((s) => s.testCode.toLowerCase().includes(q))
    );
  }, [filter, pendingOrders, completedOrders, todayOrders, searchQuery]);

  const zoneSubtitle = riderFullAddress || (assignedAdminZone
    ? `${assignedAdminZone.zoneCode} • ${assignedAdminZone.name} (${assignedAdminZone.city})`
    : 'Active Service Area');

  return (
    <ScrollView
      style={styles.scrollArea}
      contentContainerStyle={{ paddingBottom: rs(120) }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.navBarHeader}>
        <TouchableOpacity onPress={onBack} hitSlop={8} accessibilityLabel="Back to Home">
          <Ionicons name="arrow-back" size={23} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
          <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.navBarTitle}>
            Today&apos;s Collections
          </Text>
          <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.navBarSubtitle}>
            {formatTodayHeading()} • {todayOrders.length} total task
            {todayOrders.length === 1 ? '' : 's'}
          </Text>
        </View>
        <View
          style={{
            backgroundColor: 'rgba(255,255,255,0.16)',
            paddingHorizontal: rs(10),
            paddingVertical: rs(4),
            borderRadius: 999,
          }}
        >
          <Text
            maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
            style={{
              color: '#FFFFFF',
              fontFamily: FONTS.bold,
              fontSize: rf(11),
              lineHeight: lh(rf(11), 1.25),
            }}
          >
            {pendingOrders.length} Pending
          </Text>
        </View>
      </View>

      <View style={[styles.bodyContainer, { paddingTop: rs(14) }]}>
        {/* Today KPI Card */}
        <View style={[styles.summaryCard, { marginBottom: rs(12) }]}>
          <View style={styles.summaryMetricsRow}>
            <View style={styles.summaryMetricCol}>
              <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.metricNumber}>
                {todayOrders.length}
              </Text>
              <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.metricLabel}>
                Total Today
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryMetricCol}>
              <Text
                maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                style={[styles.metricNumber, { color: '#D97706' }]}
              >
                {pendingOrders.length}
              </Text>
              <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.metricLabel}>
                Pending
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryMetricCol}>
              <Text
                maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                style={[styles.metricNumber, { color: '#15803D' }]}
              >
                {completedOrders.length}
              </Text>
              <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.metricLabel}>
                Completed
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryMetricCol}>
              <Text
                maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                style={[styles.metricNumber, { color: BRAND_COLORS.tealPrimary }]}
              >
                {formatInr(earnedTodayInr)}
              </Text>
              <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.metricLabel}>
                Earned
              </Text>
            </View>
          </View>
        </View>

        {/* Admin Zone Banner */}
        <TouchableOpacity
          style={[styles.gpsTelemetryBar, { marginBottom: rs(12) }]}
          activeOpacity={0.85}
          onPress={onOpenLocationModal}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.gpsTelemetryTitle}>
              🗺️ Admin Zone: {zoneSubtitle}
            </Text>
            <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.gpsTelemetrySub}>
              {assignedAdminZone
                ? `${assignedAdminZone.radiusKm} km radar • Tap to inspect zone & sync live GPS`
                : 'Zone setup managed by Platform Admin • Tap to sync GPS'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={BRAND_COLORS.navyPrimary} />
        </TouchableOpacity>

        {/* Search Input */}
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={BRAND_COLORS.muted} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search order, patient, lab, address or test..."
            placeholderTextColor={COLORS.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={BRAND_COLORS.muted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Pills matching Task List design */}
        <View style={styles.requestTabsRow}>
          {(
            [
              { key: 'all', label: `All (${todayOrders.length})` },
              { key: 'pending', label: `Pending (${pendingOrders.length})` },
              { key: 'completed', label: `Completed (${completedOrders.length})` },
            ] as const
          ).map((tab) => {
            const active = filter === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabButton, active && styles.tabButtonActive]}
                onPress={() => setFilter(tab.key)}
              >
                <Text
                  maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                  style={[styles.tabButtonText, active && styles.tabButtonTextActive]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {filteredOrders.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="calendar-clear-outline" size={34} color={BRAND_COLORS.tealPrimary} />
            <Text style={[styles.emptyTitle, { marginTop: 8 }]}>
              {searchQuery.trim()
                ? 'No Matching Collections Found'
                : filter === 'pending'
                ? 'All Today&apos;s Pickups Completed!'
                : filter === 'completed'
                ? 'No Completed Collections Yet Today'
                : 'No Collections Scheduled Today'}
            </Text>
            <Text style={styles.emptySub}>
              {todayOrders.length === 0
                ? 'Accept a booking from the Open Pool or wait for Admin dispatch in your assigned zone.'
                : 'Switch filter tabs above or clear search to view all tasks for today.'}
            </Text>
          </View>
        ) : (
          filteredOrders.map((order) => {
            const stUpper = String(order.status || '').toUpperCase();
            const hasDeliveryEvent = Boolean(
              order.actualDeliveredAt ||
              order.custodyHistory?.some(
                (c) =>
                  String(c.eventType || '').includes('DELIVERED') ||
                  String(c.eventType || '').includes('ACCESSIONED')
              )
            );
            const isDone = isOrderTerminalOrDelivered(order);
            const isInTransit =
              stUpper === 'PICKED_UP' ||
              stUpper === 'IN_TRANSIT';
            const isPaidOrder = order.paymentStatus === 'PAID';
            const collectableInr = order.totalAmountInr || order.courierFeeInr || 0;
            const specimens = order.specimens || [];
            const patientPhone = order.patient?.phone || (order as any).patientPhone || order.pickupLocation?.contactPhone;
            const labPhone = order.pickupLocation?.contactPhone || order.deliveryLocation?.contactPhone;

            const statusBadgeBg = isDone
              ? '#DCFCE7'
              : isInTransit
              ? '#FEF3C7'
              : '#DBEAFE';
            const statusBadgeColor = isDone
              ? '#15803D'
              : isInTransit
              ? '#B45309'
              : '#1D4ED8';
            const statusBadgeLabel = isDone
              ? '✓ Delivered & Completed'
              : isInTransit
              ? 'In Transit'
              : 'Pending Collection';

            return (
              <TouchableOpacity
                key={order.id}
                style={styles.bookingCard}
                activeOpacity={0.92}
                onPress={() => onViewOrderDetails(order)}
              >
                <View style={styles.bookingCardTop}>
                  <View style={styles.vialIconBadge}>
                    <MaterialCommunityIcons
                      name="test-tube"
                      size={22}
                      color={BRAND_COLORS.tealPrimary}
                    />
                  </View>

                  <View style={{ flex: 1, minWidth: 0, paddingRight: 6 }}>
                    <View style={styles.labIdPill}>
                      <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.labIdPillText}>
                        {order.orderNumber}
                      </Text>
                    </View>
                    <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.bookingTitle}>
                      {order.patient.pseudonym}
                    </Text>
                    <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.bookingId}>
                      {order.smallLabName} → {order.targetLabName}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end', flexShrink: 0, gap: 4 }}>
                    <View
                      style={{
                        backgroundColor: statusBadgeBg,
                        paddingHorizontal: rs(10),
                        paddingVertical: rs(4),
                        borderRadius: 999,
                      }}
                    >
                      <Text
                        maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                        style={{
                          fontSize: rf(11),
                          lineHeight: lh(rf(11), 1.25),
                          fontFamily: FONTS.bold,
                          color: statusBadgeColor,
                        }}
                      >
                        {statusBadgeLabel}
                      </Text>
                    </View>
                    <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.bookingPrice}>
                      {formatInr(order.courierFeeInr || 0)}
                    </Text>
                  </View>
                </View>

                <View style={{ gap: 4, marginBottom: rs(10) }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                    <Ionicons
                      name="location-outline"
                      size={15}
                      color={BRAND_COLORS.muted}
                      style={{ marginTop: 2 }}
                    />
                    <Text
                      maxFontSizeMultiplier={MAX_TEXT_SCALE}
                      style={[styles.routePlaceSubtitle, { flex: 1, color: '#0F172A', fontWeight: '500' }]}
                    >
                      {formatFullProperAddress(order.pickupLocation, order.smallLabName)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Ionicons name="time-outline" size={15} color={BRAND_COLORS.muted} />
                    <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.routePlaceSubtitle}>
                      Slot: {formatSlotWindow(order.scheduledPickupAt)} •{' '}
                      {formatLabel(order.priority)}
                    </Text>
                  </View>
                </View>

                {specimens.length > 0 && (
                  <View style={styles.tubePillRow}>
                    {specimens.map((s) => {
                      const meta =
                        TUBE_METADATA[s.tubeType] || TUBE_METADATA[TubeType.SERUM_RED_GOLD];
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
                )}

                {/* 1-Tap Direct Call Patient & Call Lab */}
                {(Boolean(patientPhone) || Boolean(labPhone)) && (
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 6, marginBottom: 10 }}>
                    {Boolean(patientPhone) && (
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          backgroundColor: '#F0FDF4',
                          borderWidth: 1.6,
                          borderColor: '#22C55E',
                          borderRadius: 12,
                          paddingVertical: 10,
                          paddingHorizontal: 10,
                          minHeight: 44,
                          elevation: 1,
                          shadowColor: '#16A34A',
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.1,
                          shadowRadius: 2,
                        }}
                        onPress={(e) => {
                          e.stopPropagation();
                          Linking.openURL(`tel:${patientPhone}`).catch(() => {});
                        }}
                      >
                        <Ionicons name="call" size={16} color="#15803D" />
                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#15803D' }} numberOfLines={1}>
                          Call Patient
                        </Text>
                      </TouchableOpacity>
                    )}

                    {Boolean(labPhone) && (
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          backgroundColor: '#EFF6FF',
                          borderWidth: 1.6,
                          borderColor: '#3B82F6',
                          borderRadius: 12,
                          paddingVertical: 10,
                          paddingHorizontal: 10,
                          minHeight: 44,
                          elevation: 1,
                          shadowColor: '#2563EB',
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.1,
                          shadowRadius: 2,
                        }}
                        onPress={(e) => {
                          e.stopPropagation();
                          Linking.openURL(`tel:${labPhone}`).catch(() => {});
                        }}
                      >
                        <Ionicons name="business" size={16} color="#1D4ED8" />
                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#1D4ED8' }} numberOfLines={1}>
                          Call Lab Desk
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {!isDone ? (
                  <View style={{ marginTop: rs(10), gap: rs(8) }}>
                    {/* Top utility row: Details & Collect */}
                    <View style={{ flexDirection: 'row', gap: rs(8) }}>
                      <TouchableOpacity
                        style={[
                          styles.btnSecondary,
                          {
                            flex: 1,
                            minHeight: 40,
                            backgroundColor: '#F8FAFC',
                            borderWidth: 1,
                            borderColor: '#CBD5E1',
                            borderRadius: 10,
                            paddingVertical: rs(9),
                          },
                        ]}
                        onPress={() => onViewOrderDetails(order)}
                      >
                        <Text style={[styles.btnSecondaryText, { color: '#64748B' }]}>📄 Details</Text>
                      </TouchableOpacity>

                      {!isPaidOrder && collectableInr >= 1 ? (
                        <TouchableOpacity
                          style={[
                            styles.btnSecondary,
                            {
                              flex: 1,
                              minHeight: 40,
                              backgroundColor: '#EFF6FF',
                              borderWidth: 1,
                              borderColor: '#BFDBFE',
                              borderRadius: 10,
                              paddingVertical: rs(9),
                              opacity: collectingOrderId === order.id ? 0.65 : 1,
                            },
                          ]}
                          disabled={collectingOrderId === order.id}
                          onPress={() => onCollectBookingPayment(order)}
                        >
                          <Text style={[styles.btnSecondaryText, { color: '#1D4ED8' }]}>
                            {collectingOrderId === order.id ? 'Opening...' : `💳 Collect ₹${collectableInr}`}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>

                    {/* Prominent full-width Primary CTA */}
                    <TouchableOpacity
                      style={[
                        styles.btnPrimary,
                        {
                          width: '100%',
                          minHeight: 48,
                          borderRadius: 12,
                          backgroundColor: COLORS.primaryNavy,
                          justifyContent: 'center',
                          alignItems: 'center',
                          paddingVertical: rs(12),
                          shadowColor: COLORS.primaryNavy,
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.22,
                          shadowRadius: 6,
                          elevation: 4,
                        },
                      ]}
                      onPress={() => onOpenOrderWorkflow(order)}
                    >
                      <Text style={[styles.btnPrimaryText, { fontSize: rf(14), fontWeight: '700' }]}>
                        {isInTransit ? '📦 Handover OTP →' : '🚀 Start Collection →'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.historyCardFooter}>
                    <Text style={[styles.historyCardTemp, { fontFamily: FONTS.bold, color: '#15803D' }]}>
                      ✓ Temp {order.arrivalTemperatureCelsius ?? '—'}°C • {formatOrderStatus(order.status)}
                    </Text>
                    <TouchableOpacity
                      style={styles.btnSecondary}
                      onPress={() => onViewOrderDetails(order)}
                    >
                      <Text style={styles.btnSecondaryText}>View Details</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

