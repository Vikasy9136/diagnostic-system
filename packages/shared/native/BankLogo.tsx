import React, { useState } from 'react';
import { Image, type ImageSourcePropType, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { getBankBrandMeta } from '../src/utils/bankHelpers.js';

const NATIVE_BANK_ASSETS: Record<string, ImageSourcePropType> = {
  'sbi.png': require('../assets/banks/sbi.png'),
  'hdfc.png': require('../assets/banks/hdfc.png'),
  'icici.png': require('../assets/banks/icici.png'),
  'axis.png': require('../assets/banks/axis.png'),
  'kotak.png': require('../assets/banks/kotak.png'),
  'pnb.png': require('../assets/banks/pnb.png'),
  'bob.png': require('../assets/banks/bob.png'),
  'canara.png': require('../assets/banks/canara.png'),
  'idfc-first.png': require('../assets/banks/idfc-first.png'),
  'union-bank.png': require('../assets/banks/union-bank.png'),
  'indian-bank.png': require('../assets/banks/indian-bank.png'),
  'bank-of-india.png': require('../assets/banks/bank-of-india.png'),
  'central-bank.png': require('../assets/banks/central-bank.png'),
  'uco-bank.png': require('../assets/banks/uco-bank.png'),
  'bank-of-maharashtra.png': require('../assets/banks/bank-of-maharashtra.png'),
  'indian-overseas-bank.png': require('../assets/banks/indian-overseas-bank.png'),
  'idbi.png': require('../assets/banks/idbi.png'),
  'indusind.png': require('../assets/banks/indusind.png'),
  'yes-bank.png': require('../assets/banks/yes-bank.png'),
  'federal-bank.png': require('../assets/banks/federal-bank.png'),
  'au-small-finance.png': require('../assets/banks/au-small-finance.png'),
  'bandhan-bank.png': require('../assets/banks/bandhan-bank.png'),
  'rbl-bank.png': require('../assets/banks/rbl-bank.png'),
  'south-indian-bank.png': require('../assets/banks/south-indian-bank.png'),
  'karnataka-bank.png': require('../assets/banks/karnataka-bank.png'),
  'city-union-bank.png': require('../assets/banks/city-union-bank.png'),
  'punjab-sind-bank.png': require('../assets/banks/punjab-sind-bank.png'),
  'karur-vysya-bank.png': require('../assets/banks/karur-vysya-bank.png'),
  'dbs.png': require('../assets/banks/dbs.png'),
  'standard-chartered.png': require('../assets/banks/standard-chartered.png'),
  'hsbc.png': require('../assets/banks/hsbc.png'),
  'airtel-payments-bank.png': require('../assets/banks/airtel-payments-bank.png'),
  'jio-payments-bank.png': require('../assets/banks/jio-payments-bank.png'),
  'paytm-payments-bank.png': require('../assets/banks/paytm-payments-bank.png'),
  'other-banks.png': require('../assets/banks/other-banks.png'),
};

export interface NativeBankLogoProps {
  bankCode?: string | null;
  ifsc?: string | null;
  bankName?: string | null;
  size?: number;
  width?: number;
  height?: number;
  style?: ViewStyle;
}

/**
 * Centralized BankLogo component for React Native (Android & iOS).
 * Uses the exact same local PNG bank assets bundled from @diagnostic/shared/assets/banks.
 */
export function BankLogo({
  bankCode,
  ifsc,
  bankName,
  size = 36,
  width,
  height,
  style,
}: NativeBankLogoProps) {
  const [failed, setFailed] = useState(false);
  const meta = getBankBrandMeta(ifsc || bankCode || bankName || undefined);
  const fallbackSource = NATIVE_BANK_ASSETS['other-banks.png'];
  const source = failed
    ? fallbackSource
    : NATIVE_BANK_ASSETS[meta.logoAsset] || fallbackSource;

  const boxHeight = height ?? size;
  const boxWidth = width ?? Math.round(boxHeight * 1.45);

  return (
    <View
      style={[
        styles.frame,
        { width: boxWidth, height: boxHeight, borderRadius: Math.max(8, Math.round(boxHeight * 0.22)) },
        style,
      ]}
    >
      {source ? (
        <Image
          source={source}
          style={styles.img}
          resizeMode="contain"
          onError={() => setFailed(true)}
          accessibilityLabel={meta.officialBankName}
        />
      ) : (
        <Text style={styles.fallbackText}>{meta.shortName}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  img: {
    width: '100%',
    height: '100%',
  },
  fallbackText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
});
