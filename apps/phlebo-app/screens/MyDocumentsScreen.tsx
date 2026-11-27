import React, { useMemo, useState } from 'react';
import {
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { type PhlebotomistProfile } from '@diagnostic/shared';
import { BRAND_COLORS, BRAND_FONTS } from '../components/LabSetuBrand';
import { ProfileSubScreenHeader } from '../components/ProfileSubScreenHeader';
import { COLORS, FONTS, styles } from '../styles/phleboStyles';
import { rf, rs } from '../utils/responsive';

export interface MyDocumentsScreenProps {
  myPhleboProfile: PhlebotomistProfile | null;
  onBack: () => void;
  onOpenKycVerification: () => void;
}

interface DisplayDocItem {
  id: string;
  title: string;
  category: string;
  url: string;
  status: string;
  locked: boolean;
  uploadedAt?: string;
}

export function MyDocumentsScreen({
  myPhleboProfile,
  onBack,
  onOpenKycVerification,
}: MyDocumentsScreenProps) {
  const [previewDoc, setPreviewDoc] = useState<DisplayDocItem | null>(null);

  const docItems = useMemo<DisplayDocItem[]>(() => {
    const items: DisplayDocItem[] = [];
    const verified = Boolean(myPhleboProfile?.verified);

    if (myPhleboProfile?.aadhaarDocumentUrl) {
      items.push({
        id: 'aadhaar',
        title: 'Aadhaar Card',
        category: 'Identity Proof',
        url: myPhleboProfile.aadhaarDocumentUrl,
        status: verified ? 'VERIFIED' : 'PENDING_REVIEW',
        locked: verified,
      });
    }
    if (myPhleboProfile?.panDocumentUrl) {
      items.push({
        id: 'pan',
        title: 'PAN Card',
        category: 'Tax / Payout Compliance',
        url: myPhleboProfile.panDocumentUrl,
        status: verified ? 'VERIFIED' : 'PENDING_REVIEW',
        locked: verified,
      });
    }
    if (myPhleboProfile?.dlDocumentUrl) {
      items.push({
        id: 'dl',
        title: 'Driving License',
        category: 'Field Transport Permit',
        url: myPhleboProfile.dlDocumentUrl,
        status: verified ? 'VERIFIED' : 'PENDING_REVIEW',
        locked: verified,
      });
    }
    if (myPhleboProfile?.rcDocumentUrl) {
      items.push({
        id: 'rc',
        title: 'Vehicle RC',
        category: 'Vehicle Registration',
        url: myPhleboProfile.rcDocumentUrl,
        status: verified ? 'VERIFIED' : 'PENDING_REVIEW',
        locked: verified,
      });
    }
    if (myPhleboProfile?.signedAgreementUrl) {
      items.push({
        id: 'agreement',
        title: 'Signed Phlebo Service Agreement',
        category: 'Admin-Verified Contract (Read-Only)',
        url: myPhleboProfile.signedAgreementUrl,
        status: 'VERIFIED',
        locked: true,
        uploadedAt: myPhleboProfile.signedAt,
      });
    }
    if (myPhleboProfile?.livePhotoUrl) {
      items.push({
        id: 'photo',
        title: 'Profile Verification Photo',
        category: 'Biometric / Avatar',
        url: myPhleboProfile.livePhotoUrl,
        status: verified ? 'VERIFIED' : 'ACTIVE',
        locked: false,
      });
    }
    if (Array.isArray(myPhleboProfile?.documents)) {
      myPhleboProfile.documents.forEach((doc, idx) => {
        if (!doc?.url) return;
        const already = items.some((i) => i.url === doc.url);
        if (!already) {
          items.push({
            id: doc.id || `doc-${idx}`,
            title: doc.title || doc.type || 'Uploaded Document',
            category: doc.type || 'Supporting Record',
            url: doc.url,
            status: doc.verified ? 'VERIFIED' : 'PENDING_REVIEW',
            locked: Boolean(doc.verified),
            uploadedAt: doc.uploadedAt,
          });
        }
      });
    }
    return items;
  }, [myPhleboProfile]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ProfileSubScreenHeader
        title="My Documents"
        subtitle="Verified & uploaded records with access control"
        onBack={onBack}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: rs(16), paddingBottom: rs(90) }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.equipmentCard,
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              backgroundColor: '#EFF6FF',
              borderColor: '#BFDBFE',
              marginBottom: 14,
            },
          ]}
        >
          <Ionicons name="lock-closed" size={18} color="#1D4ED8" />
          <Text style={{ flex: 1, fontFamily: BRAND_FONTS.medium, fontSize: rf(12), color: '#1E3A8A' }}>
            Verified documents and signed agreements are locked against tampering. To upload or re-upload pending KYC files, use KYC &amp; Verification.
          </Text>
        </View>

        {docItems.length === 0 ? (
          <View style={[styles.equipmentCard, { alignItems: 'center', paddingVertical: 28 }]}>
            <Ionicons name="folder-open-outline" size={38} color="#94A3B8" />
            <Text style={{ fontFamily: BRAND_FONTS.bold, fontSize: rf(14), color: '#0F172A', marginTop: 10 }}>
              No Documents Uploaded Yet
            </Text>
            <Text
              style={{
                fontFamily: FONTS.regular,
                fontSize: rf(12),
                color: '#64748B',
                textAlign: 'center',
                marginTop: 4,
                marginBottom: 14,
              }}
            >
              Upload your Aadhaar, PAN, and Driving License in KYC &amp; Verification to get verified.
            </Text>
            <TouchableOpacity style={localStyles.ctaBtn} onPress={onOpenKycVerification}>
              <Text style={localStyles.ctaBtnText}>Go to KYC &amp; Verification</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {docItems.map((item) => {
              const isVerified = item.status === 'VERIFIED' || item.status === 'ACTIVE';
              return (
                <View key={item.id} style={styles.equipmentCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 10,
                        backgroundColor: isVerified ? '#DCFCE7' : '#E0F2FE',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons
                        name={item.locked ? 'shield-checkmark' : 'document-text-outline'}
                        size={20}
                        color={isVerified ? '#15803D' : '#0369A1'}
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontFamily: BRAND_FONTS.bold, fontSize: rf(13.5), color: '#0F172A' }}>
                        {item.title}
                      </Text>
                      <Text style={{ fontFamily: FONTS.regular, fontSize: rf(11.5), color: '#64748B', marginTop: 2 }}>
                        {item.category}
                      </Text>
                    </View>
                    <View
                      style={{
                        backgroundColor: isVerified ? '#DCFCE7' : '#E0F2FE',
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 999,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: BRAND_FONTS.bold,
                          fontSize: 10.5,
                          color: isVerified ? '#15803D' : '#0369A1',
                        }}
                      >
                        {item.locked ? 'Locked • Verified' : item.status}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                    <TouchableOpacity
                      style={[localStyles.previewBtn, { flex: 1 }]}
                      onPress={() => setPreviewDoc(item)}
                    >
                      <Ionicons name="eye-outline" size={16} color={BRAND_COLORS.navyPrimary} />
                      <Text style={localStyles.previewBtnText}>Secure Preview</Text>
                    </TouchableOpacity>
                    {!item.locked ? (
                      <TouchableOpacity
                        style={[localStyles.previewBtn, { backgroundColor: '#F0FDFA', borderColor: '#99F6E4' }]}
                        onPress={onOpenKycVerification}
                      >
                        <Ionicons name="cloud-upload-outline" size={16} color={BRAND_COLORS.tealPrimary} />
                        <Text style={[localStyles.previewBtnText, { color: BRAND_COLORS.tealPrimary }]}>
                          Manage
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={Boolean(previewDoc)}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewDoc(null)}
      >
        <View style={localStyles.modalBackdrop}>
          <View style={localStyles.modalCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ fontFamily: BRAND_FONTS.bold, fontSize: rf(14), color: '#0F172A', flex: 1 }}>
                {previewDoc?.title}
              </Text>
              <TouchableOpacity onPress={() => setPreviewDoc(null)} hitSlop={8}>
                <Ionicons name="close" size={22} color="#0F172A" />
              </TouchableOpacity>
            </View>
            {previewDoc?.url ? (
              <>
                <Image
                  source={{ uri: previewDoc.url }}
                  style={{ width: '100%', height: 320, borderRadius: 10, backgroundColor: '#F1F5F9' }}
                  resizeMode="contain"
                />
                <TouchableOpacity
                  style={[localStyles.ctaBtn, { marginTop: 12 }]}
                  onPress={() => void Linking.openURL(previewDoc.url)}
                >
                  <Text style={localStyles.ctaBtnText}>Open Full Document</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const localStyles = StyleSheet.create({
  ctaBtn: {
    backgroundColor: BRAND_COLORS.tealPrimary,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
  },
  ctaBtnText: {
    fontFamily: BRAND_FONTS.bold,
    fontSize: rf(13),
    color: '#FFFFFF',
  },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  previewBtnText: {
    fontFamily: BRAND_FONTS.bold,
    fontSize: rf(12.5),
    color: BRAND_COLORS.navyPrimary,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.72)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
  },
});
