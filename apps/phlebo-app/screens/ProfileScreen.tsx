import React from 'react';
import { Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  evaluatePointServiceCoverage,
  type PhlebotomistProfile,
  type PhlebotomistShiftStatus,
} from '@diagnostic/shared';
import { BRAND_COLORS } from '../components/LabSetuBrand';
import { COLORS, FONTS, styles } from '../styles/phleboStyles';
import {
  type FloatingIconSettings,
  type WebNotificationPermissionState,
} from '../types/phleboTypes';
import { COMPACT_TEXT_SCALE, lh, MAX_TEXT_SCALE, rf, rs } from '../utils/responsive';

export interface ProfileScreenProps {
  phleboInitial: string;
  phleboName: string;
  displayCourierId: string;
  phleboEmail: string;
  myPhleboProfile: PhlebotomistProfile | null;
  completedDeliveriesCount: number;
  dutyStatus: PhlebotomistShiftStatus;
  isOnline: boolean;
  riderCoverage: ReturnType<typeof evaluatePointServiceCoverage>;
  webNotifPerm: WebNotificationPermissionState;
  floatingSettings?: FloatingIconSettings;
  payoutMethod: 'UPI' | 'BANK_TRANSFER';
  payoutAccountName: string;
  payoutUpiId: string;
  payoutBankAccount: string;
  payoutIfsc: string;
  savingPayoutProfile: boolean;
  onBack?: () => void;
  onShiftUpdate: (nextStatus: PhlebotomistShiftStatus) => void;
  onRequestBackgroundAlertPermission: () => void;
  onOpenFloatingSettings?: () => void;
  onOpenTrainingSops?: () => void;
  onOpenMySupplies?: () => void;
  kitAllocationsCount?: number;
  onOpenHelpSupport?: () => void;
  onCheckForUpdates?: () => void;
  onChangePayoutMethod: (method: 'UPI' | 'BANK_TRANSFER') => void;
  onChangePayoutAccountName: (val: string) => void;
  onChangePayoutUpiId: (val: string) => void;
  onChangePayoutBankAccount: (val: string) => void;
  onChangePayoutIfsc: (val: string) => void;
  onSavePayoutProfile: () => void;
  onTriggerSos: () => void;
  onSignOut: () => void;
}

export function ProfileScreen({
  phleboInitial,
  phleboName,
  displayCourierId,
  phleboEmail,
  myPhleboProfile,
  completedDeliveriesCount,
  dutyStatus,
  isOnline,
  riderCoverage,
  webNotifPerm,
  floatingSettings,
  payoutMethod,
  payoutAccountName,
  payoutUpiId,
  payoutBankAccount,
  payoutIfsc,
  savingPayoutProfile,
  onBack,
  onShiftUpdate,
  onRequestBackgroundAlertPermission,
  onOpenFloatingSettings,
  onOpenTrainingSops,
  onOpenMySupplies,
  kitAllocationsCount = 0,
  onOpenHelpSupport,
  onCheckForUpdates,
  onChangePayoutMethod,
  onChangePayoutAccountName,
  onChangePayoutUpiId,
  onChangePayoutBankAccount,
  onChangePayoutIfsc,
  onSavePayoutProfile,
  onTriggerSos,
  onSignOut,
}: ProfileScreenProps) {
  const floatingStatusLabel = !floatingSettings?.enabled
    ? 'Off'
    : floatingSettings.visibilityMode === 'ALWAYS'
    ? 'Always On'
    : 'On Duty Only';

  return (
    <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
      <LinearGradient
        colors={['#061D42', '#0A2A5E', '#0D5E6B']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.heroHeader, { paddingBottom: 24 }]}
      >
        <View style={[styles.topChromeRow, { marginBottom: rs(8) }]}>
          {onBack ? (
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={onBack}
              hitSlop={8}
              accessibilityLabel="Back to Home"
              activeOpacity={0.75}
            >
              <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          ) : (
            <View style={{ width: rs(38) }} />
          )}

          <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
            <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.navBarTitle}>
              Profile
            </Text>
          </View>

          <View style={{ width: rs(38) }} />
        </View>

        <View style={{ alignItems: 'center', paddingTop: 2 }}>
          <View style={[styles.avatarCircle, { width: 72, height: 72, borderRadius: 36 }]}>
            <Text style={[styles.avatarText, { fontSize: rf(27), lineHeight: lh(rf(27), 1.25) }]}>
              {phleboInitial}
            </Text>
          </View>
          <Text
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
            style={[
              styles.greetingTitle,
              { fontSize: rf(19.5), lineHeight: lh(rf(19.5)), marginTop: 10, textAlign: 'center' },
            ]}
          >
            {phleboName}
          </Text>
          <Text
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
            style={[styles.greetingSubtitle, { textAlign: 'center' }]}
          >
            Field Phlebotomist • {displayCourierId}
          </Text>

          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 8,
              marginTop: 10,
            }}
          >
            <View
              style={[
                styles.onlinePill,
                {
                  backgroundColor: isOnline ? '#16A34A' : '#475569',
                  paddingVertical: 5,
                  paddingHorizontal: 11,
                },
              ]}
            >
              <View
                style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' }}
              />
              <Text style={styles.onlinePillText}>{isOnline ? 'Active' : dutyStatus}</Text>
            </View>

            <View
              style={[
                styles.onlinePill,
                { backgroundColor: 'rgba(255,255,255,0.16)', paddingVertical: 5, paddingHorizontal: 11 },
              ]}
            >
              <Text style={styles.onlinePillText}>
                {myPhleboProfile
                  ? `★ ${myPhleboProfile.rating.toFixed(1)} (${completedDeliveriesCount} Done)`
                  : 'Profile Syncing'}
              </Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <View style={[styles.bodyContainer, { paddingTop: 18 }]}>
        {/* Clean SS1/SS2 Profile Quick Menu with Floating Icon Settings */}
        <View style={styles.menuGroupCard}>
          <TouchableOpacity
            style={styles.menuGroupRow}
            onPress={onOpenFloatingSettings}
            activeOpacity={0.75}
          >
            <View style={[styles.menuRowIconWrap, { backgroundColor: '#E6F7F5' }]}>
              <Ionicons name="sparkles-outline" size={18} color={BRAND_COLORS.tealPrimary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuRowTitle}>
                Floating Icon Settings
              </Text>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuRowSub}>
                Draggable bubble visibility, edge-snap, size &amp; opacity
              </Text>
            </View>
            <View
              style={{
                backgroundColor: floatingSettings?.enabled ? '#DCFCE7' : '#F1F5F9',
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 999,
                flexShrink: 0,
              }}
            >
              <Text
                maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                style={{
                  fontSize: rf(10.5),
                  lineHeight: lh(rf(10.5)),
                  fontFamily: FONTS.bold,
                  color: floatingSettings?.enabled ? '#15803D' : '#64748B',
                }}
              >
                {floatingStatusLabel}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={BRAND_COLORS.muted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuGroupRow}
            onPress={onOpenTrainingSops}
            activeOpacity={0.75}
          >
            <View style={[styles.menuRowIconWrap, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="book-outline" size={18} color={BRAND_COLORS.navyPrimary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuRowTitle}>
                Training &amp; SOPs
              </Text>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuRowSub}>
                Cold-chain 2–8°C &amp; sample handling guide
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={BRAND_COLORS.muted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuGroupRow}
            onPress={onOpenMySupplies}
            activeOpacity={0.75}
          >
            <View style={[styles.menuRowIconWrap, { backgroundColor: '#F0FDFA' }]}>
              <Ionicons name="briefcase-outline" size={18} color="#0D9488" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuRowTitle}>
                My Collection Kits &amp; Supplies
              </Text>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuRowSub}>
                {kitAllocationsCount > 0 ? `${kitAllocationsCount} active kit batches allocated` : 'Assigned test collection kits & on-hand balance'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {kitAllocationsCount > 0 && (
                <View style={{ backgroundColor: '#CCFBF1', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#0F766E' }}>{kitAllocationsCount}</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={18} color={BRAND_COLORS.muted} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuGroupRow}
            onPress={onOpenHelpSupport}
            activeOpacity={0.75}
          >
            <View style={[styles.menuRowIconWrap, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="headset-outline" size={18} color="#B45309" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuRowTitle}>
                Help &amp; Support
              </Text>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuRowSub}>
                Platform Operations &amp; Dispatch Helpline
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={BRAND_COLORS.muted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuGroupRow, { borderBottomWidth: 0 }]}
            onPress={onCheckForUpdates}
            activeOpacity={0.75}
          >
            <View style={[styles.menuRowIconWrap, { backgroundColor: '#F0FDF4' }]}>
              <Ionicons name="cloud-download-outline" size={18} color="#16A34A" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuRowTitle}>
                In-App Updates &amp; Release
              </Text>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuRowSub}>
                Check for OTA updates and self-update inside app
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#15803D' }}>Check</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={BRAND_COLORS.muted} />
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionHeaderTitle}>Duty Status</Text>
        <View style={styles.shiftSelectorRow}>
          {(
            [
              { status: 'ONLINE', label: 'On Duty', bg: '#DCFCE7', text: '#16A34A' },
              { status: 'BREAK', label: 'On Break', bg: '#FEF3C7', text: '#D97706' },
              { status: 'OFFLINE', label: 'Off Duty', bg: '#FEE2E2', text: '#DC2626' },
            ] as const
          ).map((s) => (
            <TouchableOpacity
              key={s.status}
              style={[
                styles.shiftButton,
                dutyStatus === s.status && {
                  backgroundColor: s.bg,
                  borderColor: s.text,
                  borderWidth: 1.5,
                },
              ]}
              onPress={() => onShiftUpdate(s.status)}
            >
              <Text
                style={[
                  styles.shiftButtonText,
                  dutyStatus === s.status && { color: s.text, fontFamily: FONTS.bold },
                ]}
              >
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.equipmentCard, { marginBottom: 4 }]}>
          <View style={styles.equipmentRow}>
            <View style={[styles.menuRowIconWrap, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="notifications-outline" size={19} color={BRAND_COLORS.navyPrimary} />
            </View>
            <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
              <Text style={styles.equipmentTitle}>
                Background Pickup Popups &amp; Overlay
              </Text>
              <Text style={styles.equipmentSub}>
                {isOnline
                  ? 'Draggable LabSetu floating bubble active across all screens for live 1–5 km requests.'
                  : 'Switch On Duty above or enable "Always Visible" in Floating Icon Settings.'}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.zoneCoveragePill,
              {
                backgroundColor: riderCoverage.covered ? '#DCFCE7' : '#FEF3C7',
                marginTop: 10,
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
                ? `Active Service Area: ${riderCoverage.matchedZone?.name || riderCoverage.matchedZone?.zoneCode}`
                : `Outside Pilot Zone (${riderCoverage.distanceToNearestKm} km away)`}
            </Text>
          </View>

          {Platform.OS !== 'web' || webNotifPerm !== 'granted' ? (
            <TouchableOpacity
              style={[styles.notifBannerBtn, { marginTop: 10, marginBottom: 0 }]}
              onPress={onRequestBackgroundAlertPermission}
            >
              <Text style={styles.notifBannerBtnText}>
                {Platform.OS === 'web'
                  ? webNotifPerm === 'denied'
                    ? 'Browser Notifications Blocked — Allow in Site Settings'
                    : 'Enable Background Pickup Alerts When App Is Minimized'
                  : 'Enable Native Background Pickup Alerts & Overlay'}
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.equipmentSub, { color: '#15803D', marginTop: 8, fontFamily: FONTS.bold }]}>
              Background OS / Service Worker pickup popups enabled
            </Text>
          )}
        </View>

        <Text style={[styles.sectionHeaderTitle, { marginTop: 20 }]}>
          Bank &amp; Payout Account (UPI / Bank)
        </Text>
        <View style={styles.equipmentCard}>
          <View style={[styles.shiftSelectorRow, { marginBottom: 12 }]}>
            <TouchableOpacity
              style={[
                styles.shiftButton,
                payoutMethod === 'UPI' && {
                  backgroundColor: '#E6F7F5',
                  borderColor: COLORS.primaryTeal,
                  borderWidth: 1.5,
                },
              ]}
              onPress={() => onChangePayoutMethod('UPI')}
            >
              <Text
                style={[
                  styles.shiftButtonText,
                  payoutMethod === 'UPI' && { color: COLORS.primaryTeal, fontFamily: FONTS.bold },
                ]}
              >
                UPI ID
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.shiftButton,
                payoutMethod === 'BANK_TRANSFER' && {
                  backgroundColor: '#E6F7F5',
                  borderColor: COLORS.primaryTeal,
                  borderWidth: 1.5,
                },
              ]}
              onPress={() => onChangePayoutMethod('BANK_TRANSFER')}
            >
              <Text
                style={[
                  styles.shiftButtonText,
                  payoutMethod === 'BANK_TRANSFER' && {
                    color: COLORS.primaryTeal,
                    fontFamily: FONTS.bold,
                  },
                ]}
              >
                Bank Account + IFSC
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ marginBottom: 10 }}>
            <Text style={styles.inputLabelSm}>Account Holder Name</Text>
            <TextInput
              style={styles.fieldInput}
              value={payoutAccountName}
              onChangeText={onChangePayoutAccountName}
              placeholder="Full name on UPI / bank"
            />
          </View>

          {payoutMethod === 'UPI' ? (
            <View style={{ marginBottom: 12 }}>
              <Text style={styles.inputLabelSm}>UPI ID</Text>
              <TextInput
                style={styles.fieldInput}
                value={payoutUpiId}
                onChangeText={onChangePayoutUpiId}
                autoCapitalize="none"
                placeholder="courier@okaxis"
              />
            </View>
          ) : (
            <>
              <View style={{ marginBottom: 10 }}>
                <Text style={styles.inputLabelSm}>Bank Account Number</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={payoutBankAccount}
                  onChangeText={onChangePayoutBankAccount}
                  keyboardType="numeric"
                  placeholder="Enter account number"
                />
              </View>
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.inputLabelSm}>IFSC Code</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={payoutIfsc}
                  onChangeText={(txt) => onChangePayoutIfsc(txt.toUpperCase())}
                  autoCapitalize="characters"
                  placeholder="HDFC0001234"
                />
              </View>
            </>
          )}

          <TouchableOpacity
            style={[styles.btnPrimary, savingPayoutProfile && { opacity: 0.65 }]}
            disabled={savingPayoutProfile}
            onPress={onSavePayoutProfile}
          >
            <Text style={styles.btnPrimaryText}>
              {savingPayoutProfile ? 'Saving Account...' : 'Save Payout Account'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionHeaderTitle, { marginTop: 20 }]}>
          Assigned Cold-Chain Equipment
        </Text>
        <View style={styles.equipmentCard}>
          <View style={styles.equipmentRow}>
            <View style={[styles.menuRowIconWrap, { backgroundColor: '#E6F7F5' }]}>
              <Ionicons name="snow-outline" size={19} color={BRAND_COLORS.tealPrimary} />
            </View>
            <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
              <Text style={styles.equipmentTitle}>
                {myPhleboProfile?.coolerBoxId
                  ? `Smart Chiller Box #${myPhleboProfile.coolerBoxId}`
                  : 'Cooler Box Not Assigned'}
              </Text>
              <Text style={styles.equipmentSub}>
                {myPhleboProfile
                  ? `Temp: ${myPhleboProfile.chillerTempCelsius}°C • Battery: ${myPhleboProfile.batteryPct}%`
                  : 'Ask Platform Admin to assign equipment under Field Phlebotomists'}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.equipmentRow,
              { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderColor: COLORS.borderLight },
            ]}
          >
            <View style={[styles.menuRowIconWrap, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="bicycle-outline" size={19} color={BRAND_COLORS.navyPrimary} />
            </View>
            <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
              <Text style={styles.equipmentTitle}>Assigned Vehicle</Text>
              <Text style={styles.equipmentSub}>
                {myPhleboProfile?.vehicleInfo || 'Waiting for Vehicle Assignment'}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.equipmentRow,
              { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderColor: COLORS.borderLight },
            ]}
          >
            <View style={[styles.menuRowIconWrap, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="location-outline" size={19} color="#B45309" />
            </View>
            <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
              <Text style={styles.equipmentTitle}>Admin-Assigned Zone &amp; Verification</Text>
              <Text style={styles.equipmentSub}>
                {myPhleboProfile?.assignedZoneName
                  ? `${
                      myPhleboProfile.assignedZoneCode
                        ? `${myPhleboProfile.assignedZoneCode} • `
                        : ''
                    }${myPhleboProfile.assignedZoneName}${
                      myPhleboProfile.assignedCity ? ` (${myPhleboProfile.assignedCity})` : ''
                    }`
                  : myPhleboProfile?.currentLocation || 'Zone Assignment Pending (Admin)'}{' '}
                • {myPhleboProfile?.verified ? 'Verified' : 'Pending Review'}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ marginTop: 22, gap: 10 }}>
          <TouchableOpacity style={styles.sosButton} onPress={onTriggerSos}>
            <Text style={styles.sosButtonText}>EMERGENCY COLD-CHAIN SOS</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.signOutButton} onPress={onSignOut}>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <Ionicons name="log-out-outline" size={18} color={COLORS.errorRed} />
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.signOutButtonText}>
                Logout ({phleboEmail})
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.versionFootnote}>
          LabSetu Phlebo App • Live Field Operations • v1.0.1
        </Text>
      </View>
    </ScrollView>
  );
}
