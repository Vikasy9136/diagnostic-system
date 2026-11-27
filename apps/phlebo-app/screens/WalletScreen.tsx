import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  formatInr,
  type PhleboPaymentMethodSummary,
  type PhleboWallet,
  type WalletTransaction,
  type WithdrawalConfig,
  type WithdrawalRequest,
} from '@diagnostic/shared';
import { fetchMyPaymentMethods } from '../services/phleboPayoutService';
import {
  fetchMyWallet,
  fetchMyWalletTransactions,
  fetchMyWithdrawalRequests,
  submitWithdrawalRequest,
} from '../services/walletService';
import { styles } from '../styles/phleboStyles';

export interface WalletScreenProps {
  onGoToProfile: () => void;
}

export function WalletScreen({ onGoToProfile }: WalletScreenProps) {
  const [wallet, setWallet] = useState<PhleboWallet | null>(null);
  const [cfg, setCfg] = useState<WithdrawalConfig | null>(null);
  const [txs, setTxs] = useState<WalletTransaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [payoutProfile, setPayoutProfile] = useState<PhleboPaymentMethodSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Withdraw flow modal
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [step, setStep] = useState<'AMOUNT' | 'CONFIRM'>('AMOUNT');
  const [amountInput, setAmountInput] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<'BANK_ACCOUNT' | 'UPI'>('BANK_ACCOUNT');
  const [submitting, setSubmitting] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [wRes, txRes, wdRes, ppRes] = await Promise.all([
        fetchMyWallet(),
        fetchMyWalletTransactions(),
        fetchMyWithdrawalRequests(),
        fetchMyPaymentMethods(),
      ]);
      setWallet(wRes.wallet);
      setCfg(wRes.config);
      setTxs(txRes);
      setWithdrawals(wdRes);
      setPayoutProfile(ppRes);
      if (ppRes.defaultMethod === 'UPI') setSelectedMethod('UPI');
      else setSelectedMethod('BANK_ACCOUNT');
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Unable to load wallet.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const minInr = (cfg?.minWithdrawalPaise ?? 10000) / 100;
  const availInr = (wallet?.availableBalancePaise ?? 0) / 100;
  const nextEligible = wallet?.nextEligibleWithdrawalAt ? new Date(wallet.nextEligibleWithdrawalAt) : null;
  const cycleLocked = Boolean(nextEligible && nextEligible.getTime() > Date.now());
  const hasActivePending = withdrawals.some((w) =>
    ['PENDING_ADMIN_SETTLEMENT', 'UNDER_REVIEW', 'ON_HOLD', 'PROCESSING_MANUALLY', 'NEEDS_REVIEW'].includes(w.status)
  );
  const methodVerified =
    selectedMethod === 'BANK_ACCOUNT'
      ? payoutProfile?.bankAccount?.verificationStatus === 'VERIFIED'
      : payoutProfile?.upiAccount?.verificationStatus === 'VERIFIED';

  const maskedDest =
    selectedMethod === 'BANK_ACCOUNT'
      ? payoutProfile?.bankAccount
        ? `${payoutProfile.bankAccount.bankName} ${payoutProfile.bankAccount.maskedAccountNumber} (${payoutProfile.bankAccount.ifsc})`
        : 'Bank Account Not Added'
      : payoutProfile?.upiAccount?.maskedUpiId || 'UPI ID Not Added';

  const openWithdrawFlow = () => {
    setBanner(null);
    setAmountInput(availInr > 0 ? String(availInr) : '');
    setStep('AMOUNT');
    setWithdrawModalOpen(true);
  };

  const handleConfirmWithdraw = async () => {
    setSubmitting(true);
    setBanner(null);
    try {
      const paise = Math.round(Number(amountInput) * 100);
      const res = await submitWithdrawalRequest({
        requestedAmountPaise: paise,
        paymentMethod: selectedMethod,
      });
      setWithdrawModalOpen(false);
      setBanner({
        type: 'ok',
        text: 'Your withdrawal request has been submitted successfully. Your payment is pending settlement from LabSetu.',
      });
      setWallet(res.wallet);
      await loadAll();
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Withdrawal request failed.',
      });
      setWithdrawModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !wallet) {
    return (
      <View style={{ padding: 24, alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#0D9488" />
        <Text style={{ marginTop: 10, color: '#64748B' }}>Loading LabSetu Wallet...</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      {banner && (
        <View
          style={{
            padding: 12,
            borderRadius: 10,
            backgroundColor: banner.type === 'ok' ? '#DCFCE7' : '#FEE2E2',
            borderWidth: 1,
            borderColor: banner.type === 'ok' ? '#86EFAC' : '#FCA5A5',
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: banner.type === 'ok' ? '#166534' : '#991B1B' }}>
            {banner.text}
          </Text>
        </View>
      )}

      {/* Main Wallet Balance Card */}
      <View style={styles.equipmentCard}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={styles.sectionHeaderTitle}>Phlebo Wallet</Text>
          <TouchableOpacity onPress={() => void loadAll()}>
            <Ionicons name="refresh" size={18} color="#0D9488" />
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 10 }}>
          <Text style={{ fontSize: 11.5, color: '#64748B', fontWeight: '700' }}>AVAILABLE BALANCE</Text>
          <Text style={{ fontSize: 28, fontWeight: '800', color: '#0F172A', marginTop: 2 }}>
            {formatInr(availInr)}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
          <View style={{ flex: 1, minWidth: 120 }}>
            <Text style={{ fontSize: 11, color: '#64748B' }}>Total Earnings</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>{formatInr((wallet?.totalEarnedPaise ?? 0) / 100)}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 120 }}>
            <Text style={{ fontSize: 11, color: '#64748B' }}>Pending Withdrawal</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#B45309' }}>{formatInr((wallet?.pendingWithdrawalPaise ?? 0) / 100)}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 120 }}>
            <Text style={{ fontSize: 11, color: '#64748B' }}>On Hold</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#64748B' }}>{formatInr((wallet?.onHoldBalancePaise ?? 0) / 100)}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 120 }}>
            <Text style={{ fontSize: 11, color: '#64748B' }}>Successfully Settled</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#15803D' }}>{formatInr((wallet?.totalSettledPaise ?? 0) / 100)}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 120 }}>
            <Text style={{ fontSize: 11, color: '#64748B' }}>This Week</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F766E' }}>{formatInr((wallet?.thisWeekEarningsPaise ?? 0) / 100)}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 120 }}>
            <Text style={{ fontSize: 11, color: '#64748B' }}>This Month</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F766E' }}>{formatInr((wallet?.thisMonthEarningsPaise ?? 0) / 100)}</Text>
          </View>
        </View>

        {/* 7-Day Eligibility Info */}
        <View style={{ marginTop: 12, padding: 10, borderRadius: 8, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }}>
            7-Day Weekly Withdrawal Cycle • Min: {formatInr(minInr)}
          </Text>
          <Text style={{ fontSize: 11.5, color: '#475569', marginTop: 3 }}>
            {nextEligible
              ? cycleLocked
                ? `Next withdrawal window opens: ${nextEligible.toLocaleDateString('en-IN')}`
                : 'Withdrawal window is OPEN now.'
              : 'Withdrawal window is OPEN now.'}
          </Text>
          {wallet?.lastWithdrawalAt && (
            <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
              Last Withdrawal: {new Date(wallet.lastWithdrawalAt).toLocaleDateString('en-IN')} ({wallet.lastSettlementStatus || 'N/A'})
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.btnPrimary,
            { marginTop: 14 },
            (cycleLocked || hasActivePending || availInr < minInr) && { opacity: 0.6 },
          ]}
          onPress={openWithdrawFlow}
        >
          <Text style={styles.btnPrimaryText}>💸 Withdraw Money</Text>
        </TouchableOpacity>

        {!methodVerified && (
          <TouchableOpacity onPress={onGoToProfile} style={{ marginTop: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#0D9488', textAlign: 'center' }}>
              Verify Bank / UPI in Profile → Bank &amp; Payment Details
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Withdrawal History */}
      <View style={styles.equipmentCard}>
        <Text style={styles.sectionHeaderTitle}>Withdrawal History ({withdrawals.length})</Text>
        {withdrawals.length === 0 ? (
          <Text style={{ fontSize: 12.5, color: '#64748B', marginTop: 6 }}>No withdrawal requests yet.</Text>
        ) : (
          withdrawals.map((w) => (
            <View key={w.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: '#F1F5F9', flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>{w.id} • {w.status}</Text>
                <Text style={{ fontSize: 11.5, color: '#475569' }}>{w.paymentMethod} • {w.maskedDestination}</Text>
                <Text style={{ fontSize: 11, color: '#64748B' }}>
                  {new Date(w.requestedAt).toLocaleString('en-IN')}
                  {w.manualTransactionRef ? ` • Ref: ****${w.manualTransactionRef.slice(-4)}` : ''}
                </Text>
                {(w.rejectionReason || w.holdReason) && (
                  <Text style={{ fontSize: 11.5, color: '#B91C1C', marginTop: 2 }}>{w.rejectionReason || w.holdReason}</Text>
                )}
              </View>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A' }}>
                {formatInr(w.requestedAmountPaise / 100)}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Immutable Ledger Transaction History */}
      <View style={styles.equipmentCard}>
        <Text style={styles.sectionHeaderTitle}>Wallet Ledger ({txs.length})</Text>
        {txs.length === 0 ? (
          <Text style={{ fontSize: 12.5, color: '#64748B', marginTop: 6 }}>No wallet transactions yet.</Text>
        ) : (
          txs.map((t) => (
            <View key={t.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: '#F1F5F9', flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#0F172A' }}>{t.type}</Text>
                <Text style={{ fontSize: 11.5, color: '#475569' }}>{t.description}</Text>
                <Text style={{ fontSize: 11, color: '#64748B' }}>{new Date(t.createdAt).toLocaleString('en-IN')} • {t.status}</Text>
              </View>
              <Text style={{ fontSize: 13.5, fontWeight: '800', color: t.type === 'BOOKING_EARNING' || t.type === 'WITHDRAWAL_RELEASED' ? '#15803D' : '#0F172A' }}>
                {formatInr(t.amountPaise / 100)}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Withdraw Money Confirmation Modal */}
      <Modal visible={withdrawModalOpen} transparent animationType="slide" onRequestClose={() => setWithdrawModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#0F172A' }}>
                {step === 'AMOUNT' ? 'Withdraw Money' : 'Confirm Withdrawal'}
              </Text>
              <TouchableOpacity onPress={() => setWithdrawModalOpen(false)}>
                <Ionicons name="close" size={24} color="#475569" />
              </TouchableOpacity>
            </View>

            {step === 'AMOUNT' ? (
              <>
                <Text style={styles.inputLabelSm}>Withdrawal Amount (₹) • Available: {formatInr(availInr)}</Text>
                <TextInput
                  style={[styles.fieldInput, { marginBottom: 10 }]}
                  value={amountInput}
                  onChangeText={setAmountInput}
                  keyboardType="numeric"
                  placeholder={`Min ₹${minInr}`}
                />

                <Text style={styles.inputLabelSm}>Select Verified Payout Destination</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  <TouchableOpacity
                    onPress={() => setSelectedMethod('BANK_ACCOUNT')}
                    style={{
                      flex: 1,
                      padding: 10,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: selectedMethod === 'BANK_ACCOUNT' ? '#0D9488' : '#CBD5E1',
                      backgroundColor: selectedMethod === 'BANK_ACCOUNT' ? '#F0FDFA' : '#F8FAFC',
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', textAlign: 'center' }}>🏦 Bank Account</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setSelectedMethod('UPI')}
                    style={{
                      flex: 1,
                      padding: 10,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: selectedMethod === 'UPI' ? '#0D9488' : '#CBD5E1',
                      backgroundColor: selectedMethod === 'UPI' ? '#F0FDFA' : '#F8FAFC',
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', textAlign: 'center' }}>⚡ UPI ID</Text>
                  </TouchableOpacity>
                </View>

                <Text style={{ fontSize: 12, color: '#475569', marginBottom: 14 }}>
                  Destination: <Text style={{ fontWeight: '700' }}>{maskedDest}</Text>
                </Text>

                <TouchableOpacity
                  style={styles.btnPrimary}
                  onPress={() => setStep('CONFIRM')}
                >
                  <Text style={styles.btnPrimaryText}>Continue to Confirmation →</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={{ padding: 12, borderRadius: 10, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 14, gap: 4 }}>
                  <Text style={{ fontSize: 13, color: '#0F172A' }}>Amount: <Text style={{ fontWeight: '800' }}>{formatInr(Number(amountInput) || 0)}</Text></Text>
                  <Text style={{ fontSize: 13, color: '#0F172A' }}>Method: <Text style={{ fontWeight: '700' }}>{selectedMethod}</Text></Text>
                  <Text style={{ fontSize: 12.5, color: '#475569' }}>Account: {maskedDest}</Text>
                  <Text style={{ fontSize: 11.5, color: '#B45309', marginTop: 4 }}>
                    Note: Once submitted, your next withdrawal window opens after 7 days. Admin will manually settle and record UTR.
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity style={[styles.btnSecondary, { flex: 1 }]} onPress={() => setStep('AMOUNT')}>
                    <Text style={styles.btnSecondaryText}>← Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btnPrimary, { flex: 1.6 }, submitting && { opacity: 0.65 }]}
                    disabled={submitting}
                    onPress={() => void handleConfirmWithdraw()}
                  >
                    <Text style={styles.btnPrimaryText}>{submitting ? 'Submitting...' : 'Confirm Withdraw'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
