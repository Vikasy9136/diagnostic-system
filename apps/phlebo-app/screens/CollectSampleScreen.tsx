import React, { useState } from 'react';
import { Image, Linking, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from '../components/KeyboardAwareScrollView';
import {
  type PickupOrder,
  TUBE_METADATA,
  TubeType,
  validateTubeBarcodeScan,
} from '@diagnostic/shared';
import { BRAND_COLORS, SampleVialHeroIllustration } from '../components/LabSetuBrand';
import { COLORS, FONTS, styles } from '../styles/phleboStyles';
import { type CameraModalState, type SpecimenDraftMap } from '../types/phleboTypes';
import { COMPACT_TEXT_SCALE, lh, MAX_TEXT_SCALE, rf, rs } from '../utils/responsive';
import { formatFullProperAddress } from '../utils/addressUtils';

export interface CollectSampleScreenProps {
  order: PickupOrder;
  specimenDrafts: SpecimenDraftMap;
  samplePhotoUrl: string;
  selfiePhotoUrl?: string;
  pickupTempInput: string;
  uploadingPhoto: boolean;
  uploadingSelfie?: boolean;
  submittingAction: boolean;
  onBack: () => void;
  onUpdateSpecimenDraft: (
    specimenId: string,
    patch: Partial<{ barcode: string; usedTube: TubeType }>
  ) => void;
  onOpenCameraModal: (modal: CameraModalState) => void;
  onClearSamplePhoto: () => void;
  onClearSelfiePhoto?: () => void;
  onTakePhotoWithCamera?: (orderId: string, target?: 'SAMPLE' | 'SELFIE') => void;
  onUploadPhotoFile: (orderId: string, directFile?: unknown, target?: 'SAMPLE' | 'SELFIE') => void;
  onChangePickupTemp: (val: string) => void;
  onConfirmCollection: (order: PickupOrder) => void;
  onMarkDirectPayment?: (order: PickupOrder, method: 'DIRECT_TO_LAB' | 'CASH' | 'UPI_PHLEBO') => void;
  onCollectBookingPayment?: (order: PickupOrder) => void;
  onOpenOrderChat?: (order: PickupOrder) => void;
  enableBarcodeScanner?: boolean;
}

export function CollectSampleScreen({
  order,
  specimenDrafts,
  samplePhotoUrl,
  selfiePhotoUrl = '',
  pickupTempInput,
  uploadingPhoto,
  uploadingSelfie = false,
  submittingAction,
  onBack,
  onUpdateSpecimenDraft,
  onOpenCameraModal,
  onClearSamplePhoto,
  onClearSelfiePhoto,
  onTakePhotoWithCamera,
  onUploadPhotoFile,
  onChangePickupTemp,
  onConfirmCollection,
  onMarkDirectPayment,
  onCollectBookingPayment,
  onOpenOrderChat,
  enableBarcodeScanner = false,
}: CollectSampleScreenProps) {
  const specimens = order.specimens || [];
  const [vialCount, setVialCount] = useState<number>(Math.max(1, specimens.length));
  const [remarks, setRemarks] = useState('');

  const siblingSpecimens = specimens.map((s) => {
    const draft = specimenDrafts[s.id];
    return {
      ...s,
      scannedBarcode: draft?.barcode?.trim() || '',
      scannedTubeType: draft?.usedTube || s.tubeType,
    };
  });

  const verifiedCount = specimens.filter((s) => {
    const draft = specimenDrafts[s.id] || {
      barcode: s.scannedBarcode || '',
      usedTube: s.scannedTubeType || s.tubeType || TubeType.SERUM_RED_GOLD,
    };
    return validateTubeBarcodeScan({
      scannedBarcode: draft.barcode,
      expectedSpecimen: s,
      selectedTubeUsed: draft.usedTube,
      siblingSpecimens,
    }).valid;
  }).length;

  const allTubesVerified = enableBarcodeScanner
    ? (specimens.length > 0 && verifiedCount === specimens.length)
    : true;
  const phleboPhoto = selfiePhotoUrl;
  const isUploading = Boolean(uploadingSelfie || uploadingPhoto);
  const infoStepDone = allTubesVerified && Boolean(samplePhotoUrl) && Boolean(phleboPhoto);
  const unreadChatCount = Number(order.chatUnreadByPhlebo || 0);

  const formattedNow = new Date().toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <KeyboardAwareScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
      <View style={styles.navBarHeader}>
        <TouchableOpacity onPress={onBack} hitSlop={8}>
          <Ionicons name="arrow-back" size={23} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
          <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.navBarTitle}>Sample Collection</Text>
          <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.navBarSubtitle}>
            {order.orderNumber} • {enableBarcodeScanner ? `${verifiedCount}/${specimens.length} Tubes Verified` : `${specimens.length} ${specimens.length === 1 ? 'Specimen' : 'Specimens'}`}
          </Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.bodyContainer}>
        {/* Full Location Address Card with 1-Tap Calling */}
        <View style={[styles.photoProofCard, { marginBottom: 12, backgroundColor: '#F8FAFC', borderLeftWidth: 4, borderLeftColor: BRAND_COLORS.tealPrimary }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <Ionicons name="location" size={17} color={BRAND_COLORS.tealPrimary} />
              <Text style={{ fontSize: 13, fontFamily: FONTS.bold, color: BRAND_COLORS.navyPrimary }}>
                Collection Site Address ({order.smallLabName})
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 13, color: '#0F172A', lineHeight: 19, fontFamily: FONTS.semiBold }}>
            {formatFullProperAddress(order.pickupLocation, order.smallLabName)}
          </Text>

          {/* 1-Tap Direct Call Buttons */}
          <View style={{ flexDirection: 'row', gap: rs(10), marginTop: rs(12) }}>
            {(order.patient?.phone || (order as any).patientPhone) ? (
              <TouchableOpacity
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: rs(8),
                  backgroundColor: '#F0FDF4',
                  borderWidth: 1.2,
                  borderColor: '#86EFAC',
                  borderRadius: rs(10),
                  paddingVertical: rs(10),
                  paddingHorizontal: rs(10),
                  minHeight: rs(44),
                }}
                onPress={() => {
                  const phone = order.patient?.phone || (order as any).patientPhone;
                  Linking.openURL(`tel:${phone}`).catch(() => {});
                }}
              >
                <Ionicons name="call" size={16} color="#15803D" />
                <Text
                  maxFontSizeMultiplier={MAX_TEXT_SCALE}
                  style={{
                    fontSize: rf(13),
                    lineHeight: lh(rf(13)),
                    fontFamily: FONTS.bold,
                    color: '#15803D',
                  }}
                  numberOfLines={1}
                >
                  Call Patient ({order.patient.pseudonym})
                </Text>
              </TouchableOpacity>
            ) : null}

            {order.pickupLocation?.contactPhone ? (
              <TouchableOpacity
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: rs(8),
                  backgroundColor: '#EFF6FF',
                  borderWidth: 1.2,
                  borderColor: '#93C5FD',
                  borderRadius: rs(10),
                  paddingVertical: rs(10),
                  paddingHorizontal: rs(10),
                  minHeight: rs(44),
                }}
                onPress={() => {
                  Linking.openURL(`tel:${order.pickupLocation.contactPhone}`).catch(() => {});
                }}
              >
                <Ionicons name="business" size={16} color="#1D4ED8" />
                <Text
                  maxFontSizeMultiplier={MAX_TEXT_SCALE}
                  style={{
                    fontSize: rf(13),
                    lineHeight: lh(rf(13)),
                    fontFamily: FONTS.bold,
                    color: '#1D4ED8',
                  }}
                  numberOfLines={1}
                >
                  Call Lab Desk
                </Text>
              </TouchableOpacity>
            ) : null}

            {onOpenOrderChat ? (
              <TouchableOpacity
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: rs(8),
                  backgroundColor: '#F0FDFA',
                  borderWidth: 1.2,
                  borderColor: '#99F6E4',
                  borderRadius: rs(10),
                  paddingVertical: rs(10),
                  paddingHorizontal: rs(10),
                  minHeight: rs(44),
                }}
                onPress={() => onOpenOrderChat(order)}
              >
                <Ionicons name="chatbubbles" size={16} color="#0D9488" />
                <Text
                  maxFontSizeMultiplier={MAX_TEXT_SCALE}
                  style={{
                    fontSize: rf(13),
                    lineHeight: lh(rf(13)),
                    fontFamily: FONTS.bold,
                    color: '#0F766E',
                  }}
                  numberOfLines={1}
                >
                  Chat Lab
                </Text>
                {unreadChatCount > 0 ? (
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
                      {unreadChatCount > 99 ? '99+' : unreadChatCount}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
        {/* Payment Banner */}
        {order.paymentStatus === 'PAID' ? (
          <View
            style={{
              backgroundColor: '#DCFCE7',
              borderColor: '#86EFAC',
              borderWidth: 1.2,
              borderRadius: rs(12),
              paddingHorizontal: rs(14),
              paddingVertical: rs(12),
              marginBottom: rs(14),
              flexDirection: 'row',
              alignItems: 'center',
              gap: rs(10),
            }}
          >
            <Ionicons name="checkmark-circle" size={22} color="#15803D" />
            <Text
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
              style={{
                fontSize: rf(13.5),
                lineHeight: lh(rf(13.5)),
                color: '#15803D',
                fontFamily: FONTS.bold,
                flex: 1,
              }}
            >
              ✓ Payment Completed ({order.paymentMethod || 'Settled directly with lab'})
            </Text>
          </View>
        ) : (
          <View
            style={{
              backgroundColor: '#FFFBEB',
              borderColor: '#FCD34D',
              borderWidth: 1.2,
              borderRadius: rs(14),
              padding: rs(14),
              marginBottom: rs(14),
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: rs(10),
              }}
            >
              <Text
                maxFontSizeMultiplier={MAX_TEXT_SCALE}
                style={{
                  fontSize: rf(14),
                  lineHeight: lh(rf(14)),
                  fontFamily: FONTS.bold,
                  color: '#92400E',
                }}
              >
                ⚠️ Payment Due: ₹{order.totalAmountInr || order.courierFeeInr || 0}
              </Text>
              <Text
                maxFontSizeMultiplier={MAX_TEXT_SCALE}
                style={{
                  fontSize: rf(12),
                  lineHeight: lh(rf(12)),
                  fontFamily: FONTS.semiBold,
                  color: '#B45309',
                }}
              >
                Direct or Cash Collection
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: rs(8), flexWrap: 'wrap' }}>
              <TouchableOpacity
                style={{
                  backgroundColor: '#059669',
                  borderWidth: 1,
                  borderColor: '#047857',
                  paddingHorizontal: rs(12),
                  paddingVertical: rs(10),
                  borderRadius: rs(10),
                  minHeight: rs(42),
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={() => onMarkDirectPayment?.(order, 'DIRECT_TO_LAB')}
              >
                <Text
                  maxFontSizeMultiplier={MAX_TEXT_SCALE}
                  style={{
                    color: '#FFFFFF',
                    fontSize: rf(12.5),
                    lineHeight: lh(rf(12.5)),
                    fontFamily: FONTS.bold,
                  }}
                >
                  ✓ Paid to Lab Directly
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  backgroundColor: '#0284C7',
                  borderWidth: 1,
                  borderColor: '#0369A1',
                  paddingHorizontal: rs(12),
                  paddingVertical: rs(10),
                  borderRadius: rs(10),
                  minHeight: rs(42),
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={() => onMarkDirectPayment?.(order, 'CASH')}
              >
                <Text
                  maxFontSizeMultiplier={MAX_TEXT_SCALE}
                  style={{
                    color: '#FFFFFF',
                    fontSize: rf(12.5),
                    lineHeight: lh(rf(12.5)),
                    fontFamily: FONTS.bold,
                  }}
                >
                  💵 Collect Cash
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  backgroundColor: '#4F46E5',
                  borderWidth: 1,
                  borderColor: '#4338CA',
                  paddingHorizontal: rs(12),
                  paddingVertical: rs(10),
                  borderRadius: rs(10),
                  minHeight: rs(42),
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={() => onCollectBookingPayment?.(order)}
              >
                <Text
                  maxFontSizeMultiplier={MAX_TEXT_SCALE}
                  style={{
                    color: '#FFFFFF',
                    fontSize: rf(12.5),
                    lineHeight: lh(rf(12.5)),
                    fontFamily: FONTS.bold,
                  }}
                >
                  💳 Online / UPI
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* 4-Step Visual Progress Stepper matching SS1 */}
        <View style={styles.stepperCard}>
          {[
            { num: 1, label: 'Verify Details', state: 'done' as const },
            {
              num: 2,
              label: 'Collect Sample',
              state: allTubesVerified ? ('done' as const) : ('active' as const),
            },
            {
              num: 3,
              label: 'Add Sample Info',
              state: infoStepDone
                ? ('done' as const)
                : allTubesVerified
                ? ('active' as const)
                : ('pending' as const),
            },
            {
              num: 4,
              label: 'Submit',
              state: infoStepDone ? ('active' as const) : ('pending' as const),
            },
          ].map((step) => {
            const isDone = step.state === 'done';
            const isActive = step.state === 'active';
            return (
              <View
                key={step.num}
                style={[styles.stepperRow, isActive && styles.stepperRowActive]}
              >
                <View
                  style={[
                    styles.stepperCircle,
                    {
                      backgroundColor: isDone
                        ? BRAND_COLORS.emerald
                        : isActive
                        ? BRAND_COLORS.navyPrimary
                        : '#E2E8F0',
                    },
                  ]}
                >
                  {isDone ? (
                    <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                  ) : (
                    <Text
                      style={[
                        styles.stepperNum,
                        { color: isActive ? '#FFFFFF' : BRAND_COLORS.muted },
                      ]}
                    >
                      {step.num}
                    </Text>
                  )}
                </View>
                <Text
                  style={[
                    styles.stepperLabel,
                    {
                      color: isActive
                        ? BRAND_COLORS.navyPrimary
                        : isDone
                        ? '#15803D'
                        : BRAND_COLORS.muted,
                    },
                  ]}
                >
                  {step.label}
                </Text>
                {isDone ? (
                  <Ionicons name="checkmark-circle" size={18} color={BRAND_COLORS.emerald} />
                ) : null}
              </View>
            );
          })}
        </View>

        <View style={{ alignItems: 'center', marginBottom: 14 }}>
          <SampleVialHeroIllustration size={108} />
        </View>

        {enableBarcodeScanner ? (
          <>
            <View style={styles.verifyHintCard}>
              <Text style={styles.verifyHintTitle}>
                Per-Tube Barcode &amp; Vacutainer Validation
              </Text>
              <Text style={styles.verifyHintText}>
                Scan each specimen tube barcode and confirm the physical tube cap color used. Any
                wrong tube or duplicate barcode conflict is flagged immediately.
              </Text>
            </View>

        {specimens.map((spec, idx) => {
          const draft = specimenDrafts[spec.id] || {
            barcode: spec.scannedBarcode || '',
            usedTube: spec.scannedTubeType || spec.tubeType || TubeType.SERUM_RED_GOLD,
          };
          const validation = validateTubeBarcodeScan({
            scannedBarcode: draft.barcode,
            expectedSpecimen: spec,
            selectedTubeUsed: draft.usedTube,
            siblingSpecimens,
          });
          const expectedMeta =
            TUBE_METADATA[validation.expectedTube] || TUBE_METADATA[TubeType.SERUM_RED_GOLD];

          const cardBorderColor =
            validation.status === 'VERIFIED'
              ? '#16A34A'
              : validation.status === 'MISMATCH'
              ? '#DC2626'
              : COLORS.borderLight;

          const statusBg =
            validation.status === 'VERIFIED'
              ? '#DCFCE7'
              : validation.status === 'MISMATCH'
              ? '#FEE2E2'
              : '#FEF3C7';
          const statusColor =
            validation.status === 'VERIFIED'
              ? '#15803D'
              : validation.status === 'MISMATCH'
              ? '#B91C1C'
              : '#B45309';

          return (
            <View
              key={spec.id}
              style={[styles.specimenVerifyCard, { borderColor: cardBorderColor }]}
            >
              <View style={styles.specimenCardTopRow}>
                <View style={{ flex: 1, minWidth: 0, paddingRight: 6 }}>
                  <Text style={styles.specimenCardTitle}>
                    #{idx + 1} {spec.testCode} — {spec.testName}
                  </Text>
                  <Text style={styles.specimenCardSub}>
                    Expected: {expectedMeta.label} • Tag: {spec.barcode}
                  </Text>
                </View>
                <View
                  style={[
                    styles.pickupTimeBadge,
                    { backgroundColor: statusBg, marginBottom: 0, flexShrink: 0 },
                  ]}
                >
                  <Text style={[styles.pickupTimeText, { color: statusColor }]}>
                    {validation.status === 'VERIFIED'
                      ? 'VERIFIED'
                      : validation.status === 'MISMATCH'
                      ? 'MISMATCH'
                      : 'PENDING'}
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.validationBanner,
                  {
                    backgroundColor:
                      validation.status === 'VERIFIED'
                        ? '#F0FDF4'
                        : validation.status === 'MISMATCH'
                        ? '#FEF2F2'
                        : '#F8FAFC',
                    borderColor:
                      validation.status === 'VERIFIED'
                        ? '#BBF7D0'
                        : validation.status === 'MISMATCH'
                        ? '#FECACA'
                        : COLORS.borderLight,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.validationBannerText,
                    {
                      color:
                        validation.status === 'VERIFIED'
                          ? '#166534'
                          : validation.status === 'MISMATCH'
                          ? '#991B1B'
                          : COLORS.textSecondary,
                    },
                  ]}
                >
                  {validation.message}
                </Text>
              </View>

              <Text style={styles.inputLabelSm}>Scanned Barcode</Text>
              <TextInput
                style={styles.fieldInput}
                value={draft.barcode}
                onChangeText={(txt) => onUpdateSpecimenDraft(spec.id, { barcode: txt })}
                placeholder={`Scan or enter ${spec.barcode}`}
                autoCapitalize="characters"
              />

              <View style={styles.scanActionRow}>
                <TouchableOpacity
                  style={styles.scanCamButton}
                  onPress={() =>
                    onOpenCameraModal({
                      mode: 'BARCODE',
                      specimenId: spec.id,
                      specimen: spec,
                    })
                  }
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="camera-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.scanCamButtonText}>Scan Camera</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.matchTagChip}
                  onPress={() =>
                    onUpdateSpecimenDraft(spec.id, {
                      barcode: spec.barcode,
                      usedTube: spec.tubeType || TubeType.SERUM_RED_GOLD,
                    })
                  }
                >
                  <Text style={styles.matchTagChipText}>Match Barcode ({spec.barcode})</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.inputLabelSm, { marginTop: 12 }]}>
                Physical Vacutainer / Cap Used
              </Text>
              <View style={styles.tubeChipsWrap}>
                {(Object.values(TubeType) as TubeType[]).map((t) => {
                  const meta = TUBE_METADATA[t];
                  const selected = draft.usedTube === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[
                        styles.tubeChip,
                        selected && {
                          backgroundColor: meta.bgHex,
                          borderColor: meta.colorHex,
                          borderWidth: 1.5,
                        },
                      ]}
                      onPress={() => onUpdateSpecimenDraft(spec.id, { usedTube: t })}
                    >
                      <View style={[styles.tubeColorDot, { backgroundColor: meta.colorHex }]} />
                      <Text
                        style={[
                          styles.tubeChipText,
                          selected && { color: meta.colorHex, fontFamily: FONTS.bold },
                        ]}
                      >
                        {meta.shortTag} ({meta.capColorName.replace(' Cap', '')})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}
          </>
        ) : (
          <View style={styles.photoProofCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: rs(6) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: rs(8), flex: 1, minWidth: 0 }}>
                <Ionicons name="flask-outline" size={20} color={BRAND_COLORS.tealPrimary} />
                <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.specimenCardTitle}>
                  Specimens to Collect ({specimens.length} Total)
                </Text>
              </View>
              <View
                style={[
                  styles.pickupTimeBadge,
                  {
                    marginBottom: 0,
                    backgroundColor: '#F0FDFA',
                    borderColor: '#99F6E4',
                    borderWidth: 1,
                  },
                ]}
              >
                <Text
                  maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                  style={[styles.pickupTimeText, { color: BRAND_COLORS.tealPrimary, fontFamily: FONTS.bold }]}
                >
                  {specimens.length} {specimens.length === 1 ? 'Tube' : 'Tubes'} Required
                </Text>
              </View>
            </View>

            <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={[styles.specimenCardSub, { marginBottom: rs(12) }]}>
              Collect required diagnostic samples into designated vacutainer tubes and store safely in chilled carrier.
            </Text>

            {specimens.map((spec, idx) => {
              const meta = TUBE_METADATA[spec.tubeType || TubeType.SERUM_RED_GOLD] || TUBE_METADATA[TubeType.SERUM_RED_GOLD];
              return (
                <View
                  key={spec.id}
                  style={{
                    backgroundColor: '#F8FAFC',
                    borderRadius: rs(12),
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                    padding: rs(12),
                    marginBottom: rs(8),
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0, paddingRight: rs(8) }}>
                    <Text
                      maxFontSizeMultiplier={MAX_TEXT_SCALE}
                      style={{
                        fontSize: rf(13.5),
                        lineHeight: lh(rf(13.5)),
                        fontFamily: FONTS.bold,
                        color: BRAND_COLORS.navyPrimary,
                      }}
                      numberOfLines={1}
                    >
                      #{idx + 1} {spec.testCode} — {spec.testName}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: rs(6), marginTop: rs(4) }}>
                      <View style={{ width: rs(10), height: rs(10), borderRadius: rs(5), backgroundColor: meta.colorHex }} />
                      <Text
                        maxFontSizeMultiplier={MAX_TEXT_SCALE}
                        style={{
                          fontSize: rf(12),
                          lineHeight: lh(rf(12)),
                          fontFamily: FONTS.medium,
                          color: '#475569',
                        }}
                      >
                        {meta.label}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={{
                      backgroundColor: meta.bgHex || '#F1F5F9',
                      borderColor: meta.colorHex,
                      borderWidth: 1,
                      paddingHorizontal: rs(9),
                      paddingVertical: rs(4),
                      borderRadius: rs(8),
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: rs(4),
                    }}
                  >
                    <Ionicons name="color-filter-outline" size={13} color={meta.colorHex} />
                    <Text
                      maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                      style={{
                        fontSize: rf(11),
                        lineHeight: lh(rf(11)),
                        fontFamily: FONTS.bold,
                        color: meta.colorHex,
                      }}
                    >
                      {meta.shortTag}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Add Sample Info Card matching SS1 & SS2 */}
        <View style={styles.photoProofCard}>
          <Text style={[styles.specimenCardTitle, { marginBottom: 10 }]}>Add Sample Info</Text>

          <Text style={styles.inputLabelSm}>Collection Time *</Text>
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

          <Text style={styles.inputLabelSm}>No. of Vials / Tubes *</Text>
          <View style={styles.vialCounterBox}>
            <TouchableOpacity
              style={styles.vialStepBtn}
              onPress={() => setVialCount((c) => Math.max(1, c - 1))}
            >
              <Ionicons name="remove" size={18} color={BRAND_COLORS.navyPrimary} />
            </TouchableOpacity>
            <Text style={styles.vialCountVal}>{vialCount}</Text>
            <TouchableOpacity
              style={styles.vialStepBtn}
              onPress={() => setVialCount((c) => Math.min(20, c + 1))}
            >
              <Ionicons name="add" size={18} color={BRAND_COLORS.navyPrimary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.inputLabelSm}>Remarks (Optional)</Text>
          <TextInput
            style={[styles.fieldInput, { minHeight: 72, textAlignVertical: 'top' }]}
            value={remarks}
            onChangeText={setRemarks}
            placeholder="e.g. Fasting sample, difficult vein, etc."
            placeholderTextColor="#94A3B8"
            multiline
          />
        </View>

        {/* CARD 1: SAMPLE COLLECTION PHOTO (SPECIMEN VIALS / SAMPLE BAG) */}
        <View style={styles.photoProofCard}>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
              <Ionicons name="flask-outline" size={20} color={BRAND_COLORS.tealPrimary} />
              <Text style={styles.specimenCardTitle}>Sample Collection Photo</Text>
            </View>
            <View
              style={[
                styles.pickupTimeBadge,
                {
                  marginBottom: 0,
                  flexShrink: 0,
                  backgroundColor: samplePhotoUrl ? '#DCFCE7' : '#FFEDD5',
                },
              ]}
            >
              <Text
                style={[
                  styles.pickupTimeText,
                  { color: samplePhotoUrl ? '#15803D' : '#C2410C' },
                ]}
              >
                {samplePhotoUrl ? '✓ Sample Captured' : 'Mandatory'}
              </Text>
            </View>
          </View>
          <Text style={[styles.specimenCardSub, { marginTop: 4, marginBottom: 12 }]}>
            Take a clear photo of the collected specimen vials / sealed sample pouch before leaving {order.smallLabName}.
          </Text>

          {samplePhotoUrl ? (
            <View style={{ marginBottom: 12 }}>
              <Image
                source={{ uri: samplePhotoUrl }}
                style={styles.samplePhotoPreview}
                resizeMode="cover"
              />
              <TouchableOpacity
                style={{ marginTop: 6, alignSelf: 'flex-end' }}
                onPress={onClearSamplePhoto}
              >
                <Text style={{ color: COLORS.errorRed, fontSize: 12, fontFamily: FONTS.semiBold }}>
                  Retake / Remove Sample Photo
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.actionsRow}>
            {Platform.OS === 'web' && typeof document !== 'undefined' ? (
              <View style={{ flex: 1, position: 'relative' }}>
                <TouchableOpacity
                  style={[styles.scanCamButton, { width: '100%', backgroundColor: '#0284C7' }, uploadingPhoto && { opacity: 0.65 }]}
                  disabled={uploadingPhoto}
                >
                  <Ionicons name="camera-outline" size={17} color="#FFFFFF" />
                  <Text style={styles.scanCamButtonText}>
                    {uploadingPhoto ? 'Uploading Sample...' : '🧪 Take Sample Photo'}
                  </Text>
                </TouchableOpacity>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={uploadingPhoto}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    opacity: 0,
                    cursor: 'pointer',
                    zIndex: 10,
                  }}
                  onChange={(e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (!file) return;
                    onUploadPhotoFile(order.id, file, 'SAMPLE');
                  }}
                />
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.scanCamButton, { flex: 1, backgroundColor: '#0284C7' }, uploadingPhoto && { opacity: 0.65 }]}
                disabled={uploadingPhoto}
                onPress={() => {
                  if (onTakePhotoWithCamera) {
                    onTakePhotoWithCamera(order.id, 'SAMPLE');
                  } else {
                    onUploadPhotoFile(order.id, undefined, 'SAMPLE');
                  }
                }}
              >
                <Ionicons name="camera-outline" size={17} color="#FFFFFF" />
                <Text style={styles.scanCamButtonText}>
                  {uploadingPhoto ? 'Opening Camera...' : '🧪 Take Sample Photo'}
                </Text>
              </TouchableOpacity>
            )}

            {Platform.OS === 'web' && typeof document !== 'undefined' ? (
              <View style={{ position: 'relative' }}>
                <TouchableOpacity
                  style={[styles.btnSecondary, uploadingPhoto && { opacity: 0.65 }]}
                  disabled={uploadingPhoto}
                >
                  <Text style={styles.btnSecondaryText}>Upload</Text>
                </TouchableOpacity>
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingPhoto}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    opacity: 0,
                    cursor: 'pointer',
                    zIndex: 10,
                  }}
                  onChange={(e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (!file) return;
                    onUploadPhotoFile(order.id, file, 'SAMPLE');
                  }}
                />
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.btnSecondary, uploadingPhoto && { opacity: 0.65 }]}
                disabled={uploadingPhoto}
                onPress={() => onUploadPhotoFile(order.id, undefined, 'SAMPLE')}
              >
                <Text style={styles.btnSecondaryText}>Upload</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* CARD 2: PHLEBOTOMIST PHOTO PROOF */}
        <View style={styles.photoProofCard}>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
              <MaterialCommunityIcons name="camera-account" size={20} color={BRAND_COLORS.tealPrimary} />
              <Text style={styles.specimenCardTitle}>Phlebotomist Photo Proof</Text>
            </View>
            <View
              style={[
                styles.pickupTimeBadge,
                {
                  marginBottom: 0,
                  flexShrink: 0,
                  backgroundColor: phleboPhoto ? '#DCFCE7' : '#FFEDD5',
                },
              ]}
            >
              <Text
                style={[
                  styles.pickupTimeText,
                  { color: phleboPhoto ? '#15803D' : '#C2410C' },
                ]}
              >
                {phleboPhoto ? '✓ Photo Uploaded' : 'Mandatory'}
              </Text>
            </View>
          </View>
          <Text style={[styles.specimenCardSub, { marginTop: 4, marginBottom: 12 }]}>
            Capture a clear selfie or photo of the phlebotomist at {order.smallLabName} as attendance and custody verification.
          </Text>

          {phleboPhoto ? (
            <View style={{ marginBottom: 12 }}>
              <Image
                source={{ uri: phleboPhoto }}
                style={styles.samplePhotoPreview}
                resizeMode="cover"
              />
              <TouchableOpacity
                style={{ marginTop: 6, alignSelf: 'flex-end' }}
                onPress={() => {
                  if (onClearSelfiePhoto) onClearSelfiePhoto();
                  onClearSamplePhoto();
                }}
              >
                <Text style={{ color: COLORS.errorRed, fontSize: 12, fontFamily: FONTS.semiBold }}>
                  Retake / Remove Photo
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.actionsRow}>
            {Platform.OS === 'web' && typeof document !== 'undefined' ? (
              <View style={{ flex: 1, position: 'relative' }}>
                <TouchableOpacity
                  style={[styles.scanCamButton, { width: '100%', backgroundColor: '#0D9488' }, isUploading && { opacity: 0.65 }]}
                  disabled={isUploading}
                >
                  <Ionicons name="camera-outline" size={17} color="#FFFFFF" />
                  <Text style={styles.scanCamButtonText}>
                    {isUploading ? 'Uploading Photo...' : '🤳 Take Phlebo Photo'}
                  </Text>
                </TouchableOpacity>
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  disabled={isUploading}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    opacity: 0,
                    cursor: 'pointer',
                    zIndex: 10,
                  }}
                  onChange={(e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (!file) return;
                    onUploadPhotoFile(order.id, file, 'SELFIE');
                  }}
                />
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.scanCamButton, { flex: 1, backgroundColor: '#0D9488' }, isUploading && { opacity: 0.65 }]}
                disabled={isUploading}
                onPress={() => {
                  if (onTakePhotoWithCamera) {
                    onTakePhotoWithCamera(order.id, 'SELFIE');
                  } else {
                    onUploadPhotoFile(order.id, undefined, 'SELFIE');
                  }
                }}
              >
                <Ionicons name="camera-outline" size={17} color="#FFFFFF" />
                <Text style={styles.scanCamButtonText}>
                  {isUploading ? 'Opening Camera...' : '🤳 Take Phlebo Photo'}
                </Text>
              </TouchableOpacity>
            )}

            {Platform.OS === 'web' && typeof document !== 'undefined' ? (
              <View style={{ position: 'relative' }}>
                <TouchableOpacity
                  style={[styles.btnSecondary, isUploading && { opacity: 0.65 }]}
                  disabled={isUploading}
                >
                  <Text style={styles.btnSecondaryText}>Upload File</Text>
                </TouchableOpacity>
                <input
                  type="file"
                  accept="image/*"
                  disabled={isUploading}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    opacity: 0,
                    cursor: 'pointer',
                    zIndex: 10,
                  }}
                  onChange={(e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (!file) return;
                    onUploadPhotoFile(order.id, file, 'SELFIE');
                  }}
                />
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.btnSecondary, isUploading && { opacity: 0.65 }]}
                disabled={isUploading}
                onPress={() => onUploadPhotoFile(order.id, undefined, 'SELFIE')}
              >
                <Text style={styles.btnSecondaryText}>Upload File</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.ctaButton, (submittingAction || isUploading) && { opacity: 0.65 }]}
          disabled={submittingAction || isUploading}
          onPress={() => onConfirmCollection(order)}
        >
          <Text style={styles.ctaButtonText}>
            {submittingAction
              ? 'Saving Sample Pickup...'
              : enableBarcodeScanner
                ? `Save & Confirm Pickup (${verifiedCount}/${specimens.length}) →`
                : 'Save & Confirm Pickup →'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAwareScrollView>
  );
}
