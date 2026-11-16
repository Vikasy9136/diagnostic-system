import React, { useState } from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { DEFAULT_SUPPORT_CONTACTS, type SupportContactsConfig } from '@diagnostic/shared';
import { BRAND_COLORS } from '../components/LabSetuBrand';
import { COLORS, FONTS } from '../styles/phleboStyles';
import { COMPACT_TEXT_SCALE, MAX_TEXT_SCALE, rf, rs } from '../utils/responsive';

export interface HelpSupportScreenProps {
  phleboName: string;
  courierId: string;
  phleboPhone?: string;
  phleboEmail?: string;
  activeZoneName?: string;
  supportContacts?: SupportContactsConfig;
  onBack: () => void;
  onOpenTrainingSops?: () => void;
}

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

const FAQ_LIST: FaqItem[] = [
  {
    id: 'faq-1',
    category: 'Dispatch',
    question: 'What if patient is unreachable or address is incorrect?',
    answer:
      'Attempt at least 2 phone calls with a 3-minute gap. If still unreachable, tap "Report Issue" in order details and select "Customer Unreachable". Central Dispatch will verify the alternative contact number or re-route your delivery.',
  },
  {
    id: 'faq-2',
    category: 'Cold-Chain',
    question: 'What if sample tube breaks or chiller temperature rises above 8°C?',
    answer:
      'Immediately pull the emergency SOS banner above to alert Dispatch. Never deliver a hemolyzed, leaked, or warm sample to the Reference Lab. Central Supply will arrange an immediate recollection kit for the patient.',
  },
  {
    id: 'faq-3',
    category: 'Payments',
    question: 'How do Cash Collections and Platform Fee adjustments work?',
    answer:
      'When you collect cash from a collection center or patient, the platform fee portion remains due for 15 days. It is automatically deducted and adjusted against your upcoming courier delivery payouts. Detailed deduction breakdown is printed on your digital receipt.',
  },
  {
    id: 'faq-4',
    category: 'Payouts',
    question: 'When will my 30-minute instant courier payout be released?',
    answer:
      'As soon as you enter the 5-digit Handover OTP at the Reference Lab desk and the lab accepts the batch, the 30-minute instant payout countdown activates. Funds are dispatched directly to your registered UPI ID or Bank account.',
  },
  {
    id: 'faq-5',
    category: 'Supplies',
    question: 'How do I replenish my collection tubes and bags?',
    answer:
      'Navigate to "My Collection Kits & Supplies" screen and tap "Request Kit Restock". Central Supply prepares sealed kits (1 Collection = 1 Kit) and dispatches them during your morning shift check-in.',
  },
];

export function HelpSupportScreen({
  phleboName,
  courierId,
  phleboPhone,
  phleboEmail,
  activeZoneName,
  supportContacts,
  onBack,
  onOpenTrainingSops,
}: HelpSupportScreenProps) {
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>('faq-1');

  const contacts = supportContacts || DEFAULT_SUPPORT_CONTACTS;
  const emergencyPhone = contacts.emergencyPhone || '+9118008897388';
  const displayEmergencyPhone = contacts.displayEmergencyPhone || '1800-889-SETU (1800-889-7388)';
  const dispatchDirectMobile = contacts.dispatchMobile || '+919820012345';
  const displayDirectMobile = contacts.displayDirectMobile || '+91 98200 12345';
  const supportEmail = contacts.supportEmail || 'support@labsetu.com';
  const operatingHours = contacts.operatingHours || '6:00 AM – 11:00 PM (All 7 Days)';
  const dispatchSla = contacts.dispatchSla || '< 5 Mins Immediate Dispatch Response';

  const cleanWaNumber = dispatchDirectMobile.replace(/[^\d]/g, '');
  const whatsappUrl = `https://wa.me/${cleanWaNumber}?text=${encodeURIComponent(
    `Hello LabSetu Dispatch Desk, I am Phlebotomist ${phleboName} (${courierId}). I need immediate assistance on my active collection run.`
  )}`;

  const handleCall = (number: string) => {
    Linking.openURL(`tel:${number}`).catch(() => {});
  };

  const handleWhatsApp = () => {
    Linking.openURL(whatsappUrl).catch(() => {});
  };

  const handleEmail = () => {
    Linking.openURL(
      `mailto:${supportEmail}?subject=${encodeURIComponent(
        `Field Support Request • ${courierId} • ${phleboName}`
      )}`
    ).catch(() => {});
  };

  return (
    <View style={screenStyles.container}>
      {/* Top Header */}
      <View style={screenStyles.header}>
        <TouchableOpacity
          style={screenStyles.backBtn}
          onPress={onBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
            style={screenStyles.headerTitle}
            numberOfLines={1}
          >
            Help &amp; Dispatch Support
          </Text>
          <Text
            maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
            style={screenStyles.headerSub}
            numberOfLines={1}
          >
            24/7 Field Operations Desk • Dedicated Rider Helpline
          </Text>
        </View>
      </View>

      <ScrollView
        style={screenStyles.content}
        contentContainerStyle={{ paddingBottom: rs(80) }}
        showsVerticalScrollIndicator={false}
      >
        {/* Urgent Emergency SOS Hotline Card */}
        <View style={screenStyles.sosCard}>
          <View style={screenStyles.sosHeader}>
            <View style={screenStyles.sosIconWrap}>
              <Ionicons name="alert" size={22} color="#DC2626" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={screenStyles.sosTitle}>24/7 Emergency Dispatch Helpline</Text>
              <Text style={screenStyles.sosSub}>
                For urgent route issues, cold-chain emergencies, accidents, or sample damage
              </Text>
            </View>
          </View>

          <View style={screenStyles.sosActionRow}>
            <TouchableOpacity
              style={screenStyles.callSosBtn}
              onPress={() => handleCall(emergencyPhone)}
              activeOpacity={0.85}
            >
              <Ionicons name="call" size={18} color="#FFFFFF" />
              <Text style={screenStyles.callSosBtnText}>Call Toll-Free: {displayEmergencyPhone}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Contact Grid */}
        <View style={screenStyles.contactGrid}>
          {/* WhatsApp Direct */}
          <TouchableOpacity
            style={[screenStyles.contactCard, { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' }]}
            onPress={handleWhatsApp}
            activeOpacity={0.8}
          >
            <View style={[screenStyles.contactIcon, { backgroundColor: '#22C55E' }]}>
              <Ionicons name="logo-whatsapp" size={22} color="#FFFFFF" />
            </View>
            <Text style={screenStyles.contactCardTitle}>WhatsApp Dispatch</Text>
            <Text style={screenStyles.contactCardSub}>{displayDirectMobile}</Text>
            <Text style={[screenStyles.contactActionText, { color: '#15803D' }]}>Chat Now &rarr;</Text>
          </TouchableOpacity>

          {/* Direct Phone Call */}
          <TouchableOpacity
            style={[screenStyles.contactCard, { borderColor: '#93C5FD', backgroundColor: '#EFF6FF' }]}
            onPress={() => handleCall(dispatchDirectMobile)}
            activeOpacity={0.8}
          >
            <View style={[screenStyles.contactIcon, { backgroundColor: '#3B82F6' }]}>
              <Ionicons name="headset" size={22} color="#FFFFFF" />
            </View>
            <Text style={screenStyles.contactCardTitle}>Direct Operations</Text>
            <Text style={screenStyles.contactCardSub}>{displayDirectMobile}</Text>
            <Text style={[screenStyles.contactActionText, { color: '#1D4ED8' }]}>Call Desk &rarr;</Text>
          </TouchableOpacity>

          {/* Email Support */}
          <TouchableOpacity
            style={[screenStyles.contactCard, { borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' }]}
            onPress={handleEmail}
            activeOpacity={0.8}
          >
            <View style={[screenStyles.contactIcon, { backgroundColor: BRAND_COLORS.navyPrimary }]}>
              <Ionicons name="mail" size={22} color="#FFFFFF" />
            </View>
            <Text style={screenStyles.contactCardTitle}>Email Support</Text>
            <Text style={screenStyles.contactCardSub}>{supportEmail}</Text>
            <Text style={[screenStyles.contactActionText, { color: BRAND_COLORS.navyPrimary }]}>Send Email &rarr;</Text>
          </TouchableOpacity>

          {/* Training & SOP Link */}
          {onOpenTrainingSops && (
            <TouchableOpacity
              style={[screenStyles.contactCard, { borderColor: '#DDD6FE', backgroundColor: '#FAF5FF' }]}
              onPress={onOpenTrainingSops}
              activeOpacity={0.8}
            >
              <View style={[screenStyles.contactIcon, { backgroundColor: '#8B5CF6' }]}>
                <Ionicons name="book" size={22} color="#FFFFFF" />
              </View>
              <Text style={screenStyles.contactCardTitle}>Training &amp; SOPs</Text>
              <Text style={screenStyles.contactCardSub}>Tube Draw &amp; Protocol</Text>
              <Text style={[screenStyles.contactActionText, { color: '#6D28D9' }]}>View Guide &rarr;</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Operating Hours Card */}
        <View style={screenStyles.hoursCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Ionicons name="time-outline" size={18} color="#0D9488" />
            <Text style={screenStyles.hoursTitle}>Operating Hours &amp; Response SLA</Text>
          </View>
          <View style={screenStyles.hoursRow}>
            <Text style={screenStyles.hoursLabel}>Live Operations Hours:</Text>
            <Text style={screenStyles.hoursValue}>{operatingHours}</Text>
          </View>
          <View style={screenStyles.hoursRow}>
            <Text style={screenStyles.hoursLabel}>Emergency Dispatch SLA:</Text>
            <Text style={[screenStyles.hoursValue, { color: '#059669', fontWeight: '800' }]}>{dispatchSla}</Text>
          </View>
        </View>

        {/* Frequently Asked Questions */}
        <View style={screenStyles.faqSection}>
          <Text style={screenStyles.faqSectionTitle}>❓ Frequently Asked Questions</Text>
          <Text style={screenStyles.faqSectionSub}>Quick answers to standard field collection scenarios</Text>

          <View style={{ gap: rs(8), marginTop: rs(10) }}>
            {FAQ_LIST.map((faq) => {
              const isExpanded = expandedFaqId === faq.id;
              return (
                <View key={faq.id} style={screenStyles.faqCard}>
                  <TouchableOpacity
                    style={screenStyles.faqHeader}
                    activeOpacity={0.8}
                    onPress={() => setExpandedFaqId(isExpanded ? null : faq.id)}
                  >
                    <View style={screenStyles.faqCategoryBadge}>
                      <Text style={screenStyles.faqCategoryText}>{faq.category}</Text>
                    </View>
                    <Text style={screenStyles.faqQuestion}>{faq.question}</Text>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color="#64748B"
                    />
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={screenStyles.faqAnswerWrap}>
                      <Text style={screenStyles.faqAnswerText}>{faq.answer}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* Rider Profile Telemetry Stamp */}
        <View style={screenStyles.telemetryStamp}>
          <Text style={screenStyles.telemetryTitle}>Verified Rider Profile &amp; Dispatch ID</Text>
          <View style={screenStyles.telemetryRow}>
            <Text style={screenStyles.telemetryLabel}>Phlebotomist Name:</Text>
            <Text style={screenStyles.telemetryVal}>{phleboName}</Text>
          </View>
          <View style={screenStyles.telemetryRow}>
            <Text style={screenStyles.telemetryLabel}>Courier Serial ID:</Text>
            <Text style={screenStyles.telemetryVal}>{courierId}</Text>
          </View>
          {phleboPhone ? (
            <View style={screenStyles.telemetryRow}>
              <Text style={screenStyles.telemetryLabel}>Registered Phone:</Text>
              <Text style={screenStyles.telemetryVal}>{phleboPhone}</Text>
            </View>
          ) : null}
          {activeZoneName ? (
            <View style={screenStyles.telemetryRow}>
              <Text style={screenStyles.telemetryLabel}>Assigned Service Zone:</Text>
              <Text style={screenStyles.telemetryVal}>{activeZoneName}</Text>
            </View>
          ) : null}
          <View style={screenStyles.telemetryRow}>
            <Text style={screenStyles.telemetryLabel}>App Platform Build:</Text>
            <Text style={screenStyles.telemetryVal}>LabSetu Enterprise v2.4.0</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const screenStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    backgroundColor: BRAND_COLORS.navyPrimary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: rs(16),
    paddingTop: rs(14),
    paddingBottom: rs(16),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backBtn: {
    padding: rs(4),
    marginRight: rs(10),
  },
  headerTitle: {
    fontFamily: FONTS.bold,
    fontSize: rf(17),
    color: '#FFFFFF',
    fontWeight: '800',
  },
  headerSub: {
    fontFamily: FONTS.regular,
    fontSize: rf(11),
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  content: {
    flex: 1,
    paddingHorizontal: rs(14),
    paddingTop: rs(12),
  },
  sosCard: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FECACA',
    borderRadius: rs(14),
    padding: rs(14),
    marginBottom: rs(14),
  },
  sosHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: rs(12),
  },
  sosIconWrap: {
    backgroundColor: '#FEE2E2',
    width: rs(36),
    height: rs(36),
    borderRadius: rs(18),
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosTitle: {
    fontFamily: FONTS.bold,
    fontSize: rf(13),
    color: '#991B1B',
    fontWeight: '800',
  },
  sosSub: {
    fontFamily: FONTS.regular,
    fontSize: rf(11),
    color: '#7F1D1D',
    marginTop: 2,
    lineHeight: 16,
  },
  sosActionRow: {
    marginTop: rs(4),
  },
  callSosBtn: {
    backgroundColor: '#DC2626',
    borderRadius: rs(10),
    paddingVertical: rs(10),
    paddingHorizontal: rs(14),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#DC2626',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  callSosBtnText: {
    fontFamily: FONTS.bold,
    fontSize: rf(12),
    color: '#FFFFFF',
    fontWeight: '800',
  },
  contactGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rs(8),
    marginBottom: rs(14),
  },
  contactCard: {
    width: '48.5%',
    borderWidth: 1,
    borderRadius: rs(12),
    padding: rs(12),
  },
  contactIcon: {
    width: rs(36),
    height: rs(36),
    borderRadius: rs(10),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: rs(8),
  },
  contactCardTitle: {
    fontFamily: FONTS.bold,
    fontSize: rf(12),
    fontWeight: '700',
    color: '#0F172A',
  },
  contactCardSub: {
    fontFamily: FONTS.regular,
    fontSize: rf(10),
    color: '#64748B',
    marginTop: 2,
  },
  contactActionText: {
    fontFamily: FONTS.bold,
    fontSize: rf(10),
    fontWeight: '700',
    marginTop: rs(8),
  },
  hoursCard: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    borderRadius: rs(12),
    padding: rs(12),
    marginBottom: rs(14),
  },
  hoursTitle: {
    fontFamily: FONTS.bold,
    fontSize: rf(12),
    fontWeight: '700',
    color: '#0F766E',
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  hoursLabel: {
    fontFamily: FONTS.regular,
    fontSize: rf(10),
    color: '#475569',
  },
  hoursValue: {
    fontFamily: FONTS.bold,
    fontSize: rf(10),
    color: '#0F172A',
  },
  faqSection: {
    marginBottom: rs(14),
  },
  faqSectionTitle: {
    fontFamily: FONTS.bold,
    fontSize: rf(13),
    fontWeight: '800',
    color: '#0F172A',
  },
  faqSectionSub: {
    fontFamily: FONTS.regular,
    fontSize: rf(10),
    color: '#64748B',
    marginTop: 2,
  },
  faqCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: rs(10),
    overflow: 'hidden',
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: rs(12),
    gap: 8,
  },
  faqCategoryBadge: {
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  faqCategoryText: {
    fontSize: 9,
    fontFamily: FONTS.bold,
    color: '#475569',
    textTransform: 'uppercase',
  },
  faqQuestion: {
    flex: 1,
    fontFamily: FONTS.bold,
    fontSize: rf(11),
    color: '#0F172A',
    fontWeight: '700',
  },
  faqAnswerWrap: {
    paddingHorizontal: rs(12),
    paddingBottom: rs(12),
    paddingTop: rs(2),
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  faqAnswerText: {
    fontFamily: FONTS.regular,
    fontSize: rf(11),
    color: '#475569',
    lineHeight: 18,
  },
  telemetryStamp: {
    backgroundColor: '#F1F5F9',
    borderRadius: rs(10),
    padding: rs(12),
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  telemetryTitle: {
    fontFamily: FONTS.bold,
    fontSize: rf(10),
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  telemetryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  telemetryLabel: {
    fontFamily: FONTS.regular,
    fontSize: rf(10),
    color: '#64748B',
  },
  telemetryVal: {
    fontFamily: FONTS.bold,
    fontSize: rf(10),
    color: '#1E293B',
  },
});
