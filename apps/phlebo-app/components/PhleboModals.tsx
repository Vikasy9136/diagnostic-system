import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import {
  evaluatePointServiceCoverage,
  formatInr,
  type KitAllocationRecord,
  type LiveGeoCoordinate,
  type PhlebotomistProfile,
  type PhlebotomistShiftStatus,
  type PickupOrder,
  type PlatformNotification,
  type ServiceZoneRecord,
  TUBE_METADATA,
  TubeType,
} from '@diagnostic/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type DynamicAlertVariant } from './DynamicAlertModal';
import { BRAND_COLORS, BRAND_FONTS } from './LabSetuBrand';
import { OsmWebMapPreview } from './OsmWebMapPreview';
import { COLORS, styles } from '../styles/phleboStyles';
import { lh, MAX_TEXT_SCALE, rf } from '../utils/responsive';
import {
  type ActivePaymentLinkState,
  type CameraModalState,
  type OpenPoolEntry,
  type SpecimenDraftMap,
} from '../types/phleboTypes';
import { formatLabel } from '../utils/phleboHelpers';

export interface PaymentLinkModalProps {
  activePaymentLink: ActivePaymentLinkState | null;
  verifyingLinkPayment: boolean;
  onClose: () => void;
  onVerify: () => void;
  onReopenLink: (url: string) => void;
}

export function PaymentLinkModal({
  activePaymentLink,
  verifyingLinkPayment,
  onClose,
  onVerify,
  onReopenLink,
}: PaymentLinkModalProps) {
  return (
    <Modal
      visible={Boolean(activePaymentLink)}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(15, 23, 42, 0.58)',
          justifyContent: 'center',
          padding: 20,
        }}
      >
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            padding: 20,
            borderWidth: 1,
            borderColor: COLORS.borderLight,
          }}
        >
          <Text
            style={{
              fontSize: rf(16.5),
              lineHeight: lh(rf(16.5)),
              fontFamily: BRAND_FONTS.bold,
              color: COLORS.textPrimary,
              includeFontPadding: true,
            }}
          >
            💳 Confirm Mobile Payment
          </Text>
          <Text
            style={{
              fontSize: rf(13),
              lineHeight: lh(rf(13)),
              fontFamily: BRAND_FONTS.medium,
              color: COLORS.textSecondary,
              marginTop: 6,
              includeFontPadding: true,
            }}
          >
            Booking {activePaymentLink?.orderNumber} • Amount:{' '}
            {formatInr(activePaymentLink?.amountInr || 0)}
          </Text>
          <Text
            style={{
              fontSize: rf(12),
              lineHeight: lh(rf(12), 1.42),
              fontFamily: BRAND_FONTS.regular,
              color: COLORS.textSecondary,
              marginTop: 8,
              includeFontPadding: true,
            }}
          >
            Complete the Razorpay checkout in the browser/UPI sheet, then tap Verify &amp; Confirm below to mark this order paid.
          </Text>

          <View style={{ marginTop: 16, gap: 10 }}>
            <TouchableOpacity
              style={[styles.ctaButton, verifyingLinkPayment && { opacity: 0.65 }]}
              disabled={verifyingLinkPayment}
              onPress={onVerify}
            >
              <Text style={styles.ctaButtonText}>
                {verifyingLinkPayment ? 'Checking Razorpay Status...' : 'Check & Confirm Payment ✓'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnSecondary, { flex: 0, paddingVertical: 12 }]}
              onPress={() => {
                if (activePaymentLink?.shortUrl) {
                  onReopenLink(activePaymentLink.shortUrl);
                }
              }}
            >
              <Text style={styles.btnSecondaryText}>Re-open Razorpay Checkout Link</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnSecondary, { flex: 0, paddingVertical: 10, backgroundColor: '#F8FAFC' }]}
              onPress={onClose}
            >
              <Text style={[styles.btnSecondaryText, { color: COLORS.textSecondary }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export interface BroadcastDispatchModalProps {
  activeBroadcastMatch: OpenPoolEntry | null;
  riderLocation: LiveGeoCoordinate;
  submittingAction: boolean;
  onDismissBroadcast: (orderId: string) => void;
  onAcceptPoolOrder: (order: PickupOrder) => void;
  onOpenDirectionsMap: (lat?: number, lng?: number, fallbackAddr?: string) => void;
}

export function BroadcastDispatchModal({
  activeBroadcastMatch,
  riderLocation,
  submittingAction,
  onDismissBroadcast,
  onAcceptPoolOrder,
  onOpenDirectionsMap,
}: BroadcastDispatchModalProps) {
  const insets = useSafeAreaInsets();
  const [remSeconds, setRemSeconds] = useState(45);

  useEffect(() => {
    if (!activeBroadcastMatch) return;
    const updateCountdown = () => {
      const expiresMs = activeBroadcastMatch.order.broadcastExpiresAt
        ? new Date(activeBroadcastMatch.order.broadcastExpiresAt).getTime()
        : new Date(activeBroadcastMatch.order.createdAt).getTime() + 45000;
      const diffMs = expiresMs - Date.now();
      const sec = Math.max(0, Math.ceil(diffMs / 1000));
      setRemSeconds(sec);
      if (sec <= 0) {
        onDismissBroadcast(activeBroadcastMatch.order.id);
      }
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [activeBroadcastMatch, onDismissBroadcast]);

  return (
    <Modal
      visible={Boolean(activeBroadcastMatch)}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => {
        if (activeBroadcastMatch) {
          onDismissBroadcast(activeBroadcastMatch.order.id);
        }
      }}
    >
      {activeBroadcastMatch ? (
        <View
          style={[
            styles.modalBackdrop,
            {
              backgroundColor: 'rgba(9, 13, 22, 0.82)',
              justifyContent: 'center',
              paddingTop: Math.max(insets.top + 12, 16),
              paddingBottom: Math.max(insets.bottom + 12, 16),
              paddingLeft: Math.max(insets.left + 14, 16),
              paddingRight: Math.max(insets.right + 14, 16),
            },
          ]}
        >
          <View
            style={{
              backgroundColor: '#090D16',
              borderRadius: 24,
              borderWidth: 2,
              borderColor: '#10B981',
              padding: 16,
              maxHeight: '92%',
              width: '100%',
              maxWidth: 480,
              alignSelf: 'center',
              shadowColor: '#10B981',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.35,
              shadowRadius: 20,
              elevation: 28,
            }}
          >
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* 1. Header Bar: Rapido Captain Status + Timer */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <View
                  style={{
                    backgroundColor: '#064E3B',
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 3.5,
                      backgroundColor: '#10B981',
                    }}
                  />
                  <Text
                    style={{
                      fontSize: 11.5,
                      fontFamily: BRAND_FONTS.bold,
                      color: '#10B981',
                      letterSpacing: 0.5,
                    }}
                  >
                    ⚡ NEW PICKUP REQUEST
                  </Text>
                </View>

                <View
                  style={{
                    backgroundColor: '#451A03',
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 8,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: BRAND_FONTS.bold,
                      color: '#F59E0B',
                    }}
                  >
                    ⏱ {remSeconds}s
                  </Text>
                </View>
              </View>

              {/* Surge Incentive Banner */}
              {Boolean(
                activeBroadcastMatch.order.surgeIncentiveInr &&
                  activeBroadcastMatch.order.surgeIncentiveInr > 0
              ) && (
                <View
                  style={{
                    backgroundColor: '#451A03',
                    borderColor: '#F59E0B',
                    borderWidth: 1,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    marginTop: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontFamily: BRAND_FONTS.bold,
                      color: '#FBBF24',
                    }}
                  >
                    ⚡ +₹{activeBroadcastMatch.order.surgeIncentiveInr} SURGE HIKE INCLUDED
                  </Text>
                </View>
              )}

              {/* 2. Hero Payout Box (Rapido Big Earnings Banner) */}
              <View
                style={{
                  backgroundColor: '#062A24',
                  borderColor: '#0D9488',
                  borderWidth: 1,
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  marginTop: 10,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 22,
                      fontFamily: BRAND_FONTS.extraBold,
                      color: '#10B981',
                    }}
                  >
                    Earn {formatInr(activeBroadcastMatch.order.courierFeeInr || 100)}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontFamily: BRAND_FONTS.bold,
                      color: '#94A3B8',
                    }}
                  >
                    {activeBroadcastMatch.order.orderNumber}
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 11,
                    fontFamily: BRAND_FONTS.medium,
                    color: '#5EEAD4',
                    marginTop: 2,
                  }}
                >
                  Guaranteed Courier Earnings • {formatLabel(activeBroadcastMatch.order.priority)}
                </Text>
              </View>

              {/* 3. Route Details Container (Pickup -> Drop) */}
              <View
                style={{
                  backgroundColor: '#131D33',
                  borderColor: '#1E293B',
                  borderWidth: 1,
                  borderRadius: 16,
                  padding: 12,
                  marginTop: 10,
                }}
              >
                {/* Pickup Row */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <View
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      backgroundColor: '#10B981',
                      marginTop: 4,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <View
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: '#FFFFFF',
                      }}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        fontSize: 14,
                        fontFamily: BRAND_FONTS.bold,
                        color: '#FFFFFF',
                      }}
                    >
                      {activeBroadcastMatch.order.smallLabName}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        fontFamily: BRAND_FONTS.regular,
                        color: '#94A3B8',
                        marginTop: 1,
                      }}
                    >
                      {activeBroadcastMatch.order.pickupLocation?.address}
                    </Text>
                    <View
                      style={{
                        backgroundColor: '#0C4A6E',
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 6,
                        alignSelf: 'flex-start',
                        marginTop: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontFamily: BRAND_FONTS.bold,
                          color: '#38BDF8',
                        }}
                      >
                        📍 {activeBroadcastMatch.distFromRiderKm} km away from you
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Connecting Path */}
                <View
                  style={{
                    width: 2,
                    height: 14,
                    backgroundColor: '#334155',
                    marginLeft: 5,
                    marginVertical: 4,
                  }}
                />

                {/* Drop Row */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <View
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      backgroundColor: '#EF4444',
                      marginTop: 4,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <View
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: '#FFFFFF',
                      }}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        fontSize: 14,
                        fontFamily: BRAND_FONTS.bold,
                        color: '#FFFFFF',
                      }}
                    >
                      Drop: {activeBroadcastMatch.order.targetLabName}
                    </Text>
                    {Boolean(activeBroadcastMatch.order.deliveryLocation?.address) && (
                      <Text
                        style={{
                          fontSize: 12,
                          fontFamily: BRAND_FONTS.regular,
                          color: '#94A3B8',
                          marginTop: 1,
                        }}
                      >
                        {activeBroadcastMatch.order.deliveryLocation.address}
                      </Text>
                    )}
                    <View
                      style={{
                        backgroundColor: '#2E1065',
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 6,
                        alignSelf: 'flex-start',
                        marginTop: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontFamily: BRAND_FONTS.semiBold,
                          color: '#C4B5FD',
                        }}
                      >
                        🧪 {(activeBroadcastMatch.order.specimens || []).length} Specimen(s) • Cold-Chain Custody
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Map Preview */}
              <View style={{ marginTop: 10, borderRadius: 14, overflow: 'hidden' }}>
                <OsmWebMapPreview
                  latitude={
                    activeBroadcastMatch.order.pickupLocation?.latitude || riderLocation.latitude
                  }
                  longitude={
                    activeBroadcastMatch.order.pickupLocation?.longitude || riderLocation.longitude
                  }
                  title={`Pickup Point • ${activeBroadcastMatch.order.smallLabName}`}
                  height={110}
                  onOpenGoogleMaps={() =>
                    onOpenDirectionsMap(
                      activeBroadcastMatch.order.pickupLocation?.latitude,
                      activeBroadcastMatch.order.pickupLocation?.longitude,
                      activeBroadcastMatch.order.pickupLocation?.address
                    )
                  }
                />
              </View>

              {/* 4. Action Buttons: ✕ Reject & ⚡ ACCEPT PICKUP (Rapido style) */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: '#1E293B',
                    borderWidth: 1.5,
                    borderColor: '#EF4444',
                    borderRadius: 14,
                    paddingVertical: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  disabled={submittingAction}
                  onPress={() => onDismissBroadcast(activeBroadcastMatch.order.id)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={{
                      fontSize: 14.5,
                      fontFamily: BRAND_FONTS.bold,
                      color: '#F87171',
                    }}
                  >
                    ✕ Reject
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    flex: 1.8,
                    backgroundColor: '#10B981',
                    borderRadius: 14,
                    paddingVertical: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: submittingAction ? 0.7 : 1,
                  }}
                  disabled={submittingAction}
                  onPress={() => onAcceptPoolOrder(activeBroadcastMatch.order)}
                  activeOpacity={0.88}
                >
                  <Text
                    style={{
                      fontSize: 15.5,
                      fontFamily: BRAND_FONTS.extraBold,
                      color: '#FFFFFF',
                      letterSpacing: 0.3,
                    }}
                  >
                    {submittingAction ? 'Claiming...' : '⚡ ACCEPT PICKUP'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      ) : null}
    </Modal>
  );
}

export interface LocationPickerModalProps {
  visible: boolean;
  riderLocation: LiveGeoCoordinate;
  assignedAdminZone: ServiceZoneRecord | null;
  myPhleboProfile: PhlebotomistProfile | null;
  serviceZones: ServiceZoneRecord[];
  zonesLoaded: boolean;
  riderCoverage: ReturnType<typeof evaluatePointServiceCoverage>;
  onClose: () => void;
  onSyncDeviceGps: (lat: number, lng: number) => void;
  onShowAlert: (opts: { variant: DynamicAlertVariant; title: string; message: string }) => void;
}

export function LocationPickerModal({
  visible,
  riderLocation,
  assignedAdminZone,
  myPhleboProfile,
  serviceZones,
  zonesLoaded,
  riderCoverage,
  onClose,
  onSyncDeviceGps,
  onShowAlert,
}: LocationPickerModalProps) {
  const insets = useSafeAreaInsets();
  const [syncingGps, setSyncingGps] = useState(false);

  const activeZones = serviceZones.filter((z) => z.isActive);
  const assignedZoneName =
    assignedAdminZone?.name || myPhleboProfile?.assignedZoneName || '';
  const assignedZoneCode =
    assignedAdminZone?.zoneCode || myPhleboProfile?.assignedZoneCode || '';
  const assignedZoneCity =
    assignedAdminZone?.city || myPhleboProfile?.assignedCity || '';
  const isAssignedPaused = assignedAdminZone ? !assignedAdminZone.isActive : false;

  const handleRequestDeviceGps = () => {
    if (Platform.OS === 'web') {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        onShowAlert({
          variant: 'info',
          title: 'Device GPS Unavailable',
          message: 'Browser geolocation is not available. Ensure location permission is enabled.',
        });
        return;
      }
      setSyncingGps(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setSyncingGps(false);
          onSyncDeviceGps(pos.coords.latitude, pos.coords.longitude);
        },
        (err) => {
          setSyncingGps(false);
          onShowAlert({
            variant: 'warning',
            title: 'GPS Permission Declined',
            message: err.message || 'Allow location permission in your browser settings to sync live GPS.',
          });
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
      return;
    }

    setSyncingGps(true);
    void (async () => {
      try {
        const fg = await Location.requestForegroundPermissionsAsync();
        if (fg.status !== 'granted') {
          onShowAlert({
            variant: 'warning',
            title: 'GPS Permission Required',
            message: 'Allow device location permission so Admin and nearby labs see your live telemetry.',
          });
          return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        onSyncDeviceGps(pos.coords.latitude, pos.coords.longitude);
      } catch {
        onShowAlert({
          variant: 'warning',
          title: 'GPS Signal Unavailable',
          message: 'Could not read current device GPS coordinates. Check device Location Services.',
        });
      } finally {
        setSyncingGps(false);
      }
    })();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View
        style={[
          styles.modalBackdrop,
          {
            paddingTop: Math.max(insets.top + 12, 16),
            paddingBottom: Math.max(insets.bottom + 12, 16),
            paddingLeft: Math.max(insets.left + 14, 16),
            paddingRight: Math.max(insets.right + 14, 16),
          },
        ]}
      >
        <View style={[styles.modalCard, { maxHeight: '90%' }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.modalCardTitle}>
              🗺️ Admin-Assigned Zone &amp; Live GPS
            </Text>
            <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.modalCardSub}>
              Operating zones are managed dynamically by Platform Admin. Sync your phone GPS for live
              distance and radar alerts inside your assigned area.
            </Text>

            <View
              style={{
                backgroundColor: assignedZoneName
                  ? isAssignedPaused
                    ? '#FEF3C7'
                    : '#F0FDFA'
                  : '#FEF3C7',
                borderWidth: 1,
                borderColor: assignedZoneName
                  ? isAssignedPaused
                    ? '#FDE68A'
                    : '#99F6E4'
                  : '#FDE68A',
                borderRadius: 12,
                padding: 12,
                marginTop: 12,
                marginBottom: 12,
              }}
            >
              <Text
                maxFontSizeMultiplier={MAX_TEXT_SCALE}
                style={{
                  fontFamily: BRAND_FONTS.bold,
                  fontSize: rf(12),
                  lineHeight: lh(rf(12)),
                  color: assignedZoneName && !isAssignedPaused ? '#0F766E' : '#B45309',
                  marginBottom: 4,
                }}
              >
                {assignedZoneName
                  ? isAssignedPaused
                    ? '⏸ Assigned Zone Paused by Admin'
                    : '✓ Assigned Operating Zone (Admin Locked)'
                  : '⏳ Admin Zone Assignment Pending'}
              </Text>
              {assignedZoneName ? (
                <>
                  <Text
                    maxFontSizeMultiplier={MAX_TEXT_SCALE}
                    style={{
                      fontFamily: BRAND_FONTS.bold,
                      fontSize: rf(14),
                      lineHeight: lh(rf(14)),
                      color: COLORS.primaryNavy,
                    }}
                  >
                    {assignedZoneCode ? `${assignedZoneCode} • ` : ''}
                    {assignedZoneName}
                  </Text>
                  <Text
                    maxFontSizeMultiplier={MAX_TEXT_SCALE}
                    style={{
                      fontFamily: BRAND_FONTS.medium,
                      fontSize: rf(11.5),
                      lineHeight: lh(rf(11.5)),
                      color: COLORS.textSecondary,
                      marginTop: 3,
                    }}
                  >
                    {assignedZoneCity ? `${assignedZoneCity}` : 'Active City'}
                    {assignedAdminZone
                      ? ` • ${assignedAdminZone.radiusKm} km radar • Phase: ${assignedAdminZone.launchPhase}`
                      : ''}
                  </Text>
                  {assignedAdminZone?.pincodes?.length ? (
                    <Text
                      maxFontSizeMultiplier={MAX_TEXT_SCALE}
                      style={{
                        fontFamily: BRAND_FONTS.medium,
                        fontSize: rf(11),
                        lineHeight: lh(rf(11)),
                        color: BRAND_COLORS.navyPrimary,
                        marginTop: 4,
                      }}
                    >
                      Pincodes: {assignedAdminZone.pincodes.join(', ')}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text
                  maxFontSizeMultiplier={MAX_TEXT_SCALE}
                  style={{
                    fontFamily: BRAND_FONTS.medium,
                    fontSize: rf(11.5),
                    lineHeight: lh(rf(11.5)),
                    color: '#92400E',
                  }}
                >
                  Ask Platform Admin to assign your operating service zone from Web Admin → Field
                  Phlebotomists.
                </Text>
              )}
            </View>

            <TouchableOpacity
              style={[styles.scanCamButton, { paddingVertical: 11 }, syncingGps && { opacity: 0.7 }]}
              disabled={syncingGps}
              onPress={handleRequestDeviceGps}
            >
              {syncingGps ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.scanCamButtonText}>🛰️ Sync Device Live Location</Text>
              )}
            </TouchableOpacity>

            <OsmWebMapPreview
              latitude={riderLocation.latitude}
              longitude={riderLocation.longitude}
              title="Live GPS Location Area"
              height={155}
            />

            <View
              style={[
                styles.zoneCoveragePill,
                {
                  backgroundColor: riderCoverage.covered ? '#DCFCE7' : '#FEF3C7',
                  marginBottom: 12,
                },
              ]}
            >
              <Text
                style={[
                  styles.zoneCoverageText,
                  { color: riderCoverage.covered ? '#15803D' : '#B45309' },
                ]}
              >
                {riderCoverage.covered
                  ? `🟢 Live GPS inside Admin zone: ${riderCoverage.matchedZone?.name || riderCoverage.matchedZone?.zoneCode}`
                  : zonesLoaded
                  ? `⚠ ${riderCoverage.message}`
                  : 'Syncing live service zones from Admin...'}
              </Text>
            </View>

            <Text style={styles.inputLabelSm}>
              Live Active Admin Zones ({activeZones.length})
            </Text>
            {activeZones.length === 0 ? (
              <View style={styles.presetLocationRow}>
                <Text style={styles.presetLocationName}>
                  {zonesLoaded
                    ? 'No active service zones published by Admin right now.'
                    : 'Loading dynamic zones from Admin...'}
                </Text>
              </View>
            ) : (
              <View style={{ gap: 6 }}>
                {activeZones.map((zone) => {
                  const isMine =
                    assignedAdminZone?.id === zone.id ||
                    myPhleboProfile?.assignedZoneId === zone.id;
                  return (
                    <View
                      key={zone.id}
                      style={[
                        styles.presetLocationRow,
                        isMine && {
                          borderColor: BRAND_COLORS.tealPrimary,
                          backgroundColor: '#F0FDFA',
                        },
                      ]}
                    >
                      <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                        <Text style={styles.presetLocationName}>
                          {zone.zoneCode} • {zone.name}
                          {isMine ? ' (Assigned)' : ''}
                        </Text>
                        <Text style={styles.presetLocationCoords}>
                          {zone.city} • {zone.radiusKm} km radar • {zone.launchPhase}
                        </Text>
                      </View>
                      <Text style={styles.presetLocationCoords}>
                        {zone.city}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            <View style={[styles.actionsRow, { marginTop: 14 }]}>
              <TouchableOpacity style={styles.btnPrimary} onPress={onClose}>
                <Text style={styles.btnPrimaryText}>Done</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export interface CameraScannerModalProps {
  cameraModal: CameraModalState | null;
  cameraStatusText: string;
  selectedOrder: PickupOrder | null;
  specimenDrafts: SpecimenDraftMap;
  uploadingPhoto: boolean;
  onClose: () => void;
  onCaptureSnapshot: (orderId: string, photoUri?: string) => void;
  onUploadPhotoFile: (orderId: string) => void;
  onUpdateSpecimenDraft: (
    specimenId: string,
    patch: Partial<{ barcode: string; usedTube: TubeType }>
  ) => void;
}

export function CameraScannerModal({
  cameraModal,
  cameraStatusText,
  selectedOrder,
  specimenDrafts,
  uploadingPhoto,
  onClose,
  onCaptureSnapshot,
  onUploadPhotoFile,
  onUpdateSpecimenDraft,
}: CameraScannerModalProps) {
  const insets = useSafeAreaInsets();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scannedLock, setScannedLock] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [capturingNativePic, setCapturingNativePic] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const webVideoRef = useRef<HTMLVideoElement | null>(null);
  const [webCamActive, setWebCamActive] = useState(false);
  const [webCamError, setWebCamError] = useState<string | null>(null);
  const hasRequestedRef = useRef(false);
  const laserAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (cameraModal && cameraModal.mode === 'BARCODE' && !scannedLock) {
      laserAnim.setValue(0);
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(laserAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(laserAnim, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [cameraModal, scannedLock, laserAnim]);

  useEffect(() => {
    if (cameraModal) {
      setScannedLock(false);
      setLastScannedCode(null);
      setTorchEnabled(false);
      setCapturingNativePic(false);
      setWebCamActive(false);
      setWebCamError(null);
      if (Platform.OS !== 'web' && !cameraPermission?.granted && !hasRequestedRef.current) {
        hasRequestedRef.current = true;
        void requestCameraPermission();
      }
    } else {
      hasRequestedRef.current = false;
      setTorchEnabled(false);
      setCapturingNativePic(false);
    }
  }, [cameraModal, cameraPermission?.granted]);

  // Web camera stream & barcode detector lifecycle
  useEffect(() => {
    if (!cameraModal || Platform.OS !== 'web' || typeof navigator === 'undefined') return;
    let activeStream: MediaStream | null = null;
    let detectorTimer: ReturnType<typeof setInterval> | null = null;
    let isMounted = true;

    const startWebCam = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          if (isMounted) setWebCamError('Browser camera unavailable. Use 1-tap Match or manual entry below.');
          return;
        }

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        activeStream = stream;
        setWebCamActive(true);
        setWebCamError(null);

        if (webVideoRef.current) {
          webVideoRef.current.srcObject = stream;
          webVideoRef.current.setAttribute('playsinline', 'true');
          webVideoRef.current.setAttribute('webkit-playsinline', 'true');
          await webVideoRef.current.play().catch(() => {});
        }

        const BarcodeCtor = (
          window as unknown as {
            BarcodeDetector?: new (opts?: { formats?: string[] }) => {
              detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
            };
          }
        ).BarcodeDetector;

        if (BarcodeCtor && cameraModal.mode === 'BARCODE') {
          const detector = new BarcodeCtor({
            formats: ['code_128', 'code_39', 'ean_13', 'qr_code', 'codabar', 'upc_a'],
          });
          detectorTimer = setInterval(() => {
            void (async () => {
              if (!isMounted || !webVideoRef.current || webVideoRef.current.readyState < 2) return;
              try {
                const results = await detector.detect(webVideoRef.current);
                const code = results?.[0]?.rawValue?.trim();
                if (code && !scannedLock) {
                  handleBarcodeScanned({ data: code } as BarcodeScanningResult);
                }
              } catch {
                // Skip frame
              }
            })();
          }, 320);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const e = err as Error;
          setWebCamError(
            e.name === 'NotAllowedError'
              ? 'Camera permission denied. Allow camera in browser settings or use Match below.'
              : 'Camera access error. Use manual entry or 1-tap Match below.'
          );
        }
      }
    };

    void startWebCam();

    return () => {
      isMounted = false;
      if (detectorTimer) clearInterval(detectorTimer);
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [cameraModal]);

  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
    if (scannedLock) return;
    const rawCode = result?.data?.trim();
    if (!rawCode) return;

    setScannedLock(true);
    setLastScannedCode(rawCode);

    try {
      Vibration.vibrate(100);
    } catch {
      // Ignore vibration error on unsupported platforms
    }

    if (cameraModal?.specimenId) {
      onUpdateSpecimenDraft(cameraModal.specimenId, {
        barcode: rawCode,
        usedTube: cameraModal.specimen?.tubeType || TubeType.SERUM_RED_GOLD,
      });
    }

    setTimeout(() => {
      onClose();
    }, 450);
  };

  const handleCapturePhotoPress = async () => {
    if (!selectedOrder) return;
    if (Platform.OS !== 'web' && cameraRef.current) {
      try {
        setCapturingNativePic(true);
        const pic = await cameraRef.current.takePictureAsync({ quality: 0.82 });
        if (pic?.uri) {
          onCaptureSnapshot(selectedOrder.id, pic.uri);
          return;
        }
      } catch (err) {
        console.warn('Native camera capture fallback:', err);
      } finally {
        setCapturingNativePic(false);
      }
    } else if (Platform.OS === 'web' && webVideoRef.current) {
      try {
        setCapturingNativePic(true);
        const canvas = document.createElement('canvas');
        canvas.width = webVideoRef.current.videoWidth || 640;
        canvas.height = webVideoRef.current.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(webVideoRef.current, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          onCaptureSnapshot(selectedOrder.id, dataUrl);
          return;
        }
      } catch (err) {
        console.warn('Web video capture fallback:', err);
      } finally {
        setCapturingNativePic(false);
      }
    }
    onCaptureSnapshot(selectedOrder.id);
  };

  const dynamicSubtitle =
    scannedLock && lastScannedCode
      ? `✓ Scanned: ${lastScannedCode}`
      : Platform.OS !== 'web'
      ? !cameraPermission?.granted
        ? 'Camera permission required — tap Enable Camera below'
        : cameraModal?.mode === 'PHOTO'
        ? 'Center all specimen vials clearly and tap Capture'
        : 'Point camera at specimen tube barcode'
      : webCamError
      ? webCamError
      : webCamActive
      ? 'Live camera active. Align barcode inside frame...'
      : cameraStatusText && cameraStatusText !== 'Starting camera...'
      ? cameraStatusText
      : 'Initializing camera feed...';

  return (
    <Modal visible={Boolean(cameraModal)} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      {cameraModal ? (
        <View
          style={[
            styles.modalBackdrop,
            {
              paddingTop: Math.max(insets.top + 12, 16),
              paddingBottom: Math.max(insets.bottom + 12, 16),
            },
          ]}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalCardTitle}>
              {cameraModal.mode === 'PHOTO'
                ? '📸 Capture Sample Collection Photo'
                : `📷 Scan Barcode — ${cameraModal.specimen?.testCode || ''}`}
            </Text>
            <Text style={[styles.modalCardSub, scannedLock && { color: '#059669', fontWeight: '700' }]}>
              {dynamicSubtitle}
            </Text>

            <View
              style={[
                styles.cameraViewport,
                { position: 'relative', overflow: 'hidden', backgroundColor: '#020617', borderRadius: 12 },
              ]}
            >
              {Platform.OS === 'web' ? (
                <View style={StyleSheet.absoluteFill}>
                  <video
                    ref={webVideoRef as unknown as React.RefObject<HTMLVideoElement>}
                    autoPlay
                    playsInline
                    muted
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      borderRadius: 12,
                      display: 'block',
                    }}
                  />
                  <View style={{ position: 'absolute', bottom: 12, alignSelf: 'center', zIndex: 12 }}>
                    <View style={{ position: 'relative' }}>
                      <TouchableOpacity
                        style={{
                          backgroundColor: 'rgba(15, 118, 110, 0.95)',
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          borderRadius: 8,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          borderWidth: 1,
                          borderColor: '#2DD4BF',
                        }}
                      >
                        <Ionicons name="camera" size={16} color="#FFFFFF" />
                        <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                          {cameraModal.mode === 'PHOTO' ? 'Snap Photo with Camera' : 'Snap Barcode with Camera'}
                        </Text>
                      </TouchableOpacity>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          opacity: 0,
                          cursor: 'pointer',
                          zIndex: 20,
                        }}
                        onChange={(e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (!file) return;
                          if (cameraModal.mode === 'PHOTO') {
                            const oid = selectedOrder?.id;
                            if (oid) onUploadPhotoFile(oid);
                          } else if (cameraModal.specimenId && cameraModal.specimen) {
                            onUpdateSpecimenDraft(cameraModal.specimenId, {
                              barcode: cameraModal.specimen.barcode,
                              usedTube: cameraModal.specimen.tubeType || TubeType.SERUM_RED_GOLD,
                            });
                            onClose();
                          }
                        }}
                      />
                    </View>
                  </View>
                </View>
              ) : cameraPermission?.granted ? (
                <CameraView
                  ref={cameraRef}
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  enableTorch={torchEnabled}
                  barcodeScannerSettings={
                    cameraModal.mode === 'BARCODE'
                      ? {
                          barcodeTypes: [
                            'code128',
                            'code39',
                            'code93',
                            'codabar',
                            'ean13',
                            'ean8',
                            'qr',
                            'upc_a',
                            'upc_e',
                            'itf14',
                          ],
                        }
                      : undefined
                  }
                  onBarcodeScanned={
                    cameraModal.mode === 'BARCODE' && !scannedLock
                      ? handleBarcodeScanned
                      : undefined
                  }
                />
              ) : (
                <View
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 20,
                    backgroundColor: '#0F172A',
                  }}
                >
                  <Ionicons name="camera-reverse-outline" size={38} color="#38BDF8" />
                  <Text
                    style={{
                      color: '#F8FAFC',
                      fontSize: 14,
                      fontWeight: '700',
                      marginTop: 10,
                      textAlign: 'center',
                    }}
                  >
                    Camera Access Needed
                  </Text>
                  <Text
                    style={{
                      color: '#94A3B8',
                      fontSize: 12,
                      marginTop: 4,
                      textAlign: 'center',
                      lineHeight: 17,
                    }}
                  >
                    Please allow camera access to scan tube barcodes and verify specimens.
                  </Text>
                  <TouchableOpacity
                    style={{
                      backgroundColor: BRAND_COLORS.navyPrimary,
                      paddingHorizontal: 18,
                      paddingVertical: 10,
                      borderRadius: 8,
                      marginTop: 14,
                    }}
                    onPress={() => void requestCameraPermission()}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>
                      Enable Camera
                    </Text>
                  </TouchableOpacity>
                  {cameraPermission && !cameraPermission.canAskAgain ? (
                    <TouchableOpacity
                      style={{
                        backgroundColor: '#334155',
                        paddingHorizontal: 14,
                        paddingVertical: 7,
                        borderRadius: 6,
                        marginTop: 8,
                      }}
                      onPress={() => void Linking.openSettings()}
                    >
                      <Text style={{ color: '#CBD5E1', fontSize: 11, fontWeight: '600' }}>
                        Open Phone Settings
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}

              {/* Torch (Flashlight) toggle button for dark rooms / night collections */}
              {Platform.OS !== 'web' && cameraPermission?.granted && (
                <TouchableOpacity
                  style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: torchEnabled ? '#F59E0B' : 'rgba(15, 23, 42, 0.72)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 10,
                    borderWidth: 1,
                    borderColor: 'rgba(255, 255, 255, 0.25)',
                  }}
                  onPress={() => setTorchEnabled((t) => !t)}
                >
                  <Ionicons
                    name={torchEnabled ? 'flashlight' : 'flashlight-outline'}
                    size={18}
                    color="#FFFFFF"
                  />
                </TouchableOpacity>
              )}

              {/* Viewfinder crosshairs / reticle */}
              <View
                style={{
                  position: 'absolute',
                  inset: 24,
                  borderWidth: 2,
                  borderColor: scannedLock ? '#10B981' : '#38BDF8',
                  borderRadius: 12,
                  borderStyle: scannedLock ? 'solid' : 'dashed',
                  justifyContent: 'center',
                  alignItems: 'center',
                  pointerEvents: 'none',
                  overflow: 'hidden',
                }}
              >
                {cameraModal.mode === 'BARCODE' && !scannedLock && (
                  <Animated.View
                    style={{
                      position: 'absolute',
                      left: 6,
                      right: 6,
                      height: 2.5,
                      backgroundColor: '#EF4444',
                      borderRadius: 1.5,
                      shadowColor: '#EF4444',
                      shadowOpacity: 0.95,
                      shadowRadius: 5,
                      elevation: 5,
                      transform: [
                        {
                          translateY: laserAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-65, 65],
                          }),
                        },
                      ],
                    }}
                  />
                )}
                <Text
                  style={{
                    color: '#FFFFFF',
                    backgroundColor: scannedLock ? 'rgba(5, 150, 105, 0.9)' : 'rgba(15, 23, 42, 0.75)',
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: '700',
                  }}
                >
                  {scannedLock
                    ? `✓ Barcode Captured: ${lastScannedCode}`
                    : cameraModal.mode === 'PHOTO'
                    ? 'Center All Specimen Tubes'
                    : 'Point Camera at Tube Barcode'}
                </Text>
              </View>
            </View>

            {cameraModal.mode === 'PHOTO' ? (
              <View style={{ gap: 10, marginTop: 14 }}>
                <TouchableOpacity
                  style={[styles.ctaButton, (uploadingPhoto || capturingNativePic) && { opacity: 0.65 }]}
                  disabled={uploadingPhoto || capturingNativePic}
                  onPress={handleCapturePhotoPress}
                >
                  <Text style={styles.ctaButtonText}>
                    {uploadingPhoto || capturingNativePic
                      ? 'Uploading Photo...'
                      : '📸 Capture Photo & Upload'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.btnSecondary}
                  onPress={() => {
                    const oid = selectedOrder?.id;
                    onClose();
                    if (oid) onUploadPhotoFile(oid);
                  }}
                >
                  <Text style={styles.btnSecondaryText}>📁 Choose Photo File Instead</Text>
                </TouchableOpacity>
              </View>
            ) : cameraModal.specimenId && cameraModal.specimen ? (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.inputLabelSm}>
                  {(TUBE_METADATA[cameraModal.specimen.tubeType] || TUBE_METADATA[TubeType.SERUM_RED_GOLD]).label}
                </Text>
                <TextInput
                  style={styles.fieldInput}
                  value={specimenDrafts[cameraModal.specimenId]?.barcode || ''}
                  onChangeText={(txt) =>
                    onUpdateSpecimenDraft(cameraModal.specimenId!, { barcode: txt })
                  }
                  placeholder={`Expected: ${cameraModal.specimen.barcode}`}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={[styles.ctaButton, { marginTop: 10 }]}
                  onPress={() => {
                    onUpdateSpecimenDraft(cameraModal.specimenId!, {
                      barcode: cameraModal.specimen!.barcode,
                      usedTube: cameraModal.specimen!.tubeType || TubeType.SERUM_RED_GOLD,
                    });
                    onClose();
                  }}
                >
                  <Text style={styles.ctaButtonText}>
                    ✓ Match Expected Barcode ({cameraModal.specimen.barcode})
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.btnSecondary, { flex: 0, marginTop: 12, paddingVertical: 11 }]}
              onPress={onClose}
            >
              <Text style={[styles.btnSecondaryText, { color: COLORS.textSecondary }]}>
                Close Camera
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </Modal>
  );
}

export interface PhleboKitInventoryModalProps {
  visible: boolean;
  allocations: KitAllocationRecord[];
  phleboName: string;
  courierId: string;
  onClose: () => void;
  onRequestRestock: (kitCode?: string, kitName?: string) => Promise<void>;
}

export function PhleboKitInventoryModal({
  visible,
  allocations,
  phleboName,
  courierId,
  onClose,
  onRequestRestock,
}: PhleboKitInventoryModalProps) {
  const insets = useSafeAreaInsets();
  const [requestingCode, setRequestingCode] = useState<string | null>(null);

  const totalAssignedKits = allocations.reduce((sum, a) => sum + (a.quantityAllocated || 0), 0);
  const totalConsumedKits = allocations.reduce((sum, a) => sum + (a.quantityConsumed || 0), 0);
  const totalOnHandKits = Math.max(0, allocations.reduce((sum, a) => sum + (a.quantityOnHand ?? (a.quantityAllocated - (a.quantityConsumed || 0))), 0));

  const handleRestock = async (kitCode?: string, kitName?: string) => {
    setRequestingCode(kitCode || 'ALL');
    try {
      await onRequestRestock(kitCode, kitName);
    } finally {
      setRequestingCode(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View
        style={[
          styles.modalBackdrop,
          {
            paddingTop: Math.max(insets.top + 16, 20),
            paddingBottom: Math.max(insets.bottom + 16, 20),
          },
        ]}
      >
        <View style={[styles.modalCard, { maxHeight: '90%', display: 'flex', flexDirection: 'column' }]}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: BRAND_COLORS.navyPrimary }}>
                🎒 My Collection Kits &amp; Supplies
              </Text>
              <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                Assigned to: {phleboName} • {courierId}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={{ padding: 4 }}>
              <Ionicons name="close" size={24} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Top Summary Cards */}
          <View style={{ flexDirection: 'row', gap: 8, marginVertical: 12 }}>
            <View style={{ flex: 1, backgroundColor: '#F0FDFA', borderWidth: 1, borderColor: '#99F6E4', borderRadius: 10, padding: 10, alignItems: 'center' }}>
              <Text style={{ fontSize: 10, color: '#0F766E', fontWeight: '700', textTransform: 'uppercase' }}>On-Hand Stock</Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#0F766E', marginTop: 2 }}>{totalOnHandKits}</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 10, padding: 10, alignItems: 'center' }}>
              <Text style={{ fontSize: 10, color: '#1D4ED8', fontWeight: '700', textTransform: 'uppercase' }}>Total Issued</Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#1D4ED8', marginTop: 2 }}>{totalAssignedKits}</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 10, alignItems: 'center' }}>
              <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '700', textTransform: 'uppercase' }}>Used in Trips</Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#475569', marginTop: 2 }}>{totalConsumedKits}</Text>
            </View>
          </View>

          {/* Kit List */}
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {allocations.length === 0 ? (
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 36 }}>
                <Ionicons name="cube-outline" size={44} color="#94A3B8" />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#334155', marginTop: 10 }}>
                  No Kits Allocated Yet
                </Text>
                <Text style={{ fontSize: 12, color: '#64748B', textAlign: 'center', marginTop: 4, paddingHorizontal: 20 }}>
                  Central Supply will allocate customized collection kit batches (1 Collection = 1 Kit) before field dispatch.
                </Text>
                <TouchableOpacity
                  style={[styles.btnPrimary, { marginTop: 16, paddingHorizontal: 20 }]}
                  disabled={requestingCode === 'ALL'}
                  onPress={() => handleRestock('GENERAL', 'Standard Collection Kits')}
                >
                  <Text style={styles.btnPrimaryText}>
                    {requestingCode === 'ALL' ? 'Sending Request...' : '📢 Request Initial Kit Batch'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 10, paddingBottom: 10 }}>
                {allocations.map((alloc) => {
                  const onHand = Math.max(0, alloc.quantityOnHand ?? ((alloc.quantityAllocated || 0) - (alloc.quantityConsumed || 0)));
                  const isLow = onHand <= 3;
                  return (
                    <View
                      key={alloc.id}
                      style={{
                        backgroundColor: '#FFFFFF',
                        borderWidth: 1,
                        borderColor: isLow ? '#FCA5A5' : '#E2E8F0',
                        borderRadius: 12,
                        padding: 12,
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>
                              {alloc.kitName || alloc.kitCode}
                            </Text>
                            {isLow && (
                              <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                <Text style={{ fontSize: 9, color: '#DC2626', fontWeight: '700' }}>LOW STOCK</Text>
                              </View>
                            )}
                          </View>
                          <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                            Code: {alloc.kitCode} • Dispatched: {alloc.allocatedAt ? new Date(alloc.allocatedAt).toLocaleDateString() : 'Active'}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: 16, fontWeight: '800', color: isLow ? '#DC2626' : '#0F766E' }}>
                            {onHand} Available
                          </Text>
                          <Text style={{ fontSize: 10, color: '#94A3B8' }}>
                            {alloc.quantityConsumed || 0} consumed
                          </Text>
                        </View>
                      </View>

                      {Array.isArray(alloc.itemsManifest) && alloc.itemsManifest.length > 0 && (
                        <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748B', marginBottom: 4, textTransform: 'uppercase' }}>
                            Packed Bag Supplies:
                          </Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                            {alloc.itemsManifest.map((item, mIdx) => (
                              <View
                                key={mIdx}
                                style={{
                                  backgroundColor: '#F8FAFC',
                                  borderWidth: 1,
                                  borderColor: '#E2E8F0',
                                  borderRadius: 4,
                                  paddingHorizontal: 6,
                                  paddingVertical: 2,
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <Text style={{ fontSize: 10 }}>{item.iconEmoji || '🧪'}</Text>
                                <Text style={{ fontSize: 10, fontWeight: '600', color: '#334155' }}>
                                  {item.quantity}x {item.materialName}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

                      {alloc.notes ? (
                        <Text style={{ fontSize: 11, color: '#475569', backgroundColor: '#F8FAFC', padding: 6, borderRadius: 6, marginTop: 8 }}>
                          ℹ️ {alloc.notes}
                        </Text>
                      ) : null}

                      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 }}>
                        <TouchableOpacity
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 6,
                            borderWidth: 1,
                            borderColor: isLow ? '#EF4444' : '#0D9488',
                            backgroundColor: isLow ? '#FEF2F2' : '#F0FDFA',
                          }}
                          disabled={requestingCode === alloc.kitCode}
                          onPress={() => handleRestock(alloc.kitCode, alloc.kitName)}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '700', color: isLow ? '#DC2626' : '#0D9488' }}>
                            {requestingCode === alloc.kitCode ? 'Requesting...' : 'Request Restock'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>

          {/* Footer Close Button */}
          <TouchableOpacity
            style={[styles.btnSecondary, { flex: 0, marginTop: 12, paddingVertical: 11 }]}
            onPress={onClose}
          >
            <Text style={[styles.btnSecondaryText, { color: COLORS.textSecondary }]}>
              Close Supplies Window
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export interface PhleboQuickActionsModalProps {
  visible: boolean;
  onClose: () => void;
  dutyStatus?: PhlebotomistShiftStatus;
  onShiftUpdate?: (nextStatus: PhlebotomistShiftStatus) => void;
  onOpenScanner?: () => void;
  onOpenKitsAndSupplies: () => void;
  isKitModuleActive?: boolean;
  onOpenTrainingSops: () => void;
  onOpenHelpSupport: () => void;
  onOpenTodayCollections: () => void;
  onOpenEarnings?: () => void;
  onRefreshBroadcasts: () => void;
}

export function PhleboQuickActionsModal({
  visible,
  onClose,
  dutyStatus = 'OFFLINE',
  onShiftUpdate,
  onOpenScanner,
  onOpenKitsAndSupplies,
  isKitModuleActive = false,
  onOpenTrainingSops,
  onOpenHelpSupport,
  onOpenTodayCollections,
  onOpenEarnings,
  onRefreshBroadcasts,
}: PhleboQuickActionsModalProps) {
  const insets = useSafeAreaInsets();

  const handleAction = (callback?: () => void) => {
    onClose();
    if (callback) {
      setTimeout(() => callback(), 80);
    }
  };

  const isOnline = dutyStatus === 'ONLINE';

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <TouchableOpacity
        style={[
          styles.modalBackdrop,
          {
            justifyContent: 'flex-end',
            paddingHorizontal: 0,
            paddingBottom: 0,
          },
        ]}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            backgroundColor: '#FFFFFF',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 18,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom + 14, 28),
            borderWidth: 1,
            borderColor: '#E2E8F0',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -6 },
            shadowOpacity: 0.16,
            shadowRadius: 16,
            elevation: 14,
          }}
        >
          {/* Grab Handle */}
          <View style={{ alignItems: 'center', marginBottom: 12 }}>
            <View style={{ width: 44, height: 4.5, borderRadius: 3, backgroundColor: '#CBD5E1' }} />
          </View>

          {/* Sheet Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
            <View>
              <Text style={{ fontSize: 16.5, fontWeight: '800', color: BRAND_COLORS.navyPrimary }}>
                ⚡ Quick Field Command
              </Text>
              <Text style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>
                Instant shortcuts for collections, barcode scans &amp; duty status
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={24} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* 1. Fast Duty Status Switcher */}
          {onShiftUpdate && (
            <View style={{ marginBottom: 14 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 }}>
                Shift Duty Status
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    paddingVertical: 9,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: dutyStatus === 'ONLINE' ? '#DCFCE7' : '#F8FAFC',
                    borderWidth: 1.5,
                    borderColor: dutyStatus === 'ONLINE' ? '#16A34A' : '#E2E8F0',
                  }}
                  onPress={() => onShiftUpdate('ONLINE')}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: dutyStatus === 'ONLINE' ? '#16A34A' : '#64748B' }}>
                    🟢 On Duty
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    flex: 1,
                    paddingVertical: 9,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: dutyStatus === 'BREAK' ? '#FEF3C7' : '#F8FAFC',
                    borderWidth: 1.5,
                    borderColor: dutyStatus === 'BREAK' ? '#D97706' : '#E2E8F0',
                  }}
                  onPress={() => onShiftUpdate('BREAK')}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: dutyStatus === 'BREAK' ? '#D97706' : '#64748B' }}>
                    ☕ Break
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    flex: 1,
                    paddingVertical: 9,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: dutyStatus === 'OFFLINE' ? '#FEE2E2' : '#F8FAFC',
                    borderWidth: 1.5,
                    borderColor: dutyStatus === 'OFFLINE' ? '#DC2626' : '#E2E8F0',
                  }}
                  onPress={() => onShiftUpdate('OFFLINE')}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: dutyStatus === 'OFFLINE' ? '#DC2626' : '#64748B' }}>
                    🔴 Off Duty
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* 2. Primary Hero Action: Camera / Barcode Scanner */}
          {onOpenScanner && (
            <TouchableOpacity
              style={{
                backgroundColor: '#061D42',
                borderRadius: 14,
                padding: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                marginBottom: 14,
                shadowColor: '#061D42',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.2,
                shadowRadius: 8,
                elevation: 4,
              }}
              activeOpacity={0.85}
              onPress={() => handleAction(onOpenScanner)}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: '#0D9488',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="barcode-outline" size={24} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14.5, fontWeight: '800', color: '#FFFFFF' }}>
                  Scan Specimen Barcode
                </Text>
                <Text style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 2 }}>
                  Instant camera inspection for tubes, patient vials &amp; cooler bags
                </Text>
              </View>
              <Ionicons name="arrow-forward-circle" size={24} color="#2DD4BF" />
            </TouchableOpacity>
          )}

          {/* 3. Action Shortcuts Rows */}
          <View style={{ gap: 8 }}>
            {/* Today's Tasks */}
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 11,
                borderRadius: 12,
                backgroundColor: '#F8FAFC',
                borderWidth: 1,
                borderColor: '#E2E8F0',
              }}
              onPress={() => handleAction(onOpenTodayCollections)}
            >
              <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="calendar-outline" size={19} color="#2563EB" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>Today&apos;s Assigned Tasks</Text>
                <Text style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>Check upcoming pickups and sample drops</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </TouchableOpacity>

            {/* Earnings & Reports */}
            {onOpenEarnings && (
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 11,
                  borderRadius: 12,
                  backgroundColor: '#F8FAFC',
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                }}
                onPress={() => handleAction(onOpenEarnings)}
              >
                <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: '#F0FDFA', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="wallet-outline" size={19} color="#0D9488" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>Daily Earnings &amp; Ledger</Text>
                  <Text style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>Completed trip payouts &amp; cash collections</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </TouchableOpacity>
            )}

            {/* Collection Kits (Only if Active) */}
            {isKitModuleActive && (
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 11,
                  borderRadius: 12,
                  backgroundColor: '#F8FAFC',
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                }}
                onPress={() => handleAction(onOpenKitsAndSupplies)}
              >
                <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: '#FAF5FF', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="briefcase-outline" size={19} color="#9333EA" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>My Collection Kits &amp; Stock</Text>
                  <Text style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>Assigned test kits &amp; restock request</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </TouchableOpacity>
            )}

            {/* Emergency SOS & Admin Help Desk */}
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 11,
                borderRadius: 12,
                backgroundColor: '#FEF2F2',
                borderWidth: 1,
                borderColor: '#FECACA',
              }}
              onPress={() => handleAction(onOpenHelpSupport)}
            >
              <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="headset" size={19} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#991B1B' }}>Help &amp; Emergency Hotline</Text>
                <Text style={{ fontSize: 11, color: '#B91C1C', marginTop: 1 }}>Direct call to LabSetu Central Operations Desk</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#DC2626" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

export interface PhleboNotificationsModalProps {
  visible: boolean;
  notifications: PlatformNotification[];
  onClose: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onClearAll: () => void;
  onSelectOrder?: (orderId: string) => void;
}

export function PhleboNotificationsModal({
  visible,
  notifications,
  onClose,
  onMarkRead,
  onMarkAllRead,
  onClearAll,
  onSelectOrder,
}: PhleboNotificationsModalProps) {
  const [filterTab, setFilterTab] = useState<'ALL' | 'UNREAD' | 'PAYOUTS' | 'ORDERS'>('ALL');
  const unreadCount = notifications.filter((n) => !n.read).length;

  const filteredList = notifications.filter((n) => {
    if (filterTab === 'UNREAD') return !n.read;
    if (filterTab === 'PAYOUTS') {
      const cat = String(n.category || '').toUpperCase();
      return cat.includes('PAYOUT') || cat.includes('PAYMENT');
    }
    if (filterTab === 'ORDERS') {
      const cat = String(n.category || '').toUpperCase();
      return cat.includes('BOOKING') || cat.includes('DISPATCH') || cat.includes('ORDER') || Boolean(n.orderId);
    }
    return true;
  });

  function getCategoryMeta(category?: string) {
    const cat = String(category || '').toUpperCase();
    if (cat.includes('BOOKING') || cat.includes('DISPATCH') || cat.includes('ORDER')) {
      return { icon: 'bicycle-outline', color: '#0D9488', bg: '#CCFBF1' };
    }
    if (cat.includes('PAYOUT') || cat.includes('PAYMENT')) {
      return { icon: 'cash-outline', color: '#16A34A', bg: '#DCFCE7' };
    }
    if (cat.includes('KIT') || cat.includes('INVENTORY') || cat.includes('SUPPLY')) {
      return { icon: 'cube-outline', color: '#8B5CF6', bg: '#EDE9FE' };
    }
    if (cat.includes('COLD_CHAIN') || cat.includes('ALERT') || cat.includes('URGENT')) {
      return { icon: 'alert-circle-outline', color: '#DC2626', bg: '#FEE2E2' };
    }
    return { icon: 'notifications-outline', color: '#0A2A5E', bg: '#E0E7FF' };
  }

  function formatTimeAgo(dateStr?: string) {
    if (!dateStr) return 'Just now';
    try {
      const diffSec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
      if (diffSec < 60) return 'Just now';
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
      return `${Math.floor(diffSec / 86400)}d ago`;
    } catch {
      return 'Recently';
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity
        style={[styles.modalBackdrop, { justifyContent: 'flex-end', padding: 0 }]}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            backgroundColor: '#FFFFFF',
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            maxHeight: '88%',
            width: '100%',
            paddingBottom: 28,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.15,
            shadowRadius: 16,
            elevation: 20,
          }}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Top Pull Bar */}
          <View
            style={{
              width: 44,
              height: 5,
              borderRadius: 3,
              backgroundColor: '#CBD5E1',
              alignSelf: 'center',
              marginTop: 10,
              marginBottom: 6,
            }}
          />

          {/* Header */}
          <View
            style={{
              paddingHorizontal: 20,
              paddingTop: 8,
              paddingBottom: 14,
              borderBottomWidth: 1,
              borderBottomColor: '#F1F5F9',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  backgroundColor: '#0A2A5E',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="notifications" size={19} color="#FFFFFF" />
              </View>
              <View>
                <Text
                  style={{
                    fontSize: 17,
                    fontFamily: BRAND_FONTS.bold,
                    color: '#0F172A',
                  }}
                >
                  Notifications
                </Text>
                <Text
                  style={{
                    fontSize: 11.5,
                    fontFamily: BRAND_FONTS.medium,
                    color: unreadCount > 0 ? '#0D9488' : '#64748B',
                  }}
                >
                  {unreadCount > 0 ? `⚡ ${unreadCount} unread update${unreadCount > 1 ? 's' : ''}` : 'All caught up ✓'}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {notifications.length > 0 && (
                <>
                  <TouchableOpacity
                    style={{
                      paddingHorizontal: 9,
                      paddingVertical: 6,
                      borderRadius: 8,
                      backgroundColor: '#CCFBF1',
                    }}
                    onPress={onMarkAllRead}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontFamily: BRAND_FONTS.bold,
                        color: '#0D9488',
                      }}
                    >
                      ✓ Read All
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      paddingHorizontal: 9,
                      paddingVertical: 6,
                      borderRadius: 8,
                      backgroundColor: '#FEE2E2',
                    }}
                    onPress={onClearAll}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontFamily: BRAND_FONTS.bold,
                        color: '#DC2626',
                      }}
                    >
                      🗑️ Clear
                    </Text>
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity
                onPress={onClose}
                hitSlop={8}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: '#F1F5F9',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: 4,
                }}
              >
                <Ionicons name="close" size={19} color="#475569" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Filter Pills */}
          <View
            style={{
              flexDirection: 'row',
              paddingHorizontal: 18,
              paddingVertical: 10,
              gap: 8,
              borderBottomWidth: 1,
              borderBottomColor: '#F8FAFC',
            }}
          >
            {[
              { id: 'ALL', label: `All (${notifications.length})` },
              { id: 'UNREAD', label: `Unread (${unreadCount})` },
              { id: 'PAYOUTS', label: 'Payouts' },
              { id: 'ORDERS', label: 'Bookings' },
            ].map((tab) => {
              const active = filterTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 20,
                    backgroundColor: active ? '#0A2A5E' : '#F1F5F9',
                  }}
                  onPress={() => setFilterTab(tab.id as any)}
                >
                  <Text
                    style={{
                      fontSize: 11.5,
                      fontFamily: active ? BRAND_FONTS.bold : BRAND_FONTS.medium,
                      color: active ? '#FFFFFF' : '#475569',
                    }}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Notifications List */}
          <ScrollView
            style={{ maxHeight: 460 }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 20 }}
            showsVerticalScrollIndicator={false}
          >
            {filteredList.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 45 }}>
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    backgroundColor: '#F0FDFA',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                  }}
                >
                  <Ionicons name="notifications-off-outline" size={32} color="#0D9488" />
                </View>
                <Text
                  style={{
                    fontSize: 15,
                    fontFamily: BRAND_FONTS.bold,
                    color: '#0F172A',
                  }}
                >
                  No Notifications Here
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: BRAND_FONTS.regular,
                    color: '#64748B',
                    marginTop: 4,
                    textAlign: 'center',
                    paddingHorizontal: 24,
                  }}
                >
                  Direct dispatch assignments, payouts, and important courier announcements will appear in this feed.
                </Text>
              </View>
            ) : (
              filteredList.map((item) => {
                const meta = getCategoryMeta(item.category);
                return (
                  <TouchableOpacity
                    key={item.id}
                    activeOpacity={0.88}
                    style={{
                      flexDirection: 'row',
                      gap: 12,
                      padding: 13,
                      borderRadius: 14,
                      backgroundColor: !item.read ? '#F0FDFA' : '#FFFFFF',
                      borderWidth: 1,
                      borderColor: !item.read ? '#99F6E4' : '#E2E8F0',
                      marginBottom: 10,
                      shadowColor: '#0F172A',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: !item.read ? 0.05 : 0.02,
                      shadowRadius: 3,
                      elevation: !item.read ? 2 : 1,
                    }}
                    onPress={() => onMarkRead(item.id)}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        backgroundColor: meta.bg,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Ionicons name={meta.icon as any} size={20} color={meta.color} />
                    </View>

                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 3,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13.5,
                            fontFamily: !item.read ? BRAND_FONTS.bold : BRAND_FONTS.semiBold,
                            color: '#0F172A',
                            flex: 1,
                          }}
                          numberOfLines={1}
                        >
                          {item.title}
                        </Text>
                        <Text
                          style={{
                            fontSize: 10.5,
                            fontFamily: BRAND_FONTS.medium,
                            color: '#94A3B8',
                            marginLeft: 8,
                          }}
                        >
                          {formatTimeAgo(item.createdAt)}
                        </Text>
                      </View>

                      <Text
                        style={{
                          fontSize: 12,
                          fontFamily: BRAND_FONTS.regular,
                          color: '#475569',
                          lineHeight: 18,
                        }}
                      >
                        {item.message}
                      </Text>

                      {Boolean(item.orderId && onSelectOrder) && (
                        <TouchableOpacity
                          style={{
                            alignSelf: 'flex-start',
                            marginTop: 8,
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderRadius: 7,
                            backgroundColor: '#E0E7FF',
                            borderWidth: 1,
                            borderColor: '#C7D2FE',
                          }}
                          onPress={() => {
                            onMarkRead(item.id);
                            onClose();
                            onSelectOrder!(item.orderId!);
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 11,
                              fontFamily: BRAND_FONTS.bold,
                              color: '#0A2A5E',
                            }}
                          >
                            View Booking Details →
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {!item.read && (
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: '#10B981',
                          marginTop: 4,
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

