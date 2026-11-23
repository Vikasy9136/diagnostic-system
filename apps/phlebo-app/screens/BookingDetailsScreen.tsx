import React from 'react';
import { Image, Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  formatInr,
  isOrderCompleted,
  type LiveGeoCoordinate,
  OrderStatus,
  type PickupOrder,
  TUBE_METADATA,
  TubeType,
} from '@diagnostic/shared';
import { type DynamicAlertVariant } from '../components/DynamicAlertModal';
import { BRAND_COLORS } from '../components/LabSetuBrand';
import { OsmWebMapPreview } from '../components/OsmWebMapPreview';
import { COLORS, FONTS, styles } from '../styles/phleboStyles';
import { formatLabel } from '../utils/phleboHelpers';
import { formatFullProperAddress } from '../utils/addressUtils';
import { lh, MAX_TEXT_SCALE, rf, rs } from '../utils/responsive';

export interface BookingDetailsScreenProps {
  order: PickupOrder;
  riderLocation: LiveGeoCoordinate;
  collectingOrderId: string | null;
  onBack: () => void;
  onShowAlert: (opts: {
    variant: DynamicAlertVariant;
    title: string;
    message: string;
    detail?: string;
  }) => void;
  onOpenDirectionsMap: (lat?: number, lng?: number, fallbackAddr?: string) => void;
  onCollectBookingPayment: (order: PickupOrder) => void;
  onMarkDirectPayment?: (order: PickupOrder, method: 'DIRECT_TO_LAB' | 'CASH' | 'UPI_PHLEBO') => void;
  onProceedToCollect: () => void;
  onProceedToDrop?: () => void;
}

export function BookingDetailsScreen({
  order,
  riderLocation,
  collectingOrderId,
  onBack,
  onShowAlert,
  onOpenDirectionsMap,
  onCollectBookingPayment,
  onMarkDirectPayment,
  onProceedToCollect,
  onProceedToDrop,
}: BookingDetailsScreenProps) {
  const specimens = order.specimens || [];
  const stUpper = String(order.status || '').toUpperCase();
  const hasDeliveryEvent = Boolean(
    order.actualDeliveredAt ||
    order.custodyHistory?.some(
      (c) =>
        String(c.eventType || '').toUpperCase().includes('DELIVER') ||
        String(c.eventType || '').toUpperCase().includes('ACCESSION')
    )
  );
  const isCancelled =
    order.status === OrderStatus.CANCELLED ||
    stUpper.includes('CANCEL') ||
    order.status === 'REJECTED';
  const isDone =
    isCancelled ||
    stUpper.includes('DELIVER') ||
    stUpper.includes('ANALYS') ||
    stUpper.includes('REPORT') ||
    stUpper.includes('COMPLET') ||
    hasDeliveryEvent ||
    isOrderCompleted(order.status);
  const isInTransit =
    stUpper === 'PICKED_UP' ||
    stUpper === 'IN_TRANSIT';
    stUpper.includes('REJECT') ||
    hasDeliveryEvent ||
    isOrderCompleted(order.status);

  return (
    <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
      <View style={styles.navBarHeader}>
        <TouchableOpacity onPress={onBack} hitSlop={8}>
          <Ionicons name="arrow-back" size={23} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
          <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.navBarTitle}>Collection Details</Text>
          <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.navBarSubtitle}>{order.orderNumber}</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.bodyContainer}>
        {/* Top Summary Lab Card matching Screenshot */}
        <View style={styles.timelineCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <View style={styles.vialIconBadge}>
              <MaterialCommunityIcons name="flask-outline" size={24} color={BRAND_COLORS.tealPrimary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                maxFontSizeMultiplier={MAX_TEXT_SCALE}
                style={{
                  fontSize: rf(16),
                  lineHeight: lh(rf(16)),
                  fontFamily: FONTS.bold,
                  color: BRAND_COLORS.navyPrimary,
                  flexShrink: 1,
                }}
              >
                {order.smallLabName}
              </Text>
              <View style={[styles.labIdPill, { marginTop: 4, marginBottom: 0 }]}>
                <Text style={styles.labIdPillText}>Lab ID: {order.orderNumber}</Text>
              </View>
            </View>
            {order.pickupLocation?.contactPhone ? (
              <TouchableOpacity
                style={styles.callCircleBtn}
                onPress={() => {
                  Linking.openURL(`tel:${order.pickupLocation.contactPhone}`).catch(() => {
                    onShowAlert({
                      variant: 'info',
                      title: 'Collection Lab Contact',
                      message: `Contact ${order.smallLabName} desk before arrival.`,
                      detail: order.pickupLocation.contactPhone,
                    });
                  });
                }}
              >
                <Ionicons name="call" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={{ height: 1, backgroundColor: COLORS.borderLight, marginBottom: 12 }} />

          {/* Patient Case with Direct Call Button */}
          <View style={styles.timelineItem}>
            <Ionicons name="person-outline" size={18} color={BRAND_COLORS.navyPrimary} />
            <View style={{ marginLeft: 12, flex: 1, minWidth: 0 }}>
              <Text style={styles.timelineLabel}>Patient Case</Text>
              <Text style={styles.timelineTitle}>{order.patient.pseudonym}</Text>
              <Text style={styles.timelineSub}>
                {order.patient.age} yrs • {formatLabel(order.patient.gender)}
              </Text>
            </View>
            {(order.patient?.phone || (order as any).patientPhone) ? (
              <TouchableOpacity
                style={[styles.callCircleBtn, { backgroundColor: '#16A34A', width: 34, height: 34, borderRadius: 17 }]}
                onPress={() => {
                  const phone = order.patient?.phone || (order as any).patientPhone;
                  Linking.openURL(`tel:${phone}`).catch(() => {});
                }}
              >
                <Ionicons name="call" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.timelineLine} />

          <View style={styles.timelineItem}>
            <Ionicons name="location-outline" size={18} color={BRAND_COLORS.tealPrimary} />
            <View style={{ marginLeft: 12, flex: 1, minWidth: 0 }}>
              <Text style={styles.timelineLabel}>Full Pickup Location Address</Text>
              <Text style={styles.timelineTitle}>{order.smallLabName}</Text>
              <Text style={[styles.timelineSub, { color: '#0F172A', fontWeight: '600', marginTop: 2 }]}>
                {formatFullProperAddress(order.pickupLocation, order.smallLabName)}
              </Text>
            </View>
            {order.pickupLocation?.contactPhone ? (
              <TouchableOpacity
                style={[styles.callCircleBtn, { backgroundColor: '#2563EB', width: 34, height: 34, borderRadius: 17 }]}
                onPress={() => {
                  Linking.openURL(`tel:${order.pickupLocation.contactPhone}`).catch(() => {});
                }}
              >
                <Ionicons name="call" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.timelineLine} />

          <View style={styles.timelineItem}>
            <Ionicons name="business-outline" size={18} color={BRAND_COLORS.navyPrimary} />
            <View style={{ marginLeft: 12, flex: 1, minWidth: 0 }}>
              <Text style={styles.timelineLabel}>
                {order.dropType === 'SELF_DROP'
                  ? 'Return to Partner Collection Centre'
                  : order.dropType === 'CUSTOM_ADDRESS'
                  ? 'Custom Drop Address'
                  : 'Drop Reference Hub Address'}
              </Text>
              <Text style={styles.timelineTitle}>{order.targetLabName}</Text>
              <Text style={[styles.timelineSub, { color: '#0F172A', fontWeight: '600', marginTop: 2 }]}>
                {formatFullProperAddress(order.deliveryLocation, order.targetLabName)}
              </Text>
            </View>
            {order.deliveryLocation?.contactPhone ? (
              <TouchableOpacity
                style={[styles.callCircleBtn, { backgroundColor: '#0D9488', width: 34, height: 34, borderRadius: 17 }]}
                onPress={() => {
                  Linking.openURL(`tel:${order.deliveryLocation.contactPhone}`).catch(() => {});
                }}
              >
                <Ionicons name="call" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <TouchableOpacity
              style={styles.navMapButton}
              onPress={() =>
                onOpenDirectionsMap(
                  order.pickupLocation?.latitude,
                  order.pickupLocation?.longitude,
                  order.pickupLocation?.address
                )
              }
            >
              <Text style={styles.navMapButtonText}>
                Navigate to Pickup Lab (Google Maps)
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <OsmWebMapPreview
          latitude={order.pickupLocation?.latitude || riderLocation.latitude}
          longitude={order.pickupLocation?.longitude || riderLocation.longitude}
          address={formatFullProperAddress(order.pickupLocation, order.smallLabName)}
          title={`Pickup Map • ${order.smallLabName}`}
          height={165}
          onOpenGoogleMaps={() =>
            onOpenDirectionsMap(
              order.pickupLocation?.latitude,
              order.pickupLocation?.longitude,
              order.pickupLocation?.address
            )
          }
        />

        <View style={styles.infoCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <MaterialCommunityIcons name="test-tube" size={18} color={BRAND_COLORS.tealPrimary} />
            <Text style={[styles.infoCardLabel, { marginBottom: 0, color: BRAND_COLORS.navyPrimary }]}>
              Test Package &amp; Specimens ({specimens.length})
            </Text>
          </View>

          <View style={{ gap: 8, marginTop: 2 }}>
            {specimens.map((s) => {
              const meta = TUBE_METADATA[s.tubeType] || TUBE_METADATA[TubeType.SERUM_RED_GOLD];
              return (
                <View key={s.id} style={styles.detailSpecRow}>
                  <View style={[styles.tubeColorDot, { backgroundColor: meta.colorHex, marginTop: 6 }]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.detailSpecTitle}>
                      {s.testCode} — {s.testName}
                    </Text>
                    <Text style={styles.detailSpecSub}>
                      {meta.label} • Expected Tag: {s.barcode}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={{ height: 1, backgroundColor: COLORS.borderLight, marginVertical: 12 }} />
          <Text style={styles.infoCardLabel}>Courier Fee • Route Distance • Priority</Text>
          <Text style={[styles.infoCardValue, { color: COLORS.primaryTeal }]}>
            {formatInr(order.courierFeeInr || 0)}
            {typeof order.distanceKm === 'number' && order.distanceKm > 0
              ? ` • ${order.distanceKm} km`
              : ''}
            {' • '}
            {formatLabel(order.priority)}
          </Text>

          <View style={{ height: 1, backgroundColor: COLORS.borderLight, marginVertical: 12 }} />
          <Text style={styles.infoCardLabel}>Booking Payment Collection</Text>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Text style={styles.infoCardValue}>
              {formatInr(order.totalAmountInr || order.courierFeeInr || 0)}
            </Text>
            <View
              style={[
                styles.pickupTimeBadge,
                {
                  marginBottom: 0,
                  backgroundColor: order.paymentStatus === 'PAID' ? '#DCFCE7' : '#FFEDD5',
                },
              ]}
            >
              <Text
                style={[
                  styles.pickupTimeText,
                  { color: order.paymentStatus === 'PAID' ? '#15803D' : '#C2410C' },
                ]}
              >
                {order.paymentStatus === 'PAID'
                  ? `Paid (${order.paymentMethod || 'Online'})`
                  : 'Payment Due'}
              </Text>
            </View>
          </View>
        </View>

        {!isCancelled &&
        order.paymentStatus !== 'PAID' &&
        (order.totalAmountInr || order.courierFeeInr || 0) >= 1 ? (
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 12,
              padding: 14,
              marginBottom: 14,
              borderWidth: 1,
              borderColor: '#E2E8F0',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 10,
              }}
            >
              <Text style={{ fontSize: rf(13.5), fontFamily: FONTS.bold, color: BRAND_COLORS.navyPrimary }}>
                Collect Payment ({formatInr(order.totalAmountInr || order.courierFeeInr || 0)})
              </Text>
              <Text style={{ fontSize: rf(11), fontFamily: FONTS.semiBold, color: '#C2410C' }}>
                Payment Due
              </Text>
            </View>

            <View style={{ gap: rs(8) }}>
              {/* Primary: Patient Paid Directly to Lab */}
              <TouchableOpacity
                style={[
                  styles.ctaButton,
                  { backgroundColor: '#059669', marginBottom: 0, paddingVertical: rs(12) },
                ]}
                onPress={() => onMarkDirectPayment?.(order, 'DIRECT_TO_LAB')}
              >
                <Text style={[styles.ctaButtonText, { fontFamily: FONTS.bold, fontSize: rf(13) }]}>
                  ✓ Patient Paid Directly to Lab
                </Text>
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', gap: rs(8) }}>
                <TouchableOpacity
                  style={[
                    styles.btnSecondary,
                    {
                      flex: 1,
                      borderColor: '#0284C7',
                      backgroundColor: '#F0F9FF',
                      paddingVertical: rs(10),
                    },
                  ]}
                  onPress={() => onMarkDirectPayment?.(order, 'CASH')}
                >
                  <Text style={[styles.btnSecondaryText, { color: '#0284C7', fontFamily: FONTS.bold, fontSize: rf(12.5) }]}>
                    💵 Collect Cash
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.btnSecondary,
                    {
                      flex: 1,
                      borderColor: '#6366F1',
                      backgroundColor: '#EEF2FF',
                      paddingVertical: rs(10),
                    },
                    collectingOrderId === order.id && { opacity: 0.65 },
                  ]}
                  disabled={collectingOrderId === order.id}
                  onPress={() => onCollectBookingPayment(order)}
                >
                  <Text style={[styles.btnSecondaryText, { color: '#6366F1', fontFamily: FONTS.bold, fontSize: rf(12.5) }]}>
                    {collectingOrderId === order.id ? 'Opening...' : '💳 Online / UPI'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}

        {/* Specimen Collection Photo Proof Preview */}
        {order.sampleCollectionPhotoUrl ? (
          <View style={styles.photoProofCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={styles.specimenCardTitle}>📸 Specimen Photo Proof</Text>
              <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                <Text style={{ color: '#15803D', fontSize: 11, fontWeight: '700' }}>✓ Verified</Text>
              </View>
            </View>
            <Image
              source={{ uri: order.sampleCollectionPhotoUrl }}
              style={{ width: '100%', height: 180, borderRadius: 10, backgroundColor: '#0F172A' }}
              resizeMode="cover"
            />
          </View>
        ) : null}

        {/* Phlebotomist Presence & Attendance Selfie */}
        {order.phleboSelfieUrl ? (
          <View style={styles.photoProofCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={styles.specimenCardTitle}>🤳 Phlebotomist Presence Selfie</Text>
              <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                <Text style={{ color: '#15803D', fontSize: 11, fontWeight: '700' }}>✓ Verified At Site</Text>
              </View>
            </View>
            <Image
              source={{ uri: order.phleboSelfieUrl }}
              style={{ width: '100%', height: 180, borderRadius: 10, backgroundColor: '#0F172A' }}
              resizeMode="cover"
            />
          </View>
        ) : null}

        {isCancelled ? (
          <View
            style={{
              backgroundColor: '#FEF2F2',
              borderColor: '#FECACA',
              borderWidth: 1.5,
              borderRadius: 14,
              padding: 16,
              marginTop: 14,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <Ionicons name="close-circle" size={26} color="#DC2626" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#991B1B', fontWeight: '800', fontSize: 16 }}>
                  Order Cancelled
                </Text>
                <Text style={{ color: '#B91C1C', fontSize: 13, marginTop: 4, lineHeight: 18 }}>
                  This pickup order has been cancelled by the lab or customer. No sample collection, tube barcode scanning, or payment collection is required.
                </Text>
              </View>
            </View>
          </View>
        ) : !isDone ? (
          isInTransit ? (
            <TouchableOpacity
              style={[styles.ctaButton, { backgroundColor: '#0D9488' }]}
              onPress={onProceedToDrop || onProceedToCollect}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="navigate-circle" size={18} color="#FFFFFF" />
                <Text style={styles.ctaButtonText}>Proceed to Lab Handover (OTP) →</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.ctaButton} onPress={onProceedToCollect}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="play" size={16} color="#FFFFFF" />
                <Text style={styles.ctaButtonText}>Start Collection →</Text>
              </View>
            </TouchableOpacity>
          )
        ) : (
          <View
            style={{
              backgroundColor: '#DCFCE7',
              borderColor: '#86EFAC',
              borderWidth: 1,
              borderRadius: 12,
              padding: 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginTop: 10,
            }}
          >
            <Ionicons name="checkmark-circle" size={20} color="#15803D" />
            <Text style={{ color: '#15803D', fontWeight: '700', fontSize: 14 }}>
              ✓ Delivered &amp; Completed ({formatLabel(order.status)})
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
