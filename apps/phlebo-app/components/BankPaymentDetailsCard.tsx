import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from 'react-native';
import { BRAND_FONTS, BrandText as Text, BrandTextInput as TextInput } from './LabSetuBrand';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  type BankDirectoryEntry,
  filterSupportedBanks,
  getBankBrandMeta,
  type IfscLookupResult,
  type PhleboPaymentMethodSummary,
} from '@diagnostic/shared';
import {
  fetchBankDirectory,
  fetchMyPaymentMethods,
  lookupIfscFromBackend,
  saveMyBankAccount,
  saveMyUpiAccount,
  setMyDefaultPayoutMethod,
} from '../services/phleboPayoutService';
import {
  deletePrivateQrImage,
  fetchPrivateQrPreview,
  uploadPrivateQrImage,
} from '../services/walletService';
import { BankLogo } from '@diagnostic/shared/native/BankLogo';
import { styles } from '../styles/phleboStyles';

function statusBadgeStyle(status?: string): { bg: string; fg: string; label: string } {
  if (status === 'VERIFIED') return { bg: '#DCFCE7', fg: '#15803D', label: 'Verified' };
  if (status === 'FAILED') return { bg: '#FEE2E2', fg: '#B91C1C', label: 'Verification Failed' };
  if (status === 'REVERIFICATION_REQUIRED') {
    return { bg: '#FEF3C7', fg: '#B45309', label: 'Re-verification Required' };
  }
  if (status === 'PENDING_VERIFICATION') {
    return { bg: '#E0F2FE', fg: '#0369A1', label: 'Pending Verification' };
  }
  return { bg: '#F1F5F9', fg: '#475569', label: 'Not Verified' };
}

export function BankPaymentDetailsCard() {
  const [summary, setSummary] = useState<PhleboPaymentMethodSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeEditor, setActiveEditor] = useState<'NONE' | 'BANK' | 'UPI'>('NONE');
  const [statusBanner, setStatusBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Bank selector modal state
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [bankSearch, setBankSearch] = useState('');
  const [popularBanks, setPopularBanks] = useState<BankDirectoryEntry[]>(() => filterSupportedBanks().popular);
  const [allBanks, setAllBanks] = useState<BankDirectoryEntry[]>(() => filterSupportedBanks().all);
  const [selectedBank, setSelectedBank] = useState<BankDirectoryEntry | null>(null);

  // Bank form state
  const [holderName, setHolderName] = useState('');
  const [acctNum, setAcctNum] = useState('');
  const [confirmAcctNum, setConfirmAcctNum] = useState('');
  const [showAcctDigits, setShowAcctDigits] = useState(false);
  const [ifscInput, setIfscInput] = useState('');
  const [ifscLoading, setIfscLoading] = useState(false);
  const [ifscDetails, setIfscDetails] = useState<IfscLookupResult | null>(null);
  const [ifscError, setIfscError] = useState<string | null>(null);
  const [savingBank, setSavingBank] = useState(false);

  // UPI form state
  const [upiInput, setUpiInput] = useState('');
  const [confirmUpiInput, setConfirmUpiInput] = useState('');
  const [savingUpi, setSavingUpi] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [qrPreviewUri, setQrPreviewUri] = useState<string | null>(null);

  const refreshQrPreview = useCallback(async () => {
    try {
      const qr = await fetchPrivateQrPreview();
      setQrPreviewUri(qr?.available ? qr.signedUrl || qr.dataUrl || null : null);
    } catch {
      // Non-fatal
    }
  }, []);

  useEffect(() => {
    if (summary?.qrCode?.available) {
      void refreshQrPreview();
    }
  }, [summary?.qrCode?.available, refreshQrPreview]);

  const handleDeleteQr = () => {
    Alert.alert(
      'Delete UPI QR Code',
      'Remove your saved private UPI QR code?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                setUploadingQr(true);
                await deletePrivateQrImage();
                setQrPreviewUri(null);
                const fresh = await fetchMyPaymentMethods();
                setSummary(fresh);
                setStatusBanner({ type: 'ok', text: 'UPI QR code deleted.' });
              } catch (err) {
                setStatusBanner({ type: 'err', text: err instanceof Error ? err.message : 'Unable to delete QR.' });
              } finally {
                setUploadingQr(false);
              }
            })();
          },
        },
      ]
    );
  };

  const handleUploadQr = async () => {
    setStatusBanner(null);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setStatusBanner({ type: 'err', text: 'Photo library permission is required to upload UPI QR.' });
        return;
      }
      const pick = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.85,
        base64: true,
      });
      if (pick.canceled || !pick.assets?.[0]?.base64) return;
      const asset = pick.assets[0];
      const mime = asset.mimeType || 'image/png';
      setUploadingQr(true);
      await uploadPrivateQrImage({ mimeType: mime, base64Data: asset.base64!, source: 'UPLOADED' });
      const fresh = await fetchMyPaymentMethods();
      setSummary(fresh);
      await refreshQrPreview();
      setStatusBanner({
        type: 'ok',
        text: 'UPI QR uploaded to private encrypted storage (accessible only to authorised Finance Admins).',
      });
    } catch (err) {
      setStatusBanner({ type: 'err', text: err instanceof Error ? err.message : 'QR upload failed.' });
    } finally {
      setUploadingQr(false);
    }
  };

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchMyPaymentMethods();
      setSummary(data);
    } catch {
      // Non-fatal fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const loadBanks = useCallback(async (q?: string) => {
    const local = filterSupportedBanks(q);
    setPopularBanks(local.popular);
    setAllBanks(local.all);
    try {
      const res = await fetchBankDirectory(q);
      if (res?.all?.length) {
        setPopularBanks(res.popular);
        setAllBanks(res.all);
      }
    } catch {
      // Local shared bank directory already populated
    }
  }, []);

  useEffect(() => {
    if (bankPickerOpen) {
      void loadBanks(bankSearch);
    }
  }, [bankPickerOpen, bankSearch, loadBanks]);

  const handleVerifyIfsc = async (rawCode?: string) => {
    const code = (rawCode ?? ifscInput).trim().toUpperCase();
    setIfscDetails(null);
    setIfscError(null);
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(code)) {
      setIfscError('Enter a valid 11-character IFSC code (e.g., SBIN0001234).');
      return;
    }
    setIfscLoading(true);
    try {
      const res = await lookupIfscFromBackend(code);
      setIfscDetails(res);
      const matched = filterSupportedBanks().all.find(
        (b) => b.code === (res.bankCode || code.slice(0, 4)) || b.ifscPrefix === code.slice(0, 4)
      );
      if (matched) setSelectedBank(matched);
    } catch (err) {
      setIfscError(err instanceof Error ? err.message : 'IFSC lookup failed. Tap retry.');
    } finally {
      setIfscLoading(false);
    }
  };

  const handleSaveBank = async () => {
    setStatusBanner(null);
    if (!ifscDetails) {
      setStatusBanner({ type: 'err', text: 'Verify IFSC code and review branch details before saving.' });
      return;
    }
    setSavingBank(true);
    try {
      const updated = await saveMyBankAccount({
        accountHolderName: holderName.trim(),
        accountNumber: acctNum.replace(/\s+/g, ''),
        confirmAccountNumber: confirmAcctNum.replace(/\s+/g, ''),
        ifscCode: ifscInput.trim().toUpperCase(),
        selectedBankCode: selectedBank?.code,
        makeDefault: true,
      });
      setSummary(updated);
      setAcctNum('');
      setConfirmAcctNum('');
      setActiveEditor('NONE');
      setStatusBanner({
        type: 'ok',
        text: 'Bank account encrypted & saved. Pending verification before automated payouts.',
      });
    } catch (err) {
      setStatusBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Could not save bank account.',
      });
    } finally {
      setSavingBank(false);
    }
  };

  const handleSaveUpi = async () => {
    setStatusBanner(null);
    setSavingUpi(true);
    try {
      const updated = await saveMyUpiAccount({
        upiId: upiInput.trim().toLowerCase(),
        confirmUpiId: confirmUpiInput.trim().toLowerCase(),
        makeDefault: summary?.defaultMethod === 'NONE',
      });
      setSummary(updated);
      setUpiInput('');
      setConfirmUpiInput('');
      setActiveEditor('NONE');
      setStatusBanner({
        type: 'ok',
        text: 'UPI ID encrypted & saved. Verification required before payouts.',
      });
    } catch (err) {
      setStatusBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Could not save UPI ID.',
      });
    } finally {
      setSavingUpi(false);
    }
  };

  const handleSwitchDefault = async (method: 'BANK_ACCOUNT' | 'UPI') => {
    setStatusBanner(null);
    try {
      const updated = await setMyDefaultPayoutMethod(method);
      setSummary(updated);
      setStatusBanner({ type: 'ok', text: `Default payout method updated to ${method === 'BANK_ACCOUNT' ? 'Bank Account' : 'UPI'}.` });
    } catch (err) {
      setStatusBanner({ type: 'err', text: err instanceof Error ? err.message : 'Unable to switch default method.' });
    }
  };

  const bankBadge = statusBadgeStyle(summary?.bankAccount?.verificationStatus);
  const upiBadge = statusBadgeStyle(summary?.upiAccount?.verificationStatus);

  return (
    <View style={styles.equipmentCard}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionHeaderTitle}>Banking &amp; Payout Settings</Text>
          <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
            AES-256-GCM encrypted Bank, UPI &amp; Private QR (Profile v{summary?.profileVersion || 1})
          </Text>
        </View>
        <TouchableOpacity onPress={() => void loadSummary()} style={{ padding: 6 }}>
          <Ionicons name="refresh" size={18} color="#0D9488" />
        </TouchableOpacity>
      </View>

      {statusBanner && (
        <View
          style={{
            padding: 10,
            borderRadius: 8,
            marginBottom: 12,
            backgroundColor: statusBanner.type === 'ok' ? '#DCFCE7' : '#FEE2E2',
          }}
        >
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: statusBanner.type === 'ok' ? '#166534' : '#991B1B' }}>
            {statusBanner.text}
          </Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="small" color="#0D9488" style={{ marginVertical: 14 }} />
      ) : (
        <>
          {/* Default Method Selector */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            <TouchableOpacity
              onPress={() => void handleSwitchDefault('BANK_ACCOUNT')}
              style={{
                flex: 1,
                paddingVertical: 10,
                paddingHorizontal: 10,
                borderRadius: 10,
                borderWidth: 1.5,
                borderColor: summary?.defaultMethod === 'BANK_ACCOUNT' ? '#0D9488' : '#CBD5E1',
                backgroundColor: summary?.defaultMethod === 'BANK_ACCOUNT' ? '#F0FDFA' : '#F8FAFC',
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#0F172A' }}>
                🏦 Bank Account {summary?.defaultMethod === 'BANK_ACCOUNT' ? '(Default)' : ''}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => void handleSwitchDefault('UPI')}
              style={{
                flex: 1,
                paddingVertical: 10,
                paddingHorizontal: 10,
                borderRadius: 10,
                borderWidth: 1.5,
                borderColor: summary?.defaultMethod === 'UPI' ? '#0D9488' : '#CBD5E1',
                backgroundColor: summary?.defaultMethod === 'UPI' ? '#F0FDFA' : '#F8FAFC',
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#0F172A' }}>
                ⚡ UPI ID {summary?.defaultMethod === 'UPI' ? '(Default)' : ''}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Masked Bank Summary */}
          <View style={{ padding: 12, borderRadius: 10, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {summary?.bankAccount && (
                  <BankLogo
                    bankCode={summary.bankAccount.bankCode}
                    ifsc={summary.bankAccount.ifsc}
                    bankName={summary.bankAccount.bankName}
                    size={28}
                  />
                )}
                <Text style={{ fontSize: 13.5, fontWeight: '700', color: '#0F172A' }}>1. Bank Account</Text>
              </View>
              <View style={{ backgroundColor: bankBadge.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: bankBadge.fg }}>{bankBadge.label}</Text>
              </View>
            </View>
            {summary?.bankAccount ? (
              <View style={{ marginTop: 6, gap: 2 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#1E293B' }}>
                  {summary.bankAccount.bankName} • {summary.bankAccount.maskedAccountNumber}
                </Text>
                <Text style={{ fontSize: 12, color: '#475569' }}>
                  IFSC: {summary.bankAccount.ifsc} • {summary.bankAccount.branchName}
                </Text>
                <Text style={{ fontSize: 11, color: '#64748B' }}>
                  Updated: {new Date(summary.bankAccount.updatedAt).toLocaleDateString('en-IN')}
                </Text>
              </View>
            ) : (
              <Text style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>No bank account added yet.</Text>
            )}
            <TouchableOpacity
              onPress={() => setActiveEditor(activeEditor === 'BANK' ? 'NONE' : 'BANK')}
              style={{ marginTop: 8 }}
            >
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#0D9488' }}>
                {activeEditor === 'BANK' ? 'Close Bank Form' : summary?.bankAccount ? '✎ Update Bank Account' : '+ Add Bank Account'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Masked UPI Summary */}
          <View style={{ padding: 12, borderRadius: 10, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 13.5, fontWeight: '700', color: '#0F172A' }}>UPI Payout ID</Text>
              <View style={{ backgroundColor: upiBadge.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: upiBadge.fg }}>{upiBadge.label}</Text>
              </View>
            </View>
            {summary?.upiAccount ? (
              <View style={{ marginTop: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#1E293B' }}>
                  UPI ID: {summary.upiAccount.maskedUpiId}
                </Text>
                <Text style={{ fontSize: 11, color: '#64748B' }}>
                  Updated: {new Date(summary.upiAccount.updatedAt).toLocaleDateString('en-IN')}
                </Text>
              </View>
            ) : (
              <Text style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>No UPI ID added yet.</Text>
            )}
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
              <TouchableOpacity
                onPress={() => setActiveEditor(activeEditor === 'UPI' ? 'NONE' : 'UPI')}
              >
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#0D9488' }}>
                  {activeEditor === 'UPI' ? 'Close UPI Form' : summary?.upiAccount ? '✎ Update UPI ID' : '+ Add UPI ID'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 3. Private UPI QR Code Section */}
          <View style={{ padding: 12, borderRadius: 10, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 13.5, fontWeight: '700', color: '#0F172A' }}>3. UPI QR Code</Text>
              <View
                style={{
                  backgroundColor: summary?.qrCode?.available ? '#DCFCE7' : '#F1F5F9',
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 6,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: summary?.qrCode?.available ? '#15803D' : '#475569' }}>
                  {summary?.qrCode?.available
                    ? `${summary.qrCode.verificationStatus} • ${summary.qrCode.consistencyStatus}`
                    : 'Not Uploaded'}
                </Text>
              </View>
            </View>
            {qrPreviewUri && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 }}>
                <Image
                  source={{ uri: qrPreviewUri }}
                  style={{ width: 92, height: 92, borderRadius: 8, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' }}
                  resizeMode="contain"
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#1E293B' }}>Private Encrypted QR</Text>
                  {summary?.qrCode?.decodedUpiId && (
                    <Text style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
                      Payee: {summary.qrCode.decodedUpiId}
                    </Text>
                  )}
                </View>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
              <TouchableOpacity disabled={uploadingQr} onPress={() => void handleUploadQr()}>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#0369A1' }}>
                  {uploadingQr ? 'Uploading QR...' : summary?.qrCode?.available ? '🔄 Replace UPI QR' : '📷 Upload Private UPI QR'}
                </Text>
              </TouchableOpacity>
              {summary?.qrCode?.available && (
                <TouchableOpacity disabled={uploadingQr} onPress={handleDeleteQr}>
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#B91C1C' }}>
                    🗑️ Delete QR
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Bank Editor */}
          {activeEditor === 'BANK' && (
            <View style={{ padding: 12, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#0D9488', marginBottom: 12 }}>
              <Text style={styles.inputLabelSm}>Select Bank *</Text>
              <TouchableOpacity
                onPress={() => setBankPickerOpen(true)}
                style={[styles.fieldInput, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  {selectedBank ? (
                    <BankLogo
                      bankCode={selectedBank.code}
                      ifsc={selectedBank.ifscPrefix}
                      bankName={selectedBank.name}
                      size={28}
                    />
                  ) : (
                    <MaterialCommunityIcons name="bank-outline" size={18} color="#94A3B8" />
                  )}
                  <Text style={{ fontSize: 13.5, color: selectedBank ? '#0F172A' : '#94A3B8', fontWeight: '600', flex: 1 }} numberOfLines={1}>
                    {selectedBank ? selectedBank.name : 'Tap to search & select bank'}
                  </Text>
                </View>
                <Ionicons name="chevron-down" size={18} color="#64748B" />
              </TouchableOpacity>

              <Text style={styles.inputLabelSm}>IFSC Code *</Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <TextInput
                  style={[styles.fieldInput, { flex: 1, marginBottom: 0 }]}
                  value={ifscInput}
                  onChangeText={(t) => {
                    const up = t.toUpperCase();
                    setIfscInput(up);
                    setIfscDetails(null);
                    setIfscError(null);
                    if (up.length === 11) void handleVerifyIfsc(up);
                  }}
                  autoCapitalize="characters"
                  maxLength={11}
                  placeholder="e.g. SBIN0001234"
                />
                <TouchableOpacity
                  onPress={() => void handleVerifyIfsc()}
                  disabled={ifscLoading}
                  style={{ backgroundColor: '#0D9488', paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10 }}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>
                    {ifscLoading ? '...' : 'Verify'}
                  </Text>
                </TouchableOpacity>
              </View>

              {ifscError && (
                <Text style={{ fontSize: 12, color: '#B91C1C', marginBottom: 8 }}>{ifscError}</Text>
              )}

              {ifscDetails && (
                <View style={{ padding: 10, borderRadius: 8, backgroundColor: '#F0FDFA', borderWidth: 1, borderColor: '#99F6E4', marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <BankLogo
                    bankCode={ifscDetails.bankCode}
                    ifsc={ifscDetails.ifsc}
                    bankName={ifscDetails.bank}
                    size={32}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#0F766E' }}>
                      ✓ {ifscDetails.bank} — {ifscDetails.branch}
                    </Text>
                    <Text style={{ fontSize: 11.5, color: '#115E59', marginTop: 2 }}>
                      {ifscDetails.address}
                    </Text>
                    <Text style={{ fontSize: 11.5, color: '#115E59', marginTop: 2 }}>
                      {[ifscDetails.city, ifscDetails.district, ifscDetails.state].filter(Boolean).join(', ')}
                    </Text>
                  </View>
                </View>
              )}

              <Text style={styles.inputLabelSm}>Account Holder Name *</Text>
              <TextInput
                style={[styles.fieldInput, { marginBottom: 10 }]}
                value={holderName}
                onChangeText={setHolderName}
                placeholder="Full name as per bank passbook"
              />

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.inputLabelSm}>Account Number *</Text>
                <TouchableOpacity onPress={() => setShowAcctDigits(!showAcctDigits)}>
                  <Text style={{ fontSize: 11.5, color: '#0D9488', fontWeight: '700' }}>
                    {showAcctDigits ? 'Hide' : 'Show'}
                  </Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={[styles.fieldInput, { marginBottom: 10 }]}
                value={acctNum}
                onChangeText={(t) => setAcctNum(t.replace(/[^0-9]/g, ''))}
                keyboardType="numeric"
                secureTextEntry={!showAcctDigits}
                placeholder="9 to 18 digit account number"
              />

              <Text style={styles.inputLabelSm}>Confirm Account Number *</Text>
              <TextInput
                style={[styles.fieldInput, { marginBottom: 12 }]}
                value={confirmAcctNum}
                onChangeText={(t) => setConfirmAcctNum(t.replace(/[^0-9]/g, ''))}
                keyboardType="numeric"
                placeholder="Re-enter account number"
              />

              <TouchableOpacity
                style={[styles.btnPrimary, savingBank && { opacity: 0.65 }]}
                disabled={savingBank}
                onPress={() => void handleSaveBank()}
              >
                <Text style={styles.btnPrimaryText}>
                  {savingBank ? 'Encrypting & Saving...' : '🔒 Save & Verify Bank Account'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* UPI Editor */}
          {activeEditor === 'UPI' && (
            <View style={{ padding: 12, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#0D9488', marginBottom: 12 }}>
              <Text style={styles.inputLabelSm}>UPI ID (VPA) *</Text>
              <TextInput
                style={[styles.fieldInput, { marginBottom: 10 }]}
                value={upiInput}
                onChangeText={setUpiInput}
                autoCapitalize="none"
                placeholder="e.g. vikash@okhdfcbank"
              />

              <Text style={styles.inputLabelSm}>Confirm UPI ID *</Text>
              <TextInput
                style={[styles.fieldInput, { marginBottom: 12 }]}
                value={confirmUpiInput}
                onChangeText={setConfirmUpiInput}
                autoCapitalize="none"
                placeholder="Re-enter UPI ID"
              />

              <TouchableOpacity
                style={[styles.btnPrimary, savingUpi && { opacity: 0.65 }]}
                disabled={savingUpi}
                onPress={() => void handleSaveUpi()}
              >
                <Text style={styles.btnPrimaryText}>
                  {savingUpi ? 'Encrypting & Saving...' : '🔒 Save UPI ID'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* Searchable Bank Directory Modal (Keyboard-safe) */}
      <Modal visible={bankPickerOpen} animationType="slide" transparent onRequestClose={() => setBankPickerOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' }}
        >
          <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%', padding: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#0F172A' }}>Select Your Bank</Text>
              <TouchableOpacity onPress={() => setBankPickerOpen(false)}>
                <Ionicons name="close" size={24} color="#475569" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.fieldInput, { marginBottom: 12, fontFamily: BRAND_FONTS.medium }]}
              value={bankSearch}
              onChangeText={setBankSearch}
              placeholder="Search bank name, alias or IFSC (e.g. SBI, BOB, HDFC)..."
              placeholderTextColor="#94A3B8"
            />

            <ScrollView keyboardShouldPersistTaps="handled">
              {popularBanks.length > 0 && (
                <>
                  <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#64748B', marginBottom: 6 }}>
                    POPULAR BANKS
                  </Text>
                  {popularBanks.map((b) => (
                    <TouchableOpacity
                      key={`pop-${b.code}`}
                      onPress={() => {
                        setSelectedBank(b);
                        setBankPickerOpen(false);
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderColor: '#F1F5F9' }}
                    >
                      <BankLogo
                        bankCode={b.code}
                        ifsc={b.ifscPrefix}
                        bankName={b.name}
                        size={36}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13.5, fontWeight: '700', color: '#0F172A' }}>{b.name}</Text>
                        <Text style={{ fontSize: 11, color: '#64748B' }}>IFSC Prefix: {b.ifscPrefix}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#64748B', marginTop: 12, marginBottom: 6 }}>
                ALL SUPPORTED BANKS (A–Z)
              </Text>
              {allBanks.map((b) => (
                <TouchableOpacity
                  key={`all-${b.code}`}
                  onPress={() => {
                    setSelectedBank(b);
                    setBankPickerOpen(false);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderColor: '#F1F5F9' }}
                >
                  <BankLogo
                    bankCode={b.code}
                    ifsc={b.ifscPrefix}
                    bankName={b.name}
                    size={36}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13.5, fontWeight: '600', color: '#0F172A' }}>{b.name}</Text>
                    <Text style={{ fontSize: 11, color: '#64748B' }}>IFSC Prefix: {b.ifscPrefix}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
