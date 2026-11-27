import React from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { type PhlebotomistProfile, type PhlebotomistShiftStatus } from '@diagnostic/shared';
import { BRAND_COLORS, BRAND_FONTS } from '../components/LabSetuBrand';
import { COLORS, styles } from '../styles/phleboStyles';
import { COMPACT_TEXT_SCALE, lh, MAX_TEXT_SCALE, rf, rs } from '../utils/responsive';

export interface ProfileScreenProps {
  phleboInitial: string;
  phleboName: string;
  displayCourierId: string;
  phleboEmail: string;
  phleboPhone?: string;
  profilePhotoUrl?: string;
  myPhleboProfile: PhlebotomistProfile | null;
  completedDeliveriesCount: number;
  dutyStatus: PhlebotomistShiftStatus;
  isOnline: boolean;
  isKitModuleActive?: boolean;
  kitAllocationsCount?: number;
  onBack?: () => void;
  onOpenPersonalDetails: () => void;
  onOpenBankingPayout: () => void;
  onOpenWallet: () => void;
  onOpenKycVerification: () => void;
  onOpenMyDocuments: () => void;
  onOpenNotificationsPreferences: () => void;
  onOpenHelpSupport?: () => void;
  onOpenTrainingSops?: () => void;
  onOpenMySupplies?: () => void;
  onOpenAboutApp: () => void;
  onOpenPrivacyPolicy: () => void;
  onOpenTermsConditions: () => void;
  onTriggerSos: () => void;
  onSignOut: () => void;
}

export function ProfileScreen({
  phleboInitial,
  phleboName,
  displayCourierId,
  phleboEmail,
  profilePhotoUrl,
  myPhleboProfile,
  completedDeliveriesCount,
  dutyStatus,
  isOnline,
  isKitModuleActive = false,
  kitAllocationsCount = 0,
  onBack,
  onOpenPersonalDetails,
  onOpenBankingPayout,
  onOpenWallet,
  onOpenKycVerification,
  onOpenMyDocuments,
  onOpenNotificationsPreferences,
  onOpenHelpSupport,
  onOpenTrainingSops,
  onOpenMySupplies,
  onOpenAboutApp,
  onOpenPrivacyPolicy,
  onOpenTermsConditions,
  onTriggerSos,
  onSignOut,
}: ProfileScreenProps) {
  const kycBadge = myPhleboProfile?.verified
    ? { bg: '#DCFCE7', fg: '#15803D', label: 'Verified' }
    : myPhleboProfile?.verificationStatus === 'REJECTED'
    ? { bg: '#FEE2E2', fg: '#B91C1C', label: 'Action Needed' }
    : { bg: '#E0F2FE', fg: '#0369A1', label: 'Pending' };

  return (
    <ScrollView
      style={styles.scrollArea}
      contentContainerStyle={{ paddingBottom: rs(90) }}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero Summary Header */}
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
          {profilePhotoUrl ? (
            <Image
              source={{ uri: profilePhotoUrl }}
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                borderWidth: 3,
                borderColor: '#FFFFFF',
                backgroundColor: '#0A2A5E',
              }}
            />
          ) : (
            <View
              style={[
                styles.avatarCircle,
                {
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  borderWidth: 3,
                  borderColor: '#FFFFFF',
                },
              ]}
            >
              <Text style={[styles.avatarText, { fontSize: rf(28), lineHeight: lh(rf(28), 1.25) }]}>
                {phleboInitial}
              </Text>
            </View>
          )}

          <Text
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
            style={[
              styles.greetingTitle,
              { fontSize: rf(19), lineHeight: lh(rf(19)), marginTop: 10, textAlign: 'center' },
            ]}
          >
            {phleboName || 'Field Phlebotomist'}
          </Text>
          <Text
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
            style={[styles.greetingSubtitle, { textAlign: 'center' }]}
          >
            {displayCourierId} • {phleboEmail}
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
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' }} />
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
        {/* Account & Payout Menu */}
        <Text style={styles.sectionHeaderTitle}>Account &amp; Verification</Text>
        <View style={styles.menuGroupCard}>
          <TouchableOpacity
            style={styles.menuGroupRow}
            onPress={onOpenPersonalDetails}
            activeOpacity={0.75}
          >
            <View style={[styles.menuRowIconWrap, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="person-outline" size={18} color={BRAND_COLORS.navyPrimary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuRowTitle}>
                Personal Details
              </Text>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuRowSub}>
                Photo, name, DOB, gender &amp; address
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={BRAND_COLORS.muted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuGroupRow}
            onPress={onOpenBankingPayout}
            activeOpacity={0.75}
          >
            <View style={[styles.menuRowIconWrap, { backgroundColor: '#F0FDFA' }]}>
              <Ionicons name="card-outline" size={18} color={BRAND_COLORS.tealPrimary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuRowTitle}>
                Banking &amp; Payout Settings
              </Text>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuRowSub}>
                Bank Account, UPI ID &amp; Private UPI QR
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={BRAND_COLORS.muted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuGroupRow}
            onPress={onOpenWallet}
            activeOpacity={0.75}
          >
            <View style={[styles.menuRowIconWrap, { backgroundColor: '#DCFCE7' }]}>
              <Ionicons name="wallet-outline" size={18} color="#15803D" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuRowTitle}>
                My Wallet &amp; Payouts
              </Text>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuRowSub}>
                Auto-credited balance, withdrawals &amp; ledger
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={BRAND_COLORS.muted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuGroupRow}
            onPress={onOpenKycVerification}
            activeOpacity={0.75}
          >
            <View style={[styles.menuRowIconWrap, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#B45309" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuRowTitle}>
                KYC &amp; Verification
              </Text>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuRowSub}>
                Aadhaar, PAN, Driving License &amp; approval status
              </Text>
            </View>
            <View
              style={{
                backgroundColor: kycBadge.bg,
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 999,
                marginRight: 4,
              }}
            >
              <Text
                maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                style={{ fontFamily: BRAND_FONTS.bold, fontSize: rf(10), color: kycBadge.fg }}
              >
                {kycBadge.label}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={BRAND_COLORS.muted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuGroupRow}
            onPress={onOpenMyDocuments}
            activeOpacity={0.75}
          >
            <View style={[styles.menuRowIconWrap, { backgroundColor: '#F5F3FF' }]}>
              <Ionicons name="folder-open-outline" size={18} color="#6D28D9" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuRowTitle}>
                My Documents
              </Text>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuRowSub}>
                Uploaded &amp; verified documents preview
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={BRAND_COLORS.muted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuGroupRow, { borderBottomWidth: 0 }]}
            onPress={onOpenNotificationsPreferences}
            activeOpacity={0.75}
          >
            <View style={[styles.menuRowIconWrap, { backgroundColor: '#E6F7F5' }]}>
              <Ionicons name="notifications-outline" size={18} color={BRAND_COLORS.tealPrimary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuRowTitle}>
                Notifications &amp; Preferences
              </Text>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuRowSub}>
                Duty shift, dispatch alerts &amp; floating bubble
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={BRAND_COLORS.muted} />
          </TouchableOpacity>
        </View>

        {/* Support & App Menu */}
        <Text style={[styles.sectionHeaderTitle, { marginTop: 18 }]}>Support &amp; Information</Text>
        <View style={styles.menuGroupCard}>
          {onOpenHelpSupport ? (
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
                  24/7 Operations &amp; Dispatch Helpline
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={BRAND_COLORS.muted} />
            </TouchableOpacity>
          ) : null}

          {onOpenTrainingSops ? (
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
          ) : null}

          {isKitModuleActive && onOpenMySupplies ? (
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
                  {kitAllocationsCount > 0
                    ? `${kitAllocationsCount} active kit batches allocated`
                    : 'Assigned test collection kits'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={BRAND_COLORS.muted} />
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={styles.menuGroupRow}
            onPress={onOpenAboutApp}
            activeOpacity={0.75}
          >
            <View style={[styles.menuRowIconWrap, { backgroundColor: '#F0FDF4' }]}>
              <Ionicons name="information-circle-outline" size={18} color="#16A34A" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuRowTitle}>
                About App
              </Text>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuRowSub}>
                App version, OTA updates &amp; assigned equipment
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={BRAND_COLORS.muted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuGroupRow}
            onPress={onOpenPrivacyPolicy}
            activeOpacity={0.75}
          >
            <View style={[styles.menuRowIconWrap, { backgroundColor: '#F1F5F9' }]}>
              <Ionicons name="lock-closed-outline" size={18} color={BRAND_COLORS.navyPrimary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuRowTitle}>
                Privacy Policy
              </Text>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuRowSub}>
                Data privacy &amp; encrypted payout security
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={BRAND_COLORS.muted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuGroupRow, { borderBottomWidth: 0 }]}
            onPress={onOpenTermsConditions}
            activeOpacity={0.75}
          >
            <View style={[styles.menuRowIconWrap, { backgroundColor: '#F1F5F9' }]}>
              <Ionicons name="document-text-outline" size={18} color={BRAND_COLORS.navyPrimary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuRowTitle}>
                Terms &amp; Conditions
              </Text>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuRowSub}>
                Platform logistics &amp; cold-chain terms
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={BRAND_COLORS.muted} />
          </TouchableOpacity>
        </View>

        {/* Emergency SOS & Logout */}
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
      </View>
    </ScrollView>
  );
}
