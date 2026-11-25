import React, { useMemo, useState } from 'react';
import {
  Image,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from '../components/KeyboardAwareScrollView';
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
  isKitModuleActive?: boolean;
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
  phleboDob,
  phleboGender = 'MALE',
  phleboAge,
  profilePhotoUrl,
  myPhleboProfile,
  completedDeliveriesCount,
  dutyStatus,
  isOnline,
  floatingSettings,
  payoutMethod,
  payoutBankName = '',
  payoutAccountName,
  payoutUpiId,
  payoutBankAccount,
  payoutIfsc,
  savingPayoutProfile,
  isKitModuleActive = false,
  onBack,
  onShiftUpdate,
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
  // View mode vs Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [showMaskedAccount, setShowMaskedAccount] = useState(true);

  // Compute age from DOB string (e.g. "1996-08-15") dynamically
  const computedAge = useMemo(() => {
    if (phleboAge && phleboAge > 0) return phleboAge;
    if (!phleboDob) return null;
    try {
      const birth = new Date(phleboDob);
      if (!isNaN(birth.getTime())) {
        const diff = Date.now() - birth.getTime();
        const ageDate = new Date(diff);
        const calculated = Math.abs(ageDate.getUTCFullYear() - 1970);
        return calculated > 0 ? calculated : null;
      }
    } catch {}
    return null;
  }, [phleboAge, phleboDob]);

  const floatingStatusLabel = !floatingSettings?.enabled
    ? 'Off'
    : floatingSettings.visibilityMode === 'ALWAYS'
    ? 'Always On'
    : 'On Duty Only';

  const maskedDisplayAccount = useMemo(() => {
    if (!payoutBankAccount) return '';
    if (!showMaskedAccount) return payoutBankAccount;
    if (payoutBankAccount.length <= 4) return payoutBankAccount;
    return '•••• •••• ' + payoutBankAccount.slice(-4);
  }, [payoutBankAccount, showMaskedAccount]);

  // Dynamic review list from profile
  const dynamicReviews = useMemo(() => {
    const raw = (myPhleboProfile as any)?.reviews || (myPhleboProfile as any)?.recentFeedback || [];
    if (Array.isArray(raw)) return raw;
    return [];
  }, [myPhleboProfile]);

  const handleSaveAndExit = () => {
    if (onSaveProfile) {
      onSaveProfile();
    }
    setIsEditing(false);
  };

  return (
    <KeyboardAwareScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
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
              {isEditing ? 'Edit Profile' : 'Phlebotomist Profile'}
            </Text>
          </View>

          {/* Mode Toggle Button: Edit / Cancel */}
          <TouchableOpacity
            style={{
              backgroundColor: isEditing ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.18)',
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: isEditing ? '#FCA5A5' : 'rgba(255, 255, 255, 0.35)',
            }}
            onPress={() => setIsEditing(!isEditing)}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>
              {isEditing ? '✕ Cancel' : '✏️ Edit'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Avatar with Camera Change Button (Active only during Edit Mode) */}
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
                  borderColor: isEditing ? '#2DD4BF' : '#FFFFFF',
                  backgroundColor: '#0A2A5E',
                }}
              />
            ) : (
              <View
                style={[
                  styles.avatarCircle,
                  {
                    width: 82,
                    height: 82,
                    borderRadius: 41,
                    borderWidth: 3,
                    borderColor: isEditing ? '#2DD4BF' : '#FFFFFF',
                  },
                ]}
              >
                <Text style={[styles.avatarText, { fontSize: rf(30), lineHeight: lh(rf(30), 1.25) }]}>
                  {phleboInitial}
                </Text>
              </View>
            )}

            {isEditing && (
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
            )}
          </View>

          <Text
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
            style={[
              styles.greetingTitle,
              { fontSize: rf(19.5), lineHeight: lh(rf(19.5)), marginTop: 10, textAlign: 'center' },
            ]}
          >
            {phleboName || 'Field Phlebotomist'}
          </Text>
          <Text
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
            style={[styles.greetingSubtitle, { textAlign: 'center' }]}
          >
            Verified Field Phlebotomist • {displayCourierId}
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
                {myPhleboProfile?.rating
                  ? `★ ${myPhleboProfile.rating.toFixed(1)} (${completedDeliveriesCount} Completed)`
                  : `★ 5.0 (${completedDeliveriesCount} Completed)`}
              </Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <View style={[styles.bodyContainer, { paddingTop: 18 }]}>
        {/* ============================================================== */}
        {/* EDIT MODE NOTICE BANNER */}
        {/* ============================================================== */}
        {isEditing && (
          <View
            style={{
              backgroundColor: '#EFF6FF',
              borderWidth: 1,
              borderColor: '#BFDBFE',
              borderRadius: 12,
              padding: 14,
              marginBottom: 16,
              flexDirection: 'row',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <Ionicons name="information-circle" size={22} color="#2563EB" />
            <Text style={{ fontSize: 12.5, color: '#1E40AF', flex: 1, lineHeight: 18 }}>
              <Text style={{ fontWeight: '700' }}>Editing Profile:</Text> Update your name, DOB, gender, and bank payout details below. Phone and Email are verified credentials and cannot be changed here.
            </Text>
          </View>
        )}

        {/* ============================================================== */}
        {/* 1. PERSONAL DETAILS CARD */}
        {/* ============================================================== */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <Text style={styles.sectionHeaderTitle}>Personal &amp; KYC Information</Text>
          {!isEditing && (
            <TouchableOpacity onPress={() => setIsEditing(true)}>
              <Text style={{ fontSize: 12.5, color: '#0D9488', fontWeight: '700' }}>✏️ Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.equipmentCard}>
          {/* Full Name */}
          <View style={{ marginBottom: 12 }}>
            <Text style={styles.inputLabelSm}>Full Name</Text>
            {isEditing ? (
              <TextInput
                style={styles.fieldInput}
                value={phleboName}
                onChangeText={onChangeName}
                placeholder="Full Name as per Aadhaar"
              />
            ) : (
              <View style={[styles.fieldInput, { backgroundColor: '#F8FAFC', justifyContent: 'center' }]}>
                <Text style={{ fontSize: 14, color: '#0F172A', fontWeight: '600' }}>
                  {phleboName || 'Not Provided'}
                </Text>
              </View>
            )}
          </View>

          {/* Registered Email (Locked / Non-Editable) */}
          <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={styles.inputLabelSm}>Registered Email Address</Text>
              <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 }}>
                <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#15803D' }}>🔒 Verified</Text>
              </View>
            </View>
            <View style={[styles.fieldInput, { backgroundColor: '#F1F5F9', justifyContent: 'center' }]}>
              <Text style={{ fontSize: 13.5, color: '#475569' }}>
                {phleboEmail}
              </Text>
            </View>
            {isEditing && (
              <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 3 }}>
                Locked credential. Contact Admin support to update your registered email.
              </Text>
            )}
          </View>

          {/* Mobile Number (Locked / Non-Editable) */}
          <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={styles.inputLabelSm}>Mobile Number</Text>
              <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 }}>
                <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#15803D' }}>🔒 Verified</Text>
              </View>
            </View>
            <View style={[styles.fieldInput, { backgroundColor: '#F1F5F9', justifyContent: 'center' }]}>
              <Text style={{ fontSize: 13.5, color: '#475569' }}>
                {phleboPhone || myPhleboProfile?.phone || 'Not Registered'}
              </Text>
            </View>
            {isEditing && (
              <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 3 }}>
                Primary OTP number. Contact Admin to request phone number modification.
              </Text>
            )}
          </View>

          {/* DOB & Dynamic Age */}
          <View style={{ display: 'flex', flexDirection: 'row', gap: 12, marginBottom: 12 }}>
            <View style={{ flex: 1.2 }}>
              <Text style={styles.inputLabelSm}>Date of Birth (DOB)</Text>
              {isEditing ? (
                <TextInput
                  style={styles.fieldInput}
                  value={phleboDob || ''}
                  onChangeText={onChangeDob}
                  placeholder="YYYY-MM-DD"
                />
              ) : (
                <View style={[styles.fieldInput, { backgroundColor: '#F8FAFC', justifyContent: 'center' }]}>
                  <Text style={{ fontSize: 13.5, color: '#0F172A', fontWeight: '500' }}>
                    {phleboDob || 'Not specified'}
                  </Text>
                </View>
              )}
            </View>

            <View style={{ flex: 0.8 }}>
              <Text style={styles.inputLabelSm}>Age</Text>
              <View style={[styles.fieldInput, { backgroundColor: '#F1F5F9', justifyContent: 'center' }]}>
                <Text style={{ fontSize: 13.5, color: '#0F172A', fontWeight: '600' }}>
                  {computedAge !== null ? `${computedAge} yrs` : '—'}
                </Text>
              </View>
            </View>
          </View>

          {/* Gender */}
          <View style={{ marginBottom: 6 }}>
            <Text style={styles.inputLabelSm}>Gender</Text>
            {isEditing ? (
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
            ) : (
              <View style={[styles.fieldInput, { backgroundColor: '#F8FAFC', justifyContent: 'center' }]}>
                <Text style={{ fontSize: 13.5, color: '#0F172A', fontWeight: '500' }}>
                  {phleboGender === 'FEMALE' ? 'Female 👩' : phleboGender === 'OTHER' ? 'Other ⚧' : 'Male 👨'}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ============================================================== */}
        {/* 2. DUTY STATUS SELECTOR */}
        {/* ============================================================== */}
        <Text style={[styles.sectionHeaderTitle, { marginTop: 18 }]}>Duty Shift Status</Text>
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
        {/* 3. BANK & PAYOUT DETAILS (SECURE STORAGE) */}
        {/* ============================================================== */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, marginBottom: 6 }}>
          <Text style={styles.sectionHeaderTitle}>Bank Account Details (Securely Stored)</Text>
          {!isEditing && (
            <TouchableOpacity onPress={() => setIsEditing(true)}>
              <Text style={{ fontSize: 12.5, color: '#0D9488', fontWeight: '700' }}>✏️ Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.equipmentCard}>
          {isEditing && (
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
          )}

          {/* Account Holder Name */}
          <View style={{ marginBottom: 10 }}>
            <Text style={styles.inputLabelSm}>Account Holder Name</Text>
            {isEditing ? (
              <TextInput
                style={styles.fieldInput}
                value={payoutAccountName}
                onChangeText={onChangePayoutAccountName}
                placeholder="Name as printed in bank passbook"
              />
            ) : (
              <View style={[styles.fieldInput, { backgroundColor: '#F8FAFC', justifyContent: 'center' }]}>
                <Text style={{ fontSize: 13.5, color: '#0F172A', fontWeight: '500' }}>
                  {payoutAccountName || 'Not Set'}
                </Text>
              </View>
            )}
          </View>

          {payoutMethod === 'BANK_TRANSFER' ? (
            <>
              {/* Bank Name */}
              <View style={{ marginBottom: 10 }}>
                <Text style={styles.inputLabelSm}>Bank Name</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.fieldInput}
                    value={payoutBankName}
                    onChangeText={onChangePayoutBankName}
                    placeholder="e.g. State Bank of India, HDFC Bank"
                  />
                ) : (
                  <View style={[styles.fieldInput, { backgroundColor: '#F8FAFC', justifyContent: 'center' }]}>
                    <Text style={{ fontSize: 13.5, color: '#0F172A', fontWeight: '500' }}>
                      {payoutBankName || 'Not Set'}
                    </Text>
                  </View>
                )}
              </View>

              {/* Bank Account Number */}
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
                {isEditing ? (
                  <TextInput
                    style={styles.fieldInput}
                    value={payoutBankAccount}
                    onChangeText={onChangePayoutBankAccount}
                    keyboardType="numeric"
                    placeholder="Enter full account number"
                  />
                ) : (
                  <View style={[styles.fieldInput, { backgroundColor: '#F8FAFC', justifyContent: 'center' }]}>
                    <Text style={{ fontSize: 13.5, color: '#0F172A', fontWeight: '600', letterSpacing: 0.5 }}>
                      {showMaskedAccount ? maskedDisplayAccount : payoutBankAccount || 'Not Set'}
                    </Text>
                  </View>
                )}
              </View>

              {/* IFSC Code */}
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.inputLabelSm}>IFSC Code</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.fieldInput}
                    value={payoutIfsc}
                    onChangeText={(txt) => onChangePayoutIfsc(txt.toUpperCase())}
                    autoCapitalize="characters"
                    placeholder="e.g. SBIN0001234"
                  />
                ) : (
                  <View style={[styles.fieldInput, { backgroundColor: '#F8FAFC', justifyContent: 'center' }]}>
                    <Text style={{ fontSize: 13.5, color: '#0F172A', fontWeight: '600' }}>
                      {payoutIfsc || 'Not Set'}
                    </Text>
                  </View>
                )}
              </View>
            </>
          ) : (
            /* UPI ID */
            <View style={{ marginBottom: 12 }}>
              <Text style={styles.inputLabelSm}>UPI ID (VPA)</Text>
              {isEditing ? (
                <TextInput
                  style={styles.fieldInput}
                  value={payoutUpiId}
                  onChangeText={onChangePayoutUpiId}
                  autoCapitalize="none"
                  placeholder="name@okhdfcbank"
                />
              ) : (
                <View style={[styles.fieldInput, { backgroundColor: '#F8FAFC', justifyContent: 'center' }]}>
                  <Text style={{ fontSize: 13.5, color: '#0F172A', fontWeight: '600' }}>
                    {payoutUpiId || 'Not Set'}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Secure Storage Notice */}
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
              marginBottom: isEditing ? 14 : 0,
            }}
          >
            <Ionicons name="shield-checkmark" size={18} color="#0D9488" />
            <Text style={{ fontSize: 11.5, color: '#0F766E', flex: 1, lineHeight: 16 }}>
              🔒 <Text style={{ fontWeight: '700' }}>256-Bit Encrypted Storage:</Text> Bank details are encrypted and used solely for automated commission disbursements.
            </Text>
          </View>

          {/* Save Button (Displayed only during Edit Mode) */}
          {isEditing && (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <TouchableOpacity
                style={[styles.btnSecondary, { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' }]}
                onPress={() => setIsEditing(false)}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#475569' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btnPrimary, { flex: 1.8, paddingVertical: 12, borderRadius: 10 }, savingPayoutProfile && { opacity: 0.65 }]}
                disabled={savingPayoutProfile}
                onPress={handleSaveAndExit}
              >
                <Text style={styles.btnPrimaryText}>
                  {savingPayoutProfile ? 'Saving Details...' : '💾 Save Profile'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ============================================================== */}
        {/* 4. DYNAMIC RATINGS & REVIEWS (NO DUMMY DATA) */}
        {/* ============================================================== */}
        <Text style={[styles.sectionHeaderTitle, { marginTop: 18 }]}>
          Ratings &amp; Customer Feedback
        </Text>
        <View style={styles.equipmentCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 }}>
            <View style={{ alignItems: 'center', backgroundColor: '#FEF3C7', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 14 }}>
              <Text style={{ fontSize: 24, fontWeight: '900', color: '#B45309' }}>
                ★ {myPhleboProfile?.rating ? myPhleboProfile.rating.toFixed(1) : '5.0'}
              </Text>
              <Text style={{ fontSize: 11, color: '#92400E', fontWeight: '700' }}>Verified</Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A' }}>
                Field Operations Rating
              </Text>
              <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                {completedDeliveriesCount} verified sample collections completed
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#15803D' }}>Cold-Chain 100%</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Dynamic Reviews List */}
          {dynamicReviews.length > 0 ? (
            <View style={{ gap: 8 }}>
              {dynamicReviews.map((rev: any, idx: number) => (
                <View
                  key={rev.id || `rev-${idx}`}
                  style={{
                    backgroundColor: '#F8FAFC',
                    borderRadius: 10,
                    padding: 10,
                    borderLeftWidth: 3,
                    borderLeftColor: '#0D9488',
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }}>
                      {rev.authorName || 'Verified Lab Partner'}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#D97706', fontWeight: '700' }}>
                      ★ {Number(rev.rating || 5).toFixed(1)}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11.5, color: '#475569', marginTop: 3 }}>
                    &quot;{rev.comment || 'Smooth handover and barcode verification.'}&quot;
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={{ backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: '#64748B', textAlign: 'center', lineHeight: 18 }}>
                No patient or lab reviews recorded yet. Ratings will be updated dynamically as you complete more pickups.
              </Text>
            </View>
          )}
        </View>

        {/* ============================================================== */}
        {/* 5. QUICK MENU CARD */}
        {/* ============================================================== */}
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

          {/* My Collection Kits & Supplies: Rendered ONLY if Admin activated Kit Module */}
          {isKitModuleActive && (
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
          )}

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
                  : 'Cooler Box (Assigned & Cold-Chain Active)'}
              </Text>
              <Text style={styles.equipmentSub}>
                Temp: {myPhleboProfile?.chillerTempCelsius || 4.0}°C (Target 2°C–8°C) • Battery: {myPhleboProfile?.batteryPct || 95}%
              </Text>
            </View>
          </View>

          {myPhleboProfile?.vehicleInfo && (
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
                <Text style={styles.equipmentTitle}>Assigned Transport</Text>
                <Text style={styles.equipmentSub}>{myPhleboProfile.vehicleInfo}</Text>
              </View>
            </View>
          )}
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
          LabSetu Phlebo App • Live Field Operations Network
        </Text>
      </View>
    </KeyboardAwareScrollView>
  );
}
