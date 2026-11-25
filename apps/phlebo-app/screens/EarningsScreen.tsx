import React, { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  formatInr,
  formatOrderStatus,
  type PayoutRecord,
  type PhlebotomistProfile,
} from '@diagnostic/shared';
import { BRAND_COLORS } from '../components/LabSetuBrand';
import { fetchMyPayoutLedger, type MyPayoutsResponse } from '../services/phleboPayoutService';
import { COLORS, styles } from '../styles/phleboStyles';
import { type EarningRow, type PhleboMetrics } from '../types/phleboTypes';
import { getPhleboPayoutSlaBadge } from '../utils/phleboHelpers';
import { COMPACT_TEXT_SCALE, lh, MAX_TEXT_SCALE, rf, rs } from '../utils/responsive';

export interface EarningsScreenProps {
  metrics: PhleboMetrics;
  instantPayoutWindowMinutes: number;
  myPhleboProfile: PhlebotomistProfile | null;
  earningRows: EarningRow[];
  payouts: PayoutRecord[];
  nowTick: number;
  onBack?: () => void;
  onGoToProfile: () => void;
}

export function EarningsScreen({
  metrics,
  instantPayoutWindowMinutes,
  myPhleboProfile,
  earningRows,
  payouts,
  nowTick,
  onBack,
  onGoToProfile,
}: EarningsScreenProps) {
  const maxCount = Math.max(1, ...metrics.weeklyBars.map((b) => b.count));
  const windowMins = instantPayoutWindowMinutes || 30;
  const [ledgerData, setLedgerData] = useState<MyPayoutsResponse | null>(null);

  useEffect(() => {
    void fetchMyPayoutLedger()
      .then((res) => setLedgerData(res))
      .catch(() => {});
  }, []);

  return (
    <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
      <LinearGradient
        colors={['#061D42', '#0A2A5E', '#0D5E6B']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroHeader}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          {onBack ? (
            <TouchableOpacity
              onPress={onBack}
              hitSlop={8}
              accessibilityLabel="Back to Home"
              style={styles.headerIconBtn}
            >
              <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          ) : null}
          <View style={{ flex: 1, minWidth: 0, alignItems: onBack ? 'center' : 'flex-start' }}>
            <Text
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
              style={[styles.greetingTitle, onBack ? { textAlign: 'center' } : null]}
            >
              Reports &amp; Payouts
            </Text>
            <Text
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
              style={[styles.greetingSubtitle, onBack ? { textAlign: 'center' } : null]}
            >
              Live trip payouts &amp; settled statements
            </Text>
          </View>
          <View style={styles.headerIconBtn}>
            <Ionicons name="wallet-outline" size={20} color="#FFFFFF" />
          </View>
        </View>

        <View style={[styles.summaryCard, { marginTop: 18 }]}>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <View style={{ flexShrink: 1, minWidth: 0 }}>
              <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.summaryTitle}>
                PENDING COURIER PAYOUT
              </Text>
              <Text
                maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                style={[
                  styles.metricNumber,
                  {
                    fontSize: rf(25),
                    lineHeight: lh(rf(25), 1.25),
                    color: COLORS.primaryNavy,
                    textAlign: 'left',
                  },
                ]}
              >
                {formatInr(metrics.pendingPayoutInr)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
              <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.metricLabel}>
                Paid Out Total
              </Text>
              <Text
                maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                style={[styles.metricNumber, { fontSize: rf(16.5), color: COLORS.successGreen }]}
              >
                {formatInr(metrics.settledInr)}
              </Text>
            </View>
          </View>

          <View
            style={[styles.summaryDivider, { width: '100%', height: 1, marginVertical: 12 }]}
          />

          <View style={styles.summaryMetricsRow}>
            <View style={styles.summaryMetricCol}>
              <Text
                adjustsFontSizeToFit
                numberOfLines={1}
                maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                style={[styles.metricNumber, { fontSize: rf(16) }]}
              >
                {formatInr(metrics.todayEarnings)}
              </Text>
              <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.metricLabel}>
                Today
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryMetricCol}>
              <Text
                adjustsFontSizeToFit
                numberOfLines={1}
                maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                style={[styles.metricNumber, { fontSize: rf(16) }]}
              >
                {formatInr(metrics.weeklyEarnings)}
              </Text>
              <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.metricLabel}>
                7 Days
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryMetricCol}>
              <Text
                adjustsFontSizeToFit
                numberOfLines={1}
                maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                style={[styles.metricNumber, { fontSize: rf(16) }]}
              >
                {formatInr(metrics.monthlyEarnings)}
              </Text>
              <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.metricLabel}>
                This Month
              </Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <View style={[styles.bodyContainer, { paddingTop: rs(52) }]}>
        <View style={[styles.slaBannerCard, { marginBottom: 14 }]}>
          <Text style={styles.slaBannerTitle}>
            Payout Summary &amp; Bank Status
          </Text>
          <Text style={styles.slaBannerSub}>
            Payouts are initiated only after eligibility checks &amp; bank/UPI verification. Final credit depends on bank/provider processing.
          </Text>
          {ledgerData && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F766E' }}>
                Available: {formatInr(ledgerData.summary.availableInr)}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#0369A1' }}>
                Processing: {formatInr(ledgerData.summary.processingInr)}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#B45309' }}>
                Pending: {formatInr(ledgerData.summary.pendingInr)}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#B91C1C' }}>
                Failed: {formatInr(ledgerData.summary.failedInr)}
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.notifBannerBtn, { marginTop: 10, marginBottom: 0 }]}
            onPress={onGoToProfile}
          >
            <Text style={styles.notifBannerBtnText}>
              Manage Bank &amp; UPI Payment Details →
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.chartCard}>
          <Text style={styles.sectionHeaderTitle}>Weekly Pickup Volume (Live)</Text>
          <View style={styles.barChartContainer}>
            {metrics.weeklyBars.map((bar) => {
              const heightPct = Math.max(8, Math.round((bar.count / maxCount) * 100));
              return (
                <View key={bar.day} style={styles.chartBarCol}>
                  <Text style={styles.chartBarAmount}>{bar.count}</Text>
                  <View style={styles.chartBarTrack}>
                    <View
                      style={[
                        styles.chartBarFill,
                        {
                          height: `${heightPct}%`,
                          backgroundColor: bar.count > 0 ? COLORS.primaryTeal : '#CBD5E1',
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.chartBarDay}>{bar.day}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <Text style={[styles.sectionHeaderTitle, { marginTop: 12, marginBottom: 10 }]}>
          Trip History ({earningRows.length})
        </Text>

        {earningRows.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="receipt-outline" size={32} color={BRAND_COLORS.tealPrimary} />
            <Text style={[styles.emptyTitle, { marginTop: 8 }]}>No Completed Trips Yet</Text>
            <Text style={styles.emptySub}>
              Accept and deliver sample orders to see your trip history and earnings.
            </Text>
          </View>
        ) : (
          earningRows.map((row) => {
            const { order, payoutRef, customerPaid, amountInr, settled, delivered } = row;
            const slaBadge = getPhleboPayoutSlaBadge(
              row,
              instantPayoutWindowMinutes,
              nowTick
            );
            return (
              <View key={order.id} style={styles.tripLedgerRow}>
                <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                  <Text style={styles.tripLedgerId}>{order.orderNumber}</Text>
                  <Text style={styles.tripLedgerLab}>
                    {order.smallLabName} → {order.targetLabName}
                  </Text>
                  <Text style={styles.tripLedgerBase}>
                    {settled
                      ? `Paid Out${payoutRef ? ` • Ref: ${payoutRef}` : ''}`
                      : delivered && customerPaid
                      ? 'Delivered & Paid Online • Ready for Payout'
                      : delivered
                      ? 'Delivered • Awaiting Customer Payment'
                      : formatOrderStatus(order.status)}
                  </Text>
                  <View style={[styles.slaChip, { backgroundColor: slaBadge.bg }]}>
                    <Text style={[styles.slaChipText, { color: slaBadge.color }]}>
                      {slaBadge.label}
                    </Text>
                  </View>
                </View>
                <Text style={styles.tripLedgerFee}>{formatInr(amountInr)}</Text>
              </View>
            );
          })
        )}

        <Text style={[styles.sectionHeaderTitle, { marginTop: 20, marginBottom: 10 }]}>
          Payout History ({ledgerData ? ledgerData.payouts.length : payouts.length})
        </Text>

        {ledgerData && ledgerData.payouts.length > 0 ? (
          ledgerData.payouts.map((l) => (
            <View key={l.id} style={styles.tripLedgerRow}>
              <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                <Text style={styles.tripLedgerId}>
                  {l.orderNumber} • {l.payoutMethod} ({l.status})
                </Text>
                <Text style={styles.tripLedgerLab}>
                  Gross {formatInr(l.grossEarningInr)} - Fee {formatInr(l.platformFeeInr)} • {l.maskedDestination}
                </Text>
                <Text style={styles.tripLedgerBase}>
                  {l.initiatedAt ? `Initiated: ${new Date(l.initiatedAt).toLocaleDateString('en-IN')}` : `Created: ${new Date(l.createdAt).toLocaleDateString('en-IN')}`}
                  {l.utrNumber ? ` • UTR: ${l.utrNumber}` : ''}
                </Text>
                {l.errorMessage && (
                  <Text style={{ fontSize: 11.5, color: '#B91C1C', marginTop: 3, fontWeight: '600' }}>
                    {l.errorCode}: {l.errorMessage}
                  </Text>
                )}
              </View>
              <Text style={styles.tripLedgerFee}>{formatInr(l.netPayableInr)}</Text>
            </View>
          ))
        ) : payouts.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No Payout Transfers Yet</Text>
            <Text style={styles.emptySub}>
              Verified payouts and bank/UPI transfer statuses will appear here.
            </Text>
          </View>
        ) : (
          payouts.map((p) => (
            <View key={p.id} style={styles.tripLedgerRow}>
              <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                <Text style={styles.tripLedgerId}>
                  {p.orderNumber} • {p.mode}
                </Text>
                <Text style={styles.tripLedgerLab}>{p.destinationSummary}</Text>
                <Text style={styles.tripLedgerBase}>
                  Ref: {p.referenceId} • {new Date(p.createdAt).toLocaleDateString('en-IN')}
                </Text>
              </View>
              <Text style={styles.tripLedgerFee}>{formatInr(p.amountInr)}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
