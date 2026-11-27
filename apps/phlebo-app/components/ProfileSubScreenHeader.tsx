import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BRAND_COLORS } from './LabSetuBrand';
import { FONTS } from '../styles/phleboStyles';
import { COMPACT_TEXT_SCALE, MAX_TEXT_SCALE, rf, rs } from '../utils/responsive';

export interface ProfileSubScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  rightAction?: {
    label: string;
    onPress: () => void;
  };
}

/**
 * Shared top bar for all dedicated Profile sub-screens, matching HelpSupportScreen.
 */
export function ProfileSubScreenHeader({
  title,
  subtitle,
  onBack,
  rightAction,
}: ProfileSubScreenHeaderProps) {
  return (
    <View style={headerStyles.header}>
      <TouchableOpacity
        style={headerStyles.backBtn}
        onPress={onBack}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel="Back to Profile"
      >
        <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
      </TouchableOpacity>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
          style={headerStyles.headerTitle}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
            style={headerStyles.headerSub}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {rightAction ? (
        <TouchableOpacity
          style={headerStyles.rightBtn}
          onPress={rightAction.onPress}
          activeOpacity={0.8}
        >
          <Text style={headerStyles.rightBtnText}>{rightAction.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const headerStyles = StyleSheet.create({
  header: {
    backgroundColor: BRAND_COLORS.navyPrimary,
    paddingHorizontal: rs(16),
    paddingVertical: rs(14),
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: rs(38),
    height: rs(38),
    borderRadius: rs(10),
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FONTS.bold,
    fontSize: rf(16),
    color: '#FFFFFF',
  },
  headerSub: {
    fontFamily: FONTS.regular,
    fontSize: rf(11),
    color: '#CBD5E1',
    marginTop: 2,
  },
  rightBtn: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  rightBtnText: {
    fontFamily: FONTS.bold,
    fontSize: rf(12),
    color: '#FFFFFF',
  },
});
