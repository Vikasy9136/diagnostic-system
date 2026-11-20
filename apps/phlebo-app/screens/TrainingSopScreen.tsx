import React, { useState, useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { type PlatformSopDocument } from '@diagnostic/shared';
import { BRAND_COLORS } from '../components/LabSetuBrand';
import { COLORS, FONTS } from '../styles/phleboStyles';
import { COMPACT_TEXT_SCALE, MAX_TEXT_SCALE, rf, rs } from '../utils/responsive';

export interface TrainingSopScreenProps {
  onBack: () => void;
  dynamicSops?: PlatformSopDocument[];
  onOpenSupplies?: () => void;
  onOpenHelpSupport?: () => void;
}

type SopCategory = 'all' | 'draw' | 'cold' | 'photo' | 'safety';

interface SopModule {
  id: string;
  category: SopCategory;
  number: string;
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
  icon: string;
  steps: Array<{
    title: string;
    description: string;
    warning?: string;
    tip?: string;
    tag?: string;
    tagColor?: string;
  }>;
}

const SOP_MODULES: SopModule[] = [
  {
    id: 'sop-draw',
    category: 'draw',
    number: 'SOP 01',
    title: 'CLSI Correct Order of Draw (Blood Tube Sequence)',
    subtitle: 'Standard Sequence to prevent anticoagulant additive cross-contamination',
    badge: 'MANDATORY NABL',
    badgeColor: '#DC2626',
    icon: 'test-tube',
    steps: [
      {
        title: '1. Blood Culture / Yellow Top (SPS / ACD)',
        description: 'First to draw to maintain sterile conditions. Invert gently 8 to 10 times.',
        tag: 'Invert 8-10x',
        tagColor: '#CA8A04',
      },
      {
        title: '2. Light Blue Top (Sodium Citrate 3.2%)',
        description: 'Coagulation studies (PT/INR, APTT, D-Dimer). Invert 3 to 4 times gently.',
        warning: 'CRITICAL: Fill tube strictly to indicator line (9:1 blood to anticoagulant ratio). Underfilled or overfilled tubes will be rejected by Lab.',
        tag: 'Invert 3-4x',
        tagColor: '#2563EB',
      },
      {
        title: '3. Gold / Red Top (SST Clot Activator & Gel)',
        description: 'Biochemistry, Serology, Hormones, LFT, KFT, Lipid. Invert 5 times.',
        tip: 'Allow tube to clot upright for 30 minutes before placing into chiller box. Never freeze whole blood.',
        tag: 'Invert 5x',
        tagColor: '#D97706',
      },
      {
        title: '4. Green Top (Sodium / Lithium Heparin)',
        description: 'Electrolytes, Blood Gas, Ammonia. Invert gently 8 to 10 times immediately after collection.',
        tag: 'Invert 8-10x',
        tagColor: '#16A34A',
      },
      {
        title: '5. Lavender / Purple Top (K2 / K3 EDTA)',
        description: 'Hematology, Complete Blood Count (CBC), ESR, HbA1c. Invert 8 to 10 times.',
        warning: 'Invert thoroughly but DO NOT shake vigorously. Shaking causes hemolysis (red cell rupture).',
        tag: 'Invert 8-10x',
        tagColor: '#9333EA',
      },
      {
        title: '6. Grey Top (Sodium Fluoride / Potassium Oxalate)',
        description: 'Fasting Blood Sugar (FBS), PPBS, Glucose tolerance test. Invert 8 to 10 times.',
        tip: 'Fluoride inhibits glycolysis to ensure true blood sugar value during transport.',
        tag: 'Invert 8-10x',
        tagColor: '#64748B',
      },
    ],
  },
  {
    id: 'sop-cold',
    category: 'cold',
    number: 'SOP 02',
    title: 'Cold-Chain & Chiller Box Temperature SOP',
    subtitle: 'Preserve sample viability between +2°C and +8°C at all times',
    badge: 'COLD-CHAIN COMPLIANCE',
    badgeColor: '#0284C7',
    icon: 'snowflake',
    steps: [
      {
        title: 'Chiller Box Preparation',
        description: 'Use conditioned ice gel packs (sweated gel packs at room temperature for 10 mins). Place thermal foam barrier between packs and sample tubes.',
        warning: 'Direct contact between frozen ice packs and blood tubes will freeze cells, causing hemolysis and immediate lab rejection.',
      },
      {
        title: 'Digital Thermometer Verification',
        description: 'Check external temperature display before starting your run. Temperature must be between 2°C and 8°C. Enter actual reading during sample collection in app.',
      },
      {
        title: 'Transit Time Limit',
        description: 'All temperature-sensitive blood, urine, and swab specimens must be delivered to the Reference Lab receiving desk within 3 hours of collection.',
      },
    ],
  },
  {
    id: 'sop-photo',
    category: 'photo',
    number: 'SOP 03',
    title: 'Patient Identification & Photo Evidence Protocol',
    subtitle: 'Chain of custody verification and fraud prevention standard',
    badge: 'CUSTODY EVIDENCE',
    badgeColor: '#059669',
    icon: 'camera-outline',
    steps: [
      {
        title: '2-Point Patient Verification',
        description: 'Ask patient to state full name and age. Match against Booking Slip on screen before preparing needle.',
      },
      {
        title: 'Barcode Label Alignment',
        description: 'Affix barcode label vertically along the tube length. Keep inspection window visible so lab can assess serum clarity.',
      },
      {
        title: 'Specimen Photo Evidence',
        description: 'Take clear, well-lit photo of all collected tubes together showing barcode labels and color caps clearly.',
      },
      {
        title: 'Phlebotomist Location Selfie',
        description: 'Capture phlebo selfie at the collection site as tamper-proof arrival and collection verification.',
      },
    ],
  },
  {
    id: 'sop-safety',
    category: 'safety',
    number: 'SOP 04',
    title: 'Safe Phlebotomy, Sharps & Biomedical Waste Disposal',
    subtitle: 'Zero needle-stick injury & Biohazard containment SOP',
    badge: 'BIOHAZARD SAFETY',
    badgeColor: '#EA580C',
    icon: 'shield-alert-outline',
    steps: [
      {
        title: 'Sterile Technique & PPE',
        description: 'Wear clean nitrile examination gloves for every patient. Clean puncture site with 70% alcohol swab in outward concentric circles and allow 30 seconds to air-dry.',
      },
      {
        title: 'NEVER Recap Needles',
        description: 'Recapping needles is strictly forbidden. Immediately activate the needle safety guard with one hand and drop needle directly into the puncture-proof sharps box.',
        warning: 'Needle-stick injuries must be reported to Dispatch Hotline within 15 minutes for Post-Exposure Prophylaxis (PEP) guidance.',
      },
      {
        title: 'Biomedical Waste Segregation',
        description: 'Sharps box for needles/holders. Yellow biohazard bag for blood-soaked cotton, gauze, and gloves. General trash for outer plastic wrappers.',
      },
    ],
  },
];

export function TrainingSopScreen({
  onBack,
  dynamicSops,
  onOpenSupplies,
  onOpenHelpSupport,
}: TrainingSopScreenProps) {
  const [activeTab, setActiveTab] = useState<SopCategory>('all');
  const [expandedSopId, setExpandedSopId] = useState<string | null>('sop-draw');

  const effectiveModules = useMemo(() => {
    if (dynamicSops && dynamicSops.length > 0) {
      const activeForPhlebo = dynamicSops.filter(
        (s) =>
          s.isActive !== false &&
          (!s.targetRoles || s.targetRoles.includes('ALL') || s.targetRoles.includes('PHLEBOTOMIST'))
      );
      if (activeForPhlebo.length > 0) {
        return activeForPhlebo.map((s) => ({
          id: s.id,
          category: (s.category as SopCategory) || 'general',
          number: s.number,
          title: s.title,
          subtitle: s.subtitle,
          badge: s.badge || 'SOP',
          badgeColor: s.badgeColor || '#0D9488',
          icon: s.icon || 'test-tube',
          steps: s.steps || [],
        }));
      }
    }
    return SOP_MODULES;
  }, [dynamicSops]);

  const filteredModules = effectiveModules.filter((m) => {
    if (activeTab === 'all') return true;
    return m.category === activeTab;
  });

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
            Training &amp; SOP Guidelines
          </Text>
          <Text
            maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
            style={screenStyles.headerSub}
            numberOfLines={1}
          >
            Clinical Diagnostic Safety • NABL &amp; CLSI Standards
          </Text>
        </View>
      </View>

      <ScrollView
        style={screenStyles.content}
        contentContainerStyle={{ paddingBottom: rs(80) }}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Hero Pill Banner */}
        <View style={screenStyles.heroBanner}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="ribbon-outline" size={20} color="#0D9488" />
            <Text style={screenStyles.heroTitle}>Standard Operating Procedures (SOP)</Text>
          </View>
          <Text style={screenStyles.heroSub}>
            Follow these clinical protocols on every collection run to ensure 100% sample integrity and protect patient diagnostic accuracy.
          </Text>
        </View>

        {/* Filter Pills */}
        <View style={screenStyles.filterRow}>
          {[
            { key: 'all', label: 'All SOPs' },
            { key: 'draw', label: 'Order of Draw 🧪' },
            { key: 'cold', label: 'Cold Chain ❄️' },
            { key: 'photo', label: 'Evidence 📸' },
            { key: 'safety', label: 'Sharps & PPE ☣️' },
          ].map((item) => {
            const isActive = activeTab === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[screenStyles.filterPill, isActive && screenStyles.filterPillActive]}
                onPress={() => setActiveTab(item.key as SopCategory)}
              >
                <Text style={[screenStyles.filterPillText, isActive && screenStyles.filterPillTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* SOP Modules List */}
        <View style={{ gap: rs(12) }}>
          {filteredModules.map((sop) => {
            const isExpanded = expandedSopId === sop.id;

            return (
              <View key={sop.id} style={screenStyles.sopCard}>
                {/* Module Header Bar */}
                <TouchableOpacity
                  style={screenStyles.sopCardHeader}
                  activeOpacity={0.8}
                  onPress={() => setExpandedSopId(isExpanded ? null : sop.id)}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={screenStyles.sopNumber}>{sop.number}</Text>
                      <View style={[screenStyles.badgePill, { backgroundColor: `${sop.badgeColor}15` }]}>
                        <Text style={[screenStyles.badgeText, { color: sop.badgeColor }]}>{sop.badge}</Text>
                      </View>
                    </View>
                    <Text style={screenStyles.sopTitle}>{sop.title}</Text>
                    <Text style={screenStyles.sopSub}>{sop.subtitle}</Text>
                  </View>

                  <View style={{ paddingLeft: 8 }}>
                    <Ionicons
                      name={isExpanded ? 'chevron-up-circle' : 'chevron-down-circle'}
                      size={24}
                      color={isExpanded ? BRAND_COLORS.tealPrimary : '#94A3B8'}
                    />
                  </View>
                </TouchableOpacity>

                {/* Expanded Steps */}
                {isExpanded && (
                  <View style={screenStyles.stepsWrap}>
                    {sop.steps.map((step, idx) => (
                      <View key={idx} style={screenStyles.stepItem}>
                        <View style={screenStyles.stepHeader}>
                          <Text style={screenStyles.stepTitle}>{step.title}</Text>
                          {step.tag && (
                            <View style={[screenStyles.tagBadge, { backgroundColor: `${step.tagColor || '#0D9488'}15` }]}>
                              <Text style={[screenStyles.tagText, { color: step.tagColor || '#0D9488' }]}>{step.tag}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={screenStyles.stepDesc}>{step.description}</Text>

                        {step.warning && (
                          <View style={screenStyles.warningBox}>
                            <Ionicons name="warning" size={14} color="#DC2626" style={{ marginTop: 1 }} />
                            <Text style={screenStyles.warningText}>{step.warning}</Text>
                          </View>
                        )}

                        {step.tip && (
                          <View style={screenStyles.tipBox}>
                            <Ionicons name="bulb" size={14} color="#0D9488" style={{ marginTop: 1 }} />
                            <Text style={screenStyles.tipText}>{step.tip}</Text>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Quick Links Footer */}
        <View style={screenStyles.footerLinks}>
          {onOpenSupplies && (
            <TouchableOpacity
              style={screenStyles.footerBtn}
              onPress={onOpenSupplies}
            >
              <Ionicons name="briefcase-outline" size={16} color="#0D9488" />
              <Text style={screenStyles.footerBtnText}>Check Collection Kits &amp; Supplies</Text>
            </TouchableOpacity>
          )}

          {onOpenHelpSupport && (
            <TouchableOpacity
              style={screenStyles.footerBtn}
              onPress={onOpenHelpSupport}
            >
              <Ionicons name="headset-outline" size={16} color="#0D9488" />
              <Text style={screenStyles.footerBtnText}>Contact Dispatch Support</Text>
            </TouchableOpacity>
          )}
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
  heroBanner: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    borderRadius: rs(12),
    padding: rs(12),
    marginBottom: rs(12),
  },
  heroTitle: {
    fontFamily: FONTS.bold,
    fontSize: rf(13),
    color: '#0F766E',
    fontWeight: '800',
  },
  heroSub: {
    fontFamily: FONTS.regular,
    fontSize: rf(11),
    color: '#334155',
    marginTop: 4,
    lineHeight: 16,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rs(6),
    marginBottom: rs(14),
  },
  filterPill: {
    paddingHorizontal: rs(10),
    paddingVertical: rs(6),
    borderRadius: rs(8),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterPillActive: {
    backgroundColor: BRAND_COLORS.tealPrimary,
    borderColor: BRAND_COLORS.tealPrimary,
  },
  filterPillText: {
    fontFamily: FONTS.medium,
    fontSize: rf(11),
    color: '#64748B',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  sopCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: rs(12),
    overflow: 'hidden',
  },
  sopCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: rs(14),
  },
  sopNumber: {
    fontFamily: FONTS.bold,
    fontSize: rf(10),
    color: '#64748B',
    fontWeight: '800',
  },
  badgePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontFamily: FONTS.bold,
    fontSize: 9,
    fontWeight: '800',
  },
  sopTitle: {
    fontFamily: FONTS.bold,
    fontSize: rf(13),
    color: '#0F172A',
    fontWeight: '800',
    marginTop: 4,
  },
  sopSub: {
    fontFamily: FONTS.regular,
    fontSize: rf(11),
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  stepsWrap: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    padding: rs(14),
    backgroundColor: '#FAFAFA',
    gap: rs(12),
  },
  stepItem: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: rs(10),
    padding: rs(10),
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  stepTitle: {
    fontFamily: FONTS.bold,
    fontSize: rf(12),
    color: '#0F172A',
    fontWeight: '700',
    flex: 1,
  },
  tagBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 9,
    fontFamily: FONTS.bold,
    fontWeight: '800',
  },
  stepDesc: {
    fontFamily: FONTS.regular,
    fontSize: rf(11),
    color: '#475569',
    lineHeight: 16,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: rs(6),
    padding: rs(8),
    marginTop: rs(6),
  },
  warningText: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: rf(10),
    color: '#991B1B',
    lineHeight: 14,
  },
  tipBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    borderRadius: rs(6),
    padding: rs(8),
    marginTop: rs(6),
  },
  tipText: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: rf(10),
    color: '#0F766E',
    lineHeight: 14,
  },
  footerLinks: {
    gap: rs(8),
    marginTop: rs(16),
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: rs(10),
    paddingVertical: rs(10),
  },
  footerBtnText: {
    fontFamily: FONTS.bold,
    fontSize: rf(11),
    color: '#0F766E',
    fontWeight: '700',
  },
});
