import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatInr } from '@diagnostic/shared';
import { BRAND_COLORS } from '../components/LabSetuBrand';
import { COLORS, FONTS, styles } from '../styles/phleboStyles';
import { type CompletedReceipt } from '../types/phleboTypes';
import { lh, MAX_TEXT_SCALE, rf } from '../utils/responsive';

export interface CompletedReceiptScreenProps {
  lastReceipt: CompletedReceipt | null;
  instantPayoutWindowMinutes: number;
  onBackToRequests: () => void;
  onOpenEarnings: () => void;
}

export function CompletedReceiptScreen({
  lastReceipt,
  instantPayoutWindowMinutes,
  onBackToRequests,
  onOpenEarnings,
}: CompletedReceiptScreenProps) {
  const windowMins = instantPayoutWindowMinutes || 30;
  return (
    <View style={styles.fullscreenContainer}>
      <View style={styles.navBarHeader}>
        <TouchableOpacity onPress={onBackToRequests} hitSlop={8}>
          <Ionicons name="arrow-back" size={23} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.navBarTitle}>Collection Completed</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.bodyContainer,
          { flexGrow: 1, justifyContent: 'center', paddingTop: 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.successCheckCircle}>
          <Ionicons name="checkmark" size={44} color="#FFFFFF" />
        </View>

        <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.successTitle}>
          Collection Completed!
        </Text>
        <Text
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
          style={{
            fontSize: rf(13.5),
            lineHeight: lh(rf(13.5)),
            fontFamily: FONTS.medium,
            color: BRAND_COLORS.muted,
            textAlign: 'center',
            marginBottom: 20,
          }}
        >
          Sample details submitted successfully.
        </Text>

        <View style={styles.receiptCard}>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptKey}>Task / Booking ID</Text>
            <Text style={styles.receiptVal}>{lastReceipt?.orderNumber || '—'}</Text>
          </View>
          <View style={styles.receiptDivider} />
          <View style={styles.receiptRow}>
            <Text style={styles.receiptKey}>Destination Hub</Text>
            <Text style={styles.receiptVal}>{lastReceipt?.targetLabName || '—'}</Text>
          </View>
          <View style={styles.receiptDivider} />
          <View style={styles.receiptRow}>
            <Text style={styles.receiptKey}>Arrival Temp</Text>
            <Text style={styles.receiptVal}>
              {lastReceipt ? `${lastReceipt.tempCelsius}°C` : '—'}
            </Text>
          </View>
          <View style={styles.receiptDivider} />
          <View style={styles.receiptRow}>
            <Text style={styles.receiptKey}>Courier Payout</Text>
            <Text style={[styles.receiptVal, { color: COLORS.primaryTeal }]}>
              {formatInr(lastReceipt?.feeInr || 0)}
            </Text>
          </View>
          <View style={styles.receiptDivider} />
          <View style={styles.receiptRow}>
            <Text style={styles.receiptKey}>Completed At</Text>
            <Text style={styles.receiptVal}>{lastReceipt?.completedAt || '—'}</Text>
          </View>
        </View>

        <View style={[styles.slaBannerCard, { marginTop: 16 }]}>
          <Text style={styles.slaBannerTitle}>
            Payout Queued (3–7 Business Days)
          </Text>
          <Text style={styles.slaBannerSub}>
            Your earnings have been added to your wallet. Admin will process the payout to your saved Bank Account or UPI ID within 3–7 business days.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.ctaButton, { marginTop: 22 }]}
          onPress={onBackToRequests}
        >
          <Text style={styles.ctaButtonText}>Back to Home</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btnSecondary, { marginTop: 10, paddingVertical: 13 }]}
          onPress={onOpenEarnings}
        >
          <Text style={styles.btnSecondaryText}>View Live Earnings &amp; Payout Timer →</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
