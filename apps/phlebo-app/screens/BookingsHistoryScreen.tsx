import React from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  formatInr,
  formatOrderStatus,
  isOrderCompleted,
  OrderStatus,
  type PickupOrder,
} from '@diagnostic/shared';
import { BRAND_COLORS } from '../components/LabSetuBrand';
import { COLORS, styles } from '../styles/phleboStyles';
import { type BookingHistoryFilter } from '../types/phleboTypes';
import { COMPACT_TEXT_SCALE, MAX_TEXT_SCALE } from '../utils/responsive';

export interface BookingsHistoryScreenProps {
  myAssignedOrders: PickupOrder[];
  completedAssignedOrders: PickupOrder[];
  bookingSearchQuery: string;
  bookingHistoryFilter: BookingHistoryFilter;
  onBack?: () => void;
  onChangeSearchQuery: (val: string) => void;
  onSelectHistoryFilter: (filter: BookingHistoryFilter) => void;
  onOpenOrderWorkflow: (order: PickupOrder) => void;
}

export function BookingsHistoryScreen({
  myAssignedOrders,
  completedAssignedOrders,
  bookingSearchQuery,
  bookingHistoryFilter,
  onBack,
  onChangeSearchQuery,
  onSelectHistoryFilter,
  onOpenOrderWorkflow,
}: BookingsHistoryScreenProps) {
  const q = bookingSearchQuery.trim().toLowerCase();
  const filtered = myAssignedOrders.filter((b) => {
    const isActive =
      b.status === OrderStatus.PICKED_UP || b.status === OrderStatus.IN_TRANSIT;
    const isDone =
      b.status === OrderStatus.DELIVERED_TO_LAB ||
      b.status === OrderStatus.UNDER_ANALYSIS ||
      isOrderCompleted(b.status);
    const isScheduled = b.status === OrderStatus.ASSIGNED_TO_PHLEBO;

    const matchFilter =
      bookingHistoryFilter === 'all' ||
      (bookingHistoryFilter === 'active' && isActive) ||
      (bookingHistoryFilter === 'completed' && isDone) ||
      (bookingHistoryFilter === 'scheduled' && isScheduled);

    const matchQuery =
      !q ||
      b.orderNumber.toLowerCase().includes(q) ||
      b.patient.pseudonym.toLowerCase().includes(q) ||
      b.smallLabName.toLowerCase().includes(q) ||
      b.specimens.some((s) => s.testCode.toLowerCase().includes(q));

    return matchFilter && matchQuery;
  });

  const activeCount = myAssignedOrders.filter(
    (b) => b.status === OrderStatus.PICKED_UP || b.status === OrderStatus.IN_TRANSIT
  ).length;
  const completedCount = completedAssignedOrders.length;
  const scheduledCount = myAssignedOrders.filter(
    (b) => b.status === OrderStatus.ASSIGNED_TO_PHLEBO
  ).length;

  return (
    <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
      <View style={styles.navBarHeader}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} hitSlop={8} accessibilityLabel="Back to Home">
            <Ionicons name="arrow-back" size={23} color="#FFFFFF" />
          </TouchableOpacity>
        ) : null}
        <View style={{ flex: 1, minWidth: 0, alignItems: onBack ? 'center' : 'flex-start' }}>
          <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.navBarTitle}>
            Collection History
          </Text>
          <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.navBarSubtitle}>
            Live collection &amp; handover records
          </Text>
        </View>
        <View style={styles.headerIconBtn}>
          <Ionicons name="time-outline" size={20} color="#FFFFFF" />
        </View>
      </View>

      <View style={styles.bodyContainer}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={BRAND_COLORS.muted} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by ID, patient, lab, test..."
            placeholderTextColor={COLORS.textSecondary}
            value={bookingSearchQuery}
            onChangeText={onChangeSearchQuery}
          />
          {bookingSearchQuery.length > 0 && (
            <TouchableOpacity onPress={() => onChangeSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={BRAND_COLORS.muted} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.requestTabsRow}>
          {(['all', 'completed', 'active', 'scheduled'] as const).map((key) => (
            <TouchableOpacity
              key={key}
              style={[styles.tabButton, bookingHistoryFilter === key && styles.tabButtonActive]}
              onPress={() => onSelectHistoryFilter(key)}
            >
              <Text
                maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                style={[
                  styles.tabButtonText,
                  bookingHistoryFilter === key && styles.tabButtonTextActive,
                ]}
              >
                {key === 'all'
                  ? `All (${myAssignedOrders.length})`
                  : key === 'active'
                  ? `Transit (${activeCount})`
                  : key === 'completed'
                  ? `Completed (${completedCount})`
                  : `Assigned (${scheduledCount})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {filtered.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="document-text-outline" size={32} color={BRAND_COLORS.tealPrimary} />
            <Text style={[styles.emptyTitle, { marginTop: 8 }]}>No Matching Collections</Text>
            <Text style={styles.emptySub}>
              Claim an open booking from Home or adjust your search filters.
            </Text>
          </View>
        ) : (
          filtered.map((item) => {
            const isTransit =
              item.status === OrderStatus.PICKED_UP ||
              item.status === OrderStatus.IN_TRANSIT;
            const isAssigned = item.status === OrderStatus.ASSIGNED_TO_PHLEBO;
            return (
              <View key={item.id} style={styles.historyCard}>
                <View style={styles.historyCardHeader}>
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
                        {item.orderNumber}
                      </Text>
                    </View>
                    <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.historyCardId}>
                      {item.smallLabName}
                    </Text>
                    <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.historyCardPatient}>
                      {item.patient.pseudonym}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end', flexShrink: 0, maxWidth: '44%' }}>
                    <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.historyCardFee}>
                      {formatInr(item.courierFeeInr || 0)}
                    </Text>
                    <View
                      style={[
                        styles.statusPillBadge,
                        {
                          backgroundColor: isTransit
                            ? '#DBEAFE'
                            : isAssigned
                            ? '#FEF3C7'
                            : '#DCFCE7',
                        },
                      ]}
                    >
                      <Text
                        maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                        style={[
                          styles.statusPillText,
                          {
                            color: isTransit
                              ? '#2563EB'
                              : isAssigned
                              ? '#D97706'
                              : '#16A34A',
                          },
                        ]}
                      >
                        {formatOrderStatus(item.status)}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.routeItemRow}>
                  <View style={[styles.dotMarker, { backgroundColor: COLORS.primaryTeal }]} />
                  <Text style={styles.routeTextSm}>{item.smallLabName}</Text>
                </View>
                <View style={[styles.routeItemRow, { marginTop: 4 }]}>
                  <View style={[styles.dotMarker, { backgroundColor: COLORS.primaryNavy }]} />
                  <Text style={styles.routeTextSm}>{item.targetLabName}</Text>
                </View>

                <View style={styles.historyCardFooter}>
                  <Text style={styles.historyCardTests}>
                    Tests: {item.specimens.map((s) => s.testCode).join(', ')}
                  </Text>
                  <Text style={styles.historyCardTemp}>
                    {item.arrivalTemperatureCelsius !== undefined
                      ? `${item.arrivalTemperatureCelsius}°C`
                      : 'Awaiting Scan'}
                  </Text>
                </View>

                {(isTransit || isAssigned) && (
                  <TouchableOpacity
                    style={[styles.btnPrimary, { marginTop: 12, paddingVertical: 10 }]}
                    onPress={() => onOpenOrderWorkflow(item)}
                  >
                    <Text style={styles.btnPrimaryText}>
                      {isTransit ? 'Open OTP Handover →' : 'Open Collection Workflow →'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}
