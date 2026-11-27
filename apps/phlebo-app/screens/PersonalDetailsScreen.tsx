import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { type PhlebotomistProfile } from '@diagnostic/shared';
import { KeyboardAwareScrollView } from '../components/KeyboardAwareScrollView';
import { BRAND_COLORS, BRAND_FONTS } from '../components/LabSetuBrand';
import { ProfileSubScreenHeader } from '../components/ProfileSubScreenHeader';
import { COLORS, FONTS, styles } from '../styles/phleboStyles';
import { MAX_TEXT_SCALE, rf, rs } from '../utils/responsive';

export interface PersonalDetailsPayload {
  name: string;
  dob: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  address: string;
  city: string;
  state: string;
  pinCode: string;
}

export interface PersonalDetailsScreenProps {
  phleboInitial: string;
  phleboName: string;
  phleboEmail: string;
  phleboPhone?: string;
  phleboDob?: string;
  phleboGender?: 'MALE' | 'FEMALE' | 'OTHER';
  profilePhotoUrl?: string;
  myPhleboProfile: PhlebotomistProfile | null;
  saving?: boolean;
  uploadingPhoto?: boolean;
  onBack: () => void;
  onPickProfilePhoto: () => Promise<void> | void;
  onSavePersonalDetails: (payload: PersonalDetailsPayload) => Promise<boolean>;
}

export function PersonalDetailsScreen({
  phleboInitial,
  phleboName,
  phleboEmail,
  phleboPhone,
  phleboDob,
  phleboGender = 'MALE',
  profilePhotoUrl,
  myPhleboProfile,
  saving = false,
  uploadingPhoto = false,
  onBack,
  onPickProfilePhoto,
  onSavePersonalDetails,
}: PersonalDetailsScreenProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(phleboName || myPhleboProfile?.name || '');
  const [dob, setDob] = useState(phleboDob || myPhleboProfile?.dob || '');
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | 'OTHER'>(
    phleboGender || myPhleboProfile?.gender || 'MALE'
  );
  const [address, setAddress] = useState(
    myPhleboProfile?.address || myPhleboProfile?.currentLocation || ''
  );
  const [city, setCity] = useState(
    myPhleboProfile?.city || myPhleboProfile?.assignedCity || ''
  );
  const [stateName, setStateName] = useState(myPhleboProfile?.state || '');
  const [pinCode, setPinCode] = useState(myPhleboProfile?.pinCode || '');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!isEditing) {
      setName(phleboName || myPhleboProfile?.name || '');
      setDob(phleboDob || myPhleboProfile?.dob || '');
      setGender(phleboGender || myPhleboProfile?.gender || 'MALE');
      setAddress(myPhleboProfile?.address || myPhleboProfile?.currentLocation || '');
      setCity(myPhleboProfile?.city || myPhleboProfile?.assignedCity || '');
      setStateName(myPhleboProfile?.state || '');
      setPinCode(myPhleboProfile?.pinCode || '');
    }
  }, [isEditing, phleboName, phleboDob, phleboGender, myPhleboProfile]);

  const computedAge = useMemo(() => {
    if (!dob) return null;
    try {
      const birth = new Date(dob);
      if (!isNaN(birth.getTime())) {
        const diff = Date.now() - birth.getTime();
        const ageDate = new Date(diff);
        const calculated = Math.abs(ageDate.getUTCFullYear() - 1970);
        return calculated > 0 && calculated < 110 ? calculated : null;
      }
    } catch {
      // Ignore parse error
    }
    return null;
  }, [dob]);

  const handleSave = async () => {
    setFeedback(null);
    if (!name.trim()) {
      setFeedback({ type: 'err', text: 'Full name is required.' });
      return;
    }
    if (pinCode.trim() && !/^\d{6}$/.test(pinCode.trim())) {
      setFeedback({ type: 'err', text: 'PIN code must be 6 digits.' });
      return;
    }
    const ok = await onSavePersonalDetails({
      name: name.trim(),
      dob: dob.trim(),
      gender,
      address: address.trim(),
      city: city.trim(),
      state: stateName.trim(),
      pinCode: pinCode.trim(),
    });
    if (ok) {
      setIsEditing(false);
      setFeedback({ type: 'ok', text: 'Personal details updated successfully.' });
    } else {
      setFeedback({ type: 'err', text: 'Unable to save personal details. Please try again.' });
    }
  };

  const handleCancel = () => {
    setFeedback(null);
    setIsEditing(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ProfileSubScreenHeader
        title="Personal Details"
        subtitle="Identity, contact & residential information"
        onBack={onBack}
        rightAction={{
          label: isEditing ? 'Cancel' : 'Edit',
          onPress: () => (isEditing ? handleCancel() : setIsEditing(true)),
        }}
      />

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: rs(16), paddingBottom: rs(90) }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Photo Card */}
        <View style={[styles.equipmentCard, { alignItems: 'center', marginBottom: 14 }]}>
          <View style={{ position: 'relative' }}>
            {profilePhotoUrl ? (
              <Image
                source={{ uri: profilePhotoUrl }}
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: 44,
                  borderWidth: 3,
                  borderColor: BRAND_COLORS.tealPrimary,
                  backgroundColor: '#E2E8F0',
                }}
              />
            ) : (
              <View
                style={[
                  styles.avatarCircle,
                  {
                    width: 88,
                    height: 88,
                    borderRadius: 44,
                    backgroundColor: BRAND_COLORS.navyPrimary,
                    borderWidth: 3,
                    borderColor: BRAND_COLORS.tealPrimary,
                  },
                ]}
              >
                <Text style={[styles.avatarText, { fontSize: rf(28), color: '#FFFFFF' }]}>
                  {phleboInitial}
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={localStyles.cameraBadge}
              onPress={() => void onPickProfilePhoto()}
              disabled={uploadingPhoto}
              accessibilityLabel="Update Profile Photo"
            >
              {uploadingPhoto ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="camera" size={16} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
          <Text
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
            style={{ fontFamily: BRAND_FONTS.bold, fontSize: rf(15), color: '#0F172A', marginTop: 10 }}
          >
            {name || 'Field Phlebotomist'}
          </Text>
          <Text style={{ fontFamily: FONTS.regular, fontSize: rf(11.5), color: '#64748B', marginTop: 2 }}>
            Tap camera icon to update profile photo
          </Text>
        </View>

        {feedback && (
          <View
            style={[
              localStyles.banner,
              {
                backgroundColor: feedback.type === 'ok' ? '#DCFCE7' : '#FEE2E2',
                borderColor: feedback.type === 'ok' ? '#86EFAC' : '#FCA5A5',
              },
            ]}
          >
            <Ionicons
              name={feedback.type === 'ok' ? 'checkmark-circle' : 'alert-circle'}
              size={18}
              color={feedback.type === 'ok' ? '#15803D' : '#B91C1C'}
            />
            <Text
              style={{
                flex: 1,
                fontFamily: BRAND_FONTS.medium,
                fontSize: rf(12),
                color: feedback.type === 'ok' ? '#15803D' : '#B91C1C',
              }}
            >
              {feedback.text}
            </Text>
          </View>
        )}

        {/* Basic Information */}
        <Text style={styles.sectionHeaderTitle}>Identity &amp; Contact</Text>
        <View style={styles.equipmentCard}>
          <View style={{ marginBottom: 12 }}>
            <Text style={styles.inputLabelSm}>Full Name *</Text>
            {isEditing ? (
              <TextInput
                style={styles.fieldInput}
                value={name}
                onChangeText={setName}
                placeholder="Full Name as per Aadhaar"
              />
            ) : (
              <View style={localStyles.readOnlyBox}>
                <Text style={localStyles.readOnlyValue}>{name || 'Not Provided'}</Text>
              </View>
            )}
          </View>

          <View style={{ marginBottom: 12 }}>
            <View style={localStyles.labelRow}>
              <Text style={styles.inputLabelSm}>Mobile Number</Text>
              <View style={localStyles.verifiedPill}>
                <Text style={localStyles.verifiedPillText}>Verified</Text>
              </View>
            </View>
            <View style={[localStyles.readOnlyBox, { backgroundColor: '#F1F5F9' }]}>
              <Text style={[localStyles.readOnlyValue, { color: '#475569' }]}>
                {phleboPhone || myPhleboProfile?.phone || 'Not Registered'}
              </Text>
            </View>
          </View>

          <View style={{ marginBottom: 12 }}>
            <View style={localStyles.labelRow}>
              <Text style={styles.inputLabelSm}>Email Address</Text>
              <View style={localStyles.verifiedPill}>
                <Text style={localStyles.verifiedPillText}>Verified</Text>
              </View>
            </View>
            <View style={[localStyles.readOnlyBox, { backgroundColor: '#F1F5F9' }]}>
              <Text style={[localStyles.readOnlyValue, { color: '#475569' }]}>
                {phleboEmail || myPhleboProfile?.email || 'Not Registered'}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
            <View style={{ flex: 1.2 }}>
              <Text style={styles.inputLabelSm}>Date of Birth</Text>
              {isEditing ? (
                <TextInput
                  style={styles.fieldInput}
                  value={dob}
                  onChangeText={setDob}
                  placeholder="YYYY-MM-DD"
                />
              ) : (
                <View style={localStyles.readOnlyBox}>
                  <Text style={localStyles.readOnlyValue}>{dob || 'Not specified'}</Text>
                </View>
              )}
            </View>
            <View style={{ flex: 0.8 }}>
              <Text style={styles.inputLabelSm}>Age</Text>
              <View style={[localStyles.readOnlyBox, { backgroundColor: '#F1F5F9' }]}>
                <Text style={localStyles.readOnlyValue}>
                  {computedAge !== null ? `${computedAge} yrs` : '—'}
                </Text>
              </View>
            </View>
          </View>

          <View>
            <Text style={styles.inputLabelSm}>Gender</Text>
            {isEditing ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                {(
                  [
                    { key: 'MALE', label: 'Male' },
                    { key: 'FEMALE', label: 'Female' },
                    { key: 'OTHER', label: 'Other' },
                  ] as const
                ).map((g) => (
                  <TouchableOpacity
                    key={g.key}
                    style={[
                      styles.shiftButton,
                      { flex: 1, paddingVertical: 9 },
                      gender === g.key && {
                        backgroundColor: '#E6F7F5',
                        borderColor: BRAND_COLORS.tealPrimary,
                        borderWidth: 1.5,
                      },
                    ]}
                    onPress={() => setGender(g.key)}
                  >
                    <Text
                      style={[
                        styles.shiftButtonText,
                        gender === g.key && { color: BRAND_COLORS.tealPrimary, fontFamily: FONTS.bold },
                      ]}
                    >
                      {g.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={localStyles.readOnlyBox}>
                <Text style={localStyles.readOnlyValue}>
                  {gender === 'FEMALE' ? 'Female' : gender === 'OTHER' ? 'Other' : 'Male'}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Address Information */}
        <Text style={[styles.sectionHeaderTitle, { marginTop: 18 }]}>Address &amp; Service Location</Text>
        <View style={styles.equipmentCard}>
          <View style={{ marginBottom: 12 }}>
            <Text style={styles.inputLabelSm}>Street / Residential Address</Text>
            {isEditing ? (
              <TextInput
                style={[styles.fieldInput, { minHeight: 68, textAlignVertical: 'top', paddingTop: 10 }]}
                value={address}
                onChangeText={setAddress}
                placeholder="House/Flat No, Street, Landmark"
                multiline
              />
            ) : (
              <View style={localStyles.readOnlyBox}>
                <Text style={localStyles.readOnlyValue}>{address || 'Not Provided'}</Text>
              </View>
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabelSm}>City</Text>
              {isEditing ? (
                <TextInput
                  style={styles.fieldInput}
                  value={city}
                  onChangeText={setCity}
                  placeholder="City"
                />
              ) : (
                <View style={localStyles.readOnlyBox}>
                  <Text style={localStyles.readOnlyValue}>{city || 'Not Provided'}</Text>
                </View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabelSm}>State</Text>
              {isEditing ? (
                <TextInput
                  style={styles.fieldInput}
                  value={stateName}
                  onChangeText={setStateName}
                  placeholder="State"
                />
              ) : (
                <View style={localStyles.readOnlyBox}>
                  <Text style={localStyles.readOnlyValue}>{stateName || 'Not Provided'}</Text>
                </View>
              )}
            </View>
          </View>

          <View>
            <Text style={styles.inputLabelSm}>PIN Code</Text>
            {isEditing ? (
              <TextInput
                style={styles.fieldInput}
                value={pinCode}
                onChangeText={(t) => setPinCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
                placeholder="6-digit PIN code"
                keyboardType="number-pad"
                maxLength={6}
              />
            ) : (
              <View style={localStyles.readOnlyBox}>
                <Text style={localStyles.readOnlyValue}>{pinCode || 'Not Provided'}</Text>
              </View>
            )}
          </View>
        </View>

        {isEditing ? (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            <TouchableOpacity
              style={[styles.shiftButton, { flex: 1, paddingVertical: 13 }]}
              onPress={handleCancel}
              disabled={saving}
            >
              <Text style={styles.shiftButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                localStyles.saveBtn,
                { flex: 1.6, opacity: saving ? 0.7 : 1 },
              ]}
              onPress={() => void handleSave()}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={localStyles.saveBtnText}>Save Personal Details</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[localStyles.saveBtn, { marginTop: 18 }]}
            onPress={() => setIsEditing(true)}
          >
            <Ionicons name="create-outline" size={18} color="#FFFFFF" />
            <Text style={localStyles.saveBtnText}>Edit Personal Details</Text>
          </TouchableOpacity>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const localStyles = StyleSheet.create({
  headerEditBtn: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  headerEditBtnText: {
    fontFamily: BRAND_FONTS.bold,
    fontSize: rf(12),
    color: '#FFFFFF',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: BRAND_COLORS.tealPrimary,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 14,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  verifiedPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  verifiedPillText: {
    fontFamily: BRAND_FONTS.bold,
    fontSize: 10.5,
    color: '#15803D',
  },
  readOnlyBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  readOnlyValue: {
    fontFamily: BRAND_FONTS.medium,
    fontSize: 13.5,
    color: '#0F172A',
  },
  saveBtn: {
    backgroundColor: BRAND_COLORS.tealPrimary,
    borderRadius: 12,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveBtnText: {
    fontFamily: BRAND_FONTS.bold,
    fontSize: rf(14),
    color: '#FFFFFF',
  },
});
