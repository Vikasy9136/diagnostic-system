import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { type LabDocumentRecord, type PhlebotomistProfile } from '@diagnostic/shared';
import { KeyboardAwareScrollView } from '../components/KeyboardAwareScrollView';
import { BRAND_COLORS, BRAND_FONTS } from '../components/LabSetuBrand';
import { ProfileSubScreenHeader } from '../components/ProfileSubScreenHeader';
import { COLORS, FONTS, styles } from '../styles/phleboStyles';
import { rf, rs } from '../utils/responsive';

export type KycDocKey = 'AADHAAR' | 'PAN' | 'DRIVING_LICENSE' | 'VEHICLE_RC';

export interface KycUploadPayload {
  docKey: KycDocKey;
  docNumber: string;
  localUri: string;
}

export interface KycVerificationScreenProps {
  myPhleboProfile: PhlebotomistProfile | null;
  onBack: () => void;
  onUploadKycDocument: (payload: KycUploadPayload) => Promise<boolean>;
}

interface KycSlotSpec {
  key: KycDocKey;
  title: string;
  subtitle: string;
  numberLabel: string;
  numberPlaceholder: string;
  url?: string;
  numberValue?: string;
  required: boolean;
}

function resolveStatusBadge(status?: string, hasUrl?: boolean) {
  if (status === 'VERIFIED' || status === 'APPROVED') {
    return { bg: '#DCFCE7', fg: '#15803D', label: 'Verified' };
  }
  if (status === 'REJECTED') {
    return { bg: '#FEE2E2', fg: '#B91C1C', label: 'Rejected' };
  }
  if (status === 'PENDING_REVIEW' || status === 'PENDING' || hasUrl) {
    return { bg: '#E0F2FE', fg: '#0369A1', label: 'Pending Review' };
  }
  return { bg: '#F1F5F9', fg: '#475569', label: 'Not Uploaded' };
}

export function KycVerificationScreen({
  myPhleboProfile,
  onBack,
  onUploadKycDocument,
}: KycVerificationScreenProps) {
  const [uploadingKey, setUploadingKey] = useState<KycDocKey | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{ title: string; url: string } | null>(null);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [docNumbers, setDocNumbers] = useState<Record<KycDocKey, string>>({
    AADHAAR: myPhleboProfile?.aadhaarNumber || '',
    PAN: myPhleboProfile?.panNumber || '',
    DRIVING_LICENSE: myPhleboProfile?.dlNumber || '',
    VEHICLE_RC: myPhleboProfile?.vehicleNumber || '',
  });

  const overallStatus = myPhleboProfile?.verified
    ? 'VERIFIED'
    : myPhleboProfile?.verificationStatus || 'PENDING_REVIEW';
  const overallBadge = resolveStatusBadge(overallStatus, true);

  const slots: KycSlotSpec[] = useMemo(
    () => [
      {
        key: 'AADHAAR',
        title: 'Aadhaar Card (Front / Masked)',
        subtitle: 'Government-issued identity & address proof',
        numberLabel: 'Aadhaar Number (Last 4 or 12 digits)',
        numberPlaceholder: 'e.g. XXXX-XXXX-1234',
        url: myPhleboProfile?.aadhaarDocumentUrl,
        numberValue: myPhleboProfile?.aadhaarNumber,
        required: true,
      },
      {
        key: 'PAN',
        title: 'PAN Card',
        subtitle: 'Required for TDS & payout compliance',
        numberLabel: 'PAN Number',
        numberPlaceholder: 'e.g. ABCDE1234F',
        url: myPhleboProfile?.panDocumentUrl,
        numberValue: myPhleboProfile?.panNumber,
        required: true,
      },
      {
        key: 'DRIVING_LICENSE',
        title: 'Driving License (DL)',
        subtitle: 'Valid two-wheeler / four-wheeler field permit',
        numberLabel: 'DL Number',
        numberPlaceholder: 'e.g. MH02 20190012345',
        url: myPhleboProfile?.dlDocumentUrl,
        numberValue: myPhleboProfile?.dlNumber,
        required: true,
      },
      {
        key: 'VEHICLE_RC',
        title: 'Vehicle Registration (RC)',
        subtitle: 'Optional if using company-assigned EV/bicycle',
        numberLabel: 'Vehicle Number',
        numberPlaceholder: 'e.g. MH02AB1234',
        url: myPhleboProfile?.rcDocumentUrl,
        numberValue: myPhleboProfile?.vehicleNumber,
        required: false,
      },
    ],
    [myPhleboProfile]
  );

  const findDocRecord = (key: KycDocKey): LabDocumentRecord | undefined => {
    const docs = myPhleboProfile?.documents || [];
    const typeMap: Record<KycDocKey, LabDocumentRecord['type']> = {
      AADHAAR: 'AADHAAR_CARD',
      PAN: 'PAN_CARD',
      DRIVING_LICENSE: 'DRIVING_LICENSE',
      VEHICLE_RC: 'OTHER',
    };
    return docs.find((d) => d.type === typeMap[key] || d.title?.toUpperCase().includes(key.replace('_', ' ')));
  };

  const handlePickAndUpload = async (slot: KycSlotSpec) => {
    setBanner(null);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setBanner({ type: 'err', text: 'Gallery permission is required to upload KYC documents.' });
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });
      if (picked.canceled || !picked.assets?.[0]?.uri) return;

      setUploadingKey(slot.key);
      const ok = await onUploadKycDocument({
        docKey: slot.key,
        docNumber: (docNumbers[slot.key] || slot.numberValue || '').trim(),
        localUri: picked.assets[0].uri,
      });
      if (ok) {
        setBanner({ type: 'ok', text: `${slot.title} uploaded and submitted for verification.` });
      } else {
        setBanner({ type: 'err', text: `Could not upload ${slot.title}. Please retry.` });
      }
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to upload KYC document.',
      });
    } finally {
      setUploadingKey(null);
    }
  };

  const historyList = useMemo(() => {
    if (Array.isArray(myPhleboProfile?.kycHistory) && myPhleboProfile.kycHistory.length > 0) {
      return myPhleboProfile.kycHistory;
    }
    return [];
  }, [myPhleboProfile?.kycHistory]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ProfileSubScreenHeader
        title="KYC & Verification"
        subtitle="Identity documents & approval status"
        onBack={onBack}
      />

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: rs(16), paddingBottom: rs(90) }}
        showsVerticalScrollIndicator={false}
      >
        {/* Overall Verification Status */}
        <View style={[styles.equipmentCard, { marginBottom: 14 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={{ fontFamily: BRAND_FONTS.bold, fontSize: rf(14), color: '#0F172A' }}>
                Account KYC Status
              </Text>
              <Text style={{ fontFamily: FONTS.regular, fontSize: rf(12), color: '#64748B', marginTop: 2 }}>
                {myPhleboProfile?.verified
                  ? 'Your identity & field credentials are verified.'
                  : 'Upload all mandatory documents for Admin verification.'}
              </Text>
            </View>
            <View style={[localStyles.badge, { backgroundColor: overallBadge.bg }]}>
              <Text style={[localStyles.badgeText, { color: overallBadge.fg }]}>
                {overallBadge.label}
              </Text>
            </View>
          </View>

          {overallStatus === 'REJECTED' && myPhleboProfile?.kycRejectionReason ? (
            <View style={localStyles.rejectionBox}>
              <Ionicons name="warning" size={18} color="#B91C1C" />
              <Text style={{ flex: 1, fontFamily: BRAND_FONTS.medium, fontSize: rf(12), color: '#991B1B' }}>
                Rejection Reason: {myPhleboProfile.kycRejectionReason}
              </Text>
            </View>
          ) : null}
        </View>

        {banner && (
          <View
            style={[
              localStyles.banner,
              {
                backgroundColor: banner.type === 'ok' ? '#DCFCE7' : '#FEE2E2',
                borderColor: banner.type === 'ok' ? '#86EFAC' : '#FCA5A5',
              },
            ]}
          >
            <Text
              style={{
                fontFamily: BRAND_FONTS.medium,
                fontSize: rf(12),
                color: banner.type === 'ok' ? '#15803D' : '#B91C1C',
              }}
            >
              {banner.text}
            </Text>
          </View>
        )}

        {/* KYC Document Cards */}
        <Text style={styles.sectionHeaderTitle}>Required KYC Documents</Text>
        <View style={{ gap: 12 }}>
          {slots.map((slot) => {
            const record = findDocRecord(slot.key);
            const docStatus = record?.verified || (myPhleboProfile?.verified && slot.url)
              ? 'VERIFIED'
              : myPhleboProfile?.verificationStatus === 'REJECTED' && slot.url
              ? 'REJECTED'
              : slot.url
              ? 'PENDING'
              : undefined;
            const badge = resolveStatusBadge(docStatus, Boolean(slot.url));
            const isUploading = uploadingKey === slot.key;
            const isRejected = docStatus === 'REJECTED';
            const isVerified = docStatus === 'VERIFIED';

            return (
              <View key={slot.key} style={styles.equipmentCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: BRAND_FONTS.bold, fontSize: rf(13.5), color: '#0F172A' }}>
                      {slot.title} {slot.required ? '*' : ''}
                    </Text>
                    <Text style={{ fontFamily: FONTS.regular, fontSize: rf(11.5), color: '#64748B', marginTop: 2 }}>
                      {slot.subtitle}
                    </Text>
                  </View>
                  <View style={[localStyles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[localStyles.badgeText, { color: badge.fg }]}>{badge.label}</Text>
                  </View>
                </View>

                <View style={{ marginTop: 10 }}>
                  <Text style={styles.inputLabelSm}>{slot.numberLabel}</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={docNumbers[slot.key]}
                    onChangeText={(val) =>
                      setDocNumbers((prev) => ({ ...prev, [slot.key]: val }))
                    }
                    placeholder={slot.numberPlaceholder}
                    editable={!isVerified}
                  />
                </View>

                {isRejected && myPhleboProfile?.kycRejectionReason ? (
                  <View style={localStyles.rejectionBox}>
                    <Ionicons name="alert-circle" size={16} color="#B91C1C" />
                    <Text style={{ flex: 1, fontFamily: BRAND_FONTS.medium, fontSize: rf(11.5), color: '#991B1B' }}>
                      {myPhleboProfile.kycRejectionReason}
                    </Text>
                  </View>
                ) : null}

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  {slot.url ? (
                    <TouchableOpacity
                      style={[localStyles.actionBtn, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
                      onPress={() => setPreviewDoc({ title: slot.title, url: slot.url! })}
                    >
                      <Ionicons name="eye-outline" size={16} color="#1D4ED8" />
                      <Text style={[localStyles.actionBtnText, { color: '#1D4ED8' }]}>Preview</Text>
                    </TouchableOpacity>
                  ) : null}

                  {!isVerified ? (
                    <TouchableOpacity
                      style={[
                        localStyles.actionBtn,
                        {
                          flex: 1,
                          backgroundColor: isRejected ? '#DC2626' : BRAND_COLORS.tealPrimary,
                          borderColor: 'transparent',
                        },
                      ]}
                      onPress={() => void handlePickAndUpload(slot)}
                      disabled={isUploading}
                    >
                      {isUploading ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <Ionicons name="cloud-upload-outline" size={16} color="#FFFFFF" />
                          <Text style={[localStyles.actionBtnText, { color: '#FFFFFF' }]}>
                            {isRejected ? 'Re-upload Document' : slot.url ? 'Replace Document' : 'Upload Document'}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>

        {/* Submission History */}
        <Text style={[styles.sectionHeaderTitle, { marginTop: 18 }]}>Submission History</Text>
        <View style={styles.equipmentCard}>
          {historyList.length > 0 ? (
            <View style={{ gap: 10 }}>
              {historyList.map((entry) => (
                <View
                  key={entry.id}
                  style={{
                    borderBottomWidth: 1,
                    borderBottomColor: '#F1F5F9',
                    paddingBottom: 8,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontFamily: BRAND_FONTS.bold, fontSize: rf(12.5), color: '#0F172A' }}>
                      {entry.documentType}
                    </Text>
                    <Text style={{ fontFamily: BRAND_FONTS.bold, fontSize: rf(11), color: '#0369A1' }}>
                      {entry.status}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: FONTS.regular, fontSize: rf(11), color: '#64748B', marginTop: 2 }}>
                    Submitted: {entry.submittedAt ? new Date(entry.submittedAt).toLocaleString('en-IN') : '—'}
                  </Text>
                  {entry.note ? (
                    <Text style={{ fontFamily: FONTS.regular, fontSize: rf(11.5), color: '#475569', marginTop: 2 }}>
                      {entry.note}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ fontFamily: FONTS.regular, fontSize: rf(12), color: '#64748B', textAlign: 'center' }}>
              No KYC submission history recorded yet. Upload a document above to submit for Admin review.
            </Text>
          )}
        </View>
      </KeyboardAwareScrollView>

      {/* Secure Image Preview Modal */}
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
              <Image
                source={{ uri: previewDoc.url }}
                style={{ width: '100%', height: 320, borderRadius: 10, backgroundColor: '#F1F5F9' }}
                resizeMode="contain"
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const localStyles = StyleSheet.create({
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    fontFamily: BRAND_FONTS.bold,
    fontSize: 11,
  },
  banner: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 14,
  },
  rejectionBox: {
    marginTop: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionBtnText: {
    fontFamily: BRAND_FONTS.bold,
    fontSize: rf(12.5),
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
