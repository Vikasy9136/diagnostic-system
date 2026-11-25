import React, { useRef, useState } from 'react';
import { Image, Linking, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { formatInr, type LiveGeoCoordinate, type PickupOrder, type SupportContactsConfig } from '@diagnostic/shared';
import { BRAND_COLORS } from '../components/LabSetuBrand';
import { OsmWebMapPreview } from '../components/OsmWebMapPreview';
import { formatFullProperAddress } from '../utils/addressUtils';
import { FONTS, styles } from '../styles/phleboStyles';
import { lh, MAX_TEXT_SCALE, rf, rs, useResponsive } from '../utils/responsive';

export interface DropSampleScreenProps {
  order: PickupOrder;
  riderLocation: LiveGeoCoordinate;
  collectingOrderId: string | null;
  otpValue: string[];
  dropTempInput: string;
  submittingAction: boolean;
  onBack: () => void;
  onOpenDirectionsMap: (lat?: number, lng?: number, fallbackAddr?: string) => void;
  onCollectBookingPayment: (order: PickupOrder) => void;
  onUpdateOtpDigit: (index: number, value: string) => void;
  onChangeDropTemp: (val: string) => void;
  onConfirmDropOtp: (order: PickupOrder) => void;
  onOpenOrderChat?: (order: PickupOrder) => void;
  supportContacts?: SupportContactsConfig;
}

export function DropSampleScreen({
  order,
  riderLocation,
  collectingOrderId,
  otpValue,
  dropTempInput,
  submittingAction,
  onBack,
  onOpenDirectionsMap,
  onCollectBookingPayment,
  onUpdateOtpDigit,
  onChangeDropTemp,
  onConfirmDropOtp,
  onOpenOrderChat,
  supportContacts,
}: DropSampleScreenProps) {
  const { width: winWidth } = useResponsive();
  const [receivedByStaff, setReceivedByStaff] = useState('');
  const [handoverRemarks, setHandoverRemarks] = useState('');
  const otpInputRefs = useRef<Array<{ focus: () => void; blur: () => void } | null>>([]);
  const otpBoxSize = Math.max(40, Math.min(50, Math.floor((winWidth - rs(32) - rs(36)) / 5)));

  function handleOtpChange(idx: number, rawVal: string) {
    const cleaned = rawVal.replace(/[^0-9]/g, '');
    if (!cleaned) {
      onUpdateOtpDigit(idx, '');
      return;
    }

    if (cleaned.length > 1) {
      // Handle paste or rapid multi-digit entry seamlessly across boxes
      const chars = cleaned.slice(0, otpValue.length - idx).split('');
      chars.forEach((ch, offset) => {
        onUpdateOtpDigit(idx + offset, ch);
      });
      const nextIdx = Math.min(otpValue.length - 1, idx + chars.length);
      if (idx + chars.length < otpValue.length) {
        otpInputRefs.current[nextIdx]?.focus?.();
      } else {
        otpInputRefs.current[otpValue.length - 1]?.blur?.();
      }
      return;
    }

    onUpdateOtpDigit(idx, cleaned);
    if (idx < otpValue.length - 1) {
      otpInputRefs.current[idx + 1]?.focus?.();
    } else {
      otpInputRefs.current[idx]?.blur?.();
    }
  }

  const verifiedSpecCount = (order.specimens || []).filter(
    (s) => s.validationStatus === 'VERIFIED'
  ).length;

  const formattedNow = new Date().toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
      <View style={styles.navBarHeader}>
        <TouchableOpacity onPress={onBack} hitSlop={8}>
          <Ionicons name="arrow-back" size={23} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
          <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.navBarTitle}>Handover to Lab</Text>
          <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.navBarSubtitle}>{order.orderNumber}</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.bodyContainer}>
        <View style={styles.dropLabCard}>
          <View style={[styles.vialIconBadge, { marginRight: 0, marginBottom: 10 }]}>
            <MaterialCommunityIcons name="flask-outline" size={24} color={BRAND_COLORS.tealPrimary} />
          </View>
          <Text style={styles.dropLabTitle}>{order.targetLabName}</Text>
          <View style={[styles.labIdPill, { marginTop: 4, marginBottom: 4 }]}>
            <Text style={styles.labIdPillText}>{order.orderNumber}</Text>
          </View>
          <Text style={[styles.dropLabSub, { textAlign: 'center' }]}>
            {order.deliveryLocation.address}
          </Text>

          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 6,
              marginTop: 10,
              justifyContent: 'center',
            }}
          >
            <View style={[styles.distanceBadge, { backgroundColor: '#EFF6FF' }]}>
              <Text style={[styles.distanceBadgeText, { color: '#1D4ED8' }]}>
                {order.dropType === 'SELF_DROP'
                  ? 'Self-Drop to Collection Centre'
                  : order.dropType === 'CUSTOM_ADDRESS'
                  ? 'Custom Drop Address'
                  : 'Central Reference Lab Hub'}
              </Text>
            </View>
            {order.sampleCollectionPhotoUrl ? (
              <View style={[styles.distanceBadge, { backgroundColor: '#DCFCE7' }]}>
                <Text style={[styles.distanceBadgeText, { color: '#15803D' }]}>
                  Photo &amp; {verifiedSpecCount}/{(order.specimens || []).length} Tubes Verified
                </Text>
              </View>
            ) : null}
          </View>

          {order.sampleCollectionPhotoUrl ? (
            <View style={{ marginTop: 12 }}>
              <Text style={[styles.specimenCardTitle, { fontSize: 13, marginBottom: 6 }]}>
                📸 Verified Collection Photo Proof
              </Text>
              <Image
                source={{ uri: order.sampleCollectionPhotoUrl }}
                style={{ width: '100%', height: 160, borderRadius: 10, backgroundColor: '#0F172A' }}
                resizeMode="cover"
              />
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, width: '100%' }}>
            <TouchableOpacity
              style={[styles.navMapButton, { flex: 1, marginTop: 0 }]}
              onPress={() =>
                onOpenDirectionsMap(
                  order.deliveryLocation?.latitude,
                  order.deliveryLocation?.longitude,
                  order.deliveryLocation?.address
                )
              }
            >
              <Text style={styles.navMapButtonText}>
                Navigate (Maps)
              </Text>
            </TouchableOpacity>

            {order.deliveryLocation?.contactPhone ? (
              <TouchableOpacity
                style={[
                  styles.navMapButton,
                  {
                    flex: 1,
                    marginTop: 0,
                    backgroundColor: '#0D9488',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  },
                ]}
                onPress={() => {
                  Linking.openURL(`tel:${order.deliveryLocation.contactPhone}`).catch(() => {});
                }}
              >
                <Ionicons name="call" size={15} color="#FFFFFF" />
                <Text style={styles.navMapButtonText}>
                  Call Drop Desk
                </Text>
              </TouchableOpacity>
            ) : null}

            {onOpenOrderChat ? (
              <TouchableOpacity
                style={[
                  styles.navMapButton,
                  {
                    marginTop: 0,
                    paddingHorizontal: rs(14),
                    backgroundColor: '#2563EB',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  },
                ]}
                onPress={() => onOpenOrderChat(order)}
              >
                <Ionicons name="chatbubble-ellipses" size={15} color="#FFFFFF" />
                <Text style={styles.navMapButtonText}>Chat Lab</Text>
                {(order.chatUnreadByPhlebo || 0) > 0 ? (
                  <View
                    style={{
                      backgroundColor: '#EF4444',
                      borderRadius: 999,
                      minWidth: 18,
                      height: 18,
                      paddingHorizontal: 5,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 10, fontFamily: FONTS.bold }}>
                      {(order.chatUnreadByPhlebo || 0) > 99 ? '99+' : order.chatUnreadByPhlebo}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            ) : null}
          </View>

          <View
            style={[
              styles.pickupTimeBadge,
              {
                marginTop: 12,
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
                ? `Booking Payment Collected (${formatInr(
                    order.totalAmountInr || order.courierFeeInr || 0
                  )})`
                : `Payment Pending (${formatInr(
                    order.totalAmountInr || order.courierFeeInr || 0
                  )})`}
            </Text>
          </View>
          {order.paymentStatus !== 'PAID' &&
          (order.totalAmountInr || order.courierFeeInr || 0) >= 1 ? (
            <TouchableOpacity
              style={[
                styles.btnSecondary,
                {
                  marginTop: 10,
                  paddingHorizontal: 14,
                  backgroundColor: '#EFF6FF',
                  borderWidth: 1,
                  borderColor: '#BFDBFE',
                  flex: 0,
                },
              ]}
              disabled={collectingOrderId === order.id}
              onPress={() => onCollectBookingPayment(order)}
            >
              <Text style={[styles.btnSecondaryText, { color: '#1D4ED8' }]}>
                {collectingOrderId === order.id
                  ? 'Opening Checkout...'
                  : 'Collect Payment via Razorpay'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <OsmWebMapPreview
          latitude={order.deliveryLocation?.latitude || riderLocation.latitude}
          longitude={order.deliveryLocation?.longitude || riderLocation.longitude}
          address={formatFullProperAddress(order.deliveryLocation, order.targetLabName)}
          title={`Drop Destination • ${order.targetLabName}`}
          height={165}
          onOpenGoogleMaps={() =>
            onOpenDirectionsMap(
              order.deliveryLocation?.latitude,
              order.deliveryLocation?.longitude,
              order.deliveryLocation?.address
            )
          }
        />

        {/* Handover Form Card matching SS2 */}
        <View style={styles.photoProofCard}>
          <Text style={styles.inputLabelSm}>Handover Time *</Text>
          <View
            style={[
              styles.fieldInput,
              { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
            ]}
          >
            <Ionicons name="calendar-outline" size={17} color={BRAND_COLORS.tealPrimary} />
            <Text
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: rf(13.5),
                lineHeight: lh(rf(13.5)),
                fontFamily: FONTS.semiBold,
                color: BRAND_COLORS.navyPrimary,
                includeFontPadding: true,
              }}
            >
              {formattedNow}
            </Text>
          </View>

          <Text style={styles.inputLabelSm}>Received By (Lab Staff)</Text>
          <View
            style={[
              styles.fieldInput,
              { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingVertical: 8 },
            ]}
          >
            <Ionicons name="person-outline" size={17} color={BRAND_COLORS.muted} />
            <TextInput
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: rf(14),
                fontFamily: FONTS.medium,
                color: BRAND_COLORS.navyPrimary,
              }}
              value={receivedByStaff}
              onChangeText={setReceivedByStaff}
              placeholder="e.g. Rohit Kumar (Lab Reception)"
              placeholderTextColor="#94A3B8"
            />
          </View>

          <Text style={styles.inputLabelSm}>Arrival Chiller Temperature (°C)</Text>
          <TextInput
            style={[styles.fieldInput, { marginBottom: 12 }]}
            value={dropTempInput}
            onChangeText={onChangeDropTemp}
            keyboardType="numeric"
            placeholder="4.2"
          />

          <Text style={styles.inputLabelSm}>Remarks (Optional)</Text>
          <TextInput
            style={[styles.fieldInput, { minHeight: 68, textAlignVertical: 'top' }]}
            value={handoverRemarks}
            onChangeText={setHandoverRemarks}
            placeholder="e.g. Sample handed over in good sealed condition"
            placeholderTextColor="#94A3B8"
            multiline
          />
        </View>

        <View style={styles.handoverBanner}>
          <Text style={styles.handoverCheck}>Chain-of-Custody Handover OTP</Text>
          <Text style={styles.handoverSub}>
            Enter the 5-digit Handover OTP from the receiving lab for {order.orderNumber}
          </Text>
        </View>

        <View style={styles.otpBoxesRow}>
          {otpValue.map((digit, idx) => (
            <View
              key={idx}
              style={[styles.otpBox, { width: otpBoxSize, height: otpBoxSize }]}
            >
              <TextInput
                ref={(el) => {
                  otpInputRefs.current[idx] = el;
                }}
                style={styles.otpDigit}
                value={digit}
                maxLength={otpValue.length}
                keyboardType="number-pad"
                textAlign="center"
                selectTextOnFocus
                returnKeyType={idx === otpValue.length - 1 ? 'done' : 'next'}
                onChangeText={(val) => handleOtpChange(idx, val)}
                onKeyPress={({ nativeEvent }) => {
                  if (nativeEvent.key === 'Backspace' && !digit && idx > 0) {
                    onUpdateOtpDigit(idx - 1, '');
                    otpInputRefs.current[idx - 1]?.focus?.();
                  }
                }}
              />
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.ctaButton, { marginTop: 22 }, submittingAction && { opacity: 0.65 }]}
          disabled={submittingAction}
          onPress={() => onConfirmDropOtp(order)}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Ionicons name="checkmark" size={18} color="#FFFFFF" />
            <Text style={styles.ctaButtonText}>
              {submittingAction ? 'Verifying Handover...' : 'Mark as Completed'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
