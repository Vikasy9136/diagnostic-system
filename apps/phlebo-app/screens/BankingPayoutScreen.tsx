import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BankPaymentDetailsCard } from '../components/BankPaymentDetailsCard';
import { KeyboardAwareScrollView } from '../components/KeyboardAwareScrollView';
import { BRAND_COLORS, BRAND_FONTS } from '../components/LabSetuBrand';
import { ProfileSubScreenHeader } from '../components/ProfileSubScreenHeader';
import { COLORS, styles } from '../styles/phleboStyles';
import { rf, rs } from '../utils/responsive';

export interface BankingPayoutScreenProps {
  instantPayoutWindowMinutes?: number;
  onBack: () => void;
}

export function BankingPayoutScreen({
  onBack,
}: BankingPayoutScreenProps) {
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ProfileSubScreenHeader
        title="Banking & Payout Settings"
        subtitle="Bank Account, UPI ID & Private UPI QR"
        onBack={onBack}
      />

      <KeyboardAwareScrollView
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
              backgroundColor: '#F0FDFA',
              borderColor: '#99F6E4',
              marginBottom: 14,
            },
          ]}
        >
          <Ionicons name="shield-checkmark" size={20} color={BRAND_COLORS.tealPrimary} />
          <Text
            style={{
              flex: 1,
              fontFamily: BRAND_FONTS.medium,
              fontSize: rf(12),
              color: '#115E59',
              lineHeight: 17,
            }}
          >
            Your bank details, UPI ID, and QR code are stored securely. Admin processes payouts to your preferred method within 3–7 business days.
          </Text>
        </View>

        <BankPaymentDetailsCard />
      </KeyboardAwareScrollView>
    </View>
  );
}
