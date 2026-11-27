import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { type PhlebotomistProfile } from '@diagnostic/shared';
import { BRAND_COLORS, BRAND_FONTS } from '../components/LabSetuBrand';
import { ProfileSubScreenHeader } from '../components/ProfileSubScreenHeader';
import { CURRENT_APP_VERSION } from '../services/appUpdateService';
import { COLORS, FONTS, styles } from '../styles/phleboStyles';
import { rf, rs } from '../utils/responsive';

export interface AboutAppScreenProps {
  displayCourierId: string;
  myPhleboProfile: PhlebotomistProfile | null;
  activeZoneName?: string;
  onBack: () => void;
  onCheckForUpdates: () => void;
  onOpenPrivacyPolicy: () => void;
  onOpenTerms: () => void;
}

export function AboutAppScreen({
  displayCourierId,
  myPhleboProfile,
  activeZoneName,
  onBack,
  onCheckForUpdates,
  onOpenPrivacyPolicy,
  onOpenTerms,
}: AboutAppScreenProps) {
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ProfileSubScreenHeader
        title="About App"
        subtitle="Version, cold-chain equipment & updates"
        onBack={onBack}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: rs(16), paddingBottom: rs(90) }}
        showsVerticalScrollIndicator={false}
      >
        {/* App Identity Card */}
        <View style={[styles.equipmentCard, { alignItems: 'center', marginBottom: 14 }]}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              backgroundColor: BRAND_COLORS.navyPrimary,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 10,
            }}
          >
            <Ionicons name="flask" size={28} color="#2DD4BF" />
          </View>
          <Text style={{ fontFamily: BRAND_FONTS.extraBold, fontSize: rf(17), color: '#0F172A' }}>
            LabSetu Phlebo App
          </Text>
          <Text style={{ fontFamily: FONTS.regular, fontSize: rf(12), color: '#64748B', marginTop: 2 }}>
            Version {CURRENT_APP_VERSION} • Live Field Operations Network
          </Text>
          <TouchableOpacity
            style={{
              marginTop: 14,
              backgroundColor: '#DCFCE7',
              paddingHorizontal: 16,
              paddingVertical: 9,
              borderRadius: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
            onPress={onCheckForUpdates}
          >
            <Ionicons name="cloud-download-outline" size={17} color="#15803D" />
            <Text style={{ fontFamily: BRAND_FONTS.bold, fontSize: rf(12.5), color: '#15803D' }}>
              Check for OTA Updates
            </Text>
          </TouchableOpacity>
        </View>

        {/* Assigned Equipment & Zone */}
        <Text style={styles.sectionHeaderTitle}>Assigned Equipment &amp; Zone</Text>
        <View style={[styles.equipmentCard, { marginBottom: 14 }]}>
          <View style={styles.equipmentRow}>
            <View style={[styles.menuRowIconWrap, { backgroundColor: '#E6F7F5' }]}>
              <Ionicons name="snow-outline" size={19} color={BRAND_COLORS.tealPrimary} />
            </View>
            <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
              <Text style={styles.equipmentTitle}>
                {myPhleboProfile?.coolerBoxId
                  ? `Smart Chiller Box #${myPhleboProfile.coolerBoxId}`
                  : 'Cooler Box (Cold-Chain Active)'}
              </Text>
              <Text style={styles.equipmentSub}>
                Temp: {myPhleboProfile?.chillerTempCelsius ?? 4.0}°C (Target 2°C–8°C) • Battery: {myPhleboProfile?.batteryPct ?? 95}%
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
              <Ionicons name="id-card-outline" size={19} color={BRAND_COLORS.navyPrimary} />
            </View>
            <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
              <Text style={styles.equipmentTitle}>Courier ID: {displayCourierId}</Text>
              <Text style={styles.equipmentSub}>
                {activeZoneName ? `Zone: ${activeZoneName}` : 'LabSetu B2B Diagnostic Logistics'}
              </Text>
            </View>
          </View>
        </View>

        {/* Quick Legal Links */}
        <Text style={styles.sectionHeaderTitle}>Legal &amp; Compliance</Text>
        <View style={styles.menuGroupCard}>
          <TouchableOpacity style={styles.menuGroupRow} onPress={onOpenPrivacyPolicy}>
            <View style={[styles.menuRowIconWrap, { backgroundColor: '#F1F5F9' }]}>
              <Ionicons name="shield-outline" size={18} color={BRAND_COLORS.navyPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuRowTitle}>Privacy Policy</Text>
              <Text style={styles.menuRowSub}>Data protection &amp; specimen telemetry rules</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={BRAND_COLORS.muted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuGroupRow, { borderBottomWidth: 0 }]}
            onPress={onOpenTerms}
          >
            <View style={[styles.menuRowIconWrap, { backgroundColor: '#F1F5F9' }]}>
              <Ionicons name="document-text-outline" size={18} color={BRAND_COLORS.navyPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuRowTitle}>Terms &amp; Conditions</Text>
              <Text style={styles.menuRowSub}>Field service terms &amp; payout compliance</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={BRAND_COLORS.muted} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
