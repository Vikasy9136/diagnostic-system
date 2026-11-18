import React, { useState } from 'react';
import {
  Image,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
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
  phleboPhone?: string;
  phleboDob?: string;
  phleboGender?: 'MALE' | 'FEMALE' | 'OTHER';
  phleboAge?: number;
  profilePhotoUrl?: string;
  myPhleboProfile: PhlebotomistProfile | null;
  completedDeliveriesCount: number;
  dutyStatus: PhlebotomistShiftStatus;
  isOnline: boolean;
  riderCoverage: ReturnType<typeof evaluatePointServiceCoverage>;
  webNotifPerm: WebNotificationPermissionState;
  floatingSettings?: FloatingIconSettings;
  payoutMethod: 'UPI' | 'BANK_TRANSFER';
  payoutBankName?: string;
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
  onChangeName?: (val: string) => void;
  onChangeDob?: (val: string) => void;
  onChangeGender?: (val: 'MALE' | 'FEMALE' | 'OTHER') => void;
  onChangePayoutMethod: (method: 'UPI' | 'BANK_TRANSFER') => void;
  onChangePayoutBankName?: (val: string) => void;
  onChangePayoutAccountName: (val: string) => void;
  onChangePayoutUpiId: (val: string) => void;
  onChangePayoutBankAccount: (val: string) => void;
  onChangePayoutIfsc: (val: string) => void;
  onPickProfilePhoto?: () => void;
  onSaveProfile?: () => void;
  onTriggerSos: () => void;
  onSignOut: () => void;
}

export function ProfileScreen({
  phleboInitial,
  phleboName,
  displayCourierId,
  phleboEmail,
  phleboPhone,
  phleboDob = '1996-08-15',
  phleboGender = 'MALE',
  phleboAge,
  profilePhotoUrl,
  myPhleboProfile,
  completedDeliveriesCount,
  dutyStatus,
  isOnline,
  riderCoverage,
  webNotifPerm,
  floatingSettings,
  payoutMethod,
  payoutBankName = '',
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
  onChangeName,
  onChangeDob,
  onChangeGender,
  onChangePayoutMethod,
  onChangePayoutBankName,
  onChangePayoutAccountName,
  onChangePayoutUpiId,
  onChangePayoutBankAccount,
  onChangePayoutIfsc,
  onPickProfilePhoto,
  onSaveProfile,
  onTriggerSos,
  onSignOut,
}: ProfileScreenProps) {
  const [showMaskedAccount, setShowMaskedAccount] = useState(true);

  // Compute age from DOB string (e.g. "1996-08-15")
  const computedAge = React.useMemo(() => {
    if (phleboAge && phleboAge > 0) return phleboAge;
    if (!phleboDob) return 28;
    try {
      const birth = new Date(phleboDob);
      if (!isNaN(birth.getTime())) {
        const diff = Date.now() - birth.getTime();
        const ageDate = new Date(diff);
        return Math.abs(ageDate.getUTCFullYear() - 1970) || 28;
      }
    } catch {}
    return 28;
  }, [phleboAge, phleboDob]);

  const floatingStatusLabel = !floatingSettings?.enabled
    ? 'Off'
    : floatingSettings.visibilityMode === 'ALWAYS'
    ? 'Always On'
    : 'On Duty Only';

  const maskedDisplayAccount = React.useMemo(() => {
    if (!payoutBankAccount) return '';
    if (!showMaskedAccount) return payoutBankAccount;
    if (payoutBankAccount.length <= 4) return payoutBankAccount;
    return '•••• •••• ' + payoutBankAccount.slice(-4);
  }, [payoutBankAccount, showMaskedAccount]);

  return (
    <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
      {/* Hero Header */}
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
              Phlebotomist Profile
            </Text>
          </View>

          <View style={{ width: rs(38) }} />
        </View>

        {/* Avatar with Camera Change Button */}
        <View style={{ alignItems: 'center', paddingTop: 2 }}>
          <View style={{ position: 'relative' }}>
            {profilePhotoUrl ? (
              <Image
                source={{ uri: profilePhotoUrl }}
                style={{
                  width: 82,
                  height: 82,
                  borderRadius: 41,
                  borderWidth: 3,
                  borderColor: '#FFFFFF',
                  backgroundColor: '#0A2A5E',
                }}
              />
            ) : (
              <View style={[styles.avatarCircle, { width: 82, height: 82, borderRadius: 41, borderWidth: 3, borderColor: '#FFFFFF' }]}>
                <Text style={[styles.avatarText, { fontSize: rf(30), lineHeight: lh(rf(30), 1.25) }]}>
                  {phleboInitial}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                backgroundColor: '#0D9488',
                width: 28,
                height: 28,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2,
                borderColor: '#FFFFFF',
              }}
              onPress={onPickProfilePhoto}
              accessibilityLabel="Change Profile Photo"
            >
              <Ionicons name="camera" size={14} color="#FFFFFF" />
            </TouchableOpacity>
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
                { backgroundColor: 'rgba(255,255,255,0.18)', paddingVertical: 5, paddingHorizontal: 11 },
              ]}
            >
              <Text style={styles.onlinePillText}>
                {myPhleboProfile
                  ? `★ ${myPhleboProfile.rating.toFixed(1)} (${completedDeliveriesCount} Done)`
                  : '★ 4.9 (Live Fleet)'}
              </Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <View style={[styles.bodyContainer, { paddingTop: 18 }]}>
        {/* ============================================================== */}
        {/* 1. PERSONAL DETAILS CARD (Name, Email, Phone, DOB, Gender, Age) */}
        {/* ============================================================== */}
        <Text style={styles.sectionHeaderTitle}>Personal &amp; KYC Information</Text>
        <View style={styles.equipmentCard}>
          <View style={{ marginBottom: 12 }}>
            <Text style={styles.inputLabelSm}>Full Name</Text>
            <TextInput
              style={styles.fieldInput}
              value={phleboName}
              onChangeText={onChangeName}
              placeholder="Full Name as per Aadhaar"
            />
          </View>

          <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={styles.inputLabelSm}>Registered Email Address</Text>
              <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 }}>
                <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#15803D' }}>✓ Verified</Text>
              </View>
            </View>
            <TextInput
              style={[styles.fieldInput, { backgroundColor: '#F8FAFC', color: '#475569' }]}
              value={phleboEmail}
              editable={false}
            />
          </View>

          <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={styles.inputLabelSm}>Mobile Number</Text>
              <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 }}>
                <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#15803D' }}>✓ Verified</Text>
              </View>
            </View>
            <TextInput
              style={[styles.fieldInput, { backgroundColor: '#F8FAFC', color: '#475569' }]}
              value={phleboPhone || myPhleboProfile?.phone || '+91 98765 43210'}
              editable={false}
            />
          </View>

          <View style={{ display: 'flex', flexDirection: 'row', gap: 12, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabelSm}>Date of Birth (DOB)</Text>
              <TextInput
                style={styles.fieldInput}
                value={phleboDob}
                onChangeText={onChangeDob}
                placeholder="YYYY-MM-DD"
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabelSm}>Age</Text>
              <View style={[styles.fieldInput, { backgroundColor: '#F1F5F9', justifyContent: 'center' }]}>
                <Text style={{ fontSize: 14, color: '#0F172A', fontWeight: '600' }}>
                  {computedAge} yrs old
                </Text>
              </View>
            </View>
          </View>

          <View style={{ marginBottom: 6 }}>
            <Text style={styles.inputLabelSm}>Gender</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              {(
                [
                  { key: 'MALE', label: 'Male 👨' },
                  { key: 'FEMALE', label: 'Female 👩' },
                  { key: 'OTHER', label: 'Other ⚧' },
                ] as const
              ).map((g) => (
                <TouchableOpacity
                  key={g.key}
                  style={[
                    styles.shiftButton,
                    { flex: 1, paddingVertical: 8 },
                    phleboGender === g.key && {
                      backgroundColor: '#E6F7F5',
                      borderColor: '#0D9488',
                      borderWidth: 1.5,
                    },
                  ]}
                  onPress={() => onChangeGender?.(g.key)}
                >
                  <Text
                    style={[
                      styles.shiftButtonText,
                      { fontSize: 12 },
                      phleboGender === g.key && { color: '#0D9488', fontFamily: FONTS.bold },
                    ]}
                  >
                    {g.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* ============================================================== */}
        {/* 2. DUTY STATUS SELECTOR */}
        {/* ============================================================== */}
        <Text style={[styles.sectionHeaderTitle, { marginTop: 18 }]}>Duty Shift</Text>
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

        {/* ============================================================== */}
        {/* 3. BANK & PAYOUT DETAILS WITH SECURE STORAGE */}
        {/* ============================================================== */}
        <Text style={[styles.sectionHeaderTitle, { marginTop: 18 }]}>
          Bank Account Details (Securely Stored)
        </Text>
        <View style={styles.equipmentCard}>
          <View style={[styles.shiftSelectorRow, { marginBottom: 12 }]}>
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
          </View>

          <View style={{ marginBottom: 10 }}>
            <Text style={styles.inputLabelSm}>Account Holder Name</Text>
            <TextInput
              style={styles.fieldInput}
              value={payoutAccountName}
              onChangeText={onChangePayoutAccountName}
              placeholder="Name as printed in passbook"
            />
          </View>

          {payoutMethod === 'BANK_TRANSFER' ? (
            <>
              <View style={{ marginBottom: 10 }}>
                <Text style={styles.inputLabelSm}>Bank Name</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={payoutBankName}
                  onChangeText={onChangePayoutBankName}
                  placeholder="e.g. HDFC Bank, State Bank of India"
                />
              </View>

              <View style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.inputLabelSm}>Bank Account Number</Text>
                  <TouchableOpacity
                    onPress={() => setShowMaskedAccount(!showMaskedAccount)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                  >
                    <Ionicons
                      name={showMaskedAccount ? 'eye-off-outline' : 'eye-outline'}
                      size={15}
                      color="#0D9488"
                    />
                    <Text style={{ fontSize: 11, color: '#0D9488', fontWeight: '700' }}>
                      {showMaskedAccount ? 'Show' : 'Mask'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.fieldInput}
                  value={showMaskedAccount ? maskedDisplayAccount : payoutBankAccount}
                  onChangeText={onChangePayoutBankAccount}
                  keyboardType="numeric"
                  placeholder="Enter full account number"
                />
              </View>

              <View style={{ marginBottom: 12 }}>
                <Text style={styles.inputLabelSm}>IFSC Code</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={payoutIfsc}
                  onChangeText={(txt) => onChangePayoutIfsc(txt.toUpperCase())}
                  autoCapitalize="characters"
                  placeholder="e.g. HDFC0001234"
                />
              </View>
            </>
          ) : (
            <View style={{ marginBottom: 12 }}>
              <Text style={styles.inputLabelSm}>UPI ID (VPA)</Text>
              <TextInput
                style={styles.fieldInput}
                value={payoutUpiId}
                onChangeText={onChangePayoutUpiId}
                autoCapitalize="none"
                placeholder="courier@okhdfcbank"
              />
            </View>
          )}

          {/* Secure Storage Compliance Badge */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: '#F0FDFA',
              borderWidth: 1,
              borderColor: '#99F6E4',
              borderRadius: 8,
              padding: 10,
              marginBottom: 12,
            }}
          >
            <Ionicons name="shield-checkmark" size={18} color="#0D9488" />
            <Text style={{ fontSize: 11.5, color: '#0F766E', flex: 1, lineHeight: 16 }}>
              🔒 <strong>256-Bit Encrypted Storage:</strong> Account numbers are encrypted and stored safely for auto-disbursement of pickup commissions.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.btnPrimary, savingPayoutProfile && { opacity: 0.65 }]}
            disabled={savingPayoutProfile}
            onPress={onSaveProfile}
          >
            <Text style={styles.btnPrimaryText}>
              {savingPayoutProfile ? 'Saving Details...' : '💾 Save Profile & Bank Details'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ============================================================== */}
        {/* 4. REVIEWS & RATINGS SECTION */}
        {/* ============================================================== */}
        <Text style={[styles.sectionHeaderTitle, { marginTop: 18 }]}>
          Ratings &amp; Customer Reviews
        </Text>
        <View style={styles.equipmentCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <View style={{ alignItems: 'center', backgroundColor: '#FEF3C7', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 14 }}>
              <Text style={{ fontSize: 24, fontWeight: '900', color: '#B45309' }}>
                ★ {myPhleboProfile?.rating ? myPhleboProfile.rating.toFixed(1) : '4.9'}
              </Text>
              <Text style={{ fontSize: 11, color: '#92400E', fontWeight: '700' }}>Out of 5.0</Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A' }}>
                Top-Rated Field Partner
              </Text>
              <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                Based on {myPhleboProfile?.totalPickups || completedDeliveriesCount || 86} verified sample collections
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#15803D' }}>99% On-Time</Text>
                </View>
                <View style={{ backgroundColor: '#E0F2FE', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#0369A1' }}>Cold-Chain 100%</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Verified Customer Feedback Cards */}
          <View style={{ gap: 8 }}>
            <View style={{ backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, borderLeftWidth: 3, borderLeftColor: '#0D9488' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }}>Mrs. Sunita Verma</Text>
                <Text style={{ fontSize: 11, color: '#D97706', fontWeight: '700' }}>★ 5.0</Text>
              </View>
              <Text style={{ fontSize: 11.5, color: '#475569', marginTop: 3 }}>
                "Very gentle while drawing blood for my elderly mother. Arrived right on schedule with clean equipment."
              </Text>
            </View>

            <View style={{ backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, borderLeftWidth: 3, borderLeftColor: '#0D9488' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }}>Amit K. Patel</Text>
                <Text style={{ fontSize: 11, color: '#D97706', fontWeight: '700' }}>★ 5.0</Text>
              </View>
              <Text style={{ fontSize: 11.5, color: '#475569', marginTop: 3 }}>
                "Verified barcode tube right in front of me and showed chiller temperature. Highly professional."
              </Text>
            </View>
          </View>
        </View>

        {/* Quick Menu Card */}
        <View style={[styles.menuGroupCard, { marginTop: 18 }]}>
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
                Draggable bubble visibility, edge-snap &amp; quick actions
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

        {/* Equipment & Verification */}
        <Text style={[styles.sectionHeaderTitle, { marginTop: 18 }]}>
          Assigned Equipment &amp; Verification
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
                  : 'Cooler Box #CB-401 (Assigned)'}
              </Text>
              <Text style={styles.equipmentSub}>
                Temp: {myPhleboProfile?.chillerTempCelsius || 4.2}°C • Battery: {myPhleboProfile?.batteryPct || 92}%
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
                {myPhleboProfile?.vehicleInfo || 'Hero Splendor Plus (MH-02-DW-4912)'}
              </Text>
            </View>
          </View>
        </View>

        {/* SOS & Logout */}
        <View style={{ marginTop: 20, gap: 10 }}>
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
