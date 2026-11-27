import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { BRAND_FONTS } from '../components/LabSetuBrand';
import { ProfileSubScreenHeader } from '../components/ProfileSubScreenHeader';
import { COLORS, FONTS, styles } from '../styles/phleboStyles';
import { rf, rs } from '../utils/responsive';

export type LegalDocumentType = 'PRIVACY_POLICY' | 'TERMS_CONDITIONS';

export interface LegalDocumentScreenProps {
  documentType: LegalDocumentType;
  onBack: () => void;
}

const PRIVACY_SECTIONS = [
  {
    title: '1. Overview & Data Controller',
    body: 'LabSetu Diagnostics Network collects and processes only the field identity, payout, and cold-chain telemetry required to verify phlebotomist onboarding, route sample pickups, and release payouts accurately.',
  },
  {
    title: '2. Information We Collect',
    body: 'We store your verified phone number, email address, profile photo, KYC documents (Aadhaar/PAN/Driving License), encrypted bank/UPI payout credentials, live shift GPS coordinates during active pickups, and specimen handover timestamps.',
  },
  {
    title: '3. How Your Data Is Protected',
    body: 'Bank account numbers, UPI IDs, and private QR codes are encrypted with AES-256-GCM on our Cloud Functions backend. KYC documents and sample custody records are stored in private Firebase Storage with role-based access rules.',
  },
  {
    title: '4. Location & Background Services',
    body: 'GPS tracking is used strictly while you are On Duty or executing an active pickup/drop route so collection centres and reference labs can verify specimen chain-of-custody.',
  },
  {
    title: '5. Contact & Data Requests',
    body: 'For account corrections, credential updates, or data privacy requests, contact LabSetu Support at support@labsetu.com.',
  },
];

const TERMS_SECTIONS = [
  {
    title: '1. Acceptance of Terms',
    body: 'By signing in and using the LabSetu Phlebo Mobile Application, you agree to comply with LabSetu Diagnostic Logistics operational, cold-chain, and verification standards.',
  },
  {
    title: '2. Sample Handling & Cold-Chain Compliance',
    body: 'All collected biological specimens must be barcoded, photographed if required, and transported inside an insulated chiller box maintained between 2°C and 8°C until handover OTP verification at the destination Reference Lab.',
  },
  {
    title: '3. Handover OTP & Payouts',
    body: 'Visit-based payouts are calculated according to the active platform fee configuration and released to your verified Bank Account or UPI ID after valid Handover OTP confirmation.',
  },
  {
    title: '4. KYC & Account Integrity',
    body: 'You must maintain accurate personal details, valid driving credentials, and genuine KYC documents. Fraudulent documents or tampered custody records may result in account suspension.',
  },
  {
    title: '5. Governing Law',
    body: 'These Terms & Conditions are governed by the laws of India. Any disputes are subject to the jurisdiction of competent courts in New Delhi, India.',
  },
];

export function LegalDocumentScreen({ documentType, onBack }: LegalDocumentScreenProps) {
  const isPrivacy = documentType === 'PRIVACY_POLICY';
  const sections = isPrivacy ? PRIVACY_SECTIONS : TERMS_SECTIONS;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ProfileSubScreenHeader
        title={isPrivacy ? 'Privacy Policy' : 'Terms & Conditions'}
        subtitle="LabSetu Diagnostics Network"
        onBack={onBack}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: rs(16), paddingBottom: rs(90) }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: 12 }}>
          {sections.map((sec) => (
            <View key={sec.title} style={styles.equipmentCard}>
              <Text
                style={{
                  fontFamily: BRAND_FONTS.bold,
                  fontSize: rf(13.5),
                  color: '#0F172A',
                  marginBottom: 6,
                }}
              >
                {sec.title}
              </Text>
              <Text
                style={{
                  fontFamily: FONTS.regular,
                  fontSize: rf(12.5),
                  color: '#475569',
                  lineHeight: 19,
                }}
              >
                {sec.body}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
